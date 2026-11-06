import { copyFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
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
// Plain files Cloudflare serves by itself, without running the Worker at all (no CPU time, no request counted): the tab and
// home-screen icons every visit asks for (through Next they cost 7-50 ms each, over the Free plan's 10 ms), and the version
// every open page asks about (see UpdateWatcher), which must never be kept by a browser or the edge.
for (const name of ["icon.svg", "apple-icon.png"]) await copyFile(join(root, "app", name), join(assets, name));
// Only with the id the pages were built with (the deploy and cf:build give it): without one, Next keeps answering.
const buildId = process.env.NEXT_PUBLIC_BUILD_ID;
await rm(join(assets, "api", "version"), { force: true });
await rm(join(assets, "_headers"), { force: true });
if (buildId) {
  await mkdir(join(assets, "api"), { recursive: true });
  await writeFile(join(assets, "api", "version"), JSON.stringify({ id: buildId }));
  await writeFile(join(assets, "_headers"), "/api/version\n  Content-Type: application/json; charset=utf-8\n  Cache-Control: no-store, max-age=0\n");
}
console.log(`Installed ${routes.length} static page shells into Workers Assets, with the icons and the version as plain files.`);
