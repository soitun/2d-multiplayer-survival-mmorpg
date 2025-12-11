// client/src/hooks/useShoreWaveParticles.ts
// AAA Pixel Art Shore Waves - Inspired by Sea of Stars

import { useEffect, useRef } from 'react';
import { WorldTile } from '../generated';
import { gameConfig } from '../config/gameConfig';

// Wave direction vectors - pointing FROM sea TOWARD beach
type WaveDirection = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';

const DIRECTION_VECTORS: Record<WaveDirection, { dx: number; dy: number }> = {
    'N':  { dx: 0,    dy: 1 },
    'NE': { dx: -0.707, dy: 0.707 },
    'E':  { dx: -1,   dy: 0 },
    'SE': { dx: -0.707, dy: -0.707 },
    'S':  { dx: 0,    dy: -1 },
    'SW': { dx: 0.707, dy: -0.707 },
    'W':  { dx: 1,    dy: 0 },
    'NW': { dx: 0.707, dy: 0.707 },
};

// Wave spawn position offsets - where waves START (at the sea edge)
const SPAWN_OFFSETS: Record<WaveDirection, { x: number; y: number }> = {
    'N':  { x: 0.5, y: 0.0 },
    'NE': { x: 1.0, y: 0.0 },
    'E':  { x: 1.0, y: 0.5 },
    'SE': { x: 1.0, y: 1.0 },
    'S':  { x: 0.5, y: 1.0 },
    'SW': { x: 0.0, y: 1.0 },
    'W':  { x: 0.0, y: 0.5 },
    'NW': { x: 0.0, y: 0.0 },
};

// Particle types for layered wave effect
type WaveType = 'foam_line' | 'foam_dot' | 'water_edge' | 'sparkle';

export interface WaveParticle {
    id: string;
    x: number;
    y: number;
    progress: number;
    direction: WaveDirection;
    lifetime: number;
    spawnTime: number;
    width: number;
    amplitude: number;
    alpha: number;
    phase: number;
    type: WaveType;
    layer: number;  // For staggered wave lines (0, 1, 2)
}

interface ShorelineInfo {
    tileX: number;
    tileY: number;
    directions: WaveDirection[];
    isCorner: boolean;
    isDiagonal: boolean;
}

// === AAA TUNING CONSTANTS ===
// Slower, more relaxed wave timing (Sea of Stars style)
const WAVE_LIFETIME_MIN = 3200;      // Slower waves for better visibility
const WAVE_LIFETIME_MAX = 4500;      // Extended duration for gentle lapping
const WAVE_SPAWN_RATE = 0.008;       // Slightly more frequent for fuller coverage
const WAVE_TRAVEL_DISTANCE = 22;     // Travel further onto beach!
const WAVE_WIDTH_MIN = 10;           // Slightly wider for visibility
const WAVE_WIDTH_MAX = 22;           // Fuller wave lines
const WAVE_START_OFFSET = -4;        // Start waves slightly out in the water
const MAX_PARTICLES = 600;           // More particles for lush effect

// Foam dot constants
const FOAM_DOT_SPAWN_RATE = 0.015;   // More foam dots
const FOAM_DOT_LIFETIME_MIN = 1000;
const FOAM_DOT_LIFETIME_MAX = 2000;
const FOAM_DOT_TRAVEL = 18;          // Dots also travel onto shore

// Sparkle constants (subtle water glints)
const SPARKLE_SPAWN_RATE = 0.004;
const SPARKLE_LIFETIME = 500;

// Wash effect - waves spread wider as they reach shore
const WAVE_SPREAD_FACTOR = 1.4;      // How much wider waves get at end

interface UseShoreWaveParticlesProps {
    worldTiles: Map<string, WorldTile>;
    viewBounds: { minX: number; maxX: number; minY: number; maxY: number };
    cameraOffsetX: number;
    cameraOffsetY: number;
}

