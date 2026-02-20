/**
 * WebGL water overlay renderer.
 *
 * Renders voronoi + caustics + ripple pattern for the entire viewport on the GPU.
 * The water/land masking and shoreline feathering are handled by the caller via
 * 2D-canvas compositing, avoiding WebGL texture-sampling issues entirely.
 */

import { TILE_SIZE } from '../../config/gameConfig';

const VERTEX_SHADER = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position;
  gl_Position = vec4(a_position * 2.0 - 1.0, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform vec2  u_camOrigin;   // world-pixel top-left of view
uniform vec2  u_viewSize;    // (canvasWidth, canvasHeight) in world pixels
uniform float u_time;        // performance.now() in ms
uniform float u_intensity;   // 0-1 overlay strength

const float TWO_PI = 6.283185307179586;

const float VS  = 0.013;
const float VA  = 0.55;
const float VW  = 0.35;
const float VE  = 0.08;
const float VCS = 0.35;

const float CA1X = 0.031; const float CA1Y = 0.013; const float CA1S = 1.40;
const float CA2X = 0.017; const float CA2Y = 0.023; const float CA2S = 1.10;

const float DFX = 0.018; const float DSX = 1.50; const float DAX = 3.0;
const float DFY = 0.014; const float DSY = 1.20; const float DAY = 2.5;

const float RFX = 0.042; const float RFY = 0.016; const float RS = 2.00;

const float WCR = 0.55; const float WCA = 0.28; const float WRI = 0.16; const float WCS = 0.06;

const float BR = 225.0; const float RR = 30.0;
const float BG = 240.0; const float RG = 15.0;
const float OB = 255.0;
const float BA = 4.0;   const float RA = 85.0;

vec2 hash2(vec2 p) {
  p = fract(p * 0.1031);
  return fract(sin(vec2(
    dot(p, vec2(127.1, 311.7)),
    dot(p, vec2(269.5, 183.3))
  )) * 43758.5453);
}

float sst(float e0, float e1, float x) {
  float t = clamp((x - e0) / (e1 - e0), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

void main() {
  // Map screen UV to world pixel position
  // v_uv (0,0)=bottom-left, (1,1)=top-right in GL
  // Screen top = smallest worldY = camOrigin.y
  vec2 worldPos = u_camOrigin + vec2(v_uv.x, 1.0 - v_uv.y) * u_viewSize;

  float t    = u_time * 0.001;
  float tA   = t * VA;
  float tCa1 = t * CA1S;  float tCa2 = t * CA2S;
  float tDX  = t * DSX;   float tDY  = t * DSY;
  float tR   = t * RS;

  // UV distortion
  vec2 dPos = worldPos + vec2(sin(worldPos.y*DFX+tDX)*DAX, sin(worldPos.x*DFY+tDY)*DAY);

  // Voronoi (4-cell)
  vec2 sx = dPos * VS;
  vec2 ij = floor(sx);
  vec2 f  = fract(sx);

  int i0 = f.x < 0.5 ? -1 : 0;
  int j0 = f.y < 0.5 ? -1 : 0;

  float d1sq = 8.0, d2sq = 8.0;
  for (int cj = 0; cj < 2; cj++) {
    for (int ci = 0; ci < 2; ci++) {
      float ncx = ij.x + float(i0 + ci);
      float ncy = ij.y + float(j0 + cj);
      vec2 hv = hash2(vec2(ncx, ncy));
      float drift = sin(tA + hv.x * TWO_PI) * VW;
      float ox = float(i0+ci) + 0.5 + (hv.x-0.5)*0.3 + drift;
      float oy = float(j0+cj) + 0.5 + (hv.y-0.5)*0.3 + drift*0.73;
      float dsq = dot(vec2(ox,oy)-f, vec2(ox,oy)-f);
      if (dsq < d1sq) { d2sq = d1sq; d1sq = dsq; }
      else if (dsq < d2sq) { d2sq = dsq; }
    }
  }

  float crest     = 1.0 - sst(0.0, VE,  d2sq - d1sq);
  float cellShade = sst(0.0, VCS, d1sq);

  // Caustics (sine interference)
  float caustic = sst(0.3, 0.7,
    sin(worldPos.x*CA1X + worldPos.y*CA1Y + tCa1) *
    sin(worldPos.x*CA2X - worldPos.y*CA2Y + tCa2) + 0.5);

  // Ripple
  float ripple = sst(0.83, 1.0, sin(worldPos.x*RFX + worldPos.y*RFY + tR)*0.5 + 0.5);

  // Combine: water color from caustics, ripple, cell shade (crest excluded for RGB)
  float waterBright = caustic*WCA + ripple*WRI + cellShade*WCS;
  float bright = crest*WCR + waterBright;
  float a = (BA + bright * RA) * u_intensity / 255.0;

  // Water base color (caustics/ripple only, no crest)
  vec3 waterColor = vec3(
    (BR + waterBright * RR) / 255.0,
    (BG + waterBright * RG) / 255.0,
    OB / 255.0
  );
  // Blend toward dark blue at Voronoi edges (crest high)
  vec3 rgb = mix(waterColor, EDGE_COLOR, crest * 0.9);

  fragColor = vec4(rgb, a);
}
`;

// ============================================================================

export interface WaterOverlayWebGLContext {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  buffer: WebGLBuffer;
  uLoc: Record<string, WebGLUniformLocation>;
  aLoc: number;
}

let ctx: WaterOverlayWebGLContext | null = null;
let onContextLostCb: (() => void) | null = null;

export function setWaterOverlayContextLostCallback(cb: (() => void) | null): void {
  onContextLostCb = cb;
}

function createProgram(gl: WebGL2RenderingContext): WebGLProgram | null {
  const vs = gl.createShader(gl.VERTEX_SHADER)!;
  gl.shaderSource(vs, VERTEX_SHADER);
  gl.compileShader(vs);
  if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
    console.warn('[WaterOverlay] VS compile:', gl.getShaderInfoLog(vs));
    gl.deleteShader(vs);
    return null;
  }

  const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
  gl.shaderSource(fs, FRAGMENT_SHADER);
  gl.compileShader(fs);
  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
    console.warn('[WaterOverlay] FS compile:', gl.getShaderInfoLog(fs));
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return null;
  }

  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn('[WaterOverlay] Link:', gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

export function initWaterOverlayWebGL(): WaterOverlayWebGLContext | null {
  if (ctx) return ctx;

  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    premultipliedAlpha: false,
    preserveDrawingBuffer: true,
  }) as WebGL2RenderingContext | null;
  if (!gl) return null;

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    ctx = null;
    onContextLostCb?.();
  }, false);

  const program = createProgram(gl);
  if (!program) return null;

  const buffer = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0,0,1,0,0,1,0,1,1,0,1,1]), gl.STATIC_DRAW);

  const uNames = ['u_camOrigin','u_viewSize','u_time','u_intensity'];
  const uLoc: Record<string, WebGLUniformLocation> = {};
  for (const name of uNames) {
    const loc = gl.getUniformLocation(program, name);
    if (!loc) { console.warn('[WaterOverlay] Missing uniform:', name); return null; }
    uLoc[name] = loc;
  }
  const aLoc = gl.getAttribLocation(program, 'a_position');

  ctx = { canvas, gl, program, buffer, uLoc, aLoc };
  return ctx;
}

/** Render at 1/4 resolution to reduce GPU->CPU readback cost (drawImage on WebGL canvas) */
const PX = 4;

/**
 * Renders the voronoi + caustics + ripple pattern for the entire viewport.
 * The output canvas has voronoi everywhere — caller must mask to water tiles.
 */
export function renderWaterOverlayWebGL(
  wctx: WaterOverlayWebGLContext,
  camX: number,
  camY: number,
  cw: number,
  ch: number,
  tMs: number,
  intensity: number,
): boolean {
  const { gl, program, buffer, uLoc, aLoc } = wctx;
  const bw = Math.ceil(cw / PX);
  const bh = Math.ceil(ch / PX);
  if (bw <= 0 || bh <= 0) return false;
  if (gl.isContextLost()) return false;

  if (wctx.canvas.width !== bw || wctx.canvas.height !== bh) {
    wctx.canvas.width = bw;
    wctx.canvas.height = bh;
  }
  gl.viewport(0, 0, bw, bh);
  gl.useProgram(program);

  gl.uniform2f(uLoc.u_camOrigin, camX, camY);
  gl.uniform2f(uLoc.u_viewSize, cw, ch);
  gl.uniform1f(uLoc.u_time, tMs);
  gl.uniform1f(uLoc.u_intensity, intensity);

  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.enableVertexAttribArray(aLoc);
  gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0);

  gl.disable(gl.BLEND);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  return true;
}

export function clearWaterOverlayWebGL(): void {
  if (ctx) {
    const { gl, program, buffer } = ctx;
    gl.deleteProgram(program);
    gl.deleteBuffer(buffer);
    ctx = null;
  }
}

export function isWebGLWaterOverlayAvailable(): boolean {
  return initWaterOverlayWebGL() !== null;
}
