/* Chess diagram → FEN placement, in the browser.

   The reader is tsoj/Chess_diagram_to_FEN (MIT): three networks exported to
   ONNX -- the board's outline, which way up it is, and the 64 squares -- run
   here by onnxruntime-web, with a deskew in front of them. It was worked out
   in the chess-board project (ocr/reader.py, web-ocr/src/ocr.js), where this
   code was checked against the Python original on 52 diagrams and gave the
   same position on every one. Keep it that way: the arithmetic below is that
   of the libraries the Python leans on -- PIL's transform and its bicubic for
   rotating and warping, torch's antialiased resize for shrinking, OpenCV for
   edges, lines and contours -- because a pixel of difference in the corners
   moves the crop, and the squares are read off the crop.

   Loaded only when a photo is chosen: OpenCV.js and the runtime are 25 MB of
   script and wasm, and the models 51 MB, none of which a reader who pastes a
   FEN should pay for. The models are int8 (the fp16 ones were 142 MB and hardly
   shrink under gzip; int8 read the same position as fp16 on 51 of the 52
   test diagrams and every book photo), gzipped, and cut into 20 MB parts
   (public/ocr/, listed in models.json) because Pages will not serve a file
   over 25 MiB. They are put back together here and unzipped with the
   browser's own DecompressionStream. */

import * as ort from 'onnxruntime-web/wasm';
import cvModule from '@techstark/opencv-js';

// OpenCV.js is typed, but not in a way that matches how it is called here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CV = any;

const PIECES = ['P', 'N', 'B', 'R', 'Q', 'K', 'p', 'n', 'b', 'r', 'q', 'k'];
const ROTATIONS = [0, 90, 180, 270];
const QUAD_SIZE = 512;
const BOARD_SIZE = 256;
const MODELS = { quad: 'quad.int8.onnx', rotation: 'rotation.int8.onnx', position: 'position.int8.onnx' } as const;

/** RGB bytes, as a PIL "RGB" image holds them. */
export interface Rgb { w: number; h: number; px: Uint8Array }

export interface Reading {
  /** The placement field, or null if no board was found. */
  fen: string | null;
  /** The board as it was read: cut out, made square, turned the right way up. */
  board?: Rgb;
}

type Fill = [number, number, number];

function newImage(w: number, h: number, fill: Fill = [0, 0, 0]): Rgb {
  const px = new Uint8Array(w * h * 3);
  if (fill[0] || fill[1] || fill[2]) {
    for (let i = 0; i < w * h; i++) { px[i * 3] = fill[0]; px[i * 3 + 1] = fill[1]; px[i * 3 + 2] = fill[2]; }
  }
  return { w, h, px };
}

function fromRgba(rgba: Uint8ClampedArray, w: number, h: number): Rgb {
  const img = newImage(w, h);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    img.px[j] = rgba[i]; img.px[j + 1] = rgba[i + 1]; img.px[j + 2] = rgba[i + 2];
  }
  return img;
}

/** A photo as RGB bytes, the right way up by its EXIF (as ImageOps.exif_transpose
 *  does) and with no colour profile applied (PIL applies none). Safari takes
 *  only some of createImageBitmap's options, so an <img> is the way round. */
export async function decodeImage(blob: Blob): Promise<Rgb> {
  try {
    const bmp = await createImageBitmap(blob, {
      imageOrientation: 'from-image',
      colorSpaceConversion: 'none',
      premultiplyAlpha: 'none',
    });
    const canvas = document.createElement('canvas');
    canvas.width = bmp.width; canvas.height = bmp.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(bmp, 0, 0);
    bmp.close();
    return fromRgba(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
  } catch {
    const url = URL.createObjectURL(blob);
    try {
      const el = new Image();
      el.src = url;
      await el.decode();
      const canvas = document.createElement('canvas');
      canvas.width = el.naturalWidth; canvas.height = el.naturalHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(el, 0, 0);
      return fromRgba(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/** An image to show, as a blob: URL (the caller revokes it). */
export async function toObjectUrl(img: Rgb): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = img.w; canvas.height = img.h;
  const data = new ImageData(img.w, img.h);
  for (let i = 0, j = 0; j < img.px.length; i += 4, j += 3) {
    data.data[i] = img.px[j]; data.data[i + 1] = img.px[j + 1]; data.data[i + 2] = img.px[j + 2]; data.data[i + 3] = 255;
  }
  canvas.getContext('2d')!.putImageData(data, 0, 0);
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error('toBlob'))), 'image/jpeg', 0.9));
  return URL.createObjectURL(blob);
}

