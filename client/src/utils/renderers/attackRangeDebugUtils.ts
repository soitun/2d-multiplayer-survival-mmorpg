/**
 * Attack Range Debug Rendering Utilities
 * 
 * Renders debug visualization for server-side attack range detection.
 * Shows:
 * - Attack range semicircles (default 224px, spear 288px)
 * - Dashed lines from player to attackable entities
 * - Distance labels showing exact pixel distances
 * - Color-coded indicators (green = in range, yellow = spear range, red = out of range)
 */

import { Player, WoodenStorageBox, Barbecue, Furnace, Tree, Stone, WildAnimal } from '../../generated';

// ===== CONSTANTS =====
// Server-side attack range constants (from server/src/active_equipment.rs)
const SERVER_PLAYER_RADIUS = 32;
export const DEFAULT_ATTACK_RANGE = SERVER_PLAYER_RADIUS * 7; // 224px
export const SPEAR_ATTACK_RANGE = SERVER_PLAYER_RADIUS * 9;   // 288px
export const ATTACK_ANGLE_DEGREES = 180; // 180-degree semicircle

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
 * Draws attack range semicircles (default and spear range)
 */
function drawAttackRangeSemicircles(
  ctx: CanvasRenderingContext2D,
  playerX: number,
  playerY: number,
  facingAngle: number
): void {
  const halfAngle = (ATTACK_ANGLE_DEGREES / 2) * (Math.PI / 180);

  // Draw default attack range semicircle (224px) - filled
  ctx.beginPath();
  ctx.moveTo(playerX, playerY);
  ctx.arc(playerX, playerY, DEFAULT_ATTACK_RANGE, facingAngle - halfAngle, facingAngle + halfAngle);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255, 69, 0, 0.1)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 69, 0, 0.6)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Draw spear attack range semicircle (288px) - dashed line
  ctx.beginPath();
  ctx.setLineDash([8, 8]);
  ctx.arc(playerX, playerY, SPEAR_ATTACK_RANGE, facingAngle - halfAngle, facingAngle + halfAngle);
  ctx.strokeStyle = 'rgba(255, 140, 0, 0.5)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw range labels at the edge of each range
  const labelDefaultX = playerX + Math.cos(facingAngle) * DEFAULT_ATTACK_RANGE;
  const labelDefaultY = playerY + Math.sin(facingAngle) * DEFAULT_ATTACK_RANGE;
  drawRangeLabel(ctx, '224px (default)', labelDefaultX, labelDefaultY - 15, '#ff4500');

  const labelSpearX = playerX + Math.cos(facingAngle) * SPEAR_ATTACK_RANGE;
  const labelSpearY = playerY + Math.sin(facingAngle) * SPEAR_ATTACK_RANGE;
  drawRangeLabel(ctx, '288px (spear)', labelSpearX, labelSpearY - 15, '#ff8c00');
}

/**
 * Draws a dashed line from player to entity with distance label
 */
function drawAttackLine(
  ctx: CanvasRenderingContext2D,
  playerX: number,
  playerY: number,
  targetX: number,
  targetY: number
): void {
  const dx = targetX - playerX;
  const dy = targetY - playerY;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Only draw if reasonably close
  if (dist > MAX_RENDER_DISTANCE) return;

  // Check if in attack range
  const inDefaultRange = dist <= DEFAULT_ATTACK_RANGE;
  const inSpearRange = dist <= SPEAR_ATTACK_RANGE;

  // Draw dashed line from player center to target center
  ctx.beginPath();
  ctx.setLineDash([6, 4]);
  ctx.moveTo(playerX, playerY);
  ctx.lineTo(targetX, targetY);

  if (inDefaultRange) {
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.8)'; // Green if hittable
  } else if (inSpearRange) {
    ctx.strokeStyle = 'rgba(255, 255, 0, 0.8)'; // Yellow if spear range
  } else {
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)'; // Red if out of range
  }
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw target point marker (server uses center for distance check)
  ctx.beginPath();
  ctx.arc(targetX, targetY, 6, 0, Math.PI * 2);
  ctx.fillStyle = inDefaultRange ? 'rgba(0, 255, 0, 0.9)' :
                  inSpearRange ? 'rgba(255, 255, 0, 0.9)' : 'rgba(255, 0, 0, 0.7)';
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
  ctx.fillStyle = inDefaultRange ? '#00ff00' : inSpearRange ? '#ffff00' : '#ff6666';
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
  const { playerX, playerY, facingDirection, localPlayerId } = options;
  const { woodenStorageBoxes, barbecues, furnaces, trees, stones, wildAnimals, players } = entities;

  const facingAngle = getFacingAngle(facingDirection);

  // Draw attack range semicircles
  drawAttackRangeSemicircles(ctx, playerX, playerY, facingAngle);

  // Draw attack lines to wooden storage boxes
  if (woodenStorageBoxes) {
    woodenStorageBoxes.forEach((box) => {
      if (box.isDestroyed) return;
      // Server uses: target_y = box.pos_y - BOX_COLLISION_Y_OFFSET
      const targetY = box.posY - SERVER_BOX_Y_OFFSET;
      drawAttackLine(ctx, playerX, playerY, box.posX, targetY);
    });
  }

  // Draw attack lines to barbecues
  if (barbecues) {
    barbecues.forEach((bbq) => {
      if (bbq.isDestroyed) return;
      // Barbecues use same Y offset pattern
      const targetY = bbq.posY - SERVER_BOX_Y_OFFSET;
      drawAttackLine(ctx, playerX, playerY, bbq.posX, targetY);
    });
  }

  // Draw attack lines to furnaces
  if (furnaces) {
    furnaces.forEach((furnace) => {
      if (furnace.isDestroyed) return;
      const targetY = furnace.posY - SERVER_BOX_Y_OFFSET;
      drawAttackLine(ctx, playerX, playerY, furnace.posX, targetY);
    });
  }

  // Draw attack lines to trees
  if (trees) {
    trees.forEach((tree) => {
      if (tree.respawnAt) return;
      drawAttackLine(ctx, playerX, playerY, tree.posX, tree.posY);
    });
  }

  // Draw attack lines to stones
  if (stones) {
    stones.forEach((stone) => {
      if (stone.respawnAt) return;
      drawAttackLine(ctx, playerX, playerY, stone.posX, stone.posY);
    });
  }

  // Draw attack lines to wild animals
  if (wildAnimals) {
    wildAnimals.forEach((animal) => {
      if (animal.health <= 0) return;
      drawAttackLine(ctx, playerX, playerY, animal.posX, animal.posY);
    });
  }

  // Draw attack lines to other players
  if (players) {
    players.forEach((otherPlayer, id) => {
      if (id === localPlayerId) return; // Skip self
      if (!otherPlayer.isOnline) return;
      drawAttackLine(ctx, playerX, playerY, otherPlayer.positionX, otherPlayer.positionY);
    });
  }
}
