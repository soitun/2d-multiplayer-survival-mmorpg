import { PlayerCorpse as SpacetimeDBPlayerCorpse } from '../../generated/player_corpse_type';
import { Player as SpacetimeDBPlayer } from '../../generated/player_type';
import { renderPlayer, IDLE_FRAME_INDEX } from './playerRenderingUtils';
import { Identity, Timestamp } from 'spacetimedb';

// Constants for shake effect
const SHAKE_DURATION_MS = 150;     // How long the shake effect lasts
const SHAKE_INTENSITY_PX = 8;     // Max pixel offset for corpse shake

interface RenderPlayerCorpseProps {
  ctx: CanvasRenderingContext2D;
  corpse: SpacetimeDBPlayerCorpse;
  nowMs: number;
  itemImagesRef: React.RefObject<Map<string, HTMLImageElement>>;
  cycleProgress: number;
  heroImageRef: React.RefObject<HTMLImageElement | null>;
  heroWaterImageRef: React.RefObject<HTMLImageElement | null>;
  heroCrouchImageRef: React.RefObject<HTMLImageElement | null>;
  heroSwimImageRef: React.RefObject<HTMLImageElement | null>;
  isHovered?: boolean; // Whether this corpse is being hovered (closest interactable target)
}

export const PLAYER_CORPSE_INTERACTION_DISTANCE_SQUARED = 64.0 * 64.0; // Reduced from 96px to 64px for tighter interaction range that matches server expectations

// Hover detection radius for corpses (similar to players)
const corpseHoverRadius = 24;

/**
 * Checks if the mouse cursor is hovering over a corpse based on world coordinates.
 * Uses distance-based detection similar to player hover.
 */
export const isCorpseHovered = (
  worldMouseX: number | null,
  worldMouseY: number | null,
  corpse: SpacetimeDBPlayerCorpse
): boolean => {
  if (worldMouseX === null || worldMouseY === null) return false;
  
  const hoverDX = worldMouseX - corpse.posX;
  const hoverDY = worldMouseY - corpse.posY;
  const distSq = hoverDX * hoverDX + hoverDY * hoverDY;
  const radiusSq = corpseHoverRadius * corpseHoverRadius;
  
  return distSq <= radiusSq;
};

/**
 * Renders a player corpse entity onto the canvas using player sprite logic.
 */
