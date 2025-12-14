// AAA-Quality Client-side Collision Detection System
import { Player, Tree, Stone, RuneStone, Cairn, WoodenStorageBox, Shelter, RainCollector, WildAnimal, Barrel, Furnace, Barbecue, WallCell, FoundationCell, HomesteadHearth, BasaltColumn, Door, AlkStation } from '../generated';
import { gameConfig, FOUNDATION_TILE_SIZE, foundationCellToWorldCenter } from '../config/gameConfig';
import { COMPOUND_BUILDINGS, getBuildingWorldPosition } from '../config/compoundBuildings';

// Add at top after imports:
// Spatial filtering constants
const COLLISION_QUERY_EXPANSION = 100; // Extra padding around movement path for safety
const FOUNDATION_COLLISION_THICKNESS = 8; // Thickness for triangle hypotenuse collision

// Helper to check if shape intersects with query box
function shapeIntersectsBox(shape: CollisionShape, minX: number, minY: number, maxX: number, maxY: number): boolean {
  if (shape.radius) {
    // Circle check
    const centerX = shape.x;
    const centerY = shape.y;
    const closestX = Math.max(minX, Math.min(centerX, maxX));
    const closestY = Math.max(minY, Math.min(centerY, maxY));
    const dx = centerX - closestX;
    const dy = centerY - closestY;
    return (dx * dx + dy * dy) <= (shape.radius * shape.radius);
  } else if (shape.width && shape.height) {
    // AABB check
    const shapeMinX = shape.x - shape.width / 2;
    const shapeMinY = shape.y - shape.height / 2;
    const shapeMaxX = shape.x + shape.width / 2;
    const shapeMaxY = shape.y + shape.height / 2;
    return !(shapeMaxX < minX || shapeMinX > maxX || shapeMaxY < minY || shapeMinY > maxY);
  } else if (shape.lineStartX !== undefined && shape.lineStartY !== undefined && 
             shape.lineEndX !== undefined && shape.lineEndY !== undefined) {
    // Line segment check - check if line segment intersects with query box
    const lineStartX = shape.lineStartX;
    const lineStartY = shape.lineStartY;
    const lineEndX = shape.lineEndX;
    const lineEndY = shape.lineEndY;
    const lineThickness = shape.lineThickness || FOUNDATION_COLLISION_THICKNESS;
    
    // Expand query box by line thickness
    const expandedMinX = minX - lineThickness / 2;
    const expandedMinY = minY - lineThickness / 2;
    const expandedMaxX = maxX + lineThickness / 2;
    const expandedMaxY = maxY + lineThickness / 2;
    
    // Check if line segment intersects expanded box
    // Simple AABB check for line segment bounding box
    const lineMinX = Math.min(lineStartX, lineEndX);
    const lineMaxX = Math.max(lineStartX, lineEndX);
    const lineMinY = Math.min(lineStartY, lineEndY);
    const lineMaxY = Math.max(lineStartY, lineEndY);
    
    return !(lineMaxX < expandedMinX || lineMinX > expandedMaxX || 
             lineMaxY < expandedMinY || lineMinY > expandedMaxY);
  }
  return false;
}

// ===== COLLISION PERFORMANCE LOGGING (DISABLED) =====
// let lastCollisionLog = 0;
// const COLLISION_LOG_INTERVAL = 1000; // Log every 1 second
// const COLLISION_LAG_THRESHOLD = 30; // Log if collision check takes more than 30ms

// PERFORMANCE FIX: Disable collision logging to prevent frame drops
function logCollisionPerformance(
  processingTime: number,
  entityCount: number,
  playerPos: { x: number; y: number },
  collisionShapes: number,
  isEmergency: boolean
) {
  // Logging disabled for production performance
  // const now = Date.now();
  // const isLagSpike = processingTime > COLLISION_LAG_THRESHOLD;
  // const shouldLog = isLagSpike || (now - lastCollisionLog > COLLISION_LOG_INTERVAL);
  // ... logging code removed to prevent console overhead
}

// ===== CONFIGURATION CONSTANTS =====
const WORLD_WIDTH_PX = gameConfig.worldWidthPx;
const WORLD_HEIGHT_PX = gameConfig.worldHeightPx;
export const PLAYER_RADIUS = 32;

// ===== PERFORMANCE OPTIMIZATION CONSTANTS =====
const COLLISION_PERF = {
  // Aggressive distance-based culling (squared for performance)
  PLAYER_CULL_DISTANCE_SQ: 200 * 200,    // Only check players within 200px
  TREE_CULL_DISTANCE_SQ: 250 * 250,      // Only check trees within 250px
  STONE_CULL_DISTANCE_SQ: 150 * 150,     // Only check stones within 150px
  RUNE_STONE_CULL_DISTANCE_SQ: 300 * 300, // Only check rune stones within 300px (larger than trees due to bigger radius)
  CAIRN_CULL_DISTANCE_SQ: 200 * 200,     // Only check cairns within 200px
  ANIMAL_CULL_DISTANCE_SQ: 300 * 300,    // Only check animals within 300px
  STRUCTURE_CULL_DISTANCE_SQ: 200 * 200, // Only check structures within 200px
  
  // Entity limiting for performance
  MAX_PLAYERS_TO_CHECK: 20,
  MAX_TREES_TO_CHECK: 30,
  MAX_STONES_TO_CHECK: 20,
  MAX_CAIRNS_TO_CHECK: 15,        // Dedicated limit for cairns (fewer than stones due to larger collision radius)
  MAX_ANIMALS_TO_CHECK: 15,
  MAX_STRUCTURES_TO_CHECK: 25,
  
  // Emergency mode thresholds
  EMERGENCY_TOTAL_ENTITIES: 100,
  EMERGENCY_CULL_DISTANCE_SQ: 100 * 100,
  EMERGENCY_MAX_ENTITIES: 10,
};

// Performance monitoring (DISABLED for performance)
// let frameCounter = 0;
// let lastPerformanceLog = 0;

// Spatial partitioning cache
const spatialCache = new Map<string, {
  entities: any[];
  lastUpdate: number;
  centerX: number;
  centerY: number;
}>();

// PERFORMANCE OPTIMIZED: Reduce object creation and avoid array copying
function filterEntitiesByDistance<T extends { posX?: number; posY?: number; positionX?: number; positionY?: number }>(
  entities: Map<string, T>,
  playerX: number,
  playerY: number,
  maxDistanceSq: number,
  maxCount: number
): T[] {
  if (!entities || entities.size === 0) return [];
  
  const effectiveMaxDistance = maxDistanceSq;
  const effectiveMaxCount = maxCount;
  const result: T[] = [];
  let count = 0;
  
  // Single pass: filter by distance and limit count without creating intermediate objects
  for (const entity of entities.values()) {
    if (count >= effectiveMaxCount) break;
    
    const entityX = entity.posX ?? entity.positionX ?? 0;
    const entityY = entity.posY ?? entity.positionY ?? 0;
    const dx = entityX - playerX;
    const dy = entityY - playerY;
    const distanceSq = dx * dx + dy * dy;
    
    if (distanceSq <= effectiveMaxDistance) {
      result.push(entity);
      count++;
    }
  }
  
  return result;
}

