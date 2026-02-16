import { useEffect, useRef, useCallback } from 'react';
import { Particle } from './useCampfireParticles'; // Reuse Particle type

// --- Hostile Death Particle Constants ---
// AAA pixel art style blue/purple ethereal sparks for hostile NPC deaths
const DEATH_PARTICLE_LIFETIME_MIN = 400;
const DEATH_PARTICLE_LIFETIME_MAX = 900;
const DEATH_PARTICLE_SPEED_Y_MIN = -1.5;    // Fast upward burst
const DEATH_PARTICLE_SPEED_Y_MAX = -3.0;
const DEATH_PARTICLE_SPEED_X_SPREAD = 2.5;  // Wide horizontal spread
const DEATH_PARTICLE_SIZE_MIN = 2;
const DEATH_PARTICLE_SIZE_MAX = 5;

// Blue/purple ethereal colors for hostile deaths
const DEATH_PARTICLE_COLORS_BASE = [
    "#6366F1", // Indigo
    "#8B5CF6", // Violet
    "#A855F7", // Purple
    "#7C3AED", // Dark violet
    "#4F46E5", // Darker indigo
];
const DEATH_PARTICLE_COLORS_BRIGHT = [
    "#818CF8", // Light indigo
    "#A78BFA", // Light violet
    "#C4B5FD", // Lavender
    "#60A5FA", // Light blue
    "#93C5FD", // Sky blue
];
const DEATH_PARTICLE_COLORS_WHITE = [
    "#E0E7FF", // Indigo white
    "#EDE9FE", // Violet white
    "#F5F3FF", // Purple white
    "#FFFFFF", // Pure white
];

// Species-specific colors for variety
const SPECIES_COLORS: Record<string, string[]> = {
    'Shorebound': ["#22D3EE", "#06B6D4", "#0EA5E9", "#38BDF8", "#67E8F9"], // Cyan/teal stalker
    'Shardkin': ["#A855F7", "#8B5CF6", "#7C3AED", "#C084FC", "#D8B4FE"],   // Purple swarm
    'DrownedWatch': ["#3B82F6", "#2563EB", "#1D4ED8", "#60A5FA", "#1E40AF"], // Deep blue brute
};

// Burst particle counts based on NPC size
const SPECIES_PARTICLE_COUNT: Record<string, number> = {
    'Shorebound': 45,   // Medium stalker
    'Shardkin': 25,     // Small swarm
    'DrownedWatch': 80, // Large brute - big explosion
};

// Cap total particles to prevent performance degradation during mass hostile encounters
const MAX_PARTICLES = 800;
const PROCESSED_EVENTS_MAX = 50; // Cap processed event IDs to prevent unbounded memory growth

// Death event from useSpacetimeTables (client-side, no server subscription)
export interface HostileDeathEvent {
    id: string;
    x: number;
    y: number;
    species: string;
    timestamp: number;
}

interface UseHostileDeathEffectsProps {
    hostileDeathEvents: HostileDeathEvent[];
}

