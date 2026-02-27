import { useEffect, useRef } from 'react';
import { Lantern as SpacetimeDBLantern } from '../generated/types';
import { Particle } from './useCampfireParticles';
import { 
    LANTERN_TYPE_ANCESTRAL_WARD, 
    LANTERN_TYPE_SIGNAL_DISRUPTOR, 
    LANTERN_TYPE_MEMORY_BEACON,
    LANTERN_RENDER_Y_OFFSET,
    getLanternDimensions
} from '../utils/renderers/lanternRenderingUtils';

// ============================================================================
// WARD PARTICLE SYSTEM
// ============================================================================
// Each ward type has unique AAA pixel-art style particle effects when active:
// - Ancestral Ward: Warm tallow smoke (brown/amber wisps rising gently)
// - Signal Disruptor: Electrical static (cyan/white sparks that flicker)
// - Memory Resonance Beacon: Ethereal memory glow (purple/blue particles floating)
// ============================================================================

// === ANCESTRAL WARD SMOKE WISPS (Tallow burning - Simple & Effective) ===
const TALLOW_SMOKE_CORE_COLORS = ["#A08060", "#9C8C70", "#8B7355"];
const TALLOW_SMOKE_CORE_LIFETIME_MIN = 3000;
const TALLOW_SMOKE_CORE_LIFETIME_MAX = 5000;
const TALLOW_SMOKE_CORE_SPEED_Y_MIN = -0.15; // Faster rise
const TALLOW_SMOKE_CORE_SPEED_Y_MAX = -0.25;
const TALLOW_SMOKE_CORE_SIZE_MIN = 4;
const TALLOW_SMOKE_CORE_SIZE_MAX = 8; // Larger puffs
const TALLOW_SMOKE_CORE_EMISSION_RATE = 0.8; // Lower rate, better quality
const TALLOW_SMOKE_CORE_INITIAL_ALPHA = 0.45;

const TALLOW_SMOKE_GROWTH_RATE = 0.02; // Grow as it rises
const TALLOW_SMOKE_X_DRIFT_SPEED = 0.002;

// Smoke emission position
const ANCESTRAL_WARD_SMOKE_Y_OFFSET_FACTOR = 0.55;
const ANCESTRAL_WARD_SMOKE_Y_DROP_OFFSET = 55;
const ANCESTRAL_WARD_SMOKE_X_OFFSET = -8; // Smoke offset left

// === ANCESTRAL WARD FIRE (Continuous flames) ===
const TALLOW_FIRE_CORE_COLORS = ["#FFEE99", "#FFE066", "#FFD633"];
const TALLOW_FIRE_CORE_LIFETIME_MIN = 400; // LONGER lifetime to prevent gaps
const TALLOW_FIRE_CORE_LIFETIME_MAX = 600;
const TALLOW_FIRE_CORE_SPEED_Y_MIN = -0.3;
const TALLOW_FIRE_CORE_SPEED_Y_MAX = -0.5;
const TALLOW_FIRE_CORE_SIZE_MIN = 3;
const TALLOW_FIRE_CORE_SIZE_MAX = 5;
const TALLOW_FIRE_CORE_EMISSION_RATE = 2.5; // High rate for continuity

const TALLOW_FIRE_MID_COLORS = ["#FFB04A", "#FFA030", "#FF9020"];
const TALLOW_FIRE_MID_LIFETIME_MIN = 500;
const TALLOW_FIRE_MID_LIFETIME_MAX = 800;
const TALLOW_FIRE_MID_EMISSION_RATE = 1.5;

const TALLOW_FIRE_OUTER_COLORS = ["#FF783C", "#FF6030", "#FC9842"];
const TALLOW_FIRE_OUTER_LIFETIME_MIN = 600;
const TALLOW_FIRE_OUTER_LIFETIME_MAX = 1000;
const TALLOW_FIRE_OUTER_EMISSION_RATE = 1.0;

// LAYER 4: Embers (tiny sparks that rise)
const TALLOW_EMBER_COLORS = ["#FFCC00", "#FF8800", "#FFAA22"];
const TALLOW_EMBER_LIFETIME_MIN = 400;
const TALLOW_EMBER_LIFETIME_MAX = 700;
const TALLOW_EMBER_SPEED_Y_MIN = -0.15;
const TALLOW_EMBER_SPEED_Y_MAX = -0.35;
const TALLOW_EMBER_SIZE = 1;
const TALLOW_EMBER_EMISSION_RATE = 1.5;