// Optimized spatial partitioning for collision detection
// PERFORMANCE OPTIMIZED: Streamlined collision candidate generation
function getCollisionCandidates(
  entities: GameEntities,
  playerX: number,
  playerY: number,
  localPlayerId: string
): CollisionShape[] {
  // PERFORMANCE FIX: Remove frameCounter++ to avoid unnecessary operations
  // frameCounter++;
  
  // Emergency mode removed
  // Logging removed - was causing micro-stutters every 5 seconds
  
  const shapes: CollisionShape[] = [];
  
  // PERFORMANCE: Aggressively filter each entity type
  
  // Filter other players
  const nearbyPlayers = filterEntitiesByDistance(
    entities.players,
    playerX,
    playerY,
    COLLISION_PERF.PLAYER_CULL_DISTANCE_SQ,
    COLLISION_PERF.MAX_PLAYERS_TO_CHECK
  );
  
  for (const player of nearbyPlayers) {
    const playerId = player.identity.toHexString();
    // Skip: self, dead players, and OFFLINE players (offline players have no collision)
    if (playerId === localPlayerId || player.isDead || !player.isOnline) continue;
    
    shapes.push({
      id: playerId,
      type: `player-${playerId.substring(0, 8)}`,
      x: player.positionX,
      y: player.positionY,
      radius: COLLISION_RADII.PLAYER
    });
  }
  
  // Filter trees
  const nearbyTrees = filterEntitiesByDistance(
    entities.trees,
    playerX,
    playerY,
    COLLISION_PERF.TREE_CULL_DISTANCE_SQ,
    COLLISION_PERF.MAX_TREES_TO_CHECK
  );
  
  for (const tree of nearbyTrees) {
    if (tree.health <= 0) continue;
    
    shapes.push({
      id: tree.id.toString(),
      type: `tree-${tree.id.toString()}`,
      x: tree.posX + COLLISION_OFFSETS.TREE.x,
      y: tree.posY + COLLISION_OFFSETS.TREE.y,
      radius: COLLISION_RADII.TREE
    });
  }
  
  // Filter stones
  const nearbyStones = filterEntitiesByDistance(
    entities.stones,
    playerX,
    playerY,
    COLLISION_PERF.STONE_CULL_DISTANCE_SQ,
    COLLISION_PERF.MAX_STONES_TO_CHECK
  );
  
  for (const stone of nearbyStones) {
    if (stone.health <= 0) continue;
    
    shapes.push({
      id: stone.id.toString(),
      type: `stone-${stone.id.toString()}`,
      x: stone.posX + COLLISION_OFFSETS.STONE.x,
      y: stone.posY + COLLISION_OFFSETS.STONE.y,
      radius: COLLISION_RADII.STONE
    });
  }
  
  // Filter rune stones
  const nearbyRuneStones = filterEntitiesByDistance(
    entities.runeStones,
    playerX,
    playerY,
    COLLISION_PERF.RUNE_STONE_CULL_DISTANCE_SQ, // Use dedicated cull distance for larger rune stones
    COLLISION_PERF.MAX_STONES_TO_CHECK
  );
  
  for (const runeStone of nearbyRuneStones) {
    shapes.push({
      id: runeStone.id.toString(),
      type: `runeStone-${runeStone.id.toString()}`,
      x: runeStone.posX + COLLISION_OFFSETS.RUNE_STONE.x,
      y: runeStone.posY + COLLISION_OFFSETS.RUNE_STONE.y,
      radius: COLLISION_RADII.RUNE_STONE
    });
  }
  
  // Filter cairns
  const nearbyCairns = filterEntitiesByDistance(
    entities.cairns,
    playerX,
    playerY,
    COLLISION_PERF.CAIRN_CULL_DISTANCE_SQ,
    COLLISION_PERF.MAX_CAIRNS_TO_CHECK
  );
  
  for (const cairn of nearbyCairns) {
    shapes.push({
      id: cairn.id.toString(),
      type: `cairn-${cairn.id.toString()}`,
      x: cairn.posX + COLLISION_OFFSETS.CAIRN.x,
      y: cairn.posY + COLLISION_OFFSETS.CAIRN.y,
      radius: COLLISION_RADII.CAIRN
    });
  }
  
  // Filter wild animals
  const nearbyAnimals = filterEntitiesByDistance(
    entities.wildAnimals,
    playerX,
    playerY,
    COLLISION_PERF.ANIMAL_CULL_DISTANCE_SQ,
    COLLISION_PERF.MAX_ANIMALS_TO_CHECK
  );
  
  for (const animal of nearbyAnimals) {
    // Skip dead animals (health <= 0) - they should not have collision
    // The corpse entity will handle collision for dead animals instead
    if (animal.health <= 0) continue;
    
    // Skip flying birds (Tern and Crow) - they should be able to fly through trees and other entities
    const isBird = animal.species.tag === 'Tern' || animal.species.tag === 'Crow';
    if (isBird && animal.isFlying === true) {
      continue; // Flying birds have no collision - they can pass through everything
    }
    
    shapes.push({
      id: animal.id.toString(),
      type: `animal-${animal.id.toString()}`,
      x: animal.posX + COLLISION_OFFSETS.WILD_ANIMAL.x,
      y: animal.posY + COLLISION_OFFSETS.WILD_ANIMAL.y,
      radius: COLLISION_RADII.WILD_ANIMAL
    });
  }
  
  // Filter structures (boxes, barrels, etc.)
  // Skip backpacks (boxType === 4) - they should not have collision
  const BOX_TYPE_BACKPACK = 4;
  const nearbyBoxes = filterEntitiesByDistance(
    entities.boxes,
    playerX,
    playerY,
    COLLISION_PERF.STRUCTURE_CULL_DISTANCE_SQ,
    COLLISION_PERF.MAX_STRUCTURES_TO_CHECK
  );
  
  for (const box of nearbyBoxes) {
    // Skip backpacks - they don't have collision
    if (box.boxType === BOX_TYPE_BACKPACK) continue;
    
    shapes.push({
      id: box.id.toString(),
      type: `box-${box.id.toString()}`,
      x: box.posX + COLLISION_OFFSETS.STORAGE_BOX.x,
      y: box.posY + COLLISION_OFFSETS.STORAGE_BOX.y,
      radius: COLLISION_RADII.STORAGE_BOX
    });
  }
  
  const nearbyBarrels = filterEntitiesByDistance(
    entities.barrels,
    playerX,
    playerY,
    COLLISION_PERF.STRUCTURE_CULL_DISTANCE_SQ,
    COLLISION_PERF.MAX_STRUCTURES_TO_CHECK
  );
  
  for (const barrel of nearbyBarrels) {
    if (barrel.respawnAt) continue; // Skip destroyed barrels
    
    // Variant 4 (barrel5.png) is 2x larger, so scale collision accordingly
    const variantIndex = Number(barrel.variant ?? 0);
    const collisionYOffset = variantIndex === 4 ? COLLISION_OFFSETS.BARREL.y * 2 : COLLISION_OFFSETS.BARREL.y;
    const collisionRadius = variantIndex === 4 ? COLLISION_RADII.BARREL * 2 : COLLISION_RADII.BARREL;
    
    shapes.push({
      id: barrel.id.toString(),
      type: `barrel-${barrel.id.toString()}`,
      x: barrel.posX + COLLISION_OFFSETS.BARREL.x,
      y: barrel.posY + collisionYOffset,
      radius: collisionRadius
    });
  }
  
  // Filter furnaces
  const nearbyFurnaces = filterEntitiesByDistance(
    entities.furnaces,
    playerX,
    playerY,
    COLLISION_PERF.STRUCTURE_CULL_DISTANCE_SQ,
    COLLISION_PERF.MAX_STRUCTURES_TO_CHECK
  );
  
  for (const furnace of nearbyFurnaces) {
    if (furnace.isDestroyed) continue; // Skip destroyed furnaces
    
    shapes.push({
      id: furnace.id.toString(),
      type: `furnace-${furnace.id.toString()}`,
      x: furnace.posX + COLLISION_OFFSETS.FURNACE.x,
      y: furnace.posY + COLLISION_OFFSETS.FURNACE.y,
      radius: COLLISION_RADII.FURNACE
    });
  }

  // Filter barbecues
  if (entities.barbecues && entities.barbecues.size > 0) {
    const nearbyBarbecues = filterEntitiesByDistance(
      entities.barbecues,
      playerX,
      playerY,
      COLLISION_PERF.STRUCTURE_CULL_DISTANCE_SQ,
      COLLISION_PERF.MAX_STRUCTURES_TO_CHECK
    );
    
    for (const barbecue of nearbyBarbecues) {
      if (barbecue.isDestroyed) continue; // Skip destroyed barbecues
      
      shapes.push({
        id: barbecue.id.toString(),
        type: `barbecue-${barbecue.id.toString()}`,
        x: barbecue.posX + COLLISION_OFFSETS.BARBECUE.x,
        y: barbecue.posY + COLLISION_OFFSETS.BARBECUE.y,
        radius: COLLISION_RADII.BARBECUE
      });
    }
  }

  // Filter homestead hearths
  if (entities.homesteadHearths && entities.homesteadHearths.size > 0) {
    const nearbyHearths = filterEntitiesByDistance(
      entities.homesteadHearths,
      playerX,
      playerY,
      COLLISION_PERF.STRUCTURE_CULL_DISTANCE_SQ,
      COLLISION_PERF.MAX_STRUCTURES_TO_CHECK
    );
    
    for (const hearth of nearbyHearths) {
      if (hearth.isDestroyed) continue; // Skip destroyed hearths
      
      shapes.push({
        id: hearth.id.toString(),
        type: `hearth-${hearth.id.toString()}`,
        x: hearth.posX + COLLISION_OFFSETS.HOMESTEAD_HEARTH.x,
        y: hearth.posY + COLLISION_OFFSETS.HOMESTEAD_HEARTH.y,
        radius: COLLISION_RADII.HOMESTEAD_HEARTH
      });
    }
  }
  
  // Filter basalt columns (decorative obstacles in quarries)
  if (entities.basaltColumns && entities.basaltColumns.size > 0) {
    const nearbyBasaltColumns = filterEntitiesByDistance(
      entities.basaltColumns,
      playerX,
      playerY,
      COLLISION_PERF.STONE_CULL_DISTANCE_SQ, // Use same distance as stones
      COLLISION_PERF.MAX_STONES_TO_CHECK
    );
    
    for (const basaltColumn of nearbyBasaltColumns) {
      shapes.push({
        id: basaltColumn.id.toString(),
        type: `basalt_column-${basaltColumn.id.toString()}`,
        x: basaltColumn.posX + COLLISION_OFFSETS.BASALT_COLUMN.x,
        y: basaltColumn.posY + COLLISION_OFFSETS.BASALT_COLUMN.y,
        radius: COLLISION_RADII.BASALT_COLUMN
      });
    }
  }
  
  // Filter ALK delivery stations (large industrial structures)
  // Use AABB (rectangular) collision at the building base, same as compound buildings
  if (entities.alkStations && entities.alkStations.size > 0) {
    // ALK stations use worldPosX/worldPosY, filter manually
    const ALK_STATION_WIDTH = 480;  // Sprite width
    const ALK_STATION_HEIGHT = 480;  // Sprite height
    const ALK_STATION_Y_OFFSET = 0;  // Anchor point offset (worldPosY is the anchor)
    
    for (const station of entities.alkStations.values()) {
      if (!station.isActive) continue;
      
      const dx = station.worldPosX - playerX;
      const dy = station.worldPosY - playerY;
      const distSq = dx * dx + dy * dy;
      
      // Larger cull distance for large structure
      if (distSq > COLLISION_PERF.STRUCTURE_CULL_DISTANCE_SQ * 2) continue;
      
      // AABB collision at the building base (bottom 1/3 height, 1/2 width)
      // Central compound (stationId 0) uses half height from top, pushed up by its height
      // Similar to compound buildings
      const isCentralCompound = station.stationId === 0;
      const collisionWidth = ALK_STATION_WIDTH * 0.5;  // 50% of building width
      const collisionHeight = isCentralCompound 
        ? ALK_STATION_HEIGHT / 6  // Central compound: half height from top (bottom 1/6)
        : ALK_STATION_HEIGHT / 3; // Substations: bottom 1/3 of building height
      const collisionYOffset = isCentralCompound ? collisionHeight : 0; // Push central compound up by its height
      const spriteBottom = station.worldPosY + ALK_STATION_Y_OFFSET;  // Anchor point = sprite bottom
      const collisionCenterX = station.worldPosX;  // Centered horizontally
      const collisionCenterY = spriteBottom - collisionHeight / 2 - collisionYOffset;  // Center of collision box
      
      shapes.push({
        id: `alk_station-${station.stationId.toString()}`,
        type: `alk_station-${station.stationId.toString()}`,
        x: collisionCenterX,
        y: collisionCenterY,
        width: collisionWidth,
        height: collisionHeight
      });
    }
  }
  
  // Filter sea stacks
  const nearbySeaStacks = filterEntitiesByDistance(
    entities.seaStacks,
    playerX,
    playerY,
    COLLISION_PERF.STRUCTURE_CULL_DISTANCE_SQ,
    COLLISION_PERF.MAX_STRUCTURES_TO_CHECK
  );
  
  for (const seaStack of nearbySeaStacks) {
    // Use circular collision (like trees) for smooth sliding behavior
    // Scale the radius based on sea stack's scale property
    const seaStackScale = seaStack.scale || 1.0;
    const scaledRadius = COLLISION_RADII.SEA_STACK * seaStackScale;
    
    shapes.push({
      id: seaStack.id.toString(),
      type: `sea_stack-${seaStack.id.toString()}`,
      x: seaStack.posX + COLLISION_OFFSETS.SEA_STACK.x,
      y: seaStack.posY + COLLISION_OFFSETS.SEA_STACK.y,
      radius: scaledRadius // Circular collision for smooth sliding
    });
  }
  
  // COMPOUND BUILDINGS - collision at visual base (like trees/stones)
  // Use negative Y offset to position collision UP at the building's visual base
  for (const building of COMPOUND_BUILDINGS) {
    const worldPos = getBuildingWorldPosition(building);
    const buildingX = worldPos.x;
    const buildingY = worldPos.y;
    
    // Distance-based culling
    const dx = buildingX - playerX;
    const dy = buildingY - playerY;
    const distSq = dx * dx + dy * dy;
    if (distSq > COLLISION_PERF.STRUCTURE_CULL_DISTANCE_SQ * 4) continue;
    
    // Skip walls - they need AABB collision which we don't support yet
    if (building.id.startsWith('wall_')) continue;
    
    // Position collision at visual base of building
    const collisionOffsetY = 0; // Collision at anchor point (building base)
    
    // Special case for guardposts - they're thin poles, need tiny collision
    const isGuardpost = building.id.startsWith('guardpost');
    const collisionRadius = isGuardpost 
      ? 15  // Tiny radius for thin pole
      : Math.min(building.width * 0.2, 60); // Normal buildings
    
    shapes.push({
      id: `compound_building-${building.id}`,
      type: `compound_building-${building.id}`,
      x: buildingX,
      y: buildingY + collisionOffsetY,
      radius: collisionRadius
    });
  }
  
  // Filter shelters - use AABB collision (must match server-side collision bounds)
  // IMPORTANT: We cull based on the AABB CENTER, not the shelter base Y.
  // Using the base Y here would make collision only work when approaching
  // from below, since the interior AABB lives well above the base.
  if (entities.shelters && entities.shelters.size > 0) {
    let sheltersChecked = 0;
    for (const shelter of entities.shelters.values()) {
      if (shelter.isDestroyed) continue; // Skip destroyed shelters
      if (sheltersChecked >= COLLISION_PERF.MAX_STRUCTURES_TO_CHECK) break;

      // Skip collision for shelters owned by the local player (they can walk through their own shelters)
      if (localPlayerId && shelter.placedBy.toHexString() === localPlayerId) {
        continue;
      }

      // Calculate shelter AABB center (matches server-side logic exactly)
      const shelterAabbCenterX = shelter.posX;
      const shelterAabbCenterY = shelter.posY - SHELTER_DIMS.AABB_CENTER_Y_OFFSET_FROM_POS_Y;

      // Distance-based culling using the AABB center, not the base
      const dxShelter = shelterAabbCenterX - playerX;
      const dyShelter = shelterAabbCenterY - playerY;
      const distSqShelter = dxShelter * dxShelter + dyShelter * dyShelter;
      if (distSqShelter > COLLISION_PERF.STRUCTURE_CULL_DISTANCE_SQ) continue;

      sheltersChecked++;

      // Add AABB collision shape (center-based, matches server bounds exactly)
      shapes.push({
        id: shelter.id.toString(),
        type: `shelter-${shelter.id.toString()}`,
        x: shelterAabbCenterX,
        y: shelterAabbCenterY,
        width: SHELTER_DIMS.WIDTH,   // 300 (matches SHELTER_COLLISION_WIDTH)
        height: SHELTER_DIMS.HEIGHT  // 125 (matches SHELTER_COLLISION_HEIGHT)
      });
    }
  }
  
  // Filter wall cells - create thin collision edges along wall boundaries
  const FOUNDATION_TILE_SIZE = 96; // Foundation tile size in pixels (2x world tiles)
  const WALL_COLLISION_THICKNESS = 6; // Thin collision thickness (slightly thicker than visual 4px to prevent walking through)
  // For south walls, use asymmetric collision - only extend north into foundation, not south toward player
  const SOUTH_WALL_COLLISION_THICKNESS = 4; // Thinner collision for south walls
  const SOUTH_WALL_NORTH_EXTENT = 3.5; // How far north the collision extends (into foundation)
  const DIAGONAL_WALL_THICKNESS = 12; // Thickness for diagonal walls (matches visual rendering)
  
  if (entities.wallCells && entities.wallCells.size > 0) {
    // Check walls within reasonable distance
    for (const wall of entities.wallCells.values()) {
      if (wall.isDestroyed) continue; // Skip destroyed walls
      
      // Calculate foundation cell center position
      const tileCenterX = wall.cellX * FOUNDATION_TILE_SIZE + FOUNDATION_TILE_SIZE / 2;
      const tileCenterY = wall.cellY * FOUNDATION_TILE_SIZE + FOUNDATION_TILE_SIZE / 2;
      
      // Check distance to player
      const dx = tileCenterX - playerX;
      const dy = tileCenterY - playerY;
      const distanceSq = dx * dx + dy * dy;
      const maxDistanceSq = 150 * 150; // Check walls within 150px
      
      if (distanceSq > maxDistanceSq) continue;
      
      // Create thin AABB collision shape based on wall edge
      // Edge 0 = North (top), 1 = East (right), 2 = South (bottom), 3 = West (left)
      let wallX: number, wallY: number, wallWidth: number, wallHeight: number;
      
      switch (wall.edge) {
        case 0: // North (top edge) - horizontal line
          // CRITICAL FIX: Position collision box so expanded AABB ends exactly at top edge
          // INVERTED from south wall: Position BELOW top edge so collision extends INTO foundation (south)
          // Expanded AABB: minY = wallY - wallHeight/2 - PLAYER_RADIUS
          // We want: minY = topEdge, so: wallY = topEdge + PLAYER_RADIUS + wallHeight/2
          wallX = tileCenterX; // Center horizontally on foundation cell
          const topEdge = wall.cellY * FOUNDATION_TILE_SIZE;
          // Position collision box so expanded AABB ends at topEdge (same logic as south wall but inverted)
          // For south: wallY = bottomEdge - PLAYER_RADIUS - height/2 (center ABOVE bottom edge)
          // For north (inverted): wallY = topEdge + PLAYER_RADIUS + height/2 (center BELOW top edge)
          // But user said this had opposite effect, so try: wallY = topEdge - PLAYER_RADIUS - height/2 (center ABOVE top edge)
          wallY = topEdge - PLAYER_RADIUS - SOUTH_WALL_NORTH_EXTENT / 2;
          wallWidth = FOUNDATION_TILE_SIZE; // Full foundation cell width
          wallHeight = SOUTH_WALL_NORTH_EXTENT; // Only extends south, not north
          break;
        case 1: // East (right edge) - vertical line
          // CRITICAL: AABB collision uses x,y as CENTER, not top-left corner
          wallX = wall.cellX * FOUNDATION_TILE_SIZE + FOUNDATION_TILE_SIZE; // Right edge of foundation cell (center of collision box)
          wallY = tileCenterY; // Center vertically on foundation cell
          wallWidth = WALL_COLLISION_THICKNESS; // Thin thickness
          wallHeight = FOUNDATION_TILE_SIZE; // Full foundation cell height
          break;
        case 2: // South (bottom edge) - horizontal line
          // CRITICAL FIX: Position collision box so expanded AABB ends exactly at bottom edge
          // The AABB collision expands the box by playerRadius (32px), so we need to account for that
          // Expanded AABB: maxY = wallY + wallHeight/2 + PLAYER_RADIUS
          // We want: maxY = bottomEdge, so: wallY = bottomEdge - PLAYER_RADIUS - wallHeight/2
          wallX = tileCenterX; // Center horizontally on foundation cell
          const bottomEdge = wall.cellY * FOUNDATION_TILE_SIZE + FOUNDATION_TILE_SIZE;
          // Position so expanded AABB max Y equals bottomEdge (no extension south)
          wallY = bottomEdge - PLAYER_RADIUS - SOUTH_WALL_NORTH_EXTENT / 2;
          wallWidth = FOUNDATION_TILE_SIZE; // Full foundation cell width
          wallHeight = SOUTH_WALL_NORTH_EXTENT; // Only extends north, not south
          break;
        case 3: // West (left edge) - vertical line
          // CRITICAL: AABB collision uses x,y as CENTER, not top-left corner
          wallX = wall.cellX * FOUNDATION_TILE_SIZE; // Left edge of foundation cell (center of collision box)
          wallY = tileCenterY; // Center vertically on foundation cell
          wallWidth = WALL_COLLISION_THICKNESS; // Thin thickness
          wallHeight = FOUNDATION_TILE_SIZE; // Full foundation cell height
          break;
        case 4: // DiagNE_SW (diagonal from NE to SW) - only for triangle foundations
        case 5: // DiagNW_SE (diagonal from NW to SE) - only for triangle foundations
          // Only add collision for diagonal walls on triangle foundations
          const isTriangle = wall.foundationShape >= 2 && wall.foundationShape <= 5;
          if (!isTriangle) {
            continue; // Skip diagonal edges on non-triangle foundations
          }
          
          // Calculate diagonal line endpoints - MUST match renderWallTargetIndicator exactly
          // The coordinates depend on BOTH the foundation shape AND the edge
          let hypStartX: number, hypStartY: number, hypEndX: number, hypEndY: number;
          const foundationLeftX = wall.cellX * FOUNDATION_TILE_SIZE;
          const foundationRightX = foundationLeftX + FOUNDATION_TILE_SIZE;
          const foundationTopY = wall.cellY * FOUNDATION_TILE_SIZE;
          const foundationBottomY = foundationTopY + FOUNDATION_TILE_SIZE;
          
          // Match the exact coordinates from renderWallTargetIndicator based on foundation shape
          switch (wall.foundationShape) {
            case 2: // TriNW - DiagNW_SE (edge 5)
              if (wall.edge === 5) {
                hypStartX = foundationRightX; // screenX + screenSize
                hypStartY = foundationTopY;   // screenY
                hypEndX = foundationLeftX;     // screenX
                hypEndY = foundationBottomY;  // screenY + screenSize
              } else {
                continue; // Wrong edge for this shape
              }
              break;
            case 3: // TriNE - DiagNE_SW (edge 4)
              if (wall.edge === 4) {
                hypStartX = foundationLeftX;   // screenX
                hypStartY = foundationTopY;   // screenY
                hypEndX = foundationRightX;    // screenX + screenSize
                hypEndY = foundationBottomY;  // screenY + screenSize
              } else {
                continue; // Wrong edge for this shape
              }
              break;
            case 4: // TriSE - DiagNW_SE (edge 5)
              if (wall.edge === 5) {
                hypStartX = foundationLeftX;   // screenX
                hypStartY = foundationBottomY; // screenY + screenSize
                hypEndX = foundationRightX;     // screenX + screenSize
                hypEndY = foundationTopY;      // screenY
              } else {
                continue; // Wrong edge for this shape
              }
              break;
            case 5: // TriSW - DiagNE_SW (edge 4)
              if (wall.edge === 4) {
                hypStartX = foundationRightX;   // screenX + screenSize
                hypStartY = foundationBottomY; // screenY + screenSize
                hypEndX = foundationLeftX;      // screenX
                hypEndY = foundationTopY;      // screenY
              } else {
                continue; // Wrong edge for this shape
              }
              break;
            default:
              continue; // Not a triangle foundation
          }
          
          // Use many small overlapping AABB boxes along the diagonal
          // This is more reliable than line segment collision
          const diagonalLength = Math.sqrt((hypEndX - hypStartX) ** 2 + (hypEndY - hypStartY) ** 2);
          // Increase density for better coverage - one box every 3 pixels instead of 4
          const numBoxes = Math.max(25, Math.ceil(diagonalLength / 3)); // Denser coverage to prevent gaps
          const stepX = (hypEndX - hypStartX) / numBoxes;
          const stepY = (hypEndY - hypStartY) / numBoxes;
          
          // Calculate the diagonal angle and determine which direction is "inward" (toward foundation center)
          // The foundation center is at (foundationLeftX + FOUNDATION_TILE_SIZE/2, foundationTopY + FOUNDATION_TILE_SIZE/2)
          const foundationCenterX = foundationLeftX + FOUNDATION_TILE_SIZE / 2;
          const foundationCenterY = foundationTopY + FOUNDATION_TILE_SIZE / 2;
          
          // Find a point on the diagonal (midpoint)
          const diagonalMidX = (hypStartX + hypEndX) / 2;
          const diagonalMidY = (hypStartY + hypEndY) / 2;
          
          // Calculate perpendicular direction to diagonal
          const diagonalAngle = Math.atan2(hypEndY - hypStartY, hypEndX - hypStartX);
          const perpAngle1 = diagonalAngle + Math.PI / 2; // First perpendicular direction
          const perpAngle2 = diagonalAngle - Math.PI / 2; // Second perpendicular direction
          
          // Test which perpendicular direction points toward foundation center
          const testPoint1X = diagonalMidX + Math.cos(perpAngle1) * 10;
          const testPoint1Y = diagonalMidY + Math.sin(perpAngle1) * 10;
          const testPoint2X = diagonalMidX + Math.cos(perpAngle2) * 10;
          const testPoint2Y = diagonalMidY + Math.sin(perpAngle2) * 10;
          
          const dist1 = Math.sqrt((testPoint1X - foundationCenterX) ** 2 + (testPoint1Y - foundationCenterY) ** 2);
          const dist2 = Math.sqrt((testPoint2X - foundationCenterX) ** 2 + (testPoint2Y - foundationCenterY) ** 2);
          
          // Use the perpendicular direction that points toward foundation center (inward)
          const perpAngle = dist1 < dist2 ? perpAngle1 : perpAngle2;
          
          // Offset boxes inward (toward foundation center) to allow closer approach from outside
          // This moves collision boxes closer to the foundation, allowing players to get closer to the wall edge
          const inwardOffset = 12; // Offset 12px inward from the diagonal edge (toward foundation center)
          const offsetX = Math.cos(perpAngle) * inwardOffset;
          const offsetY = Math.sin(perpAngle) * inwardOffset;
          
          // Each box is axis-aligned but overlaps significantly to cover the diagonal
          // Reduced box width to allow closer approach - boxes are thinner along the diagonal
          const boxSize = 6; // Smaller box size for tighter collision
          const boxThickness = DIAGONAL_WALL_THICKNESS * 0.9; // Thinner to allow closer approach
          
          // Calculate spacing between box centers
          const boxSpacing = Math.sqrt(stepX * stepX + stepY * stepY);
          
          for (let i = 0; i < numBoxes; i++) {
            // Position boxes along diagonal, offset inward toward foundation center
            const boxCenterX = hypStartX + stepX * (i + 0.5) + offsetX;
            const boxCenterY = hypStartY + stepY * (i + 0.5) + offsetY;
            
            // Create boxes with enough overlap to prevent gaps
            // Width needs to be larger than spacing to ensure seamless coverage
            // Use 2.2x spacing to ensure good overlap even for steep diagonals
            const boxWidth = Math.max(boxSize * 1.8, boxSpacing * 2.2);
            
            shapes.push({
              id: `wall-${wall.id.toString()}-diag-${i}`,
              type: `wall-diagonal-${wall.id.toString()}`,
              x: boxCenterX,
              y: boxCenterY,
              width: boxWidth, // Ensure good overlap to prevent gaps
              height: boxThickness
            });
          }
          continue; // Skip the single AABB push below
        default:
          continue; // Skip invalid edges
      }
      
      shapes.push({
        id: `wall-${wall.id.toString()}`,
        type: `wall-${wall.id.toString()}`,
        x: wallX,
        y: wallY,
        width: wallWidth,
        height: wallHeight
      });
    }
  }
  
  // Filter doors - closed doors block movement (similar to walls)
  const DOOR_COLLISION_THICKNESS = 6; // Same as walls (matches server-side DOOR_COLLISION_THICKNESS)
  
  if (entities.doors && entities.doors.size > 0) {
    // Check doors within reasonable distance
    for (const door of entities.doors.values()) {
      // Skip destroyed or open doors - only closed doors have collision
      if (door.isDestroyed || door.isOpen) continue;
      
      // Calculate foundation cell bounds (doors use cell_x, cell_y like walls)
      const tileLeft = door.cellX * FOUNDATION_TILE_SIZE;
      const tileTop = door.cellY * FOUNDATION_TILE_SIZE;
      const tileRight = tileLeft + FOUNDATION_TILE_SIZE;
      const tileBottom = tileTop + FOUNDATION_TILE_SIZE;
      
      // Check distance to player (use tile center for distance check)
      const tileCenterX = tileLeft + FOUNDATION_TILE_SIZE / 2;
      const tileCenterY = tileTop + FOUNDATION_TILE_SIZE / 2;
      const dx = tileCenterX - playerX;
      const dy = tileCenterY - playerY;
      const distanceSq = dx * dx + dy * dy;
      const maxDistanceSq = 150 * 150; // Check doors within 150px
      
      if (distanceSq > maxDistanceSq) continue;
      
      // Create thin AABB collision shape based on door edge (matches server-side logic)
      // Edge 0 = North (top), Edge 2 = South (bottom)
      let doorMinX: number, doorMaxX: number, doorMinY: number, doorMaxY: number;
      
      switch (door.edge) {
        case 0: // North edge - match north wall collision offset for smooth walking
          // Use same logic as north walls: position collision box so expanded AABB ends at top edge
          // This matches the north wall collision positioning for smooth movement
          const topEdge = door.cellY * FOUNDATION_TILE_SIZE;
          const NORTH_DOOR_COLLISION_EXTENT = SOUTH_WALL_NORTH_EXTENT; // Same as north walls (3.5px)
          // Calculate bounds to match north wall: wallY = topEdge - PLAYER_RADIUS - EXTENT/2, height = EXTENT
          // So: minY = topEdge - PLAYER_RADIUS - EXTENT, maxY = topEdge - PLAYER_RADIUS
          doorMinX = tileLeft;
          doorMaxX = tileRight;
          doorMinY = topEdge - PLAYER_RADIUS - NORTH_DOOR_COLLISION_EXTENT;
          doorMaxY = topEdge - PLAYER_RADIUS;
          break;
        case 2: // South edge - positioned higher to prevent visual clipping through bottom half
          // Move collision up by 24px from bottom edge to match server-side
          const SOUTH_DOOR_COLLISION_OFFSET = 24;
          const collisionY = tileBottom - SOUTH_DOOR_COLLISION_OFFSET;
          doorMinX = tileLeft;
          doorMaxX = tileRight;
          doorMinY = collisionY - DOOR_COLLISION_THICKNESS / 2;
          doorMaxY = collisionY + DOOR_COLLISION_THICKNESS / 2;
          break;
        default:
          continue; // Skip invalid edges (doors only on North/South)
      }
      
      // Convert AABB bounds to center + width/height format for collision shape
      const doorX = (doorMinX + doorMaxX) / 2;
      const doorY = (doorMinY + doorMaxY) / 2;
      const doorWidth = doorMaxX - doorMinX;
      const doorHeight = doorMaxY - doorMinY;
      
      shapes.push({
        id: `door-${door.id.toString()}`,
        type: `door-${door.id.toString()}`,
        x: doorX,
        y: doorY,
        width: doorWidth,
        height: doorHeight
      });
    }
  }
  
  // Foundations do NOT have collision - players can walk through them freely
  // Only walls (placed on foundation edges) have collision
  
  return shapes;
}

