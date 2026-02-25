/**
 * Avatar render presets and engine routing.
 * Presets that require mesh warping or advanced shaders use WebGL; others use Canvas.
 */

export const PRESETS = {
  none: { id: 'none', label: 'Original', engine: 'canvas', hasDistortion: false },
  vintage: { id: 'vintage', label: 'Vintage', engine: 'canvas', hasDistortion: false },
  glow: { id: 'glow', label: 'Glow', engine: 'canvas', hasDistortion: false },
  posterize: { id: 'posterize', label: 'Posterize', engine: 'canvas', hasDistortion: false },
  caricature: { id: 'caricature', label: 'Caricature', engine: 'canvas', hasDistortion: true },
  badge: { id: 'badge', label: 'Badge', engine: 'canvas', hasDistortion: false },
  big_eyes: { id: 'big_eyes', label: 'Big Eyes', engine: 'webgl', hasDistortion: true },
  face_shrink: { id: 'face_shrink', label: 'Smooth Face', engine: 'webgl', hasDistortion: true },
  aura: { id: 'aura', label: 'Aura', engine: 'webgl', hasDistortion: false },
  cartoon: { id: 'cartoon', label: 'Cartoon', engine: 'webgl', hasDistortion: false },
  ghibli: { id: 'ghibli', label: 'Ghibli', engine: 'canvas', hasDistortion: false },
};

export const MAX_TEXTURE_SIZE = 512;

/** Intensity 0–1; applied per-preset in engines */
export const DEFAULT_INTENSITY = 0.5;

/**
 * Whether this preset requires WebGL (advanced distortion / shaders).
 */
export function presetRequiresWebGL(presetId) {
  const p = PRESETS[presetId];
  return p && p.engine === 'webgl';
}

/**
 * Get engine type for preset: 'canvas' | 'webgl'
 */
export function getEngineForPreset(presetId) {
  const p = PRESETS[presetId];
  return (p && p.engine) || 'canvas';
}
