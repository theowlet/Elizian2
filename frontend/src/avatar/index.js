/**
 * Hybrid avatar rendering: Canvas + WebGL, S3-only storage, no base64 in DB.
 * Card display uses static S3 thumbnail; WebGL only in edit modal with destroy on close.
 */

export { PRESETS, presetRequiresWebGL, getEngineForPreset, MAX_TEXTURE_SIZE, DEFAULT_INTENSITY } from './constants';
export { renderCanvas, canvasToBlob } from './canvasEngine';
export { isWebGLAvailable, WebGLRenderer, renderWebGL } from './webglEngine';
export { renderAvatar, loadImage, canUseWebGL } from './renderAvatar';
export { getFaceLandmarks, detectFaceLandmarks, clearLandmarkCache } from './faceDetection';
