# Feature: Important Region with Weighted K-Means Centroids

A user-selectable rectangular region on the original image. Pixels inside it receive
a higher weight in centroid calculations, biasing the palette toward colors in that region.

---

## User interaction

- A **tab-style mode switch** in the toolbar (next to "Change image") lets the user toggle
  between two modes:
  - **Add cluster** (default) — existing drag-to-select behavior, unchanged
  - **Important region** — drag sets the important region instead of adding a cluster
- Only **one** important region can exist at a time; dragging a new one replaces the old one.
- The selected important region is shown as a **persistent orange border**
  (`rgba(255, 140, 0, 0.85)`, solid, lineWidth 2) on the original image overlay, distinct
  from the white-dashed cluster-selection border used in "Add cluster" mode.
- The important region is **cleared** when a new image is loaded.

---

## Weight formula

Let `N` = total number of pixels in the image, `M` = number of pixels in the important region.

- Important pixel weight: `N / M`
- Normal pixel weight: `1`

When no important region is set, all pixels have weight `1` (equivalent behaviour).

---

## Algorithm changes

Weights affect **centroid recalculation** (the Update step of k-means). Instead of a simple
average, compute a weighted average for each cluster `c`:

```
centroid[c].R = sum(pixels[i].R * weights[i]  for i in cluster c)
              / sum(weights[i]               for i in cluster c)
```

(same for G and B channels)

Weights do **not** affect pixel-to-cluster assignment (the Assign step). Each pixel is
still simply assigned to the nearest centroid by color distance.

Weights also affect the **initial centroid color** when adding a new cluster via rectangle
selection (`addCentroidFromSelection`): the new cluster's color is the weighted average of
the selected pixels (important pixels in the selection count more if the selection overlaps
the important region).

---

## Code changes

### `src/kmeans.ts`

Add `weights: Float32Array | null` to `KMeansState`. `null` = all weights are 1.

Modify `recomputeCentroids(pixels, assignments, k, weights?)`:
- When `weights` is provided, compute weighted sums and weighted counts per cluster.
- When `weights` is null, existing simple-average logic is unchanged.

Modify `step(state, distanceFn)`:
- Pass `state.weights` to `recomputeCentroids`.

`addCentroidFromSelection(state, selectedIndices)`:
- The final `recomputeCentroids` call already receives `state.weights`, so the new
  cluster's centroid is automatically a weighted average of its assigned pixels.

Add new exported function:
```typescript
export function setWeights(state: KMeansState, weights: Float32Array | null): KMeansState
```
- Recomputes all centroids from the **current assignments** using the new weights.
- Keeps assignments unchanged.
- Sets `converged: false`.
- Sets `weights` to the new value in the returned state.

All other state-returning functions (`initState`, `addCentroid`, `addCentroidFromSelection`,
`reassignAfterDeletion`, `changeMetric`) must carry through `state.weights` into the
returned state. `initState` always sets `weights: null`.

### `src/app.ts`

Add to `AppState`:
```typescript
mode: 'add-cluster' | 'important-region';  // default: 'add-cluster'
importantRegion: { ix1: number; iy1: number; ix2: number; iy2: number } | null;
```

Add `redrawPersistentOverlay()`:
- Clears the overlay canvas.
- If `state.importantRegion !== null`, draws the orange solid border at the stored
  image-pixel coordinates (converted to canvas display coordinates via
  `getBoundingClientRect()` + image scale factors).

Modify `handlePointerMove`:
- Call `redrawPersistentOverlay()` first, then draw the current drag rect on top.

Modify `handlePointerUp` — branch on `state.mode`:

**'add-cluster'**: existing behaviour (call `addCentroidFromSelection`, render, restart loop).

**'important-region'**:
1. Convert drag rect to image pixel coords `{ ix1, iy1, ix2, iy2 }`.
2. Store in `state.importantRegion`.
3. Compute `importantIndices` (all pixel indices inside the rect).
4. Build `weights: Float32Array` of length `state.kmeans.pixels.length`:
   - `weights[i] = totalPixels / importantIndices.length` for indices in `importantIndices`
   - `weights[i] = 1` for all others
5. `state.loop?.stop()`
6. `state.kmeans = setWeights(state.kmeans, weights)`
7. `render(state.kmeans)`
8. `redrawPersistentOverlay()`
9. `ensureLoop()`

Modify `handlePointerCancel` and the clear path in `handlePointerUp`:
- Replace `ctx.clearRect(...)` with `redrawPersistentOverlay()` so the persistent
  orange border is redrawn after a cancelled or completed drag.

Modify `handleFileUpload`:
- Set `state.importantRegion = null` before/after loading the new image.
- The new `initState` call already sets `weights: null`.
- After calling `requestAnimationFrame(updateOverlaySize)`, clear the overlay canvas
  (important region is gone).

### `index.html`

Add a mode switch to `#toolbar`:
```html
<div id="mode-switch">
  <button id="mode-add" class="mode-btn active">Add cluster</button>
  <button id="mode-important" class="mode-btn">Important region</button>
</div>
```

### `src/style.css`

Style `#mode-switch` as a compact segmented control matching the dark theme.
Example approach:
```css
#mode-switch {
  display: flex;
  border: 1px solid #3a3a3a;
  border-radius: 0.4rem;
  overflow: hidden;
}
.mode-btn {
  padding: 0.3rem 0.7rem;
  background: #2a2a2a;
  border: none;
  color: #aaa;
  font-size: 0.8rem;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  user-select: none;
  white-space: nowrap;
}
.mode-btn + .mode-btn {
  border-left: 1px solid #3a3a3a;
}
.mode-btn.active {
  background: #3a3a3a;
  color: #e0e0e0;
}
.mode-btn:hover:not(.active) {
  background: #333;
  color: #ccc;
}
```

Add a gap between `#change-image-btn` and `#mode-switch` in the toolbar
(e.g. `gap: 0.75rem` on `#toolbar`).
