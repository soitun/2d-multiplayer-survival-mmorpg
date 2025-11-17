import { useEffect, useRef } from 'react';
import { calculateChunkIndex } from '../utils/chunkUtils';

interface UseChunkBasedRainSoundsProps {
  connection: any | null;
  localPlayer: any | undefined;
  chunkWeather: Map<string, any>;
}

/**
 * Hook to manage rain sounds based on the player's current chunk weather.
 * Plays appropriate rain sounds when entering chunks with rain, and stops them when leaving.
 * Uses 1-second crossfade for smooth transitions between different rain intensities.
 */
export function useChunkBasedRainSounds({ 
  connection, 
  localPlayer, 
  chunkWeather 
}: UseChunkBasedRainSoundsProps) {
  const currentWeatherTypeRef = useRef<string | null>(null);
  const lastChunkIndexRef = useRef<number | null>(null);
  const crossfadeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!connection || !localPlayer || !chunkWeather) return;

    // Calculate current chunk index
    const currentChunkIndex = calculateChunkIndex(localPlayer.positionX, localPlayer.positionY);
    const chunkWeatherData = chunkWeather.get(currentChunkIndex.toString());
    
    // Determine current weather type
    const currentWeatherType = chunkWeatherData?.currentWeather?.tag || 'Clear';
    
    // Check if chunk or weather changed
    const chunkChanged = lastChunkIndexRef.current !== currentChunkIndex;
    const weatherChanged = currentWeatherTypeRef.current !== currentWeatherType;
    
    if (chunkChanged || weatherChanged) {
      const oldWeather = currentWeatherTypeRef.current;
      
      // Clear any pending crossfade
      if (crossfadeTimeoutRef.current) {
        clearTimeout(crossfadeTimeoutRef.current);
        crossfadeTimeoutRef.current = null;
      }
      
      // If weather changed, use crossfade for smooth transition
      if (weatherChanged && oldWeather && oldWeather !== 'Clear' && currentWeatherType !== 'Clear') {
        // Crossfade: Start new sound first, then stop old sound after 1 second
        // console.log(`[RainSounds] 🔄 Crossfading from ${oldWeather} to ${currentWeatherType}`);
        startRainSoundsForWeather(connection, currentWeatherType);
        
        crossfadeTimeoutRef.current = setTimeout(() => {
          stopRainSoundsForWeather(connection, oldWeather);
          crossfadeTimeoutRef.current = null;
        }, 1000); // 1 second crossfade
      } else {
        // Immediate transition (entering/leaving rain, or first time)
        if (weatherChanged && oldWeather) {
          stopRainSoundsForWeather(connection, oldWeather);
        }
        startRainSoundsForWeather(connection, currentWeatherType);
      }
      
      // Update refs
      currentWeatherTypeRef.current = currentWeatherType;
      lastChunkIndexRef.current = currentChunkIndex;
    }
  }, [connection, localPlayer, chunkWeather, localPlayer?.positionX, localPlayer?.positionY]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Clear any pending crossfade timeout
      if (crossfadeTimeoutRef.current) {
        clearTimeout(crossfadeTimeoutRef.current);
      }
      
      if (connection && currentWeatherTypeRef.current) {
        // console.log('[RainSounds] Cleanup - stopping all rain sounds');
        stopRainSoundsForWeather(connection, currentWeatherTypeRef.current);
      }
    };
  }, [connection]);
}

/**
 * Start rain sounds appropriate for the given weather type
 */
function startRainSoundsForWeather(connection: any, weatherType: string) {
  if (!connection?.reducers) return;

  try {
    switch (weatherType) {
      case 'HeavyRain':
      case 'HeavyStorm':
        // Start heavy storm rain sound
        // console.log('[RainSounds] 🌧️ Starting heavy storm rain sound');
        connection.reducers.startHeavyStormRainSoundReducer?.();
        break;
      
      case 'LightRain':
      case 'ModerateRain':
        // Start normal rain sound
        // console.log('[RainSounds] 🌦️ Starting normal rain sound');
        connection.reducers.startNormalRainSoundReducer?.();
        break;
      
      case 'Clear':
        // No sound needed for clear weather
        // console.log('[RainSounds] ☀️ Clear weather - no rain sounds');
        break;
      
      default:
        // console.warn(`[RainSounds] Unknown weather type: ${weatherType}`);
    }
  } catch (error) {
    // console.error('[RainSounds] Error starting rain sound:', error);
  }
}

/**
 * Stop rain sounds for the given weather type
 */
function stopRainSoundsForWeather(connection: any, weatherType: string) {
  if (!connection?.reducers) return;

  try {
    switch (weatherType) {
      case 'HeavyRain':
      case 'HeavyStorm':
        // Stop heavy storm rain sound
        // console.log('[RainSounds] 🌧️ Stopping heavy storm rain sound');
        connection.reducers.stopHeavyStormRainSoundReducer?.();
        break;
      
      case 'LightRain':
      case 'ModerateRain':
        // Stop normal rain sound
        // console.log('[RainSounds] 🌦️ Stopping normal rain sound');
        connection.reducers.stopNormalRainSoundReducer?.();
        break;
      
      case 'Clear':
        // No sound to stop for clear weather
        break;
      
      default:
        console.warn(`[RainSounds] Unknown weather type to stop: ${weatherType}`);
    }
  } catch (error) {
    console.error('[RainSounds] Error stopping rain sound:', error);
  }
}