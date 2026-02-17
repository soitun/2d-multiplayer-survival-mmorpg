/**
 * FPS Profiler - self-contained overlay for frame timing analysis.
 * Keeps all profiler logic out of GameCanvas. Uses refs-like internal state.
 */

import * as profilerRecording from '../profilerRecording';

export interface ProfilerTimings {
  t0: number;
  t1: number;
  t1a: number;
  t1b: number;
  t1c: number;
  t2: number;
  t3: number;
  t3a: number;
  t4: number;
  t5: number;
}

const DISPLAY_UPDATE_INTERVAL_MS = 200;
const MAX_FRAME_TIMES = 50;
const PANEL_W = 320;
const PANEL_H = 268;
const HEADER_H = 28;
const TRACKER_RIGHT = 15;
const TRACKER_WIDTH = 250;
const GAP_FROM_TRACKER = 12;
const BUTTON_W = 72;
const BUTTON_H = 20;
const BUTTON_RIGHT_PAD = 8;
const BUTTON_TOP_PAD = 4;

/** Returns performance.now() if enabled, else 0. Use at each timing marker. */
export function mark(enabled: boolean): number {
  return enabled ? performance.now() : 0;
}

/** Record button bounds for hit testing. Top-right of header. Returns null if panel would be off-screen. */
export function getRecordButtonBounds(canvasWidth: number): { x: number; y: number; w: number; h: number } | null {
  const panelX = canvasWidth - TRACKER_RIGHT - TRACKER_WIDTH - GAP_FROM_TRACKER - PANEL_W;
  if (panelX < 0) return null;
  const btnX = panelX + PANEL_W - BUTTON_RIGHT_PAD - BUTTON_W;
  const btnY = 15 + BUTTON_TOP_PAD;
  return { x: btnX, y: btnY, w: BUTTON_W, h: BUTTON_H };
}

export class FpsProfiler {
  private frameTimes: number[] = [];
  private lastDisplayUpdate = 0;
  private displayFps = 0;
  private displayFrameTime = '0';
  private displayEntityCount = 0;
  private phaseWorld = 0;
  private phaseWater = 0;
  private phaseEntities = 0;
  private phaseLights = 0;
  private phaseOther = 0;
  private phaseWaterSeaStacks = 0;
  private phaseWaterCaustics = 0;
  private phaseWaterSwimming = 0;
  private phaseWaterOverlay = 0;
  private phaseEntitiesYSorted = 0;
  private phaseEntitiesShadows = 0;
  private phaseEntitiesOverlays = 0;

  update(timings: ProfilerTimings, frameTime: number, entityCount: number): void {
    const { t0, t1, t1a, t1b, t1c, t2, t3, t3a, t4, t5 } = timings;

    this.frameTimes.push(frameTime);
    if (this.frameTimes.length > MAX_FRAME_TIMES) this.frameTimes.shift();

    const now = performance.now();
    if (now - this.lastDisplayUpdate >= DISPLAY_UPDATE_INTERVAL_MS) {
      this.lastDisplayUpdate = now;
      const avg = this.frameTimes.length > 0
        ? this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length
        : 0;
      this.displayFps = avg > 0 ? Math.round(1000 / avg) : 0;
      this.displayFrameTime = avg.toFixed(2);
      this.displayEntityCount = entityCount;

      if (t0 > 0 && t5 > 0) {
        this.phaseWorld = t1 - t0;
        this.phaseWater = t2 - t1;
        this.phaseEntities = t4 - t2;
        this.phaseLights = t5 - t4;
        this.phaseOther = Math.max(0, frameTime - (t5 - t0));
        if (t1a > 0 && t3a > 0) {
          this.phaseWaterSeaStacks = t1a - t1;
          this.phaseWaterCaustics = t1b - t1a;
          this.phaseWaterSwimming = t1c - t1b;
          this.phaseWaterOverlay = t2 - t1c;
          this.phaseEntitiesYSorted = t3 - t2;
          this.phaseEntitiesShadows = t3a - t3;
          this.phaseEntitiesOverlays = t4 - t3a;
        }
      }
    }
  }

  recordIfActive(timings: ProfilerTimings, frameTime: number, entityCount: number): void {
    const { t0, t1, t1a, t1b, t1c, t2, t3, t3a, t4, t5 } = timings;
    if (!profilerRecording.isProfilerRecording() || t0 <= 0 || t5 <= 0) return;

    profilerRecording.addSample({
      frameTime,
      entityCount,
      phaseWorld: t1 - t0,
      phaseWater: t2 - t1,
      phaseWaterSeaStacks: t1a > 0 ? t1a - t1 : 0,
      phaseWaterCaustics: t1b > 0 ? t1b - t1a : 0,
      phaseWaterSwimming: t1c > 0 ? t1c - t1b : 0,
      phaseWaterOverlay: t2 - (t1c > 0 ? t1c : t1),
      phaseEntities: t4 - t2,
      phaseEntitiesYSorted: t3 > 0 ? t3 - t2 : 0,
      phaseEntitiesShadows: t3a > 0 ? t3a - t3 : 0,
      phaseEntitiesOverlays: t4 - (t3a > 0 ? t3a : t3),
      phaseLights: t5 - t4,
      phaseOther: Math.max(0, frameTime - (t5 - t0)),
    });
  }

