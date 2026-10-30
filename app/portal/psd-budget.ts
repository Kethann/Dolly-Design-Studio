// Compressed file size alone does not predict decoded memory: check each layer before opening its pixels.
export const MAX_PSD_MB = 64;
export const MAX_PSD_PIXELS = 16_000_000;

export function assertPsdBounds(width: number, height: number, bits = 8) {
  const bytesPerPixel = 4 * Math.max(1, bits / 8);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 0 || height < 0 || width > 8192 || height > 8192 || width * height * bytesPerPixel > MAX_PSD_PIXELS * 4) {
    throw new Error("This Photoshop canvas or layer is too large to open safely here. Resize it to at most 16 megapixels at 8-bit colour (less for 16/32-bit), or export the layers as smaller PNG files.");
  }
}
