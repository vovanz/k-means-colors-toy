import { config, hslPresets } from "./config";
import {
  type Color,
  type DistanceFn,
  rgbDistance,
  makeHslDistance,
  labDistance,
} from "./distance";
import { nearestCssName } from "./colorNames";
import {
  type KMeansState,
  initState,
  addCentroidFromSelection,
  reassignAfterDeletion,
  changeCoordWeight,
  setWeights,
} from "./kmeans";
import {
  loadImageFromFile,
  resizeToMaxPixels,
  extractPixels,
  averageColor,
} from "./imageUtils";
import { renderClusters } from "./canvasRenderer";
import { renderPalette } from "./paletteUI";
import { type LoopHandle, startLoop } from "./animationLoop";

// All available distance metrics, built from config presets.
const metrics: Array<{ label: string; fn: DistanceFn }> = [
  { label: "RGB", fn: rgbDistance },
  ...hslPresets.map((p) => ({
    label: p.label,
    fn: makeHslDistance(p.wH, p.wS, p.wL),
  })),
  { label: "CIELAB", fn: labDistance },
];

type ImportantRegion = { ix1: number; iy1: number; ix2: number; iy2: number };

interface AppState {
  kmeans: KMeansState | null;
  loop: LoopHandle | null;
  iterationMs: number;
  distanceFn: DistanceFn;
  coordWeight: number;
  imageWidth: number;
  imageHeight: number;
  mode: "add-cluster" | "important-region";
  importantRegion: ImportantRegion | null;
}

const state: AppState = {
  kmeans: null,
  loop: null,
  iterationMs: config.defaultIterationMs,
  distanceFn: rgbDistance,
  coordWeight: 0,
  imageWidth: 0,
  imageHeight: 0,
  mode: "add-cluster",
  importantRegion: null,
};

let uploadPrompt: HTMLElement;
let workspace: HTMLElement;
let originalImage: HTMLImageElement;
let selectionOverlay: HTMLCanvasElement;
let outputCanvas: HTMLCanvasElement;
let paletteContainer: HTMLElement;
let speedInput: HTMLInputElement;
let coordInput: HTMLInputElement;
let coordValue: HTMLElement;
let modeAddBtn: HTMLButtonElement;
let modeImportantBtn: HTMLButtonElement;

// Drag state for rectangle selection on the original image.
let dragStartX = 0; // CSS px relative to overlay
let dragStartY = 0;
let isDragging = false;

// ── Layout ───────────────────────────────────────────────────────

function computeLayout(imgAspect: number): "horizontal" | "vertical" {
  if (window.innerWidth < 540) return "horizontal";
  const screenAspect = window.innerWidth / window.innerHeight;
  return screenAspect > 1.25 * imgAspect ? "horizontal" : "vertical";
}

function applyLayout() {
  if (!state.imageWidth || !state.imageHeight) return;
  workspace.dataset.layout = computeLayout(
    state.imageWidth / state.imageHeight,
  );
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
    (s) => {
      state.kmeans = s;
    },
    render,
    () => state.iterationMs,
    () => state.distanceFn,
    () => state.coordWeight,
  );
}

function redrawPersistentOverlay() {
  const ctx = selectionOverlay.getContext("2d")!;
  ctx.clearRect(0, 0, selectionOverlay.width, selectionOverlay.height);

  if (!state.importantRegion || !state.imageWidth || !state.imageHeight) return;

  const rect = originalImage.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;

  const scaleX = rect.width / state.imageWidth;
  const scaleY = rect.height / state.imageHeight;

  const x = state.importantRegion.ix1 * scaleX;
  const y = state.importantRegion.iy1 * scaleY;
  const w =
    (state.importantRegion.ix2 - state.importantRegion.ix1 + 1) * scaleX;
  const h =
    (state.importantRegion.iy2 - state.importantRegion.iy1 + 1) * scaleY;

  const sx = Math.round(x) + 0.5;
  const sy = Math.round(y) + 0.5;
  const sw = Math.max(1, Math.round(w));
  const sh = Math.max(1, Math.round(h));

  ctx.strokeStyle = "rgba(255, 140, 0, 0.85)";
  ctx.lineWidth = 2;
  ctx.setLineDash([]);
  ctx.strokeRect(sx, sy, sw, sh);
}