export function useHostileDeathEffects({
    hostileDeathEvents,
}: UseHostileDeathEffectsProps): Particle[] {
    const particlesRef = useRef<Particle[]>([]);
    const processedEventsRef = useRef<Set<string>>(new Set());
    const lastUpdateTimeRef = useRef<number>(performance.now());
    const animationFrameRef = useRef<number>(0);

    // Generate particles for a death event
    const generateDeathParticles = useCallback((event: HostileDeathEvent) => {
        const now = performance.now();
        const newParticles: Particle[] = [];
        
        // Get species-specific properties
        const speciesName = event.species;
        const particleCount = SPECIES_PARTICLE_COUNT[speciesName] || 40;
        const speciesColors = SPECIES_COLORS[speciesName] || DEATH_PARTICLE_COLORS_BASE;
        
        // Create burst of particles
        for (let i = 0; i < particleCount; i++) {
            const angle = (Math.PI * 2 * i) / particleCount + (Math.random() - 0.5) * 0.5;
            const speed = 1.0 + Math.random() * 2.0;
            
            // Mix of directional burst and random scatter
            const isDirectional = Math.random() > 0.3;
            let vx: number, vy: number;
            
            if (isDirectional) {
                // Burst outward in all directions
                vx = Math.cos(angle) * speed * DEATH_PARTICLE_SPEED_X_SPREAD;
                vy = Math.sin(angle) * speed + DEATH_PARTICLE_SPEED_Y_MIN;
            } else {
                // Random scatter with upward bias
                vx = (Math.random() - 0.5) * DEATH_PARTICLE_SPEED_X_SPREAD * 2;
                vy = DEATH_PARTICLE_SPEED_Y_MIN + Math.random() * (DEATH_PARTICLE_SPEED_Y_MAX - DEATH_PARTICLE_SPEED_Y_MIN);
            }
            
            // Select color - mostly species colors, some bright, few white
            let color: string;
            const colorRoll = Math.random();
            if (colorRoll < 0.6) {
                color = speciesColors[Math.floor(Math.random() * speciesColors.length)];
            } else if (colorRoll < 0.85) {
                color = DEATH_PARTICLE_COLORS_BRIGHT[Math.floor(Math.random() * DEATH_PARTICLE_COLORS_BRIGHT.length)];
            } else {
                color = DEATH_PARTICLE_COLORS_WHITE[Math.floor(Math.random() * DEATH_PARTICLE_COLORS_WHITE.length)];
            }
            
            const lifetime = DEATH_PARTICLE_LIFETIME_MIN + 
                Math.random() * (DEATH_PARTICLE_LIFETIME_MAX - DEATH_PARTICLE_LIFETIME_MIN);
            
            newParticles.push({
                id: `death-${event.id}-${i}-${now}`,
                type: 'spark' as const,
                x: event.x + (Math.random() - 0.5) * 20,  // Slight initial spread
                y: event.y + (Math.random() - 0.5) * 20,
                vx,
                vy,
                spawnTime: now,
                initialLifetime: lifetime,
                lifetime,
                size: DEATH_PARTICLE_SIZE_MIN + Math.random() * (DEATH_PARTICLE_SIZE_MAX - DEATH_PARTICLE_SIZE_MIN),
                color,
                alpha: 1.0,
            });
        }
        
        // Add extra "core" bright particles for dramatic effect
        const coreCount = Math.floor(particleCount * 0.3);
        for (let i = 0; i < coreCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 0.5 + Math.random() * 1.5;
            
            newParticles.push({
                id: `death-core-${event.id}-${i}-${now}`,
                type: 'spark' as const,
                x: event.x + (Math.random() - 0.5) * 10,
                y: event.y + (Math.random() - 0.5) * 10,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 1.0, // Slight upward bias
                spawnTime: now,
                initialLifetime: DEATH_PARTICLE_LIFETIME_MIN * 1.5, // Longer lasting core
                lifetime: DEATH_PARTICLE_LIFETIME_MIN * 1.5,
                size: DEATH_PARTICLE_SIZE_MAX + 1 + Math.random() * 2,
                color: DEATH_PARTICLE_COLORS_WHITE[Math.floor(Math.random() * DEATH_PARTICLE_COLORS_WHITE.length)],
                alpha: 1.0,
            });
        }
        
        return newParticles;
    }, []);

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

            // Normalize to 60fps
            const deltaTimeFactor = deltaTime / 16.667;

            // Update existing particles
            for (let i = 0; i < currentParticles.length; i++) {
                const p = currentParticles[i];
                const age = now - p.spawnTime;
                const lifetimeRemaining = p.initialLifetime - age;

                if (lifetimeRemaining <= 0) {
                    continue;
                }

                // Fade out with sparkle effect
                const lifeRatio = Math.max(0, lifetimeRemaining / p.initialLifetime);
                const sparkle = 0.7 + 0.3 * Math.sin((now - p.spawnTime) * 0.02); // Faster sparkle
                const currentAlpha = lifeRatio * sparkle;

                // Apply gravity and deceleration
                const ageRatio = age / p.initialLifetime;
                const decelerationFactor = 1.0 - (ageRatio * 0.5);
                const gravity = 0.02; // Slight gravity for natural arc

                p.x += p.vx * deltaTimeFactor * decelerationFactor;
                p.y += p.vy * deltaTimeFactor * decelerationFactor;
                p.vy += gravity * deltaTimeFactor; // Add gravity
                
                p.lifetime = lifetimeRemaining;
                p.alpha = Math.max(0, Math.min(1, currentAlpha));

                // Shrink over time for spark effect
                const sizeDecay = 1.0 - (ageRatio * 0.3);
                p.size = Math.max(1, p.size * sizeDecay);

                if (p.alpha > 0.01) {
                    currentParticles[liveParticleCount++] = p;
                }
            }
            currentParticles.length = liveParticleCount;

            // Check for new death events (skip if at particle cap to prevent lag during mass encounters)
            let particleCount = particlesRef.current.length;
            if (particleCount < MAX_PARTICLES) {
                for (const event of hostileDeathEvents) {
                    if (!processedEventsRef.current.has(event.id)) {
                        const newParticles = generateDeathParticles(event);
                        const spaceLeft = MAX_PARTICLES - particleCount;
                        const toAdd = newParticles.length <= spaceLeft
                            ? newParticles
                            : newParticles.slice(0, spaceLeft);
                        particlesRef.current.push(...toAdd);
                        particleCount += toAdd.length;
                        processedEventsRef.current.add(event.id);
                        if (particleCount >= MAX_PARTICLES) break;
                    }
                }
            }

            // Cleanup old processed events (keep memory bounded)
            if (processedEventsRef.current.size > PROCESSED_EVENTS_MAX) {
                const currentEventIds = new Set(hostileDeathEvents.map(e => e.id));
                for (const id of Array.from(processedEventsRef.current)) {
                    if (!currentEventIds.has(id)) {
                        processedEventsRef.current.delete(id);
                    }
                }
                // If still over cap, drop oldest (arbitrary: keep most recent by clearing all not in current)
                if (processedEventsRef.current.size > PROCESSED_EVENTS_MAX) {
                    const toKeep = Array.from(processedEventsRef.current).slice(-PROCESSED_EVENTS_MAX);
                    processedEventsRef.current.clear();
                    toKeep.forEach(id => processedEventsRef.current.add(id));
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
    }, [hostileDeathEvents, generateDeathParticles]);

    return particlesRef.current;
}