// Unified collision radii for consistency - match visual sprite sizes
// Exported for debug rendering
export const COLLISION_RADII = {
  TREE: 38,
  STONE: 28,       // Smaller radius for flattened stones
  RUNE_STONE: 80,  // Doubled from 40 to match doubled visual size (matches server-side RUNE_STONE_RADIUS)
  CAIRN: 64,       // Cairn collision radius (matches visual size ~256px / 4)
  STORAGE_BOX: 25, // Much tighter radius for boxes
  RAIN_COLLECTOR: 30, // Increased to match server-side for easier targeting
  FURNACE: 20, // Adjusted radius for easier bottom approach while keeping top collision
  BARBECUE: 20, // Same as furnace (similar size appliance)
  PLAYER: PLAYER_RADIUS,
  WILD_ANIMAL: 40, // Add wild animal collision radius
  BARREL: 25, // Smaller barrel collision radius for better accuracy
  SEA_STACK: 60, // Base radius for sea stacks - reduced significantly for smoother collision like trees
  HOMESTEAD_HEARTH: 55, // Homestead hearth collision radius (matches server-side HEARTH_COLLISION_RADIUS)
  BASALT_COLUMN: 35, // Basalt column collision radius
  ALK_STATION: 120, // ALK delivery station collision radius (reduced for easier navigation and Y-sorting)
} as const;

