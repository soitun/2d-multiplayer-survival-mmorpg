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
type WaveType = 'foam_line' | 'foam_dot' | 'water_edge' | 'sparkle' | 'trailing_foam';

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
    // AAA enhancements for organic feel
    segments: number;         // Number of line segments (broken foam effect)
    gapPattern: number[];     // Where gaps appear in the foam line
    brightness: number;       // Individual brightness variation (0.7-1.0)
    choppiness: number;       // How jagged/choppy this wave is (0-1)
    waveSetId: number;        // Which wave "set" this belongs to
}

interface ShorelineInfo {
    tileX: number;
    tileY: number;
    directions: WaveDirection[];
    isCorner: boolean;
    isDiagonal: boolean;
}

// === AAA TUNING CONSTANTS ===
// Varied wave timing - some fast, some slow for organic feel
const WAVE_LIFETIME_MIN = 2800;      // Faster waves
const WAVE_LIFETIME_MAX = 5200;      // Much more varied duration
const WAVE_SPAWN_RATE = 0.006;       // Base spawn rate (modified by wave sets)
const WAVE_TRAVEL_DISTANCE = 24;     // Travel further onto beach!
const WAVE_WIDTH_MIN = 6;            // Some thin delicate waves
const WAVE_WIDTH_MAX = 28;           // Some wide dramatic waves
const WAVE_START_OFFSET = -6;        // Start waves further out in the water
const MAX_PARTICLES = 700;           // More particles for lush effect

// Foam dot constants
const FOAM_DOT_SPAWN_RATE = 0.012;   // Foam dots
const FOAM_DOT_LIFETIME_MIN = 800;   // Shorter-lived for more turnover
const FOAM_DOT_LIFETIME_MAX = 2400;  // But some linger
const FOAM_DOT_TRAVEL = 20;          // Dots travel onto shore

// Trailing foam (left behind as waves recede)
const TRAILING_FOAM_SPAWN_RATE = 0.008;
const TRAILING_FOAM_LIFETIME_MIN = 1500;
const TRAILING_FOAM_LIFETIME_MAX = 3500;

// Sparkle constants (subtle water glints)
const SPARKLE_SPAWN_RATE = 0.003;    // Rarer for more impact
const SPARKLE_LIFETIME = 400;        // Quick flash

// Wash effect - waves spread wider as they reach shore
const WAVE_SPREAD_FACTOR = 1.6;      // More dramatic spread

// Wave set system - groups of waves with pauses
let currentWaveSetId = 0;
let waveSetTimer = 0;
let waveSetActive = true;
const WAVE_SET_DURATION = 4000;      // 4 seconds of waves
const WAVE_SET_PAUSE = 1500;         // 1.5 second pause between sets

