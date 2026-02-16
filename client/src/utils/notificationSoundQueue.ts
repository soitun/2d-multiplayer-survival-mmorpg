/**
 * Notification Sound Manager
 * 
 * Ensures level up, achievement unlock, and mission complete sounds
 * never play over each other. If SOVA is already speaking (tutorials, intro,
 * cairn lore, etc.), notification sounds are SKIPPED entirely - not queued.
 * This prevents annoying sound bursts after long SOVA audio finishes.
 * 
 * If multiple notification sounds are triggered at the same time (e.g., level up
 * + achievement), they play sequentially with a small gap between them.
 * 
 * Usage:
 * ```ts
 * import { queueNotificationSound } from '../utils/notificationSoundQueue';
 * 
 * // Play a level up sound (if not blocked by SOVA)
 * queueNotificationSound('level_up');
 * ```
 */

import { isAnySovaAudioPlaying } from '../hooks/useSovaSoundBox';

// Sound types for notifications
export type NotificationSoundType = 'level_up' | 'achievement' | 'mission_complete';

// Sound file paths
const SOVA_SOUNDS: Record<NotificationSoundType, string> = {
  level_up: '/sounds/sova_level_up.mp3',
  achievement: '/sounds/sova_achievement_unlocked.mp3',
  mission_complete: '/sounds/sova_mission_complete.mp3',
};

const SFX_SOUND = '/sounds/progress_unlocked.mp3';

// Queue state - only for sounds triggered at same time (not for waiting on SOVA)
interface QueuedSound {
  type: NotificationSoundType;
  timestamp: number;
}

let soundQueue: QueuedSound[] = [];
let isProcessingQueue = false;
let currentAudio: HTMLAudioElement | null = null;
let lastSfxPlayedAt = 0;

// Debounce time for SFX (prevents multiple rapid SFX plays)
const SFX_DEBOUNCE_MS = 500;

// Maximum wait time before playing next sound (in case audio ends event doesn't fire)
const MAX_SOUND_DURATION_MS = 5000;

// Maximum age of a queued sound before it's considered stale and skipped
const MAX_QUEUE_AGE_MS = 6000;

/**
 * Play a notification sound if not blocked by SOVA.
 * If SOVA is currently speaking, the sound is SKIPPED entirely (not queued).
 * If another notification sound is currently playing, this one is queued
 * to play immediately after (within a few seconds).
 */
export function queueNotificationSound(type: NotificationSoundType): void {
  const now = Date.now();
  
  // If SOVA is currently speaking (tutorial, intro, cairn lore, etc.), SKIP entirely
  // Don't queue - just drop the sound. The visual notification is still shown.
  // 
  // IMPORTANT: isAnySovaAudioPlaying() checks multiple sources:
  // 1. SovaSoundBox "is active" flag (set immediately when showSovaSoundBox is called)
  // 2. SovaSoundBox actual playback state
  // 3. Loading screen audio
  // 4. Cairn audio (both pending and playing states)
  const sovaPlaying = isAnySovaAudioPlaying();
  if (sovaPlaying) {
    console.log(`[NotificationSoundQueue] ⏸️ SKIPPING ${type} sound - SOVA is speaking (checked: SovaSoundBox active/playing, LoadingScreen, CairnAudio)`);
    return;
  }
  
  // Check if this exact sound type was recently queued (dedup within 100ms)
  const recentSameType = soundQueue.some(s => s.type === type && now - s.timestamp < 100);
  if (recentSameType) {
    console.log(`[NotificationSoundQueue] Ignoring duplicate ${type} sound (queued within 100ms)`);
    return;
  }
  
  // Add to queue
  soundQueue.push({ type, timestamp: now });
  console.log(`[NotificationSoundQueue] Queued ${type} sound. Queue length: ${soundQueue.length}`);
  
  // Start processing if not already
  if (!isProcessingQueue) {
    processQueue();
  }
}

/**
 * Process the sound queue - plays sounds one at a time
 */