// Collision offsets for sprite positioning - align with visual sprite base
// Exported for debug rendering
export const COLLISION_OFFSETS = {
  TREE: { x: 0, y: -68 },      // Adjusted to keep top boundary similar while squishing from bottom
  STONE: { x: 0, y: -72 },     // Small circle positioned at visual stone base
  RUNE_STONE: { x: 0, y: -100 }, // Doubled from -50 to match doubled visual size (matches server-side RUNE_STONE_COLLISION_Y_OFFSET)
  CAIRN: { x: 0, y: -64 },     // Cairn collision pushed UP to match visual base (where stones meet ground)
  STORAGE_BOX: { x: 0, y: -70 }, // Small circle positioned at visual box base
  RAIN_COLLECTOR: { x: 0, y: 0 }, // Pushed down to align with visual base
  FURNACE: { x: 0, y: -50 }, // Adjusted center to extend collision below while keeping top boundary
  BARBECUE: { x: 0, y: 0 }, // Collision at posY (matches server-side BARBECUE_COLLISION_Y_OFFSET: 0.0)
  SHELTER: { x: 0, y: -200 },  // Shelter offset unchanged
  WILD_ANIMAL: { x: 0, y: 0 }, // No offset needed for animals
  BARREL: { x: 0, y: -48 }, // Barrel collision at visual center (matches server)
  ALK_STATION: { x: 0, y: -170 }, // ALK station collision offset - moved UP to center on building (allows walking behind for Y-sorting)
  SEA_STACK: { x: 0, y: -120 }, // Offset up to position collision higher on the structure
  HOMESTEAD_HEARTH: { x: 0, y: -72.5 }, // Homestead hearth collision offset (matches server-side HEARTH_COLLISION_Y_OFFSET)
  BASALT_COLUMN: { x: 0, y: -40 }, // Basalt column collision offset
} as const;

