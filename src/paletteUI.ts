import { type Color } from './distance';

export function renderPalette(
  container: HTMLElement,
  centroids: Color[],
  onDelete: (index: number) => void,
): void {
  container.innerHTML = '';
  for (let i = 0; i < centroids.length; i++) {
    const [r, g, b] = centroids[i];
    const swatch = document.createElement('div');
    swatch.className = 'swatch';
    swatch.style.backgroundColor = `rgb(${r},${g},${b})`;
    swatch.title = `rgb(${r}, ${g}, ${b})`;

    const btn = document.createElement('button');
    btn.className = 'swatch-delete';
    btn.textContent = '×';
    btn.title = 'Remove color';
    const idx = i;
    btn.addEventListener('click', () => onDelete(idx));

    swatch.appendChild(btn);
    container.appendChild(swatch);
  }
}
