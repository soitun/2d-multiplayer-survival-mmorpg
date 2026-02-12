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

/** When lights turn ON at dusk (sunset overlay starts) */
export const NIGHT_LIGHTS_ON = 0.72;

/** When lights turn OFF at dawn (morning fully clear) */
export const NIGHT_LIGHTS_OFF = 0.15;

/** Fade-in ends here (full intensity) - used for eerie light fade 0.72→0.80 */
export const LIGHT_FADE_FULL_AT = 0.80;

/** Fade-out starts here - used for rune stone/shipwreck fade at end of night */
export const TWILIGHT_MORNING_FADE_START = 0.97;

/** Twilight morning end (cycle end) */
export const TWILIGHT_MORNING_END = 1.0;

/**
 * Returns true when it's "night" - lights should be on.
 * Night = dusk onwards (>= 0.72) OR dawn (0 to 0.15).
 */
export function isNightTime(cycleProgress: number): boolean {
  return cycleProgress >= NIGHT_LIGHTS_ON || cycleProgress < NIGHT_LIGHTS_OFF;
}
