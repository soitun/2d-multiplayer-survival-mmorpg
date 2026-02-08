import { Player as SpacetimeDBPlayer, ActiveEquipment as SpacetimeDBActiveEquipment, ItemDefinition as SpacetimeDBItemDefinition, ActiveConsumableEffect, EffectType } from '../../generated';
import { gameConfig } from '../../config/gameConfig';
import { drawShadow, drawDynamicGroundShadow } from './shadowUtils';
import { drawSwimmingEffectsUnder, drawSwimmingEffectsOver } from './swimmingEffectsUtils';
import { JUMP_DURATION_MS } from '../../config/gameConfig'; // Import the constant

// --- Constants --- 
export const IDLE_FRAME_INDEX = 1; // Second frame is idle
const PLAYER_SHAKE_DURATION_MS = 200; // How long the shake lasts
const PLAYER_SHAKE_AMOUNT_PX = 3;   // Max pixels to offset
const PLAYER_HIT_FLASH_DURATION_MS = 150; // Duration of the white flash on hit (reduced from 200ms)
const PLAYER_WALKING_SPRITE_SWITCH_INTERVAL_MS = 400; // Switch sprite every 400ms while walking

// OPTIMIZATION: Prioritize performance during sprinting
const SPRINT_OPTIMIZED_SHAKE_AMOUNT_PX = 2; // Reduced shake during sprinting for smoother movement

// --- NEW: Combat effect timing compensation ---
const COMBAT_EFFECT_LATENCY_BUFFER_MS = 300; // Extra time to account for network latency
const MAX_REASONABLE_SERVER_LAG_MS = 1000; // Ignore hits that seem too old (probably stale data)

// Defined here as it depends on spriteWidth from config
const playerRadius = gameConfig.spriteWidth / 2;

// --- NEW: Knockback Interpolation Constants and State ---
const KNOCKBACK_INTERPOLATION_DURATION_MS = 150; // Duration of the smooth knockback visual

interface PlayerVisualKnockbackState {
  displayX: number;
  displayY: number;
  serverX: number;
  serverY: number;
  lastHitTimeMicros: bigint; // Still used to detect *new* hit events for starting interpolation
  interpolationSourceX: number;
  interpolationSourceY: number;
  interpolationTargetX: number;
  interpolationTargetY: number;
  interpolationStartTime: number; 
  clientHitDetectionTime: number; // NEW: Track when we detected the hit on client
}

// --- NEW: Track hit states for reliable effect timing ---
interface PlayerHitState {
  lastProcessedHitTime: bigint;
  clientDetectionTime: number;
  effectStartTime: number;
}

const playerHitStates = new Map<string, PlayerHitState>();

const playerVisualKnockbackState = new Map<string, PlayerVisualKnockbackState>();



// Linear interpolation function
const lerp = (a: number, b: number, t: number): number => a * (1 - t) + b * t;

// --- Reusable Offscreen Canvas for Tinting ---
const offscreenCanvas = document.createElement('canvas');
const offscreenCtx = offscreenCanvas.getContext('2d', { willReadFrequently: true });
if (!offscreenCtx) {
  console.error("Failed to get 2D context from offscreen canvas for player rendering.");
}

// --- Reusable Offscreen Canvas for Shadow Sprite Extraction ---
// PERF FIX: Reuse a single canvas instead of document.createElement('canvas') every frame per player
const shadowSpriteCanvas = document.createElement('canvas');
const shadowSpriteCtx = shadowSpriteCanvas.getContext('2d');
if (!shadowSpriteCtx) {
  console.error("Failed to get 2D context from shadow sprite canvas for player rendering.");
}
let shadowSpriteCanvasInitialized = false;

const PLAYER_NAME_FONT = '12px "Courier New", Consolas, Monaco, monospace'; // 🎯 CYBERPUNK: Match interaction label styling

// --- Client-side animation tracking ---
const clientJumpStartTimes = new Map<string, number>(); // playerId -> client timestamp when jump started
const lastKnownServerJumpTimes = new Map<string, number>(); // playerId -> last known server timestamp

// --- Helper Functions --- 

