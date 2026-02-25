/**
 * Face detection for avatar filters (Big Eyes, Face Shrink).
 * MediaPipe FaceLandmarker (WASM) – run once per upload, cache landmark coordinates.
 * Do not re-run per slider movement.
 */

const LANDMARK_CACHE = new Map();

function cacheKey(urlOrId) {
  if (typeof urlOrId === 'string') return urlOrId.slice(0, 200);
  return String(urlOrId);
}

/**
 * Stub: return cached landmarks if any, else null.
 * When MediaPipe is integrated: load WASM, run FaceLandmarker on image, return normalized landmarks.
 */
export function getFaceLandmarks(imageSource, options = {}) {
  const key = cacheKey(options.cacheKey || (typeof imageSource === 'string' ? imageSource : 'blob'));
  if (LANDMARK_CACHE.has(key)) {
    return Promise.resolve(LANDMARK_CACHE.get(key));
  }
  return Promise.resolve(null);
}

/**
 * Run face detection once on the image and cache result.
 * Call this once per upload/edit session; then use getFaceLandmarks with same cacheKey.
 * @param {HTMLImageElement|HTMLCanvasElement} image
 * @param {{ cacheKey: string }} options
 * @returns {Promise<unknown|null>} Landmarks or null (stub returns null until MediaPipe is added)
 */
export async function detectFaceLandmarks(image, options = {}) {
  const key = cacheKey(options.cacheKey || `img-${Date.now()}`);
  const existing = LANDMARK_CACHE.get(key);
  if (existing) return existing;

  // Placeholder: when @mediapipe/tasks-vision (or similar) is added:
  // const vision = await import('@mediapipe/tasks-vision');
  // const landmarker = await vision.FaceLandmarker.createFromOptions(...);
  // const result = landmarker.detect(image);
  // const landmarks = result.landmarks?.[0] ?? null;
  // if (landmarks) LANDMARK_CACHE.set(key, landmarks);
  // return landmarks;

  LANDMARK_CACHE.set(key, null);
  return null;
}

/**
 * Clear cached landmarks for a key or all.
 */
export function clearLandmarkCache(key) {
  if (key) LANDMARK_CACHE.delete(cacheKey(key));
  else LANDMARK_CACHE.clear();
}
