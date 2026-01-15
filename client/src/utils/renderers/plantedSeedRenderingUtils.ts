import { PlantedSeed, PlantType, TreeType } from '../../generated';
import { RESOURCE_IMAGE_SOURCES } from './resourceImageConfigs';
import type { ResourceType } from '../../types/resourceTypes';

// All tree sprites for rendering saplings with their actual target tree type
import sitkaSpruceImage from '../../assets/doodads/sitka_spruce_c.png';
import siberianBirchImage from '../../assets/doodads/siberian_birch_c.png';
import mountainHemlockImage from '../../assets/doodads/mountain_hemlock_c.png';
import mountainHemlockImage2 from '../../assets/doodads/mountain_hemlock_d.png';
import sitkaAlderImage from '../../assets/doodads/sitka_alder_c.png';
import sitkaAlderImage2 from '../../assets/doodads/sitka_alder_d.png';
import dwarfPineImage from '../../assets/doodads/dwarf_pine.png';
import arcticWillowImage from '../../assets/doodads/arctic_willow.png';
import mountainHemlockSnowImage from '../../assets/doodads/mountain_hemlock_snow.png';
import krummholzSpruceImage from '../../assets/doodads/krummholz_spruce.png';

/**
 * Type alias for the actual generated PlantedSeed type
 */
export type PlantedSeedData = PlantedSeed;

/**
 * Check if the plant type is a tree sapling
 */
function isTreeSapling(plantType: PlantType): boolean {
    return plantType.tag === 'ConiferSapling' || plantType.tag === 'DeciduousSapling';
}

/**
 * Convert server PlantType to client ResourceType
 * Uses existing resource image sources as validation - NO manual typing!
 */
function convertPlantTypeToResourceType(plantType: PlantType): ResourceType | null {
    // If the plant type tag exists in our resource image sources, it's a valid ResourceType
    const plantTypeTag = plantType.tag;
    return (plantTypeTag in RESOURCE_IMAGE_SOURCES) ? plantTypeTag as ResourceType : null;
}

/**
 * Cached plant images
 */
const plantImages: { [key: string]: HTMLImageElement } = {};

/**
 * Cached tree images by tree type (for saplings)
 */
const treeImages: { [key: string]: HTMLImageElement } = {};

/**
 * Initialize tree images for all tree types
 */
function initializeTreeImages() {
    if (Object.keys(treeImages).length === 0) {
        // Map tree type to image source
        const treeTypeToImage: { [key: string]: string } = {
            'SitkaSpruce': sitkaSpruceImage,
            'SiberianBirch': siberianBirchImage,
            'MountainHemlock': mountainHemlockImage,
            'MountainHemlock2': mountainHemlockImage2,
            'SitkaAlder': sitkaAlderImage,
            'SitkaAlder2': sitkaAlderImage2,
            'DwarfPine': dwarfPineImage,
            'ArcticWillow': arcticWillowImage,
            'MountainHemlockSnow': mountainHemlockSnowImage,
            'KrummholzSpruce': krummholzSpruceImage,
        };
        
        Object.entries(treeTypeToImage).forEach(([treeType, imageSrc]) => {
            const img = new Image();
            img.src = imageSrc;
            treeImages[treeType] = img;
        });
    }
}

/**
 * Initialize plant images using the existing resource image system
 * Load images for all available resource types that plants can become
 */
function initializePlantImages() {
    if (Object.keys(plantImages).length === 0) {
        // Initialize images for all resource types in the system
        Object.keys(RESOURCE_IMAGE_SOURCES).forEach(resourceType => {
            const imageSrc = RESOURCE_IMAGE_SOURCES[resourceType as ResourceType];
            const img = new Image();
            img.src = imageSrc;
            plantImages[resourceType] = img; // Store by resource type, not seed type
        });
    }
    // Also initialize tree images
    initializeTreeImages();
}

/**
 * Get the tree image for a tree sapling based on its target tree type
 */
function getTreeSaplingImage(targetTreeType: TreeType | null | undefined): HTMLImageElement | null {
    if (!targetTreeType) return null;
    
    initializeTreeImages();
    return treeImages[targetTreeType.tag] || null;
}

/**
 * Get the target plant image for a planted seed using server's plant type
 */
function getPlantImage(plantedSeed: PlantedSeedData): HTMLImageElement | null {
    initializePlantImages();
    
    // Special handling for tree saplings - use the actual tree sprite from targetTreeType
    if (isTreeSapling(plantedSeed.plantType)) {
        return getTreeSaplingImage(plantedSeed.targetTreeType);
    }
    
    const resourceType = convertPlantTypeToResourceType(plantedSeed.plantType);
    return resourceType ? plantImages[resourceType] || null : null;
}

/**
 * Get the growth progress from the server-calculated value
 * The server now handles sophisticated growth calculations based on weather and time of day
 */