// Fire emission position
const TALLOW_FIRE_BASE_Y_OFFSET = -50;
const TALLOW_FIRE_X_OFFSET = -10;
const TALLOW_FIRE_Y_OFFSET_UP = -20;
const TALLOW_FIRE_X_SPREAD = 14;  // Horizontal spread of fire
const TALLOW_FIRE_SPEED_X_SPREAD = 0.3;

// === SIGNAL DISRUPTOR STATIC (Electrical interference) ===
// Sharp, crackling static electricity
const STATIC_COLORS = ["#00FFFF", "#FFFFFF", "#88FFFF", "#AAFFFF", "#66DDFF"];
const STATIC_LIFETIME_MIN = 50;
const STATIC_LIFETIME_MAX = 150;
const STATIC_SPEED_Y_MIN = -0.5;
const STATIC_SPEED_Y_MAX = -1.2;
const STATIC_SPEED_X_SPREAD = 0.8;
const STATIC_SIZE_MIN = 1;
const STATIC_SIZE_MAX = 2;
const STATIC_EMISSION_RATE = 0.6;
const STATIC_INITIAL_ALPHA = 1.0;

// === SIGNAL DISRUPTOR FURNACE FIRE (Bottom oven area) ===
// The signal disruptor has a furnace/oven at the bottom that needs fire particles
const DISRUPTOR_FIRE_CORE_COLORS = ["#FFEE99", "#FFE066", "#FFD633", "#FF9933"];
const DISRUPTOR_FIRE_CORE_LIFETIME_MIN = 350;
const DISRUPTOR_FIRE_CORE_LIFETIME_MAX = 550;
const DISRUPTOR_FIRE_CORE_SIZE_MIN = 3;
const DISRUPTOR_FIRE_CORE_SIZE_MAX = 5;
const DISRUPTOR_FIRE_CORE_EMISSION_RATE = 2.0;

const DISRUPTOR_FIRE_MID_COLORS = ["#FFB04A", "#FFA030", "#FF9020"];
const DISRUPTOR_FIRE_MID_LIFETIME_MIN = 400;
const DISRUPTOR_FIRE_MID_LIFETIME_MAX = 650;
const DISRUPTOR_FIRE_MID_EMISSION_RATE = 1.2;

// Furnace position - bottom-left oven area of the signal disruptor sprite
// Pushed left and up to align with the furnace opening in the sprite
const DISRUPTOR_FURNACE_Y_OFFSET = -60; // Offset from posY - pushed UP
const DISRUPTOR_FURNACE_X_OFFSET = -25; // Pushed LEFT to align with furnace opening
const DISRUPTOR_FURNACE_X_SPREAD = 25;  // Slightly tighter horizontal spread

// === MEMORY RESONANCE BEACON (Ethereal memory particles) ===
// Soft, mystical purple/blue glow particles
const MEMORY_COLORS = ["#9966FF", "#7744DD", "#AA88FF", "#6633CC", "#BB99FF", "#5522AA"];
const MEMORY_LIFETIME_MIN = 800;
const MEMORY_LIFETIME_MAX = 1800;
const MEMORY_SPEED_Y_MIN = -0.04;
const MEMORY_SPEED_Y_MAX = -0.12;
const MEMORY_SPEED_X_SPREAD = 0.2;
const MEMORY_SIZE_MIN = 2;
const MEMORY_SIZE_MAX = 5;
const MEMORY_EMISSION_RATE = 0.35;
const MEMORY_INITIAL_ALPHA = 0.7;
const MEMORY_PULSE_SPEED = 0.003; // For gentle pulsing effect

// Particle emission Y offset factor from visual center (relative to height)
const WARD_EMISSION_Y_OFFSET_FACTOR = 0.3;

interface UseWardParticlesProps {
    visibleLanternsMap: Map<string, SpacetimeDBLantern>;
    deltaTime: number;
}

