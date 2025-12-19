/**
 * Debug Overlay Rendering Utilities
 * 
 * Consolidates all debug visualization rendering:
 * - Chunk boundaries
 * - Interior/building debug
 * - Collision shapes
 */

import { CollisionShape, COLLISION_OFFSETS, PLAYER_RADIUS } from '../clientCollision';
import { Player, Tree, Stone, RuneStone, Cairn, WoodenStorageBox, RainCollector, Furnace, Barbecue, Shelter, WildAnimal, Barrel, SeaStack, WallCell, FoundationCell, HomesteadHearth, BasaltColumn, Door, AlkStation, Campfire, Lantern, DroppedItem, HarvestableResource, PlayerCorpse, Stash, SleepingBag, PlantedSeed, BrothPot, AnimalCorpse, Fumarole } from '../../generated';
import { YSortedEntityType, CompoundBuildingEntity } from '../../hooks/useEntityFiltering';

// ===== TYPES =====

export interface ChunkBoundaryOptions {
  chunkSizePx: number;
  cameraOffsetX: number;
  cameraOffsetY: number;
  canvasWidth: number;
  canvasHeight: number;
}

export interface BuildingCluster {
  isEnclosed: boolean;
  cellCoords: Set<string>;
}

export interface InteriorDebugOptions {
  buildingClusters: Map<string, BuildingCluster>;
  playerBuildingClusterId: string | null;
  foundationTileSize: number;
}

export interface CollisionDebugEntities {
  trees: Map<string, Tree>;
  stones: Map<string, Stone>;
  runeStones: Map<string, RuneStone>;
  cairns: Map<string, Cairn>;
  boxes: Map<string, WoodenStorageBox>;
  rainCollectors: Map<string, RainCollector>;
  furnaces: Map<string, Furnace>;
  barbecues: Map<string, Barbecue>;
  shelters: Map<string, Shelter>;
  players: Map<string, Player>;
  wildAnimals: Map<string, WildAnimal>;
  barrels: Map<string, Barrel>;
  seaStacks: Map<string, SeaStack>;
  wallCells: Map<string, WallCell>;
  foundationCells: Map<string, FoundationCell>;
  homesteadHearths: Map<string, HomesteadHearth>;
  basaltColumns: Map<string, BasaltColumn>;
  doors: Map<string, Door>;
  alkStations: Map<string, AlkStation>;
}

export interface CollisionDebugOptions {
  playerX: number;
  playerY: number;
  localPlayerId: string;
  collisionShapes: CollisionShape[];
}

export interface YSortDebugOptions {
  playerX: number;
  playerY: number;
  ySortedEntities: YSortedEntityType[];
  viewMinX: number;
  viewMaxX: number;
}

// ===== CHUNK BOUNDARIES =====

/**
 * Renders chunk boundary grid lines for debugging chunk-based systems
 */