/** PIL's Image.transform with BICUBIC: map(x + 0.5, y + 0.5) gives the source
 *  point for each output pixel; outside the source the output keeps `fill`. */
function pilTransform(src: Rgb, outW: number, outH: number,
  map: (x: number, y: number, pt: number[]) => void, fill: Fill = [0, 0, 0]): Rgb {
  const out = newImage(outW, outH, fill);
  const { w, h, px } = src;
  const pt = [0, 0];
  const col = new Float64Array(4);
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      map(x + 0.5, y + 0.5, pt);
      let xin = pt[0], yin = pt[1];
      if (xin < 0 || yin < 0 || Math.floor(xin) >= w || Math.floor(yin) >= h) continue;
      xin -= 0.5; yin -= 0.5;
      const x0 = Math.floor(xin), y0 = Math.floor(yin);
      const dx = xin - x0, dy = yin - y0;
      const o = (y * outW + x) * 3;
      for (let b = 0; b < 3; b++) {
        for (let k = 0; k < 4; k++) {
          const yy = Math.min(Math.max(y0 - 1 + k, 0), h - 1) * w;
          const v1 = px[(yy + Math.min(Math.max(x0 - 1, 0), w - 1)) * 3 + b];
          const v2 = px[(yy + Math.min(Math.max(x0, 0), w - 1)) * 3 + b];
          const v3 = px[(yy + Math.min(Math.max(x0 + 1, 0), w - 1)) * 3 + b];
          const v4 = px[(yy + Math.min(Math.max(x0 + 2, 0), w - 1)) * 3 + b];
          col[k] = cubic(v1, v2, v3, v4, dx);
        }
        const v = cubic(col[0], col[1], col[2], col[3], dy);
        out.px[o + b] = v <= 0 ? 0 : v >= 255 ? 255 : Math.trunc(v);
      }
    }
  }
  return out;
}

// Pillow's Geometry.c BICUBIC
function cubic(v1: number, v2: number, v3: number, v4: number, d: number): number {
  const p1 = v2, p2 = -v1 + v3, p3 = 2 * (v1 - v2) + v3 - v4, p4 = -v1 + v2 - v3 + v4;
  return p1 + d * (p2 + d * (p3 + d * p4));
}

/** PIL's img.rotate(angle, expand=True, resample=BICUBIC, fillcolor=fill). */
function rotateExpand(img: Rgb, angle: number, fill: Fill): Rgb {
  const rad = -angle * Math.PI / 180;
  const r15 = (v: number) => Math.round(v * 1e15) / 1e15;
  const m = [r15(Math.cos(rad)), r15(Math.sin(rad)), 0, r15(-Math.sin(rad)), r15(Math.cos(rad)), 0];
  const tf = (x: number, y: number) => [m[0] * x + m[1] * y + m[2], m[3] * x + m[4] * y + m[5]];
  const { w, h } = img;
  [m[2], m[5]] = tf(-w / 2, -h / 2);
  m[2] += w / 2; m[5] += h / 2;
  const xs: number[] = [], ys: number[] = [];
  for (const [x, y] of [[0, 0], [w, 0], [w, h], [0, h]]) { const [a, b] = tf(x, y); xs.push(a); ys.push(b); }
  const nw = Math.ceil(Math.max(...xs)) - Math.floor(Math.min(...xs));
  const nh = Math.ceil(Math.max(...ys)) - Math.floor(Math.min(...ys));
  [m[2], m[5]] = tf(-(nw - w) / 2, -(nh - h) / 2);
  return pilTransform(img, nw, nh, (x, y, pt) => { pt[0] = m[0] * x + m[1] * y + m[2]; pt[1] = m[3] * x + m[4] * y + m[5]; }, fill);
}