function updateModeButtons() {
  modeAddBtn.classList.toggle("active", state.mode === "add-cluster");
  modeImportantBtn.classList.toggle(
    "active",
    state.mode === "important-region",
  );
}

// ── Event handlers ───────────────────────────────────────────────

function handleDeleteColor(index: number) {
  if (!state.kmeans) return;
  if (state.kmeans.centroids.length <= 1) return;

  state.loop?.stop();
  state.kmeans = reassignAfterDeletion(
    state.kmeans,
    index,
    state.distanceFn,
    state.coordWeight,
  );
  render(state.kmeans);
  ensureLoop();
}

function updateOverlaySize() {
  const rect = originalImage.getBoundingClientRect();
  selectionOverlay.width = Math.round(rect.width);
  selectionOverlay.height = Math.round(rect.height);
  redrawPersistentOverlay();
}

function drawSelectionRect(x1: number, y1: number, x2: number, y2: number) {
  const ctx = selectionOverlay.getContext("2d")!;
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  const w = Math.abs(x2 - x1);
  const h = Math.abs(y2 - y1);

  // Dark outline for contrast, then white dashed line on top.
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.lineWidth = 3;
  ctx.setLineDash([]);
  ctx.strokeRect(x + 0.5, y + 0.5, w, h);
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(x + 0.5, y + 0.5, w, h);
  ctx.setLineDash([]);
}

function getImageRectFromCssRect(
  cssX1: number,
  cssY1: number,
  cssX2: number,
  cssY2: number,
  displayWidth: number,
  displayHeight: number,
): ImportantRegion | null {
  if (
    !state.imageWidth ||
    !state.imageHeight ||
    displayWidth <= 0 ||
    displayHeight <= 0
  )
    return null;

  const scaleX = state.imageWidth / displayWidth;
  const scaleY = state.imageHeight / displayHeight;

  const ix1 = Math.max(
    0,
    Math.min(Math.floor(Math.min(cssX1, cssX2) * scaleX), state.imageWidth - 1),
  );
  const ix2 = Math.max(
    0,
    Math.min(Math.floor(Math.max(cssX1, cssX2) * scaleX), state.imageWidth - 1),
  );
  const iy1 = Math.max(
    0,
    Math.min(
      Math.floor(Math.min(cssY1, cssY2) * scaleY),
      state.imageHeight - 1,
    ),
  );
  const iy2 = Math.max(
    0,
    Math.min(
      Math.floor(Math.max(cssY1, cssY2) * scaleY),
      state.imageHeight - 1,
    ),
  );

  if (ix2 < ix1 || iy2 < iy1) return null;
  return { ix1, iy1, ix2, iy2 };
}

function getPixelIndicesInImageRect(imageRect: ImportantRegion): number[] {
  const indices: number[] = [];
  for (let y = imageRect.iy1; y <= imageRect.iy2; y++) {
    for (let x = imageRect.ix1; x <= imageRect.ix2; x++) {
      indices.push(y * state.imageWidth + x);
    }
  }
  return indices;
}

function handlePointerDown(event: PointerEvent) {
  if (!state.kmeans) return;
  if (event.button !== 0) return; // left button / touch only
  event.preventDefault();
  selectionOverlay.setPointerCapture(event.pointerId);
  const rect = selectionOverlay.getBoundingClientRect();
  dragStartX = event.clientX - rect.left;
  dragStartY = event.clientY - rect.top;
  isDragging = true;
}

function handlePointerMove(event: PointerEvent) {
  if (!isDragging) return;

  const rect = selectionOverlay.getBoundingClientRect();
  selectionOverlay.width = Math.round(rect.width);
  selectionOverlay.height = Math.round(rect.height);

  redrawPersistentOverlay();

  drawSelectionRect(
    dragStartX,
    dragStartY,
    event.clientX - rect.left,
    event.clientY - rect.top,
  );
}

