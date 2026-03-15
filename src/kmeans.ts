import { type Color, distance } from './distance';

export interface KMeansState {
  pixels: Color[];
  centroids: Color[];
  assignments: Int32Array;
  converged: boolean;
}

function assignPixels(pixels: Color[], centroids: Color[]): Int32Array {
  const assignments = new Int32Array(pixels.length);
  for (let i = 0; i < pixels.length; i++) {
    let minDist = Infinity;
    let best = 0;
    for (let c = 0; c < centroids.length; c++) {
      const d = distance(pixels[i], centroids[c]);
      if (d < minDist) {
        minDist = d;
        best = c;
      }
    }
    assignments[i] = best;
  }
  return assignments;
}

function recomputeCentroids(pixels: Color[], assignments: Int32Array, k: number): Color[] {
  const sums: [number, number, number][] = Array.from({ length: k }, () => [0, 0, 0]);
  const counts = new Int32Array(k);

  for (let i = 0; i < pixels.length; i++) {
    const c = assignments[i];
    sums[c][0] += pixels[i][0];
    sums[c][1] += pixels[i][1];
    sums[c][2] += pixels[i][2];
    counts[c]++;
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

export function initState(pixels: Color[], initialCentroids: Color[]): KMeansState {
  const assignments = assignPixels(pixels, initialCentroids);
  return {
    pixels,
    centroids: initialCentroids,
    assignments,
    converged: false,
  };
}

export function step(state: KMeansState): KMeansState {
  const newCentroids = recomputeCentroids(state.pixels, state.assignments, state.centroids.length);
  const newAssignments = assignPixels(state.pixels, newCentroids);

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
  };
}

export function addCentroid(state: KMeansState, newColor: Color): KMeansState {
  return {
    pixels: state.pixels,
    centroids: [...state.centroids, newColor],
    assignments: state.assignments,
    converged: false,
  };
}

export function reassignAfterDeletion(state: KMeansState, deletedIndex: number): KMeansState {
  const newCentroids = state.centroids.filter((_, i) => i !== deletedIndex);
  if (newCentroids.length === 0) return state;

  const newAssignments = new Int32Array(state.assignments.length);
  for (let i = 0; i < state.assignments.length; i++) {
    const old = state.assignments[i];
    if (old === deletedIndex) {
      // Reassign to nearest remaining centroid
      let minDist = Infinity;
      let best = 0;
      for (let c = 0; c < newCentroids.length; c++) {
        const d = distance(state.pixels[i], newCentroids[c]);
        if (d < minDist) {
          minDist = d;
          best = c;
        }
      }
      newAssignments[i] = best;
    } else {
      // Remap index accounting for deleted slot
      newAssignments[i] = old < deletedIndex ? old : old - 1;
    }
  }

  return {
    pixels: state.pixels,
    centroids: newCentroids,
    assignments: newAssignments,
    converged: false,
  };
}