/** A quarter turn is a transpose in PIL (rotate(-deg, expand=True) for deg in 0/90/180/270). */
function rotateQuarter(img: Rgb, deg: number): Rgb {
  const { w, h, px } = img;
  const a = ((-deg % 360) + 360) % 360;
  if (a === 0) return img;
  const out = a === 180 ? newImage(w, h) : newImage(h, w);
  for (let yd = 0; yd < out.h; yd++) {
    for (let xd = 0; xd < out.w; xd++) {
      let xs: number, ys: number;
      if (a === 90) { xs = w - 1 - yd; ys = xd; }          // ROTATE_90 (counter-clockwise)
      else if (a === 270) { xs = yd; ys = h - 1 - xd; }    // ROTATE_270 (clockwise)
      else { xs = w - 1 - xd; ys = h - 1 - yd; }           // ROTATE_180
      const s = (ys * w + xs) * 3, o = (yd * out.w + xd) * 3;
      out.px[o] = px[s]; out.px[o + 1] = px[s + 1]; out.px[o + 2] = px[s + 2];
    }
  }
  return out;
}

function pad(img: Rgb, px: number, py: number): Rgb {
  const x = Math.trunc(px), y = Math.trunc(py);
  const out = newImage(img.w + 2 * x, img.h + 2 * y, [255, 255, 255]);
  for (let r = 0; r < img.h; r++) out.px.set(img.px.subarray(r * img.w * 3, (r + 1) * img.w * 3), ((r + y) * out.w + x) * 3);
  return out;
}

function crop(img: Rgb, x1: number, y1: number, x2: number, y2: number): Rgb {
  const out = newImage(x2 - x1, y2 - y1);
  for (let r = 0; r < out.h; r++) out.px.set(img.px.subarray(((r + y1) * img.w + x1) * 3, ((r + y1) * img.w + x2) * 3), r * out.w * 3);
  return out;
}

/** Per-channel median of the whole image, as int(np.median(...)) gives it. */
function medianColour(img: Rgb): Fill {
  const n = img.w * img.h;
  const channel = (b: number) => {
    const hist = new Uint32Array(256);
    for (let i = b; i < img.px.length; i += 3) hist[img.px[i]]++;
    const at = (k: number) => { let c = 0; for (let v = 0; v < 256; v++) { c += hist[v]; if (c > k) return v; } return 255; };
    return n % 2 ? at((n - 1) / 2) : Math.trunc((at(n / 2 - 1) + at(n / 2)) / 2);
  };
  return [channel(0), channel(1), channel(2)];
}

/* ---------- tensors: Float32Array [3, H, W] ---------- */

function toTensor(img: Rgb): Float32Array {
  const n = img.w * img.h;
  const t = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    t[i] = img.px[i * 3] / 255; t[n + i] = img.px[i * 3 + 1] / 255; t[2 * n + i] = img.px[i * 3 + 2] / 255;
  }
  return t;
}

interface Filter { size: number; f: (x: number) => number }

const FILTERS: Record<'bilinear' | 'bicubic', Filter> = {
  bilinear: { size: 2, f: x => { x = Math.abs(x); return x < 1 ? 1 - x : 0; } },
  bicubic: {
    size: 4,
    f: x => {
      const a = -0.5; x = Math.abs(x);
      if (x < 1) return ((a + 2) * x - (a + 3)) * x * x + 1;
      if (x < 2) return (((x - 5) * x + 8) * x - 4) * a;
      return 0;
    },
  },
};

/** torch's antialiased resize weights for one axis (the same as PIL's). */
function axisWeights(inSize: number, outSize: number, filter: Filter) {
  const scale = inSize / outSize;
  const support = scale >= 1 ? filter.size * 0.5 * scale : filter.size * 0.5;
  const invscale = scale >= 1 ? 1 / scale : 1;
  const rows: { xmin: number; w: Float64Array }[] = [];
  for (let i = 0; i < outSize; i++) {
    const center = scale * (i + 0.5);
    const xmin = Math.max(Math.trunc(center - support + 0.5), 0);
    const xsize = Math.min(Math.trunc(center + support + 0.5), inSize) - xmin;
    const w = new Float64Array(xsize);
    let total = 0;
    for (let j = 0; j < xsize; j++) { w[j] = filter.f((j + xmin - center + 0.5) * invscale); total += w[j]; }
    if (total !== 0) for (let j = 0; j < xsize; j++) w[j] /= total;
    rows.push({ xmin, w });
  }
  return rows;
}

