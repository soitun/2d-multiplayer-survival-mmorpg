import {
    HarvestableResource as SpacetimeDBHarvestableResource,
    Campfire as SpacetimeDBCampfire,
    DroppedItem as SpacetimeDBDroppedItem,
    WoodenStorageBox as SpacetimeDBWoodenStorageBox,
    ItemDefinition as SpacetimeDBItemDefinition,
    PlayerCorpse as SpacetimeDBPlayerCorpse,
    Stash as SpacetimeDBStash,
    SleepingBag as SpacetimeDBSleepingBag,
    Player as SpacetimeDBPlayer,
    RainCollector as SpacetimeDBRainCollector,
    HomesteadHearth as SpacetimeDBHomesteadHearth, // ADDED: Homestead Hearth
    BrothPot as SpacetimeDBBrothPot, // ADDED: BrothPot
    Door as SpacetimeDBDoor, // ADDED: Door
    AlkStation as SpacetimeDBAlkStation // ADDED: ALK Station
} from '../../generated';

// Import visual heights from useInteractionFinder.ts
// Define visual heights locally for label positioning
// Using unified approach - individual resource heights no longer needed

import { CAMPFIRE_HEIGHT, CAMPFIRE_RENDER_Y_OFFSET } from './campfireRenderingUtils';
import { FURNACE_HEIGHT, FURNACE_RENDER_Y_OFFSET } from './furnaceRenderingUtils'; // ADDED: Furnace constants
import { BOX_HEIGHT } from './woodenStorageBoxRenderingUtils';
import { DOOR_RENDER_Y_OFFSET } from './doorRenderingUtils'; // ADDED: Door render offset
import { ALK_STATION_HEIGHT, ALK_STATION_Y_OFFSET } from './alkStationRenderingUtils'; // ADDED: ALK Station constants

// Define Sleeping Bag dimensions locally for label positioning
const SLEEPING_BAG_HEIGHT = 64;

// Define Rain Collector dimensions locally for label positioning
const RAIN_COLLECTOR_HEIGHT = 128; // Doubled from 64

// Define the single target type for labels
interface InteractableTarget {
    type: 'harvestable_resource' | 'campfire' | 'furnace' | 'fumarole' | 'lantern' | 'dropped_item' | 'box' | 'corpse' | 'stash' | 'sleeping_bag' | 'knocked_out_player' | 'water' | 'rain_collector' | 'homestead_hearth' | 'broth_pot' | 'door' | 'alk_station';
    id: bigint | number | string;
    position: { x: number; y: number };
    distance: number;
    isEmpty?: boolean;
    data?: {
        campfireId?: number;
        brothPotId?: number;
        isBrothPotEmpty?: boolean;
        [key: string]: any;
    };
}

interface RenderLabelsParams {
    ctx: CanvasRenderingContext2D;
    harvestableResources: Map<string, any>; // Unified harvestable resources
    campfires: Map<string, SpacetimeDBCampfire>;
    furnaces: Map<string, any>; // ADDED: furnaces parameter
    fumaroles: Map<string, any>; // ADDED: fumaroles parameter
    lanterns: Map<string, any>; // Add lanterns parameter
    droppedItems: Map<string, SpacetimeDBDroppedItem>;
    woodenStorageBoxes: Map<string, SpacetimeDBWoodenStorageBox>;
    playerCorpses: Map<string, SpacetimeDBPlayerCorpse>;
    stashes: Map<string, SpacetimeDBStash>;
    sleepingBags: Map<string, SpacetimeDBSleepingBag>;
    rainCollectors: Map<string, SpacetimeDBRainCollector>;
    brothPots: Map<string, any>;
    homesteadHearths: Map<string, SpacetimeDBHomesteadHearth>; // ADDED: Homestead Hearths
    doors: Map<string, SpacetimeDBDoor>; // ADDED: Doors
    alkStations: Map<string, SpacetimeDBAlkStation>; // ADDED: ALK Stations
    players: Map<string, SpacetimeDBPlayer>;
    itemDefinitions: Map<string, SpacetimeDBItemDefinition>;
    // Single unified target - replaces individual harvestable resource IDs
    closestInteractableTarget: InteractableTarget | null;
    // Individual entity IDs for consistency and backward compatibility
    closestInteractableHarvestableResourceId?: bigint | null;
    closestInteractableCampfireId?: number | null;
    closestInteractableDroppedItemId?: bigint | null;
    closestInteractableBoxId?: number | null;
    isClosestInteractableBoxEmpty?: boolean;
    closestInteractableCorpseId?: bigint | null;
    closestInteractableStashId?: number | null;
    closestInteractableSleepingBagId?: number | null;
    closestInteractableKnockedOutPlayerId?: string | null;
}