// Shelter AABB dimensions (must match server-side constants in shelter.rs)
// These are tuned to match the interior collision rectangle (black debug box)
// drawn in `shelterRenderingUtils.ts`, so what you see is exactly what you
// collide with as a non-owner.
// Exported for debug rendering
export const SHELTER_DIMS = {
  WIDTH: 300,          // SHELTER_COLLISION_WIDTH
  HEIGHT: 125,         // SHELTER_COLLISION_HEIGHT
  HALF_WIDTH: 150,     // SHELTER_AABB_HALF_WIDTH
  HALF_HEIGHT: 62.5,   // SHELTER_AABB_HALF_HEIGHT
  AABB_CENTER_Y_OFFSET_FROM_POS_Y: 200, // SHELTER_AABB_CENTER_Y_OFFSET_FROM_POS_Y
} as const;

// Performance optimization - debug disabled for production performance
// const DEBUG_ENABLED = false;

// ===== INTERFACES =====
export interface CollisionResult {
  x: number;
  y: number;
  collided: boolean;
  collidedWith: string[];
}

export interface GameEntities {
  trees: Map<string, Tree>;
  stones: Map<string, Stone>;
  runeStones: Map<string, RuneStone>; // Add rune stones for collision
  cairns: Map<string, Cairn>; // Add cairns for collision
  boxes: Map<string, WoodenStorageBox>;
  rainCollectors: Map<string, RainCollector>;
  furnaces: Map<string, Furnace>;
  barbecues: Map<string, Barbecue>;
  shelters: Map<string, Shelter>;
  players: Map<string, Player>;
  wildAnimals: Map<string, WildAnimal>; // Add wild animals
  barrels: Map<string, Barrel>; // Add barrels
  seaStacks: Map<string, any>; // Sea stacks from SpacetimeDB
  wallCells: Map<string, WallCell>; // Add wall cells for collision
  foundationCells: Map<string, FoundationCell>; // Add foundation cells for collision
  homesteadHearths: Map<string, HomesteadHearth>; // Add homestead hearths for collision
  basaltColumns: Map<string, BasaltColumn>; // Add basalt columns for collision
  doors: Map<string, Door>; // Add doors for collision
  alkStations?: Map<string, AlkStation>; // Add ALK delivery stations for collision
}

