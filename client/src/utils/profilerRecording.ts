/**
 * Profiler recording - capture frame timing samples for analysis.
 * Record → Stop → Copy to clipboard. Samples are stored in memory (capped).
 */

export interface ProfilerSample {
  frameTime: number;
  entityCount: number;
  phaseWorld: number;
  phaseWater: number;
  phaseWaterSeaStacks: number;
  phaseWaterCaustics: number;
  phaseWaterSwimming: number;
  phaseWaterOverlay: number;
  phaseEntities: number;
  phaseEntitiesYSorted: number;
  phaseEntitiesShadows: number;
  phaseEntitiesOverlays: number;
  phaseLights: number;
  phaseOther: number;
}

const MAX_SAMPLES = 5000; // ~2.5 min at 30fps
const samples: ProfilerSample[] = [];
let isRecording = false;

export function startRecording(): void {
  samples.length = 0;
  isRecording = true;
}

export function stopRecording(): void {
  isRecording = false;
}

export function isProfilerRecording(): boolean {
  return isRecording;
}

export function addSample(sample: ProfilerSample): void {
  if (!isRecording) return;
  samples.push(sample);
  if (samples.length > MAX_SAMPLES) samples.shift();
}

export function getSampleCount(): number {
  return samples.length;
}

export function copyToClipboard(): Promise<boolean> {
  if (samples.length === 0) return Promise.resolve(false);

  const header = 'frameTime,entityCount,world,water,waterSeaStacks,waterCaustics,waterSwimming,waterOverlay,entities,entitiesYSorted,entitiesShadows,entitiesOverlays,lights,other';
  const rows = samples.map(s =>
    [
      s.frameTime.toFixed(2),
      s.entityCount,
      s.phaseWorld.toFixed(2),
      s.phaseWater.toFixed(2),
      s.phaseWaterSeaStacks.toFixed(2),
      s.phaseWaterCaustics.toFixed(2),
      s.phaseWaterSwimming.toFixed(2),
      s.phaseWaterOverlay.toFixed(2),
      s.phaseEntities.toFixed(2),
      s.phaseEntitiesYSorted.toFixed(2),
      s.phaseEntitiesShadows.toFixed(2),
      s.phaseEntitiesOverlays.toFixed(2),
      s.phaseLights.toFixed(2),
      s.phaseOther.toFixed(2),
    ].join(',')
  );
  const csv = [header, ...rows].join('\n');

  // Summary block for quick analysis
  const avgFrame = samples.reduce((a, s) => a + s.frameTime, 0) / samples.length;
  const maxFrame = Math.max(...samples.map(s => s.frameTime));
  const avgWater = samples.reduce((a, s) => a + s.phaseWaterOverlay, 0) / samples.length;
  const avgYSort = samples.reduce((a, s) => a + s.phaseEntitiesYSorted, 0) / samples.length;
  const avgLights = samples.reduce((a, s) => a + s.phaseLights, 0) / samples.length;
  const summary = [
    `=== Profiler Recording (${samples.length} samples) ===`,
    `Avg Frame: ${avgFrame.toFixed(2)}ms | Max: ${maxFrame.toFixed(2)}ms | FPS: ${(1000 / avgFrame).toFixed(1)}`,
    `Avg Water Overlay: ${avgWater.toFixed(2)}ms | YSort: ${avgYSort.toFixed(2)}ms | Lights: ${avgLights.toFixed(2)}ms`,
    '',
    csv,
  ].join('\n');

  return navigator.clipboard.writeText(summary).then(() => true).catch(() => false);
}
