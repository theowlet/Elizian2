/**
 * Phase 1: Canvas-based avatar filters.
 * Color filters, glow, posterize, basic caricature, badge overlays.
 * Works in all browsers and WebViews; no WebGL required.
 */

import { MAX_TEXTURE_SIZE } from './constants';

/**
 * Clamp dimensions to max size while keeping aspect ratio.
 */
function clampSize(w, h, max = MAX_TEXTURE_SIZE) {
  if (w <= max && h <= max) return { width: w, height: h };
  const r = Math.min(max / w, max / h);
  return { width: Math.round(w * r), height: Math.round(h * r) };
}

/**
 * Draw image to canvas with optional size clamp. Returns 2D context and canvas.
 */
function getCanvasContext(image, clamp = true) {
  let w = image.width || image.naturalWidth;
  let h = image.height || image.naturalHeight;
  if (clamp) {
    const s = clampSize(w, h);
    w = s.width;
    h = s.height;
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0, w, h);
  return { ctx, canvas, width: w, height: h };
}

/**
 * Get ImageData from canvas context.
 */
function getImageData(ctx, w, h) {
  return ctx.getImageData(0, 0, w, h);
}

function putImageData(ctx, data) {
  ctx.putImageData(data, 0, 0);
}

function cloneImageData(ctx, src) {
  const copy = ctx.createImageData(src.width, src.height);
  copy.data.set(src.data);
  return copy;
}

// --- Color filter: vintage (warm, slight sepia)
function applyVintage(ctx, w, h, intensity) {
  const data = getImageData(ctx, w, h);
  const d = data.data;
  const t = 0.3 + 0.4 * intensity;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    d[i] = Math.min(255, r * (1 + t * 0.2) + g * 0.1);
    d[i + 1] = Math.min(255, g * (1 + t * 0.1) + r * 0.05);
    d[i + 2] = Math.min(255, b * (1 - t * 0.3));
  }
  putImageData(ctx, data);
}

// --- Glow: blurred layer underneath, sharp on top
function applyGlow(ctx, w, h, intensity) {
  const canvas = ctx.canvas;
  const copy = document.createElement('canvas');
  copy.width = w;
  copy.height = h;
  const cctx = copy.getContext('2d');
  cctx.drawImage(canvas, 0, 0);
  ctx.filter = `blur(${8 + 12 * intensity}px)`;
  ctx.globalAlpha = 0.5 * intensity;
  ctx.drawImage(copy, 0, 0);
  ctx.filter = 'none';
  ctx.globalAlpha = 1;
  ctx.drawImage(copy, 0, 0);
}

// --- Posterize: reduce color levels
function applyPosterize(ctx, w, h, intensity) {
  const data = getImageData(ctx, w, h);
  const d = data.data;
  const levels = Math.max(2, Math.round(8 - 6 * intensity));
  const step = 255 / (levels - 1);
  for (let i = 0; i < d.length; i += 4) {
    d[i] = Math.round(d[i] / step) * step;
    d[i + 1] = Math.round(d[i + 1] / step) * step;
    d[i + 2] = Math.round(d[i + 2] / step) * step;
  }
  putImageData(ctx, data);
}

// --- Basic caricature: radial bulge from center (simplified; full version can use face landmarks)
function applyCaricature(ctx, w, h, intensity) {
  const copy = document.createElement('canvas');
  copy.width = w;
  copy.height = h;
  const cctx = copy.getContext('2d');
  cctx.drawImage(ctx.canvas, 0, 0);
  const src = cctx.getImageData(0, 0, w, h);
  const out = ctx.createImageData(w, h);
  const cx = w / 2;
  const cy = h / 2;
  const strength = 0.15 * intensity;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x - cx) / cx;
      const dy = (y - cy) / cy;
      const r = Math.sqrt(dx * dx + dy * dy);
      const f = 1 + strength * (1 - r);
      const sx = cx + (x - cx) * f;
      const sy = cy + (y - cy) * f;
      const si = (Math.round(sy) * w + Math.round(sx)) * 4;
      const oi = (y * w + x) * 4;
      if (si >= 0 && si < src.data.length - 3) {
        out.data[oi] = src.data[si];
        out.data[oi + 1] = src.data[si + 1];
        out.data[oi + 2] = src.data[si + 2];
        out.data[oi + 3] = src.data[si + 3];
      } else {
        out.data[oi] = src.data[oi];
        out.data[oi + 1] = src.data[oi + 1];
        out.data[oi + 2] = src.data[oi + 2];
        out.data[oi + 3] = 255;
      }
    }
  }
  ctx.putImageData(out, 0, 0);
}