// Exported for debug rendering
export interface CollisionShape {
  id: string;
  type: string;
  x: number;
  y: number;
  radius?: number; // For circular collision
  width?: number;  // For AABB collision
  height?: number; // For AABB collision
  lineStartX?: number; // For line segment collision (triangle hypotenuse)
  lineStartY?: number;
  lineEndX?: number;
  lineEndY?: number;
  lineThickness?: number; // Thickness of line segment collision
}

interface CollisionHit {
  shape: CollisionShape;
  normal: { x: number; y: number };
  penetration: number;
  distance: number;
}

// ===== MAIN COLLISION FUNCTION =====
export function resolveClientCollision(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  localPlayerId: string,
  entities: GameEntities
): CollisionResult {
  // Step 1: Clamp to world bounds
  const clampedTo = clampToWorldBounds(toX, toY);
  
  // Step 2: Check if we actually moved
  const movement = {
    x: clampedTo.x - fromX,
    y: clampedTo.y - fromY
  };
  const moveDistance = Math.sqrt(movement.x * movement.x + movement.y * movement.y);
  
  if (moveDistance < 0.01) {
    return { x: clampedTo.x, y: clampedTo.y, collided: false, collidedWith: [] };
  }

  // Step 3: Build collision shapes from entities - PERFORMANCE OPTIMIZED
  const collisionShapes = getCollisionCandidates(entities, fromX, fromY, localPlayerId);
  
  // PERFORMANCE FIX: Remove expensive performance.now() calls every frame
  // const collisionStartTime = performance.now();
  // const collisionEndTime = performance.now();
  // const collisionTime = collisionEndTime - collisionStartTime;
  // logCollisionPerformance(...) - logging removed
  
  // Create query box around movement path
  const queryMinX = Math.min(fromX, toX) - COLLISION_QUERY_EXPANSION - PLAYER_RADIUS;
  const queryMinY = Math.min(fromY, toY) - COLLISION_QUERY_EXPANSION - PLAYER_RADIUS;
  const queryMaxX = Math.max(fromX, toX) + COLLISION_QUERY_EXPANSION + PLAYER_RADIUS;
  const queryMaxY = Math.max(fromY, toY) + COLLISION_QUERY_EXPANSION + PLAYER_RADIUS;

  // Filter shapes to only those intersecting the query box
  const nearbyShapes = collisionShapes.filter(shape =>
    shapeIntersectsBox(shape, queryMinX, queryMinY, queryMaxX, queryMaxY)
  );

  // PERFORMANCE FIX: Remove console logging that causes frame drops
  // const totalEntities = entities.trees.size + entities.stones.size + entities.boxes.size + entities.players.size + entities.wildAnimals.size + entities.barrels.size;
  // Logging removed - was causing performance issues in dense forests

  // Step 4: Perform swept collision detection
  const result = performSweptCollision(
    { x: fromX, y: fromY },
    clampedTo,
    PLAYER_RADIUS,
    nearbyShapes // Changed from collisionShapes
  );
  
  // Step 5: Final world bounds check
  const finalPos = clampToWorldBounds(result.x, result.y);
  
  return {
    x: finalPos.x,
    y: finalPos.y,
    collided: result.collided,
    collidedWith: result.collidedWith
  };
}