export function renderChunkBoundaries(
  ctx: CanvasRenderingContext2D,
  options: ChunkBoundaryOptions
): void {
  const { chunkSizePx, cameraOffsetX, cameraOffsetY, canvasWidth, canvasHeight } = options;

  ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)'; // Black with transparency
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 5]); // Dashed line pattern

  // Calculate visible chunk range based on camera position
  const cameraWorldX = -cameraOffsetX;
  const cameraWorldY = -cameraOffsetY;
  const startChunkX = Math.floor((cameraWorldX - chunkSizePx) / chunkSizePx);
  const endChunkX = Math.ceil((cameraWorldX + canvasWidth + chunkSizePx) / chunkSizePx);
  const startChunkY = Math.floor((cameraWorldY - chunkSizePx) / chunkSizePx);
  const endChunkY = Math.ceil((cameraWorldY + canvasHeight + chunkSizePx) / chunkSizePx);

  // Draw vertical lines
  for (let chunkX = startChunkX; chunkX <= endChunkX; chunkX++) {
    const worldX = chunkX * chunkSizePx;
    ctx.beginPath();
    ctx.moveTo(worldX, startChunkY * chunkSizePx);
    ctx.lineTo(worldX, endChunkY * chunkSizePx);
    ctx.stroke();
  }

  // Draw horizontal lines
  for (let chunkY = startChunkY; chunkY <= endChunkY; chunkY++) {
    const worldY = chunkY * chunkSizePx;
    ctx.beginPath();
    ctx.moveTo(startChunkX * chunkSizePx, worldY);
    ctx.lineTo(endChunkX * chunkSizePx, worldY);
    ctx.stroke();
  }

  // Draw chunk coordinates at intersections (only for visible chunks)
  ctx.font = '12px monospace';
  ctx.fillStyle = 'rgba(0, 0, 0, 0.9)'; // Black for better visibility
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.setLineDash([]); // Reset dash pattern

  for (let chunkX = startChunkX; chunkX < endChunkX; chunkX++) {
    for (let chunkY = startChunkY; chunkY < endChunkY; chunkY++) {
      const worldX = chunkX * chunkSizePx + 5; // Offset from corner
      const worldY = chunkY * chunkSizePx + 5;
      ctx.fillText(`(${chunkX}, ${chunkY})`, worldX, worldY);
    }
  }

  ctx.setLineDash([]); // Reset dash pattern for other rendering
}

// ===== INTERIOR DEBUG =====

/**
 * Renders interior/building cluster debug visualization
 */
export function renderInteriorDebug(
  ctx: CanvasRenderingContext2D,
  options: InteriorDebugOptions
): void {
  const { buildingClusters, playerBuildingClusterId, foundationTileSize } = options;

  // Loop through all building clusters
  for (const [clusterId, cluster] of buildingClusters) {
    // Only render enclosed buildings
    if (!cluster.isEnclosed) continue;

    // Determine color based on whether player is inside this cluster
    const isPlayerInside = playerBuildingClusterId === clusterId;
    const fillColor = isPlayerInside
      ? 'rgba(0, 255, 136, 0.35)' // Green for player's current building
      : 'rgba(0, 212, 255, 0.25)'; // Cyan for other enclosed buildings
    const strokeColor = isPlayerInside
      ? 'rgba(0, 255, 136, 0.8)'
      : 'rgba(0, 212, 255, 0.6)';

    ctx.fillStyle = fillColor;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2;

    // Loop through all cells in the cluster
    for (const cellKey of cluster.cellCoords) {
      const [cellXStr, cellYStr] = cellKey.split(',');
      const cellX = parseInt(cellXStr, 10);
      const cellY = parseInt(cellYStr, 10);

      // Convert cell coordinates to world pixels
      const worldX = cellX * foundationTileSize;
      const worldY = cellY * foundationTileSize;

      // Draw filled rectangle
      ctx.fillRect(worldX, worldY, foundationTileSize, foundationTileSize);
      // Draw border for visibility
      ctx.strokeRect(worldX, worldY, foundationTileSize, foundationTileSize);
    }

    // Draw cluster info label at the first cell of each cluster
    const firstCellKey = cluster.cellCoords.values().next().value;
    if (firstCellKey) {
      const [firstCellXStr, firstCellYStr] = firstCellKey.split(',');
      const labelX = parseInt(firstCellXStr, 10) * foundationTileSize + 4;
      const labelY = parseInt(firstCellYStr, 10) * foundationTileSize + 16;

      ctx.font = '10px monospace';
      ctx.fillStyle = isPlayerInside ? 'rgba(0, 255, 136, 1)' : 'rgba(0, 212, 255, 1)';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const label = isPlayerInside ? 'INSIDE' : 'ENCLOSED';
      ctx.fillText(label, labelX, labelY);
    }
  }
}

// ===== COLLISION DEBUG =====

/**
 * Gets color configuration for a collision shape type
 */
