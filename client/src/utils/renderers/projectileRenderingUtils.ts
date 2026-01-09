import { Projectile as SpacetimeDBProjectile } from '../../generated';

// Full 64x64px rendering for all projectiles
const DEFAULT_ARROW_SCALE = 0.7; // Full size arrows (Hunting Bow)
const CROSSBOW_ARROW_SCALE = 0.7; // Full size crossbow bolts
const BULLET_SCALE = 0.35; // Half size bullets from pistols (was 0.7)
const DEFAULT_THROWN_SCALE = 0.7; // Full size thrown items
const WEAPON_THROWN_SCALE = 1.0; // Full size thrown weapons (melee weapons like combat ladle)
const ARROW_SPRITE_OFFSET_X = 0; // Pixels to offset drawing from calculated center, if sprite isn't centered
const ARROW_SPRITE_OFFSET_Y = 0; // Pixels to offset drawing from calculated center, if sprite isn't centered

const GRAVITY: number = 600.0; // Same as server-side

// Client-side projectile lifetime limits for cleanup (in case server is slow)
const MAX_PROJECTILE_LIFETIME_MS = 12000; // 12 seconds max
const MAX_PROJECTILE_DISTANCE = 1200; // Max distance before client cleanup

// --- Client-side animation tracking for projectiles ---
const clientProjectileStartTimes = new Map<string, number>(); // projectileId -> client timestamp when projectile started
const lastKnownServerProjectileTimes = new Map<string, number>(); // projectileId -> last known server timestamp

interface RenderProjectileProps {
  ctx: CanvasRenderingContext2D;
  projectile: SpacetimeDBProjectile;
  arrowImage: HTMLImageElement;
  currentTimeMs: number;
  itemDefinitions?: Map<string, any>; // NEW: Add itemDefinitions to determine weapon type
  applyUnderwaterTint?: boolean; // Apply teal underwater tint when projectile is underwater
}

