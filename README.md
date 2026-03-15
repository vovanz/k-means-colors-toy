# K-Means Colors Toy

**Live demo: https://vovanz.github.io/k-means-colors-toy/**

A browser-based tool that extracts a color palette from any image using the k-means clustering algorithm, with a live animation showing the algorithm converge in real time.

## What it does

Upload an image and the app immediately begins clustering its pixels by color. A canvas next to the original image updates each step, painting every pixel with the average color of its current cluster. You can watch flat regions of color slowly sharpen into something that captures the image's essential palette.

**Interaction:**

- **Add a color** — click or drag a rectangle on the original image (touch supported) while in **Add cluster** mode. All pixels within the selection are pre-assigned to a new cluster seeded at their weighted average color; the first frame shows this state before any reassignment, then normal k-means stepping resumes. Any existing cluster that loses all its pixels to the selection is removed automatically.
- **Important region** — switch to **Important region** mode and drag a rectangle on the original image. The selected rectangle is stored as a persistent orange outline and biases centroid updates toward colors inside that region.
- **Remove a color** — hover over a palette swatch and click the × button. Pixels that belonged to that cluster are reassigned to the nearest remaining cluster, then the algorithm continues.
- **Adjust speed** — change the iteration interval (default 100 ms) using the number input in the sidebar. Takes effect on the next iteration without restarting.
- **Spatial weight** — drag the "Spatial" slider (0.00–2.50) to bias clustering toward spatially adjacent pixels. At 0 the algorithm is pure color distance; higher values cause geographically nearby pixels to cluster together even if their colors differ.
- **Change image** — use the small "↻ Change image" button in the toolbar at any time. Loading a new image clears any previously selected important region.

The animation stops automatically once the algorithm has fully converged (no pixel changes cluster between two consecutive iterations). Adding/removing a cluster or changing region weights resumes it.

## Important region mode

The toolbar includes a segmented mode switch:

- **Add cluster** (default): drag adds a new cluster from the selected area.
- **Important region**: drag replaces the current important region.

Only one important region exists at a time. Dragging a new region replaces the old one.

The important region is rendered on the original-image overlay as a persistent solid orange border:

- color: `rgba(255, 140, 0, 0.85)`
- line width: `2`
- style: solid

This is visually distinct from the temporary white dashed selection rectangle used during drag.

## Weighted centroid behavior

Let:

- `N` = total number of pixels in the image
- `M` = number of pixels in the important region

Weights are defined as:

- Important pixel weight: `N / M`
- Normal pixel weight: `1`

If no important region is set, weights are effectively all `1` (same behavior as standard k-means).

### Where weights are applied

Weights affect **centroid recomputation** (the Update step), using weighted channel means:

- `centroid[c].R = sum(R_i * w_i) / sum(w_i)`
- `centroid[c].G = sum(G_i * w_i) / sum(w_i)`
- `centroid[c].B = sum(B_i * w_i) / sum(w_i)`

Weights do **not** affect **pixel assignment** (the Assign step). Pixel-to-cluster assignment still uses plain nearest-centroid distance under the selected metric.

Weights also apply when adding a cluster from rectangle selection: because centroid recomputation is weighted, the new cluster's initial color reflects weighted averages if the selection overlaps the important region.

## Responsive layout

The page fills the viewport without scrolling. The two canvases (original and k-means) are arranged either side-by-side or stacked depending on which orientation wastes less screen space:

- **Horizontal** (side-by-side): used when the screen is wide relative to the image — `screenAspect > 1.25 × imageAspect`. The speed control and palette appear below the canvases.
- **Vertical** (stacked): used when the screen is tall relative to the image. The speed control and palette appear in a sidebar to the right.

The layout recalculates on every window resize. Both canvases scale to fill the available space at all times.

## How it works

### Algorithm — k-means clustering

K-means partitions a set of points into *k* clusters by repeatedly doing two things:

1. **Assign** — each point is assigned to the cluster whose centroid is nearest.
2. **Update** — each centroid is recomputed as the mean of all points assigned to it (weighted mean when an important region is active).

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

The initial state has a single cluster whose centroid is the average color of the entire image. Dragging a rectangle on the original image in **Add cluster** mode adds a new cluster from the selected region.

### Spatial coordinate distance

Each pixel can optionally be treated as a **5D point** `[R, G, B, X, Y]`, where `X` and `Y` are its image-pixel coordinates. The "Spatial" slider controls a weight `w` that scales the coordinate contribution:

```
d(pixel, centroid) = sqrt(
    colorDist(pixel_rgb, centroid_rgb)²
  + w × (px − cx)²
  + w × (py − cy)²
)
```

At `w = 0` the algorithm is identical to pure color clustering. As `w` increases, spatially adjacent pixels are more likely to end up in the same cluster even when their colors differ. Spatial centroid coordinates `(cx, cy)` are the unweighted mean of the pixel coordinates assigned to each cluster, recomputed every step.

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
  kmeans.ts          — pure k-means state machine (with optional pixel weights)
  imageUtils.ts      — load, resize, extract pixels, compute average color
  canvasRenderer.ts  — paints the output canvas from cluster assignments
  paletteUI.ts       — renders palette swatches with delete buttons
  animationLoop.ts   — timing logic coupling setTimeout to kmeans.step()
  app.ts             — application state, event wiring, coordination
  main.ts            — entry point
  style.css          — layout and visual styles
```

The k-means algorithm (`kmeans.ts`) and distance functions (`distance.ts`) are pure — no DOM access, no side effects, no global state. Every k-means function takes a state object and returns a new one.

## Data flow

```
File upload
  └─ loadImageFromFile()
  └─ resizeToMaxPixels()   ──► <img> shown to user
  └─ extractPixels()       ──► Color[] (stored once, never mutated)
  └─ averageColor()
  └─ initState([avgColor]) ──► KMeansState (weights = null)
  └─ startLoop()
        └─ step(state) ──► new KMeansState
              ├─ renderClusters() ──► <canvas>
              └─ renderPalette()  ──► palette swatches
              └─ wait / next tick
              └─ converged? stop.

Rectangle drag on original image (Add cluster mode)
  └─ addCentroidFromSelection(state, pixelIndices)
  └─ immediate repaint (first frame, pre-step)
  └─ resume loop

Rectangle drag on original image (Important region mode)
  └─ compute region pixel indices
  └─ build per-pixel weights array
  └─ setWeights(state, weights)
  └─ immediate repaint + persistent orange region border
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

The production build outputs `dist/index.html` plus hashed JS/CSS assets in `dist/assets/`. No server required — open `index.html` directly or serve the `dist/` folder statically.

## Configuration

Edit `src/config.ts`:

```ts
export const config = {
  maxPixels: 250_000,      // resize threshold (total pixels)
  defaultIterationMs: 100, // starting animation speed in ms
} as const;
```