function getShapeColors(shapeType: string): { fillColor: string; strokeColor: string } {
  const fillAlpha = 0.15;
  const strokeAlpha = 0.8;
  
  // Default magenta
  let fillColor = `rgba(255, 0, 128, ${fillAlpha})`;
  let strokeColor = `rgba(255, 0, 128, ${strokeAlpha})`;

  // Different colors for different entity types
  if (shapeType.startsWith('player-')) {
    fillColor = `rgba(0, 255, 255, ${fillAlpha})`; // Cyan for players
    strokeColor = `rgba(0, 255, 255, ${strokeAlpha})`;
  } else if (shapeType.startsWith('tree-')) {
    fillColor = `rgba(0, 255, 0, ${fillAlpha})`; // Green for trees
    strokeColor = `rgba(0, 255, 0, ${strokeAlpha})`;
  } else if (shapeType.startsWith('stone-') || shapeType.startsWith('runeStone-') || shapeType.startsWith('basalt_column-')) {
    fillColor = `rgba(128, 128, 128, ${fillAlpha})`; // Gray for stones
    strokeColor = `rgba(160, 160, 160, ${strokeAlpha})`;
  } else if (shapeType.startsWith('cairn-')) {
    fillColor = `rgba(200, 150, 100, ${fillAlpha})`; // Brown for cairns
    strokeColor = `rgba(200, 150, 100, ${strokeAlpha})`;
  } else if (shapeType.startsWith('animal-')) {
    fillColor = `rgba(255, 165, 0, ${fillAlpha})`; // Orange for animals
    strokeColor = `rgba(255, 165, 0, ${strokeAlpha})`;
  } else if (shapeType.startsWith('wall-') || shapeType.startsWith('door-')) {
    fillColor = `rgba(139, 69, 19, ${fillAlpha})`; // Saddle brown for walls/doors
    strokeColor = `rgba(139, 69, 19, ${strokeAlpha})`;
  } else if (shapeType.startsWith('shelter-')) {
    fillColor = `rgba(70, 130, 180, ${fillAlpha})`; // Steel blue for shelters
    strokeColor = `rgba(70, 130, 180, ${strokeAlpha})`;
  } else if (shapeType.startsWith('compound_building-')) {
    fillColor = `rgba(255, 215, 0, ${fillAlpha})`; // Gold for compound buildings
    strokeColor = `rgba(255, 215, 0, ${strokeAlpha})`;
  } else if (shapeType.startsWith('alk_station-')) {
    fillColor = `rgba(138, 43, 226, ${fillAlpha})`; // Blue violet for ALK stations
    strokeColor = `rgba(138, 43, 226, ${strokeAlpha})`;
  }

  return { fillColor, strokeColor };
}

/**
 * Gets offset info string for entity type label
 */