// --- Bilateral-like smoothing: edge-preserving blur (small radius for perf)
function bilateralSmooth(src, w, h) {
  const radius = 2;
  const sigmaS = 1.5;
  const sigmaR = 0.15;
  const out = new Uint8ClampedArray(src.length);

  const gaussS = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const dsq = dx * dx + dy * dy;
      gaussS.push({ dx, dy, w: Math.exp(-dsq / (2 * sigmaS * sigmaS)) });
    }
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r0 = src[i] / 255;
      const g0 = src[i + 1] / 255;
      const b0 = src[i + 2] / 255;
      const l0 = 0.299 * r0 + 0.587 * g0 + 0.114 * b0;

      let rs = 0;
      let gs = 0;
      let bs = 0;
      let ws = 0;

      for (let k = 0; k < gaussS.length; k++) {
        const { dx, dy, w: wsBase } = gaussS[k];
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        const j = (ny * w + nx) * 4;
        const r1 = src[j] / 255;
        const g1 = src[j + 1] / 255;
        const b1 = src[j + 2] / 255;
        const l1 = 0.299 * r1 + 0.587 * g1 + 0.114 * b1;
        const dr = l1 - l0;
        const wr = Math.exp(-(dr * dr) / (2 * sigmaR * sigmaR));
        const wgt = wsBase * wr;
        rs += r1 * wgt;
        gs += g1 * wgt;
        bs += b1 * wgt;
        ws += wgt;
      }

      if (ws > 0) {
        rs /= ws;
        gs /= ws;
        bs /= ws;
      } else {
        rs = r0;
        gs = g0;
        bs = b0;
      }

      out[i] = Math.round(rs * 255);
      out[i + 1] = Math.round(gs * 255);
      out[i + 2] = Math.round(bs * 255);
      out[i + 3] = src[i + 3];
    }
  }

  return out;
}

// --- Sobel edge detection (grayscale luminance)
function sobelEdges(src, w, h) {
  const gxKernel = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const gyKernel = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
  const mag = new Float32Array(w * h);
  let maxMag = 0;

  const getL = (x, y) => {
    const idx = (y * w + x) * 4;
    const r = src[idx];
    const g = src[idx + 1];
    const b = src[idx + 2];
    return 0.299 * r + 0.587 * g + 0.114 * b;
  };

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let gx = 0;
      let gy = 0;
      let k = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const l = getL(x + kx, y + ky);
          gx += l * gxKernel[k];
          gy += l * gyKernel[k];
          k++;
        }
      }
      const m = Math.sqrt(gx * gx + gy * gy);
      const idx = y * w + x;
      mag[idx] = m;
      if (m > maxMag) maxMag = m;
    }
  }

  if (maxMag === 0) return mag;
  const inv = 1 / maxMag;
  for (let i = 0; i < mag.length; i++) {
    mag[i] = mag[i] * inv;
  }
  return mag;
}

// --- Posterize colors (ImageData-level)
function posterizeData(src, w, h, levels) {
  const out = new Uint8ClampedArray(src.length);
  const step = 255 / Math.max(1, levels - 1);
  for (let i = 0; i < src.length; i += 4) {
    out[i] = Math.round(Math.round(src[i] / step) * step);
    out[i + 1] = Math.round(Math.round(src[i + 1] / step) * step);
    out[i + 2] = Math.round(Math.round(src[i + 2] / step) * step);
    out[i + 3] = src[i + 3];
  }
  return out;
}

