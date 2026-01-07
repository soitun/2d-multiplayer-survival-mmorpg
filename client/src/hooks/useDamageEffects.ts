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
const CRITICAL_HEALTH_THRESHOLD = 15;    // Health % for faster heartbeat (15%)
const HEARTBEAT_INTERVAL_NORMAL = 1200;  // ms between beats at low health
const HEARTBEAT_INTERVAL_CRITICAL = 800; // ms between beats at critical health

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
  // Track previous health to detect damage
  const prevHealthRef = useRef<number | null>(null);
  
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
  
  // Detect damage and trigger effects
  useEffect(() => {
    if (!localPlayer) {
      prevHealthRef.current = null;
      return;
    }
    
    const currentHealth = localPlayer.health;
    const prevHealth = prevHealthRef.current;
    
    // Check for damage (health decreased)
    if (prevHealth !== null && currentHealth < prevHealth) {
      const damageAmount = prevHealth - currentHealth;
      
      // Only trigger effects for significant damage (more than 0.5)
      if (damageAmount > 0.5) {
        triggerShake(damageAmount);
        triggerVignette(damageAmount);
      }
    }
    
    // Update prev health reference
    prevHealthRef.current = currentHealth;
  }, [localPlayer?.health, triggerShake, triggerVignette]);
  
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
  useEffect(() => {
    if (!localPlayer || localPlayer.isDead) {
      setIsLowHealth(false);
      setIsCriticalHealth(false);
      setHeartbeatPulse(0);
      
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
    const wasLowHealth = isLowHealth;
    const wasCritical = isCriticalHealth;
    
    const nowLowHealth = healthPercent <= LOW_HEALTH_THRESHOLD;
    const nowCritical = healthPercent <= CRITICAL_HEALTH_THRESHOLD;
    
    setIsLowHealth(nowLowHealth);
    setIsCriticalHealth(nowCritical);
    
    // Handle heartbeat sound and pulse
    if (nowLowHealth && !wasLowHealth) {
      // Started low health - begin heartbeat
      const interval = nowCritical ? HEARTBEAT_INTERVAL_CRITICAL : HEARTBEAT_INTERVAL_NORMAL;
      
      // Clear any existing interval
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
      
      // Start heartbeat pulse animation
      const startHeartbeat = () => {
        // Pulse animation: 0 -> 1 -> 0 over ~300ms
        setHeartbeatPulse(1);
        setTimeout(() => setHeartbeatPulse(0.5), 100);
        setTimeout(() => setHeartbeatPulse(0), 200);
        
        // Play heartbeat sound (client-side, not from server)
        try {
          if (!heartbeatAudioRef.current) {
            heartbeatAudioRef.current = new Audio('/sounds/heartbeat.mp3');
            heartbeatAudioRef.current.volume = 0.4;
          }
          heartbeatAudioRef.current.currentTime = 0;
          heartbeatAudioRef.current.play().catch(() => {
            // Ignore autoplay errors
          });
        } catch (e) {
          // Ignore audio errors
        }
      };
      
      startHeartbeat();
      heartbeatIntervalRef.current = setInterval(startHeartbeat, interval);
    } else if (!nowLowHealth && wasLowHealth) {
      // Recovered from low health - stop heartbeat
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      if (heartbeatAudioRef.current) {
        heartbeatAudioRef.current.pause();
        heartbeatAudioRef.current.currentTime = 0;
      }
      setHeartbeatPulse(0);
    } else if (nowCritical !== wasCritical && nowLowHealth) {
      // Crossed critical threshold - adjust heartbeat speed
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
      
      const interval = nowCritical ? HEARTBEAT_INTERVAL_CRITICAL : HEARTBEAT_INTERVAL_NORMAL;
      
      const doHeartbeat = () => {
        setHeartbeatPulse(1);
        setTimeout(() => setHeartbeatPulse(0.5), 100);
        setTimeout(() => setHeartbeatPulse(0), 200);
        
        try {
          if (heartbeatAudioRef.current) {
            heartbeatAudioRef.current.currentTime = 0;
            heartbeatAudioRef.current.play().catch(() => {});
          }
        } catch (e) {}
      };
      
      heartbeatIntervalRef.current = setInterval(doHeartbeat, interval);
    }
    
    // Cleanup on unmount
    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
    };
  }, [localPlayer?.health, localPlayer?.isDead, maxHealth, isLowHealth, isCriticalHealth]);
  
  return {
    shakeOffsetX,
    shakeOffsetY,
    vignetteOpacity,
    isLowHealth,
    isCriticalHealth,
    heartbeatPulse,
  };
}
