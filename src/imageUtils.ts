import { type Color } from './distance';

export function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

export function resizeToMaxPixels(
  img: HTMLImageElement,
  maxPixels: number,
): HTMLCanvasElement {
  const totalPixels = img.naturalWidth * img.naturalHeight;
  const scale = totalPixels > maxPixels ? Math.sqrt(maxPixels / totalPixels) : 1;
  const width = Math.round(img.naturalWidth * scale);
  const height = Math.round(img.naturalHeight * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, width, height);
  return canvas;
}

export function extractPixels(canvas: HTMLCanvasElement): Color[] {
  const ctx = canvas.getContext('2d')!;
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels: Color[] = new Array(canvas.width * canvas.height);
  for (let i = 0; i < pixels.length; i++) {
    pixels[i] = [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]];
  }
  return pixels;
}

export function averageColor(pixels: Color[]): Color {
  let r = 0, g = 0, b = 0;
  for (const p of pixels) {
    r += p[0];
    g += p[1];
    b += p[2];
  }
  const n = pixels.length;
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}
