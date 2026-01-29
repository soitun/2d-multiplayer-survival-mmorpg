/**
 * Decorative Bee Rendering Utilities
 * 
 * Client-side decorative bees that move around player-made beehives.
 * These are purely visual - no server-side NPCs, no damage, no sounds.
 * Only appear when a Queen Bee is present in the beehive.
 */

import { WoodenStorageBox, InventoryItem, ItemDefinition } from '../../generated';
import { BOX_TYPE_PLAYER_BEEHIVE } from './woodenStorageBoxRenderingUtils';

// Bee configuration
const NUM_DECORATIVE_BEES = 3; // Number of decorative bees per beehive
const BEE_ORBIT_RADIUS = 40.0; // How far bees orbit from hive center
const BEE_ORBIT_SPEED = 0.0008; // Radians per millisecond (controls orbit speed)
const BEE_BOB_AMPLITUDE = 3.0; // Vertical bobbing amplitude
const BEE_BOB_SPEED = 0.002; // Bobbing speed multiplier

// Bee visual properties
const BEE_SIZE = 6; // Size of bee dot
const BEE_BODY_COLOR = '#1A1A1A'; // Black body
const BEE_STRIPE_COLOR = '#FFD700'; // Gold/yellow stripe

/**
 * Check if a beehive has a Queen Bee in slot 0
 */
export function hasQueenBee(
    beehive: WoodenStorageBox,
    inventoryItems: Map<string, InventoryItem>,
    itemDefinitions: Map<string, ItemDefinition>
): boolean {
    // Check if slot 0 has an item
    const slot0InstanceId = beehive.slotInstanceId0;
    if (!slot0InstanceId) {
        return false;
    }
    
    // Convert bigint to string for map lookup
    const slot0Key = slot0InstanceId.toString();
    
    // Find the item - try both the exact key and iterate if needed
    let item = inventoryItems.get(slot0Key);
    
    // If not found, try iterating through all items (fallback for edge cases)
    if (!item && inventoryItems.size > 0) {
        for (const [key, invItem] of inventoryItems.entries()) {
            // Compare as strings to handle bigint comparison
            if (key === slot0Key || invItem.instanceId?.toString() === slot0Key) {
                item = invItem;
                break;
            }
        }
    }
    
    if (!item) {
        return false;
    }
    
    // Check if it's a Queen Bee
    const itemDefIdKey = item.itemDefId.toString();
    const itemDef = itemDefinitions.get(itemDefIdKey);
    
    // Fallback: iterate if not found
    if (!itemDef && itemDefinitions.size > 0) {
        for (const [key, def] of itemDefinitions.entries()) {
            if (key === itemDefIdKey || def.id?.toString() === itemDefIdKey) {
                return def.name === 'Queen Bee';
            }
        }
        return false;
    }
    
    if (!itemDef) {
        return false;
    }
    
    return itemDef.name === 'Queen Bee';
}

/**
 * Render decorative bees around a player-made beehive
 * Bees orbit around the hive in a decorative pattern
 */
export function renderDecorativeBees(
    ctx: CanvasRenderingContext2D,
    beehive: WoodenStorageBox,
    nowMs: number,
    inventoryItems: Map<string, InventoryItem>,
    itemDefinitions: Map<string, ItemDefinition>
): void {
    // Only render for player-made beehives
    if (beehive.boxType !== BOX_TYPE_PLAYER_BEEHIVE) {
        return;
    }
    
    // Only render if Queen Bee is present
    if (!hasQueenBee(beehive, inventoryItems, itemDefinitions)) {
        return;
    }
    
    // Don't render if destroyed
    if (beehive.isDestroyed) {
        return;
    }
    
    // Calculate visual center of beehive (accounting for Y offset)
    // Beehives are placed with BOX_COLLISION_Y_OFFSET (52px) added to posY
    // The visual center is at posY - BOX_COLLISION_Y_OFFSET
    // Since beehives are 256px tall, we want bees to orbit around the top portion
    const BOX_COLLISION_Y_OFFSET = 52.0;
    const PLAYER_BEEHIVE_HEIGHT = 256.0;
    const visualCenterY = beehive.posY - BOX_COLLISION_Y_OFFSET;
    // Bees should orbit around the top of the beehive (about 40px above visual center)
    const beeOrbitCenterY = visualCenterY - (PLAYER_BEEHIVE_HEIGHT / 2) + 40;
    const hiveX = beehive.posX;
    
    ctx.save();
    ctx.imageSmoothingEnabled = false; // Crisp pixel look for tiny bees
    
    // Render each decorative bee
    for (let i = 0; i < NUM_DECORATIVE_BEES; i++) {
        // Each bee has a different phase offset for variety
        const phaseOffset = (i / NUM_DECORATIVE_BEES) * Math.PI * 2;
        
        // Calculate orbit position (bees orbit around the hive)
        const orbitAngle = (nowMs * BEE_ORBIT_SPEED) + phaseOffset;
        const orbitX = Math.cos(orbitAngle) * BEE_ORBIT_RADIUS;
        const orbitY = Math.sin(orbitAngle) * BEE_ORBIT_RADIUS;
        
        // Add vertical bobbing (gentle up/down movement)
        const bobOffset = Math.sin(nowMs * BEE_BOB_SPEED + phaseOffset) * BEE_BOB_AMPLITUDE;
        
        // Final bee position (orbit around the top of the beehive)
        const beeX = hiveX + orbitX;
        const beeY = beeOrbitCenterY + orbitY + bobOffset;
        
        // Draw bee body (black dot)
        ctx.fillStyle = BEE_BODY_COLOR;
        ctx.beginPath();
        ctx.arc(beeX, beeY, BEE_SIZE / 2, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw yellow stripe through middle
        ctx.fillStyle = BEE_STRIPE_COLOR;
        ctx.fillRect(beeX - 2, beeY - 1, 4, 2);
    }
    
    ctx.restore();
}
