import { ActiveEquipment, RangedWeaponStats } from '../generated/types';

const MS_PER_SECOND = 1000;

export function getRangedWeaponCooldownDurationMs(weaponStats: RangedWeaponStats | null | undefined): number {
  return Math.max(0, Math.round((weaponStats?.reloadTimeSecs ?? 0) * MS_PER_SECOND));
}

export function getRangedWeaponReloadDurationMs(weaponStats: RangedWeaponStats | null | undefined): number {
  return Math.max(0, Math.round((weaponStats?.magazineReloadTimeSecs ?? 0) * MS_PER_SECOND));
}

export function getRangedWeaponCooldownRemainingMs(
  activeEquipment: ActiveEquipment | null | undefined,
  weaponStats: RangedWeaponStats | null | undefined,
  nowMs: number = Date.now()
): number {
  const cooldownDurationMs = getRangedWeaponCooldownDurationMs(weaponStats);
  const swingStartTimeMs = Number(activeEquipment?.swingStartTimeMs ?? 0);

  if (cooldownDurationMs <= 0 || swingStartTimeMs <= 0) {
    return 0;
  }

  return Math.max(0, cooldownDurationMs - Math.max(0, nowMs - swingStartTimeMs));
}

export function getRangedWeaponReloadRemainingMs(
  activeEquipment: ActiveEquipment | null | undefined,
  weaponStats: RangedWeaponStats | null | undefined,
  nowMs: number = Date.now()
): number {
  const reloadDurationMs = getRangedWeaponReloadDurationMs(weaponStats);
  const reloadStartTimeMs = Number(activeEquipment?.reloadStartTimeMs ?? 0);

  if (reloadDurationMs <= 0 || reloadStartTimeMs <= 0) {
    return 0;
  }

  return Math.max(0, reloadDurationMs - Math.max(0, nowMs - reloadStartTimeMs));
}

export function isRangedWeaponEffectivelyReady(
  activeEquipment: ActiveEquipment | null | undefined,
  weaponStats: RangedWeaponStats | null | undefined,
  nowMs: number = Date.now()
): boolean {
  if (!activeEquipment?.isReadyToFire) {
    return false;
  }

  const hasLoadedAmmo = activeEquipment.loadedAmmoCount > 0 || activeEquipment.loadedAmmoDefId != null;
  if (!hasLoadedAmmo) {
    return false;
  }

  return (
    getRangedWeaponReloadRemainingMs(activeEquipment, weaponStats, nowMs) <= 0 &&
    getRangedWeaponCooldownRemainingMs(activeEquipment, weaponStats, nowMs) <= 0
  );
}
