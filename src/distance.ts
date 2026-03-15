export type Color = [number, number, number]; // [R, G, B], each 0–255

export function distance(a: Color, b: Color): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}
