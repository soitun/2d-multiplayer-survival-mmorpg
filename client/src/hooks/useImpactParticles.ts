/**
 * useImpactParticles - Blood/ethereal hit effect particles
 * 
 * Generates particles when:
 * - Regular animals are hit (blood splatter)
 * - Apparitions/hostile NPCs are hit (ethereal wisps)
 * - Players are hit (blood)
 * 
 * This adds visceral combat feedback that makes hits feel impactful.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { Particle } from './useCampfireParticles';
import { WildAnimal as SpacetimeDBWildAnimal, Player as SpacetimeDBPlayer } from '../generated';

// --- Blood Particle Constants ---
const BLOOD_PARTICLE_LIFETIME_MIN = 200;
const BLOOD_PARTICLE_LIFETIME_MAX = 500;
const BLOOD_PARTICLE_SPEED = 2.5;
const BLOOD_PARTICLE_GRAVITY = 0.15;
const BLOOD_PARTICLE_SIZE_MIN = 2;
const BLOOD_PARTICLE_SIZE_MAX = 5;

// Blood colors - dark to light reds
const BLOOD_COLORS = [
    "#8B0000", // Dark red
    "#A52A2A", // Brown red  
    "#B22222", // Firebrick
    "#CD5C5C", // Indian red
    "#DC143C", // Crimson
];

const BLOOD_COLORS_BRIGHT = [
    "#E74C3C", // Light red
    "#EC7063", // Soft red
    "#F1948A", // Pink red
];

// --- Ethereal Particle Constants (for apparitions) ---
const ETHEREAL_PARTICLE_LIFETIME_MIN = 300;
const ETHEREAL_PARTICLE_LIFETIME_MAX = 600;
const ETHEREAL_PARTICLE_SPEED = 1.5;
const ETHEREAL_PARTICLE_SIZE_MIN = 3;
const ETHEREAL_PARTICLE_SIZE_MAX = 6;

// Ethereal colors by species
const ETHEREAL_COLORS: Record<string, string[]> = {
    'Shorebound': ["#22D3EE", "#06B6D4", "#0EA5E9", "#67E8F9", "#A5F3FC"], // Cyan wisps
    'Shardkin': ["#A855F7", "#8B5CF6", "#C084FC", "#D8B4FE", "#E9D5FF"],   // Purple wisps
    'DrownedWatch': ["#3B82F6", "#2563EB", "#60A5FA", "#93C5FD", "#BFDBFE"], // Blue wisps
};

const ETHEREAL_COLORS_WHITE = [
    "#E0E7FF",
    "#EDE9FE", 
    "#F5F3FF",
    "#FFFFFF",
];

// Hostile species list
const HOSTILE_SPECIES = ['Shorebound', 'Shardkin', 'DrownedWatch'];

// Particle count based on damage (scaled)
const BASE_PARTICLE_COUNT = 8;
const PARTICLES_PER_DAMAGE = 0.5;
const MAX_PARTICLES_PER_HIT = 25;

// Track processed hits to avoid duplicates
interface HitRecord {
    entityId: string;
    lastHitTimeMicros: bigint;
}

interface UseImpactParticlesProps {
    wildAnimals: Map<string, SpacetimeDBWildAnimal>;
    localPlayer: SpacetimeDBPlayer | null | undefined;
}

export function useImpactParticles({
    wildAnimals,
    localPlayer,
}: UseImpactParticlesProps): Particle[] {
    const particlesRef = useRef<Particle[]>([]);
    const lastUpdateTimeRef = useRef<number>(performance.now());
    const animationFrameRef = useRef<number>(0);
    
    // Track last known hit times to detect new hits
    const animalHitRecordsRef = useRef<Map<string, HitRecord>>(new Map());
    const playerHitRecordRef = useRef<bigint>(0n);
    
    // Generate blood particles
    const generateBloodParticles = useCallback((x: number, y: number, count: number) => {
        const now = performance.now();
        const newParticles: Particle[] = [];
        
        for (let i = 0; i < count; i++) {
            // Random burst direction (mostly upward and outward)
            const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.2; // Upward fan
            const speed = BLOOD_PARTICLE_SPEED * (0.5 + Math.random());
            
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            
            // Select color
            const color = Math.random() < 0.7 
                ? BLOOD_COLORS[Math.floor(Math.random() * BLOOD_COLORS.length)]
                : BLOOD_COLORS_BRIGHT[Math.floor(Math.random() * BLOOD_COLORS_BRIGHT.length)];
            
            const lifetime = BLOOD_PARTICLE_LIFETIME_MIN + 
                Math.random() * (BLOOD_PARTICLE_LIFETIME_MAX - BLOOD_PARTICLE_LIFETIME_MIN);
            
            newParticles.push({
                id: `blood-${now}-${i}-${Math.random()}`,
                type: 'spark' as const,
                x: x + (Math.random() - 0.5) * 15,
                y: y + (Math.random() - 0.5) * 15,
                vx,
                vy,
                spawnTime: now,
                initialLifetime: lifetime,
                lifetime,
                size: BLOOD_PARTICLE_SIZE_MIN + Math.random() * (BLOOD_PARTICLE_SIZE_MAX - BLOOD_PARTICLE_SIZE_MIN),
                color,
                alpha: 1.0,
            });
        }
        
        return newParticles;
    }, []);
    
    // Generate ethereal particles for apparitions
    const generateEtherealParticles = useCallback((x: number, y: number, count: number, species: string) => {
        const now = performance.now();
        const newParticles: Particle[] = [];
        const speciesColors = ETHEREAL_COLORS[species] || ETHEREAL_COLORS['Shardkin'];
        
        for (let i = 0; i < count; i++) {
            // Float outward in all directions with upward bias
            const angle = Math.random() * Math.PI * 2;
            const speed = ETHEREAL_PARTICLE_SPEED * (0.5 + Math.random());
            
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed - 0.5; // Slight upward drift
            
            // Select color - mostly species colors, some white
            const color = Math.random() < 0.8
                ? speciesColors[Math.floor(Math.random() * speciesColors.length)]
                : ETHEREAL_COLORS_WHITE[Math.floor(Math.random() * ETHEREAL_COLORS_WHITE.length)];
            
            const lifetime = ETHEREAL_PARTICLE_LIFETIME_MIN + 
                Math.random() * (ETHEREAL_PARTICLE_LIFETIME_MAX - ETHEREAL_PARTICLE_LIFETIME_MIN);
            
            newParticles.push({
                id: `ethereal-${now}-${i}-${Math.random()}`,
                type: 'spark' as const,
                x: x + (Math.random() - 0.5) * 20,
                y: y + (Math.random() - 0.5) * 20,
                vx,
                vy,
                spawnTime: now,
                initialLifetime: lifetime,
                lifetime,
                size: ETHEREAL_PARTICLE_SIZE_MIN + Math.random() * (ETHEREAL_PARTICLE_SIZE_MAX - ETHEREAL_PARTICLE_SIZE_MIN),
                color,
                alpha: 0.9,
            });
        }
        
        return newParticles;
    }, []);
    
    // Main update loop
    useEffect(() => {
        const updateParticles = () => {
            const now = performance.now();
            const deltaTime = now - lastUpdateTimeRef.current;
            lastUpdateTimeRef.current = now;
            
            if (deltaTime <= 0) {
                animationFrameRef.current = requestAnimationFrame(updateParticles);
                return;
            }
            
            const currentParticles = particlesRef.current;
            let liveParticleCount = 0;
            const deltaTimeFactor = deltaTime / 16.667;
            
            // Update existing particles
            for (let i = 0; i < currentParticles.length; i++) {
                const p = currentParticles[i];
                const age = now - p.spawnTime;
                const lifetimeRemaining = p.initialLifetime - age;
                
                if (lifetimeRemaining <= 0) {
                    continue;
                }
                
                // Fade out
                const lifeRatio = Math.max(0, lifetimeRemaining / p.initialLifetime);
                const isBlood = p.id.startsWith('blood-');
                
                if (isBlood) {
                    // Blood: falls with gravity, fades
                    p.x += p.vx * deltaTimeFactor;
                    p.y += p.vy * deltaTimeFactor;
                    p.vy += BLOOD_PARTICLE_GRAVITY * deltaTimeFactor;
                    p.alpha = lifeRatio;
                    
                    // Blood splatters shrink as they hit ground
                    const ageRatio = age / p.initialLifetime;
                    if (ageRatio > 0.5) {
                        p.size = Math.max(1, p.size * 0.98);
                    }
                } else {
                    // Ethereal: floats with sparkle effect
                    const sparkle = 0.6 + 0.4 * Math.sin((now - p.spawnTime) * 0.015);
                    p.x += p.vx * deltaTimeFactor * 0.95; // Slow deceleration
                    p.y += p.vy * deltaTimeFactor * 0.95;
                    p.vx *= 0.995; // Gentle slowdown
                    p.vy *= 0.995;
                    p.alpha = lifeRatio * sparkle;
                    
                    // Ethereal particles grow slightly then shrink
                    const ageRatio = age / p.initialLifetime;
                    if (ageRatio < 0.3) {
                        p.size = Math.min(ETHEREAL_PARTICLE_SIZE_MAX + 2, p.size * 1.01);
                    } else {
                        p.size = Math.max(1, p.size * 0.99);
                    }
                }
                
                p.lifetime = lifetimeRemaining;
                
                if (p.alpha > 0.01) {
                    currentParticles[liveParticleCount++] = p;
                }
            }
            currentParticles.length = liveParticleCount;
            
            // Check for new animal hits
            wildAnimals.forEach((animal, id) => {
                const hitTimeMicros = animal.lastHitTime?.microsSinceUnixEpoch ?? 0n;
                const prevRecord = animalHitRecordsRef.current.get(id);
                
                if (hitTimeMicros > 0n && (!prevRecord || hitTimeMicros > prevRecord.lastHitTimeMicros)) {
                    // New hit detected!
                    const species = (animal.species as any)?.tag || 'Unknown';
                    const isHostile = HOSTILE_SPECIES.includes(species);
                    
                    // Calculate particle count (more damage = more particles)
                    const particleCount = Math.min(
                        MAX_PARTICLES_PER_HIT,
                        BASE_PARTICLE_COUNT + Math.floor(Math.random() * 10)
                    );
                    
                    if (isHostile) {
                        // Ethereal wisps for apparitions
                        const newParticles = generateEtherealParticles(animal.posX, animal.posY, particleCount, species);
                        particlesRef.current.push(...newParticles);
                    } else {
                        // Blood splatter for regular animals
                        const newParticles = generateBloodParticles(animal.posX, animal.posY, particleCount);
                        particlesRef.current.push(...newParticles);
                    }
                    
                    // Update record
                    animalHitRecordsRef.current.set(id, {
                        entityId: id,
                        lastHitTimeMicros: hitTimeMicros,
                    });
                }
            });
            
            // Cleanup old records for animals that no longer exist
            if (animalHitRecordsRef.current.size > wildAnimals.size * 2) {
                const currentIds = new Set(wildAnimals.keys());
                for (const id of Array.from(animalHitRecordsRef.current.keys())) {
                    if (!currentIds.has(id)) {
                        animalHitRecordsRef.current.delete(id);
                    }
                }
            }
            
            // Check for player hits
            if (localPlayer && !localPlayer.isDead) {
                const playerHitTimeMicros = localPlayer.lastHitTime?.microsSinceUnixEpoch ?? 0n;
                
                if (playerHitTimeMicros > 0n && playerHitTimeMicros > playerHitRecordRef.current) {
                    // Player got hit!
                    const particleCount = Math.min(MAX_PARTICLES_PER_HIT, BASE_PARTICLE_COUNT + 5);
                    const newParticles = generateBloodParticles(
                        localPlayer.positionX, 
                        localPlayer.positionY, 
                        particleCount
                    );
                    particlesRef.current.push(...newParticles);
                    playerHitRecordRef.current = playerHitTimeMicros;
                }
            }
            
            animationFrameRef.current = requestAnimationFrame(updateParticles);
        };
        
        animationFrameRef.current = requestAnimationFrame(updateParticles);
        
        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, [wildAnimals, localPlayer, generateBloodParticles, generateEtherealParticles]);
    
    return particlesRef.current;
}