function resize(t: Float32Array, h: number, w: number, outH: number, outW: number, kind: keyof typeof FILTERS): Float32Array {
  const filter = FILTERS[kind];
  const wx = axisWeights(w, outW, filter), wy = axisWeights(h, outH, filter);
  const out = new Float32Array(3 * outH * outW);
  const tmp = new Float32Array(h * outW);
  for (let c = 0; c < 3; c++) {
    const base = c * h * w;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < outW; x++) {
        const { xmin, w: ws } = wx[x];
        let s = 0;
        for (let j = 0; j < ws.length; j++) s += t[base + y * w + xmin + j] * ws[j];
        tmp[y * outW + x] = s;
      }
    }
    const ob = c * outH * outW;
    for (let y = 0; y < outH; y++) {
      const { xmin, w: ws } = wy[y];
      for (let x = 0; x < outW; x++) {
        let s = 0;
        for (let j = 0; j < ws.length; j++) s += tmp[(xmin + j) * outW + x] * ws[j];
        out[ob + y * outW + x] = s;
      }
    }
  }
  return out;
}

function minMax(t: Float32Array, subtractMean: boolean): Float32Array {
  let mn = Infinity, mx = -Infinity;
  for (const v of t) { if (v < mn) mn = v; if (v > mx) mx = v; }
  const out = new Float32Array(t.length);
  if (!(mn < mx)) return out;
  let sum = 0;
  for (let i = 0; i < t.length; i++) { out[i] = (t[i] - mn) / (mx - mn); sum += out[i]; }
  if (subtractMean) { const mean = Math.fround(sum / t.length); for (let i = 0; i < t.length; i++) out[i] -= mean; }
  return out;
}

const argmax = (a: ArrayLike<number>, from: number, n: number) => {
  let best = 0;
  for (let i = 1; i < n; i++) if (a[from + i] > a[from + best]) best = i;
  return best;
};

/* ---------- the reader ---------- */

type Sessions = Record<'quad' | 'rotation' | 'position', ort.InferenceSession>;