// ===== COLLISION DETECTION CORE =====
function performSweptCollision(
  from: { x: number; y: number },
  to: { x: number; y: number },
  playerRadius: number,
  shapes: CollisionShape[]
): CollisionResult {
  const movement = { x: to.x - from.x, y: to.y - from.y };
  const moveLength = Math.sqrt(movement.x * movement.x + movement.y * movement.y);
  
  if (moveLength < 0.01) {
    return { x: to.x, y: to.y, collided: false, collidedWith: [] };
  }
  
  const moveDir = { x: movement.x / moveLength, y: movement.y / moveLength };
  
  // Find all potential collisions along the movement path
  const hits: CollisionHit[] = [];
  
  for (const shape of shapes) {
    const hit = checkCollisionWithShape(from, to, playerRadius, shape);
    if (hit) {
      hits.push(hit);
    }
  }
  
  if (hits.length === 0) {
    return { x: to.x, y: to.y, collided: false, collidedWith: [] };
  }
  
  // Sort hits by distance (closest first)
  hits.sort((a, b) => a.distance - b.distance);
  
  // Handle the closest collision with sliding
  const primaryHit = hits[0];
  const slideResult = calculateSlideResponse(from, to, moveDir, primaryHit);
  
  // PERFORMANCE FIX: Debug logging removed to prevent console overhead during collisions
  // if (DEBUG_ENABLED) {
  //   console.log(`Collision with ${primaryHit.shape.type}, sliding to (${slideResult.x.toFixed(1)}, ${slideResult.y.toFixed(1)})`);
  // }
  
  // Performance optimized - logging removed
  
  return {
    x: slideResult.x,
    y: slideResult.y,
    collided: true,
    collidedWith: hits.map(h => h.shape.type)
  };
}

function checkCollisionWithShape(
  from: { x: number; y: number },
  to: { x: number; y: number },
  playerRadius: number,
  shape: CollisionShape
): CollisionHit | null {
  if (shape.radius !== undefined) {
    // Circle vs Circle collision
    return checkCircleCollision(from, to, playerRadius, shape);
  } else if (shape.width !== undefined && shape.height !== undefined) {
    // Circle vs AABB collision
    return checkAABBCollision(from, to, playerRadius, shape);
  } else if (shape.lineStartX !== undefined && shape.lineStartY !== undefined && 
             shape.lineEndX !== undefined && shape.lineEndY !== undefined) {
    // Circle vs Line Segment collision (for triangle hypotenuse)
    return checkLineSegmentCollision(from, to, playerRadius, shape);
  }
  return null;
}

function checkCircleCollision(
  from: { x: number; y: number },
  to: { x: number; y: number },
  playerRadius: number,
  shape: CollisionShape
): CollisionHit | null {
  const totalRadius = playerRadius + shape.radius!;
  const shapePos = { x: shape.x, y: shape.y };
  
  // Check if we're moving towards the circle
  const toShape = { x: shapePos.x - to.x, y: shapePos.y - to.y };
  const distToShape = Math.sqrt(toShape.x * toShape.x + toShape.y * toShape.y);
  
  if (distToShape >= totalRadius) {
    return null; // No collision
  }
  
  // Calculate collision normal and penetration
  const normal = distToShape > 0.001 
    ? { x: toShape.x / distToShape, y: toShape.y / distToShape }
    : { x: 1, y: 0 }; // Fallback normal
    
  const penetration = totalRadius - distToShape;
  
  return {
    shape,
    normal,
    penetration,
    distance: distToShape
  };
}

function checkAABBCollision(
  from: { x: number; y: number },
  to: { x: number; y: number },
  playerRadius: number,
  shape: CollisionShape
): CollisionHit | null {
  const halfWidth = shape.width! / 2;
  const halfHeight = shape.height! / 2;
  
  const aabbMin = { x: shape.x - halfWidth, y: shape.y - halfHeight };
  const aabbMax = { x: shape.x + halfWidth, y: shape.y + halfHeight };
  
  // Expand AABB by player radius
  const expandedMin = { x: aabbMin.x - playerRadius, y: aabbMin.y - playerRadius };
  const expandedMax = { x: aabbMax.x + playerRadius, y: aabbMax.y + playerRadius };
  
  // Check if player center is inside expanded AABB
  if (to.x < expandedMin.x || to.x > expandedMax.x || 
      to.y < expandedMin.y || to.y > expandedMax.y) {
    return null; // No collision
  }
  
  // Find closest point on original AABB to player center
  const closestX = Math.max(aabbMin.x, Math.min(to.x, aabbMax.x));
  const closestY = Math.max(aabbMin.y, Math.min(to.y, aabbMax.y));
  
  const dx = to.x - closestX;
  const dy = to.y - closestY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  
  if (distance >= playerRadius) {
    return null; // No collision
  }
  
  // Calculate normal and penetration
  let normal: { x: number; y: number };
  let penetration: number;
  
  if (distance < 0.001) {
    // Player center is inside AABB - push to nearest edge
    const distToLeft = to.x - aabbMin.x;
    const distToRight = aabbMax.x - to.x;
    const distToTop = to.y - aabbMin.y;
    const distToBottom = aabbMax.y - to.y;
    
    const minDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);
    
    if (minDist === distToLeft) {
      normal = { x: -1, y: 0 };
      penetration = distToLeft + playerRadius;
    } else if (minDist === distToRight) {
      normal = { x: 1, y: 0 };
      penetration = distToRight + playerRadius;
    } else if (minDist === distToTop) {
      normal = { x: 0, y: -1 };
      penetration = distToTop + playerRadius;
    } else {
      normal = { x: 0, y: 1 };
      penetration = distToBottom + playerRadius;
    }
  } else {
    // Normal collision - push away from closest point
    normal = { x: dx / distance, y: dy / distance };
    penetration = playerRadius - distance;
  }
  
  return {
    shape,
    normal,
    penetration,
    distance
  };
}