// Calculates sx, sy for the spritesheet
export const getSpriteCoordinates = (
  player: SpacetimeDBPlayer,
  isMoving: boolean,
  currentAnimationFrame: number,
  isUsingItem: boolean,
  totalFrames: number = 6, // Total frame count (6 for walking, 8 for sprinting, 16 for idle, 8 for crouch, 24 for swimming, 28 for dodge roll)
  isIdle: boolean = false, // Flag to indicate idle animation
  isCrouching: boolean = false, // Flag to indicate crouch animation
  isSwimming: boolean = false, // Flag to indicate swimming animation
  isDodgeRolling: boolean = false, // NEW: Flag to indicate dodge roll animation
  dodgeRollProgress: number = 0 // NEW: Progress of dodge roll (0.0 to 1.0)
): { sx: number, sy: number } => {
  // Handle dodge roll animation (7x4 grid layout - 7 columns, 4 rows)
  if (isDodgeRolling) {
    // Calculate frame based on dodge roll progress (0.0 to 1.0)
    // We want to go through all 7 frames over the duration of the dodge roll
    const frameIndex = Math.floor(dodgeRollProgress * 7); // Map progress to 0-6 frame range
    const spriteCol = Math.min(frameIndex, 6); // Ensure we don't exceed 6 (0-6 = 7 frames)
    
    // Calculate row based on player's facing direction
    let spriteRow = 0; // Default Down
    switch (player.direction) {
      case 'up':         spriteRow = 3; break;
      case 'up_right':   spriteRow = 1; break; // Use right sprite for diagonal up-right
      case 'right':      spriteRow = 1; break;
      case 'down_right': spriteRow = 1; break; // Use right sprite for diagonal down-right
      case 'down':       spriteRow = 0; break;
      case 'down_left':  spriteRow = 2; break; // Use left sprite for diagonal down-left
      case 'left':       spriteRow = 2; break;
      case 'up_left':    spriteRow = 2; break; // Use left sprite for diagonal up-left
      default:           spriteRow = 0; break; // Default fallback
    }
    
    const sx = spriteCol * gameConfig.spriteWidth;
    const sy = spriteRow * gameConfig.spriteHeight;
    return { sx, sy };
  }

  // Handle crouch animation (3x4 grid layout - skip first column, use columns 1-2)
  if (isCrouching) {
    const crouchFrame = currentAnimationFrame % totalFrames; // Ensure frame is within bounds (0-11)
    const spriteCol = 1 + (crouchFrame % 2); // Skip first column, cycle through columns 1-2
    
    // Calculate row based on player's facing direction
    let spriteRow = 0; // Default Down
    switch (player.direction) {
      case 'up':         spriteRow = 3; break;
      case 'up_right':   spriteRow = 1; break; // Use right sprite for diagonal up-right
      case 'right':      spriteRow = 1; break;
      case 'down_right': spriteRow = 1; break; // Use right sprite for diagonal down-right
      case 'down':       spriteRow = 0; break;
      case 'down_left':  spriteRow = 2; break; // Use left sprite for diagonal down-left
      case 'left':       spriteRow = 2; break;
      case 'up_left':    spriteRow = 2; break; // Use left sprite for diagonal up-left
      default:           spriteRow = 0; break; // Default fallback
    }
    
    const sx = spriteCol * gameConfig.spriteWidth;
    const sy = spriteRow * gameConfig.spriteHeight;
    return { sx, sy };
  }

  // Handle swimming animation (6x4 grid layout - 6 columns, 4 rows)
  if (isSwimming) {
    const swimFrame = currentAnimationFrame % totalFrames; // Ensure frame is within bounds (0-23)
    const spriteCol = swimFrame % 6; // Cycle through 6 columns on the row
    
    // Calculate row based on player's facing direction
    let spriteRow = 0; // Default Down
    switch (player.direction) {
      case 'up':         spriteRow = 3; break;
      case 'up_right':   spriteRow = 1; break; // Use right sprite for diagonal up-right
      case 'right':      spriteRow = 1; break;
      case 'down_right': spriteRow = 1; break; // Use right sprite for diagonal down-right
      case 'down':       spriteRow = 0; break;
      case 'down_left':  spriteRow = 2; break; // Use left sprite for diagonal down-left
      case 'left':       spriteRow = 2; break;
      case 'up_left':    spriteRow = 2; break; // Use left sprite for diagonal up-left
      default:           spriteRow = 0; break; // Default fallback
    }
    
    const sx = spriteCol * gameConfig.spriteWidth;
    const sy = spriteRow * gameConfig.spriteHeight;
    return { sx, sy };
  }

  // Handle idle animation (4x4 grid layout)
  // Allow idle animation even when using items (e.g., bandaging)
  if (isIdle && !isMoving) {
    const idleFrame = currentAnimationFrame % totalFrames; // Ensure frame is within bounds
    const spriteCol = idleFrame % 4; // Cycle through 4 columns (frames) on the row
    
    // Calculate row based on player's facing direction (same logic as movement)
    let spriteRow = 2; // Default Down
    switch (player.direction) {
      case 'up':         spriteRow = 3; break;
      case 'up_right':   spriteRow = 1; break; // Use right sprite for diagonal up-right
      case 'right':      spriteRow = 1; break;
      case 'down_right': spriteRow = 1; break; // Use right sprite for diagonal down-right
      case 'down':       spriteRow = 0; break;
      case 'down_left':  spriteRow = 2; break; // Use left sprite for diagonal down-left
      case 'left':       spriteRow = 2; break;
      case 'up_left':    spriteRow = 2; break; // Use left sprite for diagonal up-left
      default:           spriteRow = 0; break; // Default fallback
    }
    
    const sx = spriteCol * gameConfig.spriteWidth;
    const sy = spriteRow * gameConfig.spriteHeight;
    return { sx, sy };
  }

  // Handle movement animations (walking/sprinting - directional sprite sheets)
  let spriteRow = 2; // Default Down
  switch (player.direction) {
    case 'up':         spriteRow = 3; break;
    case 'up_right':   spriteRow = 1; break; // Use right sprite for diagonal up-right
    case 'right':      spriteRow = 1; break;
    case 'down_right': spriteRow = 1; break; // Use right sprite for diagonal down-right
    case 'down':       spriteRow = 0; break;
    case 'down_left':  spriteRow = 2; break; // Use left sprite for diagonal down-left (FIXED)
    case 'left':       spriteRow = 2; break;
    case 'up_left':    spriteRow = 2; break; // Use left sprite for diagonal up-left
    default:           spriteRow = 0; break; // Default fallback
  }

  // Calculate sprite column
  // Allow walking animation even when using items (e.g., bandaging while moving)
  let spriteCol: number;
  if (isMoving) {
    // Use the current animation frame for walking/sprinting (0 to totalFrames-1)
    spriteCol = currentAnimationFrame % totalFrames;
  } else {
    // Static/idle sprite - use frame 1 as the neutral position for all sprite sheets
    spriteCol = 1;
  }

  const sx = spriteCol * gameConfig.spriteWidth;
  const sy = spriteRow * gameConfig.spriteHeight;
  return { sx, sy };
};

// Checks if the mouse is hovering over the player
export const isPlayerHovered = (
  worldMouseX: number | null,
  worldMouseY: number | null,
  player: SpacetimeDBPlayer
): boolean => {
  if (worldMouseX === null || worldMouseY === null) return false;
  
  const hoverDX = worldMouseX - player.positionX;
  const hoverDY = worldMouseY - player.positionY;
  const distSq = hoverDX * hoverDX + hoverDY * hoverDY;
  const radiusSq = playerRadius * playerRadius;
  
  return distSq < radiusSq;
};

// Helper function to check if a player has active PvP status
const isPvpActive = (player: SpacetimeDBPlayer, currentTimeMs: number): boolean => {
  if (!player.pvpEnabled) {
    return false;
  }
  
  // If pvpEnabledUntil is set, check if it hasn't expired
  if (player.pvpEnabledUntil) {
    // Convert microseconds to milliseconds: microsSinceUnixEpoch / 1000
    const untilMs = Number(player.pvpEnabledUntil.microsSinceUnixEpoch) / 1000;
    return untilMs > currentTimeMs;
  }
  
  // If pvpEnabled is true but no expiry is set, PvP is still active
  return true;
};

// Draws the PvP indicator badge above the name tag
const drawPvpIndicator = (
  ctx: CanvasRenderingContext2D,
  spriteTopY: number,
  spriteX: number,
  tagY: number // Position of the name tag
) => {
  const pvpText = 'PvP';
  ctx.font = 'bold 10px Arial';
  ctx.textAlign = 'center';
  
  const pvpTextWidth = ctx.measureText(pvpText).width;
  const pvpPadding = 4;
  const pvpHeight = 14;
  const pvpWidth = pvpTextWidth + pvpPadding * 2;
  const pvpX = spriteX - pvpWidth / 2;
  const pvpY = tagY - pvpHeight - 2; // Position above the name tag
  
  // Draw red background with slight transparency
  ctx.fillStyle = 'rgba(220, 53, 69, 0.9)'; // Bootstrap-style danger red
  ctx.beginPath();
  ctx.roundRect(pvpX, pvpY, pvpWidth, pvpHeight, 3);
  ctx.fill();
  
  // Draw red border for emphasis
  ctx.strokeStyle = 'rgba(255, 100, 100, 0.8)';
  ctx.lineWidth = 1;
  ctx.stroke();
  
  // Draw text
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(pvpText, spriteX, pvpY + pvpHeight / 2 + 3);
};

