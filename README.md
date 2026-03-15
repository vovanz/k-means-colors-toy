# K-Means Colors Toy

A browser-based tool that extracts a color palette from any image using the k-means clustering algorithm, with a live animation showing the algorithm converge in real time.

## What it does

Upload an image and the app immediately begins clustering its pixels by color. A canvas next to the original image updates each step, painting every pixel with the average color of its current cluster. You can watch flat regions of color slowly sharpen into something that captures the image's essential palette.

**Interaction:**

- **Add a color** — click or drag a rectangle on the original image (touch supported). All pixels within the selection are pre-assigned to a new cluster seeded at their average color; the first frame shows this state before any reassignment, then normal k-means stepping resumes. Any existing cluster that loses all its pixels to the selection is removed automatically.
- **Remove a color** — hover over a palette swatch and click the × button. Pixels that belonged to that cluster are reassigned to the nearest remaining cluster, then the algorithm continues.
- **Adjust speed** — change the iteration interval (default 100 ms) using the number input in the sidebar. Takes effect on the next iteration without restarting.
- **Change image** — use the small "↻ Change image" button in the toolbar at any time.

The animation stops automatically once the algorithm has fully converged (no pixel changes cluster between two consecutive iterations). Adding or removing a cluster resumes it.

## Responsive layout

The page fills the viewport without scrolling. The two canvases (original and k-means) are arranged either side-by-side or stacked depending on which orientation wastes less screen space:

- **Horizontal** (side-by-side): used when the screen is wide relative to the image — `screenAspect > 1.25 × imageAspect`. The speed control and palette appear below the canvases.
- **Vertical** (stacked): used when the screen is tall relative to the image. The speed control and palette appear in a sidebar to the right.

The layout recalculates on every window resize. Both canvases scale to fill the available space at all times.

## How it works

### Algorithm — k-means clustering

K-means partitions a set of points into *k* clusters by repeatedly doing two things:

1. **Assign** — each point is assigned to the cluster whose centroid is nearest.
2. **Update** — each centroid is recomputed as the mean of all points assigned to it.

These two steps alternate until no point changes cluster (convergence).

In this app the "points" are the image's pixels, represented as RGB triples `[R, G, B]`. The distance metric is selectable at runtime; switching it immediately reassigns all pixels under the new metric and resumes the animation.

### Distance metrics

**RGB** — plain Euclidean distance in RGB space. Fast and simple.

**HSL (cylindrical Euclidean)** — converts each color to HSL, maps hue onto a unit circle to handle the 359°→0° wrap-around correctly, then computes weighted Euclidean distance:

```
hx = cos(H × 2π),  hy = sin(H × 2π)
d = sqrt(wH×((hxA-hxB)² + (hyA-hyB)²) + wS×(SA-SB)² + wL×(LA-LB)²)
```

Three presets with different `wH / wS / wL` weights are available and configurable in `src/config.ts`.

**CIELAB** — converts RGB → linear RGB → XYZ → L\*a\*b\* (D65 illuminant). Euclidean distance in Lab space correlates with perceived color difference better than either RGB or HSL.

Centroid positions are always averaged in RGB space regardless of the active metric. This is a pragmatic simplification — proper Lab or HSL means would require extra conversion steps.

The initial state has a single cluster whose centroid is the average color of the entire image. Dragging a rectangle on the original image adds a new cluster from the selected region.

### Animation timing

Each k-means iteration is one animation "frame". The target frame duration is configurable (default 100 ms). After each iteration:

- If the computation finished in less than the target duration, the app waits out the remainder with `setTimeout`.
- If the computation took longer than the target duration, the next iteration starts immediately.

This uses `setTimeout` rather than `requestAnimationFrame` because the budget is 100 ms, not 16 ms.

### Image resizing

Before any processing, the image is scaled down so its total pixel count does not exceed 250 000 pixels (configurable in `src/config.ts`). The scale factor is:

```
scale = sqrt(maxPixels / (width × height))
```

Applied only when the image exceeds the limit. This keeps the k-means loop fast enough to run on the main thread without a Web Worker.

## Code structure

```
src/
  config.ts          — maxPixels and defaultIterationMs constants
  distance.ts        — Euclidean RGB distance function (pure, no deps)
  kmeans.ts          — pure k-means state machine
  imageUtils.ts      — load, resize, extract pixels, compute average color
  canvasRenderer.ts  — paints the output canvas from cluster assignments
  paletteUI.ts       — renders palette swatches with delete buttons
  animationLoop.ts   — timing logic coupling setTimeout to kmeans.step()
  app.ts             — application state, event wiring, coordination
  main.ts            — entry point
  style.css          — layout and visual styles
```

The k-means algorithm (`kmeans.ts`) and the distance function (`distance.ts`) are entirely pure — no DOM access, no side effects, no global state. Every k-means function takes a state object and returns a new one:

```
initState(pixels, initialCentroids)          → KMeansState
step(state)                                  → KMeansState   (one full iteration)
addCentroid(state, color)                    → KMeansState
addCentroidFromSelection(state, pixelIndices) → KMeansState
reassignAfterDeletion(state, index)          → KMeansState
```

`animationLoop.ts` owns the timing and calls `step()` in a loop. It knows nothing about the DOM — it receives getter/setter closures for state and a callback to invoke after each frame. `app.ts` wires everything together and owns the single mutable state object.

### Data flow

```
File upload
  └─ loadImageFromFile()
  └─ resizeToMaxPixels()   ──► <img> shown to user
  └─ extractPixels()       ──► Color[] (stored once, never mutated)
  └─ averageColor()
  └─ initState([avgColor]) ──► KMeansState
  └─ startLoop()
        └─ step(state) ──► new KMeansState
              ├─ renderClusters() ──► <canvas>
              └─ renderPalette()  ──► palette swatches
              └─ wait / next tick
              └─ converged? stop.

Rectangle drag on original image
  └─ addCentroidFromSelection(state, pixelIndices)
  └─ immediate repaint (first frame, pre-step)
  └─ resume loop

Palette delete
  └─ reassignAfterDeletion(state, index)
  └─ immediate repaint
  └─ resume loop if stopped
```

## Getting started

```bash
npm install
npm run dev       # dev server at http://localhost:5173
npm run build     # production build → dist/
npm run preview   # preview the production build
```

The production build outputs exactly three files: `dist/index.html`, `dist/assets/index-[hash].js`, and `dist/assets/index-[hash].css`. No server required — open `index.html` directly or serve the `dist/` folder statically.

## Configuration

Edit `src/config.ts`:

```ts
export const config = {
  maxPixels: 250_000,      // resize threshold (total pixels)
  defaultIterationMs: 100, // starting animation speed in ms
} as const;
```
