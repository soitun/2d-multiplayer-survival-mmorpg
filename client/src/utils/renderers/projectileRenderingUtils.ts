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

// Projectile source type constants (must match server)
const PROJECTILE_SOURCE_PLAYER = 0;
const PROJECTILE_SOURCE_TURRET = 1;
const PROJECTILE_SOURCE_NPC = 2;
const PROJECTILE_SOURCE_MONUMENT_TURRET = 3;

// NPC projectile type constants (must match server)
const NPC_PROJECTILE_NONE = 0;
const NPC_PROJECTILE_SPECTRAL_SHARD = 1;  // Shardkin: blue/purple ice shard
const NPC_PROJECTILE_SPECTRAL_BOLT = 2;   // Shorebound: ghostly white bolt
const NPC_PROJECTILE_VENOM_SPITTLE = 3;   // Viper: green toxic glob

// Client-side projectile lifetime limits for cleanup (in case server is slow)
const MAX_PROJECTILE_LIFETIME_MS = 12000; // 12 seconds max
const MAX_PROJECTILE_DISTANCE = 1200; // Max distance before client cleanup
const PROJECTILE_TRACKING_DELETE_GRACE_MS = 750; // Grace period to survive brief subscription churn

// --- Client-side animation tracking for projectiles ---
const clientProjectileStartTimes = new Map<string, number>(); // projectileId -> client timestamp when projectile started
const projectileMissingSince = new Map<string, number>(); // projectileId -> first timestamp seen missing from current set

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
  // IMPORTANT: Check for NPC/turret projectiles FIRST - they use primitive rendering, not images
  const isNpcOrTurretProjectile = projectile.sourceType === PROJECTILE_SOURCE_NPC || 
                                   projectile.sourceType === PROJECTILE_SOURCE_TURRET ||
                                   projectile.sourceType === PROJECTILE_SOURCE_MONUMENT_TURRET;
  
  // If sprite isn't ready yet, keep rendering with a primitive fallback so
  // the projectile arc remains visible from spawn.
  const hasValidSprite = !!arrowImage && arrowImage.complete && arrowImage.naturalHeight > 0;
  const usePrimitiveSpriteFallback = !isNpcOrTurretProjectile && !hasValidSprite;

  const projectileId = projectile.id.toString();
  // Check if this is a NEW projectile by checking if we've tracked it before
  let clientStartTime = clientProjectileStartTimes.get(projectileId);
  let elapsedTimeSeconds = 0;
  
  if (clientStartTime === undefined) {
    // New projectile: start local visual time at frame of first receipt.
    // This keeps rendered trajectory aligned with where the projectile appears.
    clientStartTime = currentTimeMs;
    clientProjectileStartTimes.set(projectileId, clientStartTime);
    elapsedTimeSeconds = 0;
  } else {
    // Existing projectile - calculate elapsed time from client start
    const elapsedClientMs = currentTimeMs - clientStartTime;
    elapsedTimeSeconds = elapsedClientMs / 1000;
  }
  projectileMissingSince.delete(projectileId);
  
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
    // Clean up tracking for this projectile
    clientProjectileStartTimes.delete(projectileId);
    projectileMissingSince.delete(projectileId);
    return;
  }
  
  // Check if this is a thrown item (ammo_def_id == item_def_id)
  const isThrown = projectile.ammoDefId === projectile.itemDefId;
  
  // NOTE: isNpcOrTurretProjectile is already declared at the top of this function
  // (moved there to skip image validation for NPC/turret projectiles)
  
  // FIXED: Determine gravity multiplier based on weapon type (matching server physics)
  let gravityMultiplier = 1.0; // Default for bows
  let isBullet = false; // Track if this is a bullet for smaller rendering
  
  // NPC and turret projectiles use no gravity - they travel in straight lines
  if (isNpcOrTurretProjectile) {
    gravityMultiplier = 0.0;
  } else if (itemDefinitions) {
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
  
  const drawWidth = hasValidSprite ? arrowImage.naturalWidth * scale : 0;
  const drawHeight = hasValidSprite ? arrowImage.naturalHeight * scale : 0;

  ctx.save();
  
  // Check if this is an NPC projectile (source_type = 2)
  const isNpcProjectile = projectile.sourceType === PROJECTILE_SOURCE_NPC;
  
  if (isNpcProjectile) {
    // NPC projectile rendering (debug log removed for performance)
    
    // NPC projectiles use no gravity - they travel in straight lines
    // Render based on npc_projectile_type
    const npcType = projectile.npcProjectileType;
    
    if (npcType === NPC_PROJECTILE_SPECTRAL_SHARD) {
      // === SHARDKIN SPECTRAL SHARD ===
      // Blue/purple ice shard with crystalline trail
      const shardLength = 12;
      const shardWidth = 4;
      const rotation = Math.atan2(projectile.velocityY, projectile.velocityX);
      
      // Draw trailing particles
      const trailLength = 6;
      for (let i = 1; i < trailLength; i++) {
        const trailTime = elapsedTimeSeconds - (i * 0.03);
        if (trailTime < 0) continue;
        
        const trailX = projectile.startPosX + (projectile.velocityX * trailTime);
        const trailY = projectile.startPosY + (projectile.velocityY * trailTime);
        const alpha = 0.5 * (1 - i / trailLength);
        
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = `rgba(100, 180, 255, ${alpha})`;
        ctx.beginPath();
        ctx.arc(trailX, trailY, shardWidth * 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      
      // Draw main shard (diamond shape)
      ctx.save();
      ctx.translate(currentX, currentY);
      ctx.rotate(rotation);
      
      // Outer glow
      const glowGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, shardLength);
      glowGradient.addColorStop(0, 'rgba(150, 200, 255, 0.8)');
      glowGradient.addColorStop(0.5, 'rgba(100, 150, 255, 0.4)');
      glowGradient.addColorStop(1, 'rgba(80, 100, 200, 0)');
      ctx.fillStyle = glowGradient;
      ctx.beginPath();
      ctx.arc(0, 0, shardLength, 0, Math.PI * 2);
      ctx.fill();
      
      // Main shard body (elongated diamond)
      ctx.fillStyle = 'rgba(180, 220, 255, 0.9)';
      ctx.beginPath();
      ctx.moveTo(shardLength, 0);
      ctx.lineTo(0, shardWidth);
      ctx.lineTo(-shardLength * 0.4, 0);
      ctx.lineTo(0, -shardWidth);
      ctx.closePath();
      ctx.fill();
      
      // Inner bright core
      ctx.fillStyle = 'rgba(220, 240, 255, 1)';
      ctx.beginPath();
      ctx.moveTo(shardLength * 0.6, 0);
      ctx.lineTo(0, shardWidth * 0.5);
      ctx.lineTo(-shardLength * 0.2, 0);
      ctx.lineTo(0, -shardWidth * 0.5);
      ctx.closePath();
      ctx.fill();
      
      ctx.restore();
      
    } else if (npcType === NPC_PROJECTILE_SPECTRAL_BOLT) {
      // === SHOREBOUND SPECTRAL BOLT ===
      // Ghostly white/cyan ethereal projectile with wispy trail
      const boltLength = 16;
      const boltWidth = 6;
      const rotation = Math.atan2(projectile.velocityY, projectile.velocityX);
      
      // Draw wispy trailing particles
      const trailLength = 8;
      for (let i = 1; i < trailLength; i++) {
        const trailTime = elapsedTimeSeconds - (i * 0.04);
        if (trailTime < 0) continue;
        
        const trailX = projectile.startPosX + (projectile.velocityX * trailTime);
        const trailY = projectile.startPosY + (projectile.velocityY * trailTime);
        const alpha = 0.6 * (1 - i / trailLength);
        
        // Wispy effect with slight random offset
        const wobble = Math.sin(trailTime * 20 + i) * 3;
        
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = `rgba(200, 230, 255, ${alpha})`;
        ctx.beginPath();
        ctx.arc(trailX, trailY + wobble, boltWidth * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      
      // Draw main bolt
      ctx.save();
      ctx.translate(currentX, currentY);
      ctx.rotate(rotation);
      
      // Outer ghostly glow
      const ghostGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, boltLength * 1.2);
      ghostGlow.addColorStop(0, 'rgba(220, 240, 255, 0.7)');
      ghostGlow.addColorStop(0.4, 'rgba(180, 220, 255, 0.3)');
      ghostGlow.addColorStop(1, 'rgba(150, 200, 255, 0)');
      ctx.fillStyle = ghostGlow;
      ctx.beginPath();
      ctx.arc(0, 0, boltLength * 1.2, 0, Math.PI * 2);
      ctx.fill();
      
      // Main spectral body (elongated oval)
      ctx.fillStyle = 'rgba(230, 245, 255, 0.8)';
      ctx.beginPath();
      ctx.ellipse(0, 0, boltLength, boltWidth, 0, 0, Math.PI * 2);
      ctx.fill();
      
      // Inner bright core
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.beginPath();
      ctx.ellipse(boltLength * 0.2, 0, boltLength * 0.5, boltWidth * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.restore();
      
    } else if (npcType === NPC_PROJECTILE_VENOM_SPITTLE) {
      // === VIPER VENOM SPITTLE ===
      // Green toxic glob with dripping trail
      const globRadius = 7;
      const rotation = Math.atan2(projectile.velocityY, projectile.velocityX);
      
      // Draw dripping trail
      const trailLength = 7;
      for (let i = 1; i < trailLength; i++) {
        const trailTime = elapsedTimeSeconds - (i * 0.045);
        if (trailTime < 0) continue;
        
        const trailX = projectile.startPosX + (projectile.velocityX * trailTime);
        const trailY = projectile.startPosY + (projectile.velocityY * trailTime);
        const alpha = 0.5 * (1 - i / trailLength);
        
        // Dripping effect - trail particles fall slightly
        const drip = i * 2;
        
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = `rgba(100, 200, 50, ${alpha})`;
        ctx.beginPath();
        ctx.arc(trailX, trailY + drip, globRadius * 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      
      // Draw outer toxic glow
      const toxicGlow = ctx.createRadialGradient(
        currentX, currentY, globRadius * 0.5,
        currentX, currentY, globRadius * 2
      );
      toxicGlow.addColorStop(0, 'rgba(150, 255, 50, 0.6)');
      toxicGlow.addColorStop(0.5, 'rgba(100, 200, 30, 0.3)');
      toxicGlow.addColorStop(1, 'rgba(50, 150, 20, 0)');
      ctx.fillStyle = toxicGlow;
      ctx.beginPath();
      ctx.arc(currentX, currentY, globRadius * 2, 0, Math.PI * 2);
      ctx.fill();
      
      // Draw main venom glob
      const venomGradient = ctx.createRadialGradient(
        currentX, currentY, 0,
        currentX, currentY, globRadius
      );
      venomGradient.addColorStop(0, '#90EE90'); // Light green center
      venomGradient.addColorStop(0.5, '#32CD32'); // Lime green
      venomGradient.addColorStop(0.8, '#228B22'); // Forest green
      venomGradient.addColorStop(1, '#006400'); // Dark green edge
      
      ctx.fillStyle = venomGradient;
      ctx.beginPath();
      ctx.arc(currentX, currentY, globRadius, 0, Math.PI * 2);
      ctx.fill();
      
      // Add bubble/highlight for liquid effect
      ctx.fillStyle = 'rgba(200, 255, 150, 0.7)';
      ctx.beginPath();
      ctx.arc(currentX - globRadius * 0.3, currentY - globRadius * 0.3, globRadius * 0.35, 0, Math.PI * 2);
      ctx.fill();
      
      // Small secondary bubble
      ctx.fillStyle = 'rgba(180, 255, 130, 0.5)';
      ctx.beginPath();
      ctx.arc(currentX + globRadius * 0.4, currentY - globRadius * 0.1, globRadius * 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.restore();
    return; // NPC projectile rendered, exit early
  }
  
  // Check if this is a turret tallow projectile (source_type = 1 or 3 for monument turret)
  const isTurretTallow = projectile.sourceType === PROJECTILE_SOURCE_TURRET || projectile.sourceType === PROJECTILE_SOURCE_MONUMENT_TURRET;
  
  if (isTurretTallow) {
    // Regular turret tallow has full gravity (molten globs arc), monument turrets fire straight
    const tallowGravityMultiplier = projectile.sourceType === PROJECTILE_SOURCE_MONUMENT_TURRET ? 0.0 : 1.0;
    const tallowGravityEffect = 0.5 * GRAVITY * tallowGravityMultiplier * elapsedTimeSeconds * elapsedTimeSeconds;
    const tallowCurrentY = projectile.startPosY + (projectile.velocityY * elapsedTimeSeconds) + tallowGravityEffect;
    
    // Render tallow glob as a glowing orange circle with particle trail
    const globRadius = 8; // Base radius for the tallow glob
    const glowRadius = globRadius + 4; // Outer glow radius
    
    // Calculate trail positions (last few positions for particle effect)
    const trailLength = 5;
    const trailPositions: Array<{ x: number; y: number; alpha: number }> = [];
    for (let i = 0; i < trailLength; i++) {
      const trailTime = elapsedTimeSeconds - (i * 0.05); // 50ms between trail points
      if (trailTime < 0) continue;
      
      const trailX = projectile.startPosX + (projectile.velocityX * trailTime);
      const trailGravityEffect = 0.5 * GRAVITY * tallowGravityMultiplier * trailTime * trailTime;
      const trailY = projectile.startPosY + (projectile.velocityY * trailTime) + trailGravityEffect;
      
      trailPositions.push({
        x: trailX,
        y: trailY,
        alpha: 0.3 * (1 - i / trailLength) // Fade out along trail
      });
    }
    
    // Draw particle trail (behind the glob)
    trailPositions.forEach((pos, index) => {
      if (index === 0) return; // Skip first (same as glob position)
      
      ctx.save();
      ctx.globalAlpha = pos.alpha;
      ctx.fillStyle = `rgba(255, 140, 0, ${pos.alpha})`; // Orange with alpha
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, globRadius * 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
    
    // Draw outer glow
    const glowGradient = ctx.createRadialGradient(
      currentX, tallowCurrentY, globRadius,
      currentX, tallowCurrentY, glowRadius
    );
    glowGradient.addColorStop(0, 'rgba(255, 200, 100, 0.8)'); // Bright orange center
    glowGradient.addColorStop(0.5, 'rgba(255, 140, 0, 0.4)'); // Orange middle
    glowGradient.addColorStop(1, 'rgba(255, 100, 0, 0)'); // Fade to transparent
    
    ctx.fillStyle = glowGradient;
    ctx.beginPath();
    ctx.arc(currentX, tallowCurrentY, glowRadius, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw main glob
    const globGradient = ctx.createRadialGradient(
      currentX, tallowCurrentY, 0,
      currentX, tallowCurrentY, globRadius
    );
    globGradient.addColorStop(0, '#FFD700'); // Bright yellow center
    globGradient.addColorStop(0.7, '#FF8C00'); // Orange
    globGradient.addColorStop(1, '#FF4500'); // Dark orange edge
    
    ctx.fillStyle = globGradient;
    ctx.beginPath();
    ctx.arc(currentX, tallowCurrentY, globRadius, 0, Math.PI * 2);
    ctx.fill();
    
    // Add small highlight for 3D effect
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.beginPath();
    ctx.arc(currentX - globRadius * 0.3, tallowCurrentY - globRadius * 0.3, globRadius * 0.4, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Regular projectile rendering (arrows, bullets, thrown items)
    // Apply teal underwater tint when projectile is underwater (consistent with other underwater entities)
    if (applyUnderwaterTint) {
      ctx.filter = 'sepia(20%) hue-rotate(140deg) saturate(120%)';
    }
    
    // Use sub-pixel positioning for smoother movement
    ctx.translate(Math.round(currentX * 10) / 10 + ARROW_SPRITE_OFFSET_X, Math.round(currentY * 10) / 10 + ARROW_SPRITE_OFFSET_Y);
    ctx.rotate(angle);
    ctx.scale(-1, 1); // Flip horizontally for correct arrow orientation
    
    if (usePrimitiveSpriteFallback) {
      // Temporary fallback while icon image is still loading: arrow-like streak
      // oriented by projectile angle so flight arc is always visible.
      const fallbackLength = isBullet ? 14 : 20;
      const fallbackHalfWidth = isBullet ? 1.6 : 2.2;
      const tailOffset = -fallbackLength * 0.55;
      const tipOffset = fallbackLength * 0.45;

      // Soft glow for readability over varied terrain.
      ctx.strokeStyle = isBullet ? 'rgba(255, 240, 170, 0.9)' : 'rgba(245, 230, 190, 0.95)';
      ctx.lineWidth = fallbackHalfWidth * 2.2;
      ctx.beginPath();
      ctx.moveTo(tailOffset, 0);
      ctx.lineTo(tipOffset, 0);
      ctx.stroke();

      // Core shaft.
      ctx.strokeStyle = isBullet ? 'rgba(255, 215, 120, 1)' : 'rgba(140, 95, 55, 1)';
      ctx.lineWidth = fallbackHalfWidth;
      ctx.beginPath();
      ctx.moveTo(tailOffset, 0);
      ctx.lineTo(tipOffset, 0);
      ctx.stroke();

      // Point tip.
      ctx.fillStyle = isBullet ? 'rgba(255, 230, 160, 1)' : 'rgba(200, 200, 200, 1)';
      ctx.beginPath();
      ctx.moveTo(tipOffset, 0);
      ctx.lineTo(tipOffset - 4, -2.2);
      ctx.lineTo(tipOffset - 4, 2.2);
      ctx.closePath();
      ctx.fill();
    } else {
      // Draw the image centered on its new origin
      ctx.drawImage(
        arrowImage,
        -drawWidth / 2, 
        -drawHeight / 2,
        drawWidth,
        drawHeight
      );
    }
  }
  
  ctx.restore();
};

// Cleanup entries for projectiles that no longer exist (hit something, max range, etc.)
// Call with current projectile IDs from useSpacetimeTables - prevents unbounded growth during combat
export const cleanupProjectileTrackingForDeleted = (currentProjectileIds: Set<string>) => {
  const now = performance.now();
  let removed = 0;

  for (const projectileId of Array.from(clientProjectileStartTimes.keys())) {
    if (currentProjectileIds.has(projectileId)) {
      projectileMissingSince.delete(projectileId);
      continue;
    }

    const missingSince = projectileMissingSince.get(projectileId);
    if (missingSince === undefined) {
      projectileMissingSince.set(projectileId, now);
      continue;
    }

    if (now - missingSince >= PROJECTILE_TRACKING_DELETE_GRACE_MS) {
      clientProjectileStartTimes.delete(projectileId);
      projectileMissingSince.delete(projectileId);
      removed += 1;
    }
  }
  if (removed > 0) console.log(`🏹 [CLIENT CLEANUP] Removed ${removed} stale projectile tracking entries`);
};

// Fallback: Remove entries older than max lifetime (in case cleanupProjectileTrackingForDeleted isn't called)
export const cleanupOldProjectileTracking = () => {
  const currentTime = performance.now();
  const toDelete: string[] = [];
  
  for (const [projectileId, startTime] of clientProjectileStartTimes.entries()) {
    if (currentTime - startTime > MAX_PROJECTILE_LIFETIME_MS) {
      toDelete.push(projectileId);
    }
  }
  
  for (const projectileId of toDelete) {
    clientProjectileStartTimes.delete(projectileId);
    projectileMissingSince.delete(projectileId);
  }
  
  if (toDelete.length > 0) {
    console.log(`🏹 [CLIENT CLEANUP] Removed ${toDelete.length} old projectile tracking entries (time-based)`);
  }
};