// Draws the styled name tag (Make exportable)
export const drawNameTag = (
  ctx: CanvasRenderingContext2D,
  player: SpacetimeDBPlayer,
  spriteTopY: number, // dy from drawPlayer calculation
  spriteX: number, // Added new parameter for shaken X position
  isOnline: boolean, // <<< CHANGED: Pass explicit online status
  showLabel: boolean = true, // Add parameter to control visibility
  activeTitle?: string | null, // ADDED: Player's active title to display
  currentTimeMs?: number // ADDED: Current time for PvP status check
) => {
  if (!showLabel) return; // Skip rendering if not showing label
  
  // --- MODIFIED: Use passed isOnline flag ---
  // Don't add "(offline)" if username already contains it (e.g., offline corpses from server)
  const alreadyHasOfflineTag = player.username.toLowerCase().includes('(offline)');
  let displayText = isOnline || alreadyHasOfflineTag
    ? player.username
    : `${player.username} (offline)`;
  
  // Add title if present (format: «Title» Username)
  if (activeTitle && isOnline) {
    displayText = `«${activeTitle}» ${player.username}`;
  }

  // NPC indicator — check is_npc field (camelCase from generated bindings)
  const isNpc = (player as any).isNpc ?? (player as any).is_npc ?? false;
  // --- END MODIFICATION ---

  ctx.font = PLAYER_NAME_FONT;
  ctx.textAlign = 'center';
  const textWidth = ctx.measureText(displayText).width;
  const tagPadding = 4;
  const tagHeight = 16;
  const tagWidth = textWidth + tagPadding * 2;
  const tagX = spriteX - tagWidth / 2;
  const tagY = spriteTopY - tagHeight + 4;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.beginPath();
  ctx.roundRect(tagX, tagY, tagWidth, tagHeight, 5);
  ctx.fill();

  // NPC name color: soft cyan (#7fdbca) to subtly distinguish from human players
  const nameColor = isNpc ? '#7fdbca' : '#FFFFFF';

  // Title gets gold color, username stays white (or cyan for NPCs)
  if (activeTitle && isOnline) {
    // Draw title in gold
    const titleText = `«${activeTitle}» `;
    const titleWidth = ctx.measureText(titleText).width;
    const usernameWidth = ctx.measureText(player.username).width;
    const totalWidth = titleWidth + usernameWidth;
    const startX = spriteX - totalWidth / 2;
    
    ctx.fillStyle = '#ffd700'; // Gold color for title
    ctx.textAlign = 'left';
    ctx.fillText(titleText, startX, tagY + tagHeight / 2 + 4);
    
    ctx.fillStyle = nameColor;
    ctx.fillText(player.username, startX + titleWidth, tagY + tagHeight / 2 + 4);
  } else {
    ctx.fillStyle = nameColor;
    ctx.fillText(displayText, spriteX, tagY + tagHeight / 2 + 4);
  }
  
  // --- PVP INDICATOR ---
  // Draw PvP badge above the name tag if player has active PvP
  if (isOnline && currentTimeMs && isPvpActive(player, currentTimeMs)) {
    drawPvpIndicator(ctx, spriteTopY, spriteX, tagY);
  }
};

// --- THROW INDICATOR BUBBLE ---
// Draws a chat bubble with 🤾 emoji above player when aiming to throw
export const drawThrowIndicatorBubble = (
  ctx: CanvasRenderingContext2D,
  player: SpacetimeDBPlayer,
  spriteTopY: number,
  spriteX: number,
  nowMs: number
) => {
  // Only show if player is aiming to throw
  if (!player.isAimingThrow) return;
  
  // Bubble position above player's head (higher than name tag)
  const bubbleX = spriteX;
  const bubbleY = spriteTopY - 32; // Position well above head
  
  // Gentle bobbing animation
  const bobOffset = Math.sin(nowMs * 0.008) * 2;
  const finalY = bubbleY + bobOffset;
  
  ctx.save();
  
  // Draw chat bubble background
  const bubbleRadius = 18;
  
  // Main bubble with gradient
  const gradient = ctx.createRadialGradient(bubbleX, finalY, 0, bubbleX, finalY, bubbleRadius);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
  gradient.addColorStop(1, 'rgba(240, 240, 255, 0.9)');
  
  ctx.fillStyle = gradient;
  ctx.strokeStyle = 'rgba(100, 100, 150, 0.7)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(bubbleX, finalY, bubbleRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  
  // Chat bubble tail (speech bubble style - triangular pointer)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.strokeStyle = 'rgba(100, 100, 150, 0.7)';
  ctx.beginPath();
  ctx.moveTo(bubbleX - 5, finalY + bubbleRadius - 2);
  ctx.lineTo(bubbleX, finalY + bubbleRadius + 10);
  ctx.lineTo(bubbleX + 5, finalY + bubbleRadius - 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  
  // Draw the 🤾 emoji (person cartwheeling - represents throwing motion)
  ctx.font = '20px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🤾', bubbleX, finalY);
  
  ctx.restore();
};
// --- END THROW INDICATOR BUBBLE ---