export class DiagramReader {
  /** Load OpenCV and the three models. `onProgress` hears the bytes as they
   *  come (the zipped bytes -- what is actually fetched). */
  static async create(base: string, onProgress?: (got: number, total: number) => void): Promise<DiagramReader> {
    const t0 = performance.now();
    let cv: CV = cvModule;
    if (cv instanceof Promise) cv = await cv;
    else if (!cv.Mat) await new Promise<void>(res => { cv.onRuntimeInitialized = () => res(); });
    const timings = { opencv: performance.now() - t0, fetch: 0, unzip: 0, sessions: 0 };

    const manifest: Record<string, { bytes: number; gzipBytes: number; parts: string[] }> =
      await (await fetch(`${base}/models.json`)).json();
    const names = Object.values(MODELS);
    const total = names.reduce((a, m) => a + manifest[m].gzipBytes, 0);
    let got = 0;
    const load = async (name: string) => {
      const { gzipBytes, parts } = manifest[name];
      let t = performance.now();
      const packed = new Uint8Array(gzipBytes);
      let o = 0;
      for (const part of parts) {
        const res = await fetch(`${base}/${part}`);
        if (!res.ok || !res.body) throw new Error(`${part}: ${res.status}`);
        const reader = res.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          packed.set(value, o); o += value.length; got += value.length;
          onProgress?.(got, total);
        }
      }
      timings.fetch += performance.now() - t; t = performance.now();
      const model = new Uint8Array(await new Response(
        new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
      timings.unzip += performance.now() - t; t = performance.now();
      const session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
      timings.sessions += performance.now() - t;
      return session;
    };
    const quad = await load(MODELS.quad);
    const rotation = await load(MODELS.rotation);
    const position = await load(MODELS.position);
    return new DiagramReader(cv, { quad, rotation, position }, timings);
  }

  /** Where the first load's time went, in ms: starting OpenCV, fetching the
   *  models, unzipping them, and making the sessions. */
  readonly timings: Record<'opencv' | 'fetch' | 'unzip' | 'sessions', number>;
  private cv: CV;
  private s: Sessions;

  private constructor(cv: CV, sessions: Sessions, timings: DiagramReader['timings']) {
    this.cv = cv; this.s = sessions; this.timings = timings;
  }

  private async run(session: ort.InferenceSession, tensor: Float32Array, size: number) {
    const out = await session.run({ input: new ort.Tensor('float32', tensor, [1, 3, size, size]) });
    return out.output.data as Float32Array;
  }

  /** The photo's tilt in degrees, counter-clockwise positive -- reader.skew_angle. */
  private skewAngle(img: Rgb): number {
    const cv = this.cv;
    const gray = new cv.Mat(img.h, img.w, cv.CV_8UC1);
    for (let i = 0; i < img.w * img.h; i++) {
      gray.data[i] = (img.px[i * 3] * 19595 + img.px[i * 3 + 1] * 38470 + img.px[i * 3 + 2] * 7471 + 0x8000) >> 16;
    }
    const scale = 1000 / Math.max(img.h, img.w);
    const small = new cv.Mat(), edges = new cv.Mat(), lines = new cv.Mat();
    try {
      cv.resize(gray, small, new cv.Size(0, 0), scale, scale, cv.INTER_AREA);
      cv.Canny(small, edges, 50, 150);
      cv.HoughLinesP(edges, lines, 1, Math.PI / 720, 120, Math.trunc(0.25 * Math.max(small.rows, small.cols)), 10);
      const angles: number[] = [], weights: number[] = [];
      for (let i = 0; i < lines.rows; i++) {
        const [x1, y1, x2, y2] = lines.data32S.subarray(i * 4, i * 4 + 4);
        let a = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
        a = (((a + 45) % 90) + 90) % 90 - 45;
        if (Math.abs(a) < 30) { angles.push(a); weights.push(Math.hypot(x2 - x1, y2 - y1)); }
      }
      if (!angles.length) return 0;
      const order = angles.map((_, i) => i).sort((i, j) => angles[i] - angles[j]);
      const cum: number[] = [];
      let c = 0;
      for (const i of order) { c += weights[i]; cum.push(c); }
      const k = cum.findIndex(v => v >= c / 2);
      return -angles[order[k]];
    } finally {
      gray.delete(); small.delete(); edges.delete(); lines.delete();
    }
  }

  /** Four corners from the board mask -- mask_to_corners, in its own corner order. */
  private maskToCorners(logits: Float32Array): number[][] | null {
    const cv = this.cv;
    const mask = new cv.Mat(QUAD_SIZE, QUAD_SIZE, cv.CV_8UC1);
    for (let i = 0; i < QUAD_SIZE * QUAD_SIZE; i++) mask.data[i] = logits[i] > 0 ? 1 : 0;
    const contours = new cv.MatVector(), hier = new cv.Mat();
    try {
      cv.findContours(mask, contours, hier, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
      if (contours.size() === 0) return null;
      let largest = contours.get(0), bestArea = cv.contourArea(largest);
      for (let i = 1; i < contours.size(); i++) {
        const c = contours.get(i), a = cv.contourArea(c);
        if (a > bestArea) { largest.delete(); largest = c; bestArea = a; } else c.delete();
      }
      const peri = cv.arcLength(largest, true);
      let lo = 0, hi = 0.2;
      let pts: number[][] | null = null;
      const approx = new cv.Mat();
      for (let i = 0; i < 20; i++) {
        cv.approxPolyDP(largest, approx, ((lo + hi) / 2) * peri, true);
        if (approx.rows === 4) { pts = Array.from({ length: 4 }, (_, j) => [approx.data32S[j * 2], approx.data32S[j * 2 + 1]]); break; }
        if (approx.rows > 4) lo = (lo + hi) / 2; else hi = (lo + hi) / 2;
      }
      approx.delete();
      if (!pts) pts = cv.RotatedRect.points(cv.minAreaRect(largest)).map((p: { x: number; y: number }) => [Math.fround(p.x), Math.fround(p.y)]);
      largest.delete();
      const s = pts!.map(p => p[0] + p[1]), d = pts!.map(p => p[1] - p[0]);
      const iMax = (a: number[]) => a.indexOf(Math.max(...a)), iMin = (a: number[]) => a.indexOf(Math.min(...a));
      return [pts![iMax(d)], pts![iMin(s)], pts![iMin(d)], pts![iMax(s)]];
    } finally {
      mask.delete(); contours.delete(); hier.delete();
    }
  }

  /** Board cut out and made square -- warp_to_board. */
  private async warpToBoard(img: Rgb, maxTries = 10): Promise<{ image: Rgb; size: number } | null> {
    img = pad(img, img.w * 0.05, img.h * 0.05);
    for (let i = 0; i < maxTries; i++) {
      if (img.w === 0 || img.h === 0) return null;
      const t = minMax(resize(toTensor(img), img.h, img.w, QUAD_SIZE, QUAD_SIZE, 'bilinear'), false);
      const corners = this.maskToCorners(await this.run(this.s.quad, t, QUAD_SIZE));
      if (!corners) return null;
      const fx = Math.fround(img.w / QUAD_SIZE), fy = Math.fround(img.h / QUAD_SIZE);
      const c = corners.map(([x, y]) => [Math.fround(x * fx), Math.fround(y * fy)]);
      const xs = c.map(p => p[0]), ys = c.map(p => p[1]);
      const x1 = Math.min(...xs), x2 = Math.max(...xs), y1 = Math.min(...ys), y2 = Math.max(...ys);
      const qw = x2 - x1, qh = y2 - y1;
      if (qw / img.w > 0.7 && qh / img.h > 0.7) {
        let side = 0;
        for (let j = 0; j < 4; j++) side += Math.fround(Math.hypot(c[(j + 1) % 4][0] - c[j][0], c[(j + 1) % 4][1] - c[j][1]));
        const size = Math.max(32, Math.trunc(side / 4));
        return { image: perspectiveWarp(img, c, size), size };
      }
      const ax = qw * 0.1, ay = qh * 0.1;
      img = crop(img, Math.trunc(Math.max(x1 - ax, 0)), Math.trunc(Math.max(y1 - ay, 0)),
        Math.trunc(Math.min(x2 + ax, img.w)), Math.trunc(Math.min(y2 + ay, img.h)));
    }
    return null;
  }

  /** The diagram's position. White is taken to be at the foot, as a problem
   *  diagram always has it (the Python original's guess at which side is
   *  down is left out: when it guessed wrong it turned a right reading round). */
  async read(photo: Rgb): Promise<Reading> {
    let img = photo;
    const skew = this.skewAngle(img);
    if (Math.abs(skew) > 1.0) img = rotateExpand(img, -skew, medianColour(img));
    const warp = await this.warpToBoard(img);
    if (!warp) return { fen: null };
    const rt = minMax(resize(toTensor(warp.image), warp.size, warp.size, BOARD_SIZE, BOARD_SIZE, 'bicubic'), true);
    const rot = argmax(await this.run(this.s.rotation, rt, BOARD_SIZE), 0, 4);
    const board = rotateQuarter(warp.image, ROTATIONS[rot]);
    const pt = minMax(resize(toTensor(board), board.h, board.w, BOARD_SIZE, BOARD_SIZE, 'bicubic'), true);
    const out = await this.run(this.s.position, pt, BOARD_SIZE);
    const clamped = out.map(v => Math.min(Math.max(v, 0), 1));
    const grid = Array.from({ length: 64 }, (_, sq) => PIECES[argmax(clamped, sq * 13, 13)] ?? null);
    return { fen: grid.some(Boolean) ? toPlacement(grid) : null, board };
  }
}

/** The square board from the quad (corners in mask_to_corners order) -- _perspective_warp. */
function perspectiveWarp(img: Rgb, corners: number[][], size: number): Rgb {
  const dst = [[0, 0], [size, 0], [size, size], [0, size]];
  const h = homography(dst, corners);
  return pilTransform(img, size, size, (x, y, pt) => {
    const d = h[6] * x + h[7] * y + 1;
    pt[0] = (h[0] * x + h[1] * y + h[2]) / d;
    pt[1] = (h[3] * x + h[4] * y + h[5]) / d;
  });
}

/** 8 coefficients of the projective map taking each `from` point to its `to` point. */
function homography(from: number[][], to: number[][]): number[] {
  const A: number[][] = [], b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [u, v] = from[i], [x, y] = to[i];
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]); b.push(x);
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y]); b.push(y);
  }
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  return b.map((v, i) => v / A[i][i]);
}

function toPlacement(grid: (string | null)[]): string {
  const rows: string[] = [];
  for (let r = 0; r < 8; r++) {
    let row = '', run = 0;
    for (let c = 0; c < 8; c++) {
      const p = grid[r * 8 + c];
      if (!p) { run++; continue; }
      if (run) { row += run; run = 0; }
      row += p;
    }
    rows.push(run ? row + run : row);
  }
  return rows.join('/');
}