// Choppiness variation per-tile (creates calm vs choppy areas)
const tileChoppinessMap = new Map<string, number>();

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
            
            // Update wave set system - creates natural grouping of waves
            waveSetTimer += dt;
            if (waveSetActive && waveSetTimer > WAVE_SET_DURATION) {
                waveSetActive = false;
                waveSetTimer = 0;
                currentWaveSetId++;
            } else if (!waveSetActive && waveSetTimer > WAVE_SET_PAUSE) {
                waveSetActive = true;
                waveSetTimer = 0;
            }

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
                        const fadeIn = Math.min(1, p.progress * 4);  // Fade in
                        const fadeOut = Math.max(0, 1 - (p.progress - 0.65) / 0.35);  // Gentle fade out
                        // Breathing effect varies with choppiness
                        const breatheIntensity = 0.1 + p.choppiness * 0.15;
                        const breathe = (1 - breatheIntensity) + breatheIntensity * Math.sin(p.progress * Math.PI * 2 + p.phase);
                        p.alpha = fadeIn * fadeOut * breathe * 0.6;  // Base alpha
                    } else if (p.type === 'foam_dot') {
                        // Pop in, linger, fade out - varied timing based on phase
                        const fadeInEnd = 0.1 + (p.phase / (Math.PI * 2)) * 0.1;
                        const lingerEnd = 0.5 + (p.phase / (Math.PI * 2)) * 0.15;
                        if (p.progress < fadeInEnd) {
                            p.alpha = (p.progress / fadeInEnd) * 0.75;
                        } else if (p.progress < lingerEnd) {
                            p.alpha = 0.75;
                        } else {
                            p.alpha = 0.75 * (1 - (p.progress - lingerEnd) / (1 - lingerEnd));
                        }
                    } else if (p.type === 'trailing_foam') {
                        // Slow fade in, long linger, slow fade out
                        if (p.progress < 0.2) {
                            p.alpha = (p.progress / 0.2) * 0.5;
                        } else if (p.progress < 0.7) {
                            p.alpha = 0.5;
                        } else {
                            p.alpha = 0.5 * (1 - (p.progress - 0.7) / 0.3);
                        }
                    } else if (p.type === 'sparkle') {
                        // Quick flash with varied intensity
                        p.alpha = Math.sin(p.progress * Math.PI) * 0.95;
                    }

                    particles[liveCount++] = p;
                }
            }
            particles.length = liveCount;

            // Spawn new particles on visible shoreline tiles
            if (particles.length < MAX_PARTICLES) {
                let spawnedThisFrame = 0;
                const shorelineCount = shorelineMapRef.current.size;
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
                        
                        // Get or create tile choppiness (varies per shoreline tile)
                        const tileKey = `${shore.tileX}_${shore.tileY}`;
                        if (!tileChoppinessMap.has(tileKey)) {
                            tileChoppinessMap.set(tileKey, Math.random());
                        }
                        const tileChoppiness = tileChoppinessMap.get(tileKey)!;

                        // === FOAM LINE WAVES (Main effect - multiple layers) ===
                        // Only spawn during active wave sets (creates natural grouping)
                        const spawnMod = waveSetActive ? 1.0 : 0.15;  // Reduced spawning during pause
                        
                        for (let layer = 0; layer < 3; layer++) {
                            const layerSpawnRate = WAVE_SPAWN_RATE * (layer === 0 ? 1.0 : 0.6) * spawnMod;
                            if (Math.random() < layerSpawnRate * dtFactor) {
                                const spread = tileSize * (0.35 + Math.random() * 0.25);  // Varied spread
                                let spawnX = worldX + spawnOffset.x * tileSize;
                                let spawnY = worldY + spawnOffset.y * tileSize;
                                
                                // Varied start offset for organic wave arrival
                                const startVariation = (Math.random() - 0.5) * 4;
                                const startOffset = WAVE_START_OFFSET - layer * 2 + startVariation;
                                spawnX += vec.dx * startOffset + perpX * (Math.random() - 0.5) * spread;
                                spawnY += vec.dy * startOffset + perpY * (Math.random() - 0.5) * spread;
                                
                                // Generate gap pattern for broken foam effect (2-5 segments)
                                const numSegments = 2 + Math.floor(Math.random() * 4);
                                const gaps: number[] = [];
                                for (let g = 0; g < numSegments - 1; g++) {
                                    if (Math.random() < 0.4) {  // 40% chance of gap at each break point
                                        gaps.push((g + 1) / numSegments);
                                    }
                                }
                                
                                // Varied width - some thin delicate, some wide dramatic
                                const widthBias = Math.random();
                                const width = widthBias < 0.3 
                                    ? WAVE_WIDTH_MIN + Math.random() * 6  // Thin waves (30%)
                                    : widthBias < 0.7
                                        ? WAVE_WIDTH_MIN + 6 + Math.random() * 10  // Medium waves (40%)
                                        : WAVE_WIDTH_MAX - 8 + Math.random() * 8;  // Wide waves (30%)

                                particles.push({
                                    id: `foam_${now}_${Math.random()}`,
                                    x: spawnX,
                                    y: spawnY,
                                    progress: 0,
                                    direction,
                                    lifetime: WAVE_LIFETIME_MIN + Math.random() * (WAVE_LIFETIME_MAX - WAVE_LIFETIME_MIN),
                                    spawnTime: now,
                                    width,
                                    amplitude: 1.5 + Math.random() * 3,
                                    alpha: 0,
                                    phase: Math.random() * Math.PI * 2,
                                    type: layer === 0 ? 'foam_line' : 'water_edge',
                                    layer,
                                    segments: numSegments,
                                    gapPattern: gaps,
                                    brightness: 0.7 + Math.random() * 0.3,  // Varied brightness
                                    choppiness: tileChoppiness * 0.6 + Math.random() * 0.4,  // Mix tile + individual
                                    waveSetId: currentWaveSetId,
                                });
                        }
                        }

                        // === FOAM DOTS (Travel with the wave onto shore) ===
                        if (Math.random() < FOAM_DOT_SPAWN_RATE * dtFactor * spawnMod) {
                            const spread = tileSize * 0.5;
                            let spawnX = worldX + spawnOffset.x * tileSize;
                            let spawnY = worldY + spawnOffset.y * tileSize;
                            // Start dots at the water edge with variation
                            const dotOffset = WAVE_START_OFFSET + (Math.random() - 0.5) * 8;
                            spawnX += vec.dx * dotOffset + perpX * (Math.random() - 0.5) * spread;
                            spawnY += vec.dy * dotOffset + perpY * (Math.random() - 0.5) * spread;

                            particles.push({
                                id: `dot_${now}_${Math.random()}`,
                                x: spawnX,
                                y: spawnY,
                                progress: 0,
                                direction,
                                lifetime: FOAM_DOT_LIFETIME_MIN + Math.random() * (FOAM_DOT_LIFETIME_MAX - FOAM_DOT_LIFETIME_MIN),
                                spawnTime: now,
                                width: 2 + Math.floor(Math.random() * 3),  // Larger bubbles: 2-4 pixels
                                amplitude: 0,
                                alpha: 0,
                                phase: Math.random() * Math.PI * 2,
                                type: 'foam_dot',
                                layer: 0,
                                segments: 1,
                                gapPattern: [],
                                brightness: 0.8 + Math.random() * 0.2,
                                choppiness: 0,
                                waveSetId: currentWaveSetId,
                                });
                        }
                        
                        // === TRAILING FOAM (Left behind as waves recede) ===
                        if (Math.random() < TRAILING_FOAM_SPAWN_RATE * dtFactor) {
                            const spread = tileSize * 0.6;
                            let spawnX = worldX + spawnOffset.x * tileSize;
                            let spawnY = worldY + spawnOffset.y * tileSize;
                            // Spawn further up on shore (where waves reach)
                            const shoreOffset = 10 + Math.random() * 14;
                            spawnX += vec.dx * shoreOffset + perpX * (Math.random() - 0.5) * spread;
                            spawnY += vec.dy * shoreOffset + perpY * (Math.random() - 0.5) * spread;

                            particles.push({
                                id: `trail_${now}_${Math.random()}`,
                                x: spawnX,
                                y: spawnY,
                                progress: 0,
                                direction,
                                lifetime: TRAILING_FOAM_LIFETIME_MIN + Math.random() * (TRAILING_FOAM_LIFETIME_MAX - TRAILING_FOAM_LIFETIME_MIN),
                                spawnTime: now,
                                width: 2 + Math.random() * 4,  // Small foam patches
                                amplitude: 0,
                                alpha: 0,
                                phase: Math.random() * Math.PI * 2,
                                type: 'trailing_foam',
                                layer: 0,
                                segments: 1,
                                gapPattern: [],
                                brightness: 0.5 + Math.random() * 0.3,  // Dimmer trailing foam
                                choppiness: 0,
                                waveSetId: currentWaveSetId,
                                });
                        }

                        // === SPARKLES (Rare water glints) ===
                        if (Math.random() < SPARKLE_SPAWN_RATE * dtFactor) {
                            const spread = tileSize * 0.5;
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
                                phase: Math.random() * Math.PI * 2,
                                type: 'sparkle',
                                layer: 0,
                                segments: 1,
                                gapPattern: [],
                                brightness: 1.0,
                                choppiness: 0,
                                waveSetId: currentWaveSetId,
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
    // Debug: Log particle count every 60 frames (log even if 0 particles)
    if (Math.random() < 0.016) {
        console.log(`[ShoreWaves RENDER] particles.length=${particles.length} (canvas already translated, using world coords)`);
    }
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
        } else if (wave.type === 'trailing_foam' || wave.type === 'sparkle') {
            travelDist = 0;  // Static particles - don't travel
        } else {
            travelDist = easedProgress * WAVE_TRAVEL_DISTANCE;
        }

        // World coordinates - the canvas is already translated by cameraOffset in GameCanvas
        // So we just use world positions directly (no need to add cameraOffset)
        const screenX = wave.x + vec.dx * travelDist;
        const screenY = wave.y + vec.dy * travelDist;

        // Calculate spread factor - waves get wider as they reach shore
        const spreadProgress = Math.min(1, wave.progress * 1.5);
        const currentSpread = 1 + (WAVE_SPREAD_FACTOR - 1) * spreadProgress;

        if (wave.type === 'foam_line') {
            renderFoamLine(ctx, wave, screenX, screenY, vec, currentSpread);
        } else if (wave.type === 'water_edge') {
            renderWaterEdge(ctx, wave, screenX, screenY, vec, currentSpread);
        } else if (wave.type === 'foam_dot') {
            renderFoamDot(ctx, wave, screenX, screenY, vec);
        } else if (wave.type === 'trailing_foam') {
            renderTrailingFoam(ctx, wave, screenX, screenY);
        } else if (wave.type === 'sparkle') {
            renderSparkle(ctx, wave, screenX, screenY);
        }
    }

    ctx.restore();
}

