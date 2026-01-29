import { useEffect, useRef } from 'react';

/**
 * Hook to load and manage doodad images for placement previews and rendering.
 * Extracts doodad image loading from GameCanvas for better separation of concerns.
 */
export function useDoodadImages() {
  const doodadImagesRef = useRef<Map<string, HTMLImageElement>>(new Map());

  useEffect(() => {
    // Helper function to load a doodad image
    const loadDoodadImage = (importPromise: Promise<{ default: string }>, filename: string) => {
      importPromise.then((module) => {
        const img = new Image();
        img.onload = () => {
          doodadImagesRef.current.set(filename, img);
        };
        img.onerror = () => console.error(`Failed to load ${filename}`);
        img.src = module.default;
      });
    };

    // Planted seed
    loadDoodadImage(import('../assets/doodads/planted_seed.png'), 'planted_seed.png');

    // Rain collector
    loadDoodadImage(import('../assets/doodads/reed_rain_collector.png'), 'reed_rain_collector.png');

    // Door images (south-facing)
    loadDoodadImage(import('../assets/doodads/wood_door.png'), 'wood_door.png');
    loadDoodadImage(import('../assets/doodads/metal_door.png'), 'metal_door.png');

    // Door images (north-facing)
    loadDoodadImage(import('../assets/doodads/wood_door_north.png'), 'wood_door_north.png');
    loadDoodadImage(import('../assets/doodads/metal_door_north.png'), 'metal_door_north.png');

    // Fence sprite images for smart fence rendering
    // Vertical fence pieces
    loadDoodadImage(import('../assets/doodads/wood_fence_vertical_top.png'), 'wood_fence_vertical_top.png');
    loadDoodadImage(import('../assets/doodads/wood_fence_vertical_center.png'), 'wood_fence_vertical_center.png');
    loadDoodadImage(import('../assets/doodads/wood_fence_vertical_bottom.png'), 'wood_fence_vertical_bottom.png');
    loadDoodadImage(import('../assets/doodads/wood_fence_vertical_single.png'), 'wood_fence_vertical_single.png');

    // Horizontal fence pieces
    loadDoodadImage(import('../assets/doodads/wood_fence_horizontal_left.png'), 'wood_fence_horizontal_left.png');
    loadDoodadImage(import('../assets/doodads/wood_fence_horizontal_center.png'), 'wood_fence_horizontal_center.png');
    loadDoodadImage(import('../assets/doodads/wood_fence_horizontal_right.png'), 'wood_fence_horizontal_right.png');
    loadDoodadImage(import('../assets/doodads/wood_fence_horizontal_single.png'), 'wood_fence_horizontal_single.png');
    // Corner fence pieces - TODO: Add corner sprites later
    // For now, corners render as brown placeholder squares

    // Compost
    loadDoodadImage(import('../assets/doodads/compost.png'), 'compost.png');

    // Barbecue
    loadDoodadImage(import('../assets/doodads/barbecue.png'), 'barbecue.png');

    // Refrigerator
    loadDoodadImage(import('../assets/doodads/refrigerator.png'), 'refrigerator.png');

    // Large wooden box
    loadDoodadImage(import('../assets/doodads/large_wood_box.png'), 'large_wood_box.png');

    // Repair bench
    loadDoodadImage(import('../assets/doodads/repair_bench.png'), 'repair_bench.png');

    // Cooking station
    loadDoodadImage(import('../assets/doodads/cooking_station.png'), 'cooking_station.png');

    // Ward off images for placement previews
    loadDoodadImage(import('../assets/doodads/ancestral_ward_off.png'), 'ancestral_ward_off.png');
    loadDoodadImage(import('../assets/doodads/signal_disruptor_off.png'), 'signal_disruptor_off.png');
    loadDoodadImage(import('../assets/doodads/memory_beacon.png'), 'memory_beacon.png');

    // Wooden beehive
    loadDoodadImage(import('../assets/doodads/beehive_wooden.png'), 'beehive_wooden.png');

    // Scarecrow
    loadDoodadImage(import('../assets/doodads/scarecrow.png'), 'scarecrow.png');

    // Turret
    loadDoodadImage(import('../assets/doodads/turret_tallow.png'), 'turret_tallow.png');

  }, []);

  return doodadImagesRef;
}
