import { copyFile, mkdir, readFile, rm, stat } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

// OpenNext keeps prerendered HTML in its route cache, which still needs its
// full Next request handler. Copy the public shells into Workers Static Assets
// so cold visits cost almost no CPU on Cloudflare Workers Free.
const root = fileURLToPath(new URL("../", import.meta.url));
const assets = resolve(root, ".open-next", "assets");
const target = resolve(assets, "__static-pages");
if (!target.startsWith(assets + sep) || target === assets) throw new Error("Unsafe static-shell target");
await stat(assets); // Never remove anything if this is not a completed OpenNext build.
const manifest = JSON.parse(await readFile(join(root, ".next", "prerender-manifest.json"), "utf8"));
const routes = Object.keys(manifest.routes).filter(route =>
  route === "/" || route === "/work" || route === "/breakdowns" || route === "/portal" || /^\/(?:work|process)\/[a-z0-9-]+$/.test(route));
await rm(target, { recursive: true, force: true });
for (const route of routes) {
  const relative = route === "/" ? "index" : route.slice(1);
  const source = join(root, ".next", "server", "app", `${relative}.html`);
  const destination = join(target, `${relative}.html`);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
}
await copyFile(join(root, ".next", "server", "app", "_not-found.html"), join(target, "404.html"));
console.log(`Installed ${routes.length} static page shells into Workers Assets.`);