export function useWardParticles({
    visibleLanternsMap,
    deltaTime,
}: UseWardParticlesProps): Particle[] {
    const particlesRef = useRef<Particle[]>([]);
    const emissionAccumulatorRef = useRef<Map<string, number>>(new Map());
    const lastUpdateTimeRef = useRef<number>(performance.now());
    const animationFrameRef = useRef<number>(0);

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

                if (lifetimeRemaining <= 0) continue;

                let newVx = p.vx;
                let newVy = p.vy;
                let newSize = p.size;
                let currentAlpha = p.alpha;

                // === TALLOW SMOKE BEHAVIOR (simple rising puffs) ===
                if (p.id.startsWith('tallowcore_')) {
                    // Constant upward rise
                    newVy -= 0.001 * deltaTimeFactor;
                    // Sinusoidal horizontal drift for organic movement
                    const driftPhase = now * TALLOW_SMOKE_X_DRIFT_SPEED + parseFloat(p.id.slice(-6)) * 0.3;
                    newVx = Math.sin(driftPhase) * 0.05;
                    // Grow as it rises
                    newSize = Math.min(p.size + TALLOW_SMOKE_GROWTH_RATE * deltaTimeFactor, TALLOW_SMOKE_CORE_SIZE_MAX * 2.5);
                    // Linear fade
                    const lifeRatio = Math.max(0, lifetimeRemaining / p.initialLifetime);
                    currentAlpha = TALLOW_SMOKE_CORE_INITIAL_ALPHA * lifeRatio;
                }
                // === TALLOW FIRE BEHAVIOR ===
                else if (p.id.startsWith('tallowfirecore_') || p.id.startsWith('tallowfiremid_') || p.id.startsWith('tallowfireouter_')) {
                    const lifeRatio = Math.max(0, lifetimeRemaining / p.initialLifetime);
                    newVy -= 0.002 * deltaTimeFactor;
                    newVx += (Math.random() - 0.5) * 0.1 * deltaTimeFactor;
                    currentAlpha = lifeRatio;
                }
                // === DISRUPTOR FURNACE FIRE BEHAVIOR ===
                else if (p.id.startsWith('disruptorfirecore_') || p.id.startsWith('disruptorfiremid_')) {
                    const lifeRatio = Math.max(0, lifetimeRemaining / p.initialLifetime);
                    newVy -= 0.002 * deltaTimeFactor;
                    newVx += (Math.random() - 0.5) * 0.08 * deltaTimeFactor;
                    currentAlpha = lifeRatio;
                }
                // === TALLOW EMBER BEHAVIOR (rising sparks) ===
                else if (p.id.startsWith('tallowember_')) {
                    const lifeRatio = Math.max(0, lifetimeRemaining / p.initialLifetime);
                    // Embers drift and wobble
                    newVx += Math.sin(now * 0.01 + parseFloat(p.id.slice(-4))) * 0.02 * deltaTimeFactor;
                    // Slight upward acceleration
                    newVy -= 0.001 * deltaTimeFactor;
                    // Flicker effect
                    currentAlpha = lifeRatio * (0.6 + Math.random() * 0.4);
                }
                // === STATIC BEHAVIOR ===
                else if (p.id.startsWith('static_')) {
                    // Jittery movement - random direction changes
                    newVx += (Math.random() - 0.5) * 0.3 * deltaTimeFactor;
                    newVy += (Math.random() - 0.5) * 0.2 * deltaTimeFactor;
                    // Quick fade
                    const lifeRatio = Math.max(0, lifetimeRemaining / p.initialLifetime);
                    currentAlpha = STATIC_INITIAL_ALPHA * lifeRatio;
                    // Flicker effect - random alpha spikes
                    if (Math.random() < 0.1) {
                        currentAlpha = Math.min(1.0, currentAlpha * (1.5 + Math.random()));
                    }
                }
                // === MEMORY PARTICLE BEHAVIOR ===
                else if (p.id.startsWith('memory_')) {
                    // Gentle floating upward with ethereal drift
                    newVy -= 0.001 * deltaTimeFactor;
                    // Circular/floating motion
                    const floatPhase = now * 0.002 + parseFloat(p.id.slice(-6)) * 0.5;
                    newVx = Math.sin(floatPhase) * 0.05;
                    // Pulsing glow effect
                    const lifeRatio = Math.max(0, lifetimeRemaining / p.initialLifetime);
                    const pulse = 0.7 + Math.sin(now * MEMORY_PULSE_SPEED + parseFloat(p.id.slice(-6))) * 0.3;
                    currentAlpha = MEMORY_INITIAL_ALPHA * lifeRatio * pulse;
                    // Slight size pulsing
                    newSize = p.size * (0.9 + Math.sin(now * MEMORY_PULSE_SPEED * 2) * 0.1);
                }

                // Apply movement
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

            // Generate new particles for active wards
            const newGeneratedParticles: Particle[] = [];
            const currentWardIds = new Set<string>();

            if (visibleLanternsMap) {
                visibleLanternsMap.forEach((lantern, lanternId) => {
                    // Only generate particles for wards (not regular lanterns) that are active
                    if (lantern.lanternType === 0 || !lantern.isBurning || lantern.isDestroyed) {
                        return;
                    }

                    currentWardIds.add(lanternId);

                    // Get dynamic dimensions based on ward type
                    const { height: wardHeight } = getLanternDimensions(lantern.lanternType);
                    
                    // Calculate visual center for particle emission using dynamic height
                    const visualCenterX = lantern.posX;
                    const visualCenterY = lantern.posY - (wardHeight / 2) - LANTERN_RENDER_Y_OFFSET;
                    const emissionX = visualCenterX;
                    // Default emission Y for Signal Disruptor and Memory Beacon
                    const emissionY = visualCenterY - (wardHeight * WARD_EMISSION_Y_OFFSET_FACTOR);

                    // === ANCESTRAL WARD - Simple Tallow Smoke & Fire ===
                    if (lantern.lanternType === LANTERN_TYPE_ANCESTRAL_WARD) {
                        const smokeEmissionY = visualCenterY - (wardHeight * ANCESTRAL_WARD_SMOKE_Y_OFFSET_FACTOR) + ANCESTRAL_WARD_SMOKE_Y_DROP_OFFSET;
                        const smokeEmissionX = emissionX + ANCESTRAL_WARD_SMOKE_X_OFFSET;
                        const fireEmissionX = emissionX + TALLOW_FIRE_X_OFFSET;
                        const fireEmissionY = lantern.posY + TALLOW_FIRE_BASE_Y_OFFSET + TALLOW_FIRE_Y_OFFSET_UP;
                        
                        // ========== SMOKE PUFFS ==========
                        let coreAcc = emissionAccumulatorRef.current.get(`${lanternId}_tallowcore`) || 0;
                        coreAcc += TALLOW_SMOKE_CORE_EMISSION_RATE * deltaTimeFactor;
                        while (coreAcc >= 1) {
                            coreAcc -= 1;
                            const lifetime = TALLOW_SMOKE_CORE_LIFETIME_MIN + Math.random() * (TALLOW_SMOKE_CORE_LIFETIME_MAX - TALLOW_SMOKE_CORE_LIFETIME_MIN);
                            newGeneratedParticles.push({
                                id: `tallowcore_${now}_${Math.random()}`,
                                type: 'smoke',
                                x: smokeEmissionX + (Math.random() - 0.5) * 6,
                                y: smokeEmissionY,
                                vx: (Math.random() - 0.5) * 0.1,
                                vy: TALLOW_SMOKE_CORE_SPEED_Y_MIN + Math.random() * (TALLOW_SMOKE_CORE_SPEED_Y_MAX - TALLOW_SMOKE_CORE_SPEED_Y_MIN),
                                spawnTime: now,
                                initialLifetime: lifetime,
                                lifetime,
                                size: TALLOW_SMOKE_CORE_SIZE_MIN + Math.random() * (TALLOW_SMOKE_CORE_SIZE_MAX - TALLOW_SMOKE_CORE_SIZE_MIN),
                                color: TALLOW_SMOKE_CORE_COLORS[Math.floor(Math.random() * TALLOW_SMOKE_CORE_COLORS.length)],
                                alpha: TALLOW_SMOKE_CORE_INITIAL_ALPHA,
                            });
                        }
                        emissionAccumulatorRef.current.set(`${lanternId}_tallowcore`, coreAcc);

                        // ========== FIRE CORE ==========
                        let fireCoreAcc = emissionAccumulatorRef.current.get(`${lanternId}_tallowfirecore`) || 0;
                        fireCoreAcc += TALLOW_FIRE_CORE_EMISSION_RATE * deltaTimeFactor;
                        while (fireCoreAcc >= 1) {
                            fireCoreAcc -= 1;
                            const lifetime = TALLOW_FIRE_CORE_LIFETIME_MIN + Math.random() * (TALLOW_FIRE_CORE_LIFETIME_MAX - TALLOW_FIRE_CORE_LIFETIME_MIN);
                            newGeneratedParticles.push({
                                id: `tallowfirecore_${now}_${Math.random()}`,
                                type: 'fire',
                                x: fireEmissionX + (Math.random() - 0.5) * 8,
                                y: fireEmissionY,
                                vx: (Math.random() - 0.5) * 0.2,
                                vy: TALLOW_FIRE_CORE_SPEED_Y_MIN + Math.random() * (TALLOW_FIRE_CORE_SPEED_Y_MAX - TALLOW_FIRE_CORE_SPEED_Y_MIN),
                                spawnTime: now,
                                initialLifetime: lifetime,
                                lifetime,
                                size: TALLOW_FIRE_CORE_SIZE_MIN + Math.random() * (TALLOW_FIRE_CORE_SIZE_MAX - TALLOW_FIRE_CORE_SIZE_MIN),
                                color: TALLOW_FIRE_CORE_COLORS[Math.floor(Math.random() * TALLOW_FIRE_CORE_COLORS.length)],
                                alpha: 1.0,
                            });
                        }
                        emissionAccumulatorRef.current.set(`${lanternId}_tallowfirecore`, fireCoreAcc);

                        // ========== FIRE MID ==========
                        let fireMidAcc = emissionAccumulatorRef.current.get(`${lanternId}_tallowfiremid`) || 0;
                        fireMidAcc += TALLOW_FIRE_MID_EMISSION_RATE * deltaTimeFactor;
                        while (fireMidAcc >= 1) {
                            fireMidAcc -= 1;
                            const lifetime = TALLOW_FIRE_MID_LIFETIME_MIN + Math.random() * (TALLOW_FIRE_MID_LIFETIME_MAX - TALLOW_FIRE_MID_LIFETIME_MIN);
                            newGeneratedParticles.push({
                                id: `tallowfiremid_${now}_${Math.random()}`,
                                type: 'fire',
                                x: fireEmissionX + (Math.random() - 0.5) * 12,
                                y: fireEmissionY,
                                vx: (Math.random() - 0.5) * 0.3,
                                vy: -0.2 - Math.random() * 0.2,
                                spawnTime: now,
                                initialLifetime: lifetime,
                                lifetime,
                                size: 3 + Math.random() * 3,
                                color: TALLOW_FIRE_MID_COLORS[Math.floor(Math.random() * TALLOW_FIRE_MID_COLORS.length)],
                                alpha: 1.0,
                            });
                        }
                        emissionAccumulatorRef.current.set(`${lanternId}_tallowfiremid`, fireMidAcc);
                    }

                    // === SIGNAL DISRUPTOR - Electrical Static + Furnace Fire ===
                    if (lantern.lanternType === LANTERN_TYPE_SIGNAL_DISRUPTOR) {
                        // --- Electrical Static (top area) ---
                        let acc = emissionAccumulatorRef.current.get(`${lanternId}_static`) || 0;
                        acc += STATIC_EMISSION_RATE * deltaTimeFactor;

                        while (acc >= 1) {
                            acc -= 1;
                            const lifetime = STATIC_LIFETIME_MIN + Math.random() * (STATIC_LIFETIME_MAX - STATIC_LIFETIME_MIN);

                            // Static sparks emanate in all directions from center
                            const angle = Math.random() * Math.PI * 2;
                            const speed = 0.5 + Math.random() * 0.8;

                            newGeneratedParticles.push({
                                id: `static_${now}_${Math.random()}`,
                                type: 'spark',
                                x: emissionX + (Math.random() - 0.5) * 16,
                                y: emissionY + (Math.random() - 0.5) * 16,
                                vx: Math.cos(angle) * speed + (Math.random() - 0.5) * STATIC_SPEED_X_SPREAD,
                                vy: Math.sin(angle) * speed + STATIC_SPEED_Y_MIN + Math.random() * (STATIC_SPEED_Y_MAX - STATIC_SPEED_Y_MIN),
                                spawnTime: now,
                                initialLifetime: lifetime,
                                lifetime,
                                size: STATIC_SIZE_MIN + Math.floor(Math.random() * (STATIC_SIZE_MAX - STATIC_SIZE_MIN + 1)),
                                color: STATIC_COLORS[Math.floor(Math.random() * STATIC_COLORS.length)],
                                alpha: STATIC_INITIAL_ALPHA,
                            });
                        }
                        emissionAccumulatorRef.current.set(`${lanternId}_static`, acc);

                        // Occasional spark burst for extra crackle
                        if (Math.random() < 0.03 * deltaTimeFactor) {
                            const burstCount = 3 + Math.floor(Math.random() * 5);
                            for (let i = 0; i < burstCount; i++) {
                                const angle = Math.random() * Math.PI * 2;
                                const speed = 1.0 + Math.random() * 1.5;
                                const lifetime = STATIC_LIFETIME_MIN + Math.random() * (STATIC_LIFETIME_MAX - STATIC_LIFETIME_MIN);

                                newGeneratedParticles.push({
                                    id: `staticburst_${now}_${i}_${Math.random()}`,
                                    type: 'spark',
                                    x: emissionX + (Math.random() - 0.5) * 8,
                                    y: emissionY + (Math.random() - 0.5) * 8,
                                    vx: Math.cos(angle) * speed,
                                    vy: Math.sin(angle) * speed,
                                    spawnTime: now,
                                    initialLifetime: lifetime,
                                    lifetime,
                                    size: 2,
                                    color: "#FFFFFF", // Bright white burst
                                    alpha: 1.0,
                                });
                            }
                        }

                        // --- Furnace Fire (bottom oven area) ---
                        const furnaceEmissionX = lantern.posX + DISRUPTOR_FURNACE_X_OFFSET;
                        const furnaceEmissionY = lantern.posY + DISRUPTOR_FURNACE_Y_OFFSET;

                        // Core fire (bright yellow-orange center)
                        let fireCoreAcc = emissionAccumulatorRef.current.get(`${lanternId}_disruptorfirecore`) || 0;
                        fireCoreAcc += DISRUPTOR_FIRE_CORE_EMISSION_RATE * deltaTimeFactor;
                        while (fireCoreAcc >= 1) {
                            fireCoreAcc -= 1;
                            const lifetime = DISRUPTOR_FIRE_CORE_LIFETIME_MIN + Math.random() * (DISRUPTOR_FIRE_CORE_LIFETIME_MAX - DISRUPTOR_FIRE_CORE_LIFETIME_MIN);
                            newGeneratedParticles.push({
                                id: `disruptorfirecore_${now}_${Math.random()}`,
                                type: 'fire',
                                x: furnaceEmissionX + (Math.random() - 0.5) * DISRUPTOR_FURNACE_X_SPREAD,
                                y: furnaceEmissionY,
                                vx: (Math.random() - 0.5) * 0.25,
                                vy: -0.25 - Math.random() * 0.25,
                                spawnTime: now,
                                initialLifetime: lifetime,
                                lifetime,
                                size: DISRUPTOR_FIRE_CORE_SIZE_MIN + Math.random() * (DISRUPTOR_FIRE_CORE_SIZE_MAX - DISRUPTOR_FIRE_CORE_SIZE_MIN),
                                color: DISRUPTOR_FIRE_CORE_COLORS[Math.floor(Math.random() * DISRUPTOR_FIRE_CORE_COLORS.length)],
                                alpha: 1.0,
                            });
                        }
                        emissionAccumulatorRef.current.set(`${lanternId}_disruptorfirecore`, fireCoreAcc);

                        // Mid fire (orange flames)
                        let fireMidAcc = emissionAccumulatorRef.current.get(`${lanternId}_disruptorfiremid`) || 0;
                        fireMidAcc += DISRUPTOR_FIRE_MID_EMISSION_RATE * deltaTimeFactor;
                        while (fireMidAcc >= 1) {
                            fireMidAcc -= 1;
                            const lifetime = DISRUPTOR_FIRE_MID_LIFETIME_MIN + Math.random() * (DISRUPTOR_FIRE_MID_LIFETIME_MAX - DISRUPTOR_FIRE_MID_LIFETIME_MIN);
                            newGeneratedParticles.push({
                                id: `disruptorfiremid_${now}_${Math.random()}`,
                                type: 'fire',
                                x: furnaceEmissionX + (Math.random() - 0.5) * (DISRUPTOR_FURNACE_X_SPREAD + 4),
                                y: furnaceEmissionY + 2,
                                vx: (Math.random() - 0.5) * 0.2,
                                vy: -0.18 - Math.random() * 0.15,
                                spawnTime: now,
                                initialLifetime: lifetime,
                                lifetime,
                                size: 3 + Math.random() * 3,
                                color: DISRUPTOR_FIRE_MID_COLORS[Math.floor(Math.random() * DISRUPTOR_FIRE_MID_COLORS.length)],
                                alpha: 1.0,
                            });
                        }
                        emissionAccumulatorRef.current.set(`${lanternId}_disruptorfiremid`, fireMidAcc);
                    }

                    // === MEMORY RESONANCE BEACON - Ethereal Memory Particles ===
                    if (lantern.lanternType === LANTERN_TYPE_MEMORY_BEACON) {
                        let acc = emissionAccumulatorRef.current.get(`${lanternId}_memory`) || 0;
                        acc += MEMORY_EMISSION_RATE * deltaTimeFactor;

                        while (acc >= 1) {
                            acc -= 1;
                            const lifetime = MEMORY_LIFETIME_MIN + Math.random() * (MEMORY_LIFETIME_MAX - MEMORY_LIFETIME_MIN);

                            // Memory particles spawn in a wider area, floating gently
                            const spawnRadius = 20 + Math.random() * 15;
                            const spawnAngle = Math.random() * Math.PI * 2;

                            newGeneratedParticles.push({
                                id: `memory_${now}_${Math.random()}`,
                                type: 'smoke', // Using smoke type for the soft rendering
                                x: emissionX + Math.cos(spawnAngle) * spawnRadius * (0.3 + Math.random() * 0.7),
                                y: emissionY + Math.sin(spawnAngle) * spawnRadius * 0.4 + (Math.random() - 0.5) * 10,
                                vx: (Math.random() - 0.5) * MEMORY_SPEED_X_SPREAD,
                                vy: MEMORY_SPEED_Y_MIN + Math.random() * (MEMORY_SPEED_Y_MAX - MEMORY_SPEED_Y_MIN),
                                spawnTime: now,
                                initialLifetime: lifetime,
                                lifetime,
                                size: MEMORY_SIZE_MIN + Math.floor(Math.random() * (MEMORY_SIZE_MAX - MEMORY_SIZE_MIN + 1)),
                                color: MEMORY_COLORS[Math.floor(Math.random() * MEMORY_COLORS.length)],
                                alpha: MEMORY_INITIAL_ALPHA,
                            });
                        }
                        emissionAccumulatorRef.current.set(`${lanternId}_memory`, acc);

                        // Occasional larger "memory fragment" burst
                        if (Math.random() < 0.02 * deltaTimeFactor) {
                            const lifetime = MEMORY_LIFETIME_MAX + Math.random() * 500;
                            newGeneratedParticles.push({
                                id: `memoryfrag_${now}_${Math.random()}`,
                                type: 'smoke',
                                x: emissionX + (Math.random() - 0.5) * 30,
                                y: emissionY + (Math.random() - 0.5) * 15,
                                vx: (Math.random() - 0.5) * 0.1,
                                vy: -0.02 - Math.random() * 0.03,
                                spawnTime: now,
                                initialLifetime: lifetime,
                                lifetime,
                                size: MEMORY_SIZE_MAX + 2,
                                color: "#BB99FF", // Brighter purple for fragments
                                alpha: 0.9,
                            });
                        }
                    }
                });
            }

            // Cleanup accumulators for wards no longer visible
            emissionAccumulatorRef.current.forEach((_, key) => {
                const lanternId = key.split('_')[0];
                if (!currentWardIds.has(lanternId)) {
                    emissionAccumulatorRef.current.delete(key);
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
    }, [visibleLanternsMap]);

    return particlesRef.current;
}

// === AAA PIXEL ART WARD PARTICLE RENDERING ===
// Renders ward particles with proper flame and smoke wisp shapes
export function renderWardParticles(
    ctx: CanvasRenderingContext2D,
    particles: Particle[],
    cameraOffsetX: number,
    cameraOffsetY: number
) {
    if (particles.length === 0) return;

    ctx.save();

    // Sort by type for proper layering (smoke behind fire)
    const smokeParticles: Particle[] = [];
    const fireParticles: Particle[] = [];
    const sparkParticles: Particle[] = [];
    const memoryParticles: Particle[] = [];

    for (const p of particles) {
        const id = p.id || '';
        if (id.startsWith('tallowcore_') || id.startsWith('tallowwisp_') || id.startsWith('tallowtendril_')) {
            smokeParticles.push(p);
        } else if (id.startsWith('tallowfirecore_') || id.startsWith('tallowfiremid_') || id.startsWith('tallowfireouter_') ||
                   id.startsWith('disruptorfirecore_') || id.startsWith('disruptorfiremid_')) {
            // Include both tallow fire (Ancestral Ward) and disruptor fire (Signal Disruptor furnace)
            fireParticles.push(p);
        } else if (id.startsWith('memory_') || id.startsWith('memoryfrag_')) {
            memoryParticles.push(p);
        } else if (p.type === 'spark') {
            sparkParticles.push(p);
        }
    }

    // === RENDER SMOKE WISPS (back layer) ===
    // Simple rising puffs that grow and fade - classic AAA pixel art style
    if (smokeParticles.length > 0) {
        ctx.imageSmoothingEnabled = true;
        
        for (const particle of smokeParticles) {
            const screenX = particle.x + cameraOffsetX;
            const screenY = particle.y + cameraOffsetY;
            
            ctx.globalAlpha = particle.alpha;
            
            // Create a soft radial gradient for the smoke puff
            const radius = particle.size;
            const gradient = ctx.createRadialGradient(
                screenX, screenY, 0,
                screenX, screenY, radius
            );
            
            gradient.addColorStop(0, particle.color || '#8B7355');
            gradient.addColorStop(0.6, particle.color || '#8B7355');
            gradient.addColorStop(1, 'transparent');
            
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(screenX, screenY, radius, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // === RENDER FIRE (middle layer) ===
    // Teardrop flame shapes with glow
    if (fireParticles.length > 0) {
        ctx.imageSmoothingEnabled = true;
        
        for (const particle of fireParticles) {
            const id = particle.id || '';
            const screenX = particle.x + cameraOffsetX;
            const screenY = particle.y + cameraOffsetY;
            
            ctx.globalAlpha = particle.alpha;
            
            const isCore = id.startsWith('tallowfirecore_') || id.startsWith('disruptorfirecore_');
            const isMid = id.startsWith('tallowfiremid_') || id.startsWith('disruptorfiremid_');
            
            // Glow effect
            ctx.shadowColor = particle.color || '#FFB04A';
            ctx.shadowBlur = isCore ? 6 : (isMid ? 4 : 2);
            
            // Flame dimensions - taller than wide (teardrop)
            const width = particle.size * (isCore ? 1.5 : (isMid ? 2.0 : 2.5));
            const height = particle.size * (isCore ? 3.0 : (isMid ? 2.5 : 2.0));
            
            // Gradient from bright center to transparent edge
            const gradient = ctx.createRadialGradient(
                screenX, screenY - height * 0.1, 0,
                screenX, screenY, height * 0.6
            );
            
            if (isCore) {
                gradient.addColorStop(0, '#FFFEF8');
                gradient.addColorStop(0.3, particle.color || '#FFE066');
                gradient.addColorStop(0.7, particle.color || '#FFD633');
                gradient.addColorStop(1, 'transparent');
            } else if (isMid) {
                gradient.addColorStop(0, particle.color || '#FFB04A');
                gradient.addColorStop(0.5, particle.color || '#FF9020');
                gradient.addColorStop(1, 'transparent');
            } else {
                gradient.addColorStop(0, particle.color || '#FF783C');
                gradient.addColorStop(0.6, particle.color || '#E85020');
                gradient.addColorStop(1, 'transparent');
            }
            
            ctx.fillStyle = gradient;
            
            // Draw teardrop/flame shape
            ctx.beginPath();
            ctx.moveTo(screenX, screenY - height * 0.5); // Top point
            ctx.bezierCurveTo(
                screenX + width * 0.5, screenY - height * 0.15,
                screenX + width * 0.4, screenY + height * 0.3,
                screenX, screenY + height * 0.5
            );
            ctx.bezierCurveTo(
                screenX - width * 0.4, screenY + height * 0.3,
                screenX - width * 0.5, screenY - height * 0.15,
                screenX, screenY - height * 0.5
            );
            ctx.fill();
        }
        ctx.shadowBlur = 0;
    }

    // === RENDER MEMORY BEACON PARTICLES ===
    // Ethereal glowing orbs
    if (memoryParticles.length > 0) {
        ctx.imageSmoothingEnabled = true;
        
        for (const particle of memoryParticles) {
            const screenX = particle.x + cameraOffsetX;
            const screenY = particle.y + cameraOffsetY;
            const isFragment = particle.id?.startsWith('memoryfrag_');
            
            ctx.globalAlpha = particle.alpha;
            
            const radius = particle.size * (isFragment ? 1.5 : 1.2);
            const gradient = ctx.createRadialGradient(
                screenX, screenY, 0,
                screenX, screenY, radius
            );
            gradient.addColorStop(0, particle.color || '#9966FF');
            gradient.addColorStop(0.4, particle.color || '#9966FF');
            gradient.addColorStop(1, 'transparent');
            
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(screenX, screenY, radius, 0, Math.PI * 2);
            ctx.fill();
            
            // Inner bright core for fragments
            if (isFragment) {
                ctx.globalAlpha = particle.alpha * 0.5;
                const innerGradient = ctx.createRadialGradient(
                    screenX, screenY, 0,
                    screenX, screenY, radius * 0.4
                );
                innerGradient.addColorStop(0, '#FFFFFF');
                innerGradient.addColorStop(1, 'transparent');
                ctx.fillStyle = innerGradient;
                ctx.beginPath();
                ctx.arc(screenX, screenY, radius * 0.4, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    // === RENDER SPARK PARTICLES (front layer) ===
    // Bright pixels with glow
    if (sparkParticles.length > 0) {
        ctx.imageSmoothingEnabled = false;
        
        for (const particle of sparkParticles) {
            const screenX = Math.floor(particle.x + cameraOffsetX);
            const screenY = Math.floor(particle.y + cameraOffsetY);
            
            ctx.globalAlpha = particle.alpha;
            ctx.fillStyle = particle.color || '#FFFFFF';
            ctx.shadowColor = particle.color || '#FFFFFF';
            ctx.shadowBlur = particle.size * 3;
            
            const pixelSize = Math.max(1, Math.floor(particle.size));
            ctx.fillRect(screenX - pixelSize / 2, screenY - pixelSize / 2, pixelSize, pixelSize);
        }
        ctx.shadowBlur = 0;
    }

    ctx.restore();
}