export function useShoreWaveParticles({
    worldTiles,
    viewBounds,
}: UseShoreWaveParticlesProps): WaveParticle[] {
    const particlesRef = useRef<WaveParticle[]>([]);
    const shorelineMapRef = useRef<Map<string, ShorelineInfo>>(new Map());
    const lastUpdateRef = useRef<number>(performance.now());
    const animFrameRef = useRef<number>(0);
    const wavePhaseRef = useRef<number>(0);  // Global wave phase for synchronized motion

    const { tileSize } = gameConfig;

    // Analyze shoreline tiles and determine wave directions
    useEffect(() => {
        const shorelines = new Map<string, ShorelineInfo>();

        worldTiles.forEach((tile) => {
            if (tile.tileType?.tag !== 'Beach') return;

            const x = tile.worldX;
            const y = tile.worldY;
            const key = `${x}_${y}`;

            const seaNeighbors = {
                N:  worldTiles.get(`${x}_${y - 1}`)?.tileType?.tag === 'Sea',
                NE: worldTiles.get(`${x + 1}_${y - 1}`)?.tileType?.tag === 'Sea',
                E:  worldTiles.get(`${x + 1}_${y}`)?.tileType?.tag === 'Sea',
                SE: worldTiles.get(`${x + 1}_${y + 1}`)?.tileType?.tag === 'Sea',
                S:  worldTiles.get(`${x}_${y + 1}`)?.tileType?.tag === 'Sea',
                SW: worldTiles.get(`${x - 1}_${y + 1}`)?.tileType?.tag === 'Sea',
                W:  worldTiles.get(`${x - 1}_${y}`)?.tileType?.tag === 'Sea',
                NW: worldTiles.get(`${x - 1}_${y - 1}`)?.tileType?.tag === 'Sea',
            };

            const cardinalCount = [seaNeighbors.N, seaNeighbors.E, seaNeighbors.S, seaNeighbors.W]
                .filter(Boolean).length;

            const directions: WaveDirection[] = [];

            if (seaNeighbors.N) directions.push('N');
            if (seaNeighbors.E) directions.push('E');
            if (seaNeighbors.S) directions.push('S');
            if (seaNeighbors.W) directions.push('W');

            if (seaNeighbors.NE && !seaNeighbors.N && !seaNeighbors.E) directions.push('NE');
            if (seaNeighbors.SE && !seaNeighbors.S && !seaNeighbors.E) directions.push('SE');
            if (seaNeighbors.SW && !seaNeighbors.S && !seaNeighbors.W) directions.push('SW');
            if (seaNeighbors.NW && !seaNeighbors.N && !seaNeighbors.W) directions.push('NW');

            if (directions.length > 0) {
                const isDiagonal = directions.some(d => d.length === 2);
                const isCorner = cardinalCount >= 2 || isDiagonal;

                shorelines.set(key, {
                    tileX: x,
                    tileY: y,
                    directions,
                    isCorner,
                    isDiagonal,
                });
            }
        });

        shorelineMapRef.current = shorelines;
    }, [worldTiles]);

    // Particle update loop
    useEffect(() => {
        const updateParticles = () => {
            const now = performance.now();
            const dt = now - lastUpdateRef.current;
            lastUpdateRef.current = now;

            if (dt <= 0) {
                animFrameRef.current = requestAnimationFrame(updateParticles);
                return;
            }

            const dtFactor = dt / 16.667;
            const particles = particlesRef.current;
            
            // Update global wave phase (for synchronized gentle bobbing)
            wavePhaseRef.current += dt * 0.0008;  // Very slow phase progression

            // Update existing particles
            let liveCount = 0;
            for (let i = 0; i < particles.length; i++) {
                const p = particles[i];
                const age = now - p.spawnTime;

                if (age < p.lifetime) {
                    p.progress = age / p.lifetime;
                    
                    // Different alpha curves for different types
                    if (p.type === 'foam_line' || p.type === 'water_edge') {
                        // Gentle sine-based alpha for organic feel
                        const fadeIn = Math.min(1, p.progress * 5);  // Quick fade in
                        const fadeOut = Math.max(0, 1 - (p.progress - 0.7) / 0.3);  // Gentle fade out
                        const breathe = 0.85 + 0.15 * Math.sin(p.progress * Math.PI * 2 + p.phase);
                        p.alpha = fadeIn * fadeOut * breathe * 0.55;  // Softer max alpha
                    } else if (p.type === 'foam_dot') {
                        // Pop in, linger, fade out
                        if (p.progress < 0.15) {
                            p.alpha = (p.progress / 0.15) * 0.7;
                        } else if (p.progress < 0.6) {
                            p.alpha = 0.7;
                        } else {
                            p.alpha = 0.7 * (1 - (p.progress - 0.6) / 0.4);
                        }
                    } else if (p.type === 'sparkle') {
                        // Quick flash
                        p.alpha = Math.sin(p.progress * Math.PI) * 0.9;
                    }

                    particles[liveCount++] = p;
                }
            }
            particles.length = liveCount;

            // Spawn new particles on visible shoreline tiles
            if (particles.length < MAX_PARTICLES) {
                shorelineMapRef.current.forEach((shore) => {
                    const worldX = shore.tileX * tileSize;
                    const worldY = shore.tileY * tileSize;

                    // Viewport culling
                    if (worldX < viewBounds.minX - tileSize * 2 ||
                        worldX > viewBounds.maxX + tileSize * 2 ||
                        worldY < viewBounds.minY - tileSize * 2 ||
                        worldY > viewBounds.maxY + tileSize * 2) {
                        return;
                    }

                    for (const direction of shore.directions) {
                        const spawnOffset = SPAWN_OFFSETS[direction];
                        const vec = DIRECTION_VECTORS[direction];
                        const perpX = -vec.dy;
                        const perpY = vec.dx;

                        // === FOAM LINE WAVES (Main effect - multiple layers) ===
                        for (let layer = 0; layer < 3; layer++) {
                            const layerSpawnRate = WAVE_SPAWN_RATE * (layer === 0 ? 1.0 : 0.7);
                            if (Math.random() < layerSpawnRate * dtFactor) {
                                const spread = tileSize * 0.4;
                                let spawnX = worldX + spawnOffset.x * tileSize;
                                let spawnY = worldY + spawnOffset.y * tileSize;
                                
                                // Start waves slightly out in the water (negative = toward sea)
                                const startOffset = WAVE_START_OFFSET - layer * 2;
                                spawnX += vec.dx * startOffset + perpX * (Math.random() - 0.5) * spread;
                                spawnY += vec.dy * startOffset + perpY * (Math.random() - 0.5) * spread;

                                particles.push({
                                    id: `foam_${now}_${Math.random()}`,
                                    x: spawnX,
                                    y: spawnY,
                                    progress: 0,
                                    direction,
                                    lifetime: WAVE_LIFETIME_MIN + Math.random() * (WAVE_LIFETIME_MAX - WAVE_LIFETIME_MIN),
                                    spawnTime: now,
                                    width: WAVE_WIDTH_MIN + Math.random() * (WAVE_WIDTH_MAX - WAVE_WIDTH_MIN),
                                    amplitude: 2 + Math.random() * 2.5,
                                    alpha: 0,
                                    phase: Math.random() * Math.PI * 2,
                                    type: layer === 0 ? 'foam_line' : 'water_edge',
                                    layer,
                                });
                            }
                        }

                        // === FOAM DOTS (Travel with the wave onto shore) ===
                        if (Math.random() < FOAM_DOT_SPAWN_RATE * dtFactor) {
                            const spread = tileSize * 0.5;
                            let spawnX = worldX + spawnOffset.x * tileSize;
                            let spawnY = worldY + spawnOffset.y * tileSize;
                            // Start dots at the water edge
                            spawnX += vec.dx * WAVE_START_OFFSET + perpX * (Math.random() - 0.5) * spread;
                            spawnY += vec.dy * WAVE_START_OFFSET + perpY * (Math.random() - 0.5) * spread;

                            particles.push({
                                id: `dot_${now}_${Math.random()}`,
                                x: spawnX,
                                y: spawnY,
                                progress: 0,
                                direction,
                                lifetime: FOAM_DOT_LIFETIME_MIN + Math.random() * (FOAM_DOT_LIFETIME_MAX - FOAM_DOT_LIFETIME_MIN),
                                spawnTime: now,
                                width: 1,
                                amplitude: 0,
                                alpha: 0,
                                phase: Math.random() * Math.PI * 2,
                                type: 'foam_dot',
                                layer: 0,
                            });
                        }

                        // === SPARKLES (Rare water glints) ===
                        if (Math.random() < SPARKLE_SPAWN_RATE * dtFactor) {
                            const spread = tileSize * 0.4;
                            let spawnX = worldX + spawnOffset.x * tileSize;
                            let spawnY = worldY + spawnOffset.y * tileSize;
                            spawnX += (Math.random() - 0.5) * spread;
                            spawnY += (Math.random() - 0.5) * spread;

                            particles.push({
                                id: `sparkle_${now}_${Math.random()}`,
                                x: spawnX,
                                y: spawnY,
                                progress: 0,
                                direction,
                                lifetime: SPARKLE_LIFETIME,
                                spawnTime: now,
                                width: 1,
                                amplitude: 0,
                                alpha: 0,
                                phase: 0,
                                type: 'sparkle',
                                layer: 0,
                            });
                        }
                    }
                });
            }

            animFrameRef.current = requestAnimationFrame(updateParticles);
        };

        lastUpdateRef.current = performance.now();
        animFrameRef.current = requestAnimationFrame(updateParticles);

        return () => {
            if (animFrameRef.current) {
                cancelAnimationFrame(animFrameRef.current);
            }
        };
    }, [viewBounds, tileSize]);

    return particlesRef.current;
}