function getGrowthProgress(plantedSeed: PlantedSeedData): number {
    // Use the server-calculated growth progress directly
    return Math.max(0, Math.min(1, plantedSeed.growthProgress || 0));
}

/**
 * Calculate the size of the plant based on growth progress
 * Plants start small (25% of final size) at 25% growth and scale to full size at 100%
 */
function calculatePlantSize(growthProgress: number, finalSize: number): number {
    if (growthProgress < 0.25) {
        return finalSize; // Still showing dirt patch at full size
    }
    
    // Map growth progress from 0.25-1.0 to size scale 0.25-1.0
    const sizeProgress = (growthProgress - 0.25) / 0.75;
    const minScale = 0.25;
    const maxScale = 1.0;
    
    return finalSize * (minScale + sizeProgress * (maxScale - minScale));
}

// Tree sapling final dimensions (when fully grown they become actual trees)
// These match the tree rendering sizes so the transition looks smooth
const TREE_SAPLING_FINAL_WIDTH = 240; // Half of full tree width (480px) - saplings are young trees
const TREE_SAPLING_FINAL_HEIGHT = 360; // Proportional height for tree sprite aspect ratio

/**
 * Renders a planted seed on the ground
 */
export function renderPlantedSeed(
    ctx: CanvasRenderingContext2D,
    plantedSeed: PlantedSeedData,
    nowMs: number,
    cycleProgress: number,
    plantedSeedImage?: HTMLImageElement | null
): void {
    const { posX, posY } = plantedSeed;
    const growthProgress = getGrowthProgress(plantedSeed);
    const isSapling = isTreeSapling(plantedSeed.plantType);
    
    // Tree saplings have larger final sizes than regular plants
    const finalSize = isSapling ? TREE_SAPLING_FINAL_WIDTH : 48;
    
    // Determine which image to show based on growth progress
    const shouldShowPlant = growthProgress >= 0.25;
    const imageToShow = shouldShowPlant ? getPlantImage(plantedSeed) : plantedSeedImage;
    const currentSize = shouldShowPlant ? calculatePlantSize(growthProgress, finalSize) : 48; // Dirt patch is always 48
    
    if (!imageToShow || !imageToShow.complete) {
        // Draw a simple placeholder if image not loaded
        ctx.save();
        ctx.fillStyle = shouldShowPlant ? (isSapling ? '#2D5016' : '#4CAF50') : '#8B4513'; // Darker green for tree saplings
        ctx.beginPath();
        ctx.arc(posX, posY, shouldShowPlant ? currentSize / 8 : 4, 0, 2 * Math.PI);
        ctx.fill();
        ctx.restore();
        return;
    }
    
    ctx.save();
    
    // Apply subtle shadow effect
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    ctx.shadowBlur = 4;
    
    // Add a subtle growing animation when the plant is actively growing
    let animationScale = 1.0;
    if (shouldShowPlant && growthProgress < 1.0) {
        // Very subtle breathing animation for growing plants
        const breathingCycle = Math.sin(nowMs * 0.001) * 0.02 + 1.0;
        animationScale = breathingCycle;
    }
    
    const renderSize = currentSize * animationScale;
    
    // Special rendering for tree saplings - maintain aspect ratio and anchor at bottom
    if (shouldShowPlant && isSapling && imageToShow) {
        // Calculate height based on image aspect ratio
        const aspectRatio = imageToShow.naturalHeight / imageToShow.naturalWidth;
        const renderWidth = renderSize;
        const renderHeight = renderSize * aspectRatio;
        
        // Draw tree sprite anchored at bottom (trunk base at posY)
        // This matches how full trees are rendered
        ctx.drawImage(
            imageToShow,
            posX - renderWidth / 2,
            posY - renderHeight + 40, // Offset to place trunk base near the ground
            renderWidth,
            renderHeight
        );
    } else {
        // Regular plant rendering (centered)
        ctx.drawImage(
            imageToShow,
            posX - renderSize / 2,
            posY - renderSize / 2,
            renderSize,
            renderSize
        );
    }
    
    // Optional: Draw growth progress indicator for debugging (can be removed)
    if (process.env.NODE_ENV === 'development' && growthProgress > 0) {
        ctx.restore(); // Reset for clean drawing
        ctx.save();
        
        // Small progress circle around the seed/plant - always same size based on planted seed
        const progressRadius = 48 / 2 + 6; // Use base size for consistency
        ctx.strokeStyle = `hsl(${120 * growthProgress}, 70%, 50%)`; // Red to green
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(posX, posY, progressRadius, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * growthProgress);
        ctx.stroke();
    }
    
    ctx.restore();
}

/**
 * Check if a planted seed should show interaction highlight
 */
export function isPlantedSeedInteractable(plantedSeed: PlantedSeedData): boolean {
    // Seeds become "interactable" when they're fully grown (for debugging/info purposes)
    const growthProgress = getGrowthProgress(plantedSeed);
    return growthProgress >= 1.0;
} 