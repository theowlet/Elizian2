/**
 * Hybrid avatar render: routes to WebGL or Canvas based on preset.
 * - If preset requires advanced distortion and WebGL is available → WebGL.
 * - Else → Canvas (graceful fallback).
 * All images stored in S3; no base64 in DB. Card display uses static S3 thumbnail.
 */

import { getEngineForPreset, presetRequiresWebGL } from './constants';
import { renderCanvas } from './canvasEngine';
import { renderWebGL, isWebGLAvailable } from './webglEngine';

/**
 * Load image from URL or from Image/Canvas element.
 * @param {string|HTMLImageElement|HTMLCanvasElement} source - URL or image/canvas
 * @returns {Promise<HTMLImageElement|HTMLCanvasElement>}
 */
export function loadImage(source) {
  if (typeof source !== 'string') {
    if (source instanceof HTMLCanvasElement) return Promise.resolve(source);
    if (source instanceof HTMLImageElement && source.complete && source.naturalWidth) return Promise.resolve(source);
    if (source instanceof HTMLImageElement) {
      return new Promise((resolve, reject) => {
        source.onload = () => resolve(source);
        source.onerror = reject;
      });
    }
    return Promise.reject(new Error('Invalid image source'));
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = source;
  });
}

/**
 * Render avatar with the given preset and intensity.
 * Uses WebGL only when preset requires it and WebGL is available; otherwise Canvas.
 * @param {HTMLImageElement|HTMLCanvasElement} image - Source image (or canvas)
 * @param {string} presetId - Preset key (e.g. 'vintage', 'cartoon', 'big_eyes')
 * @param {number} intensity - 0–1
 * @param {{ landmarks?: unknown }} options - Optional cached face landmarks
 * @returns {Promise<HTMLCanvasElement>} Canvas with result (never base64)
 */
export async function renderAvatar(image, presetId, intensity = 0.5, options = {}) {
  const safeIntensity = Math.max(0, Math.min(1, intensity));
  const useWebGL = presetRequiresWebGL(presetId) && isWebGLAvailable();
  const engine = getEngineForPreset(presetId);

  if (engine === 'webgl' && useWebGL) {
    try {
      const canvas = renderWebGL(image, presetId, safeIntensity, options.landmarks || null);
      if (canvas) return canvas;
    } catch (_) {
      // fall through to canvas
    }
  }

  return Promise.resolve(renderCanvas(image, presetId, safeIntensity, options));
}

/**
 * Check if we should use WebGL in the edit modal (for UI hint or fallback message).
 */
export function canUseWebGL() {
  return isWebGLAvailable();
}
