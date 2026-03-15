import { type Color } from './distance';

function createSwatch(container: HTMLElement, color: Color, onDelete: (index: number) => void): HTMLElement {
  const [r, g, b] = color;
  const swatch = document.createElement('div');
  swatch.className = 'swatch';
  swatch.style.backgroundColor = `rgb(${r},${g},${b})`;
  swatch.title = `rgb(${r}, ${g}, ${b})`;

  const btn = document.createElement('button');
  btn.className = 'swatch-delete';
  btn.textContent = '×';
  btn.title = 'Remove color';
  // Resolve index at click time so it stays correct after other deletions.
  btn.addEventListener('click', () => {
    const all = Array.from(container.querySelectorAll('.swatch'));
    onDelete(all.indexOf(swatch));
  });

  swatch.appendChild(btn);
  return swatch;
}

export function renderPalette(
  container: HTMLElement,
  centroids: Color[],
  onDelete: (index: number) => void,
): void {
  const swatches = container.querySelectorAll<HTMLElement>('.swatch');

  // Update colors of existing swatches in place (no DOM rebuild = no hover flicker).
  for (let i = 0; i < Math.min(swatches.length, centroids.length); i++) {
    const [r, g, b] = centroids[i];
    swatches[i].style.backgroundColor = `rgb(${r},${g},${b})`;
    swatches[i].title = `rgb(${r}, ${g}, ${b})`;
  }

  // Append swatches for new centroids.
  for (let i = swatches.length; i < centroids.length; i++) {
    container.appendChild(createSwatch(container, centroids[i], onDelete));
  }

  // Remove swatches for deleted centroids (from the end).
  for (let i = swatches.length - 1; i >= centroids.length; i--) {
    swatches[i].remove();
  }
}
