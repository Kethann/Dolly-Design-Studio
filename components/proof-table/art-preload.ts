import { resizedSrc } from "@/lib/images";

// The slate's title artwork, fetched once per page load while the opening plays, so nothing has to download or decode when
// the visitor scrolls to the table. Each picture is the ready-made copy for the device, and only a few are in flight at once.
const SIMULTANEOUS = 3;
const blobs = new Map<string, Promise<Blob>>();
const waiting: (() => void)[] = [];
let active = 0;

function next() {
  if (active >= SIMULTANEOUS) return;
  const start = waiting.shift();
  if (start) start();
}

/** Touch screens and the stacked layout never show a title larger than this copy; desktops keep the bigger one. */
function artWidth() {
  return matchMedia("(pointer: coarse), (max-width: 1000px), (orientation: portrait) and (max-width: 1100px)").matches ? 1080 : 2400;
}

export function titleArtBlob(src: string): Promise<Blob> {
  const known = blobs.get(src);
  if (known) return known;
  const url = resizedSrc(src, artWidth());
  const job = new Promise<Blob>((resolve, reject) => {
    waiting.push(() => {
      active++;
      fetch(url)
        .then((res) => (res.ok ? res.blob() : Promise.reject(new Error(String(res.status)))))
        .then(resolve, reject)
        .finally(() => { active--; next(); });
    });
    next();
  });
  blobs.set(src, job);
  job.catch(() => blobs.delete(src)); // a failed download may be tried again by the next scene
  return job;
}