  render(
    ctx: CanvasRenderingContext2D,
    canvasWidth: number,
    isRecording: boolean
  ): void {
    const panelX = canvasWidth - TRACKER_RIGHT - TRACKER_WIDTH - GAP_FROM_TRACKER - PANEL_W;
    const panelY = 15;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    if (typeof ctx.roundRect === 'function') {
      ctx.beginPath();
      ctx.roundRect(panelX, panelY, PANEL_W, PANEL_H, 8);
      ctx.fillStyle = 'rgba(30, 15, 50, 0.95)';
      ctx.fill();
      ctx.strokeStyle = '#00aaff';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(30, 15, 50, 0.95)';
      ctx.fillRect(panelX, panelY, PANEL_W, PANEL_H);
      ctx.strokeStyle = '#00aaff';
      ctx.lineWidth = 2;
      ctx.strokeRect(panelX, panelY, PANEL_W, PANEL_H);
    }

    ctx.fillStyle = 'rgba(0, 170, 255, 0.25)';
    ctx.fillRect(panelX + 2, panelY + 2, PANEL_W - 4, HEADER_H - 2);
    ctx.strokeStyle = 'rgba(0, 170, 255, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(panelX + 2, panelY + HEADER_H);
    ctx.lineTo(panelX + PANEL_W - 2, panelY + HEADER_H);
    ctx.stroke();

    ctx.font = '14px "Press Start 2P", monospace';
    ctx.fillStyle = '#00ffff';
    ctx.fillText('FPS PROFILER', panelX + 14, panelY + 20);

    // Red Record / Stop button in top-right of header
    const btnBounds = getRecordButtonBounds(canvasWidth);
    if (btnBounds) {
      const { x: bx, y: by, w: bw, h: bh } = btnBounds;
      ctx.fillStyle = isRecording ? 'rgba(255, 60, 60, 0.7)' : 'rgba(255, 80, 80, 0.5)';
      ctx.strokeStyle = '#ff4040';
      ctx.lineWidth = 1;
      if (typeof ctx.roundRect === 'function') {
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, bh, 4);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillRect(bx, by, bw, bh);
        ctx.strokeRect(bx, by, bw, bh);
      }
      ctx.fillStyle = '#ffffff';
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(isRecording ? 'STOP' : 'REC', bx + bw / 2, by + bh / 2);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }

    ctx.font = '12px "Press Start 2P", monospace';
    ctx.fillStyle = '#00ffff';
    ctx.fillText(`FPS: ${this.displayFps}`, panelX + 14, panelY + HEADER_H + 28);
    ctx.fillStyle = this.displayFps >= 55 ? '#40ff40' : this.displayFps >= 30 ? '#ffcc00' : '#ff6666';
    ctx.fillText(`Frame: ${this.displayFrameTime}ms`, panelX + 14, panelY + HEADER_H + 52);
    ctx.fillStyle = '#00ffff';
    ctx.fillText(`Entities: ${this.displayEntityCount}`, panelX + 14, panelY + HEADER_H + 76);

    ctx.font = '10px "Press Start 2P", monospace';
    ctx.fillStyle = 'rgba(0, 255, 255, 0.95)';
    ctx.fillText(`World: ${this.phaseWorld.toFixed(1)}ms`, panelX + 14, panelY + HEADER_H + 98);
    ctx.fillText(`Water: ${this.phaseWater.toFixed(1)}ms`, panelX + 14, panelY + HEADER_H + 116);
    ctx.fillText(`  SeaStacks: ${this.phaseWaterSeaStacks.toFixed(1)} Caustics: ${this.phaseWaterCaustics.toFixed(1)}`, panelX + 14, panelY + HEADER_H + 132);
    ctx.fillText(`  Swimming: ${this.phaseWaterSwimming.toFixed(1)} Overlay: ${this.phaseWaterOverlay.toFixed(1)}`, panelX + 14, panelY + HEADER_H + 148);
    ctx.fillText(`Entities: ${this.phaseEntities.toFixed(1)}ms`, panelX + 14, panelY + HEADER_H + 166);
    ctx.fillText(`  YSort: ${this.phaseEntitiesYSorted.toFixed(1)} Shadows: ${this.phaseEntitiesShadows.toFixed(1)}`, panelX + 14, panelY + HEADER_H + 182);
    ctx.fillText(`  Overlays: ${this.phaseEntitiesOverlays.toFixed(1)}ms`, panelX + 14, panelY + HEADER_H + 198);
    ctx.fillText(`Lights: ${this.phaseLights.toFixed(1)}ms  Other: ${this.phaseOther.toFixed(1)}ms`, panelX + 14, panelY + HEADER_H + 220);

    ctx.restore();
  }
}