// Renders a complete player (sprite, shadow, and conditional name tag)
export const renderPlayer = (
  ctx: CanvasRenderingContext2D,
  player: SpacetimeDBPlayer,
  heroImg: CanvasImageSource,
  heroSprintImg: CanvasImageSource,
  heroIdleImg: CanvasImageSource,
  heroCrouchImg: CanvasImageSource, // Add crouch sprite parameter
  heroSwimImg: CanvasImageSource, // Add swim sprite parameter
  heroDodgeImg: CanvasImageSource, // NEW: Add dodge roll sprite parameter
  isOnline: boolean,
  isMoving: boolean,
  isHovered: boolean,
  currentAnimationFrame: number,
  nowMs: number,
  jumpOffsetY: number = 0,
  shouldShowLabel: boolean = false,
  activeConsumableEffects?: Map<string, ActiveConsumableEffect>,
  localPlayerId?: string,
  isCorpse?: boolean, // New flag for corpse rendering
  cycleProgress: number = 0.375, // Day/night cycle progress (0.0 to 1.0), default to noon-ish
  localPlayerIsCrouching?: boolean, // NEW: Add local crouch state for optimistic rendering
  renderHalfMode?: 'top' | 'bottom' | 'full', // NEW: Control which part of sprite to render
  isDodgeRolling?: boolean, // NEW: Whether the player is currently dodge rolling
  dodgeRollProgress?: number, // NEW: Progress of the dodge roll (0.0 to 1.0)
  isSnorkeling?: boolean, // NEW: Whether the player is snorkeling (underwater mode - full tint, no water effects)
  isViewerUnderwater?: boolean, // NEW: Whether the local player (viewer) is underwater - affects remote snorkeling player rendering
  activeTitle?: string | null // NEW: Player's active title to display above name
) => {
  // REMOVE THE NAME TAG RENDERING BLOCK FROM HERE
  // const { positionX, positionY, direction, color, username } = player;
  // const drawX = positionX - gameConfig.spriteWidth / 2;
  // const drawY = positionY - gameConfig.spriteHeight / 2 - jumpOffsetY;
  // ctx.save();
  // ... (removed name tag code) ...
  // ctx.restore();

  // --- Hide player if dead (unless it's a corpse being rendered) ---
  if (!isCorpse && player.isDead) {
    if (player.identity) {
        const playerHexIdForDelete = player.identity.toHexString();
        if (playerVisualKnockbackState.has(playerHexIdForDelete)) {
            // Removed log
            playerVisualKnockbackState.delete(playerHexIdForDelete);
        }
        // --- NEW: Also cleanup hit states for dead players ---
        if (playerHitStates.has(playerHexIdForDelete)) {
            playerHitStates.delete(playerHexIdForDelete);
        }
    }
    return;
  }

  let currentDisplayX: number = player.positionX;
  let currentDisplayY: number = player.positionY;
  const playerHexId = player.identity.toHexString();
  let visualState = playerVisualKnockbackState.get(playerHexId);

  const serverX = player.positionX;
  const serverY = player.positionY;
  const serverLastHitTimePropMicros = player.lastHitTime?.microsSinceUnixEpoch ?? 0n;
  
  // --- NEW: Improved hit detection and effect timing ---
  let hitState = playerHitStates.get(playerHexId);
  let isCurrentlyHit = false;
  let hitEffectElapsed = 0;
  
  if (serverLastHitTimePropMicros > 0n) {
    // --- IMPROVED: Use threshold-based comparison to prevent spurious re-detections ---
    const DETECTION_THRESHOLD_MICROS = 1000n; // 1ms threshold to account for minor server timing variations
    const isNewHit = !hitState || 
                    (serverLastHitTimePropMicros > hitState.lastProcessedHitTime && 
                     (serverLastHitTimePropMicros - hitState.lastProcessedHitTime) > DETECTION_THRESHOLD_MICROS);
    
    if (isNewHit) {
      // NEW HIT DETECTED! Set up effect timing based on client time
      const oldHitTime = hitState?.lastProcessedHitTime || 0n;
      hitState = {
        lastProcessedHitTime: serverLastHitTimePropMicros,
        clientDetectionTime: nowMs,
        effectStartTime: nowMs
      };
      playerHitStates.set(playerHexId, hitState);
      // console.log(`🎯 [COMBAT] Hit detected for player ${playerHexId} at client time ${nowMs} (server: ${serverLastHitTimePropMicros}, old: ${oldHitTime}, diff: ${serverLastHitTimePropMicros - oldHitTime})`);
    }
    
    // Calculate effect timing based on when WE detected the hit
    if (hitState) {
      hitEffectElapsed = nowMs - hitState.effectStartTime;
      
      // --- FIX: Add stale hit detection to prevent stuck states ---
      const MAX_REASONABLE_HIT_AGE_MS = 5000; // 5 seconds maximum
      const serverHitTimeMs = Number(serverLastHitTimePropMicros / 1000n);
      const serverHitAge = nowMs - serverHitTimeMs;
      
      // If the server hit time is extremely old, or client effect has been running too long, force reset
      if (serverHitAge > MAX_REASONABLE_HIT_AGE_MS || hitEffectElapsed > MAX_REASONABLE_HIT_AGE_MS) {
        // console.log(`🎯 [CLEANUP] Removing stale hit state for player ${playerHexId}: serverAge=${serverHitAge}ms, clientAge=${hitEffectElapsed}ms`);
        playerHitStates.delete(playerHexId);
        isCurrentlyHit = false;
        hitEffectElapsed = Infinity;
      } else {
        isCurrentlyHit = hitEffectElapsed < (PLAYER_SHAKE_DURATION_MS + COMBAT_EFFECT_LATENCY_BUFFER_MS);
        
        // --- DEBUGGING: Log potential infinite loops ---
        // if (hitEffectElapsed < 5 && !isNewHit) {
        //   console.log(`🎯 [DEBUG] Potential infinite hit loop for player ${playerHexId}: elapsed=${hitEffectElapsed.toFixed(1)}ms, server=${serverLastHitTimePropMicros}, stored=${hitState.lastProcessedHitTime}, diff=${serverLastHitTimePropMicros - hitState.lastProcessedHitTime}`);
        // }
      }
    }
  } else {
    // No hit time from server - clear hit state
    if (hitState) {
      // console.log(`🎯 [COMBAT] Clearing hit state for player ${playerHexId} (server hit time is 0)`);
      playerHitStates.delete(playerHexId);
    }
  }
  
  // Legacy calculation for fallback (but prioritize new system)
  const serverLastHitTimeMs = serverLastHitTimePropMicros > 0n ? Number(serverLastHitTimePropMicros / 1000n) : 0;
  const elapsedSinceServerHitMs = serverLastHitTimeMs > 0 ? (nowMs - serverLastHitTimeMs) : Infinity;
  
  // Use new hit detection if available, otherwise fall back to old system
  const effectiveHitElapsed = isCurrentlyHit ? hitEffectElapsed : elapsedSinceServerHitMs;
  const shouldShowCombatEffects = isCurrentlyHit || elapsedSinceServerHitMs < PLAYER_SHAKE_DURATION_MS;
  // --- END NEW hit detection ---

  // Only apply knockback interpolation for NON-local players
  // Local player position is handled by the prediction system
  const isLocalPlayer = localPlayerId && playerHexId === localPlayerId;

  if (!isCorpse && !isLocalPlayer) {
    // Knockback interpolation for other players only
    if (!visualState) {
      visualState = {
        displayX: serverX, displayY: serverY,
        serverX, serverY,
        lastHitTimeMicros: serverLastHitTimePropMicros,
        interpolationSourceX: serverX, interpolationSourceY: serverY,
        interpolationTargetX: serverX, interpolationTargetY: serverY, 
        interpolationStartTime: 0,
        clientHitDetectionTime: 0,
      };
      playerVisualKnockbackState.set(playerHexId, visualState);
    } else {
      // --- IMPROVED: Use new hit detection for knockback interpolation ---
      if (isCurrentlyHit && hitState && hitState.clientDetectionTime > visualState.clientHitDetectionTime) {
        // NEW HIT DETECTED - start knockback interpolation
        visualState.interpolationSourceX = visualState.displayX;
        visualState.interpolationSourceY = visualState.displayY;
        visualState.interpolationTargetX = serverX;
        visualState.interpolationTargetY = serverY;
        visualState.interpolationStartTime = nowMs;
        visualState.lastHitTimeMicros = serverLastHitTimePropMicros;
        visualState.clientHitDetectionTime = hitState.clientDetectionTime;
        // Knockback interpolation started (log removed to avoid console spam in production)
      } else if (serverLastHitTimePropMicros > visualState.lastHitTimeMicros) {
        // FALLBACK: Old detection method for compatibility
        visualState.interpolationSourceX = visualState.displayX;
        visualState.interpolationSourceY = visualState.displayY;
        visualState.interpolationTargetX = serverX;
        visualState.interpolationTargetY = serverY;
        visualState.interpolationStartTime = nowMs;
        visualState.lastHitTimeMicros = serverLastHitTimePropMicros;
        visualState.clientHitDetectionTime = nowMs;
      }
      else if (!player.isDead && serverLastHitTimePropMicros === 0n && visualState.lastHitTimeMicros !== 0n) {
        visualState.lastHitTimeMicros = 0n;
      }
    }
    
    // Apply knockback interpolation
    if (visualState.interpolationStartTime > 0 && nowMs < visualState.interpolationStartTime + KNOCKBACK_INTERPOLATION_DURATION_MS) {
        const elapsed = nowMs - visualState.interpolationStartTime;
        const t = Math.min(1, elapsed / KNOCKBACK_INTERPOLATION_DURATION_MS);
        currentDisplayX = lerp(visualState.interpolationSourceX, visualState.interpolationTargetX, t);
        currentDisplayY = lerp(visualState.interpolationSourceY, visualState.interpolationTargetY, t);
    } else {
        currentDisplayX = serverX;
        currentDisplayY = serverY;
        if (visualState.interpolationStartTime > 0) {
            visualState.interpolationStartTime = 0;
        }
    }
    
    visualState.displayX = currentDisplayX; 
    visualState.displayY = currentDisplayY;
    visualState.serverX = serverX; 
    visualState.serverY = serverY;

  } else if (!isCorpse && isLocalPlayer) {
    // For local player, clean up any knockback state and use position as-is
    // (position will be the predicted position passed from renderingUtils)
    if (visualState) {
        playerVisualKnockbackState.delete(playerHexId);
    }
    currentDisplayX = player.positionX;
    currentDisplayY = player.positionY;
  } else {
    // Corpses use direct position
    currentDisplayX = player.positionX;
    currentDisplayY = player.positionY;
    if (visualState) {
        playerVisualKnockbackState.delete(playerHexId);
    }
  }
  // --- End Knockback Interpolation Logic ---

  let isUsingItem = false;
  let isUsingSeloOliveOil = false;
  if (!isCorpse && activeConsumableEffects && player.identity) {
    const playerHexId = player.identity.toHexString();
    for (const effect of activeConsumableEffects.values()) {
      // Check if this player is using a bandage on themselves
      if (effect.effectType.tag === "BandageBurst" && effect.playerId.toHexString() === playerHexId) {
        isUsingItem = true;
        break;
      }
      // Check if this player is healing someone else
      if (effect.effectType.tag === "RemoteBandageBurst" && effect.playerId.toHexString() === playerHexId) {
        isUsingItem = true;
        break;
      }
      // Check if this player is using Selo Olive Oil (HealthRegen effect with 2-second duration)
      if (effect.effectType.tag === "HealthRegen" && effect.playerId.toHexString() === playerHexId) {
        // Check if this is a short-duration effect (2 seconds for Selo Olive Oil vs longer for other items)
        const effectDurationMs = Number(effect.endsAt.microsSinceUnixEpoch / 1000n) - Number(effect.startedAt.microsSinceUnixEpoch / 1000n);
        if (effectDurationMs <= 2500) { // 2.5 seconds to account for slight timing variations
          isUsingSeloOliveOil = true;
          break;
        }
      }
    }
  }

  const finalIsMoving = isCorpse ? false : isMoving;
  const finalAnimationFrame = isCorpse ? IDLE_FRAME_INDEX : currentAnimationFrame;

  // Calculate if player is currently jumping (same logic as sprite selection)
  let isCurrentlyJumping = false;
  if (!isCorpse && player.jumpStartTimeMs && player.jumpStartTimeMs > 0) {
    const jumpStartTime = Number(player.jumpStartTimeMs);
    const playerId = player.identity.toHexString();
    
    // Check if this is a NEW jump by comparing server timestamps
    const lastKnownServerTime = lastKnownServerJumpTimes.get(playerId) || 0;
    
    if (jumpStartTime !== lastKnownServerTime) {
      // NEW jump detected! Record both server time and client time
      lastKnownServerJumpTimes.set(playerId, jumpStartTime);
      clientJumpStartTimes.set(playerId, nowMs);
    }
    
    // Calculate animation based on client time
    const clientStartTime = clientJumpStartTimes.get(playerId);
    if (clientStartTime) {
      const elapsedJumpTime = nowMs - clientStartTime;
      if (elapsedJumpTime < JUMP_DURATION_MS) {
        isCurrentlyJumping = true;
      }
    }
  } else {
    // Clean up tracking for this player if no active jump
    const playerId = player.identity.toHexString();
    clientJumpStartTimes.delete(playerId);
    lastKnownServerJumpTimes.delete(playerId);
  }

  // Determine frame count and sprite type based on player state
  const isSprinting = (!isCorpse && player.isSprinting && finalIsMoving);
  const isIdleState = (!isCorpse && !finalIsMoving && !isUsingItem && !isUsingSeloOliveOil);
  const isSwimming = (!isCorpse && player.isOnWater && !isCurrentlyJumping);
  
  // Use effective crouch state that considers local optimistic state for immediate feedback
  const effectiveIsCrouching = isLocalPlayer && localPlayerIsCrouching !== undefined 
    ? localPlayerIsCrouching 
    : player.isCrouching;
  const isCrouchingState = (!isCorpse && effectiveIsCrouching && !player.isOnWater);
  const isDodgeRollingState = (!isCorpse && (isDodgeRolling || false)); // Use parameter, default to false
  
  let totalFrames: number;
  let isIdleAnimation = false;
  let isCrouchingAnimation = false;
  let isSwimmingAnimation = false;
  let isDodgeRollingAnimation = false;
  
  if (isDodgeRollingState) {
    // HIGHEST PRIORITY: Dodge rolling overrides all other states
    totalFrames = 28; // 28 frames for dodge roll animation (7x4)
    isDodgeRollingAnimation = true;
  } else if (isCrouchingState) {
    // SECOND PRIORITY: Crouching overrides all other states
    totalFrames = 8; // 8 frames for crouch animation (2x4, skipping first column)
    isCrouchingAnimation = true;
  } else if (isSwimming) {
    // THIRD PRIORITY: Swimming uses 24 frames
    totalFrames = 24; // 24 frames for swimming (6x4)
    isSwimmingAnimation = true;
  } else if (isIdleState) {
    totalFrames = 16; // 16 frames for idle animation (4x4)
    isIdleAnimation = true;
  } else if (isSprinting) {
    totalFrames = 8; // 8 frames for sprinting
  } else {
    totalFrames = 6; // 6 frames for walking
  }

  const { sx, sy } = getSpriteCoordinates(
    player, 
    finalIsMoving, 
    finalAnimationFrame, 
    isUsingItem || isUsingSeloOliveOil, 
    totalFrames, 
    isIdleAnimation,
    isCrouchingAnimation,
    isSwimmingAnimation,
    isDodgeRollingAnimation,
    dodgeRollProgress || 0
  );
  
  // Shake Logic (directly uses elapsedSinceServerHitMs)
  let shakeX = 0;
  let shakeY = 0;
  if (!isCorpse && !player.isDead && effectiveHitElapsed < PLAYER_SHAKE_DURATION_MS) {
    // OPTIMIZATION: Reduce shake during sprinting for smoother movement
    const shakeAmount = player.isSprinting ? SPRINT_OPTIMIZED_SHAKE_AMOUNT_PX : PLAYER_SHAKE_AMOUNT_PX;
    shakeX = (Math.random() - 0.5) * 2 * shakeAmount;
    shakeY = (Math.random() - 0.5) * 2 * shakeAmount;
    
    // --- DEBUG: Log shake effect for troubleshooting ---
    // if (effectiveHitElapsed < 50) { // Only log within first 50ms to avoid spam
    //   console.log(`🎯 [SHAKE] Player ${playerHexId} shaking: elapsed=${effectiveHitElapsed.toFixed(1)}ms, isCurrentlyHit=${isCurrentlyHit}, shakeAmount=${shakeAmount}`);
    // }
  }
  
  // --- SAFETY: Force clear hit states that have been active too long ---
  if (hitState && isCurrentlyHit) {
    const MAX_HIT_EFFECT_DURATION_MS = 2000; // 2 seconds maximum
    const totalHitDuration = nowMs - hitState.clientDetectionTime;
    if (totalHitDuration > MAX_HIT_EFFECT_DURATION_MS) {
      // Safety: Force clearing stuck hit state (log removed to avoid console spam)
      playerHitStates.delete(playerHexId);
      isCurrentlyHit = false;
    }
  }

  // --- TEST: Increase sprite size ---
  const drawWidth = gameConfig.spriteWidth * 2;
  const drawHeight = gameConfig.spriteHeight * 2;
  const spriteBaseX = currentDisplayX - drawWidth / 2 + shakeX;
  const spriteBaseY = currentDisplayY - drawHeight / 2 + shakeY;
  const finalJumpOffsetY = isCorpse ? 0 : jumpOffsetY;
  const spriteDrawY = spriteBaseY - finalJumpOffsetY;

  // Flash Logic (directly uses elapsedSinceServerHitMs)
  const isFlashing = !isCorpse && !player.isDead && effectiveHitElapsed < PLAYER_HIT_FLASH_DURATION_MS;

  // Define shadow base offset here to be used by both online/offline
  const shadowBaseYOffset = drawHeight * 0.4; 
  const finalIsOnline = isCorpse ? false : isOnline;

  // --- Draw Dynamic Ground Shadow (for living players only) ---
  // Show shadow for all living players EXCEPT swimming players (they're rendered before water overlay)
  const shouldShowShadow = !isCorpse && !(player.isOnWater && !isCurrentlyJumping);
  
  // NEW: Choose sprite based on player state (PRIORITY ORDER: dodge > swimming > crouching > idle/sprint/walk)
  // With fallbacks to ensure we always have a valid sprite if any sprite is loaded
  let currentSpriteImg: CanvasImageSource | null = null;
  if (isCorpse) {
    currentSpriteImg = heroImg; // Corpses use walking sprite
  } else if (isDodgeRollingState) {
    // HIGHEST PRIORITY: Dodge rolling uses dodge sprite regardless of other states
    currentSpriteImg = heroDodgeImg || heroImg; // Fallback to walking sprite
  } else if (isSwimming && !isCurrentlyJumping) {
    // SECOND PRIORITY: Swimming uses swim sprite (water overrides crouching)
    currentSpriteImg = heroSwimImg || heroImg; // Fallback to walking sprite
  } else if (isCrouchingState) {
    // THIRD PRIORITY: Crouching uses crouch sprite (only when NOT on water)
    currentSpriteImg = heroCrouchImg || heroImg; // Fallback to walking sprite
  } else if (isIdleState) {
    currentSpriteImg = heroIdleImg || heroImg; // Fallback to walking sprite
  } else if (isSprinting) {
    currentSpriteImg = heroSprintImg || heroImg; // Fallback to walking sprite
  } else {
    currentSpriteImg = heroImg; // Use walking sprite for normal movement
  }

  // FIX: Early check - if we don't have a valid sprite, skip the entire rendering including shadows
  // This prevents "shadow only" rendering when sprites haven't loaded yet
  const hasValidSprite = currentSpriteImg && (currentSpriteImg instanceof HTMLImageElement);
  
  if (hasValidSprite && shouldShowShadow) {
    // Extract the specific sprite frame for shadow rendering (reuse computed sx, sy from above)
    
    // PERF FIX: Reuse the cached shadow canvas instead of creating a new one every frame
    if (!shadowSpriteCanvasInitialized || shadowSpriteCanvas.width !== gameConfig.spriteWidth || shadowSpriteCanvas.height !== gameConfig.spriteHeight) {
      shadowSpriteCanvas.width = gameConfig.spriteWidth;
      shadowSpriteCanvas.height = gameConfig.spriteHeight;
      shadowSpriteCanvasInitialized = true;
    }
    
    if (shadowSpriteCtx) {
      // Clear previous frame data
      shadowSpriteCtx.clearRect(0, 0, shadowSpriteCanvas.width, shadowSpriteCanvas.height);
      // Draw just the current sprite frame to the reusable shadow canvas
      shadowSpriteCtx.drawImage(
        currentSpriteImg, // UPDATED: Use selected sprite
        sx, sy, gameConfig.spriteWidth, gameConfig.spriteHeight, // Source: specific frame from spritesheet
        0, 0, gameConfig.spriteWidth, gameConfig.spriteHeight    // Destination: full temporary canvas
      );
      
      // Adjust shadow parameters based on player state  
      const shadowAlpha = finalIsOnline ? 0.6 : 0.5; // Increased visibility for all cases
      const shadowStretchMax = 3.0; // More dramatic shadows
      const shadowStretchMin = 0.25; // Better minimum visibility
      
      // Calculate realistic shadow scaling based on jump height
      const jumpProgress = Math.min(1, finalJumpOffsetY / playerRadius);
      const shadowScale = 1.0 - jumpProgress * 0.5; // Shadow gets smaller as player jumps higher
      const shadowBlurAmount = 2 + jumpProgress * 4; // Shadow gets blurrier when higher
      const shadowAlphaReduction = shadowAlpha * (1.0 - jumpProgress * 0.3); // Shadow gets fainter when higher
      const shadowOffsetFromPlayer = jumpProgress * 8; // Shadow moves slightly away from player when higher
      
      // Use standard shadow positioning for all players
      let finalShadowCenterX = currentDisplayX;
      let finalShadowBaseY = currentDisplayY + shadowBaseYOffset + shadowOffsetFromPlayer;
      let finalShadowScale = shadowScale;
      let finalShadowAlpha = shadowAlphaReduction;

      drawDynamicGroundShadow({
        ctx,
        entityImage: shadowSpriteCanvas, // PERF FIX: Use reusable cached canvas instead of allocating per frame
        entityCenterX: finalShadowCenterX,
        entityBaseY: finalShadowBaseY,
        imageDrawWidth: drawWidth * finalShadowScale,
        imageDrawHeight: drawHeight * finalShadowScale,
        cycleProgress,
        baseShadowColor: '0,0,0',
        maxShadowAlpha: finalShadowAlpha,
        maxStretchFactor: shadowStretchMax,
        minStretchFactor: shadowStretchMin,
        shadowBlur: shadowBlurAmount, // Shadow gets blurrier when higher
        pivotYOffset: 0,
      });
    }
  }
  // --- End Dynamic Ground Shadow ---

  // --- Draw Offline Shadow (corpses excluded - they're flat on the ground) --- 
  // FIX: Only render shadow if we have a valid sprite to render (prevents shadow-only rendering)
  if (hasValidSprite && !isCorpse && !finalIsOnline && shouldShowShadow) {
      const shadowBaseRadiusX = drawWidth * 0.3;
      const shadowBaseRadiusY = shadowBaseRadiusX * 0.4;
      
      drawShadow(
          ctx,
          currentDisplayX, 
          currentDisplayY + drawHeight * 0.1, 
          shadowBaseRadiusX, 
          shadowBaseRadiusY  
      );
  }
  // --- End Shadow ---

  // --- Draw Shadow (Only if alive and online, and not a corpse) ---
  // FIX: Only render shadow if we have a valid sprite to render (prevents shadow-only rendering)
  if (hasValidSprite && !isCorpse && !player.isDead && finalIsOnline && shouldShowShadow) {
      const shadowBaseRadiusX = drawWidth * 0.3;
      const shadowBaseRadiusY = shadowBaseRadiusX * 0.4;
      const shadowMaxJumpOffset = 10; 
      const shadowYOffsetFromJump = finalJumpOffsetY * (shadowMaxJumpOffset / playerRadius); 
      const jumpProgress = Math.min(1, finalJumpOffsetY / playerRadius); 
      const shadowScale = 1.0 - jumpProgress * 0.4; 
      
      // Apply realistic shadow effects based on jump height
      // Base alpha 0.5 matches dynamic ground shadow, reduced when jumping
      const shadowAlpha = 0.5 * (1.0 - jumpProgress * 0.3);
      const shadowBlurAmount = 3 + jumpProgress * 4; // Shadow gets blurrier when higher (starts with base blur)
      
      ctx.save();
      // Apply blur effect only (alpha is now passed directly to drawShadow)
      if (shadowBlurAmount > 0) {
          ctx.filter = `blur(${shadowBlurAmount}px)`;
      }
      
      drawShadow(
        ctx, 
        currentDisplayX, 
        currentDisplayY + shadowBaseYOffset + shadowYOffsetFromJump, 
        shadowBaseRadiusX * shadowScale, 
        shadowBaseRadiusY * shadowScale,
        shadowAlpha // Pass alpha directly to drawShadow instead of using globalAlpha
      );
      
      ctx.restore(); // Reset filter
  }
  // --- End Draw Shadow ---

  // --- Draw Sprite ---
  ctx.save(); // Save for rotation and flash effects
  try {
    const centerX = spriteBaseX + drawWidth / 2; 
    const centerY = spriteDrawY + drawHeight / 2; 

    // --- MODIFICATION: Knocked Out Glow/Pulse ---
    if (!isCorpse && player.isKnockedOut) {
      const pulseSpeed = 1500; // Duration of one pulse cycle in ms
      const minGlowAlpha = 0.4;
      const maxGlowAlpha = 0.8;
      // Create a sine wave that oscillates between 0 and 1
      const pulseFactor = (Math.sin(nowMs / pulseSpeed * Math.PI * 2) + 1) / 2; 
      const currentGlowAlpha = minGlowAlpha + (maxGlowAlpha - minGlowAlpha) * pulseFactor;

      ctx.shadowColor = `rgba(255, 0, 0, ${currentGlowAlpha})`;
      ctx.shadowBlur = 10 + (pulseFactor * 10); // Make blur also pulse slightly
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    } else if (isUsingItem) { // Bandage glow
      const pulseSpeed = 1000; // Faster pulse for healing
      const minGlowAlpha = 0.3;
      const maxGlowAlpha = 0.7;
      const pulseFactor = (Math.sin(nowMs / pulseSpeed * Math.PI * 2) + 1) / 2; 
      const currentGlowAlpha = minGlowAlpha + (maxGlowAlpha - minGlowAlpha) * pulseFactor;

      ctx.shadowColor = `rgba(0, 255, 0, ${currentGlowAlpha})`; // Green glow
      ctx.shadowBlur = 8 + (pulseFactor * 8);
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    } else if (isUsingSeloOliveOil) { // Selo Olive Oil glow
      const pulseSpeed = 800; // Slightly faster pulse for Selo Olive Oil
      const minGlowAlpha = 0.3;
      const maxGlowAlpha = 0.7;
      const pulseFactor = (Math.sin(nowMs / pulseSpeed * Math.PI * 2) + 1) / 2; 
      const currentGlowAlpha = minGlowAlpha + (maxGlowAlpha - minGlowAlpha) * pulseFactor;

      ctx.shadowColor = `rgba(255, 255, 0, ${currentGlowAlpha})`; // Yellow glow
      ctx.shadowBlur = 8 + (pulseFactor * 8);
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    } else if (activeConsumableEffects) {
      // Check for water drinking effect
      let isDrinkingWater = false;
      for (const effect of activeConsumableEffects.values()) {
        if (effect.effectType.tag === 'WaterDrinking' && effect.playerId.toHexString() === player.identity.toHexString()) {
          isDrinkingWater = true;
          break;
        }
      }

            if (isDrinkingWater) {
        const pulseSpeed = 800; // Slightly faster pulse for water drinking
        const minGlowAlpha = 0.6;
        const maxGlowAlpha = 0.9;
        const pulseFactor = (Math.sin(nowMs / pulseSpeed * Math.PI * 2) + 1) / 2; 
        const currentGlowAlpha = minGlowAlpha + (maxGlowAlpha - minGlowAlpha) * pulseFactor;

        ctx.shadowColor = `rgba(0, 200, 255, ${currentGlowAlpha})`; // Brighter, more neon blue glow
        ctx.shadowBlur = 12 + (pulseFactor * 10);
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
      } else {
        // Check for active healing effects (both self-heal and remote heal)
        let isBeingHealed = false;
        let isHealing = false;
        let healingEffect = null;

        for (const effect of activeConsumableEffects.values()) {
          const effectTypeTag = effect.effectType.tag;
          const isPlayerHealer = effect.playerId.toHexString() === player.identity.toHexString();
          
          // Check if this player is being healed (self-heal)
          if (isPlayerHealer && effectTypeTag === 'BandageBurst') {
            isBeingHealed = true;
            healingEffect = effect;
            break;
          }
          
          // Check if this player is healing others
          if (isPlayerHealer && effectTypeTag === 'RemoteBandageBurst') {
            isHealing = true;
            healingEffect = effect;
            break;
          }

          // Check if this player is being healed by someone else
          if (effectTypeTag === 'RemoteBandageBurst' && effect.totalAmount && effect.totalAmount > 0) {
            // If this player is the target of a remote heal
            if (effect.targetPlayerId && effect.targetPlayerId.toHexString() === player.identity.toHexString()) {
              isBeingHealed = true;
              healingEffect = effect;
              break;
            }
          }
        }

        if ((isBeingHealed || isHealing) && healingEffect) {
          const pulseSpeed = 1000; // Match bandage application speed
          const minGlowAlpha = 0.3;
          const maxGlowAlpha = 0.7;
          const pulseFactor = (Math.sin(nowMs / pulseSpeed * Math.PI * 2) + 1) / 2;
          const currentGlowAlpha = minGlowAlpha + (maxGlowAlpha - minGlowAlpha) * pulseFactor;

          // Green glow for both healer and target
          ctx.shadowColor = `rgba(0, 255, 0, ${currentGlowAlpha})`;
          ctx.shadowBlur = isBeingHealed ? 12 + (pulseFactor * 10) : 8 + (pulseFactor * 8); // Stronger effect on target
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;
        }
       }
    }
    // --- END MODIFICATION ---

    // --- Prepare sprite on offscreen canvas (for tinting) ---
    if (offscreenCtx && currentSpriteImg) {
      // PERF FIX: Only set dimensions when they change (setting resets GPU state even if same value)
      if (offscreenCanvas.width !== gameConfig.spriteWidth || offscreenCanvas.height !== gameConfig.spriteHeight) {
        offscreenCanvas.width = gameConfig.spriteWidth;
        offscreenCanvas.height = gameConfig.spriteHeight;
      }
      // Ensure transparent background
      offscreenCtx.clearRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
      // Set composite operation to ensure proper transparency handling
      offscreenCtx.globalCompositeOperation = 'source-over';
      
      // Draw the original sprite frame to the offscreen canvas
      offscreenCtx.drawImage(
        currentSpriteImg as CanvasImageSource, // UPDATED: Use selected sprite
        sx, sy, gameConfig.spriteWidth, gameConfig.spriteHeight,
        0, 0, gameConfig.spriteWidth, gameConfig.spriteHeight
      );

      if (isFlashing) {
        offscreenCtx.globalCompositeOperation = 'source-in';
        offscreenCtx.fillStyle = 'rgba(255, 255, 255, 0.85)'; 
        offscreenCtx.fillRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
        offscreenCtx.globalCompositeOperation = 'source-over';
      }

      // Apply underwater teal tinting for swimming players
      // PERF FIX: Uses GPU-accelerated canvas compositing instead of per-pixel getImageData/putImageData.
      // getImageData forces a GPU→CPU sync and the pixel loop runs in JS — this was the #1 per-frame cost
      // for swimming players. Canvas composite operations run entirely on the GPU.
      if (player.isOnWater && !isCorpse && !isCurrentlyJumping) {
        const startY = isSnorkeling ? 0 : Math.floor(offscreenCanvas.height * 0.5);
        const tintHeight = isSnorkeling ? offscreenCanvas.height : (offscreenCanvas.height - startY);
        
        // Step 1: Darken the sprite in the tinted region (multiply darkens proportionally)
        offscreenCtx.save();
        offscreenCtx.globalCompositeOperation = 'source-atop';
        
        if (isSnorkeling) {
          // Uniform deep teal overlay for fully submerged player
          // Approximates the original: red ×0.19, green ×0.36 + teal boost, blue ×0.41 + strong teal boost
          offscreenCtx.fillStyle = 'rgba(0, 65, 100, 0.58)';
          offscreenCtx.fillRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
        } else {
          // Gradient teal tint for bottom half (swimming) — deeper = more teal
          // Mimics the original depth-based gradient from water line to feet
          const gradient = offscreenCtx.createLinearGradient(0, startY, 0, offscreenCanvas.height);
          gradient.addColorStop(0, 'rgba(0, 50, 75, 0.25)');   // Light teal at water line
          gradient.addColorStop(1, 'rgba(0, 75, 110, 0.52)');  // Deep teal at bottom
          offscreenCtx.fillStyle = gradient;
          offscreenCtx.fillRect(0, startY, offscreenCanvas.width, tintHeight);
        }
        
        offscreenCtx.restore();
      }

    } else if (!currentSpriteImg) {
      // console.warn("currentSpriteImg is null, cannot draw player sprite.");
      // Fallback or skip drawing if sprite is not loaded - though asset loader should handle this.
      return; // Exit if no sprite image
    }
    // --- End Prepare sprite on offscreen canvas ---

    // Apply rotation if player is offline (or dead, though dead players are skipped earlier)
    if (!finalIsOnline) { 
      let rotationAngleRad = 0;
      switch (player.direction) {
        case 'up':    
        case 'right': 
          rotationAngleRad = -Math.PI / 2; 
          break;
        case 'down':  
        case 'left':  
        default:
          rotationAngleRad = Math.PI / 2; 
          break;
      }
      ctx.translate(centerX, centerY);
      ctx.rotate(rotationAngleRad);
      ctx.translate(-centerX, -centerY);
    }

    // Draw swimming effects that go under the sprite (underwater shadow, wake)
    // Skip when snorkeling - player is fully underwater, no surface wake effects
    if (player.isOnWater && !isCorpse && !isSnorkeling) {
      drawSwimmingEffectsUnder(
        ctx, 
        player, 
        nowMs, 
        finalIsMoving,
        spriteBaseX,
        spriteDrawY,
        drawWidth,
        drawHeight,
        cycleProgress,
        currentSpriteImg, // Pass the current sprite image for shadow shape
        sx, // Pass sprite frame x coordinate
        sy  // Pass sprite frame y coordinate
      );
    }

    // Draw the (possibly tinted) offscreen canvas to the main canvas
    if (offscreenCtx) {
      // Check if we're viewing a snorkeling (underwater) player from ABOVE water
      // This creates a "looking through water surface" effect with blur (no scale - they're near surface)
      const viewingUnderwaterFromAbove = isSnorkeling && !isViewerUnderwater;
      
      // Apply underwater-from-above effects
      if (viewingUnderwaterFromAbove) {
        // Blur for water distortion effect (snorkeling is near surface, so normal size)
        ctx.filter = 'blur(1.5px)';
        // Slight transparency to show they're just below the water surface
        ctx.globalAlpha = 0.9;
        
        // Draw at normal size (snorkeling happens near the surface)
        ctx.drawImage(
          offscreenCanvas, 
          0, 0, gameConfig.spriteWidth, gameConfig.spriteHeight,
          spriteBaseX, spriteDrawY, drawWidth, drawHeight
        );
        
        // Reset effects
        ctx.filter = 'none';
        ctx.globalAlpha = 1.0;
      } else if (renderHalfMode === 'bottom') {
        // Render only bottom 50% of sprite (underwater portion)
        const halfHeight = gameConfig.spriteHeight / 2;
        const halfDrawHeight = drawHeight / 2;
        ctx.drawImage(
          offscreenCanvas, 
          0, halfHeight, gameConfig.spriteWidth, halfHeight, // Source: bottom half from offscreen canvas
          spriteBaseX, spriteDrawY + halfDrawHeight, drawWidth, halfDrawHeight // Destination: bottom half position
        );
      } else if (renderHalfMode === 'top') {
        // Render only top 50% of sprite (above water portion)
        const halfHeight = gameConfig.spriteHeight / 2;
        const halfDrawHeight = drawHeight / 2;
        ctx.drawImage(
          offscreenCanvas, 
          0, 0, gameConfig.spriteWidth, halfHeight, // Source: top half from offscreen canvas
          spriteBaseX, spriteDrawY, drawWidth, halfDrawHeight // Destination: top half position
        );
      } else {
        // Default: render full sprite
        ctx.drawImage(
          offscreenCanvas, 
          0, 0, gameConfig.spriteWidth, gameConfig.spriteHeight, // Source rect from offscreen canvas
          spriteBaseX, spriteDrawY, drawWidth, drawHeight // Destination rect on main canvas
        );
      }
    }

    // --- MODIFICATION: Reset shadow properties after drawing the potentially glowing sprite ---
    let isDrinkingWater = false;
    if (activeConsumableEffects) {
      for (const effect of activeConsumableEffects.values()) {
        if (effect.effectType.tag === 'WaterDrinking' && effect.playerId.toHexString() === player.identity.toHexString()) {
          isDrinkingWater = true;
          break;
        }
      }
    }
    
    if ((!isCorpse && player.isKnockedOut) || isUsingItem || isUsingSeloOliveOil || isDrinkingWater || (activeConsumableEffects && activeConsumableEffects.size > 0)) {
      ctx.shadowColor = 'transparent'; // Or 'rgba(0,0,0,0)'
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    }
    // --- END MODIFICATION ---

    // Draw swimming effects that go over the sprite (water line)
    // Skip when snorkeling - player is fully underwater, no water line effect
    if (player.isOnWater && !isCorpse && !isSnorkeling) {
      drawSwimmingEffectsOver(
        ctx, 
        player, 
        nowMs,
        spriteBaseX,
        spriteDrawY,
        drawWidth,
        drawHeight
      );
    }

  } finally {
      ctx.restore(); // Restores rotation and globalCompositeOperation
  }
  // --- End Draw Sprite ---

  // Show nametag for:
  // - Living players: when hovered or shouldShowLabel is true
  // - Corpses: when shouldShowLabel is true (so players can identify whose corpse it is)
  if (isCorpse) {
    // Corpses always show nametag if shouldShowLabel is true (no title for corpses, no PvP indicator)
    if (shouldShowLabel) {
      drawNameTag(ctx, player, spriteDrawY, currentDisplayX + shakeX, finalIsOnline, true, null, undefined);
    }
  } else if (!player.isDead) {
    // Living players: show based on hover or persistent label state
    const showingDueToCurrentHover = isHovered;
    const showingDueToPersistentState = shouldShowLabel;
    const willShowLabel = showingDueToCurrentHover || showingDueToPersistentState;
    drawNameTag(ctx, player, spriteDrawY, currentDisplayX + shakeX, finalIsOnline, willShowLabel, activeTitle, nowMs);
    
    // NOTE: Throw indicator bubble disabled - was confusing for players
    // drawThrowIndicatorBubble(ctx, player, spriteDrawY, currentDisplayX + shakeX, nowMs);
  }
};