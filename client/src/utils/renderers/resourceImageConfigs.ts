// Resource Image Configuration
// Centralized location for all resource image imports and mappings

import type { HarvestableResourceType } from '../../types/resourceTypes';

// Import existing resource images
import borealNettleImageSource from '../../assets/doodads/nettle.png'; // Reusing hemp image for BorealNettle
import potatoImageSource from '../../assets/doodads/potato_b.png';
import pumpkinImageSource from '../../assets/doodads/pumpkin_b.png';
import reedImageSource from '../../assets/doodads/reed_stalk_b.png';
import beachLymeGrassImageSource from '../../assets/doodads/beach_lyme_grass_b.png';
import carrotImageSource from '../../assets/doodads/carrot_b.png';
import beetsImageSource from '../../assets/doodads/beet.png';
import horseradishImageSource from '../../assets/doodads/horseradish.png';
import cornImageSource from '../../assets/doodads/corn_stalk_b.png';
import chicoryImageSource from '../../assets/doodads/chicory.png';
import yarrowImageSource from '../../assets/doodads/yarrow.png';
import chamomileImageSource from '../../assets/doodads/chamomile.png';
import mintImageSource from '../../assets/doodads/mint.png';
import valerianImageSource from '../../assets/doodads/valerian.png';
import mugwortImageSource from '../../assets/doodads/mugwort.png';
import flaxImageSource from '../../assets/doodads/flax.png';
import bearGarlicImageSource from '../../assets/doodads/bear_garlic.png';
import siberianGinsengImageSource from '../../assets/doodads/siberian_ginseng.png';
import dogbaneImageSource from '../../assets/doodads/dogbane.png';
import bogCottonImageSource from '../../assets/doodads/bog_cotton.png';
import salsifyImageSource from '../../assets/doodads/salsify.png';
import cabbageImageSource from '../../assets/doodads/cabbage.png';

// NEW ARCTIC/SUBARCTIC PLANTS
import scurvyGrassImageSource from '../../assets/doodads/scurvy_grass.png';
import crowberriesImageSource from '../../assets/doodads/crowberries.png';
import fireweedImageSource from '../../assets/doodads/fireweed.png';
import seaPlantainImageSource from '../../assets/doodads/sea_plantain.png';
import glasswortImageSource from '../../assets/doodads/glasswort.png';
import arcticHairgrassImageSource from '../../assets/doodads/arctic_hairgrass.png';

// NEW ALPINE PLANTS
import arcticLichenImageSource from '../../assets/doodads/arctic_lichen.png';
import mountainMossImageSource from '../../assets/doodads/mountain_moss.png';
import arcticPoppyImageSource from '../../assets/doodads/arctic_poppy.png';

// Mushrooms
import chanterelleImageSource from '../../assets/doodads/chanterelle.png';
import porciniImageSource from '../../assets/doodads/porcini.png';
import flyAgaricImageSource from '../../assets/doodads/fly_agaric.png';
import shaggyInkCapImageSource from '../../assets/doodads/shaggy_ink_cap.png';
import deadlyWebcapImageSource from '../../assets/doodads/deadly_webcap.png';
import destroyingAngelImageSource from '../../assets/doodads/destroying_angel.png';

// Berries (botanically accurate for subarctic)
import lingonberriesImageSource from '../../assets/doodads/lingonberries.png';
import cloudberriesImageSource from '../../assets/doodads/cloudberries.png';
import bilberriesImageSource from '../../assets/doodads/bilberries.png';
import wildStrawberriesImageSource from '../../assets/doodads/wild_strawberries.png';
import rowanBerriesImageSource from '../../assets/doodads/rowan_berries.png';
import cranberriesImageSource from '../../assets/doodads/cranberries.png';

// Toxic/Medicinal plants
import mandrakeImageSource from '../../assets/doodads/mandrake.png';
import belladonnaImageSource from '../../assets/doodads/belladonna.png';
import henbaneImageSource from '../../assets/doodads/henbane.png';
import daturaImageSource from '../../assets/doodads/datura.png';
import wolfsbaneImageSource from '../../assets/doodads/wolfsbane.png';

// Other
import sunflowersImageSource from '../../assets/doodads/sunflower.png';

// Technological debris
import memoryShardImageSource from '../../assets/doodads/memory_shard.png';

// Resource piles (small bonus resources)
import woodPileImageSource from '../../assets/doodads/pile_wood.png';
import beachWoodPileImageSource from '../../assets/doodads/pile_beach_wood.png';
import stonePileImageSource from '../../assets/doodads/pile_stone.png';
import leavesPileImageSource from '../../assets/doodads/pile_leaves.png';
import metalOrePileImageSource from '../../assets/doodads/pile_metal.png';
import sulfurPileImageSource from '../../assets/doodads/pile_sulfur.png';
import charcoalPileImageSource from '../../assets/doodads/pile_charcoal.png';

