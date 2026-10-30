export async function readMediaLibrary(signal: AbortSignal): Promise<{ images: string[]; removable: string[] }> {
  const response = await fetch("/api/portal/media", { cache: "no-store", signal });
  if (response.status === 401) throw new Error("Your session expired. Sign in again in another tab, then retry loading the library here.");
  if (!response.ok) throw new Error("Couldn’t load your image library. Please retry.");
  const data = await response.json().catch(() => null);
  const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === "string");
  if (!strings(data?.images) || !strings(data?.removable)) throw new Error("The library response was incomplete. Please retry.");
  const images = new Set<string>(data.images);
  return { images: [...images], removable: [...new Set<string>(data.removable)].filter((src) => images.has(src)) };
}
