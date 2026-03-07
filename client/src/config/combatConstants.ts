import { combatConfig, playerConfig } from './sharedGameConfig';

export const EXHAUSTED_SPEED_PENALTY = combatConfig.exhaustedSpeedPenalty;
export const REMOTE_HEALING_RANGE_PX = combatConfig.remoteHealingRangePx;

export const DODGE_ROLL_DISTANCE_PX = combatConfig.dodgeRollDistancePx;
export const DODGE_ROLL_DURATION_MS = combatConfig.dodgeRollDurationMs;
export const DODGE_ROLL_COOLDOWN_MS = combatConfig.dodgeRollCooldownMs;
export const DODGE_ROLL_SPEED_PX_PER_SEC = DODGE_ROLL_DISTANCE_PX / (DODGE_ROLL_DURATION_MS / 1000);

export const DEFAULT_MELEE_RANGE_MULTIPLIER = combatConfig.defaultMeleeRangeMultiplier;
export const SPEAR_MELEE_RANGE_MULTIPLIER = combatConfig.spearMeleeRangeMultiplier;
export const SCYTHE_MELEE_RANGE_MULTIPLIER = combatConfig.scytheMeleeRangeMultiplier;

export const DEFAULT_MELEE_ATTACK_RANGE = playerConfig.radiusPx * DEFAULT_MELEE_RANGE_MULTIPLIER;
export const SPEAR_MELEE_ATTACK_RANGE = playerConfig.radiusPx * SPEAR_MELEE_RANGE_MULTIPLIER;
export const SCYTHE_MELEE_ATTACK_RANGE = playerConfig.radiusPx * SCYTHE_MELEE_RANGE_MULTIPLIER;

export const DEFAULT_MELEE_ARC_DEGREES = combatConfig.defaultMeleeArcDegrees;
export const SPEAR_MELEE_ARC_DEGREES = combatConfig.spearMeleeArcDegrees;
export const SCYTHE_MELEE_ARC_DEGREES = combatConfig.scytheMeleeArcDegrees;
