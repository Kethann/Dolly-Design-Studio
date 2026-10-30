/** A bounded set of variants keeps the image cache small while preserving artwork quality. */
export function uploadImageQuality(value?: number): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return 82;
  return [75, 82, 90, 95].reduce((best, q) => Math.abs(q - value) < Math.abs(best - value) ? q : best, 82);
}
