# Feature: Spatial Coordinate Distance

Pixel (x, y) coordinates are added as two extra dimensions to the k-means distance
calculation. A slider controls their weight. At weight 0 the algorithm is identical to
the current behaviour. As weight increases, spatially adjacent pixels are more likely
to end up in the same cluster.

---

## Conceptual model

Each pixel is a **5D point**: `[R, G, B, X, Y]`.
Each cluster centroid is also a **5D point**: `[R, G, B, CX, CY]`.

Distance formula:
```
d(pixel, centroid) = sqrt(
    colorDist(pixel_rgb, centroid_rgb)^2
  + w * (px - cx)^2
  + w * (py - cy)^2
)
```

where:
- `colorDist` is whatever the active color distance function returns (RGB / HSL / CIELAB)
- `w` is the slider value (range 0.0 – 1.0, default 0)
- `px, py` are the pixel's image-pixel coordinates (no normalisation — raw pixel units)
- `cx, cy` are the centroid's spatial coordinates (average x, y of assigned pixels)

On each k-means step, `(cx, cy)` is recomputed as the **simple (unweighted) mean** of the
x, y coordinates of all pixels assigned to that cluster.

---

## Slider

A **"Spatial"** range input in the sidebar (near the speed control):
- Range: `0.0` to `1.0`, step `0.01`, default `0`
- A `<span>` next to it displays the current value to two decimal places
- Changing the slider immediately stops the loop, reassigns all pixels under the new
  combined distance (color + coordinate), and restarts the loop

---

## Code changes

### `src/kmeans.ts`

Add to `KMeansState`:
```typescript
pixelCoords: Int32Array | null;      // flat [x0,y0,x1,y1,...], set once at init
centroidCoords: Float64Array | null; // flat [cx0,cy0,...], recomputed each step
```

Both fields are `null` when coordinate distance is not in use (`coordWeight === 0` or
coords not provided to `initState`).

**`initState`** — add optional parameter:
```typescript
export function initState(
  pixels: Color[],
  initialCentroids: Color[],
  distanceFn: DistanceFn,
  pixelCoords?: Int32Array | null,
): KMeansState
```
When `pixelCoords` is provided, store it and compute initial `centroidCoords` from the
initial assignments.

Add private helper:
```typescript
function recomputeCentroidCoords(
  pixelCoords: Int32Array,
  assignments: Int32Array,
  k: number,
): Float64Array   // flat [cx0, cy0, cx1, cy1, ...]
```
For each cluster `c`, average the x and y of all pixels assigned to it.

**`step`** — new signature:
```typescript
export function step(state: KMeansState, distanceFn: DistanceFn, coordWeight: number): KMeansState
```
- In `assignPixels`, when `coordWeight > 0` and coords are present:
  ```
  const colorD = distanceFn(pixels[i], centroids[c]);
  const dx = pixelCoords[i*2]   - centroidCoords[c*2];
  const dy = pixelCoords[i*2+1] - centroidCoords[c*2+1];
  const d  = Math.sqrt(colorD*colorD + coordWeight*(dx*dx + dy*dy));
  ```
- After recomputing color centroids, if `pixelCoords` is non-null, also call
  `recomputeCentroidCoords` to update `centroidCoords`.

**`changeCoordWeight`** — new exported function:
```typescript
export function changeCoordWeight(
  state: KMeansState,
  distanceFn: DistanceFn,
  coordWeight: number,
): KMeansState
```
Reassigns all pixels using the combined distance (analogous to `changeMetric`),
recomputes `centroidCoords` if coords are present, returns state with `converged: false`.

All other state-returning functions (`addCentroid`, `addCentroidFromSelection`,
`reassignAfterDeletion`, `changeMetric`) must carry through `pixelCoords` and
`centroidCoords` from the input state. When they recompute assignments, they should
also recompute `centroidCoords` if `pixelCoords` is non-null.

### `src/animationLoop.ts`

Add `getCoordWeight: () => number` parameter to `startLoop`. Pass it to `step`:
```typescript
const next = step(current, getDistanceFn(), getCoordWeight());
```

### `src/app.ts`

Add to `AppState`:
```typescript
coordWeight: number; // default 0
```

In `handleFileUpload`, build `pixelCoords` and pass to `initState`:
```typescript
const pixelCoords = new Int32Array(pixels.length * 2);
for (let y = 0; y < resized.height; y++) {
  for (let x = 0; x < resized.width; x++) {
    const i = y * resized.width + x;
    pixelCoords[i * 2]     = x;
    pixelCoords[i * 2 + 1] = y;
  }
}
state.kmeans = initState(pixels, [avgColor], state.distanceFn, pixelCoords);
```

Update `ensureLoop` / `startLoop` call to pass `() => state.coordWeight`.

Replace `handleMetricChange` internals with `changeCoordWeight` (which handles both
color metric and coord weight together):
```typescript
function handleMetricChange(distanceFn: DistanceFn) {
  state.distanceFn = distanceFn;
  if (!state.kmeans) return;
  state.loop?.stop();
  state.kmeans = changeCoordWeight(state.kmeans, distanceFn, state.coordWeight);
  render(state.kmeans);
  ensureLoop();
}
```

Wire the slider:
```typescript
coordInput.addEventListener('input', () => {
  const val = parseFloat(coordInput.value);
  state.coordWeight = val;
  coordValue.textContent = val.toFixed(2);
  if (!state.kmeans) return;
  state.loop?.stop();
  state.kmeans = changeCoordWeight(state.kmeans, state.distanceFn, val);
  render(state.kmeans);
  ensureLoop();
});
```

### `index.html`

Add to sidebar (near speed control):
```html
<div id="coord-control">
  <label for="coord-input">
    Spatial
    <input type="range" id="coord-input" min="0" max="1" step="0.01" value="0" />
    <span id="coord-value">0.00</span>
  </label>
</div>
```

### `src/style.css`

Style `#coord-control` to match `#speed-control`:
```css
#coord-control {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  font-size: 0.85rem;
  color: #aaa;
  white-space: nowrap;
}
#coord-input {
  margin: 0 0.3rem;
  width: 80px;
  accent-color: #5a8fff;
  cursor: pointer;
}
#coord-value {
  min-width: 2.5em;
  text-align: right;
  color: #e0e0e0;
  font-size: 0.85rem;
}
```

---

## Notes

- No normalisation of coordinates. At `w = 1`, a coordinate delta of 1 pixel contributes
  the same squared distance as a color-channel delta of 1 (out of 255). In practice, for
  a 500×500 image the coordinate deltas can be up to ~700, so even small `w` values create
  noticeable spatial clustering. The slider range 0–1 covers the useful range.
- `centroidCoords` are always simple (unweighted) spatial averages, independent of any
  pixel importance weights from the "important region" feature.