// === AAA PIXEL ART RENDERING ===
export function renderShoreWaves(
    ctx: CanvasRenderingContext2D,
    particles: WaveParticle[],
    cameraOffsetX: number,
    cameraOffsetY: number
) {
    if (particles.length === 0) return;

    ctx.save();
    
    // Pixel-perfect rendering (no anti-aliasing for crisp pixels)
    ctx.imageSmoothingEnabled = false;
    ctx.lineCap = 'butt';  // Sharp line ends
    ctx.lineJoin = 'miter';

    // Sort by layer for proper depth (back layers first)
    const sortedParticles = [...particles].sort((a, b) => b.layer - a.layer);

    for (const wave of sortedParticles) {
        if (wave.alpha <= 0.02) continue;

        const vec = DIRECTION_VECTORS[wave.direction];
        
        // Smooth easing with slight acceleration at start (like real waves)
        const easedProgress = wave.progress < 0.3 
            ? wave.progress * wave.progress * 3.33  // Accelerate in
            : 0.3 + (wave.progress - 0.3) * (1.4 - wave.progress);  // Slow down at end
        
        // Calculate travel distance based on particle type
        let travelDist: number;
        if (wave.type === 'foam_dot') {
            travelDist = easedProgress * FOAM_DOT_TRAVEL;
        } else {
            travelDist = easedProgress * WAVE_TRAVEL_DISTANCE;
        }

        const screenX = wave.x + vec.dx * travelDist + cameraOffsetX;
        const screenY = wave.y + vec.dy * travelDist + cameraOffsetY;

        // Calculate spread factor - waves get wider as they reach shore
        const spreadProgress = Math.min(1, wave.progress * 1.5);
        const currentSpread = 1 + (WAVE_SPREAD_FACTOR - 1) * spreadProgress;

        if (wave.type === 'foam_line') {
            renderFoamLine(ctx, wave, screenX, screenY, vec, currentSpread);
        } else if (wave.type === 'water_edge') {
            renderWaterEdge(ctx, wave, screenX, screenY, vec, currentSpread);
        } else if (wave.type === 'foam_dot') {
            renderFoamDot(ctx, wave, screenX, screenY, vec);
        } else if (wave.type === 'sparkle') {
            renderSparkle(ctx, wave, screenX, screenY);
        }
    }

    ctx.restore();
}