const LABEL_FONT = '14px "Courier New", Consolas, Monaco, monospace'; // 🎯 CYBERPUNK: Match game's main font
const LABEL_FILL_STYLE = "#00ffff"; // 🎯 CYBERPUNK: Bright cyan text
const LABEL_STROKE_STYLE = "black";
const LABEL_LINE_WIDTH = 2;
const LABEL_TEXT_ALIGN = "center";

// 🎯 CYBERPUNK: SOVA Overlay styling constants
const SOVA_BACKGROUND_COLOR = "rgba(0, 0, 0, 0.85)"; // Semi-transparent black
const SOVA_BORDER_COLOR = "#00aaff"; // Bright blue border
const SOVA_GLOW_COLOR = "#00ddff"; // Cyan glow
const SOVA_BORDER_RADIUS = 8;
const SOVA_PADDING_X = 12;
const SOVA_PADDING_Y = 6;
const SOVA_BORDER_WIDTH = 2;

/**
 * 🎯 CYBERPUNK: Draws a SOVA-style overlay background behind interaction text
 * Provides the visual aesthetic of SOVA's augmented reality interface
 */
function drawSOVAOverlayBackground(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number
): void {
    // Measure text to get dimensions - ensure font is set
    if (!ctx.font) {
        ctx.font = LABEL_FONT; // Fallback if font not set
    }
    const textMetrics = ctx.measureText(text);
    const textWidth = textMetrics.width;
    const textHeight = 14; // Font size
    
    // Calculate background dimensions
    const bgWidth = textWidth + (SOVA_PADDING_X * 2);
    const bgHeight = textHeight + (SOVA_PADDING_Y * 2);
    const bgX = x - bgWidth / 2;
    const bgY = y - bgHeight / 2 - textHeight / 4; // Adjust for text baseline
    
    ctx.save();
    
    // Ensure we start with clean state
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1.0;
    
    // 1. Draw outer glow effect
    ctx.shadowColor = SOVA_GLOW_COLOR;
    ctx.shadowBlur = 15;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    
    // Draw background with rounded corners - use roundRect if available, otherwise fallback
    ctx.fillStyle = SOVA_BACKGROUND_COLOR;
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(bgX, bgY, bgWidth, bgHeight, SOVA_BORDER_RADIUS);
    } else {
        // Fallback for browsers without roundRect support
        const r = SOVA_BORDER_RADIUS;
        ctx.moveTo(bgX + r, bgY);
        ctx.lineTo(bgX + bgWidth - r, bgY);
        ctx.quadraticCurveTo(bgX + bgWidth, bgY, bgX + bgWidth, bgY + r);
        ctx.lineTo(bgX + bgWidth, bgY + bgHeight - r);
        ctx.quadraticCurveTo(bgX + bgWidth, bgY + bgHeight, bgX + bgWidth - r, bgY + bgHeight);
        ctx.lineTo(bgX + r, bgY + bgHeight);
        ctx.quadraticCurveTo(bgX, bgY + bgHeight, bgX, bgY + bgHeight - r);
        ctx.lineTo(bgX, bgY + r);
        ctx.quadraticCurveTo(bgX, bgY, bgX + r, bgY);
        ctx.closePath();
    }
    ctx.fill();
    
    // Reset shadow for border
    ctx.shadowBlur = 0;
    
    // 2. Draw animated border with gradient
    const gradient = ctx.createLinearGradient(bgX, bgY, bgX + bgWidth, bgY + bgHeight);
    gradient.addColorStop(0, SOVA_BORDER_COLOR);
    gradient.addColorStop(0.5, SOVA_GLOW_COLOR);
    gradient.addColorStop(1, SOVA_BORDER_COLOR);
    
    ctx.strokeStyle = gradient;
    ctx.lineWidth = SOVA_BORDER_WIDTH;
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(bgX, bgY, bgWidth, bgHeight, SOVA_BORDER_RADIUS);
    } else {
        // Fallback for browsers without roundRect support
        const r = SOVA_BORDER_RADIUS;
        ctx.moveTo(bgX + r, bgY);
        ctx.lineTo(bgX + bgWidth - r, bgY);
        ctx.quadraticCurveTo(bgX + bgWidth, bgY, bgX + bgWidth, bgY + r);
        ctx.lineTo(bgX + bgWidth, bgY + bgHeight - r);
        ctx.quadraticCurveTo(bgX + bgWidth, bgY + bgHeight, bgX + bgWidth - r, bgY + bgHeight);
        ctx.lineTo(bgX + r, bgY + bgHeight);
        ctx.quadraticCurveTo(bgX, bgY + bgHeight, bgX, bgY + bgHeight - r);
        ctx.lineTo(bgX, bgY + r);
        ctx.quadraticCurveTo(bgX, bgY, bgX + r, bgY);
        ctx.closePath();
    }
    ctx.stroke();
    
    // 3. Draw subtle inner glow
    ctx.shadowColor = SOVA_GLOW_COLOR;
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.strokeStyle = `rgba(0, 221, 255, 0.3)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(bgX + 2, bgY + 2, bgWidth - 4, bgHeight - 4, SOVA_BORDER_RADIUS - 2);
    } else {
        // Fallback for browsers without roundRect support
        const r = Math.max(0, SOVA_BORDER_RADIUS - 2);
        ctx.moveTo(bgX + 2 + r, bgY + 2);
        ctx.lineTo(bgX + bgWidth - 2 - r, bgY + 2);
        ctx.quadraticCurveTo(bgX + bgWidth - 2, bgY + 2, bgX + bgWidth - 2, bgY + 2 + r);
        ctx.lineTo(bgX + bgWidth - 2, bgY + bgHeight - 2 - r);
        ctx.quadraticCurveTo(bgX + bgWidth - 2, bgY + bgHeight - 2, bgX + bgWidth - 2 - r, bgY + bgHeight - 2);
        ctx.lineTo(bgX + 2 + r, bgY + bgHeight - 2);
        ctx.quadraticCurveTo(bgX + 2, bgY + bgHeight - 2, bgX + 2, bgY + bgHeight - 2 - r);
        ctx.lineTo(bgX + 2, bgY + 2 + r);
        ctx.quadraticCurveTo(bgX + 2, bgY + 2, bgX + 2 + r, bgY + 2);
        ctx.closePath();
    }
    ctx.stroke();
    
    // 4. Add subtle scan line effect
    const time = Date.now() * 0.002; // Slow animation
    const scanY = bgY + (Math.sin(time) * 0.5 + 0.5) * bgHeight;
    
    ctx.shadowBlur = 0;
    ctx.strokeStyle = `rgba(0, 255, 255, 0.4)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(bgX + 4, scanY);
    ctx.lineTo(bgX + bgWidth - 4, scanY);
    ctx.stroke();
    
    ctx.restore();
}

