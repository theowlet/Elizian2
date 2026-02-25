/**
 * Phase 2: WebGL-accelerated avatar filters.
 * Big Eyes, Smooth Face, Aura, Cartoon shader.
 * Max texture 512px; renderer must be destroyed on modal close.
 */

import { MAX_TEXTURE_SIZE } from './constants';

// WebGL1-compatible shaders for WebView support
const VERT = `
attribute vec2 a_position;
attribute vec2 a_uv;
varying vec2 v_uv;
void main() {
  v_uv = a_uv;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAG_PASSTHROUGH = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_texture;
void main() {
  gl_FragColor = texture2D(u_texture, v_uv);
}
`;

const FRAG_CARTOON = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_texture;
uniform float u_intensity;
void main() {
  vec4 c = texture2D(u_texture, v_uv);
  float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  float bands = 4.0 + 4.0 * (1.0 - u_intensity);
  l = floor(l * bands) / bands;
  vec3 outRgb = c.rgb * (l / max(0.001, dot(c.rgb, vec3(0.299, 0.587, 0.114))));
  outRgb = mix(c.rgb, outRgb, 0.6 + 0.3 * u_intensity);
  gl_FragColor = vec4(outRgb, c.a);
}
`;

const FRAG_AURA = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_texture;
uniform float u_intensity;
void main() {
  vec2 uv = v_uv - 0.5;
  float d = length(uv) * 2.0;
  vec4 c = texture2D(u_texture, v_uv);
  float glow = exp(-d * (2.0 - u_intensity)) * 0.5 * u_intensity;
  vec3 aura = vec3(0.4, 0.6, 1.0);
  gl_FragColor = vec4(c.rgb + aura * glow, c.a);
}
`;

function createProgram(gl, vertSrc, fragSrc) {
  const vs = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vs, vertSrc);
  gl.compileShader(vs);
  if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
    console.warn('Avatar WebGL vert:', gl.getShaderInfoLog(vs));
    gl.deleteShader(vs);
    return null;
  }
  const fs = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fs, fragSrc);
  gl.compileShader(fs);
  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
    console.warn('Avatar WebGL frag:', gl.getShaderInfoLog(fs));
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return null;
  }
  const p = gl.createProgram();
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    gl.deleteProgram(p);
    return null;
  }
  return p;
}

// Quad: position xy, uv xy. Flip V so image top (uv.y=0) maps to screen top (WebGL has Y-up).
function createQuadBuffer(gl) {
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([
      -1, -1, 0, 1, 1, -1, 1, 1, -1, 1, 0, 0, 1, 1, 1, 0
    ]),
    gl.STATIC_DRAW
  );
  return buf;
}

/**
 * Check if WebGL is available and we can use it (no context loss / low memory).
 */
export function isWebGLAvailable() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return false;
    const max = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    if (max < MAX_TEXTURE_SIZE) return false;
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Clamp image dimensions to max size.
 */
function clampSize(w, h) {
  if (w <= MAX_TEXTURE_SIZE && h <= MAX_TEXTURE_SIZE) return { width: w, height: h };
  const r = Math.min(MAX_TEXTURE_SIZE / w, MAX_TEXTURE_SIZE / h);
  return { width: Math.round(w * r), height: Math.round(h * r) };
}

/**
 * WebGL renderer instance. Must call destroy() when modal closes.
 */
export class WebGLRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = null;
    this.programPass = null;
    this.programCartoon = null;
    this.programAura = null;
    this.quadBuffer = null;
    this.texture = null;
    this.width = 0;
    this.height = 0;
    this.initialized = false;
  }

  init() {
    if (this.initialized) return true;
    const gl = this.canvas.getContext('webgl2') || this.canvas.getContext('webgl');
    if (!gl) return false;
    this.gl = gl;
    this.programPass = createProgram(gl, VERT, FRAG_PASSTHROUGH);
    this.programCartoon = createProgram(gl, VERT, FRAG_CARTOON);
    this.programAura = createProgram(gl, VERT, FRAG_AURA);
    if (!this.programPass || !this.programCartoon || !this.programAura) {
      this.destroy();
      return false;
    }
    this.quadBuffer = createQuadBuffer(gl);
    this.initialized = true;
    return true;
  }

  uploadImage(image) {
    if (!this.initialized && !this.init()) return false;
    const gl = this.gl;
    const w = image.width || image.naturalWidth;
    const h = image.height || image.naturalHeight;
    const { width, height } = clampSize(w, h);
    this.canvas.width = width;
    this.canvas.height = height;
    this.width = width;
    this.height = height;
    gl.viewport(0, 0, width, height);

    if (this.texture) {
      gl.deleteTexture(this.texture);
    }
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const upload = document.createElement('canvas');
    upload.width = width;
    upload.height = height;
    const uctx = upload.getContext('2d');
    uctx.drawImage(image, 0, 0, width, height);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, upload);
    this.texture = tex;
    return true;
  }

  drawPass(intensity = 0.5, presetId) {
    if (!this.initialized || !this.texture) return false;
    const gl = this.gl;
    let program = this.programPass;
    if (presetId === 'cartoon') program = this.programCartoon;
    else if (presetId === 'aura') program = this.programAura;

    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    const posLoc = gl.getAttribLocation(program, 'a_position');
    const uvLoc = gl.getAttribLocation(program, 'a_uv');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(uvLoc);
    gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 16, 8);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    const texLoc = gl.getUniformLocation(program, 'u_texture');
    gl.uniform1i(texLoc, 0);
    const intLoc = gl.getUniformLocation(program, 'u_intensity');
    if (intLoc !== null) gl.uniform1f(intLoc, intensity);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return true;
  }

  /**
   * Render preset. For big_eyes/face_shrink we fall back to canvas-style in 2D (see renderAvatar).
   * Here we only do cartoon and aura in WebGL; mesh warping would need landmark data.
   */
  render(presetId, intensity) {
    if (presetId === 'big_eyes' || presetId === 'face_shrink') {
      this.drawPass(intensity, 'none');
      return true;
    }
    return this.drawPass(intensity, presetId);
  }

  destroy() {
    if (!this.gl) return;
    const gl = this.gl;
    if (this.texture) gl.deleteTexture(this.texture);
    if (this.quadBuffer) gl.deleteBuffer(this.quadBuffer);
    if (this.programPass) gl.deleteProgram(this.programPass);
    if (this.programCartoon) gl.deleteProgram(this.programCartoon);
    if (this.programAura) gl.deleteProgram(this.programAura);
    this.gl = null;
    this.texture = null;
    this.quadBuffer = null;
    this.programPass = this.programCartoon = this.programAura = null;
    this.initialized = false;
  }
}

/**
 * Render with WebGL if supported; returns canvas with result or null on failure.
 */
export function renderWebGL(image, presetId, intensity = 0.5, landmarks = null) {
  if (!isWebGLAvailable()) return null;
  const { width: w, height: h } = clampSize(
    image.width || image.naturalWidth,
    image.height || image.naturalHeight
  );
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const renderer = new WebGLRenderer(canvas);
  if (!renderer.init()) {
    renderer.destroy();
    return null;
  }
  if (!renderer.uploadImage(image)) {
    renderer.destroy();
    return null;
  }
  renderer.render(presetId, intensity);
  renderer.destroy();
  return canvas;
}
