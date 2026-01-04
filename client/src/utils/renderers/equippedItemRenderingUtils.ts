import { Player as SpacetimeDBPlayer, ActiveEquipment as SpacetimeDBActiveEquipment, ItemDefinition as SpacetimeDBItemDefinition, ActiveConsumableEffect, EffectType } from '../../generated';
import { gameConfig } from '../../config/gameConfig';
import { PLAYER_RADIUS } from '../clientCollision';

// --- Constants (copied from GameCanvas for now, consider moving to config) ---
const SWING_DURATION_MS = 150;
const DEFAULT_SWING_ANGLE_MAX_RAD = Math.PI / 4; // 45 degrees default swing visual (90° total arc)
const SLASH_COLOR = 'rgba(255, 255, 255, 0.4)';
const SLASH_LINE_WIDTH = 4;

// === ATTACK RANGE CONSTANTS (must match server/src/active_equipment.rs) ===
const MELEE_ATTACK_RANGE = PLAYER_RADIUS * 4.5;   // ~144px - default melee range
const SPEAR_ATTACK_RANGE = PLAYER_RADIUS * 6.0;   // ~192px - spear extended range
const SCYTHE_ATTACK_RANGE = PLAYER_RADIUS * 7.0;  // ~224px - scythe VERY extended range

// Attack arc angles (must match server)
const DEFAULT_ATTACK_ARC_DEGREES = 90;   // Standard 90° arc
const SCYTHE_ATTACK_ARC_DEGREES = 150;   // Scythe's massive 150° arc

// Attack range arc visual settings
const ARC_EFFECT_COLOR = 'rgba(255, 200, 100, 0.35)';  // Golden semi-transparent
const ARC_EFFECT_EDGE_COLOR = 'rgba(255, 180, 80, 0.6)'; // Brighter edge
const ARC_EFFECT_LINE_WIDTH = 3;

// Helper to get swing angle from item definition
// Items with attackArcDegrees defined use that, otherwise default to 90°
const getSwingAngleMaxRad = (itemDef: SpacetimeDBItemDefinition): number => {
  // attackArcDegrees is the total arc (e.g., 120° for Scythe)
  // We divide by 2 because swing goes from -angle to +angle
  const arcDegrees = itemDef.attackArcDegrees ?? 90;
  return (arcDegrees / 2) * (Math.PI / 180);
};

// Helper to get weapon's actual attack range and arc (must match server logic)
const getWeaponAttackParams = (itemDef: SpacetimeDBItemDefinition): { range: number; arcDegrees: number } => {
  const name = itemDef.name;
  
  // Scythe - LONGEST range, WIDEST arc
  if (name === 'Scythe') {
    return { range: SCYTHE_ATTACK_RANGE, arcDegrees: SCYTHE_ATTACK_ARC_DEGREES };
  }
  
  // Spears - extended range, default arc
  if (name === 'Wooden Spear' || name === 'Stone Spear' || name === 'Reed Harpoon') {
    return { range: SPEAR_ATTACK_RANGE, arcDegrees: DEFAULT_ATTACK_ARC_DEGREES };
  }
  
  // Use item's custom arc if defined, otherwise default
  const itemArc = itemDef.attackArcDegrees ?? DEFAULT_ATTACK_ARC_DEGREES;
  return { range: MELEE_ATTACK_RANGE, arcDegrees: itemArc };
};
const PLAYER_HIT_SHAKE_DURATION_MS = 200; // Copied from renderingUtils.ts
const PLAYER_HIT_SHAKE_AMOUNT_PX = 3;   // Copied from renderingUtils.ts

// --- Bandage Animation Constants ---
const BANDAGING_ANIMATION_DURATION_MS = 5000; // Duration of the bandaging animation (MATCHES SERVER: 5 seconds)
const BANDAGING_MAX_ROTATION_RAD = Math.PI / 12; // Max rotation angle (e.g., 15 degrees)
const BANDAGING_WOBBLES = 20; // Number of full back-and-forth wobbles (10 * 2 for twice as fast)

// Selo Olive Oil animation constants
const SELO_OLIVE_OIL_ANIMATION_DURATION_MS = 2000; // Duration of the Selo Olive Oil animation (MATCHES SERVER: 2 seconds)
const SELO_OLIVE_OIL_MAX_ROTATION_RAD = Math.PI / 16; // Much gentler rotation than bandage (was Math.PI / 10)
const SELO_OLIVE_OIL_WOBBLES = 8; // Fewer wobbles for a gentler shake (was 15)

// Water drinking animation constants
const WATER_DRINKING_ANIMATION_DURATION_MS = 2000; // Duration of the water drinking animation (MATCHES SERVER: 2 seconds)
const WATER_DRINKING_MAX_ROTATION_RAD = Math.PI / 20; // Gentle rotation for drinking
const WATER_DRINKING_WOBBLES = 6; // Gentle wobbles for drinking

// --- Client-side animation tracking ---
const clientSwingStartTimes = new Map<string, number>(); // playerId -> client timestamp when swing started
const lastKnownServerSwingTimes = new Map<string, number>(); // playerId -> last known server timestamp for the swing

// --- CLIENT-AUTHORITATIVE SWING TRACKING (for local player only) ---
// This allows the local player's swing animation to start IMMEDIATELY on click,
// without waiting for server round-trip. Other players still use server timestamps.
let localPlayerClientSwingStartTime: number = 0; // When local player initiated swing (client time)
let localPlayerSwingDuration: number = SWING_DURATION_MS; // How long the swing should last
let localPlayerSwingGracePeriodEnd: number = 0; // Time until we should ignore server swing updates

// Grace period after client animation completes where we ignore server swing timestamps
// This prevents the "double swing" bug where server confirmation triggers a second animation
const SERVER_SWING_GRACE_PERIOD_MS = 300;

/**
 * Call this from the input handler when the local player initiates a swing.
 * This allows the animation to start immediately without waiting for server confirmation.
 * @param duration - Optional custom swing duration (defaults to SWING_DURATION_MS)
 */
export function registerLocalPlayerSwing(duration?: number): void {
  localPlayerClientSwingStartTime = performance.now();
  localPlayerSwingDuration = duration ?? SWING_DURATION_MS;
  // Grace period extends past animation end to account for server round-trip latency
  localPlayerSwingGracePeriodEnd = localPlayerClientSwingStartTime + localPlayerSwingDuration + SERVER_SWING_GRACE_PERIOD_MS;
}

/**
 * Check if the local player has an active client-initiated swing animation.
 * Returns the elapsed time since the swing started, or -1 if no active swing.
 */
export function getLocalPlayerSwingElapsed(): number {
  if (localPlayerClientSwingStartTime === 0) return -1;
  const elapsed = performance.now() - localPlayerClientSwingStartTime;
  if (elapsed >= localPlayerSwingDuration) {
    // Swing animation complete, reset start time but keep grace period active
    localPlayerClientSwingStartTime = 0;
    return -1;
  }
  return elapsed;
}

