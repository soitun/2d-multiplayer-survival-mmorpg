/**
 * WoW-style duration formatting: show only the units that matter.
 * Shared across StatusEffectsPanel, ExternalContainerUI (hearth/tool cupboard), broth pot, beehive, etc.
 *
 * - < 1 min: "45s"
 * - 1–59 min: "5:30" (minutes:seconds)
 * - 1+ hours: "1h 30m" (drop seconds when hours matter)
 * - 24+ hours: "2d 5h"
 */
export function formatDuration(seconds: number): string {
  const total = Math.ceil(seconds);
  if (total <= 0) return '0s';

  if (total < 60) return `${total}s`;

  const mins = Math.floor(total / 60);
  const secs = total % 60;

  if (mins < 60) {
    return secs > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${mins}m`;
  }

  const hours = Math.floor(mins / 60);
  const remainMins = mins % 60;

  if (hours < 24) {
    return remainMins > 0 ? `${hours}h ${remainMins}m` : `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  const remainHours = hours % 24;
  return remainHours > 0 ? `${days}d ${remainHours}h` : `${days}d`;
}

/**
 * WoW-style verbose tooltip: same tiering, more readable.
 */
export function formatDurationVerbose(seconds: number): string {
  const total = Math.ceil(seconds);
  if (total <= 0) return '0s remaining';

  if (total < 60) return `${total}s remaining`;

  const mins = Math.floor(total / 60);
  const secs = total % 60;

  if (mins < 60) {
    if (secs === 0) return `${mins}m remaining`;
    return `${mins}m ${secs}s remaining`;
  }

  const hours = Math.floor(mins / 60);
  const remainMins = mins % 60;

  if (hours < 24) {
    if (remainMins === 0) return `${hours}h remaining`;
    return `${hours}h ${remainMins}m remaining`;
  }

  const days = Math.floor(hours / 24);
  const remainHours = hours % 24;
  if (remainHours === 0) return `${days}d remaining`;
  return `${days}d ${remainHours}h remaining`;
}
