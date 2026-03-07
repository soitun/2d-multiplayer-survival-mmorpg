import { ItemDefinition, Projectile } from '../generated/types';
import {
  PROJECTILE_FIREARM_GRAVITY_MULTIPLIER,
  PROJECTILE_GRAVITY,
  PROJECTILE_SOURCE_MONUMENT_TURRET,
  PROJECTILE_SOURCE_NPC,
  PROJECTILE_SOURCE_TURRET,
  PROJECTILE_STRAIGHT_LINE_GRAVITY_MULTIPLIER,
} from '../config/projectileConstants';

export interface SampledProjectileState {
  x: number;
  y: number;
  gravityMultiplier: number;
  isThrown: boolean;
  isBullet: boolean;
  instantaneousVelocityY: number;
}

export function resolveProjectileGravityState(
  projectile: Projectile,
  itemDefinitions?: Map<string, ItemDefinition | any>,
): { gravityMultiplier: number; isThrown: boolean; isBullet: boolean } {
  const isThrown = projectile.ammoDefId === projectile.itemDefId;

  if (
    projectile.sourceType === PROJECTILE_SOURCE_NPC ||
    projectile.sourceType === PROJECTILE_SOURCE_MONUMENT_TURRET
  ) {
    return { gravityMultiplier: 0.0, isThrown, isBullet: false };
  }

  if (projectile.sourceType === PROJECTILE_SOURCE_TURRET) {
    return { gravityMultiplier: 1.0, isThrown, isBullet: false };
  }

  let gravityMultiplier = 1.0;
  let isBullet = false;

  if (itemDefinitions) {
    const weaponDef = itemDefinitions.get(projectile.itemDefId.toString());
    if (weaponDef?.name === 'Crossbow' || weaponDef?.name === 'Hunting Bow') {
      gravityMultiplier = PROJECTILE_STRAIGHT_LINE_GRAVITY_MULTIPLIER;
    } else if (weaponDef?.name === 'Makarov PM' || weaponDef?.name === 'PP-91 KEDR') {
      gravityMultiplier = PROJECTILE_FIREARM_GRAVITY_MULTIPLIER;
      isBullet = true;
    }
  }

  return {
    gravityMultiplier: isThrown ? 0.0 : gravityMultiplier,
    isThrown,
    isBullet,
  };
}

export function sampleProjectileState(
  projectile: Projectile,
  elapsedTimeSeconds: number,
  itemDefinitions?: Map<string, ItemDefinition | any>,
): SampledProjectileState {
  const { gravityMultiplier, isThrown, isBullet } = resolveProjectileGravityState(projectile, itemDefinitions);
  const gravityEffect = 0.5 * PROJECTILE_GRAVITY * gravityMultiplier * elapsedTimeSeconds * elapsedTimeSeconds;
  const x = projectile.startPosX + projectile.velocityX * elapsedTimeSeconds;
  const y = projectile.startPosY + projectile.velocityY * elapsedTimeSeconds + gravityEffect;

  return {
    x,
    y,
    gravityMultiplier,
    isThrown,
    isBullet,
    instantaneousVelocityY: projectile.velocityY + PROJECTILE_GRAVITY * gravityMultiplier * elapsedTimeSeconds,
  };
}
