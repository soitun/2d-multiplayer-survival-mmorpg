/**
 * Drone shadow rendering - eerie flyover effect like clouds.
 * Renders drone.png as a dark shadow (brightness 0%) for mysterious sky presence.
 */

import { DroneEvent } from '../../generated/types';

export interface InterpolatedDroneData {
  id: string;
  posX: number;
  posY: number;
  width: number;
  height: number;
  opacity: number;
  rotationDegrees: number;
}

const DEG_TO_RAD = Math.PI / 180;
const DRONE_SIZE_MULTIPLIER = 2.5; // Shadow size on ground
/** Drone image faces left by default; add 180° so nose points in travel direction */
const DRONE_IMAGE_FACING_OFFSET_DEG = 180;
const DRONE_OPACITY = 0.18; // Eerie dark shadow
const DRONE_BLUR_PX = 2; // Slight blur for dreamlike quality

/** Get start time in ms from SpacetimeDB Timestamp (handles different SDK property names) */
function getStartTimeMs(drone: DroneEvent): number {
  const t = drone.startTime as any;
  const micros = t?.microsSinceUnixEpoch ?? t?.__timestamp_micros_since_unix_epoch__ ?? 0n;
  return Number(micros) / 1000;
}

/** Compute drone position from start/end and elapsed time */
export function computeDronePosition(drone: DroneEvent, nowMs: number): { x: number; y: number } | null {
  const startTimeMs = getStartTimeMs(drone);
  const durationMs = Number(drone.durationMicros) / 1000;
  const elapsed = nowMs - startTimeMs;

  if (elapsed < 0 || elapsed >= durationMs) {
    return null;
  }

  const t = elapsed / durationMs;
  const x = drone.startX + (drone.endX - drone.startX) * t;
  const y = drone.startY + (drone.endY - drone.startY) * t;
  return { x, y };
}

/** Check if drone is still in flight */
export function isDroneActive(drone: DroneEvent, nowMs: number): boolean {
  const startTimeMs = getStartTimeMs(drone);
  const durationMs = Number(drone.durationMicros) / 1000;
  const elapsed = nowMs - startTimeMs;
  return elapsed >= 0 && elapsed < durationMs;
}

interface RenderDronesParams {
  ctx: CanvasRenderingContext2D;
  drones: Map<string, InterpolatedDroneData>;
  droneImage: HTMLImageElement | null;
  worldScale: number;
  cameraOffsetX: number;
  cameraOffsetY: number;
}

export function renderDronesDirectly({
  ctx,
  drones,
  droneImage,
  worldScale,
  cameraOffsetX,
  cameraOffsetY,
}: RenderDronesParams): void {
  if (!drones || drones.size === 0) return;
  if (!droneImage || !droneImage.complete) return;

  const scaledMultiplier = worldScale * DRONE_SIZE_MULTIPLIER;

  drones.forEach((drone) => {
    const { posX, posY, width, height, opacity, rotationDegrees } = drone;
    const renderWidth = width * scaledMultiplier;
    const renderHeight = height * scaledMultiplier;
    const halfWidth = renderWidth * 0.5;
    const halfHeight = renderHeight * 0.5;

    ctx.save();
    // ctx is already translated by camera offset (world space); use world pos directly
    ctx.translate(posX * worldScale, posY * worldScale);
    ctx.rotate(rotationDegrees * DEG_TO_RAD);

    ctx.globalAlpha = opacity;
    ctx.filter = `brightness(0%) blur(${DRONE_BLUR_PX * worldScale}px)`;

    ctx.drawImage(droneImage, -halfWidth, -halfHeight, renderWidth, renderHeight);
    ctx.restore();
  });

  ctx.filter = 'none';
  ctx.globalAlpha = 1.0;
}

/** Compute interpolated drone data for rendering */
export function getInterpolatedDrones(
  drones: Map<string, DroneEvent>,
  droneImage: HTMLImageElement | null,
  nowMs: number
): Map<string, InterpolatedDroneData> {
  const result = new Map<string, InterpolatedDroneData>();

  if (!droneImage?.complete) return result;

  const baseWidth = droneImage.naturalWidth * 0.5;
  const baseHeight = droneImage.naturalHeight * 0.5;

  drones.forEach((drone, id) => {
    const pos = computeDronePosition(drone, nowMs);
    if (!pos) return;

    // Rotation: drone faces direction of travel (image faces left by default, so add 180° offset)
    const dx = drone.endX - drone.startX;
    const dy = drone.endY - drone.startY;
    const angleRad = Math.atan2(dy, dx);
    const rotationDegrees = (angleRad * 180) / Math.PI + DRONE_IMAGE_FACING_OFFSET_DEG;

    result.set(id, {
      id,
      posX: pos.x,
      posY: pos.y,
      width: baseWidth,
      height: baseHeight,
      opacity: DRONE_OPACITY,
      rotationDegrees,
    });
  });

  return result;
}
