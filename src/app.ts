import { config, hslPresets } from './config';
import { type Color, type DistanceFn, rgbDistance, makeHslDistance, labDistance } from './distance';
import { type KMeansState, initState, addCentroid, reassignAfterDeletion, changeMetric } from './kmeans';
import { loadImageFromFile, resizeToMaxPixels, extractPixels, averageColor } from './imageUtils';
import { renderClusters } from './canvasRenderer';
import { renderPalette } from './paletteUI';
import { type LoopHandle, startLoop } from './animationLoop';

// All available distance metrics, built from config presets.
const metrics: Array<{ label: string; fn: DistanceFn }> = [
  { label: 'RGB',    fn: rgbDistance },
  ...hslPresets.map(p => ({ label: p.label, fn: makeHslDistance(p.wH, p.wS, p.wL) })),
  { label: 'CIELAB', fn: labDistance },
];

interface AppState {
  kmeans: KMeansState | null;
  loop: LoopHandle | null;
  iterationMs: number;
  distanceFn: DistanceFn;
  imageWidth: number;
  imageHeight: number;
}

const state: AppState = {
  kmeans: null,
  loop: null,
  iterationMs: config.defaultIterationMs,
  distanceFn: rgbDistance,
  imageWidth: 0,
  imageHeight: 0,
};

let uploadPrompt: HTMLElement;
let workspace: HTMLElement;
let originalImage: HTMLImageElement;
let outputCanvas: HTMLCanvasElement;
let paletteContainer: HTMLElement;
let speedInput: HTMLInputElement;

// ── Layout ───────────────────────────────────────────────────────

function computeLayout(imgAspect: number): 'horizontal' | 'vertical' {
  const screenAspect = window.innerWidth / window.innerHeight;
  return screenAspect > 1.25 * imgAspect ? 'horizontal' : 'vertical';
}

function applyLayout() {
  if (!state.imageWidth || !state.imageHeight) return;
  workspace.dataset.layout = computeLayout(state.imageWidth / state.imageHeight);
}

// ── Rendering ────────────────────────────────────────────────────

function render(kmeans: KMeansState) {
  renderClusters(outputCanvas, kmeans.assignments, kmeans.centroids);
  renderPalette(paletteContainer, kmeans.centroids, handleDeleteColor);
}

function ensureLoop() {
  if (state.loop?.isRunning()) return;
  if (!state.kmeans || state.kmeans.converged) return;

  state.loop = startLoop(
    () => state.kmeans!,
    (s) => { state.kmeans = s; },
    render,
    () => state.iterationMs,
    () => state.distanceFn,
  );
}

// ── Event handlers ───────────────────────────────────────────────

function handleDeleteColor(index: number) {
  if (!state.kmeans) return;
  if (state.kmeans.centroids.length <= 1) return;

  state.loop?.stop();
  state.kmeans = reassignAfterDeletion(state.kmeans, index, state.distanceFn);
  render(state.kmeans);
  ensureLoop();
}

function handleImageClick(event: MouseEvent) {
  if (!state.kmeans) return;

  const rect = originalImage.getBoundingClientRect();
  const scaleX = state.imageWidth / rect.width;
  const scaleY = state.imageHeight / rect.height;
  const x = Math.floor((event.clientX - rect.left) * scaleX);
  const y = Math.floor((event.clientY - rect.top) * scaleY);

  const idx = y * state.imageWidth + x;
  if (idx < 0 || idx >= state.kmeans.pixels.length) return;

  state.kmeans = addCentroid(state.kmeans, state.kmeans.pixels[idx]);
  ensureLoop();
}

function handleMetricChange(distanceFn: DistanceFn) {
  state.distanceFn = distanceFn;
  if (!state.kmeans) return;

  state.loop?.stop();
  state.kmeans = changeMetric(state.kmeans, distanceFn);
  render(state.kmeans);
  ensureLoop();
}

async function handleFileUpload(file: File) {
  state.loop?.stop();

  const img = await loadImageFromFile(file);
  const resized = resizeToMaxPixels(img, config.maxPixels);
  const pixels = extractPixels(resized);
  const avgColor = averageColor(pixels);

  state.imageWidth = resized.width;
  state.imageHeight = resized.height;

  workspace.style.setProperty('--img-aspect-ratio', String(resized.width / resized.height));

  originalImage.src = resized.toDataURL();
  outputCanvas.width = resized.width;
  outputCanvas.height = resized.height;

  state.kmeans = initState(pixels, [avgColor], state.distanceFn);
  render(state.kmeans);

  uploadPrompt.hidden = true;
  workspace.hidden = false;

  applyLayout();
  ensureLoop();
}

// ── Mount ────────────────────────────────────────────────────────

export function mount() {
  uploadPrompt = document.getElementById('upload-prompt')!;
  workspace = document.getElementById('workspace')!;
  originalImage = document.getElementById('original-image') as HTMLImageElement;
  outputCanvas = document.getElementById('output-canvas') as HTMLCanvasElement;
  paletteContainer = document.getElementById('palette')!;
  speedInput = document.getElementById('speed-input') as HTMLInputElement;

  // File input
  const fileInput = document.getElementById('file-input') as HTMLInputElement;
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) handleFileUpload(file);
  });

  // Drag-and-drop on the big upload prompt
  uploadPrompt.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadPrompt.classList.add('drag-over');
  });
  uploadPrompt.addEventListener('dragleave', () => {
    uploadPrompt.classList.remove('drag-over');
  });
  uploadPrompt.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadPrompt.classList.remove('drag-over');
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFileUpload(file);
  });

  // Image click
  originalImage.addEventListener('click', handleImageClick);

  // Speed control
  speedInput.value = String(state.iterationMs);
  speedInput.addEventListener('input', () => {
    const val = parseInt(speedInput.value, 10);
    if (!isNaN(val) && val >= 10) state.iterationMs = val;
  });

  // Metric selector — populate options from the metrics array
  const metricSelect = document.getElementById('metric-select') as HTMLSelectElement;
  for (const m of metrics) {
    const opt = document.createElement('option');
    opt.textContent = m.label;
    metricSelect.appendChild(opt);
  }
  metricSelect.addEventListener('change', () => {
    const m = metrics[metricSelect.selectedIndex];
    if (m) handleMetricChange(m.fn);
  });

  // Window resize → recalculate layout
  let resizeTimer: ReturnType<typeof setTimeout>;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(applyLayout, 100);
  });
}
