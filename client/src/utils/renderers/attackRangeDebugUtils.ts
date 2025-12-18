/**
 * Attack Range Debug Rendering Utilities
 * 
 * Renders debug visualization for server-side attack range detection.
 * Shows:
 * - Attack range semicircles (default 144px, spear 192px)
 * - Dashed lines from player to attackable entities
 * - Distance labels showing exact pixel distances
 * - Color-coded indicators (green = in range, yellow = spear range, red = out of range)
 */

import { Player, WoodenStorageBox, Barbecue, Furnace, Tree, Stone, WildAnimal, ItemDefinition as SpacetimeDBItemDefinition } from '../../generated';
import { PLAYER_RADIUS } from '../clientCollision';

// ===== CONSTANTS =====
// Server-side attack range constants (from server/src/active_equipment.rs)
// Must match: PLAYER_RADIUS * 4.5 for default, PLAYER_RADIUS * 6.0 for spear, PLAYER_RADIUS * 7.0 for scythe
export const DEFAULT_ATTACK_RANGE = PLAYER_RADIUS * 4.5; // ~144px
export const SPEAR_ATTACK_RANGE = PLAYER_RADIUS * 6.0;   // ~192px
export const SCYTHE_ATTACK_RANGE = PLAYER_RADIUS * 7.0;  // ~224px - LONGEST melee range!

// Attack arc angles (from server/src/active_equipment.rs)
export const DEFAULT_ATTACK_ARC_DEGREES = 90; // Standard 90° arc
export const SCYTHE_ATTACK_ARC_DEGREES = 150; // Scythe's massive 150° arc

export const ATTACK_ANGLE_DEGREES = 180; // 180-degree semicircle for display (shows all potential angles)

// Server-side collision offsets (from server/src/wooden_storage_box.rs, combat.rs)
const SERVER_BOX_Y_OFFSET = 52; // BOX_COLLISION_Y_OFFSET

// Max distance to render attack lines (performance optimization)
const MAX_RENDER_DISTANCE = 400;

// ===== TYPES =====
export interface AttackRangeDebugEntities {
  woodenStorageBoxes?: Map<string, WoodenStorageBox>;
  barbecues?: Map<string, Barbecue>;
  furnaces?: Map<string, Furnace>;
  trees?: Map<string, Tree>;
  stones?: Map<string, Stone>;
  wildAnimals?: Map<string, WildAnimal>;
  players?: Map<string, Player>;
}

export interface AttackRangeDebugOptions {
  playerX: number;
  playerY: number;
  facingDirection: string;
  localPlayerId: string;
  equippedItemDef?: SpacetimeDBItemDefinition | null; // Equipped weapon to show its specific range
}

// ===== HELPER FUNCTIONS =====

/**
 * Converts facing direction string to angle in radians
 */
function getFacingAngle(facingDir: string): number {
  switch (facingDir) {
    case 'Up': return -Math.PI / 2;
    case 'Down': return Math.PI / 2;
    case 'Left': return Math.PI;
    case 'Right': return 0;
    default: return Math.PI / 2; // Default down
  }
}

/**
 * Draws a label with black background
 */
function drawRangeLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string
): void {
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const metrics = ctx.measureText(text);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
  ctx.fillRect(x - metrics.width / 2 - 4, y - 8, metrics.width + 8, 16);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

/**
 * Gets weapon-specific attack range and arc based on equipped item
 */
function getWeaponRangeAndArc(itemDef: SpacetimeDBItemDefinition | null | undefined): { range: number; arcDegrees: number; color: string; label: string } {
  if (!itemDef) {
    return { range: DEFAULT_ATTACK_RANGE, arcDegrees: DEFAULT_ATTACK_ARC_DEGREES, color: 'rgba(255, 69, 0, 0.4)', label: 'Default' };
  }
  
  const name = itemDef.name;
  
  // Scythe - LONGEST range, WIDEST arc
  if (name === 'Scythe') {
    return { range: SCYTHE_ATTACK_RANGE, arcDegrees: SCYTHE_ATTACK_ARC_DEGREES, color: 'rgba(0, 255, 128, 0.4)', label: 'Scythe' };
  }
  
  // Spears - extended range, default arc
  if (name === 'Wooden Spear' || name === 'Stone Spear' || name === 'Reed Harpoon') {
    return { range: SPEAR_ATTACK_RANGE, arcDegrees: DEFAULT_ATTACK_ARC_DEGREES, color: 'rgba(255, 200, 0, 0.4)', label: 'Spear' };
  }
  
  // Use item's custom arc if defined
  const itemArc = itemDef.attackArcDegrees ?? DEFAULT_ATTACK_ARC_DEGREES;
  return { range: DEFAULT_ATTACK_RANGE, arcDegrees: itemArc, color: 'rgba(255, 69, 0, 0.4)', label: 'Melee' };
}

/**
 * Draws attack range semicircles (default, spear, and scythe range)
 * Shows the equipped weapon's actual arc filled, others as dashed reference circles
 */
function drawAttackRangeSemicircles(
  ctx: CanvasRenderingContext2D,
  playerX: number,
  playerY: number,
  facingAngle: number,
  equippedItemDef?: SpacetimeDBItemDefinition | null
): void {
  const displayHalfAngle = (ATTACK_ANGLE_DEGREES / 2) * (Math.PI / 180);
  
  // Get the equipped weapon's specific range and arc
  const equipped = getWeaponRangeAndArc(equippedItemDef);
  const equippedHalfArc = (equipped.arcDegrees / 2) * (Math.PI / 180);
  
  // Draw EQUIPPED weapon's actual attack arc (filled, solid)
  ctx.beginPath();
  ctx.moveTo(playerX, playerY);
  ctx.arc(playerX, playerY, equipped.range, facingAngle - equippedHalfArc, facingAngle + equippedHalfArc);
  ctx.closePath();
  ctx.fillStyle = equipped.color;
  ctx.fill();
  ctx.strokeStyle = equipped.color.replace('0.4', '0.9');
  ctx.lineWidth = 3;
  ctx.stroke();
  
  // Draw arc edge lines
  ctx.beginPath();
  ctx.moveTo(playerX, playerY);
  ctx.lineTo(playerX + Math.cos(facingAngle - equippedHalfArc) * equipped.range, 
             playerY + Math.sin(facingAngle - equippedHalfArc) * equipped.range);
  ctx.moveTo(playerX, playerY);
  ctx.lineTo(playerX + Math.cos(facingAngle + equippedHalfArc) * equipped.range, 
             playerY + Math.sin(facingAngle + equippedHalfArc) * equipped.range);
  ctx.stroke();

  // Draw reference circles for other weapon ranges (dashed, ghosted)
  ctx.setLineDash([6, 6]);
  ctx.lineWidth = 1;
  
  // Default melee range circle (if not equipped)
  if (equipped.range !== DEFAULT_ATTACK_RANGE) {
    ctx.beginPath();
    ctx.arc(playerX, playerY, DEFAULT_ATTACK_RANGE, facingAngle - displayHalfAngle, facingAngle + displayHalfAngle);
    ctx.strokeStyle = 'rgba(255, 69, 0, 0.25)';
    ctx.stroke();
  }
  
  // Spear range circle (if not equipped)
  if (equipped.range !== SPEAR_ATTACK_RANGE) {
    ctx.beginPath();
    ctx.arc(playerX, playerY, SPEAR_ATTACK_RANGE, facingAngle - displayHalfAngle, facingAngle + displayHalfAngle);
    ctx.strokeStyle = 'rgba(255, 200, 0, 0.25)';
    ctx.stroke();
  }
  
  // Scythe range circle (if not equipped)
  if (equipped.range !== SCYTHE_ATTACK_RANGE) {
    ctx.beginPath();
    ctx.arc(playerX, playerY, SCYTHE_ATTACK_RANGE, facingAngle - displayHalfAngle, facingAngle + displayHalfAngle);
    ctx.strokeStyle = 'rgba(0, 255, 128, 0.25)';
    ctx.stroke();
  }
  
  ctx.setLineDash([]);

  // Draw equipped weapon info label
  const labelX = playerX + Math.cos(facingAngle) * (equipped.range + 20);
  const labelY = playerY + Math.sin(facingAngle) * (equipped.range + 20);
  const labelText = `${equipped.label}: ${Math.round(equipped.range)}px, ${equipped.arcDegrees}° arc`;
  drawRangeLabel(ctx, labelText, labelX, labelY, equipped.color.replace('0.4', '1'));
  
  // Draw range comparison legend at top
  const legendY = playerY - equipped.range - 60;
  drawRangeLabel(ctx, `Default: ${Math.round(DEFAULT_ATTACK_RANGE)}px`, playerX - 100, legendY, '#ff4500');
  drawRangeLabel(ctx, `Spear: ${Math.round(SPEAR_ATTACK_RANGE)}px`, playerX, legendY, '#ffc800');
  drawRangeLabel(ctx, `Scythe: ${Math.round(SCYTHE_ATTACK_RANGE)}px`, playerX + 100, legendY, '#00ff80');
}

/**
 * Draws a dashed line from player to entity with distance label
 */
function drawAttackLine(
  ctx: CanvasRenderingContext2D,
  playerX: number,
  playerY: number,
  targetX: number,
  targetY: number,
  equippedRange: number
): void {
  const dx = targetX - playerX;
  const dy = targetY - playerY;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Only draw if reasonably close
  if (dist > MAX_RENDER_DISTANCE) return;

  // Check if in attack range (compare against equipped weapon's range)
  const inEquippedRange = dist <= equippedRange;
  const inDefaultRange = dist <= DEFAULT_ATTACK_RANGE;
  const inSpearRange = dist <= SPEAR_ATTACK_RANGE;
  const inScytheRange = dist <= SCYTHE_ATTACK_RANGE;

  // Draw dashed line from player center to target center
  ctx.beginPath();
  ctx.setLineDash([6, 4]);
  ctx.moveTo(playerX, playerY);
  ctx.lineTo(targetX, targetY);

  if (inEquippedRange) {
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.8)'; // Green if hittable with equipped weapon
  } else if (inScytheRange) {
    ctx.strokeStyle = 'rgba(0, 255, 128, 0.6)'; // Cyan if scythe range
  } else if (inSpearRange) {
    ctx.strokeStyle = 'rgba(255, 255, 0, 0.6)'; // Yellow if spear range
  } else if (inDefaultRange) {
    ctx.strokeStyle = 'rgba(255, 140, 0, 0.6)'; // Orange if default range
  } else {
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.4)'; // Red if out of all ranges
  }
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw target point marker (server uses center for distance check)
  ctx.beginPath();
  ctx.arc(targetX, targetY, 6, 0, Math.PI * 2);
  ctx.fillStyle = inEquippedRange ? 'rgba(0, 255, 0, 0.9)' :
                  inScytheRange ? 'rgba(0, 255, 128, 0.8)' :
                  inSpearRange ? 'rgba(255, 255, 0, 0.8)' :
                  inDefaultRange ? 'rgba(255, 140, 0, 0.8)' : 'rgba(255, 0, 0, 0.6)';
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Draw distance label at midpoint
  const midX = (playerX + targetX) / 2;
  const midY = (playerY + targetY) / 2;
  const distText = `${Math.round(dist)}px`;
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const metrics = ctx.measureText(distText);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
  ctx.fillRect(midX - metrics.width / 2 - 3, midY - 7, metrics.width + 6, 14);
  ctx.fillStyle = inEquippedRange ? '#00ff00' : 
                  inScytheRange ? '#00ff80' :
                  inSpearRange ? '#ffff00' : 
                  inDefaultRange ? '#ff8c00' : '#ff6666';
  ctx.fillText(distText, midX, midY);
}