// Main foam line - thin white line with subtle curve, spreads as it reaches shore
function renderFoamLine(
    ctx: CanvasRenderingContext2D,
    wave: WaveParticle,
    screenX: number,
    screenY: number,
    vec: { dx: number; dy: number },
    spread: number
) {
    const perpX = -vec.dy;
    const perpY = vec.dx;
    const halfWidth = (wave.width / 2) * spread;  // Apply spread

    // Gentle wobble along the line (pixel art style)
    const wobble = Math.sin(wave.progress * Math.PI * 2 + wave.phase) * 0.8;
    
    const startX = Math.round(screenX - perpX * halfWidth);
    const startY = Math.round(screenY - perpY * halfWidth);
    const endX = Math.round(screenX + perpX * halfWidth);
    const endY = Math.round(screenY + perpY * halfWidth);

    // Control point - curve bulges toward beach, flattens as it reaches shore
    const curveAmount = wave.amplitude * (1 - wave.progress * 0.6);
    const ctrlX = Math.round(screenX + vec.dx * curveAmount + wobble);
    const ctrlY = Math.round(screenY + vec.dy * curveAmount + wobble);

    // Draw thin pixel line - pure white foam
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.quadraticCurveTo(ctrlX, ctrlY, endX, endY);
    
    // Slightly thicker line for better visibility (still crisp)
    ctx.strokeStyle = `rgba(255, 255, 255, ${wave.alpha})`;
    ctx.lineWidth = 1;
    ctx.stroke();
    
    // Add subtle highlight on the leading edge when wave is fresh
    if (wave.progress < 0.4) {
        ctx.strokeStyle = `rgba(255, 255, 255, ${wave.alpha * 0.3})`;
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}

// Secondary water edge - pale cyan, slightly behind foam
function renderWaterEdge(
    ctx: CanvasRenderingContext2D,
    wave: WaveParticle,
    screenX: number,
    screenY: number,
    vec: { dx: number; dy: number },
    spread: number
) {
    const perpX = -vec.dy;
    const perpY = vec.dx;
    const halfWidth = ((wave.width / 2) + 3) * spread;  // Wider and spreads more

    // Offset behind the foam line
    const offsetX = -vec.dx * 3;
    const offsetY = -vec.dy * 3;

    const startX = Math.round(screenX - perpX * halfWidth + offsetX);
    const startY = Math.round(screenY - perpY * halfWidth + offsetY);
    const endX = Math.round(screenX + perpX * halfWidth + offsetX);
    const endY = Math.round(screenY + perpY * halfWidth + offsetY);

    const curveAmount = wave.amplitude * 0.6;
    const ctrlX = Math.round(screenX + vec.dx * curveAmount + offsetX);
    const ctrlY = Math.round(screenY + vec.dy * curveAmount + offsetY);

    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.quadraticCurveTo(ctrlX, ctrlY, endX, endY);
    
    // Pale cyan/aqua - Sea of Stars water color
    ctx.strokeStyle = `rgba(170, 220, 245, ${wave.alpha * 0.45})`;
    ctx.lineWidth = 1;
    ctx.stroke();
}

// Foam dots - travel with waves onto shore
function renderFoamDot(
    ctx: CanvasRenderingContext2D,
    wave: WaveParticle,
    screenX: number,
    screenY: number,
    vec: { dx: number; dy: number }
) {
    const x = Math.round(screenX);
    const y = Math.round(screenY);
    
    // Single pixel dot
    ctx.fillStyle = `rgba(255, 255, 255, ${wave.alpha})`;
    ctx.fillRect(x, y, 1, 1);
    
    // Add neighboring pixel based on phase for 2px variation
    if (wave.phase > Math.PI) {
        // Perpendicular neighbor for width variation
        const perpX = Math.round(-vec.dy);
        const perpY = Math.round(vec.dx);
        ctx.fillRect(x + perpX, y + perpY, 1, 1);
    }
    
    // Occasional 2x2 cluster for foam buildup effect
    if (wave.phase > Math.PI * 1.5 && wave.progress > 0.5) {
        ctx.fillStyle = `rgba(255, 255, 255, ${wave.alpha * 0.6})`;
        ctx.fillRect(x + 1, y, 1, 1);
        ctx.fillRect(x, y + 1, 1, 1);
    }
}

// Rare sparkle - brief bright flash
function renderSparkle(
    ctx: CanvasRenderingContext2D,
    wave: WaveParticle,
    screenX: number,
    screenY: number
) {
    const x = Math.round(screenX);
    const y = Math.round(screenY);
    
    // Bright white center pixel
    ctx.fillStyle = `rgba(255, 255, 255, ${wave.alpha})`;
    ctx.fillRect(x, y, 1, 1);
    
    // Cross pattern for sparkle effect at peak
    if (wave.alpha > 0.5) {
        const dimAlpha = wave.alpha * 0.4;
        ctx.fillStyle = `rgba(255, 255, 255, ${dimAlpha})`;
        ctx.fillRect(x - 1, y, 1, 1);
        ctx.fillRect(x + 1, y, 1, 1);
        ctx.fillRect(x, y - 1, 1, 1);
        ctx.fillRect(x, y + 1, 1, 1);
    }
}
