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
  Tern: { width: 56, height: 40 }, // Small-medium coastal bird
  Crow: { width: 48, height: 36 }, // Small inland bird
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