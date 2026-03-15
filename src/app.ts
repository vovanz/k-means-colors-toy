import { config } from './config';
import { type Color } from './distance';
import { type KMeansState, initState, addCentroid, reassignAfterDeletion } from './kmeans';
import { loadImageFromFile, resizeToMaxPixels, extractPixels, averageColor } from './imageUtils';
import { renderClusters } from './canvasRenderer';
import { renderPalette } from './paletteUI';
import { type LoopHandle, startLoop } from './animationLoop';

interface AppState {
  kmeans: KMeansState | null;
  loop: LoopHandle | null;
  iterationMs: number;
  imageWidth: number;
  imageHeight: number;
}

const state: AppState = {
  kmeans: null,
  loop: null,
  iterationMs: config.defaultIterationMs,
  imageWidth: 0,
  imageHeight: 0,
};

let uploadPrompt: HTMLElement;
let workspace: HTMLElement;
let originalImage: HTMLImageElement;
let outputCanvas: HTMLCanvasElement;
let paletteContainer: HTMLElement;
let speedInput: HTMLInputElement;

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
  );
}

function handleDeleteColor(index: number) {
  if (!state.kmeans) return;
  if (state.kmeans.centroids.length <= 1) return;

  state.loop?.stop();
  state.kmeans = reassignAfterDeletion(state.kmeans, index);
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

  const clickedColor = state.kmeans.pixels[idx];
  state.kmeans = addCentroid(state.kmeans, clickedColor);
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

  // Show original image (resized version via canvas data URL for consistency)
  originalImage.src = resized.toDataURL();
  originalImage.style.width = `${resized.width}px`;
  originalImage.style.height = `${resized.height}px`;

  outputCanvas.width = resized.width;
  outputCanvas.height = resized.height;

  state.kmeans = initState(pixels, [avgColor]);
  render(state.kmeans);

  uploadPrompt.hidden = true;
  workspace.hidden = false;

  ensureLoop();
}

export function mount() {
  uploadPrompt = document.getElementById('upload-prompt')!;
  workspace = document.getElementById('workspace')!;
  originalImage = document.getElementById('original-image') as HTMLImageElement;
  outputCanvas = document.getElementById('output-canvas') as HTMLCanvasElement;
  paletteContainer = document.getElementById('palette')!;
  speedInput = document.getElementById('speed-input') as HTMLInputElement;

  const fileInput = document.getElementById('file-input') as HTMLInputElement;
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) handleFileUpload(file);
  });

  // Drag-and-drop on upload prompt
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

  originalImage.addEventListener('click', handleImageClick);

  speedInput.value = String(state.iterationMs);
  speedInput.addEventListener('input', () => {
    const val = parseInt(speedInput.value, 10);
    if (!isNaN(val) && val >= 10) {
      state.iterationMs = val;
    }
  });
}