/**
 * 🎯 CYBERPUNK: Renders styled interaction text with SOVA overlay background
 */
function renderStyledInteractionLabel(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number
): void {
    // Draw SOVA background first
    drawSOVAOverlayBackground(ctx, text, x, y);
    
    // Draw text with enhanced styling
    ctx.save();
    
    // Text shadow for better visibility
    ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    
    // Draw text stroke (outline)
    ctx.strokeText(text, x, y);
    
    // Reset shadow for fill
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    
    // Draw text fill
    ctx.fillText(text, x, y);
    
    ctx.restore();
}

/**
 * Renders interaction labels ("Press E...") for the closest interactable objects.
 */
export function renderInteractionLabels({
    ctx,
    campfires,
    furnaces, // ADDED: furnaces parameter
    fumaroles, // ADDED: fumaroles parameter
    lanterns,
    droppedItems,
    woodenStorageBoxes,
    playerCorpses,
    stashes,
    sleepingBags,
    rainCollectors,
    homesteadHearths, // ADDED: Homestead Hearths
    brothPots, // ADDED: Broth pots
    doors, // ADDED: Doors
    alkStations, // ADDED: ALK Stations
    players,
    itemDefinitions,
    closestInteractableTarget,
}: RenderLabelsParams): void {
    // Only render label if there's a single closest target
    if (!closestInteractableTarget) return;

    ctx.save(); // Save context state before changing styles

    ctx.font = LABEL_FONT;
    ctx.fillStyle = LABEL_FILL_STYLE;
    ctx.strokeStyle = LABEL_STROKE_STYLE;
    ctx.lineWidth = LABEL_LINE_WIDTH;
    ctx.textAlign = LABEL_TEXT_ALIGN;

    const text = "E";
    let textX: number;
    let textY: number;

    // Render label based on the single closest target type
    switch (closestInteractableTarget.type) {
        case 'harvestable_resource': {
            // For unified harvestable resources, use a standard height
            const STANDARD_RESOURCE_HEIGHT = 64;
            textX = closestInteractableTarget.position.x;
            textY = closestInteractableTarget.position.y - (STANDARD_RESOURCE_HEIGHT / 2) - 30;
            renderStyledInteractionLabel(ctx, text, textX, textY);
            break;
        }
        case 'dropped_item': {
            const item = droppedItems.get(closestInteractableTarget.id.toString());
            if (item) {
                textX = item.posX;
                textY = item.posY - 25;
                renderStyledInteractionLabel(ctx, text, textX, textY);
            }
            break;
        }
        case 'campfire': {
            const fire = campfires.get(closestInteractableTarget.id.toString());
            if (fire) {
                const visualCenterX = fire.posX;
                const visualCenterY = fire.posY - (CAMPFIRE_HEIGHT / 2) - CAMPFIRE_RENDER_Y_OFFSET;
                textX = visualCenterX;
                textY = visualCenterY - 50;
                renderStyledInteractionLabel(ctx, text, textX, textY);
            }
            break;
        }
        case 'furnace': { // ADDED: Furnace label support
            const furnace = furnaces.get(closestInteractableTarget.id.toString());
            if (furnace) {
                const visualCenterX = furnace.posX;
                const visualCenterY = furnace.posY - (FURNACE_HEIGHT / 2) - FURNACE_RENDER_Y_OFFSET;
                textX = visualCenterX;
                textY = visualCenterY - 64; // Moved up from -50 to -80
                renderStyledInteractionLabel(ctx, text, textX, textY);
            }
            break;
        }
        case 'lantern': {
            const lantern = lanterns.get(closestInteractableTarget.id.toString());
            if (lantern) {
                textX = lantern.posX;
                textY = lantern.posY - 75; // Moved E text higher (up) by 10px for better alignment
                renderStyledInteractionLabel(ctx, text, textX, textY);
            }
            break;
        }
        case 'box': {
            const box = woodenStorageBoxes.get(closestInteractableTarget.id.toString());
            if (box) {
                const BOX_COLLISION_Y_OFFSET = 58.0;
                const visualCenterY = box.posY - BOX_COLLISION_Y_OFFSET;
                textX = box.posX;
                textY = visualCenterY - (BOX_HEIGHT / 2) - 0;
                // Show different label text for backpacks
                const labelText = box.boxType === 4 ? 'E - Open Backpack' : text;
                renderStyledInteractionLabel(ctx, labelText, textX, textY);
            }
            break;
        }
        case 'corpse': {
            const corpse = playerCorpses.get(closestInteractableTarget.id.toString());
            if (corpse) {
                textX = corpse.posX;
                textY = corpse.posY - (48 / 2) - 10;
                renderStyledInteractionLabel(ctx, text, textX, textY);
            }
            break;
        }
        case 'stash': {
            const stash = stashes.get(closestInteractableTarget.id.toString());
            if (stash) {
                textX = stash.posX;
                textY = stash.posY - 45; // Moved down from -65 to -45
                renderStyledInteractionLabel(ctx, text, textX, textY);
            }
            break;
        }
        case 'sleeping_bag': {
            const sleepingBag = sleepingBags.get(closestInteractableTarget.id.toString());
            if (sleepingBag) {
                textX = sleepingBag.posX;
                textY = sleepingBag.posY - (SLEEPING_BAG_HEIGHT / 2) - 50;
                renderStyledInteractionLabel(ctx, text, textX, textY);
            }
            break;
        }
        case 'knocked_out_player': {
            const knockedOutPlayer = players.get(closestInteractableTarget.id.toString());
            if (knockedOutPlayer && knockedOutPlayer.isKnockedOut && !knockedOutPlayer.isDead) {
                textX = knockedOutPlayer.positionX;
                textY = knockedOutPlayer.positionY - 30;
                renderStyledInteractionLabel(ctx, text, textX, textY);
            }
            break;
        }
        case 'water': {
            // Water interaction label handled elsewhere if needed
            break;
        }
        case 'rain_collector': {
            const rainCollector = rainCollectors.get(closestInteractableTarget.id.toString());
            if (rainCollector) {
                const visualCenterY = rainCollector.posY - (RAIN_COLLECTOR_HEIGHT / 2);
                textX = rainCollector.posX;
                textY = visualCenterY - 5;
                renderStyledInteractionLabel(ctx, text, textX, textY);
            }
            break;
        }
        case 'homestead_hearth': {
            const hearth = homesteadHearths.get(closestInteractableTarget.id.toString());
            if (hearth) {
                const HEARTH_HEIGHT = 96; // Approximate height
                const visualCenterY = hearth.posY - (HEARTH_HEIGHT / 2);
                textX = hearth.posX;
                // Moved up by ~20% (15px) to match indicator box position
                textY = visualCenterY - 65;
                renderStyledInteractionLabel(ctx, text, textX, textY);
            }
            break;
        }
        case 'fumarole': {
            const fumarole = fumaroles.get(closestInteractableTarget.id.toString());
            if (fumarole) {
                const FUMAROLE_HEIGHT = 96; // Fumaroles are 96x96 sprites
                // Fumarole outline is drawn at posY - 48, so label should be just above that
                // Position label at top of the outline box
                textX = fumarole.posX;
                textY = fumarole.posY - 32 - 15; // Top of sprite (48px) + small clearance (15px)
                renderStyledInteractionLabel(ctx, text, textX, textY);
            }
            break;
        }
        case 'broth_pot': {
            const brothPot = brothPots.get(closestInteractableTarget.id.toString());
            if (brothPot) {
                textX = brothPot.posX;
                // Position label above the broth pot
                textY = brothPot.posY - 60;
                renderStyledInteractionLabel(ctx, text, textX, textY);
            }
            break;
        }
        case 'door': {
            const door = doors.get(closestInteractableTarget.id.toString());
            if (door) {
                textX = door.posX;
                // Position label above the door's visual position (doors are rendered 44px higher)
                const visualDoorY = door.posY - DOOR_RENDER_Y_OFFSET;
                textY = visualDoorY - 50;
                renderStyledInteractionLabel(ctx, text, textX, textY);
            }
            break;
        }
        case 'alk_station': {
            const station = alkStations.get(closestInteractableTarget.id.toString());
            if (station) {
                textX = station.worldPosX;
                // Position label above the building content (not the whole sprite)
                // The building occupies the bottom ~60% of the sprite, so label goes above that
                // Building top is roughly at: worldPosY - 450 (for 6x scale with 500px outline height)
                textY = station.worldPosY - 450; 
                renderStyledInteractionLabel(ctx, text, textX, textY);
            }
            break;
        }
    }

    ctx.restore(); // Restore original context state
} 