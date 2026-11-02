export interface MediaLibraryData { images: string[]; removable: string[]; deletable: string[]; hidden: string[]; uploadedAt: Record<string, number> }

export async function readMediaLibrary(signal: AbortSignal): Promise<MediaLibraryData> {
  const response = await fetch("/api/portal/media", { cache: "no-store", signal });
  if (response.status === 401) throw new Error("Your session expired. Sign in again in another tab, then retry loading the library here.");
  if (!response.ok) throw new Error("Couldn’t load your image library. Please retry.");
  const data = await response.json().catch(() => null);
  const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === "string");
  if (!strings(data?.images) || !strings(data?.removable)) throw new Error("The library response was incomplete. Please retry.");
  const images = new Set<string>(data.images);
  const hidden = strings(data?.hidden) ? [...new Set<string>(data.hidden)].filter((src) => !images.has(src)) : [];
  const uploadedAt = Object.fromEntries(Object.entries(data?.uploadedAt && typeof data.uploadedAt === "object" ? data.uploadedAt : {})
    .filter(([src, time]) => (images.has(src) || hidden.includes(src)) && typeof time === "number" && Number.isFinite(time) && time >= 0)) as Record<string, number>;
  return {
    images: [...images],
    removable: [...new Set<string>(data.removable)].filter((src) => images.has(src)),
    deletable: strings(data?.deletable) ? [...new Set<string>(data.deletable)].filter((src) => images.has(src)) : [...new Set<string>(data.removable)].filter((src) => images.has(src)),
    hidden,
    uploadedAt,
  };
}