// ===== MAIN RENDER FUNCTION =====

/**
 * Renders the attack range debug overlay
 * Shows server-side attack detection ranges and distances to nearby entities
 */
export function renderAttackRangeDebug(
  ctx: CanvasRenderingContext2D,
  options: AttackRangeDebugOptions,
  entities: AttackRangeDebugEntities
): void {
  const { playerX, playerY, facingDirection, localPlayerId, equippedItemDef } = options;
  const { woodenStorageBoxes, barbecues, furnaces, trees, stones, wildAnimals, players } = entities;

  const facingAngle = getFacingAngle(facingDirection);
  
  // Get equipped weapon's range for attack line coloring
  const equipped = getWeaponRangeAndArc(equippedItemDef);
  const equippedRange = equipped.range;

  // Draw attack range semicircles (shows equipped weapon's arc + reference ranges)
  drawAttackRangeSemicircles(ctx, playerX, playerY, facingAngle, equippedItemDef);

  // Draw attack lines to wooden storage boxes
  if (woodenStorageBoxes) {
    woodenStorageBoxes.forEach((box) => {
      if (box.isDestroyed) return;
      // Server uses: target_y = box.pos_y - BOX_COLLISION_Y_OFFSET
      const targetY = box.posY - SERVER_BOX_Y_OFFSET;
      drawAttackLine(ctx, playerX, playerY, box.posX, targetY, equippedRange);
    });
  }

  // Draw attack lines to barbecues
  if (barbecues) {
    barbecues.forEach((bbq) => {
      if (bbq.isDestroyed) return;
      // Barbecues use same Y offset pattern
      const targetY = bbq.posY - SERVER_BOX_Y_OFFSET;
      drawAttackLine(ctx, playerX, playerY, bbq.posX, targetY, equippedRange);
    });
  }

  // Draw attack lines to furnaces
  if (furnaces) {
    furnaces.forEach((furnace) => {
      if (furnace.isDestroyed) return;
      const targetY = furnace.posY - SERVER_BOX_Y_OFFSET;
      drawAttackLine(ctx, playerX, playerY, furnace.posX, targetY, equippedRange);
    });
  }

  // Draw attack lines to trees
  if (trees) {
    trees.forEach((tree) => {
      if (tree.respawnAt) return;
      drawAttackLine(ctx, playerX, playerY, tree.posX, tree.posY, equippedRange);
    });
  }

  // Draw attack lines to stones
  if (stones) {
    stones.forEach((stone) => {
      if (stone.respawnAt) return;
      drawAttackLine(ctx, playerX, playerY, stone.posX, stone.posY, equippedRange);
    });
  }

  // Draw attack lines to wild animals
  if (wildAnimals) {
    wildAnimals.forEach((animal) => {
      if (animal.health <= 0) return;
      drawAttackLine(ctx, playerX, playerY, animal.posX, animal.posY, equippedRange);
    });
  }

  // Draw attack lines to other players
  if (players) {
    players.forEach((otherPlayer, id) => {
      if (id === localPlayerId) return; // Skip self
      if (!otherPlayer.isOnline) return;
      drawAttackLine(ctx, playerX, playerY, otherPlayer.positionX, otherPlayer.positionY, equippedRange);
    });
  }
}