function getOffsetInfo(type: string): string {
  const typeUpper = type.toUpperCase();
  if (typeUpper === 'TREE') return `off:(${COLLISION_OFFSETS.TREE.x},${COLLISION_OFFSETS.TREE.y})`;
  if (typeUpper === 'STONE') return `off:(${COLLISION_OFFSETS.STONE.x},${COLLISION_OFFSETS.STONE.y})`;
  if (typeUpper === 'RUNESTONE') return `off:(${COLLISION_OFFSETS.RUNE_STONE.x},${COLLISION_OFFSETS.RUNE_STONE.y})`;
  if (typeUpper === 'CAIRN') return `off:(${COLLISION_OFFSETS.CAIRN.x},${COLLISION_OFFSETS.CAIRN.y})`;
  if (typeUpper === 'BOX') return `off:(${COLLISION_OFFSETS.STORAGE_BOX.x},${COLLISION_OFFSETS.STORAGE_BOX.y})`;
  if (typeUpper === 'RAIN_COLLECTOR') return `off:(${COLLISION_OFFSETS.RAIN_COLLECTOR.x},${COLLISION_OFFSETS.RAIN_COLLECTOR.y})`;
  if (typeUpper === 'FURNACE') return `off:(${COLLISION_OFFSETS.FURNACE.x},${COLLISION_OFFSETS.FURNACE.y})`;
  if (typeUpper === 'BARBECUE') return `off:(0,0)`;
  if (typeUpper === 'SHELTER') return `off:(${COLLISION_OFFSETS.SHELTER.x},${COLLISION_OFFSETS.SHELTER.y})`;
  if (typeUpper === 'ANIMAL') return `off:(${COLLISION_OFFSETS.WILD_ANIMAL.x},${COLLISION_OFFSETS.WILD_ANIMAL.y})`;
  if (typeUpper === 'BARREL') return `off:(${COLLISION_OFFSETS.BARREL.x},${COLLISION_OFFSETS.BARREL.y})`;
  if (typeUpper === 'ALK_STATION') return `off:(${COLLISION_OFFSETS.ALK_STATION.x},${COLLISION_OFFSETS.ALK_STATION.y})`;
  if (typeUpper === 'SEA_STACK') return `off:(${COLLISION_OFFSETS.SEA_STACK.x},${COLLISION_OFFSETS.SEA_STACK.y})`;
  if (typeUpper === 'HOMESTEAD_HEARTH' || typeUpper === 'HEARTH') return `off:(${COLLISION_OFFSETS.HOMESTEAD_HEARTH.x},${COLLISION_OFFSETS.HOMESTEAD_HEARTH.y})`;
  if (typeUpper === 'BASALT_COLUMN') return `off:(${COLLISION_OFFSETS.BASALT_COLUMN.x},${COLLISION_OFFSETS.BASALT_COLUMN.y})`;
  return 'off:(0,0)';
}

/**
 * Draws a debug label with black background
 */
function drawDebugLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  // Measure text for background
  const metrics = ctx.measureText(text);
  const padding = 4;
  const bgWidth = metrics.width + padding * 2;
  const bgHeight = 16;

  // Draw black background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
  ctx.fillRect(x - bgWidth / 2, y, bgWidth, bgHeight);

  // Draw white text
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, x, y + 2);
}

/**
 * Renders collision shapes debug visualization
 */