function handlePointerUp(event: PointerEvent) {
  if (!isDragging || !state.kmeans) {
    isDragging = false;
    return;
  }
  isDragging = false;

  const rect = selectionOverlay.getBoundingClientRect();
  const imageRect = getImageRectFromCssRect(
    dragStartX,
    dragStartY,
    event.clientX - rect.left,
    event.clientY - rect.top,
    rect.width,
    rect.height,
  );

  redrawPersistentOverlay();

  if (!imageRect) return;

  if (state.mode === "add-cluster") {
    const indices = getPixelIndicesInImageRect(imageRect);
    if (indices.length === 0) return;

    state.loop?.stop();
    state.kmeans = addCentroidFromSelection(state.kmeans, indices);
    render(state.kmeans);
    ensureLoop();
    return;
  }

  // important-region mode
  state.importantRegion = imageRect;
  const importantIndices = getPixelIndicesInImageRect(imageRect);

  state.loop?.stop();

  if (importantIndices.length === 0) {
    state.kmeans = setWeights(state.kmeans, null);
    render(state.kmeans);
    redrawPersistentOverlay();
    ensureLoop();
    return;
  }

  const totalPixels = state.kmeans.pixels.length;
  const importantWeight = totalPixels / importantIndices.length;
  const weights = new Float32Array(totalPixels);
  weights.fill(1);

  for (const i of importantIndices) {
    weights[i] = importantWeight;
  }

  state.kmeans = setWeights(state.kmeans, weights);
  render(state.kmeans);
  redrawPersistentOverlay();
  ensureLoop();
}

function handlePointerCancel() {
  if (!isDragging) return;
  isDragging = false;
  redrawPersistentOverlay();
}

function handleMetricChange(distanceFn: DistanceFn) {
  state.distanceFn = distanceFn;
  if (!state.kmeans) return;

  state.loop?.stop();
  state.kmeans = changeCoordWeight(state.kmeans, distanceFn, state.coordWeight);
  render(state.kmeans);
  ensureLoop();
}

function buildCssExport(centroids: Color[]): string {
  const rawNames = centroids.map(nearestCssName);

  // Count how many palette entries map to each name.
  const counts = new Map<string, number>();
  for (const n of rawNames) counts.set(n, (counts.get(n) ?? 0) + 1);

  // Assign final variable names; add -0/-1/-2 suffix only when duplicated.
  const counters = new Map<string, number>();
  const varNames = rawNames.map((name) => {
    if (counts.get(name)! === 1) return name;
    const idx = counters.get(name) ?? 0;
    counters.set(name, idx + 1);
    return `${name}-${idx}`;
  });

  const lines = centroids.map((c, i) => {
    const hex = "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
    return `  --custom-${varNames[i]}: ${hex};`;
  });
  return `:root {\n${lines.join("\n")}\n}`;
}

async function handleFileUpload(file: File) {
  state.loop?.stop();
  state.importantRegion = null;

  const img = await loadImageFromFile(file);
  const resized = resizeToMaxPixels(img, config.maxPixels);
  const pixels = extractPixels(resized);
  const avgColor = averageColor(pixels);

  state.imageWidth = resized.width;
  state.imageHeight = resized.height;

  workspace.style.setProperty(
    "--img-aspect-ratio",
    String(resized.width / resized.height),
  );

  originalImage.src = resized.toDataURL();
  outputCanvas.width = resized.width;
  outputCanvas.height = resized.height;

  const pixelCoords = new Int32Array(pixels.length * 2);
  for (let y = 0; y < resized.height; y++) {
    for (let x = 0; x < resized.width; x++) {
      const i = y * resized.width + x;
      pixelCoords[i * 2]     = x;
      pixelCoords[i * 2 + 1] = y;
    }
  }
  state.kmeans = initState(pixels, [avgColor], state.distanceFn, pixelCoords);

  uploadPrompt.hidden = true;
  workspace.hidden = false;

  applyLayout();
  // Sync overlay canvas size after layout is applied.
  requestAnimationFrame(() => {
    updateOverlaySize();
    const ctx = selectionOverlay.getContext("2d")!;
    ctx.clearRect(0, 0, selectionOverlay.width, selectionOverlay.height);
  });

  render(state.kmeans);
  ensureLoop();
}

