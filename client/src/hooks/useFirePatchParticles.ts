import { useEffect, useRef } from 'react';
import { FirePatch as SpacetimeDBFirePatch, Player as SpacetimeDBPlayer } from '../generated/types';
import { FIRE_PATCH_VISUAL_RADIUS } from '../utils/renderers/firePatchRenderingUtils';

// --- Particle System Types and Constants ---
export interface Particle {
  id: string;
  type: 'fire' | 'smoke' | 'smoke_burst';
  x: number; // world X
  y: number; // world Y
  vx: number;
  vy: number;
  spawnTime: number;
  initialLifetime: number;
  lifetime: number; // remaining lifetime
  size: number;
  color?: string;
  alpha: number;
}

// Use same particle constants as campfires for consistent visual style
const PARTICLE_FIRE_LIFETIME_MIN = 80;
const PARTICLE_FIRE_LIFETIME_MAX = 200;
const PARTICLE_FIRE_SPEED_Y_MIN = -0.60;
const PARTICLE_FIRE_SPEED_Y_MAX = -0.75;
const PARTICLE_FIRE_SPEED_X_SPREAD = 0.8;
const PARTICLE_FIRE_SIZE_MIN = 2; 
const PARTICLE_FIRE_SIZE_MAX = 4;
const PARTICLE_FIRE_COLORS = ["#FFD878", "#FFB04A", "#FF783C", "#FC9842"];
const FIRE_PARTICLES_PER_FIRE_PATCH_FRAME = 0.8;

const PARTICLE_SMOKE_LIFETIME_MIN = 800;
const PARTICLE_SMOKE_LIFETIME_MAX = 1800;
const PARTICLE_SMOKE_SPEED_Y_MIN = -0.1;
const PARTICLE_SMOKE_SPEED_Y_MAX = -0.3;
const PARTICLE_SMOKE_SPEED_X_SPREAD = 0.4;
const PARTICLE_SMOKE_SIZE_MIN = 3;
const PARTICLE_SMOKE_SIZE_MAX = 5;
const PARTICLE_SMOKE_GROWTH_RATE = 0.03;
const SMOKE_PARTICLES_PER_FIRE_PATCH_FRAME = 0.3;
const SMOKE_INITIAL_ALPHA = 0.6;
const SMOKE_TARGET_ALPHA = 0.05;

const PARTICLE_SMOKE_COLORS = ["#666666", "#777777", "#888888", "#999999", "#555555"];

// Black smoke burst when player is on fire patch (same as campfire)
const SMOKE_BURST_COLORS = ["#1a1a1a", "#2a2a2a", "#333333", "#000000"];
const SMOKE_BURST_LIFETIME_MIN = 600;
const SMOKE_BURST_LIFETIME_MAX = 1500;
const SMOKE_BURST_SPEED_X_SPREAD = 0.5;
const SMOKE_BURST_SPEED_Y_MIN = -0.2;
const SMOKE_BURST_SPEED_Y_MAX = -0.5;
const SMOKE_BURST_SIZE_MIN = 3;
const SMOKE_BURST_SIZE_MAX = 6;
const SMOKE_BURST_INITIAL_ALPHA = 0.9;

// Fire emission zones (same structure as campfire)
const FIRE_EMISSION_ZONES = [
    {
        name: 'top',
        yOffset: -10, // Top flames
        emissionRate: 0.4,
        spread: { x: 6, y: 3 },
        speedMultiplier: 1.0
    },
    {
        name: 'middle',
        yOffset: 0, // Middle flames
        emissionRate: 0.3,
        spread: { x: 10, y: 5 },
        speedMultiplier: 0.8
    },
    {
        name: 'base',
        yOffset: 5, // Base flames
        emissionRate: 0.15,
        spread: { x: 12, y: 6 },
        speedMultiplier: 0.6
    }
];

interface UseFirePatchParticlesProps {
    visibleFirePatchesMap: Map<string, SpacetimeDBFirePatch>;
    localPlayer: SpacetimeDBPlayer | null;
}

