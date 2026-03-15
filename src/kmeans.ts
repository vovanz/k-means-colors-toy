import { type Color, type DistanceFn } from "./distance";

export interface KMeansState {
  pixels: Color[];
  centroids: Color[];
  assignments: Int32Array;
  converged: boolean;
  weights: Float32Array | null;
  pixelCoords: Int32Array | null;      // flat [x0,y0,x1,y1,...], set once at init
  centroidCoords: Float64Array | null; // flat [cx0,cy0,...], recomputed each step
}

function assignPixels(
  pixels: Color[],
  centroids: Color[],
  distanceFn: DistanceFn,
  pixelCoords: Int32Array | null,
  centroidCoords: Float64Array | null,
  coordWeight: number,
): Int32Array {
  const assignments = new Int32Array(pixels.length);
  const useSpatial = coordWeight > 0 && pixelCoords !== null && centroidCoords !== null;
  for (let i = 0; i < pixels.length; i++) {
    let minDist = Infinity;
    let best = 0;
    for (let c = 0; c < centroids.length; c++) {
      let d: number;
      if (useSpatial) {
        const colorD = distanceFn(pixels[i], centroids[c]);
        const dx = pixelCoords![i * 2]     - centroidCoords![c * 2];
        const dy = pixelCoords![i * 2 + 1] - centroidCoords![c * 2 + 1];
        d = Math.sqrt(colorD * colorD + coordWeight * (dx * dx + dy * dy));
      } else {
        d = distanceFn(pixels[i], centroids[c]);
      }
      if (d < minDist) {
        minDist = d;
        best = c;
      }
    }
    assignments[i] = best;
  }
  return assignments;
}

function recomputeCentroids(
  pixels: Color[],
  assignments: Int32Array,
  k: number,
  weights: Float32Array | null = null,
): Color[] {
  const sums: [number, number, number][] = Array.from({ length: k }, () => [
    0, 0, 0,
  ]);
  const counts = new Float64Array(k);

  if (weights) {
    for (let i = 0; i < pixels.length; i++) {
      const c = assignments[i];
      const w = weights[i];
      sums[c][0] += pixels[i][0] * w;
      sums[c][1] += pixels[i][1] * w;
      sums[c][2] += pixels[i][2] * w;
      counts[c] += w;
    }
  } else {
    for (let i = 0; i < pixels.length; i++) {
      const c = assignments[i];
      sums[c][0] += pixels[i][0];
      sums[c][1] += pixels[i][1];
      sums[c][2] += pixels[i][2];
      counts[c] += 1;
    }
  }

  return sums.map((sum, c) => {
    if (counts[c] === 0) return [0, 0, 0] as Color;
    return [
      Math.round(sum[0] / counts[c]),
      Math.round(sum[1] / counts[c]),
      Math.round(sum[2] / counts[c]),
    ] as Color;
  });
}

function recomputeCentroidCoords(
  pixelCoords: Int32Array,
  assignments: Int32Array,
  k: number,
): Float64Array {
  const sums = new Float64Array(k * 2);
  const counts = new Int32Array(k);

  for (let i = 0; i < assignments.length; i++) {
    const c = assignments[i];
    sums[c * 2]     += pixelCoords[i * 2];
    sums[c * 2 + 1] += pixelCoords[i * 2 + 1];
    counts[c]++;
  }

  const result = new Float64Array(k * 2);
  for (let c = 0; c < k; c++) {
    if (counts[c] > 0) {
      result[c * 2]     = sums[c * 2]     / counts[c];
      result[c * 2 + 1] = sums[c * 2 + 1] / counts[c];
    }
  }
  return result;
}

export function initState(
  pixels: Color[],
  initialCentroids: Color[],
  distanceFn: DistanceFn,
  pixelCoords?: Int32Array | null,
): KMeansState {
  const coords = pixelCoords ?? null;
  const assignments = assignPixels(pixels, initialCentroids, distanceFn, coords, null, 0);
  const centroidCoords = coords
    ? recomputeCentroidCoords(coords, assignments, initialCentroids.length)
    : null;
  return {
    pixels,
    centroids: initialCentroids,
    assignments,
    converged: false,
    weights: null,
    pixelCoords: coords,
    centroidCoords,
  };
}

export function step(
  state: KMeansState,
  distanceFn: DistanceFn,
  coordWeight: number,
): KMeansState {
  const newCentroids = recomputeCentroids(
    state.pixels,
    state.assignments,
    state.centroids.length,
    state.weights,
  );
  const newCentroidCoords = state.pixelCoords
    ? recomputeCentroidCoords(state.pixelCoords, state.assignments, newCentroids.length)
    : null;
  const newAssignments = assignPixels(
    state.pixels,
    newCentroids,
    distanceFn,
    state.pixelCoords,
    newCentroidCoords,
    coordWeight,
  );

  let converged = true;
  for (let i = 0; i < newAssignments.length; i++) {
    if (newAssignments[i] !== state.assignments[i]) {
      converged = false;
      break;
    }
  }

  return {
    pixels: state.pixels,
    centroids: newCentroids,
    assignments: newAssignments,
    converged,
    weights: state.weights,
    pixelCoords: state.pixelCoords,
    centroidCoords: newCentroidCoords,
  };
}

