/**
 * Cairn Audio Utilities
 * 
 * Handles playing cairn lore audio files with proper fallbacks
 * and error handling.
 * 
 * Audio files are located in public/sounds/sova_lore_*.mp3
 */

/**
 * Get the audio filename for a given lore index
 * Uses sova_lore_{index}.mp3 naming convention
 */
function getLoreAudioFilename(loreIndex: number): string {
  return `sova_lore_${loreIndex}.mp3`;
}

// Currently playing audio reference to prevent overlaps
let currentCairnAudio: HTMLAudioElement | null = null;

/**
 * Play cairn lore audio by lore index
 * @param loreIndex The index of the lore entry (1-based)
 * @param volume Volume level (0-1)
 * @returns Promise that resolves when audio starts playing, or rejects on error
 */
export async function playCairnLoreAudio(loreIndex: number, volume: number = 0.8): Promise<void> {
  // If already playing, don't interrupt
  if (currentCairnAudio && !currentCairnAudio.paused) {
    console.log('[CairnAudio] Audio already playing, skipping new playback');
    return;
  }

  // Stop any previous audio that might be paused
  if (currentCairnAudio) {
    currentCairnAudio.pause();
    currentCairnAudio.currentTime = 0;
    currentCairnAudio = null;
  }

  const filename = getLoreAudioFilename(loreIndex);
  const audioPath = `/sounds/${filename}`;
  console.log(`[CairnAudio] Playing lore audio: ${audioPath}`);

  return new Promise((resolve, reject) => {
    try {
      const audio = new Audio(audioPath);
      audio.volume = volume;
      
      // Store reference
      currentCairnAudio = audio;

      // Clear reference when audio ends
      audio.onended = () => {
        console.log(`[CairnAudio] Audio finished: ${filename}`);
        currentCairnAudio = null;
      };

      audio.onerror = (e) => {
        console.error(`[CairnAudio] Audio error for ${filename}:`, e);
        currentCairnAudio = null;
        // Don't reject - we want the cairn interaction to continue even if audio fails
        resolve();
      };

      audio.play()
        .then(() => {
          console.log(`[CairnAudio] ✅ Audio playing successfully: ${filename}`);
          resolve();
        })
        .catch((error) => {
          console.warn(`[CairnAudio] Failed to play audio ${filename}:`, error);
          currentCairnAudio = null;
          // Don't reject - we want the cairn interaction to continue even if audio fails
          resolve();
        });
    } catch (error) {
      console.error(`[CairnAudio] Error creating audio for ${filename}:`, error);
      resolve(); // Resolve anyway to not block the interaction
    }
  });
}

/**
 * Stop currently playing cairn audio
 */
export function stopCairnLoreAudio(): void {
  if (currentCairnAudio) {
    currentCairnAudio.pause();
    currentCairnAudio.currentTime = 0;
    currentCairnAudio = null;
    console.log('[CairnAudio] Audio stopped');
  }
}

/**
 * Check if cairn audio is currently playing
 */
export function isCairnAudioPlaying(): boolean {
  return currentCairnAudio !== null && !currentCairnAudio.paused;
}

/**
 * Get the total number of cairn lore entries
 */
export function getTotalCairnLoreCount(): number {
  return 26; // Total number of lore entries in CAIRN_LORE_TIDBITS
}