// --- Anime-style tone mapping + edges + optional eye enhancement
function toneMapAndEdges(orig, smooth, w, h, intensity, landmarks) {
  const edges = sobelEdges(smooth, w, h);
  const levels = 6;
  const poster = posterizeData(smooth, w, h, levels);
  const out = new Uint8ClampedArray(poster.length);

  let eyeBox = null;
  if (landmarks && Array.isArray(landmarks) && landmarks.length > 0) {
    let minX = 1;
    let maxX = 0;
    let minY = 1;
    let maxY = 0;
    for (const pt of landmarks) {
      if (typeof pt.x !== 'number' || typeof pt.y !== 'number') continue;
      minX = Math.min(minX, pt.x);
      maxX = Math.max(maxX, pt.x);
      minY = Math.min(minY, pt.y);
      maxY = Math.max(maxY, pt.y);
    }
    if (maxX > minX && maxY > minY) {
      const hFace = maxY - minY;
      eyeBox = {
        x1: minX,
        x2: maxX,
        y1: minY + hFace * 0.15,
        y2: minY + hFace * 0.55,
      };
    }
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;

      const ro = orig[idx] / 255;
      const go = orig[idx + 1] / 255;
      const bo = orig[idx + 2] / 255;
      const a0 = orig[idx + 3] / 255;
      if (a0 === 0) {
        out[idx + 3] = 0;
        continue;
      }

      let r = poster[idx] / 255;
      let g = poster[idx + 1] / 255;
      let b = poster[idx + 2] / 255;

      const l = 0.299 * r + 0.587 * g + 0.114 * b;

      // Pastel split-toning: warm mids/highs, cooler shadows
      if (l > 0.6) {
        r += 0.12 * intensity;
        g += 0.08 * intensity;
      } else if (l < 0.4) {
        g += 0.04 * intensity;
        b += 0.10 * intensity;
      }

      const mid = 0.6;
      const contrastSoft = 0.18 * intensity;
      r = mid + (r - mid) * (1 - contrastSoft);
      g = mid + (g - mid) * (1 - contrastSoft);
      b = mid + (b - mid) * (1 - contrastSoft);

      // Edge darkening like an outline
      const e = edges[y * w + x];
      const edgeStrength = 0.9 * intensity;
      const edgeMask = Math.min(1, e * 4 * edgeStrength);
      const edgeDark = 1 - edgeMask * 0.9;
      r *= edgeDark;
      g *= edgeDark;
      b *= edgeDark;

      // Eye enhancement: brighten & saturate in approximate eye band
      if (eyeBox) {
        const nx = x / w;
        const ny = y / h;
        if (nx >= eyeBox.x1 && nx <= eyeBox.x2 && ny >= eyeBox.y1 && ny <= eyeBox.y2) {
          const boost = 0.18 * intensity;
          let rr = r;
          let gg = g;
          let bb = b;
          const ll = 0.299 * rr + 0.587 * gg + 0.114 * bb;
          rr = rr + (rr - ll) * 0.3 * intensity;
          gg = gg + (gg - ll) * 0.3 * intensity;
          bb = bb + (bb - ll) * 0.3 * intensity;
          rr += boost;
          gg += boost;
          bb += boost;
          r = rr;
          g = gg;
          b = bb;
        }
      }

      r = Math.min(1, Math.max(0, r));
      g = Math.min(1, Math.max(0, g));
      b = Math.min(1, Math.max(0, b));

      out[idx] = Math.round(r * 255);
      out[idx + 1] = Math.round(g * 255);
      out[idx + 2] = Math.round(b * 255);
      out[idx + 3] = Math.round(a0 * 255);
    }
  }

  return out;
}

// --- Ghibli: full anime-style pipeline + intensity blend
function applyGhibli(ctx, w, h, intensity, options = {}) {
  const t = Math.max(0, Math.min(1, intensity));
  const base = getImageData(ctx, w, h);
  const orig = base.data;

  const smooth = bilateralSmooth(orig, w, h);
  const anime = toneMapAndEdges(orig, smooth, w, h, t, options.landmarks || null);

  const out = cloneImageData(ctx, base);
  const od = out.data;
  for (let i = 0; i < od.length; i += 4) {
    const r0 = orig[i];
    const g0 = orig[i + 1];
    const b0 = orig[i + 2];
    const a0 = orig[i + 3];
    const ra = anime[i];
    const ga = anime[i + 1];
    const ba = anime[i + 2];
    od[i] = Math.round(r0 * (1 - t) + ra * t);
    od[i + 1] = Math.round(g0 * (1 - t) + ga * t);
    od[i + 2] = Math.round(b0 * (1 - t) + ba * t);
    od[i + 3] = a0;
  }

  putImageData(ctx, out);
}

// --- Badge overlay: simple circular badge in corner
function applyBadge(ctx, w, h, intensity) {
  const size = Math.min(w, h) * (0.2 + 0.15 * intensity);
  const x = w - size * 0.8;
  const y = size * 0.5;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, size / 2, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,215,0,0.9)';
  ctx.lineWidth = Math.max(2, size * 0.08);
  ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fill();
  ctx.restore();
}

/**
 * Run Canvas pipeline for the given preset and intensity.
 * @param {HTMLImageElement|HTMLCanvasElement} image - Source image
 * @param {string} presetId - Preset key from constants
 * @param {number} intensity - 0–1
 * @param {{ landmarks?: unknown }} options - Optional landmarks (for future caricature from face)
 * @returns {HTMLCanvasElement} Canvas with result
 */
export function renderCanvas(image, presetId, intensity = 0.5, options = {}) {
  const { ctx, canvas, width: w, height: h } = getCanvasContext(image, true);
  const t = Math.max(0, Math.min(1, intensity));

  if (presetId === 'none' || !presetId) {
    return canvas;
  }

  switch (presetId) {
    case 'vintage':
      applyVintage(ctx, w, h, t);
      break;
    case 'glow':
      applyGlow(ctx, w, h, t);
      break;
    case 'posterize':
      applyPosterize(ctx, w, h, t);
      break;
    case 'caricature':
      applyCaricature(ctx, w, h, t);
      break;
    case 'badge':
      applyBadge(ctx, w, h, t);
      break;
    case 'ghibli':
      applyGhibli(ctx, w, h, t, options);
      break;
    default:
      break;
  }

  return canvas;
}

/**
 * Convert canvas to blob (for export to S3).
 */
export function canvasToBlob(canvas, mimeType = 'image/jpeg', quality = 0.9) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Canvas toBlob failed'))),
      mimeType,
      quality
    );
  });
}
