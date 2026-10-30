// Makes the browser-tab icon, the home-screen icon and favicon.ico from the studio's real logo (public/images/brand/logo.svg):
// the logo sits on a dark rounded square, as large as it can be. Run with:  node scripts/make-icons.mjs
import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

const logo = await readFile("public/images/brand/logo.svg", "utf8");
const inner = logo.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
const W = Number(/viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(logo)[1]);
const H = Number(/viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(logo)[2]);

// A 1000 x 1000 square, the logo centred on it. The tab icon and favicon.ico are shown at 16-32 pixels, where the logo's thin
// lines would fade away, so those get a bolder outline and a bigger logo; the home-screen icon keeps the logo exactly as drawn.
const SIZE = 1000;
function square(fill, bold) {
  const scale = (SIZE * fill) / W;
  const x = (SIZE - W * scale) / 2;
  const y = (SIZE - H * scale) / 2;
  const stroke = bold ? ` stroke="#FFF195" stroke-width="${bold}" stroke-linejoin="round"` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}"><rect width="${SIZE}" height="${SIZE}" rx="190" fill="#05070C"/><g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${scale.toFixed(4)})"${stroke}>${inner}</g></svg>`;
}
const svg = square(0.88, 0);
const boldSvg = square(0.94, 16);
await writeFile("app/icon.svg", boldSvg);

const png = (size, source = svg) => sharp(Buffer.from(source), { density: Math.max(72, (size / SIZE) * 72 * 4) }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();
await writeFile("app/apple-icon.png", await png(180));

// favicon.ico: 16, 32 and 48 pixel pictures inside one file (the PNG form of .ico, which every current browser reads).
const sizes = [16, 32, 48];
const pics = await Promise.all(sizes.map((n) => png(n, boldSvg)));
const head = Buffer.alloc(6);
head.writeUInt16LE(0, 0);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(sizes.length, 4);
let offset = 6 + 16 * sizes.length;
const entries = sizes.map((s, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(s, 0);
  e.writeUInt8(s, 1);
  e.writeUInt16LE(1, 4);
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(pics[i].length, 8);
  e.writeUInt32LE(offset, 12);
  offset += pics[i].length;
  return e;
});
await writeFile("app/favicon.ico", Buffer.concat([head, ...entries, ...pics]));
console.log("icon.svg", boldSvg.length, "bytes; apple-icon.png 180px; favicon.ico", offset, "bytes");