// Underwater plants
import seaweedBedImageSource from '../../assets/doodads/seaweed.png';

// Resource type to image source mapping (BOTANICALLY ACCURATE FOR ALEUTIAN ISLANDS)
export const RESOURCE_IMAGE_SOURCES = {
  // === BASIC CROPS (Cold-hardy varieties) ===
  BorealNettle: borealNettleImageSource,
  Potato: potatoImageSource,
  Pumpkin: pumpkinImageSource,
  Reed: reedImageSource,
  BeachLymeGrass: beachLymeGrassImageSource,
  
  // === COLD-HARDY ROOT CROPS ===
  Carrot: carrotImageSource,
  Beets: beetsImageSource,
  Horseradish: horseradishImageSource,
  Corn: cornImageSource,
  
  // === HERBS & MEDICINAL PLANTS (Arctic/Subarctic species) ===
  Chicory: chicoryImageSource,
  Yarrow: yarrowImageSource,
  Chamomile: chamomileImageSource,
  Mint: mintImageSource,
  Valerian: valerianImageSource,
  Mugwort: mugwortImageSource,
  BearGarlic: bearGarlicImageSource,
  SiberianGinseng: siberianGinsengImageSource,
  Dogbane: dogbaneImageSource,
  BogCotton: bogCottonImageSource,
  Flax: flaxImageSource,
  Salsify: salsifyImageSource,
  Cabbage: cabbageImageSource,
  
  // === NEW: ARCTIC/SUBARCTIC PLANTS (Botanically accurate for Aleutian Islands) ===
  ScurvyGrass: scurvyGrassImageSource,
  Crowberry: crowberriesImageSource,
  Fireweed: fireweedImageSource,
  SeaPlantain: seaPlantainImageSource,
  Glasswort: glasswortImageSource,
  ArcticHairgrass: arcticHairgrassImageSource,
  
  // === NEW: ALPINE PLANTS (Year-round hardy alpine species) ===
  ArcticLichen: arcticLichenImageSource,
  MountainMoss: mountainMossImageSource,
  ArcticPoppy: arcticPoppyImageSource,
  
  // === MUSHROOMS (Can grow in cold, humid maritime conditions) ===
  Chanterelle: chanterelleImageSource,
  Porcini: porciniImageSource,
  FlyAgaric: flyAgaricImageSource,
  ShaggyInkCap: shaggyInkCapImageSource,
  DeadlyWebcap: deadlyWebcapImageSource,
  DestroyingAngel: destroyingAngelImageSource,
  
  // === BERRIES (Native to subarctic/boreal regions) ===
  Lingonberries: lingonberriesImageSource,
  Cloudberries: cloudberriesImageSource,
  Bilberries: bilberriesImageSource,
  WildStrawberries: wildStrawberriesImageSource,
  RowanBerries: rowanBerriesImageSource,
  Cranberries: cranberriesImageSource,
  
  // === TOXIC/MEDICINAL ===
  Mandrake: mandrakeImageSource,
  Belladonna: belladonnaImageSource,
  Henbane: henbaneImageSource,
  Datura: daturaImageSource,
  Wolfsbane: wolfsbaneImageSource,
  
  // === OTHER ===
  Sunflowers: sunflowersImageSource,

  // === TECHNOLOGICAL DEBRIS ===
  MemoryShard: memoryShardImageSource,
  
  // === RESOURCE PILES (Small bonus resources) ===
  WoodPile: woodPileImageSource,
  BeachWoodPile: beachWoodPileImageSource,
  StonePile: stonePileImageSource,
  LeavesPile: leavesPileImageSource,
  MetalOrePile: metalOrePileImageSource,
  SulfurPile: sulfurPileImageSource,
  CharcoalPile: charcoalPileImageSource,
  
  // === UNDERWATER PLANTS (Require snorkeling to harvest) ===
  SeaweedBed: seaweedBedImageSource
} as Record<HarvestableResourceType, string>; // Using 'as' instead of 'satisfies' - new types will be added after bindings regeneration

// Explicit type export for better type inference
export type ResourceImageSources = typeof RESOURCE_IMAGE_SOURCES;

// Helper function to get image source for a resource type
export function getResourceImageSource(resourceType: HarvestableResourceType): string {
  return RESOURCE_IMAGE_SOURCES[resourceType];
}

// Helper function to get all available resource types (useful for debugging/admin)
export function getAllResourceTypes(): HarvestableResourceType[] {
  return Object.keys(RESOURCE_IMAGE_SOURCES) as HarvestableResourceType[];
}

// Helper function to check if a resource type has an image configured
export function hasResourceImage(resourceType: HarvestableResourceType): boolean {
  return resourceType in RESOURCE_IMAGE_SOURCES;
} 