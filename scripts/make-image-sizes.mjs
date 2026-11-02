// Makes the smaller copies of every uploaded picture on this computer and adds them to R2 (see lib/image-sizes.ts). Originals
// are only read. Safe to run again: copies already there are skipped, so it also catches anything an upload could not finish.
//   npm run images:sizes            make and upload what is missing
//   npm run images:sizes -- --check only report what is missing
import { spawnSync } from "node:child_process";
import process from "node:process";
import sharp from "sharp";
import { IMAGE_SIZE_QUALITY, IMAGE_SIZE_WIDTHS, imageSizeKey, imageSizeKeys } from "../lib/image-sizes.ts";

const ACCOUNT = "d189f60c7af53b8c6e37cc60c1f43cd4";
const BUCKET = "dolly-portal";
const API = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/r2/buckets/${BUCKET}/objects`;
const check = process.argv.includes("--check");

const login = spawnSync("npx", ["wrangler", "auth", "token", "--json"], { encoding: "utf8", shell: true, env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: ACCOUNT } });
const token = (() => { try { return JSON.parse(login.stdout).token; } catch { return null; } })();
if (!token) {
  process.stderr.write(`Could not get the Cloudflare login from wrangler. Run: npx wrangler login\n${login.stderr || ""}\n`);
  process.exit(1);
}
const auth = { Authorization: `Bearer ${token}` };
const objectUrl = (key) => `${API}/${key.split("/").map(encodeURIComponent).join("/")}`;

async function list(prefix) {
  const keys = [];
  let cursor = "";
  do {
    const query = new URLSearchParams({ prefix, per_page: "1000" });
    if (cursor) query.set("cursor", cursor);
    const response = await fetch(`${API}?${query}`, { headers: auth });
    if (!response.ok) throw new Error(`Listing ${prefix} failed: HTTP ${response.status} ${await response.text()}`);
    const page = await response.json();
    keys.push(...page.result.map((object) => object.key));
    cursor = page.result_info?.is_truncated ? page.result_info.cursor : "";
  } while (cursor);
  return keys;
}

const originals = [...await list("uploads/images/"), ...await list("uploads/proof/")].filter((key) => imageSizeKeys(key).length);
const existing = new Set(await list("uploads/sizes/"));
const todo = originals.filter((key) => imageSizeKeys(key).some((size) => !existing.has(size)));
process.stdout.write(`${originals.length} pictures, ${existing.size} copies already stored, ${todo.length} pictures to check.\n`);
if (check) process.exit(0);

let uploaded = 0;
let bytes = 0;
const failed = [];

async function makeSizes(key) {
  const response = await fetch(objectUrl(key), { headers: auth });
  if (!response.ok) throw new Error(`download HTTP ${response.status}`);
  const source = Buffer.from(await response.arrayBuffer());
  const { width: rawWidth, height: rawHeight, orientation } = await sharp(source).metadata();
  const fullWidth = orientation >= 5 ? rawHeight : rawWidth;
  for (const width of IMAGE_SIZE_WIDTHS) {
    if (width >= fullWidth || existing.has(imageSizeKey(key, width))) continue; // never enlarged: the original already covers it
    const copy = await sharp(source).rotate().resize({ width }).webp({ quality: IMAGE_SIZE_QUALITY, alphaQuality: 100, effort: 5 }).toBuffer();
    const put = await fetch(objectUrl(imageSizeKey(key, width)), { method: "PUT", headers: { ...auth, "Content-Type": "image/webp" }, body: copy });
    if (!put.ok) throw new Error(`upload HTTP ${put.status} ${await put.text()}`);
    uploaded++;
    bytes += copy.length;
  }
}

const queue = [...todo];
await Promise.all(Array.from({ length: 4 }, async () => {
  while (queue.length) {
    const key = queue.shift();
    try {
      await makeSizes(key);
      process.stdout.write(`done ${key}\n`);
    } catch (error) {
      failed.push(key);
      process.stderr.write(`FAILED ${key}: ${error.message}\n`);
    }
  }
}));
process.stdout.write(`Uploaded ${uploaded} copies (${(bytes / 1024 / 1024).toFixed(1)} MB). Failed pictures: ${failed.length}.\n`);
if (failed.length) process.exit(1);