async function processQueue(): Promise<void> {
  if (isProcessingQueue) return;
  isProcessingQueue = true;
  
  while (soundQueue.length > 0) {
    const now = Date.now();
    
    // Get next sound from queue
    const nextSound = soundQueue.shift();
    if (!nextSound) break;
    
    // Skip sounds that have been in the queue too long (stale)
    if (now - nextSound.timestamp > MAX_QUEUE_AGE_MS) {
      console.log(`[NotificationSoundQueue] Skipping stale ${nextSound.type} sound (${now - nextSound.timestamp}ms old)`);
      continue;
    }
    
    // If SOVA started speaking while we were processing, skip remaining sounds
    // This can happen if cairn/tutorial audio starts during queue processing
    if (isAnySovaAudioPlaying()) {
      console.log(`[NotificationSoundQueue] ⏸️ SKIPPING ${nextSound.type} - SOVA started speaking during queue processing`);
      // Clear the rest of the queue too
      soundQueue = [];
      break;
    }
    
    console.log(`[NotificationSoundQueue] Playing ${nextSound.type} sound`);
    
    // Play SOVA voice line
    await playSovaSound(nextSound.type);
    
    // Play SFX with debounce
    playSfxSound();
    
    // Small gap between notification sounds for clarity
    await sleep(200);
  }
  
  isProcessingQueue = false;
  console.log('[NotificationSoundQueue] Queue processing complete');
}

/**
 * Play the SOVA voice line for a notification type
 */
async function playSovaSound(type: NotificationSoundType): Promise<void> {
  return new Promise((resolve) => {
    try {
      const soundPath = SOVA_SOUNDS[type];
      if (!soundPath) {
        console.warn(`[NotificationSoundQueue] Unknown sound type: ${type}`);
        resolve();
        return;
      }
      
      // Stop any currently playing notification audio
      if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        currentAudio = null;
      }
      
      const audio = new Audio(soundPath);
      audio.volume = 0.8;
      currentAudio = audio;
      
      // Resolve when sound ends
      const onEnded = () => {
        cleanup();
        resolve();
      };
      
      // Also resolve on error
      const onError = (e: Event) => {
        console.warn(`[NotificationSoundQueue] Audio error for ${type}:`, e);
        cleanup();
        resolve();
      };
      
      const cleanup = () => {
        audio.removeEventListener('ended', onEnded);
        audio.removeEventListener('error', onError);
        if (currentAudio === audio) {
          currentAudio = null;
        }
      };
      
      audio.addEventListener('ended', onEnded);
      audio.addEventListener('error', onError);
      
      // Safety timeout in case ended event never fires
      setTimeout(() => {
        if (currentAudio === audio) {
          console.log(`[NotificationSoundQueue] Safety timeout for ${type} sound`);
          cleanup();
          resolve();
        }
      }, MAX_SOUND_DURATION_MS);
      
      audio.play().catch((err) => {
        console.warn(`[NotificationSoundQueue] Failed to play ${type} sound:`, err.message);
        cleanup();
        resolve();
      });
      
    } catch (err) {
      console.warn(`[NotificationSoundQueue] Error setting up ${type} sound:`, err);
      resolve();
    }
  });
}

/**
 * Play the SFX sound with debounce
 */
function playSfxSound(): void {
  const now = Date.now();
  
  // Debounce - don't play if recently played
  if (now - lastSfxPlayedAt < SFX_DEBOUNCE_MS) {
    console.log('[NotificationSoundQueue] SFX debounced');
    return;
  }
  
  lastSfxPlayedAt = now;
  
  try {
    const sfxAudio = new Audio(SFX_SOUND);
    sfxAudio.volume = 0.5;
    sfxAudio.play().catch(() => {
      // Ignore SFX play errors
    });
  } catch (err) {
    // Ignore SFX errors
  }
}

/**
 * Check if notification sounds are currently playing
 */
export function isNotificationSoundPlaying(): boolean {
  return isProcessingQueue || (currentAudio !== null && !currentAudio.paused);
}

/**
 * Stop any currently playing notification sound.
 * Called by showSovaSoundBox when SOVA needs to speak - SOVA takes priority.
 */
export function stopNotificationSound(): void {
  if (currentAudio) {
    console.log('[NotificationSoundQueue] 🛑 Stopping notification sound - SOVA taking priority');
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
  // Also clear the queue to prevent pending sounds from playing over SOVA
  if (soundQueue.length > 0) {
    console.log(`[NotificationSoundQueue] 🛑 Clearing ${soundQueue.length} pending sounds - SOVA taking priority`);
    soundQueue = [];
  }
}

/**
 * Clear the sound queue (e.g., when player dies or disconnects)
 */
export function clearNotificationSoundQueue(): void {
  soundQueue = [];
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
  isProcessingQueue = false;
  console.log('[NotificationSoundQueue] Queue cleared');
}

// Helper function
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Expose globally for debugging
if (typeof window !== 'undefined') {
  (window as any).__notificationSoundQueue = {
    queue: () => soundQueue,
    isProcessing: () => isProcessingQueue,
    clear: clearNotificationSoundQueue,
  };
}