export const renderProjectile = ({
  ctx,
  projectile,
  arrowImage,
  currentTimeMs,
  itemDefinitions, // NEW: Add itemDefinitions parameter
  applyUnderwaterTint = false, // Apply teal underwater tint when projectile is underwater
}: RenderProjectileProps) => {
  if (!arrowImage || !arrowImage.complete || arrowImage.naturalHeight === 0) {
    console.warn('[DEBUG] Arrow image not loaded or invalid for projectile:', projectile.id);
    return;
  }

  const projectileId = projectile.id.toString();
  const serverStartTimeMicros = Number(projectile.startTime.microsSinceUnixEpoch);
  const serverStartTimeMs = serverStartTimeMicros / 1000;
  
  // Check if this is a NEW projectile by checking if we've tracked it before
  let clientStartTime = clientProjectileStartTimes.get(projectileId);
  let elapsedTimeSeconds = 0;
  
  if (!clientStartTime) {
    // NEW projectile detected! Initialize tracking
    console.log(`🏹 NEW projectile ${projectileId.substring(0, 8)}: initializing at current time`);
    clientStartTime = currentTimeMs;
    clientProjectileStartTimes.set(projectileId, clientStartTime);
    lastKnownServerProjectileTimes.set(projectileId, serverStartTimeMs);
    elapsedTimeSeconds = 0; // Start at 0 for immediate rendering
  } else {
    // Existing projectile - calculate elapsed time from client start
    const elapsedClientMs = currentTimeMs - clientStartTime;
    elapsedTimeSeconds = elapsedClientMs / 1000;
  }
  
  // Safety check: Don't allow negative elapsed time
  if (elapsedTimeSeconds < 0) {
    elapsedTimeSeconds = 0;
  }
  
  // Client-side safety checks to prevent projectiles from lingering indefinitely
  const distanceTraveled = Math.sqrt(
    Math.pow(projectile.startPosX - (projectile.startPosX + projectile.velocityX * elapsedTimeSeconds), 2) +
    Math.pow(projectile.startPosY - (projectile.startPosY + projectile.velocityY * elapsedTimeSeconds), 2)
  );
  
  // Don't render if projectile has exceeded reasonable limits (client-side cleanup)
  if (elapsedTimeSeconds > 15 || distanceTraveled > MAX_PROJECTILE_DISTANCE) {
    console.log(`🏹 [CLIENT CLEANUP] Projectile ${projectileId.substring(0, 8)} exceeded limits - Time: ${elapsedTimeSeconds.toFixed(1)}s, Distance: ${distanceTraveled.toFixed(1)}`);
    // Clean up tracking for this projectile
    clientProjectileStartTimes.delete(projectileId);
    lastKnownServerProjectileTimes.delete(projectileId);
    return;
  }
  
  // Check if this is a thrown item (ammo_def_id == item_def_id)
  const isThrown = projectile.ammoDefId === projectile.itemDefId;
  
  // FIXED: Determine gravity multiplier based on weapon type (matching server physics)
  let gravityMultiplier = 1.0; // Default for bows
  let isBullet = false; // Track if this is a bullet for smaller rendering
  if (itemDefinitions) {
    const weaponDef = itemDefinitions.get(projectile.itemDefId.toString());
    if (weaponDef) {
      if (weaponDef.name === "Crossbow") {
        gravityMultiplier = 0.0; // Crossbow projectiles have NO gravity effect (straight line)
      } else if (weaponDef.name === "Makarov PM" || weaponDef.name === "PP-91 KEDR") {
        gravityMultiplier = 0.15; // Firearm projectiles have minimal gravity effect (fast arc)
        isBullet = true;
      }
    }
  }
  
  // Calculate current position with sub-pixel precision
  const currentX = projectile.startPosX + (projectile.velocityX * elapsedTimeSeconds);
  // FIXED: Apply gravity with correct multiplier based on weapon type
  const finalGravityMultiplier = isThrown ? 0.0 : gravityMultiplier;
  const gravityEffect = 0.5 * GRAVITY * finalGravityMultiplier * elapsedTimeSeconds * elapsedTimeSeconds;
  const currentY = projectile.startPosY + (projectile.velocityY * elapsedTimeSeconds) + gravityEffect;

  // Calculate rotation based on velocity vector
  let angle: number;
  if (isThrown) {
    // Check if this is a spear/harpoon type weapon (should fly straight, not spin)
    let isSpearType = false;
    if (itemDefinitions) {
      const thrownItemDef = itemDefinitions.get(projectile.itemDefId.toString());
      if (thrownItemDef) {
        const name = thrownItemDef.name;
        isSpearType = name === "Wooden Spear" || name === "Stone Spear" || name === "Reed Harpoon";
      }
    }
    
    if (isSpearType) {
      // Spears and harpoons fly straight, pointing in direction of travel
      angle = Math.atan2(projectile.velocityY, projectile.velocityX) + (Math.PI / 4);
    } else {
      // Other thrown items (skulls, clubs, etc.) spin while flying
      const baseAngle = Math.atan2(projectile.velocityY, projectile.velocityX) + (Math.PI / 4);
      const spinSpeed = 8.0; // Rotations per second - adjust for desired spin rate
      const spinAngle = spinSpeed * 2 * Math.PI * elapsedTimeSeconds;
      angle = baseAngle + spinAngle;
    }
  } else {
    // FIXED: Calculate rotation based on instantaneous velocity vector with correct gravity
    const instantaneousVelocityY = projectile.velocityY + GRAVITY * finalGravityMultiplier * elapsedTimeSeconds;
    angle = Math.atan2(instantaneousVelocityY, projectile.velocityX) + (Math.PI / 4);
  }

  // Determine scale dynamically based on item definition to match equipped item rendering
  let scale: number;
  if (isBullet) {
    scale = BULLET_SCALE; // Bullets stay small
  } else if (isThrown) {
    // Thrown items: match equipped item scale (0.9 for weapons, 0.7 for non-weapons)
    if (itemDefinitions) {
      const thrownItemDef = itemDefinitions.get(projectile.itemDefId.toString());
      if (thrownItemDef) {
        const isMeleeWeapon = thrownItemDef.category?.tag === "Weapon";
        scale = isMeleeWeapon ? WEAPON_THROWN_SCALE : DEFAULT_THROWN_SCALE;
      } else {
        scale = DEFAULT_THROWN_SCALE; // Default if definition not found
      }
    } else {
      scale = DEFAULT_THROWN_SCALE; // Default if itemDefinitions not provided
    }
  } else {
    // Arrows: match equipped arrow scale (0.3 for bow, 0.28 for crossbow)
    if (itemDefinitions) {
      const weaponDef = itemDefinitions.get(projectile.itemDefId.toString());
      if (weaponDef?.name === "Crossbow") {
        scale = CROSSBOW_ARROW_SCALE;
      } else {
        scale = DEFAULT_ARROW_SCALE; // Default to bow arrow scale
      }
    } else {
      scale = DEFAULT_ARROW_SCALE; // Default if itemDefinitions not provided
    }
  }
  
  const drawWidth = arrowImage.naturalWidth * scale;
  const drawHeight = arrowImage.naturalHeight * scale;

  ctx.save();
  
  // Apply teal underwater tint when projectile is underwater (consistent with other underwater entities)
  if (applyUnderwaterTint) {
    ctx.filter = 'sepia(20%) hue-rotate(140deg) saturate(120%)';
  }
  
  // Use sub-pixel positioning for smoother movement
  ctx.translate(Math.round(currentX * 10) / 10 + ARROW_SPRITE_OFFSET_X, Math.round(currentY * 10) / 10 + ARROW_SPRITE_OFFSET_Y);
  ctx.rotate(angle);
  ctx.scale(-1, 1); // Flip horizontally for correct arrow orientation
  
  // Draw the image centered on its new origin
  ctx.drawImage(
    arrowImage,
    -drawWidth / 2, 
    -drawHeight / 2,
    drawWidth,
    drawHeight
  );
  
  ctx.restore();
};

// Add cleanup function to prevent memory leaks
export const cleanupOldProjectileTracking = () => {
  const currentTime = performance.now();
  const toDelete = [];
  
  for (const [projectileId, startTime] of clientProjectileStartTimes.entries()) {
    if (currentTime - startTime > MAX_PROJECTILE_LIFETIME_MS) {
      toDelete.push(projectileId);
    }
  }
  
  for (const projectileId of toDelete) {
    clientProjectileStartTimes.delete(projectileId);
    lastKnownServerProjectileTimes.delete(projectileId);
  }
  
  if (toDelete.length > 0) {
    console.log(`🏹 [CLIENT CLEANUP] Removed ${toDelete.length} old projectile tracking entries`);
  }
};