function checkLineSegmentCollision(
  from: { x: number; y: number },
  to: { x: number; y: number },
  playerRadius: number,
  shape: CollisionShape
): CollisionHit | null {
  const lineStart = { x: shape.lineStartX!, y: shape.lineStartY! };
  const lineEnd = { x: shape.lineEndX!, y: shape.lineEndY! };
  const lineThickness = shape.lineThickness || FOUNDATION_COLLISION_THICKNESS;
  
  // Find closest point on line segment to player's destination
  const lineVec = { x: lineEnd.x - lineStart.x, y: lineEnd.y - lineStart.y };
  const lineLengthSq = lineVec.x * lineVec.x + lineVec.y * lineVec.y;
  
  if (lineLengthSq < 0.001) {
    // Degenerate line segment (start == end)
    return null;
  }
  
  // Project player position onto line segment
  const toLineStart = { x: to.x - lineStart.x, y: to.y - lineStart.y };
  const t = Math.max(0, Math.min(1, (toLineStart.x * lineVec.x + toLineStart.y * lineVec.y) / lineLengthSq));
  
  const closestPoint = {
    x: lineStart.x + t * lineVec.x,
    y: lineStart.y + t * lineVec.y
  };
  
  // Calculate distance from player to closest point on line
  const dx = to.x - closestPoint.x;
  const dy = to.y - closestPoint.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  
  // Check if player circle intersects the thick line segment
  // The line extends lineThickness/2 on each side, player has radius playerRadius
  // Collision occurs when distance < playerRadius + lineThickness/2
  const totalThickness = playerRadius + (lineThickness / 2);
  
  if (distance >= totalThickness) {
    // Also check if movement path crosses the line (swept collision)
    const movementVec = { x: to.x - from.x, y: to.y - from.y };
    const moveLen = Math.sqrt(movementVec.x * movementVec.x + movementVec.y * movementVec.y);
    
    if (moveLen > 0.001) {
      // Check swept circle collision - find closest point on movement path to line
      const fromToLineStart = { x: from.x - lineStart.x, y: from.y - lineStart.y };
      const tFrom = Math.max(0, Math.min(1, (fromToLineStart.x * lineVec.x + fromToLineStart.y * lineVec.y) / lineLengthSq));
      const closestFrom = {
        x: lineStart.x + tFrom * lineVec.x,
        y: lineStart.y + tFrom * lineVec.y
      };
      const distFrom = Math.sqrt((from.x - closestFrom.x) ** 2 + (from.y - closestFrom.y) ** 2);
      
      // If either endpoint is close enough, or path crosses line
      if (distFrom < totalThickness) {
        // from position collides
      } else {
        return null; // No collision
      }
    } else {
      return null; // No movement, no collision
    }
  }
  
  // Calculate normal (perpendicular to line segment, pointing away from player)
  // Use a more stable normal calculation to reduce jitter
  let lineNormal = { x: -lineVec.y, y: lineVec.x }; // Perpendicular to line
  const normalLength = Math.sqrt(lineNormal.x * lineNormal.x + lineNormal.y * lineNormal.y);
  if (normalLength > 0.001) {
    lineNormal.x /= normalLength;
    lineNormal.y /= normalLength;
  } else {
    lineNormal = { x: 1, y: 0 }; // Fallback
  }
  
  // Ensure normal points away from player - use movement direction for stability
  // This prevents normal flipping when player is exactly on the line
  const movementVec = { x: to.x - from.x, y: to.y - from.y };
  const movementDot = lineNormal.x * movementVec.x + lineNormal.y * movementVec.y;
  
  // If player is moving, use movement direction to determine normal (more stable)
  // Otherwise, use position relative to line
  if (Math.abs(movementVec.x) > 0.01 || Math.abs(movementVec.y) > 0.01) {
    // Use movement direction to determine normal - prevents jitter
    if (movementDot < 0) {
      lineNormal.x = -lineNormal.x;
      lineNormal.y = -lineNormal.y;
    }
  } else {
    // Player not moving much - use position relative to line
    const toClosest = { x: closestPoint.x - to.x, y: closestPoint.y - to.y };
    const dot = lineNormal.x * toClosest.x + lineNormal.y * toClosest.y;
    if (dot < 0) {
      lineNormal.x = -lineNormal.x;
      lineNormal.y = -lineNormal.y;
    }
  }
  
  const penetration = totalThickness - distance;
  
  return {
    shape,
    normal: lineNormal,
    penetration,
    distance
  };
}

function calculateSlideResponse(
    from: { x: number; y: number },
    to: { x: number; y: number },
    moveDir: { x: number; y: number },
    hit: CollisionHit
  ): { x: number; y: number } {
    // Adaptive separation based on object size - smaller separation for large objects to prevent bouncing
    const objectRadius = hit.shape.radius || 0;
    // For large objects (like sea stacks), use smaller separation to prevent aggressive bouncing
    // For normal objects (trees, etc.), use standard separation
    const MIN_SEPARATION = objectRadius > 50 
      ? 2.0  // Smaller separation for large objects (sea stacks) - prevents bouncing
      : 8.0; // Standard separation for normal objects (trees, stones, etc.)
    
    // Always apply penetration correction for proper separation
    let correctedTo = { x: to.x, y: to.y };
    if (hit.penetration > 0.1) { // Much lower threshold (was 3.0)
      // Push player out by full penetration PLUS minimum separation
      const totalSeparation = hit.penetration + MIN_SEPARATION;
      correctedTo = {
        x: to.x + hit.normal.x * totalSeparation,
        y: to.y + hit.normal.y * totalSeparation,
      };
    }
  
    // Allowed movement vector
    const allowedMoveVec = {
      x: correctedTo.x - from.x,
      y: correctedTo.y - from.y
    };
  
    // Project onto normal
    const dotProduct = allowedMoveVec.x * hit.normal.x + allowedMoveVec.y * hit.normal.y;
  
    // Slide vector - only remove the component moving INTO the object
    let slideVec = {
      x: allowedMoveVec.x - (dotProduct > 0 ? 0 : dotProduct * hit.normal.x),
      y: allowedMoveVec.y - (dotProduct > 0 ? 0 : dotProduct * hit.normal.y)
    };
  
    // If slide vector is very small (stuck), use a larger nudge along the tangent
    const slideLen = Math.sqrt(slideVec.x * slideVec.x + slideVec.y * slideVec.y);
    if (slideLen < 0.1) {
      // Tangent to the normal (perpendicular direction)
      const tangent = { x: -hit.normal.y, y: hit.normal.x };
      const nudgeDistance = MIN_SEPARATION; // Much larger nudge (was 1.5px)
      slideVec.x += tangent.x * nudgeDistance;
      slideVec.y += tangent.y * nudgeDistance;
    }
  
    // Final position with guaranteed separation
    const finalX = from.x + slideVec.x;
    const finalY = from.y + slideVec.y;
    
    // 🛡️ SAFETY CHECK: Ensure we're actually separated from the object
    const finalDx = finalX - (hit.shape.x || 0);
    const finalDy = finalY - (hit.shape.y || 0);
    const finalDistance = Math.sqrt(finalDx * finalDx + finalDy * finalDy);
    const requiredDistance = PLAYER_RADIUS + (hit.shape.radius || 0) + MIN_SEPARATION;
    
    if (finalDistance < requiredDistance && hit.shape.radius) {
      // Force minimum separation
      const separationDirection = finalDistance > 0.001 
        ? { x: finalDx / finalDistance, y: finalDy / finalDistance }
        : { x: 1, y: 0 }; // Default direction if positions are identical
        
      return {
        x: hit.shape.x + separationDirection.x * requiredDistance,
        y: hit.shape.y + separationDirection.y * requiredDistance
      };
    }
    
    return { x: finalX, y: finalY };
  }

// ===== ENTITY PROCESSING =====
// PERFORMANCE: buildCollisionShapes has been replaced with getCollisionCandidates (see above)
// The new system provides:
// - Aggressive distance-based culling
// - Entity count limiting
// - Emergency mode for high-density areas
// - Spatial partitioning for better performance

// Legacy function kept for reference (replaced by getCollisionCandidates)
function buildCollisionShapes_DEPRECATED(entities: GameEntities, localPlayerId: string, playerX?: number, playerY?: number): CollisionShape[] {
  // This function has been replaced by getCollisionCandidates for better performance
  console.warn('buildCollisionShapes_DEPRECATED called - use getCollisionCandidates instead');
  return getCollisionCandidates(entities, playerX || 0, playerY || 0, localPlayerId);
}

// ===== UTILITY FUNCTIONS =====
function clampToWorldBounds(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.max(PLAYER_RADIUS, Math.min(WORLD_WIDTH_PX - PLAYER_RADIUS, x)),
    y: Math.max(PLAYER_RADIUS, Math.min(WORLD_HEIGHT_PX - PLAYER_RADIUS, y))
  };
}

// ===== DEBUG RENDERING EXPORTS =====
// Export collision shapes for debug visualization
// This function returns all collision shapes near a player for rendering
export function getCollisionShapesForDebug(
  entities: GameEntities,
  playerX: number,
  playerY: number,
  localPlayerId: string
): CollisionShape[] {
  return getCollisionCandidates(entities, playerX, playerY, localPlayerId);
} 