/**
 * useStructureImpactParticles - Spark/impact effects when structures take damage
 * 
 * Generates orange/yellow spark particles when:
 * - Walls are hit (by players or hostile NPCs)
 * - Doors are hit (by players or hostile NPCs)
 * - Shelters are hit (by hostile NPCs)
 * 
 * This provides crucial visual feedback for base defense, especially when
 * hostile apparitions are attacking structures at night.
 */

import { useEffect, useRef, useCallback } from 'react';
import { Particle } from './useCampfireParticles';
import { WallCell as SpacetimeDBWallCell, Door as SpacetimeDBDoor, Shelter as SpacetimeDBShelter } from '../generated/types';
import { FOUNDATION_TILE_SIZE } from '../config/gameConfig';
import { SHELTER_DIMS } from '../utils/clientCollision';

// --- Spark Particle Constants ---
const SPARK_PARTICLE_LIFETIME_MIN = 150;
const SPARK_PARTICLE_LIFETIME_MAX = 400;
const SPARK_PARTICLE_SPEED = 3.0;
const SPARK_PARTICLE_GRAVITY = 0.2;
const SPARK_PARTICLE_SIZE_MIN = 2;
const SPARK_PARTICLE_SIZE_MAX = 4;

// Spark colors - orange/yellow for metal-on-metal impact
const SPARK_COLORS_HOT = [
    "#FFD700", // Gold
    "#FFA500", // Orange
    "#FF8C00", // Dark orange
    "#FFE4B5", // Moccasin (light)
    "#FFFF00", // Yellow
];

const SPARK_COLORS_COOL = [
    "#FF6347", // Tomato (fading spark)
    "#FF4500", // Orange red
    "#CD853F", // Peru (brown spark)
];

// Particle count per hit
const BASE_SPARK_COUNT = 12;
const MAX_SPARKS_PER_HIT = 20;

// Track processed hits to avoid duplicates
interface StructureHitRecord {
    structureId: string;
    lastHitTimeMicros: bigint;
}

interface UseStructureImpactParticlesProps {
    walls: Map<string, SpacetimeDBWallCell>;
    doors: Map<string, SpacetimeDBDoor>;
    shelters: Map<string, SpacetimeDBShelter>;
}

