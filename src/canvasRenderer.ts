import { type Color } from './distance';

export function renderClusters(
  canvas: HTMLCanvasElement,
  assignments: Int32Array,
  centroids: Color[],
): void {
  const { width, height } = canvas;
  const ctx = canvas.getContext('2d')!;
  const buf = new Uint8ClampedArray(width * height * 4);

  for (let i = 0; i < assignments.length; i++) {
    const c = centroids[assignments[i]];
    buf[i * 4] = c[0];
    buf[i * 4 + 1] = c[1];
    buf[i * 4 + 2] = c[2];
    buf[i * 4 + 3] = 255;
  }

  ctx.putImageData(new ImageData(buf, width, height), 0, 0);
}
