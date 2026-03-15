export type Color = [number, number, number]; // [R, G, B], each 0–255
export type DistanceFn = (a: Color, b: Color) => number;

// ── RGB ──────────────────────────────────────────────────────────

export function rgbDistance(a: Color, b: Color): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

// ── HSL ──────────────────────────────────────────────────────────

function rgbToHsl(c: Color): [number, number, number] {
  const r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r)      h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else                h = (r - g) / d + 4;
  return [h / 6, s, l]; // h ∈ [0,1], s ∈ [0,1], l ∈ [0,1]
}

/**
 * Cylindrical Euclidean distance in HSL space.
 * Hue is mapped to a unit circle so the 359°→0° wrap-around is handled correctly.
 * wH, wS, wL are non-negative weights for the hue, saturation, and lightness terms.
 */
export function makeHslDistance(wH: number, wS: number, wL: number): DistanceFn {
  return (a: Color, b: Color): number => {
    const [hA, sA, lA] = rgbToHsl(a);
    const [hB, sB, lB] = rgbToHsl(b);
    const τ = 2 * Math.PI;
    const dHx = Math.cos(hA * τ) - Math.cos(hB * τ);
    const dHy = Math.sin(hA * τ) - Math.sin(hB * τ);
    const dS  = sA - sB;
    const dL  = lA - lB;
    return Math.sqrt(wH * (dHx * dHx + dHy * dHy) + wS * dS * dS + wL * dL * dL);
  };
}

// ── CIELAB ───────────────────────────────────────────────────────

function linearize(v: number): number {
  v /= 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function labF(t: number): number {
  return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
}

function rgbToLab(c: Color): [number, number, number] {
  const r = linearize(c[0]), g = linearize(c[1]), b = linearize(c[2]);
  // sRGB → XYZ (D65 illuminant)
  const x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
  const y = r * 0.2126729 + g * 0.7151522 + b * 0.0721750;
  const z = r * 0.0193339 + g * 0.1191920 + b * 0.9503041;
  // XYZ → L*a*b* (D65 reference white)
  const fx = labF(x / 0.95047);
  const fy = labF(y / 1.00000);
  const fz = labF(z / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function labDistance(a: Color, b: Color): number {
  const [lA, aA, bA] = rgbToLab(a);
  const [lB, aB, bB] = rgbToLab(b);
  const dL = lA - lB, da = aA - aB, db = bA - bB;
  return Math.sqrt(dL * dL + da * da + db * db);
}