export function useStructureImpactParticles({
    walls,
    doors,
    shelters,
}: UseStructureImpactParticlesProps): Particle[] {
    const particlesRef = useRef<Particle[]>([]);
    const lastUpdateTimeRef = useRef<number>(performance.now());
    const animationFrameRef = useRef<number>(0);
    
    // Track last known hit times to detect new hits
    const wallHitRecordsRef = useRef<Map<string, StructureHitRecord>>(new Map());
    const doorHitRecordsRef = useRef<Map<string, StructureHitRecord>>(new Map());
    const shelterHitRecordsRef = useRef<Map<string, StructureHitRecord>>(new Map());
    
    // Generate spark particles at structure position
    const generateSparkParticles = useCallback((worldX: number, worldY: number, count: number) => {
        const now = performance.now();
        const newParticles: Particle[] = [];
        
        for (let i = 0; i < count; i++) {
            // Random burst direction (mostly upward and outward)
            const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.5; // Wide upward fan
            const speed = SPARK_PARTICLE_SPEED * (0.5 + Math.random() * 0.8);
            
            const vx = Math.cos(angle) * speed * (Math.random() > 0.5 ? 1 : -1);
            const vy = Math.sin(angle) * speed;
            
            // Select color - mostly hot, some cool
            const color = Math.random() < 0.7 
                ? SPARK_COLORS_HOT[Math.floor(Math.random() * SPARK_COLORS_HOT.length)]
                : SPARK_COLORS_COOL[Math.floor(Math.random() * SPARK_COLORS_COOL.length)];
            
            const lifetime = SPARK_PARTICLE_LIFETIME_MIN + 
                Math.random() * (SPARK_PARTICLE_LIFETIME_MAX - SPARK_PARTICLE_LIFETIME_MIN);
            
            newParticles.push({
                id: `struct-spark-${now}-${i}-${Math.random()}`,
                type: 'spark' as const,
                x: worldX + (Math.random() - 0.5) * 30, // Spread across structure
                y: worldY + (Math.random() - 0.5) * 30,
                vx,
                vy,
                spawnTime: now,
                initialLifetime: lifetime,
                lifetime,
                size: SPARK_PARTICLE_SIZE_MIN + Math.random() * (SPARK_PARTICLE_SIZE_MAX - SPARK_PARTICLE_SIZE_MIN),
                color,
                alpha: 1.0,
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
                
                // Only process structure spark particles (avoid interfering with other particle systems)
                if (!p.id.startsWith('struct-spark-')) {
                    currentParticles[liveParticleCount++] = p;
                    continue;
                }
                
                const age = now - p.spawnTime;
                const lifetimeRemaining = p.initialLifetime - age;
                
                if (lifetimeRemaining <= 0) {
                    continue;
                }
                
                // Spark physics: falls with gravity, fades out
                const lifeRatio = Math.max(0, lifetimeRemaining / p.initialLifetime);
                
                p.x += p.vx * deltaTimeFactor;
                p.y += p.vy * deltaTimeFactor;
                p.vy += SPARK_PARTICLE_GRAVITY * deltaTimeFactor;
                
                // Sparks fade and shrink
                p.alpha = lifeRatio;
                const ageRatio = age / p.initialLifetime;
                if (ageRatio > 0.3) {
                    p.size = Math.max(0.5, p.size * 0.97);
                }
                
                // Sparks slow down from air resistance
                p.vx *= 0.98;
                
                p.lifetime = lifetimeRemaining;
                
                if (p.alpha > 0.01) {
                    currentParticles[liveParticleCount++] = p;
                }
            }
            currentParticles.length = liveParticleCount;
            
            // Check for new wall hits
            walls.forEach((wall, id) => {
                if (wall.isDestroyed) return;
                
                const hitTimeMicros = wall.lastHitTime?.microsSinceUnixEpoch ?? 0n;
                const prevRecord = wallHitRecordsRef.current.get(id);
                
                if (hitTimeMicros > 0n && (!prevRecord || hitTimeMicros > prevRecord.lastHitTimeMicros)) {
                    // New hit detected!
                    // Calculate world position from cell coordinates
                    const worldX = (wall.cellX * FOUNDATION_TILE_SIZE) + (FOUNDATION_TILE_SIZE / 2);
                    const worldY = (wall.cellY * FOUNDATION_TILE_SIZE) + (FOUNDATION_TILE_SIZE / 2);
                    
                    const sparkCount = BASE_SPARK_COUNT + Math.floor(Math.random() * 8);
                    const newParticles = generateSparkParticles(worldX, worldY, Math.min(sparkCount, MAX_SPARKS_PER_HIT));
                    particlesRef.current.push(...newParticles);
                    
                    // Update record
                    wallHitRecordsRef.current.set(id, {
                        structureId: id,
                        lastHitTimeMicros: hitTimeMicros,
                    });
                }
            });
            
            // Check for new door hits
            doors.forEach((door, id) => {
                if (door.isDestroyed) return;
                
                const hitTimeMicros = door.lastHitTime?.microsSinceUnixEpoch ?? 0n;
                const prevRecord = doorHitRecordsRef.current.get(id);
                
                if (hitTimeMicros > 0n && (!prevRecord || hitTimeMicros > prevRecord.lastHitTimeMicros)) {
                    // New hit detected!
                    // Calculate world position from cell coordinates
                    const worldX = (door.cellX * FOUNDATION_TILE_SIZE) + (FOUNDATION_TILE_SIZE / 2);
                    const worldY = (door.cellY * FOUNDATION_TILE_SIZE) + (FOUNDATION_TILE_SIZE / 2);
                    
                    const sparkCount = BASE_SPARK_COUNT + Math.floor(Math.random() * 8);
                    const newParticles = generateSparkParticles(worldX, worldY, Math.min(sparkCount, MAX_SPARKS_PER_HIT));
                    particlesRef.current.push(...newParticles);
                    
                    // Update record
                    doorHitRecordsRef.current.set(id, {
                        structureId: id,
                        lastHitTimeMicros: hitTimeMicros,
                    });
                }
            });
            
            // Check for new shelter hits
            shelters.forEach((shelter, id) => {
                if (shelter.isDestroyed) return;
                
                const hitTimeMicros = shelter.lastHitTime?.microsSinceUnixEpoch ?? 0n;
                const prevRecord = shelterHitRecordsRef.current.get(id);
                
                if (hitTimeMicros > 0n && (!prevRecord || hitTimeMicros > prevRecord.lastHitTimeMicros)) {
                    // New hit detected!
                    // Use AABB collision center for sparks (matches attack detection position)
                    // This is where the actual collision/interaction happens, not the base posY
                    const worldX = shelter.posX;
                    const worldY = shelter.posY - SHELTER_DIMS.AABB_CENTER_Y_OFFSET_FROM_POS_Y;
                    
                    const sparkCount = BASE_SPARK_COUNT + Math.floor(Math.random() * 8);
                    const newParticles = generateSparkParticles(worldX, worldY, Math.min(sparkCount, MAX_SPARKS_PER_HIT));
                    particlesRef.current.push(...newParticles);
                    
                    // Update record
                    shelterHitRecordsRef.current.set(id, {
                        structureId: id,
                        lastHitTimeMicros: hitTimeMicros,
                    });
                }
            });
            
            // Cleanup old records for structures that no longer exist
            if (wallHitRecordsRef.current.size > walls.size * 2) {
                const currentIds = new Set(walls.keys());
                for (const id of Array.from(wallHitRecordsRef.current.keys())) {
                    if (!currentIds.has(id)) {
                        wallHitRecordsRef.current.delete(id);
                    }
                }
            }
            if (doorHitRecordsRef.current.size > doors.size * 2) {
                const currentIds = new Set(doors.keys());
                for (const id of Array.from(doorHitRecordsRef.current.keys())) {
                    if (!currentIds.has(id)) {
                        doorHitRecordsRef.current.delete(id);
                    }
                }
            }
            if (shelterHitRecordsRef.current.size > shelters.size * 2) {
                const currentIds = new Set(shelters.keys());
                for (const id of Array.from(shelterHitRecordsRef.current.keys())) {
                    if (!currentIds.has(id)) {
                        shelterHitRecordsRef.current.delete(id);
                    }
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
    }, [walls, doors, shelters, generateSparkParticles]);
    
    return particlesRef.current;
}
