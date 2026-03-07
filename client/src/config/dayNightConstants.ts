/**
 * Shared day/night cycle constants for world lighting.
 * All lights (road lampposts, shipwreck glow, ALK compound, rune stones, campfires, etc.)
 * must use these thresholds so they turn on/off at the same time.
 *
 * Aligned with useDayNightCycle keyframes:
 * - 0.15: Morning fully clear (day)
 * - 0.72: Dusk starts (sunset orange overlay)
 * - 0.76: Twilight evening (deep purple)
 */
import { dayNightConfig } from './sharedGameConfig';

/** When lights turn ON at dusk (sunset overlay starts) */
export const NIGHT_LIGHTS_ON = dayNightConfig.duskStartProgress;

/** When lights turn OFF at dawn (morning fully clear) */
export const NIGHT_LIGHTS_OFF = dayNightConfig.morningClearProgress;

/** Fade-in ends here (full intensity) - used for eerie light fade 0.72→0.80 */
export const LIGHT_FADE_FULL_AT = dayNightConfig.nightStartProgress;

/** Fade-out starts here - used for rune stone/shipwreck fade at end of night */
export const TWILIGHT_MORNING_FADE_START = dayNightConfig.twilightMorningStartProgress;

/** Twilight morning end (cycle end) */
export const TWILIGHT_MORNING_END = dayNightConfig.cycleEndProgress;

/** Server cadence for full moon cycles */
export const FULL_MOON_CYCLE_INTERVAL = dayNightConfig.fullMoonCycleInterval;

/**
 * Returns true when it's "night" - lights should be on.
 * Night = dusk onwards (>= 0.72) OR dawn (0 to 0.15).
 */
export function isNightTime(cycleProgress: number): boolean {
  return cycleProgress >= NIGHT_LIGHTS_ON || cycleProgress < NIGHT_LIGHTS_OFF;
}