export function renderPlayerCorpse({
  ctx,
  corpse,
  nowMs,
  itemImagesRef,
  cycleProgress,
  heroImageRef,
  heroWaterImageRef,
  heroCrouchImageRef,
  heroSwimImageRef,
  isHovered = false,
}: RenderPlayerCorpseProps): void {
  
  // 1. Corpse Disappearance on Zero Health
  if (corpse.health === 0) {
    return; // Don't render if health is zero
  }

  // Default timestamp for mock player fields that require a Timestamp value
  const defaultTimestamp: Timestamp = { __timestamp_micros_since_unix_epoch__: 0n } as Timestamp;

  let renderPosX = corpse.posX;
  let renderPosY = corpse.posY;

  // 2. Shake Effect
  // Handle both timestamp property names for compatibility
  if (corpse.lastHitTime) {
    const lastHitTimeMs = Number(
      (corpse.lastHitTime as any).microsSinceUnixEpoch || 
      (corpse.lastHitTime as any).__timestamp_micros_since_unix_epoch__ || 
      0n
    ) / 1000;
    const elapsedSinceHit = nowMs - lastHitTimeMs;

    if (elapsedSinceHit >= 0 && elapsedSinceHit < SHAKE_DURATION_MS) {
      const shakeFactor = 1.0 - (elapsedSinceHit / SHAKE_DURATION_MS); 
      const currentShakeIntensity = SHAKE_INTENSITY_PX * shakeFactor;
      const shakeOffsetX = (Math.random() - 0.5) * 2 * currentShakeIntensity;
      const shakeOffsetY = (Math.random() - 0.5) * 2 * currentShakeIntensity;
      renderPosX += shakeOffsetX;
      renderPosY += shakeOffsetY;
    }
  }

  // For now, we'll assume corpses don't change their water status - they use normal sprite
  // In the future, we could add water detection logic for corpses if needed
  const isCorpseOnWater = false; // TODO: Implement water detection for corpses if needed

  const mockPlayerForCorpse: SpacetimeDBPlayer = {
    identity: corpse.playerIdentity as Identity,
    username: corpse.username,
    positionX: renderPosX, // Use potentially shaken position
    positionY: renderPosY, // Use potentially shaken position
    direction: 'left', // Corpses use left-facing sprite rotated 90° right to appear on their back
    health: 0, // Mock player health is 0 as it's a corpse
    isDead: true,
    lastHitTime: undefined, // Mock player doesn't have its own last hit time for rendering
    jumpStartTimeMs: 0n,
    isSprinting: false,
    hunger: 0,
    thirst: 0,
    stamina: 0,
    lastUpdate: defaultTimestamp,
    lastStatUpdate: defaultTimestamp,
    warmth: 0,
    deathTimestamp: corpse.deathTime,
    isOnline: false,
    isTorchLit: false,
    isFlashlightOn: false,
    isHeadlampLit: false, // Corpses don't have headlamps lit
    flashlightAimAngle: 0, // Corpses don't have flashlight aim
    lastRespawnTime: defaultTimestamp,
    lastConsumedAt: defaultTimestamp,
    isCrouching: false,
    isKnockedOut: false,
    knockedOutAt: undefined,
    isOnWater: isCorpseOnWater, // ADD: Water status for sprite selection
    clientMovementSequence: 0n, // ADD: Required field for client-side prediction
    isInsideBuilding: false, // Corpses are not inside buildings
    offlineCorpseId: undefined, // Corpses don't have an offline corpse reference
    insanity: 0, // Corpses have no insanity
    lastInsanityThreshold: 0, // Corpses have no insanity threshold
    shardCarryStartTime: undefined, // Corpses are not carrying shards
    isSnorkeling: false, // Corpses are not snorkeling
    isAimingThrow: false, // Corpses are not aiming throws
    hasSeenMemoryShardTutorial: false, // Corpses don't need tutorials
    hasSeenSovaIntro: false, // Corpses don't need tutorials
    hasSeenTutorialHint: false, // Corpses don't need tutorials
    hasSeenHostileEncounterTutorial: false, // Corpses don't need tutorials
    hasSeenRuneStoneTutorial: false, // Corpses don't need tutorials
    hasSeenAlkStationTutorial: false, // Corpses don't need tutorials
    hasSeenCrashedDroneTutorial: false, // Corpses don't need tutorials
    pvpEnabled: false, // Corpses can't engage in PvP
    pvpEnabledUntil: undefined, // No PvP timer for corpses
    lastPvpCombatTime: undefined, // No PvP combat time for corpses
    isNpc: false, // Corpses are not NPCs
    npcRole: '', // Corpses have no NPC role
  };

  // Choose the appropriate hero sprite based on water status (corpses don't crouch)
  const heroImg = isCorpseOnWater ? heroWaterImageRef.current : heroImageRef.current;
  
  if (!heroImg) {
    console.warn("[renderPlayerCorpse] Hero image not loaded, cannot render corpse sprite.");
    return;
  }

  renderPlayer(
    ctx,
    mockPlayerForCorpse,
    heroImg,
    heroImg, // heroSprintImg - corpses don't sprint
    heroImg, // heroIdleImg - corpses don't use idle animation
    heroCrouchImageRef.current || heroImg, // heroCrouchImg - corpses don't crouch but need parameter
    heroSwimImageRef.current || heroImg, // heroSwimImg - corpses don't swim but need parameter
    heroImg, // heroDodgeImg - corpses don't dodge but need parameter
    false, // isOnline
    false, // isMoving (corpse is static)
    isHovered, // isHovered - show nametag when this corpse is closest interactable
    IDLE_FRAME_INDEX, // currentAnimationFrame
    nowMs,
    0, // jumpOffsetY (corpse doesn't jump)
    isHovered, // shouldShowLabel - show nametag when hovered (like players)
    undefined, // activeConsumableEffects
    undefined, // localPlayerId
    true, // isCorpse
    cycleProgress // cycleProgress
  );
}