export function renderCollisionDebug(
  ctx: CanvasRenderingContext2D,
  options: CollisionDebugOptions
): void {
  const { playerX, playerY, collisionShapes } = options;

  // Render each collision shape
  for (const shape of collisionShapes) {
    const { fillColor, strokeColor } = getShapeColors(shape.type);
    
    ctx.fillStyle = fillColor;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2;

    // Extract entity type for label (remove ID suffix)
    const entityType = shape.type.split('-')[0];

    if (shape.radius !== undefined) {
      // Render circle collision
      ctx.beginPath();
      ctx.arc(shape.x, shape.y, shape.radius, 0, Math.PI * 2);
      ctx.fillStyle = fillColor;
      ctx.fill();
      ctx.strokeStyle = strokeColor;
      ctx.stroke();

      // Draw center point
      ctx.fillStyle = strokeColor;
      ctx.beginPath();
      ctx.arc(shape.x, shape.y, 4, 0, Math.PI * 2);
      ctx.fill();

      // Draw entity type label with radius and offset info
      const labelY = shape.y + shape.radius + 6;
      drawDebugLabel(ctx, `${entityType}`, shape.x, labelY);
      drawDebugLabel(ctx, `r:${shape.radius} ${getOffsetInfo(entityType)}`, shape.x, labelY + 18);
    } else if (shape.width !== undefined && shape.height !== undefined) {
      // Render AABB (rectangle) collision
      const halfWidth = shape.width / 2;
      const halfHeight = shape.height / 2;
      ctx.fillStyle = fillColor;
      ctx.fillRect(shape.x - halfWidth, shape.y - halfHeight, shape.width, shape.height);
      ctx.strokeStyle = strokeColor;
      ctx.strokeRect(shape.x - halfWidth, shape.y - halfHeight, shape.width, shape.height);

      // Draw center point
      ctx.fillStyle = strokeColor;
      ctx.beginPath();
      ctx.arc(shape.x, shape.y, 4, 0, Math.PI * 2);
      ctx.fill();

      // Draw entity type label with dimensions and offset info
      const labelY = shape.y + halfHeight + 6;
      drawDebugLabel(ctx, `${entityType}`, shape.x, labelY);
      drawDebugLabel(ctx, `${shape.width}x${shape.height} ${getOffsetInfo(entityType)}`, shape.x, labelY + 18);
    } else if (shape.lineStartX !== undefined && shape.lineStartY !== undefined &&
               shape.lineEndX !== undefined && shape.lineEndY !== undefined) {
      // Render line segment collision (for diagonal walls)
      ctx.beginPath();
      ctx.moveTo(shape.lineStartX, shape.lineStartY);
      ctx.lineTo(shape.lineEndX, shape.lineEndY);
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = shape.lineThickness || 8;
      ctx.stroke();
      ctx.lineWidth = 2; // Reset
    }
  }

  // Also render the local player's collision circle
  ctx.fillStyle = 'rgba(255, 255, 0, 0.2)'; // Yellow for local player
  ctx.strokeStyle = 'rgba(255, 255, 0, 0.9)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(playerX, playerY, PLAYER_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Draw center crosshair for local player
  ctx.strokeStyle = 'rgba(255, 255, 0, 1)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(playerX - 10, playerY);
  ctx.lineTo(playerX + 10, playerY);
  ctx.moveTo(playerX, playerY - 10);
  ctx.lineTo(playerX, playerY + 10);
  ctx.stroke();

  // Draw simple player radius label
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const labelText = `Player r:${PLAYER_RADIUS}`;
  const metrics = ctx.measureText(labelText);
  const padding = 4;
  const labelX = playerX;
  const labelY = playerY + PLAYER_RADIUS + 6;

  // Draw black background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
  ctx.fillRect(labelX - metrics.width / 2 - padding, labelY, metrics.width + padding * 2, 16);

  // Draw white text
  ctx.fillStyle = '#ffffff';
  ctx.fillText(labelText, labelX, labelY + 2);
}

// ===== Y-SORT DEBUG =====

/**
 * Gets the Y-sort key for an entity (the Y value used for depth sorting)
 * This replicates the logic from useEntityFiltering's getEntityY function
 */
function getYSortKeyForEntity(item: YSortedEntityType, timestamp: number): number {
  const { entity, type } = item;
  switch (type) {
    case 'player': {
      const player = entity as Player;
      const playerY = player.positionY;
      if (playerY === undefined || playerY === null || isNaN(playerY)) {
        return 0;
      }
      return playerY + 48 + 2.0; // Player head position + offset
    }
    case 'tree':
    case 'stone':
    case 'wooden_storage_box':
    case 'stash':
    case 'campfire':
    case 'furnace':
    case 'barbecue':
    case 'lantern':
    case 'homestead_hearth':
    case 'planted_seed':
    case 'dropped_item':
    case 'harvestable_resource':
    case 'rain_collector':
    case 'broth_pot':
    case 'animal_corpse':
    case 'player_corpse':
    case 'wild_animal':
    case 'barrel':
    case 'sleeping_bag':
    case 'fumarole':
    case 'basalt_column':
      return (entity as any).posY;
    case 'cairn':
      return (entity as Cairn).posY;
    case 'rune_stone':
      return (entity as RuneStone).posY;
    case 'alk_station': {
      const alkStation = entity as AlkStation;
      const ALK_STATION_VISUAL_FOOT_OFFSET = 170;
      return alkStation.worldPosY - ALK_STATION_VISUAL_FOOT_OFFSET;
    }
    case 'compound_building': {
      const building = entity as CompoundBuildingEntity;
      return building.worldY;
    }
    case 'shelter':
      return (entity as Shelter).posY - 100;
    case 'sea_stack':
      return (entity as any).posY;
    case 'grass':
      return (entity as any).serverPosY;
    case 'foundation_cell': {
      const foundation = entity as FoundationCell;
      return foundation.cellY * 48;
    }
    case 'wall_cell': {
      const wall = entity as WallCell;
      const FOUNDATION_TILE_SIZE = 96;
      const baseY = wall.cellY * FOUNDATION_TILE_SIZE;
      const isTriangle = wall.foundationShape >= 2 && wall.foundationShape <= 5;
      if (isTriangle) {
        return baseY + FOUNDATION_TILE_SIZE / 2;
      } else if (wall.edge === 0) {
        return baseY; // North wall
      } else if (wall.edge === 2) {
        return baseY + FOUNDATION_TILE_SIZE + 48; // South wall
      } else {
        return baseY; // East/west
      }
    }
    case 'door': {
      const door = entity as Door;
      const FOUNDATION_TILE_SIZE = 96;
      const foundationTopY = door.cellY * FOUNDATION_TILE_SIZE;
      if (door.edge === 0) {
        return foundationTopY;
      } else {
        return foundationTopY + FOUNDATION_TILE_SIZE + 48;
      }
    }
    default:
      return 0;
  }
}

