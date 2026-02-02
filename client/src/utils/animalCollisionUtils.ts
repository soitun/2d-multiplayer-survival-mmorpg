import { WildAnimal } from '../generated';

export interface AnimalCollisionBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Species-specific collision sizes (matching rendering sizes)
export const ANIMAL_COLLISION_SIZES = {
  CinderFox: { width: 96, height: 64 },
  TundraWolf: { width: 112, height: 80 },
  CableViper: { width: 80, height: 48 },
  ArcticWalrus: { width: 96, height: 96 },
  BeachCrab: { width: 64, height: 48 }, // Small crab - compact collision box
  Tern: { width: 72, height: 56 }, // Medium-sized coastal bird
  Crow: { width: 64, height: 48 }, // Medium-sized inland bird
  Vole: { width: 40, height: 32 }, // Tiny rodent - small collision box
  Wolverine: { width: 88, height: 64 }, // Medium stocky predator
  Caribou: { width: 96, height: 80 }, // Large herd herbivore
  SalmonShark: { width: 128, height: 96 }, // Large aquatic predator
  // Night hostile NPCs
  Shorebound: { width: 128, height: 96 }, // Lean stalker
  Shardkin: { width: 56, height: 48 }, // Small swarmer
  DrownedWatch: { width: 160, height: 128 }, // Massive brute
  Bee: { width: 0, height: 0 }, // No collision - tiny flying insect
  // Alpine animals
  PolarBear: { width: 128, height: 96 }, // Massive apex predator
  Hare: { width: 48, height: 40 }, // Small fast prey animal
  SnowyOwl: { width: 64, height: 56 }, // Medium aggressive flying bird
} as const;

// Default collision size for unknown species
const DEFAULT_COLLISION_SIZE = { width: 96, height: 96 };

/**
 * Gets collision bounds for an animal based on its species
 */
export function getAnimalCollisionBounds(animal: WildAnimal): AnimalCollisionBounds {
  const size = ANIMAL_COLLISION_SIZES[animal.species.tag as keyof typeof ANIMAL_COLLISION_SIZES] ?? DEFAULT_COLLISION_SIZE;
  return {
    x: animal.posX - size.width / 2,
    y: animal.posY - size.height / 2,
    width: size.width,
    height: size.height,
  };
}

/**
 * Checks if an animal is within interaction range of the player
 */
export function isAnimalInInteractionRange(
  animal: WildAnimal,
  playerX: number,
  playerY: number,
  interactionRange: number = 150
): boolean {
  const dx = animal.posX - playerX;
  const dy = animal.posY - playerY;
  const distanceSquared = dx * dx + dy * dy;
  return distanceSquared <= interactionRange * interactionRange;
}

/**
 * Gets the closest animal to a position
 */
export function getClosestAnimal(
  animals: WildAnimal[],
  x: number,
  y: number,
  maxDistance: number = Infinity
): WildAnimal | null {
  let closest: WildAnimal | null = null;
  let closestDistanceSquared = maxDistance * maxDistance;
  
  for (const animal of animals) {
    const dx = animal.posX - x;
    const dy = animal.posY - y;
    const distanceSquared = dx * dx + dy * dy;
    
    if (distanceSquared < closestDistanceSquared) {
      closest = animal;
      closestDistanceSquared = distanceSquared;
    }
  }
  
  return closest;
} 