export function useFirePatchParticles({
    visibleFirePatchesMap,
    localPlayer,
}: UseFirePatchParticlesProps): Particle[] {
    const particlesRef = useRef<Particle[]>([]);
    
    const fireEmissionAccumulatorRef = useRef<Map<string, number>>(new Map());
    const smokeEmissionAccumulatorRef = useRef<Map<string, number>>(new Map());
    const smokeBurstEmissionAccumulatorRef = useRef<Map<string, number>>(new Map());
    const lastUpdateTimeRef = useRef<number>(performance.now());
    const animationFrameRef = useRef<number>(0);

    // Update particles using independent timing
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

            const deltaTimeFactor = deltaTime / 16.667; // Normalize to 60fps

            // Update existing particles
            for (let i = 0; i < currentParticles.length; i++) {
                const p = currentParticles[i];
                const age = now - p.spawnTime;
                const lifetimeRemaining = p.initialLifetime - age;

                if (lifetimeRemaining <= 0) {
                    continue;
                }

                let newVx = p.vx;
                let newVy = p.vy;
                let newSize = p.size;
                let currentAlpha = p.alpha;

                if (p.type === 'smoke') {
                    newVy -= 0.003 * deltaTimeFactor;
                    newSize = Math.min(p.size + PARTICLE_SMOKE_GROWTH_RATE * deltaTimeFactor, PARTICLE_SMOKE_SIZE_MAX);
                    const lifeRatio = Math.max(0, lifetimeRemaining / p.initialLifetime);
                    currentAlpha = SMOKE_TARGET_ALPHA + (SMOKE_INITIAL_ALPHA - SMOKE_TARGET_ALPHA) * lifeRatio;
                } else if (p.type === 'fire') {
                     const lifeRatio = Math.max(0, lifetimeRemaining / p.initialLifetime);
                     currentAlpha = lifeRatio; 
                } else if (p.type === 'smoke_burst') {
                    newVy -= 0.0015 * deltaTimeFactor;
                    const lifeRatio = Math.max(0, lifetimeRemaining / p.initialLifetime);
                    currentAlpha = SMOKE_TARGET_ALPHA + ((SMOKE_INITIAL_ALPHA + 0.4) - SMOKE_TARGET_ALPHA) * lifeRatio;
                }

                p.x += newVx * deltaTimeFactor;
                p.y += newVy * deltaTimeFactor;
                p.lifetime = lifetimeRemaining;
                p.size = newSize;
                p.alpha = Math.max(0, Math.min(1, currentAlpha));

                if (p.alpha > 0.01) {
                    currentParticles[liveParticleCount++] = p;
                }
            }
            currentParticles.length = liveParticleCount;

            const newGeneratedParticles: Particle[] = [];
            const currentVisibleFirePatchIds = new Set<string>();

            // Check if local player is near any fire patch for smoke burst
            const playerX = localPlayer?.positionX ?? 0;
            const playerY = localPlayer?.positionY ?? 0;
            const PLAYER_IN_FIRE_DISTANCE_SQ = 30 * 30; // Similar to campfire hot zone

            if (visibleFirePatchesMap) {
                visibleFirePatchesMap.forEach((firePatch, firePatchId) => {
                    currentVisibleFirePatchIds.add(firePatchId);

                    // Fire patches are always "burning" (no on/off state like campfires)
                    const visualCenterX = firePatch.posX;
                    const visualCenterY = firePatch.posY;

                    // Check if player is standing on this fire patch
                    const dx = playerX - firePatch.posX;
                    const dy = playerY - firePatch.posY;
                    const distSq = dx * dx + dy * dy;
                    const isPlayerOnFire = localPlayer && !localPlayer.isDead && distSq < PLAYER_IN_FIRE_DISTANCE_SQ;

                    // Generate fire particles from multiple zones
                    FIRE_EMISSION_ZONES.forEach((zone) => {
                        let fireAcc = fireEmissionAccumulatorRef.current.get(`${firePatchId}_${zone.name}`) || 0;
                        fireAcc += zone.emissionRate * deltaTimeFactor;
                        
                        while (fireAcc >= 1) {
                            fireAcc -= 1;
                            const lifetime = PARTICLE_FIRE_LIFETIME_MIN + Math.random() * (PARTICLE_FIRE_LIFETIME_MAX - PARTICLE_FIRE_LIFETIME_MIN);
                            
                            const zoneEmissionX = visualCenterX;
                            const zoneEmissionY = visualCenterY + zone.yOffset;
                            
                            newGeneratedParticles.push({
                                id: `fire_${zone.name}_${now}_${Math.random()}`, 
                                type: 'fire',
                                x: zoneEmissionX + (Math.random() - 0.5) * zone.spread.x,
                                y: zoneEmissionY + (Math.random() - 0.5) * zone.spread.y,
                                vx: (Math.random() - 0.5) * PARTICLE_FIRE_SPEED_X_SPREAD,
                                vy: (PARTICLE_FIRE_SPEED_Y_MIN + Math.random() * (PARTICLE_FIRE_SPEED_Y_MAX - PARTICLE_FIRE_SPEED_Y_MIN)) * zone.speedMultiplier,
                                spawnTime: now, 
                                initialLifetime: lifetime, 
                                lifetime,
                                size: Math.floor(PARTICLE_FIRE_SIZE_MIN + Math.random() * (PARTICLE_FIRE_SIZE_MAX - PARTICLE_FIRE_SIZE_MIN)) + 1,
                                color: PARTICLE_FIRE_COLORS[Math.floor(Math.random() * PARTICLE_FIRE_COLORS.length)],
                                alpha: 1.0, 
                            });
                        }
                        fireEmissionAccumulatorRef.current.set(`${firePatchId}_${zone.name}`, fireAcc);
                    });

                    // Generate smoke particles
                    let smokeAcc = smokeEmissionAccumulatorRef.current.get(firePatchId) || 0;
                    smokeAcc += SMOKE_PARTICLES_PER_FIRE_PATCH_FRAME * deltaTimeFactor;
                    while (smokeAcc >= 1) {
                        smokeAcc -= 1;
                        const lifetime = PARTICLE_SMOKE_LIFETIME_MIN + Math.random() * (PARTICLE_SMOKE_LIFETIME_MAX - PARTICLE_SMOKE_LIFETIME_MIN);
                        newGeneratedParticles.push({
                            id: `smoke_${now}_${Math.random()}`, 
                            type: 'smoke',
                            x: visualCenterX + (Math.random() - 0.5) * 8,
                            y: visualCenterY + (Math.random() - 0.5) * 6,
                            vx: (Math.random() - 0.5) * PARTICLE_SMOKE_SPEED_X_SPREAD,
                            vy: PARTICLE_SMOKE_SPEED_Y_MIN + Math.random() * (PARTICLE_SMOKE_SPEED_Y_MAX - PARTICLE_SMOKE_SPEED_Y_MIN),
                            spawnTime: now, 
                            initialLifetime: lifetime, 
                            lifetime,
                            size: Math.floor(PARTICLE_SMOKE_SIZE_MIN + Math.random() * (PARTICLE_SMOKE_SIZE_MAX - PARTICLE_SMOKE_SIZE_MIN)) + 1,
                            color: PARTICLE_SMOKE_COLORS[Math.floor(Math.random() * PARTICLE_SMOKE_COLORS.length)],
                            alpha: SMOKE_INITIAL_ALPHA,
                        });
                    }
                    smokeEmissionAccumulatorRef.current.set(firePatchId, smokeAcc);

                    // Generate black smoke burst if player is on fire patch
                    if (isPlayerOnFire) {
                        let burstAcc = smokeBurstEmissionAccumulatorRef.current.get(firePatchId) || 0;
                        burstAcc += 4.0 * deltaTimeFactor; // High emission rate for dramatic effect
                        while (burstAcc >= 1) {
                            burstAcc -= 1;
                            const lifetime = SMOKE_BURST_LIFETIME_MIN + Math.random() * (SMOKE_BURST_LIFETIME_MAX - SMOKE_BURST_LIFETIME_MIN);
                            newGeneratedParticles.push({
                                id: `smokeburst_${firePatchId}_${now}_${Math.random()}`,
                                type: 'smoke_burst',
                                x: visualCenterX + (Math.random() - 0.5) * 20,
                                y: visualCenterY + (Math.random() - 0.5) * 16,
                                vx: (Math.random() - 0.5) * SMOKE_BURST_SPEED_X_SPREAD,
                                vy: SMOKE_BURST_SPEED_Y_MIN + Math.random() * (SMOKE_BURST_SPEED_Y_MAX - SMOKE_BURST_SPEED_Y_MIN),
                                spawnTime: now, 
                                initialLifetime: lifetime, 
                                lifetime,
                                size: SMOKE_BURST_SIZE_MIN + Math.floor(Math.random() * (SMOKE_BURST_SIZE_MAX - SMOKE_BURST_SIZE_MIN + 1)),
                                color: SMOKE_BURST_COLORS[Math.floor(Math.random() * SMOKE_BURST_COLORS.length)],
                                alpha: SMOKE_BURST_INITIAL_ALPHA,
                            });
                        }
                        smokeBurstEmissionAccumulatorRef.current.set(firePatchId, burstAcc);
                    } else {
                        smokeBurstEmissionAccumulatorRef.current.set(firePatchId, 0);
                    }
                });
            }

            // Cleanup refs for fire patches no longer visible
            fireEmissionAccumulatorRef.current.forEach((_, key) => {
                const firePatchId = key.split('_')[0];
                if (!currentVisibleFirePatchIds.has(firePatchId)) {
                    fireEmissionAccumulatorRef.current.delete(key);
                }
            });
            smokeEmissionAccumulatorRef.current.forEach((_, firePatchId) => {
                if (!currentVisibleFirePatchIds.has(firePatchId)) {
                    smokeEmissionAccumulatorRef.current.delete(firePatchId);
                }
            });
            smokeBurstEmissionAccumulatorRef.current.forEach((_, firePatchId) => {
                if (!currentVisibleFirePatchIds.has(firePatchId)) {
                    smokeBurstEmissionAccumulatorRef.current.delete(firePatchId);
                }
            });

            if (newGeneratedParticles.length > 0) {
                particlesRef.current = currentParticles.concat(newGeneratedParticles);
            } else {
                particlesRef.current = currentParticles;
            }

            animationFrameRef.current = requestAnimationFrame(updateParticles);
        };

        lastUpdateTimeRef.current = performance.now();
        animationFrameRef.current = requestAnimationFrame(updateParticles);

        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, [visibleFirePatchesMap, localPlayer]);

    return particlesRef.current;
}

