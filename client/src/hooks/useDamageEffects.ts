/**
 * useDamageEffects - AAA-quality damage feedback effects
 * 
 * Provides:
 * 1. Screen shake when player takes damage (camera shake)
 * 2. Red vignette flash when taking damage
 * 3. Heartbeat sound when player is critically low on health
 * 
 * These effects combine to create visceral combat feedback that makes
 * the game feel more responsive and impactful.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Player as SpacetimeDBPlayer } from '../generated';

// --- Screen Shake Configuration ---
const SHAKE_DURATION_MS = 250;           // How long the shake lasts
const SHAKE_INTENSITY_BASE = 6;          // Base shake intensity in pixels
const SHAKE_DECAY_EXPONENT = 2;          // How quickly shake decays (higher = faster)
const MAX_SHAKE_INTENSITY = 12;          // Cap on shake intensity for big hits

// --- Vignette Configuration ---
const VIGNETTE_DURATION_MS = 350;        // How long the red vignette shows
const VIGNETTE_MAX_OPACITY = 0.4;        // Maximum opacity of the red overlay
const VIGNETTE_DECAY_EXPONENT = 1.5;     // How quickly vignette fades

// --- Low Health Configuration ---
const LOW_HEALTH_THRESHOLD = 25;         // Health % to trigger heartbeat (25%)
const CRITICAL_HEALTH_THRESHOLD = 15;    // Health % for critical health visual effects
const HEARTBEAT_INTERVAL = 1200;         // ms between beats (constant speed)

interface DamageEffectsResult {
  // Screen shake offset to apply to camera
  shakeOffsetX: number;
  shakeOffsetY: number;
  
  // Vignette effect state
  vignetteOpacity: number;
  
  // Low health state
  isLowHealth: boolean;
  isCriticalHealth: boolean;
  heartbeatPulse: number; // 0-1 for visual pulse effect
}

export function useDamageEffects(
  localPlayer: SpacetimeDBPlayer | null | undefined,
  maxHealth: number = 100
): DamageEffectsResult {
  // Track previous health to detect damage amount
  const prevHealthRef = useRef<number | null>(null);
  // Track previous lastHitTime to detect COMBAT damage (not environmental like cold/burn)
  // Use undefined as initial value to distinguish "first render" from "was null"
  const prevLastHitTimeRef = useRef<bigint | null | undefined>(undefined);
  
  // Shake state
  const [shakeOffsetX, setShakeOffsetX] = useState(0);
  const [shakeOffsetY, setShakeOffsetY] = useState(0);
  const shakeStartTimeRef = useRef<number | null>(null);
  const shakeIntensityRef = useRef(0);
  
  // Vignette state
  const [vignetteOpacity, setVignetteOpacity] = useState(0);
  const vignetteStartTimeRef = useRef<number | null>(null);
  
  // Low health state
  const [isLowHealth, setIsLowHealth] = useState(false);
  const [isCriticalHealth, setIsCriticalHealth] = useState(false);
  const [heartbeatPulse, setHeartbeatPulse] = useState(0);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatAudioRef = useRef<HTMLAudioElement | null>(null);
  // Track previous low health state with ref to avoid dependency issues
  const wasLowHealthRef = useRef(false);
  const wasCriticalRef = useRef(false);
  
  // Animation frame ref for shake/vignette animation
  const animationFrameRef = useRef<number | null>(null);
  
  // Trigger shake effect
  const triggerShake = useCallback((damageAmount: number) => {
    // Scale intensity based on damage (more damage = stronger shake)
    const damagePercent = Math.min(damageAmount / maxHealth, 0.5);
    const intensity = Math.min(
      SHAKE_INTENSITY_BASE + damagePercent * 20,
      MAX_SHAKE_INTENSITY
    );
    
    shakeIntensityRef.current = intensity;
    shakeStartTimeRef.current = performance.now();
  }, [maxHealth]);
  
  // Trigger vignette effect
  const triggerVignette = useCallback((damageAmount: number) => {
    // Scale opacity based on damage
    const damagePercent = Math.min(damageAmount / maxHealth, 0.5);
    vignetteStartTimeRef.current = performance.now();
    setVignetteOpacity(VIGNETTE_MAX_OPACITY + damagePercent * 0.2);
  }, [maxHealth]);
  
  // Detect COMBAT damage and trigger effects
  // IMPORTANT: Only trigger on lastHitTime changes (attacks/burn), NOT on any health decrease
  // This prevents the red damage overlay from appearing for environmental damage (cold, hunger, etc.)
  useEffect(() => {
    if (!localPlayer) {
      prevHealthRef.current = null;
      prevLastHitTimeRef.current = undefined; // Reset to undefined (first render state)
      return;
    }
    
    const currentHealth = localPlayer.health;
    const prevHealth = prevHealthRef.current;
    
    // Get current lastHitTime as bigint for comparison (microseconds since epoch)
    const currentLastHitTime = localPlayer.lastHitTime?.microsSinceUnixEpoch ?? null;
    const prevLastHitTime = prevLastHitTimeRef.current;
    
    // Trigger damage effects when lastHitTime changes (indicates combat/burn hit)
    // CRITICAL: Use undefined as sentinel for "first render" vs null for "no previous hit"
    // This correctly handles:
    // - First render (prevLastHitTime === undefined): DON'T trigger (might be stale from previous session)
    // - First hit (prevLastHitTime === null, currentLastHitTime !== null): DO trigger
    // - Subsequent hits (currentLastHitTime > prevLastHitTime): DO trigger
    const wasHitInCombat = currentLastHitTime !== null && 
                          prevLastHitTime !== undefined && // not first render
                          (prevLastHitTime === null || currentLastHitTime > prevLastHitTime);
    
    // Trigger effects when lastHitTime changed - the server only updates this for actual damage
    // Use health decrease if we can detect it, otherwise use default damage amount
    // (Health and lastHitTime updates might arrive in separate React renders)
    if (wasHitInCombat) {
      let damageAmount = 5.0; // Default for burn/DOT effects
      
      // If we can detect the health decrease in this render, use actual damage
      if (prevHealth !== null && currentHealth < prevHealth) {
        damageAmount = prevHealth - currentHealth;
      }
      
      // Trigger effects (minimum threshold removed since server already filters significant damage)
      triggerShake(damageAmount);
      triggerVignette(damageAmount);
    }
    
    // Update prev references
    prevHealthRef.current = currentHealth;
    prevLastHitTimeRef.current = currentLastHitTime;
  }, [localPlayer?.health, localPlayer?.lastHitTime, triggerShake, triggerVignette]);
  
  // Animation loop for shake and vignette decay
  useEffect(() => {
    const animate = () => {
      const now = performance.now();
      
      // Update shake
      if (shakeStartTimeRef.current !== null) {
        const elapsed = now - shakeStartTimeRef.current;
        
        if (elapsed < SHAKE_DURATION_MS) {
          // Calculate decay (starts strong, fades out)
          const progress = elapsed / SHAKE_DURATION_MS;
          const decay = Math.pow(1 - progress, SHAKE_DECAY_EXPONENT);
          const currentIntensity = shakeIntensityRef.current * decay;
          
          // Random shake offset
          setShakeOffsetX((Math.random() - 0.5) * 2 * currentIntensity);
          setShakeOffsetY((Math.random() - 0.5) * 2 * currentIntensity);
        } else {
          // Shake finished
          setShakeOffsetX(0);
          setShakeOffsetY(0);
          shakeStartTimeRef.current = null;
        }
      }
      
      // Update vignette
      if (vignetteStartTimeRef.current !== null) {
        const elapsed = now - vignetteStartTimeRef.current;
        
        if (elapsed < VIGNETTE_DURATION_MS) {
          const progress = elapsed / VIGNETTE_DURATION_MS;
          const decay = Math.pow(1 - progress, VIGNETTE_DECAY_EXPONENT);
          setVignetteOpacity(prev => Math.max(0, prev * decay));
        } else {
          setVignetteOpacity(0);
          vignetteStartTimeRef.current = null;
        }
      }
      
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    
    animationFrameRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);
  
  // Low health detection and heartbeat
  // NOTE: Using refs for wasLowHealth/wasCritical to avoid dependency array issues
  // that would cause the cleanup to run and kill the interval on every state change
  useEffect(() => {
    if (!localPlayer || localPlayer.isDead) {
      setIsLowHealth(false);
      setIsCriticalHealth(false);
      setHeartbeatPulse(0);
      wasLowHealthRef.current = false;
      wasCriticalRef.current = false;
      
      // Stop heartbeat audio
      if (heartbeatAudioRef.current) {
        heartbeatAudioRef.current.pause();
        heartbeatAudioRef.current.currentTime = 0;
      }
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      return;
    }
    
    const healthPercent = (localPlayer.health / maxHealth) * 100;
    const wasLowHealth = wasLowHealthRef.current;
    const wasCritical = wasCriticalRef.current;
    
    const nowLowHealth = healthPercent <= LOW_HEALTH_THRESHOLD;
    const nowCritical = healthPercent <= CRITICAL_HEALTH_THRESHOLD;
    
    // Update state for UI
    setIsLowHealth(nowLowHealth);
    setIsCriticalHealth(nowCritical);
    
    // Helper function to play heartbeat sound and pulse
    const playHeartbeat = () => {
      // Pulse animation: 0 -> 1 -> 0 over ~300ms
      setHeartbeatPulse(1);
      setTimeout(() => setHeartbeatPulse(0.5), 100);
      setTimeout(() => setHeartbeatPulse(0), 200);
      
      // Play heartbeat sound (client-side, loud and clear)
      try {
        if (!heartbeatAudioRef.current) {
          heartbeatAudioRef.current = new Audio('/sounds/heartbeat.mp3');
        }
        // Set volume HIGH - this is a critical warning sound
        heartbeatAudioRef.current.volume = 0.85;
        heartbeatAudioRef.current.currentTime = 0;
        heartbeatAudioRef.current.play().catch((err) => {
          console.warn('[Heartbeat] Audio play failed:', err.message);
        });
      } catch (e) {
        console.warn('[Heartbeat] Audio error:', e);
      }
    };
    
    // Handle heartbeat sound and pulse
    if (nowLowHealth && !wasLowHealth) {
      // Started low health - begin heartbeat
      console.log('[Heartbeat] Starting heartbeat - player at low health:', healthPercent.toFixed(1) + '%');
      
      // Clear any existing interval
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
      
      // Play immediately and start interval (constant speed regardless of health level)
      playHeartbeat();
      heartbeatIntervalRef.current = setInterval(playHeartbeat, HEARTBEAT_INTERVAL);
      
    } else if (!nowLowHealth && wasLowHealth) {
      // Recovered from low health - stop heartbeat
      console.log('[Heartbeat] Stopping heartbeat - player recovered:', healthPercent.toFixed(1) + '%');
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      if (heartbeatAudioRef.current) {
        heartbeatAudioRef.current.pause();
        heartbeatAudioRef.current.currentTime = 0;
      }
      setHeartbeatPulse(0);
    }
    // Note: Heartbeat speed stays constant - no speed adjustment at critical health
    
    // Update refs for next comparison
    wasLowHealthRef.current = nowLowHealth;
    wasCriticalRef.current = nowCritical;
    
    // NO cleanup here - we don't want to clear the interval when deps change
    // The interval is managed explicitly above
  }, [localPlayer?.health, localPlayer?.isDead, maxHealth]);
  
  // Separate cleanup effect that only runs on unmount
  useEffect(() => {
    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      if (heartbeatAudioRef.current) {
        heartbeatAudioRef.current.pause();
      }
    };
  }, []);
  
  return {
    shakeOffsetX,
    shakeOffsetY,
    vignetteOpacity,
    isLowHealth,
    isCriticalHealth,
    heartbeatPulse,
  };
}