// ── Mount ────────────────────────────────────────────────────────

export function mount() {
  uploadPrompt = document.getElementById("upload-prompt")!;
  workspace = document.getElementById("workspace")!;
  originalImage = document.getElementById("original-image") as HTMLImageElement;
  selectionOverlay = document.getElementById(
    "selection-overlay",
  ) as HTMLCanvasElement;
  outputCanvas = document.getElementById("output-canvas") as HTMLCanvasElement;
  paletteContainer = document.getElementById("palette")!;
  speedInput = document.getElementById("speed-input") as HTMLInputElement;
  coordInput = document.getElementById("coord-input") as HTMLInputElement;
  coordValue = document.getElementById("coord-value")!;
  modeAddBtn = document.getElementById("mode-add") as HTMLButtonElement;
  modeImportantBtn = document.getElementById(
    "mode-important",
  ) as HTMLButtonElement;

  // File input
  const fileInput = document.getElementById("file-input") as HTMLInputElement;
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file) handleFileUpload(file);
  });

  // Drag-and-drop on the big upload prompt
  uploadPrompt.addEventListener("dragover", (e) => {
    e.preventDefault();
    uploadPrompt.classList.add("drag-over");
  });
  uploadPrompt.addEventListener("dragleave", () => {
    uploadPrompt.classList.remove("drag-over");
  });
  uploadPrompt.addEventListener("drop", (e) => {
    e.preventDefault();
    uploadPrompt.classList.remove("drag-over");
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFileUpload(file);
  });

  // Rectangle selection on original image via pointer events (mouse + touch).
  selectionOverlay.addEventListener("pointerdown", handlePointerDown);
  selectionOverlay.addEventListener("pointermove", handlePointerMove);
  selectionOverlay.addEventListener("pointerup", handlePointerUp);
  selectionOverlay.addEventListener("pointercancel", handlePointerCancel);

  // Speed control
  speedInput.value = String(state.iterationMs);
  speedInput.addEventListener("input", () => {
    const val = parseInt(speedInput.value, 10);
    if (!isNaN(val) && val >= 10) state.iterationMs = val;
  });

  // Spatial coordinate weight slider
  coordInput.value = String(state.coordWeight);
  coordValue.textContent = state.coordWeight.toFixed(2);
  coordInput.addEventListener("input", () => {
    const val = parseFloat(coordInput.value);
    state.coordWeight = val;
    coordValue.textContent = val.toFixed(2);
    if (!state.kmeans) return;
    state.loop?.stop();
    state.kmeans = changeCoordWeight(state.kmeans, state.distanceFn, val);
    render(state.kmeans);
    ensureLoop();
  });

  // Mode switch
  modeAddBtn.addEventListener("click", () => {
    state.mode = "add-cluster";
    updateModeButtons();
  });
  modeImportantBtn.addEventListener("click", () => {
    state.mode = "important-region";
    updateModeButtons();
  });
  updateModeButtons();

  // Metric selector — populate options from the metrics array
  const metricSelect = document.getElementById(
    "metric-select",
  ) as HTMLSelectElement;
  for (const m of metrics) {
    const opt = document.createElement("option");
    opt.textContent = m.label;
    metricSelect.appendChild(opt);
  }
  metricSelect.addEventListener("change", () => {
    const m = metrics[metricSelect.selectedIndex];
    if (m) handleMetricChange(m.fn);
  });

  // Export CSS button
  const exportBtn = document.getElementById("export-btn") as HTMLButtonElement;
  exportBtn.addEventListener("click", () => {
    if (!state.kmeans) return;
    const css = buildCssExport(state.kmeans.centroids);
    navigator.clipboard.writeText(css).then(() => {
      exportBtn.textContent = "Copied!";
      setTimeout(() => {
        exportBtn.textContent = "Export CSS";
      }, 1500);
    });
  });

  // Window resize → recalculate layout
  let resizeTimer: ReturnType<typeof setTimeout>;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      applyLayout();
      updateOverlaySize();
    }, 100);
  });
}