export function addCentroid(state: KMeansState, newColor: Color): KMeansState {
  return {
    pixels: state.pixels,
    centroids: [...state.centroids, newColor],
    assignments: state.assignments,
    converged: false,
    weights: state.weights,
    pixelCoords: state.pixelCoords,
    centroidCoords: state.centroidCoords,
  };
}

/**
 * Add a new cluster by pre-assigning the given pixel indices to it.
 * All cluster centroids (including the new one) are recomputed from the
 * resulting assignments. Any old cluster that lost all its pixels is removed.
 * This produces the "first frame" state before normal k-means stepping begins.
 */
export function addCentroidFromSelection(
  state: KMeansState,
  selectedIndices: number[],
): KMeansState {
  if (selectedIndices.length === 0) return state;

  const newClusterIndex = state.centroids.length;
  const k = newClusterIndex + 1;

  // Assign selected pixels to the new cluster.
  const provisional = new Int32Array(state.assignments);
  for (const idx of selectedIndices) {
    provisional[idx] = newClusterIndex;
  }

  // Count pixels per cluster.
  const counts = new Int32Array(k);
  for (let i = 0; i < provisional.length; i++) counts[provisional[i]]++;

  // Build compact index map, dropping empty clusters.
  const indexMap = new Int32Array(k);
  let newK = 0;
  for (let c = 0; c < k; c++) {
    indexMap[c] = counts[c] > 0 ? newK++ : -1;
  }

  // Remap all assignments.
  const newAssignments = new Int32Array(provisional.length);
  for (let i = 0; i < provisional.length; i++) {
    newAssignments[i] = indexMap[provisional[i]];
  }

  // Recompute all centroids from the new assignments.
  const newCentroids = recomputeCentroids(
    state.pixels,
    newAssignments,
    newK,
    state.weights,
  );
  const newCentroidCoords = state.pixelCoords
    ? recomputeCentroidCoords(state.pixelCoords, newAssignments, newK)
    : null;

  return {
    pixels: state.pixels,
    centroids: newCentroids,
    assignments: newAssignments,
    converged: false,
    weights: state.weights,
    pixelCoords: state.pixelCoords,
    centroidCoords: newCentroidCoords,
  };
}

export function reassignAfterDeletion(
  state: KMeansState,
  deletedIndex: number,
  distanceFn: DistanceFn,
  coordWeight = 0,
): KMeansState {
  const newCentroids = state.centroids.filter((_, i) => i !== deletedIndex);
  if (newCentroids.length === 0) return state;

  const newAssignments = new Int32Array(state.assignments.length);
  for (let i = 0; i < state.assignments.length; i++) {
    const old = state.assignments[i];
    if (old === deletedIndex) {
      let minDist = Infinity;
      let best = 0;
      for (let c = 0; c < newCentroids.length; c++) {
        const d = distanceFn(state.pixels[i], newCentroids[c]);
        if (d < minDist) {
          minDist = d;
          best = c;
        }
      }
      newAssignments[i] = best;
    } else {
      newAssignments[i] = old < deletedIndex ? old : old - 1;
    }
  }

  const newCentroidCoords = state.pixelCoords
    ? recomputeCentroidCoords(state.pixelCoords, newAssignments, newCentroids.length)
    : null;

  return {
    pixels: state.pixels,
    centroids: newCentroids,
    assignments: newAssignments,
    converged: false,
    weights: state.weights,
    pixelCoords: state.pixelCoords,
    centroidCoords: newCentroidCoords,
  };
}

/** Reassign all pixels under a new coord weight (and/or distance metric) without changing centroids. */
export function changeCoordWeight(
  state: KMeansState,
  distanceFn: DistanceFn,
  coordWeight: number,
): KMeansState {
  const newAssignments = assignPixels(
    state.pixels,
    state.centroids,
    distanceFn,
    state.pixelCoords,
    state.centroidCoords,
    coordWeight,
  );
  const newCentroidCoords = state.pixelCoords
    ? recomputeCentroidCoords(state.pixelCoords, newAssignments, state.centroids.length)
    : null;
  return {
    pixels: state.pixels,
    centroids: state.centroids,
    assignments: newAssignments,
    converged: false,
    weights: state.weights,
    pixelCoords: state.pixelCoords,
    centroidCoords: newCentroidCoords,
  };
}

export function setWeights(
  state: KMeansState,
  weights: Float32Array | null,
): KMeansState {
  const newCentroids = recomputeCentroids(
    state.pixels,
    state.assignments,
    state.centroids.length,
    weights,
  );

  return {
    pixels: state.pixels,
    centroids: newCentroids,
    assignments: state.assignments,
    converged: false,
    weights,
    pixelCoords: state.pixelCoords,
    centroidCoords: state.centroidCoords,
  };
}
