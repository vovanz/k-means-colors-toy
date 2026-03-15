# K-Means Colors Toy

A browser-based tool that extracts a color palette from any image using the k-means clustering algorithm, with a live animation showing the algorithm converge in real time.

## What it does

Upload an image and the app immediately begins clustering its pixels by color. A canvas next to the original image updates each step, painting every pixel with the average color of its current cluster. You can watch flat regions of color slowly sharpen into something that captures the image's essential palette.

**Interaction:**

- **Add a color** — click any pixel on the original image. A new cluster is seeded at that pixel's color and the algorithm continues from its current state without resetting.
- **Remove a color** — hover over a palette swatch and click the × button. Pixels that belonged to that cluster are reassigned to the nearest remaining cluster, then the algorithm continues.
- **Adjust speed** — change the iteration interval (default 100 ms) using the input in the top bar. Takes effect on the next iteration without restarting.

The animation stops automatically once the algorithm has fully converged (no pixel changes cluster between two consecutive iterations). Adding or removing a cluster resumes it.

## How it works

### Algorithm — k-means clustering

K-means partitions a set of points into *k* clusters by repeatedly doing two things:

1. **Assign** — each point is assigned to the cluster whose centroid is nearest.
2. **Update** — each centroid is recomputed as the mean of all points assigned to it.

These two steps alternate until no point changes cluster (convergence).

In this app the "points" are the image's pixels, represented as RGB triples `[R, G, B]`. Distance between two colors is the Euclidean distance in RGB space:

```
distance(a, b) = sqrt((a.R-b.R)² + (a.G-b.G)² + (a.B-b.B)²)
```

The initial state has a single cluster whose centroid is the average color of the entire image. Each click on the image adds one more cluster seeded at the clicked pixel's color.

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
initState(pixels, initialCentroids) → KMeansState
step(state)                         → KMeansState   (one full iteration)
addCentroid(state, color)           → KMeansState
reassignAfterDeletion(state, index) → KMeansState
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

Image click
  └─ addCentroid(state, clickedColor)
  └─ resume loop if stopped

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