/**
 * Check if we should ignore server swing timestamps.
 * Returns true if we're within the grace period after a client-authoritative swing.
 * This prevents the server confirmation from triggering a second animation.
 */
export function shouldIgnoreServerSwing(): boolean {
  return performance.now() < localPlayerSwingGracePeriodEnd;
}

// --- Helper Function for Rendering Equipped Item ---
export const renderEquippedItem = (
  ctx: CanvasRenderingContext2D,
  player: SpacetimeDBPlayer, 
  equipment: SpacetimeDBActiveEquipment,
  itemDef: SpacetimeDBItemDefinition,
  itemDefinitions: Map<string, SpacetimeDBItemDefinition>,
  itemImgFromCaller: HTMLImageElement,
  now_ms: number,
  jumpOffset: number,
  itemImages: Map<string, HTMLImageElement>,
  activeConsumableEffects?: Map<string, ActiveConsumableEffect>,
  localPlayerId?: string,
  serverSyncedDirection?: string, // Optional: Server-synced direction for accurate attack arc display
  applyUnderwaterTint?: boolean // NEW: Apply teal underwater tint when snorkeling
) => {
  // DEBUG: Log item being rendered
  // if (localPlayerId && player.identity.toHexString() === localPlayerId) {
  //   console.log(`[DEBUG] renderEquippedItem called for:`, {
  //     itemName: itemDef.name,
  //     category: itemDef.category,
  //     categoryTag: itemDef.category?.tag,
  //     categoryType: typeof itemDef.category,
  //     hasInstanceId: !!equipment.equippedItemInstanceId
  //   });
  // }

  // Early validation: if no equipped item instance ID, don't render anything
  if (!equipment.equippedItemInstanceId) {
    return;
  }
  // --- Calculate Shake Offset (Only if alive) ---
  let shakeX = 0;
  let shakeY = 0;
  if (!player.isDead && player.lastHitTime) { // Check if alive and hit time exists
    const lastHitMs = Number(player.lastHitTime.microsSinceUnixEpoch / 1000n);
    const elapsedSinceHit = now_ms - lastHitMs;
    if (elapsedSinceHit >= 0 && elapsedSinceHit < PLAYER_HIT_SHAKE_DURATION_MS) {
      shakeX = (Math.random() - 0.5) * 2 * PLAYER_HIT_SHAKE_AMOUNT_PX;
      shakeY = (Math.random() - 0.5) * 2 * PLAYER_HIT_SHAKE_AMOUNT_PX;
    }
  }
  // --- End Shake Offset ---

  // --- Item Size and Position ---
  // Items are now 64x64px, so we need much larger scales than before
  // Melee weapons need to be larger to be visible - using 0.9 scale (57px)
  // Skulls and fertilizer render at larger size (0.75 scale = 48px)
  // Other items use 0.7 scale (45px)
  const isSkull = itemDef.name === "Human Skull" || itemDef.name === "Fox Skull" || 
                   itemDef.name === "Wolf Skull" || itemDef.name === "Viper Skull" || 
                   itemDef.name === "Walrus Skull";
  const isFertilizer = itemDef.name === "Fertilizer";
  const isMeleeWeapon = itemDef.category?.tag === "Weapon";
  // Updated scales for 64x64px images: 
  // - Melee weapons: 0.9 scale (57px) for visibility
  // - Skulls/fertilizer: 0.75 scale (48px)
  // - Other items: 0.7 scale (45px)
  const scale = isMeleeWeapon ? 0.9 : (isSkull || isFertilizer) ? 0.75 : 0.7; 
  const itemWidth = itemImgFromCaller.width * scale;
  const itemHeight = itemImgFromCaller.height * scale;
  let itemOffsetX = 0; 
  let itemOffsetY = 0; 

  let displayItemWidth = itemWidth;
  let displayItemHeight = itemHeight;

  // Make repair hammer twice as small
  if (itemDef.name === "Repair Hammer") {
    displayItemWidth = itemWidth * 0.5;
    displayItemHeight = itemHeight * 0.5;
  }

  let rotation = 0;
  let isSwinging = false;
  let isSpearThrusting = false;

  // --- Define spear-specific orientation variables ---
  let spearRotation = 0; // This will be the primary rotation for the spear
  let spearScaleX = 1;
  let spearScaleY = 1;
  // --- End spear-specific orientation variables ---

  let pivotX = player.positionX + shakeX;
  let pivotY = player.positionY - jumpOffset + shakeY; 
  
  const handOffsetX = gameConfig.spriteWidth * 0.2; 
  const handOffsetY = gameConfig.spriteHeight * 0.05;

  if (itemDef.name === "Wooden Spear" || itemDef.name === "Stone Spear" || itemDef.name === "Reed Harpoon") {
    // Base rotations to make spear point in player's direction
    // (assuming spear asset points horizontally to the right by default)
    switch (player.direction) {
      case 'up':
        spearRotation = -Math.PI / 2; // Points asset 'up'
        itemOffsetX = 0; 
        itemOffsetY = -gameConfig.spriteHeight * 0.1; 
        break;
      case 'down':
        spearRotation = Math.PI / 2;  // Points asset 'down'
        itemOffsetX = 0;
        itemOffsetY = gameConfig.spriteHeight * 0.1;
        break;
      case 'left':
        spearRotation = Math.PI;      // Points asset 'left'
        itemOffsetX = -gameConfig.spriteWidth * 0.15;
        itemOffsetY = 0; 
        break;
      case 'right':
        spearRotation = 0;            // Points asset 'right' (default asset orientation)
        itemOffsetX = gameConfig.spriteWidth * 0.15;
        itemOffsetY = 0;
        break;
    }

    // Apply user-specified distinct transformations for each direction
    // This switch can override spearRotation from the first switch, set scaling,
    // and now also fine-tune itemOffsetX/Y for each specific spear orientation.
    switch (player.direction) {
      case 'up':
        spearRotation = (Math.PI / 4) + (Math.PI / 2) + (Math.PI / 2); 
        spearScaleX = -1; 
        spearScaleY = -1; 
        // Initial offset from first switch for 'up': itemOffsetX = 0; itemOffsetY = -gameConfig.spriteHeight * 0.1;
        itemOffsetX = 0 + 15; // adjust X for up
        itemOffsetY = (-gameConfig.spriteHeight * 0.1) -20; // adjust Y for up
        break;
      case 'down':
        spearRotation = (Math.PI / 4) + (Math.PI / 2);
        spearScaleX = -1; 
        spearScaleY = 1;
        // Initial offset from first switch for 'down': itemOffsetX = 0; itemOffsetY = gameConfig.spriteHeight * 0.1;
        itemOffsetX = 0 - 15; // adjust X for down (e.g., move left by 5px)
        itemOffsetY = (gameConfig.spriteHeight * 0.1) + 25; // adjust Y for down (e.g., move down by 5px)
        break;
      case 'left':
        spearRotation = Math.PI + (Math.PI / 4);
        spearScaleX = -1; 
        spearScaleY = 1;
        // Initial offset from first switch for 'left': itemOffsetX = -gameConfig.spriteWidth * 0.15; itemOffsetY = 0;
        itemOffsetX = (-gameConfig.spriteWidth * 0.15) - 15; // adjust X for left
        itemOffsetY = 0 + 0; // adjust Y for left
        break;
      case 'right':
        spearRotation = Math.PI / 4; 
        spearScaleX = -1; 
        spearScaleY = 1;
        // Initial offset from first switch for 'right': itemOffsetX = gameConfig.spriteWidth * 0.15; itemOffsetY = 0;
        itemOffsetX = (gameConfig.spriteWidth * 0.15) + 5; // adjust X for right
        itemOffsetY = 0 + 15; // adjust Y for right
        break;
    }
    
    // The pivotX and pivotY are now based on these potentially fine-tuned offsets.
    // The initial calculation of pivotX/Y before this switch might need to be re-evaluated
    // if we don't want to ADD to player.positionX/Y + shakeX/Y + itemOffsetX/Y from the *first* switch.
    // For now, we effectively override the first switch's itemOffset by re-assigning itemOffsetX/Y here.
    // So, the final pivot calculation should directly use these values.

    // Recalculate pivotX, pivotY based on the final itemOffsetX/Y for the spear
    pivotX = player.positionX + shakeX + itemOffsetX;
    pivotY = player.positionY - jumpOffset + shakeY + itemOffsetY;
    
    rotation = spearRotation; // Use the calculated spear rotation

  } else if (itemDef.name === "Hunting Bow") {

    // Full 64x64px rendering for bows
    const bowScale = 1.0;
    displayItemWidth = itemImgFromCaller.width * bowScale;
    displayItemHeight = itemImgFromCaller.height * bowScale;

    switch (player.direction) {
      case 'up':
        itemOffsetX = gameConfig.spriteWidth * 0.3;
        itemOffsetY = -gameConfig.spriteHeight * 0.0;
        rotation = -Math.PI / 2; // Point bow upward (with horizontal flip, -90° points up)
        break;
      case 'down':
        itemOffsetX = gameConfig.spriteWidth * -0.3;
        itemOffsetY = gameConfig.spriteHeight * 0.2;
        rotation = Math.PI / 2; // Point bow downward (with horizontal flip, +90° points down)
        break;
      case 'left':
        itemOffsetX = -gameConfig.spriteWidth * 0.2;
        itemOffsetY = 0;
        rotation = Math.PI / 2; // Rotate counterclockwise 90° to mirror the right direction
        break;
      case 'right':
        itemOffsetX = gameConfig.spriteWidth * -0.2;
        itemOffsetY = 4.0;
        rotation = 0; // Point bow right (0° is correct, this is our reference)
        break;
    }
    
    pivotX = player.positionX + shakeX + itemOffsetX;
    pivotY = player.positionY - jumpOffset + shakeY + itemOffsetY;

  } else if (itemDef.name === "Crossbow") {

    // Full 64x64px rendering for crossbows
    const crossbowScale = 1.0;
    displayItemWidth = itemImgFromCaller.width * crossbowScale;
    displayItemHeight = itemImgFromCaller.height * crossbowScale;

    switch (player.direction) {
      case 'up':
        itemOffsetX = gameConfig.spriteWidth * 0.25;
        itemOffsetY = -gameConfig.spriteHeight * 0.05;
        rotation = -Math.PI / 2; // Point crossbow upward (with horizontal flip, -90° points up)
        break;
      case 'down':
        itemOffsetX = gameConfig.spriteWidth * -0.25;
        itemOffsetY = gameConfig.spriteHeight * 0.25;
        rotation = Math.PI / 2; // Point crossbow downward (with horizontal flip, +90° points down)
        break;
      case 'left':
        itemOffsetX = -gameConfig.spriteWidth * 0.25;
        itemOffsetY = 0;
        rotation = Math.PI / 2; // Rotate counterclockwise 90° to mirror the right direction
        break;
      case 'right':
        itemOffsetX = gameConfig.spriteWidth * -0.25;
        itemOffsetY = 2.0;
        rotation = 0; // Point crossbow right (0° is correct, this is our reference)
        break;
    }
    
    pivotX = player.positionX + shakeX + itemOffsetX;
    pivotY = player.positionY - jumpOffset + shakeY + itemOffsetY;

  } else if (itemDef.name === "Makarov PM") {

    // Full 64x64px rendering for pistols
    const pistolScale = 1.0;
    displayItemWidth = itemImgFromCaller.width * pistolScale;
    displayItemHeight = itemImgFromCaller.height * pistolScale;

    switch (player.direction) {
      case 'up':
        itemOffsetX = gameConfig.spriteWidth * 0.25;
        itemOffsetY = -gameConfig.spriteHeight * 0.05;
        rotation = -Math.PI / 2; // Point pistol upward
        break;
      case 'down':
        itemOffsetX = gameConfig.spriteWidth * -0.25;
        itemOffsetY = gameConfig.spriteHeight * 0.25;
        rotation = Math.PI / 2; // Point pistol downward
        break;
      case 'left':
        itemOffsetX = -gameConfig.spriteWidth * 0.25;
        itemOffsetY = 0;
        rotation = Math.PI / 2; // Rotate counterclockwise 90°
        break;
      case 'right':
        itemOffsetX = gameConfig.spriteWidth * -0.25;
        itemOffsetY = 2.0;
        rotation = 0; // Point pistol right
        break;
    }
    
    pivotX = player.positionX + shakeX + itemOffsetX;
    pivotY = player.positionY - jumpOffset + shakeY + itemOffsetY;

  } else if (itemDef.name === "Reed Harpoon Gun") {

    // Full 64x64px rendering for harpoon gun (similar to crossbow positioning)
    const harpoonGunScale = 1.0;
    displayItemWidth = itemImgFromCaller.width * harpoonGunScale;
    displayItemHeight = itemImgFromCaller.height * harpoonGunScale;

    switch (player.direction) {
      case 'up':
        itemOffsetX = gameConfig.spriteWidth * 0.25;
        itemOffsetY = -gameConfig.spriteHeight * 0.05;
        rotation = -Math.PI / 2; // Point harpoon gun upward
        break;
      case 'down':
        itemOffsetX = gameConfig.spriteWidth * -0.25;
        itemOffsetY = gameConfig.spriteHeight * 0.25;
        rotation = Math.PI / 2; // Point harpoon gun downward
        break;
      case 'left':
        itemOffsetX = -gameConfig.spriteWidth * 0.25;
        itemOffsetY = 0;
        rotation = Math.PI / 2; // Rotate counterclockwise 90°
        break;
      case 'right':
        itemOffsetX = gameConfig.spriteWidth * -0.25;
        itemOffsetY = 2.0;
        rotation = 0; // Point harpoon gun right
        break;
    }
    
    pivotX = player.positionX + shakeX + itemOffsetX;
    pivotY = player.positionY - jumpOffset + shakeY + itemOffsetY;

  } else {
    // Original logic for other items' pivot and default orientation
    switch (player.direction) {
        case 'up': 
            itemOffsetX = -handOffsetX * -2.5;
            itemOffsetY = handOffsetY * -1.0;
            pivotX += itemOffsetX;
            pivotY += itemOffsetY; 
            break;
        case 'down': 
            itemOffsetX = handOffsetX * -2.5;
            itemOffsetY = handOffsetY * 1.0; 
            pivotX += itemOffsetX;
            pivotY += itemOffsetY; 
            break;
        case 'left': 
            itemOffsetX = -handOffsetX * 1.5; 
            itemOffsetY = handOffsetY;
            pivotX += itemOffsetX; 
            pivotY += itemOffsetY; 
            break;
        case 'right': 
            itemOffsetX = handOffsetX * 0.5; 
            itemOffsetY = handOffsetY;
            pivotX += itemOffsetX;
            pivotY += itemOffsetY; 
            break;
    }
  }
  // --- End Item Size and Position adjustments ---

  // Store the pivot before animation for the thrust line visual and arc effects
  const preAnimationPivotX = pivotX;
  const preAnimationPivotY = pivotY;

  // --- Arrow/Dart Rendering for Loaded Bow/Crossbow/Harpoon Gun ---
  // Only show ammo when weapon is TRULY ready to fire (after reload cooldown)
  // The server sets isReadyToFire=true immediately on reload, but actual firing is blocked
  // by a cooldown based on reload_time_secs. We mirror this check client-side for accurate UX.
  // EXCEPTION: Reed Harpoon Gun works like a gun - dart shows immediately when loaded
  let loadedArrowImage: HTMLImageElement | undefined = undefined;
  const isRangedWeaponWithVisibleAmmo = itemDef.name === "Hunting Bow" || itemDef.name === "Crossbow" || itemDef.name === "Reed Harpoon Gun";
  if (isRangedWeaponWithVisibleAmmo && equipment.isReadyToFire && equipment.loadedAmmoDefId && itemDefinitions) {
    // Reed Harpoon Gun: No reload delay visual - dart shows immediately like a gun
    // Bows/Crossbows: Have reload animations so we wait for cooldown before showing ammo
    const isHarpoonGun = itemDef.name === "Reed Harpoon Gun";
    
    let reloadComplete = true; // Default to true for harpoon gun
    
    if (!isHarpoonGun) {
      // Check if reload cooldown has elapsed since last shot (swing_start_time_ms)
      // Hunting Bow: 850ms reload, Crossbow: 2300ms reload
      const HUNTING_BOW_RELOAD_MS = 850;
      const CROSSBOW_RELOAD_MS = 2300;
      let reloadTimeMs = itemDef.name === "Crossbow" ? CROSSBOW_RELOAD_MS : HUNTING_BOW_RELOAD_MS;
      
      const lastShotTimeMs = Number(equipment.swingStartTimeMs);
      const timeSinceLastShot = now_ms - lastShotTimeMs;
      reloadComplete = lastShotTimeMs === 0 || timeSinceLastShot >= reloadTimeMs;
    }
    
    if (reloadComplete) {
      const ammoDef = itemDefinitions.get(String(equipment.loadedAmmoDefId));
      if (ammoDef && ammoDef.iconAssetName) {
          loadedArrowImage = itemImages.get(ammoDef.iconAssetName); // Use ammo's icon
          if (!loadedArrowImage) {
              // console.warn(`[RenderEquipped] Image for loaded ammo '${ammoDef.iconAssetName}' not found.`);
          }
      }
    }
  }
  // --- END Arrow/Dart Rendering ---

  // --- Swing/Thrust Animation --- 
  const swingStartTime = Number(equipment.swingStartTimeMs);
  const playerId = player.identity.toHexString();
  const isLocalPlayer = localPlayerId && playerId === localPlayerId;
  let elapsedSwingTime = 0;
  let currentAngle = 0; 
  let thrustDistance = 0; 

  // CLIENT-AUTHORITATIVE SWING FOR LOCAL PLAYER
  // For the local player, check client-initiated swing FIRST for immediate feedback.
  // This eliminates the "bunched up swings" problem on high-latency connections.
  if (isLocalPlayer) {
    const clientSwingElapsed = getLocalPlayerSwingElapsed();
    const isInGracePeriod = shouldIgnoreServerSwing();
    
    if (clientSwingElapsed >= 0) {
      // Client-initiated swing is active - use it for immediate animation
      elapsedSwingTime = clientSwingElapsed;
      // IMPORTANT: Track the server swing time during client animation
      // so we don't replay it after animation ends or grace period expires
      if (swingStartTime > 0) {
        lastKnownServerSwingTimes.set(playerId, swingStartTime);
      }
    } else if (isInGracePeriod) {
      // In grace period after client animation completed - suppress any animation
      // but keep tracking server time to prevent re-triggering when grace period ends
      if (swingStartTime > 0) {
        lastKnownServerSwingTimes.set(playerId, swingStartTime);
      }
      // Set elapsed time beyond duration to ensure isSwinging = false
      // This prevents the "second swing" visual during grace period
      elapsedSwingTime = SWING_DURATION_MS + 1;
    } else if (swingStartTime > 0) {
      // Not in client animation or grace period - use server timestamps
      // This path is for server-authoritative swings that weren't covered by client animation
      const clientStartTime = clientSwingStartTimes.get(playerId);
      const lastKnownServerTime = lastKnownServerSwingTimes.get(playerId) || 0;
      
      if (swingStartTime !== lastKnownServerTime) {
        // NEW swing detected from server (different timestamp than what we tracked)
        lastKnownServerSwingTimes.set(playerId, swingStartTime);
        clientSwingStartTimes.set(playerId, now_ms);
        elapsedSwingTime = 0;
      } else if (clientStartTime) {
        // Continue existing server-tracked swing animation
        elapsedSwingTime = now_ms - clientStartTime;
      } else {
        // Server has a swing time we've already handled via client animation - don't animate
        elapsedSwingTime = SWING_DURATION_MS + 1;
      }
    } else {
      // No active swing at all (server swing time is 0) - clean up tracking
      clientSwingStartTimes.delete(playerId);
      lastKnownServerSwingTimes.delete(playerId);
      elapsedSwingTime = SWING_DURATION_MS + 1; // Ensure no animation
    }
  } else {
    // SERVER-AUTHORITATIVE for other players (we don't predict their actions)
    if (swingStartTime > 0) {
      const clientStartTime = clientSwingStartTimes.get(playerId);
      const lastKnownServerTime = lastKnownServerSwingTimes.get(playerId) || 0;
      
      if (swingStartTime !== lastKnownServerTime) {
        // NEW swing detected! Record both server time and client time
        lastKnownServerSwingTimes.set(playerId, swingStartTime);
        clientSwingStartTimes.set(playerId, now_ms);
        elapsedSwingTime = 0;
      } else if (clientStartTime) {
        // Use client-tracked time for animation
        elapsedSwingTime = now_ms - clientStartTime;
      }
    } else {
      // Clean up tracking for this player if no active swing
      clientSwingStartTimes.delete(playerId);
      lastKnownServerSwingTimes.delete(playerId);
    }
  }

  if (elapsedSwingTime < SWING_DURATION_MS) {
      isSwinging = true; 
      const swingProgress = elapsedSwingTime / SWING_DURATION_MS;
      
      if (itemDef.name === "Wooden Spear" || itemDef.name === "Stone Spear" || itemDef.name === "Reed Harpoon") {
          isSpearThrusting = true;
          const SPEAR_MAX_THRUST_EXTENSION = (itemDef as any).attackRange || 100; 
          thrustDistance = Math.sin(swingProgress * Math.PI) * SPEAR_MAX_THRUST_EXTENSION;
          
          // Apply thrust directly to pivotX/pivotY based on world direction
          // The `rotation` variable (which is spearRotation) is for the visual angle.
          switch (player.direction) {
            case 'up':    pivotY -= thrustDistance; break;
            case 'down':  pivotY += thrustDistance; break;
            case 'left':  pivotX -= thrustDistance; break;
            case 'right': pivotX += thrustDistance; break;
          }
          // `rotation` (which is spearRotation) is already set for the spear's pointing direction from earlier logic.
      } else {
          // Swing animation for other items. 
          // currentAngle will be negative or zero, representing a CCW swing if positive was CW (and backwards).
          // Use per-weapon swing angle - Scythe has wider 120° arc, most weapons use 90°
          const weaponSwingAngle = getSwingAngleMaxRad(itemDef);
          currentAngle = -(Math.sin(swingProgress * Math.PI) * weaponSwingAngle);
          // The 'rotation' variable is used for the slash arc. It should match the item's swing direction.
          // Don't override rotation for ranged weapons - they should maintain their directional orientation
          if (itemDef.name !== "Hunting Bow" && itemDef.name !== "Crossbow") {
            rotation = currentAngle; 
          }
      }
  }
  
  // --- Resolve the correct image to render ---
  let imageToRender: HTMLImageElement | undefined = itemImgFromCaller;
  if (itemDef.name === "Torch" && equipment.iconAssetName) {
    const specificTorchImage = itemImages.get(equipment.iconAssetName);
    if (specificTorchImage) {
      imageToRender = specificTorchImage;
    } else {
      console.warn(`[renderEquippedItem] Image for torch state '${equipment.iconAssetName}' not found in itemImages map. Falling back.`);
    }
  }

  if (!imageToRender) {
    return;
  }
  // --- End Image Resolution ---

  ctx.save(); // Overall item rendering context save (applies to pivot translation and general orientation)
  
  // Apply teal underwater tint when snorkeling (consistent with other underwater entities)
  if (applyUnderwaterTint) {
    ctx.filter = 'sepia(20%) hue-rotate(140deg) saturate(120%)';
  }
  
  ctx.translate(pivotX, pivotY); 

  // Apply general orientation/scaling based on player direction (and spear specifics)
  if (itemDef.name === "Wooden Spear" || itemDef.name === "Stone Spear" || itemDef.name === "Reed Harpoon") {
    ctx.rotate(rotation); // `rotation` is pre-calculated spearRotation
    ctx.scale(spearScaleX, spearScaleY);
  } else if (itemDef.name === "Hunting Bow") {
    ctx.rotate(rotation); // Apply calculated bow rotation
    ctx.scale(-1, 1); // Flip horizontally
  } else if (itemDef.name === "Crossbow") {
    ctx.rotate(rotation); // Apply calculated crossbow rotation
    ctx.scale(-1, 1); // Flip horizontally
  } else if (itemDef.name === "Reed Harpoon Gun") {
    ctx.rotate(rotation); // Apply calculated harpoon gun rotation
    // Apply direction-specific flipping for proper orientation
    switch (player.direction) {
      case 'up':
        ctx.scale(-1, 1); // Flip vertically when facing up
        break;
      case 'left':
        ctx.scale(-1, 1); // Flip vertically when facing left
        break;
      case 'down':
        ctx.scale(-1, -1); // Flip horizontally when facing down
        break;
      case 'right':
        ctx.scale(-1, 1); // Flip horizontally when facing right
        break;
    }
  } else {
    // Non-spear items might have a different base orientation/flip before animation
    // Ensure this scale doesn't affect bandage animation logic if it's drawn separately with its own save/restore
    if (player.direction === 'right' || player.direction === 'up') {
       if (itemDef.name !== "Bandage" && itemDef.name !== "Selo Olive Oil") { // Don't apply this generic flip if it's a bandage or Selo Olive Oil that will handle its own drawing
            ctx.scale(-1, 1); 
       }
    }
  }

  // --- BANDAGE ANIMATION & DRAWING --- 
  let bandageDrawnWithAnimation = false;
  let bandagingStartTimeMs: number | null = null;
  let bandageEffectStillActive = false;

  // Only show bandage animation if we have both an active effect AND the bandage is actually equipped
  if (itemDef.name === "Bandage" && activeConsumableEffects && player.identity) {
    const playerHexId = player.identity.toHexString();
    for (const effect of activeConsumableEffects.values()) {
      // Show animation if player is healing themselves or someone else with this equipped bandage
      if ((effect.effectType.tag === "BandageBurst" && effect.playerId.toHexString() === playerHexId) ||
          (effect.effectType.tag === "RemoteBandageBurst" && effect.playerId.toHexString() === playerHexId)) {
        bandagingStartTimeMs = Number(effect.startedAt.microsSinceUnixEpoch / 1000n);
        
        // Check if the effect is still active by comparing current time with effect end time
        const effectEndTimeMs = Number(effect.endsAt.microsSinceUnixEpoch / 1000n);
        bandageEffectStillActive = now_ms < effectEndTimeMs;
        break;
      }
    }
  }

  // Only animate if both the effect is still active AND within the animation duration
  if (itemDef.name === "Bandage" && bandagingStartTimeMs !== null && bandageEffectStillActive) {
    const elapsedBandagingTime = now_ms - bandagingStartTimeMs;
    if (elapsedBandagingTime >= 0 && elapsedBandagingTime < BANDAGING_ANIMATION_DURATION_MS) {
      const animationProgress = elapsedBandagingTime / BANDAGING_ANIMATION_DURATION_MS;
      const bandagingRotation = Math.sin(animationProgress * Math.PI * BANDAGING_WOBBLES * 2) * BANDAGING_MAX_ROTATION_RAD;
      
      ctx.save(); // Save for bandage specific animation transforms
      // Bandage rotation is applied here. Pivot is already at item center due to prior ctx.translate(pivotX, pivotY)
      // and items are drawn relative to -itemWidth/2, -itemHeight/2.
      ctx.rotate(bandagingRotation); // Apply the wobble
      ctx.drawImage(imageToRender, -itemWidth / 2, -itemHeight / 2, itemWidth, itemHeight); // Draw centered & rotated bandage
      ctx.restore(); // Restore from bandage specific animation
      bandageDrawnWithAnimation = true;
    }
  }
  // --- END BANDAGE ANIMATION & DRAWING --- 

  // --- SELO OLIVE OIL ANIMATION & DRAWING --- 
  let seloOliveOilDrawnWithAnimation = false;
  let seloOliveOilStartTimeMs: number | null = null;
  let seloOliveOilEffectStillActive = false;

  // Only show Selo Olive Oil animation if we have both an active effect AND the Selo Olive Oil is actually equipped
  if (itemDef.name === "Selo Olive Oil" && activeConsumableEffects && player.identity) {
    const playerHexId = player.identity.toHexString();
    for (const effect of activeConsumableEffects.values()) {
      // Show animation if player is using Selo Olive Oil (HealthRegen effect with 2-second duration)
      if (effect.effectType.tag === "HealthRegen" && effect.playerId.toHexString() === playerHexId) {
        // Check if this is a short-duration effect (2 seconds for Selo Olive Oil vs longer for other items)
        const effectDurationMs = Number(effect.endsAt.microsSinceUnixEpoch / 1000n) - Number(effect.startedAt.microsSinceUnixEpoch / 1000n);
        if (effectDurationMs <= 2500) { // 2.5 seconds to account for slight timing variations
          seloOliveOilStartTimeMs = Number(effect.startedAt.microsSinceUnixEpoch / 1000n);
          
          // Check if the effect is still active by comparing current time with effect end time
          const effectEndTimeMs = Number(effect.endsAt.microsSinceUnixEpoch / 1000n);
          seloOliveOilEffectStillActive = now_ms < effectEndTimeMs;
          break;
        }
      }
    }
  }

  // Only animate if both the effect is still active AND within the animation duration
  if (itemDef.name === "Selo Olive Oil" && seloOliveOilStartTimeMs !== null && seloOliveOilEffectStillActive) {
    const elapsedSeloOliveOilTime = now_ms - seloOliveOilStartTimeMs;
    if (elapsedSeloOliveOilTime >= 0 && elapsedSeloOliveOilTime < SELO_OLIVE_OIL_ANIMATION_DURATION_MS) {
      const animationProgress = elapsedSeloOliveOilTime / SELO_OLIVE_OIL_ANIMATION_DURATION_MS;
      const seloOliveOilRotation = Math.sin(animationProgress * Math.PI * SELO_OLIVE_OIL_WOBBLES * 2) * SELO_OLIVE_OIL_MAX_ROTATION_RAD;
      
      ctx.save(); // Save for Selo Olive Oil specific animation transforms
      // Selo Olive Oil rotation is applied here. Pivot is already at item center due to prior ctx.translate(pivotX, pivotY)
      // and items are drawn relative to -itemWidth/2, -itemHeight/2.
      ctx.rotate(seloOliveOilRotation); // Apply the wobble
      ctx.drawImage(imageToRender, -itemWidth / 2, -itemHeight / 2, itemWidth, itemHeight); // Draw centered & rotated Selo Olive Oil
      ctx.restore(); // Restore from Selo Olive Oil specific animation
      seloOliveOilDrawnWithAnimation = true;
    }
  }
  // --- END SELO OLIVE OIL ANIMATION & DRAWING ---

  // --- WATER DRINKING ANIMATION & DRAWING ---
  let waterDrinkingDrawnWithAnimation = false;
  let waterDrinkingStartTimeMs: number | null = null;
  let waterDrinkingEffectStillActive = false;

  // Only show water drinking animation if we have both an active effect AND a water container is actually equipped
  if ((itemDef.name === "Reed Water Bottle" || itemDef.name === "Plastic Water Jug") && activeConsumableEffects && player.identity) {
    const playerHexId = player.identity.toHexString();
    for (const effect of activeConsumableEffects.values()) {
      // Show animation if player is drinking water (WaterDrinking effect with 2-second duration)
      if (effect.effectType.tag === "WaterDrinking" && effect.playerId.toHexString() === playerHexId) {
        waterDrinkingStartTimeMs = Number(effect.startedAt.microsSinceUnixEpoch / 1000n);
        
        // Check if the effect is still active by comparing current time with effect end time
        const effectEndTimeMs = Number(effect.endsAt.microsSinceUnixEpoch / 1000n);
        waterDrinkingEffectStillActive = now_ms < effectEndTimeMs;
        break;
      }
    }
  }

  // Only animate if both the effect is still active AND within the animation duration
  if ((itemDef.name === "Reed Water Bottle" || itemDef.name === "Plastic Water Jug") && waterDrinkingStartTimeMs !== null && waterDrinkingEffectStillActive) {
    const elapsedWaterDrinkingTime = now_ms - waterDrinkingStartTimeMs;
    if (elapsedWaterDrinkingTime >= 0 && elapsedWaterDrinkingTime < WATER_DRINKING_ANIMATION_DURATION_MS) {
      const animationProgress = elapsedWaterDrinkingTime / WATER_DRINKING_ANIMATION_DURATION_MS;
      const waterDrinkingRotation = Math.sin(animationProgress * Math.PI * WATER_DRINKING_WOBBLES * 2) * WATER_DRINKING_MAX_ROTATION_RAD;
      
      ctx.save(); // Save for water drinking specific animation transforms
      // Water drinking rotation is applied here. Pivot is already at item center due to prior ctx.translate(pivotX, pivotY)
      // and items are drawn relative to -itemWidth/2, -itemHeight/2.
      ctx.rotate(waterDrinkingRotation); // Apply the wobble
      ctx.drawImage(imageToRender, -itemWidth / 2, -itemHeight / 2, itemWidth, itemHeight); // Draw centered & rotated water container
      ctx.restore(); // Restore from water drinking specific animation
      waterDrinkingDrawnWithAnimation = true;
    }
  }
  // --- END WATER DRINKING ANIMATION & DRAWING ---

  // --- REGULAR ITEM DRAWING (AND SWING FOR NON-SPEAR/NON-BANDAGE-ANIMATING) --- 
  if (!bandageDrawnWithAnimation && !seloOliveOilDrawnWithAnimation && !waterDrinkingDrawnWithAnimation) {
    ctx.save(); // Save for regular item drawing / swing
    if (itemDef.name !== "Wooden Spear" && itemDef.name !== "Stone Spear" && itemDef.name !== "Reed Harpoon" && itemDef.name !== "Bandage" && itemDef.name !== "Selo Olive Oil"
        && itemDef.name?.toLowerCase() !== "hunting bow" && itemDef.category?.tag !== "RangedWeapon") {
      ctx.rotate(currentAngle); 
    }
    
    ctx.drawImage(imageToRender, -displayItemWidth / 2, -displayItemHeight / 2, displayItemWidth, displayItemHeight); // Draw centered

    // --- NEW: Draw Loaded Arrow on Bow ---
    if (loadedArrowImage && itemDef.name === "Hunting Bow") {
        const arrowScale = 0.7; // Match projectile size
        const arrowWidth = loadedArrowImage.width * arrowScale;
        const arrowHeight = loadedArrowImage.height * arrowScale;
        // Arrow position and rotation settings per player direction
        let arrowOffsetX = 0; // Independent arrow position
        let arrowOffsetY = 0;
        let arrowRotation = 0; // Independent arrow rotation
        
        switch (player.direction) {
            case 'up':
                arrowOffsetX = -displayItemWidth * 0.15; 
                arrowOffsetY = -displayItemHeight * -0.15; // Arrow nocked further up
                arrowRotation = -Math.PI / 2; // Point arrow upward
                break;
            case 'down':
                arrowOffsetX = displayItemWidth * -0.15;  // Mirrored horizontally
                arrowOffsetY = -displayItemHeight * -0.15; // Mirrored vertically
                arrowRotation = -Math.PI / 2; // Mirrored rotation
                break;
            case 'left':
                arrowOffsetX = displayItemWidth * 0.0; 
                arrowOffsetY = -displayItemHeight * -0.15;
                arrowRotation = Math.PI + (Math.PI / 2); // Point arrow left and rotate 45 degrees counterclockwise
                break;
            case 'right':
                arrowOffsetX = -displayItemWidth * 0.0; 
                arrowOffsetY = -displayItemHeight * 0.0;
                arrowRotation = Math.PI + (Math.PI / 2); // Point arrow left and rotate 45 degrees counterclockwise
                break;
        }
        
        // Draw arrow with independent rotation
        ctx.save(); // Save current context for arrow-specific transforms
        ctx.translate(arrowOffsetX, arrowOffsetY); // Move to arrow position
        ctx.rotate(arrowRotation); // Apply independent arrow rotation
        ctx.drawImage(loadedArrowImage, -arrowWidth / 2, -arrowHeight / 2, arrowWidth, arrowHeight);
        ctx.restore(); // Restore context
    }
    
    // --- NEW: Draw Loaded Arrow on Crossbow ---
    if (loadedArrowImage && itemDef.name === "Crossbow") {
        const arrowScale = 0.7; // Match projectile size
        const arrowWidth = loadedArrowImage.width * arrowScale;
        const arrowHeight = loadedArrowImage.height * arrowScale;
        // Arrow position and rotation settings per player direction
        let arrowOffsetX = 0; // Independent arrow position
        let arrowOffsetY = 0;
        let arrowRotation = 0; // Independent arrow rotation
        
        switch (player.direction) {
            case 'up':
                arrowOffsetX = -displayItemWidth * 0.15; 
                arrowOffsetY = -displayItemHeight * -0.15; // Arrow nocked further up
                arrowRotation = -Math.PI / 2; // Point arrow upward
                break;
            case 'down':
                arrowOffsetX = displayItemWidth * -0.15;  // Mirrored horizontally
                arrowOffsetY = -displayItemHeight * -0.15; // Mirrored vertically
                arrowRotation = -Math.PI / 2; // Mirrored rotation
                break;
            case 'left':
                arrowOffsetX = displayItemWidth * 0.0; 
                arrowOffsetY = -displayItemHeight * -0.15;
                arrowRotation = Math.PI + (Math.PI / 2); // Point arrow left and rotate 45 degrees counterclockwise
                break;
            case 'right':
                arrowOffsetX = -displayItemWidth * 0.0; 
                arrowOffsetY = -displayItemHeight * 0.0;
                arrowRotation = Math.PI + (Math.PI / 2); // Point arrow left and rotate 45 degrees counterclockwise
                break;
        }
        
        // Draw bolt with independent rotation
        ctx.save(); // Save current context for bolt-specific transforms
        ctx.translate(arrowOffsetX, arrowOffsetY); // Move to bolt position
        ctx.rotate(arrowRotation); // Apply independent bolt rotation
        ctx.drawImage(loadedArrowImage, -arrowWidth / 2, -arrowHeight / 2, arrowWidth, arrowHeight);
        ctx.restore(); // Restore context
    }
    
    // --- NEW: Draw Loaded Dart on Reed Harpoon Gun ---
    if (loadedArrowImage && itemDef.name === "Reed Harpoon Gun") {
        const dartScale = 0.7; // Match projectile size
        const dartWidth = loadedArrowImage.width * dartScale;
        const dartHeight = loadedArrowImage.height * dartScale;
        // Dart position and rotation settings per player direction
        let dartOffsetX = 0; // Independent dart position
        let dartOffsetY = 0;
        let dartRotation = 0; // Independent dart rotation
        
        switch (player.direction) {
            case 'up':
                dartOffsetX = -displayItemWidth * 0.15; 
                dartOffsetY = -displayItemHeight * -0.15;
                dartRotation = -Math.PI / 2; // Point dart upward
                break;
            case 'down':
                dartOffsetX = displayItemWidth * -0.15;
                dartOffsetY = -displayItemHeight * -0.15;
                dartRotation = -Math.PI / 2;
                break;
            case 'left':
                dartOffsetX = displayItemWidth * 0.0; 
                dartOffsetY = -displayItemHeight * -0.15;
                dartRotation = Math.PI + (Math.PI / 2);
                break;
            case 'right':
                dartOffsetX = -displayItemWidth * 0.0; 
                dartOffsetY = -displayItemHeight * 0.0;
                dartRotation = Math.PI + (Math.PI / 2);
                break;
        }
        
        // Draw dart with independent rotation
        ctx.save(); // Save current context for dart-specific transforms
        ctx.translate(dartOffsetX, dartOffsetY); // Move to dart position
        ctx.rotate(dartRotation); // Apply independent dart rotation
        ctx.drawImage(loadedArrowImage, -dartWidth / 2, -dartHeight / 2, dartWidth, dartHeight);
        ctx.restore(); // Restore context
    }
    // --- END NEW ---

    ctx.restore(); // Restore from regular item drawing / swing
  }

  ctx.restore(); // Restore overall item rendering context (matches the first ctx.save() in this block)

  // Note: Underwater tinting for equipped items now uses CSS filter (ctx.filter) applied at the start
  // of this function. This approach is consistent with other underwater entities (coral, fumaroles,
  // seaweed, dropped items) and avoids the visual artifacts that the old offscreen canvas approach caused.

  // --- Draw Attack Visual Effect --- 
  if (isSwinging) { 
    // Get the weapon's actual attack range and arc for the range indicator
    const weaponParams = getWeaponAttackParams(itemDef);
    const attackRange = weaponParams.range;
    const attackArcDegrees = weaponParams.arcDegrees;
    const attackArcRad = (attackArcDegrees / 2) * (Math.PI / 180);
    
    // Use server-synced direction for attack arc (matches what server actually uses for hit detection)
    // This prevents visual mismatch when player turns quickly before/during attack
    const attackDirection = serverSyncedDirection || player.direction;
    
    // Calculate the base facing angle for the attack arc
    let facingAngle = 0;
    switch(attackDirection) {
      case 'up':    facingAngle = -Math.PI / 2; break;
      case 'down':  facingAngle = Math.PI / 2;  break;
      case 'left':  facingAngle = Math.PI;      break;
      case 'right': facingAngle = 0;            break;
    }
    
    // Calculate swing progress for arc animation (0 to 1 to 0)
    const swingProgress = elapsedSwingTime / SWING_DURATION_MS;
    const arcOpacity = Math.sin(swingProgress * Math.PI); // Fade in then out
    
    // === DRAW ATTACK RANGE ARC (the actual hit zone) ===
    ctx.save();
    try {
      // Arc sweeps from one side to the other during swing
      const arcStartAngle = facingAngle - attackArcRad;
      const arcEndAngle = facingAngle + attackArcRad;
      
      // Draw filled arc (hit zone visualization)
      ctx.beginPath();
      ctx.moveTo(player.positionX, player.positionY);
      ctx.arc(player.positionX, player.positionY, attackRange, arcStartAngle, arcEndAngle);
      ctx.closePath();
      
      // Fill with gradient from center to edge
      const gradient = ctx.createRadialGradient(
        player.positionX, player.positionY, attackRange * 0.3,
        player.positionX, player.positionY, attackRange
      );
      gradient.addColorStop(0, `rgba(255, 200, 100, ${0.05 * arcOpacity})`);
      gradient.addColorStop(0.7, `rgba(255, 180, 80, ${0.15 * arcOpacity})`);
      gradient.addColorStop(1, `rgba(255, 150, 50, ${0.25 * arcOpacity})`);
      ctx.fillStyle = gradient;
      ctx.fill();
      
      // Draw arc outline at the attack range edge
      ctx.beginPath();
      ctx.arc(player.positionX, player.positionY, attackRange, arcStartAngle, arcEndAngle);
      ctx.strokeStyle = `rgba(255, 200, 100, ${0.6 * arcOpacity})`;
      ctx.lineWidth = ARC_EFFECT_LINE_WIDTH;
      ctx.stroke();
      
      // Draw the arc edge lines (from player to arc endpoints)
      ctx.beginPath();
      ctx.moveTo(player.positionX, player.positionY);
      ctx.lineTo(
        player.positionX + Math.cos(arcStartAngle) * attackRange,
        player.positionY + Math.sin(arcStartAngle) * attackRange
      );
      ctx.moveTo(player.positionX, player.positionY);
      ctx.lineTo(
        player.positionX + Math.cos(arcEndAngle) * attackRange,
        player.positionY + Math.sin(arcEndAngle) * attackRange
      );
      ctx.strokeStyle = `rgba(255, 180, 80, ${0.4 * arcOpacity})`;
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Draw a "sweep line" that moves through the arc during swing
      const sweepAngle = facingAngle + (attackArcRad * 2 * (swingProgress - 0.5)); // Sweep from left to right
      ctx.beginPath();
      ctx.moveTo(player.positionX, player.positionY);
      ctx.lineTo(
        player.positionX + Math.cos(sweepAngle) * attackRange,
        player.positionY + Math.sin(sweepAngle) * attackRange
      );
      ctx.strokeStyle = `rgba(255, 255, 200, ${0.7 * arcOpacity})`;
      ctx.lineWidth = 2;
      ctx.stroke();
      
    } finally {
      ctx.restore();
    }
    // === END ATTACK RANGE ARC ===
    
    if (itemDef.name === "Wooden Spear" || itemDef.name === "Stone Spear" || itemDef.name === "Reed Harpoon") {
        // Draw a "thrust line" effect for the spear
        ctx.save();
        try {
            ctx.beginPath();
            const spearLength = Math.max(displayItemWidth, displayItemHeight); 
            
            const lineStartX = preAnimationPivotX; // Start from the hand position
            const lineStartY = preAnimationPivotY;

            // Endpoint calculation needs to use the final spearRotation and the current thrusted pivot
            // The line should go from the hand to the spear's current (thrusted) base.
            const lineEndX = pivotX; // Current base of the spear after thrust
            const lineEndY = pivotY;
            
            ctx.moveTo(lineStartX, lineStartY);
            ctx.lineTo(lineEndX, lineEndY);
            
            ctx.strokeStyle = 'rgba(220, 220, 255, 0.65)'; 
            ctx.lineWidth = SLASH_LINE_WIDTH - 1.5; 
            ctx.stroke();
        } finally {
            ctx.restore();
        }
    } else if (itemDef.name?.toLowerCase() !== "hunting bow" && itemDef.category?.tag !== "RangedWeapon") {
      // Original slash arc effect for non-spear, non-ranged weapons (small arc around weapon)
      ctx.save();
      try {
          const slashRadius = Math.max(displayItemWidth, displayItemHeight) * 0.5; 
          let slashStartAngle = 0;
          
          switch(player.direction) {
              case 'up':    slashStartAngle = -Math.PI / 2; break;
              case 'down':  slashStartAngle = Math.PI / 2;  break;
              case 'left':  slashStartAngle = Math.PI;      break;
              case 'right': slashStartAngle = 0;            break;
          }
          // `rotation` here is the dynamic currentAngle of the swing for non-spears
          const slashEndAngle = slashStartAngle + rotation; 
          const counterClockwise = rotation < 0;

          ctx.beginPath();
          // Draw arc centered on the item's pre-swing pivot point (hand position)
          ctx.arc(preAnimationPivotX, preAnimationPivotY, slashRadius, slashStartAngle, slashEndAngle, counterClockwise);
          ctx.strokeStyle = SLASH_COLOR;
          ctx.lineWidth = SLASH_LINE_WIDTH;
          ctx.stroke();
      } finally {
          ctx.restore();
      }
    }
  }
  // --- End Attack Visual Effect ---

}; 