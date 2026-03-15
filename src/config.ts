export const config = {
  maxPixels: 250_000,
  defaultIterationMs: 100,
} as const;

/**
 * HSL cylindrical distance presets.
 * wH weights the hue circle, wS saturation, wL lightness.
 * All three are in [0,1] range after RGB→HSL conversion, and the hue
 * circle has radius 1, so the weight scales are directly comparable.
 */
export const hslPresets = [
  { id: 'hsl-balanced', label: 'HSL – balanced',    wH: 1.0, wS: 1.0, wL: 1.0 },
  { id: 'hsl-hue',      label: 'HSL – hue first',   wH: 2.0, wS: 0.5, wL: 1.0 },
  { id: 'hsl-light',    label: 'HSL – light first', wH: 0.5, wS: 0.5, wL: 2.0 },
] as const;