/**
 * Gets the entity's X position for drawing the line
 */
function getEntityX(item: YSortedEntityType): number {
  const { entity, type } = item;
  switch (type) {
    case 'player':
      return (entity as Player).positionX;
    case 'alk_station':
      return (entity as AlkStation).worldPosX;
    case 'compound_building':
      return (entity as CompoundBuildingEntity).worldX;
    case 'foundation_cell':
      return (entity as FoundationCell).cellX * 48 + 24;
    case 'wall_cell':
      return (entity as WallCell).cellX * 96 + 48;
    case 'door':
      return (entity as Door).cellX * 96 + 48;
    case 'grass':
      return (entity as any).serverPosX;
    case 'fog_overlay':
      return ((entity as any).bounds.minX + (entity as any).bounds.maxX) / 2;
    default:
      return (entity as any).posX ?? 0;
  }
}

/**
 * Gets the display width for the Y-sort line based on entity type
 */
function getEntityWidth(item: YSortedEntityType): number {
  switch (item.type) {
    case 'player': return 48;
    case 'tree': return 80;
    case 'stone': return 60;
    case 'rune_stone': return 80;
    case 'cairn': return 60;
    case 'wooden_storage_box': return 48;
    case 'shelter': return 120;
    case 'alk_station': return 160;
    case 'compound_building': return (item.entity as CompoundBuildingEntity).width;
    case 'wall_cell': return 96;
    case 'door': return 48;
    case 'foundation_cell': return 96;
    case 'sea_stack': return 100;
    case 'basalt_column': return 60;
    case 'furnace': return 48;
    case 'barbecue': return 48;
    case 'campfire': return 48;
    case 'lantern': return 24;
    case 'homestead_hearth': return 64;
    case 'barrel': return 40;
    case 'rain_collector': return 40;
    case 'broth_pot': return 36;
    case 'wild_animal': return 48;
    case 'fumarole': return 48;
    default: return 32;
  }
}

/**
 * Gets color for entity type Y-sort line
 */
function getYSortColor(type: string): string {
  switch (type) {
    case 'player': return '#ffff00'; // Yellow for players
    case 'tree': return '#00ff00'; // Green for trees
    case 'stone': return '#888888'; // Gray for stones
    case 'rune_stone': return '#aa88ff'; // Purple for rune stones
    case 'cairn': return '#c89664'; // Brown for cairns
    case 'shelter': return '#4682b4'; // Steel blue for shelters
    case 'alk_station': return '#8a2be2'; // Blue violet for ALK
    case 'compound_building': return '#ffd700'; // Gold for compounds
    case 'wall_cell': return '#8b4513'; // Saddle brown for walls
    case 'door': return '#a0522d'; // Sienna for doors
    case 'foundation_cell': return '#696969'; // Dim gray for foundations
    case 'sea_stack': return '#708090'; // Slate gray
    case 'basalt_column': return '#36454f'; // Charcoal
    case 'wild_animal': return '#ffa500'; // Orange for animals
    default: return '#ff00ff'; // Magenta for unknown
  }
}

