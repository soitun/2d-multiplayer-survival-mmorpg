import { projectileConfig } from './sharedGameConfig';

export const PROJECTILE_GRAVITY = projectileConfig.gravity;
export const PROJECTILE_STRAIGHT_LINE_GRAVITY_MULTIPLIER = projectileConfig.straightLineGravityMultiplier;
export const PROJECTILE_FIREARM_GRAVITY_MULTIPLIER = projectileConfig.firearmGravityMultiplier;
export const PROJECTILE_PLAYER_HIT_RADIUS = projectileConfig.playerHitRadius;
export const PROJECTILE_NPC_PLAYER_HIT_RADIUS = projectileConfig.npcPlayerHitRadius;

export const PROJECTILE_SOURCE_PLAYER = projectileConfig.sourceTypes.player;
export const PROJECTILE_SOURCE_TURRET = projectileConfig.sourceTypes.turret;
export const PROJECTILE_SOURCE_NPC = projectileConfig.sourceTypes.npc;
export const PROJECTILE_SOURCE_MONUMENT_TURRET = projectileConfig.sourceTypes.monumentTurret;

export const NPC_PROJECTILE_NONE = projectileConfig.npcTypes.none;
export const NPC_PROJECTILE_SPECTRAL_SHARD = projectileConfig.npcTypes.spectralShard;
export const NPC_PROJECTILE_SPECTRAL_BOLT = projectileConfig.npcTypes.spectralBolt;
export const NPC_PROJECTILE_VENOM_SPITTLE = projectileConfig.npcTypes.venomSpittle;