// Main foam line - pixel art style with segments and gaps for organic look
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
    const halfWidth = (wave.width / 2) * spread;

    // Choppiness adds jagged variation to the line
    const choppyOffset = wave.choppiness * Math.sin(wave.progress * Math.PI * 8 + wave.phase) * 2;
    
    const startX = Math.round(screenX - perpX * halfWidth);
    const startY = Math.round(screenY - perpY * halfWidth);
    const endX = Math.round(screenX + perpX * halfWidth);
    const endY = Math.round(screenY + perpY * halfWidth);

    // Control point - curve bulges toward beach with choppiness variation
    const curveAmount = wave.amplitude * (1 - wave.progress * 0.5) + choppyOffset;
    const wobble = Math.sin(wave.progress * Math.PI * 2 + wave.phase) * (0.5 + wave.choppiness);
    const ctrlX = Math.round(screenX + vec.dx * curveAmount + wobble);
    const ctrlY = Math.round(screenY + vec.dy * curveAmount + wobble);

    // Apply brightness variation
    const brightness = Math.round(255 * wave.brightness);
    const finalAlpha = wave.alpha * wave.brightness;
    
    // Draw segmented line with gaps for broken foam effect
    const numSegments = wave.segments;
    const segmentLength = 1 / numSegments;
    
    for (let seg = 0; seg < numSegments; seg++) {
        // Check if this segment should have a gap before it
        const segmentStart = seg * segmentLength;
        const segmentEnd = (seg + 1) * segmentLength;
        
        // Skip if this is a gap position
        if (wave.gapPattern.some(gap => gap > segmentStart && gap < segmentEnd)) {
            continue;
        }
        
        // Calculate segment positions along the curve
        const t1 = segmentStart;
        const t2 = segmentEnd;
        
        // Quadratic bezier interpolation
        const x1 = Math.round((1-t1)*(1-t1)*startX + 2*(1-t1)*t1*ctrlX + t1*t1*endX);
        const y1 = Math.round((1-t1)*(1-t1)*startY + 2*(1-t1)*t1*ctrlY + t1*t1*endY);
        const x2 = Math.round((1-t2)*(1-t2)*startX + 2*(1-t2)*t2*ctrlX + t2*t2*endX);
        const y2 = Math.round((1-t2)*(1-t2)*startY + 2*(1-t2)*t2*ctrlY + t2*t2*endY);
        
        // Draw segment with pixel-perfect lines
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        
        ctx.strokeStyle = `rgba(${brightness}, ${brightness}, ${brightness}, ${finalAlpha})`;
        ctx.lineWidth = 2.5; // Slightly thinner to match player wake line width
        ctx.stroke();
    }
    
    // Add subtle highlight on leading edge for fresh waves (varies with brightness)
    if (wave.progress < 0.35 && wave.brightness > 0.85) {
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.quadraticCurveTo(ctrlX, ctrlY, endX, endY);
        ctx.strokeStyle = `rgba(255, 255, 255, ${wave.alpha * 0.25})`;
        ctx.lineWidth = 3.0; // Slightly thicker highlight
        ctx.stroke();
    }
}