/**
 * Renders Y-sort debug lines showing where each entity's Y-sort threshold is
 * This draws a horizontal line at the Y position used for depth sorting
 */
export function renderYSortDebug(
  ctx: CanvasRenderingContext2D,
  options: YSortDebugOptions
): void {
  const { playerX, playerY, ySortedEntities, viewMinX, viewMaxX } = options;
  const timestamp = Date.now();

  // Draw player Y-sort line first (most important reference)
  const playerYSort = playerY + 48 + 2.0;
  const lineExtent = 300; // How far the line extends from entity center

  // Draw player's Y-sort line prominently
  ctx.strokeStyle = '#ffff00';
  ctx.lineWidth = 3;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(playerX - lineExtent, playerYSort);
  ctx.lineTo(playerX + lineExtent, playerYSort);
  ctx.stroke();

  // Draw label for player
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
  const playerLabel = `PLAYER Y-SORT: ${playerYSort.toFixed(1)}`;
  const playerLabelWidth = ctx.measureText(playerLabel).width;
  ctx.fillRect(playerX + lineExtent + 5, playerYSort - 14, playerLabelWidth + 8, 16);
  ctx.fillStyle = '#ffff00';
  ctx.fillText(playerLabel, playerX + lineExtent + 9, playerYSort - 1);

  // Draw Y-sort lines for nearby entities (within render distance of player)
  const maxDistanceFromPlayer = 400; // Only show lines for entities within this distance

  for (const item of ySortedEntities) {
    // Skip player (already drawn) and certain types that don't need lines
    if (item.type === 'player' || item.type === 'grass' || item.type === 'projectile' || item.type === 'dropped_item' || item.type === 'fog_overlay') {
      continue;
    }

    const entityX = getEntityX(item);
    const entityYSort = getYSortKeyForEntity(item, timestamp);

    // Skip if invalid Y
    if (isNaN(entityYSort) || entityYSort === 0) continue;

    // Skip if too far from player
    const dx = entityX - playerX;
    const dy = entityYSort - playerYSort;
    const distSq = dx * dx + dy * dy;
    if (distSq > maxDistanceFromPlayer * maxDistanceFromPlayer) continue;

    const entityWidth = getEntityWidth(item);
    const halfWidth = entityWidth / 2;
    const color = getYSortColor(item.type);

    // Draw the Y-sort line for this entity
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]); // Dashed line for entities
    ctx.beginPath();
    ctx.moveTo(entityX - halfWidth - 20, entityYSort);
    ctx.lineTo(entityX + halfWidth + 20, entityYSort);
    ctx.stroke();

    // Draw small vertical tick marks at entity edges
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(entityX - halfWidth, entityYSort - 5);
    ctx.lineTo(entityX - halfWidth, entityYSort + 5);
    ctx.moveTo(entityX + halfWidth, entityYSort - 5);
    ctx.lineTo(entityX + halfWidth, entityYSort + 5);
    ctx.stroke();

    // Draw small label
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    
    // Background for label
    const label = `${item.type.replace(/_/g, ' ')} Y:${entityYSort.toFixed(0)}`;
    const labelWidth = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(entityX - labelWidth / 2 - 2, entityYSort - 18, labelWidth + 4, 12);
    
    ctx.fillStyle = color;
    ctx.fillText(label, entityX, entityYSort - 7);
  }

  // Reset line dash
  ctx.setLineDash([]);

  // Draw legend in corner
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  
  // Legend background (positioned in screen space, not world space)
  // This will be drawn relative to the current transform, which is world space
  // We need to temporarily reset transform or position it properly
}
