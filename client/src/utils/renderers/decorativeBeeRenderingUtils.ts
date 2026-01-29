/**
 * Decorative Bee Rendering Utilities
 * 
 * Client-side decorative bees that move around player-made beehives.
 * These are purely visual - no server-side NPCs, no damage, no sounds.
 * Only appear when a Queen Bee is present in the beehive.
 */

import { WoodenStorageBox, InventoryItem, ItemDefinition } from '../../generated';

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
    
    // Find the item
    const item = inventoryItems.get(slot0InstanceId.toString());
    if (!item) {
        return false;
    }
    
    // Check if it's a Queen Bee
    const itemDef = itemDefinitions.get(item.itemDefId.toString());
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
    if (beehive.boxType !== 12) { // BOX_TYPE_PLAYER_BEEHIVE = 12
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
    
    const hiveX = beehive.posX;
    const hiveY = beehive.posY;
    
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
        
        // Final bee position
        const beeX = hiveX + orbitX;
        const beeY = hiveY + orbitY + bobOffset;
        
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