// Secondary water edge - pale cyan, slightly behind foam with varied tint
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
    const halfWidth = ((wave.width / 2) + 2 + wave.choppiness * 2) * spread;  // Wider and spreads more

    // Offset behind the foam line (varies with choppiness)
    const offsetDist = 3 + wave.choppiness * 2;
    const offsetX = -vec.dx * offsetDist;
    const offsetY = -vec.dy * offsetDist;

    const startX = Math.round(screenX - perpX * halfWidth + offsetX);
    const startY = Math.round(screenY - perpY * halfWidth + offsetY);
    const endX = Math.round(screenX + perpX * halfWidth + offsetX);
    const endY = Math.round(screenY + perpY * halfWidth + offsetY);

    const curveAmount = wave.amplitude * 0.5 + wave.choppiness;
    const ctrlX = Math.round(screenX + vec.dx * curveAmount + offsetX);
    const ctrlY = Math.round(screenY + vec.dy * curveAmount + offsetY);

    // Varied water edge color based on brightness
    const r = Math.round(150 + 30 * wave.brightness);
    const g = Math.round(200 + 25 * wave.brightness);
    const b = Math.round(235 + 15 * wave.brightness);
    
    // Draw segmented for consistency with foam line
    const numSegments = Math.max(2, wave.segments - 1);
    const segmentLength = 1 / numSegments;
    
    for (let seg = 0; seg < numSegments; seg++) {
        const t1 = seg * segmentLength;
        const t2 = (seg + 1) * segmentLength;
        
        // Skip some segments randomly for broken water edge
        if (wave.gapPattern.length > 0 && Math.random() < 0.2) continue;
        
        const x1 = Math.round((1-t1)*(1-t1)*startX + 2*(1-t1)*t1*ctrlX + t1*t1*endX);
        const y1 = Math.round((1-t1)*(1-t1)*startY + 2*(1-t1)*t1*ctrlY + t1*t1*endY);
        const x2 = Math.round((1-t2)*(1-t2)*startX + 2*(1-t2)*t2*ctrlX + t2*t2*endX);
        const y2 = Math.round((1-t2)*(1-t2)*startY + 2*(1-t2)*t2*ctrlY + t2*t2*endY);
        
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${wave.alpha * 0.4 * wave.brightness})`;
        ctx.lineWidth = 2.5; // Slightly thinner to match player wake line width
        ctx.stroke();
    }
}

// Foam dots - travel with waves onto shore, varied sizes
function renderFoamDot(
    ctx: CanvasRenderingContext2D,
    wave: WaveParticle,
    screenX: number,
    screenY: number,
    vec: { dx: number; dy: number }
) {
    const x = Math.round(screenX);
    const y = Math.round(screenY);
    
    const brightness = Math.round(255 * wave.brightness);
    const finalAlpha = wave.alpha * wave.brightness;
    
    // Dot size based on wave.width property (now 2-4 pixels for larger bubbles)
    const dotSize = wave.width;
    
    // Draw larger bubbles with varied patterns
    ctx.fillStyle = `rgba(${brightness}, ${brightness}, ${brightness}, ${finalAlpha})`;
    
    if (dotSize === 2) {
        // 2x2 dot cluster
        ctx.fillRect(x, y, 1, 1);
        ctx.fillRect(x + 1, y, 1, 1);
        if (wave.phase > Math.PI * 0.5) {
            ctx.fillStyle = `rgba(${brightness}, ${brightness}, ${brightness}, ${finalAlpha * 0.7})`;
            ctx.fillRect(x, y + 1, 1, 1);
            ctx.fillRect(x + 1, y + 1, 1, 1);
        }
    } else if (dotSize === 3) {
        // 3x3 dot cluster (larger bubble)
        ctx.fillRect(x, y, 1, 1);
        ctx.fillRect(x + 1, y, 1, 1);
        ctx.fillRect(x + 2, y, 1, 1);
        if (wave.phase > Math.PI * 0.3) {
            ctx.fillStyle = `rgba(${brightness}, ${brightness}, ${brightness}, ${finalAlpha * 0.75})`;
            ctx.fillRect(x, y + 1, 1, 1);
            ctx.fillRect(x + 1, y + 1, 1, 1);
            ctx.fillRect(x + 2, y + 1, 1, 1);
        }
        if (wave.phase > Math.PI * 0.8) {
            ctx.fillStyle = `rgba(${brightness}, ${brightness}, ${brightness}, ${finalAlpha * 0.6})`;
            ctx.fillRect(x + 1, y + 2, 1, 1);
        }
    } else if (dotSize >= 4) {
        // 4x4 dot cluster (largest bubble)
        ctx.fillRect(x, y, 1, 1);
        ctx.fillRect(x + 1, y, 1, 1);
        ctx.fillRect(x + 2, y, 1, 1);
        ctx.fillRect(x + 3, y, 1, 1);
        if (wave.phase > Math.PI * 0.2) {
            ctx.fillStyle = `rgba(${brightness}, ${brightness}, ${brightness}, ${finalAlpha * 0.8})`;
            ctx.fillRect(x, y + 1, 1, 1);
            ctx.fillRect(x + 1, y + 1, 1, 1);
            ctx.fillRect(x + 2, y + 1, 1, 1);
            ctx.fillRect(x + 3, y + 1, 1, 1);
        }
        if (wave.phase > Math.PI * 0.6) {
            ctx.fillStyle = `rgba(${brightness}, ${brightness}, ${brightness}, ${finalAlpha * 0.7})`;
            ctx.fillRect(x + 1, y + 2, 1, 1);
            ctx.fillRect(x + 2, y + 2, 1, 1);
        }
        if (wave.phase > Math.PI * 1.2) {
            ctx.fillStyle = `rgba(${brightness}, ${brightness}, ${brightness}, ${finalAlpha * 0.5})`;
            ctx.fillRect(x + 1, y + 3, 1, 1);
        }
    }
    
    // Occasional extra pixel for foam buildup effect at end of travel
    if (wave.progress > 0.6 && wave.phase > Math.PI * 1.5 && dotSize < 4) {
        ctx.fillStyle = `rgba(${brightness}, ${brightness}, ${brightness}, ${finalAlpha * 0.4})`;
        const offsetDir = wave.phase > Math.PI * 1.75 ? 1 : -1;
        ctx.fillRect(x + offsetDir, y, 1, 1);
    }
}

// Trailing foam - residue left on shore after waves recede
function renderTrailingFoam(
    ctx: CanvasRenderingContext2D,
    wave: WaveParticle,
    screenX: number,
    screenY: number
) {
    const x = Math.round(screenX);
    const y = Math.round(screenY);
    
    const brightness = Math.round(230 * wave.brightness);  // Slightly dimmer than fresh foam
    const finalAlpha = wave.alpha * wave.brightness * 0.6;  // More transparent
    
    // Trailing foam is small irregular patches
    const patchSize = Math.ceil(wave.width);
    
    ctx.fillStyle = `rgba(${brightness}, ${brightness}, ${brightness}, ${finalAlpha})`;
    
    // Draw irregular pixel cluster based on phase
    const pattern = Math.floor(wave.phase * 4) % 4;
    
    switch (pattern) {
        case 0:  // Horizontal line
            for (let i = 0; i < patchSize; i++) {
                if (Math.sin(wave.phase + i) > -0.3) {  // Gaps
                    ctx.fillRect(x + i, y, 1, 1);
                }
            }
            break;
        case 1:  // L shape
            ctx.fillRect(x, y, 1, 1);
            ctx.fillRect(x + 1, y, 1, 1);
            ctx.fillRect(x, y + 1, 1, 1);
            break;
        case 2:  // Diagonal
            ctx.fillRect(x, y, 1, 1);
            ctx.fillRect(x + 1, y + 1, 1, 1);
            if (patchSize > 2) ctx.fillRect(x + 2, y, 1, 1);
            break;
        case 3:  // Scatter
            ctx.fillRect(x, y, 1, 1);
            if (patchSize > 2) {
                ctx.fillRect(x + 2, y + 1, 1, 1);
            }
            ctx.fillRect(x + 1, y, 1, 1);
            break;
    }
    
    // Fading outline pixel for organic edge
    if (wave.progress < 0.7) {
        ctx.fillStyle = `rgba(${brightness}, ${brightness}, ${brightness}, ${finalAlpha * 0.3})`;
        ctx.fillRect(x - 1, y, 1, 1);
    }
}

// Rare sparkle - brief bright flash with varied intensity
function renderSparkle(
    ctx: CanvasRenderingContext2D,
    wave: WaveParticle,
    screenX: number,
    screenY: number
) {
    const x = Math.round(screenX);
    const y = Math.round(screenY);
    
    // Vary sparkle color slightly - some pure white, some with blue tint
    const isBlueTint = wave.phase > Math.PI * 1.5;
    const r = isBlueTint ? 230 : 255;
    const g = isBlueTint ? 245 : 255;
    const b = 255;
    
    // Bright center pixel
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${wave.alpha})`;
    ctx.fillRect(x, y, 1, 1);
    
    // Cross pattern for sparkle effect at peak - varied pattern
    if (wave.alpha > 0.5) {
        const dimAlpha = wave.alpha * 0.35;
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${dimAlpha})`;
        
        // Different sparkle patterns based on phase
        if (wave.phase < Math.PI) {
            // Standard cross
            ctx.fillRect(x - 1, y, 1, 1);
            ctx.fillRect(x + 1, y, 1, 1);
            ctx.fillRect(x, y - 1, 1, 1);
            ctx.fillRect(x, y + 1, 1, 1);
        } else if (wave.phase < Math.PI * 1.5) {
            // X pattern
            ctx.fillRect(x - 1, y - 1, 1, 1);
            ctx.fillRect(x + 1, y - 1, 1, 1);
            ctx.fillRect(x - 1, y + 1, 1, 1);
            ctx.fillRect(x + 1, y + 1, 1, 1);
        } else {
            // Horizontal line
            ctx.fillRect(x - 1, y, 1, 1);
            ctx.fillRect(x + 1, y, 1, 1);
            // Extra bright center at peak
            if (wave.alpha > 0.8) {
                ctx.fillStyle = `rgba(255, 255, 255, ${wave.alpha})`;
                ctx.fillRect(x - 2, y, 1, 1);
                ctx.fillRect(x + 2, y, 1, 1);
            }
        }
    }
}
