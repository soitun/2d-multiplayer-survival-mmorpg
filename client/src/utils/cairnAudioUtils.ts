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

// Flag to indicate cairn audio is pending (created but not yet playing)
// This prevents race conditions where notification sounds could sneak in
// during the time between createCairnLoreAudio and audio.play()
let cairnAudioPending: boolean = false;

/**
 * Create cairn lore audio element without playing it
 * Used when we want to pass the audio to SovaSoundBox for playback
 * @param loreIndex The index of the lore entry (1-based)
 * @param volume Volume level (0-1)
 * @returns The audio element, or null if creation failed
 */
export function createCairnLoreAudio(loreIndex: number, volume: number = 0.8): HTMLAudioElement | null {
  // If already playing or pending, don't create new audio
  if (cairnAudioPending || (currentCairnAudio && !currentCairnAudio.paused)) {
    console.log('[CairnAudio] Audio already playing or pending, skipping new audio creation');
    return null;
  }

  // Stop any previous audio that might be paused
  if (currentCairnAudio) {
    currentCairnAudio.pause();
    currentCairnAudio.currentTime = 0;
    currentCairnAudio = null;
  }

  const filename = getLoreAudioFilename(loreIndex);
  const audioPath = `/sounds/${filename}`;
  console.log(`[CairnAudio] Creating lore audio: ${audioPath}`);

  try {
    const audio = new Audio(audioPath);
    audio.volume = volume;
    
    // CRITICAL: Set pending flag IMMEDIATELY to prevent race conditions
    // This flag is checked by isCairnAudioPlaying() and prevents notification
    // sounds from playing during the brief window before audio.play() completes
    cairnAudioPending = true;
    
    // Store reference
    currentCairnAudio = audio;

    // Clear references when audio ends
    audio.onended = () => {
      console.log(`[CairnAudio] Audio finished: ${filename}`);
      currentCairnAudio = null;
      cairnAudioPending = false;
    };

    audio.onerror = (e) => {
      console.error(`[CairnAudio] Audio error for ${filename}:`, e);
      currentCairnAudio = null;
      cairnAudioPending = false;
    };

    return audio;
  } catch (error) {
    console.error(`[CairnAudio] Error creating audio for ${filename}:`, error);
    cairnAudioPending = false;
    return null;
  }
}

/**
 * Play cairn lore audio by lore index (standalone playback without SovaSoundBox)
 * @param loreIndex The index of the lore entry (1-based)
 * @param volume Volume level (0-1)
 * @returns Promise that resolves when audio starts playing, or rejects on error
 */
export async function playCairnLoreAudio(loreIndex: number, volume: number = 0.8): Promise<void> {
  const audio = createCairnLoreAudio(loreIndex, volume);
  if (!audio) {
    return; // Audio creation failed or already playing
  }

  return new Promise((resolve) => {
    audio.play()
      .then(() => {
        const filename = getLoreAudioFilename(loreIndex);
        console.log(`[CairnAudio] ✅ Audio playing successfully: ${filename}`);
        resolve();
      })
      .catch((error) => {
        const filename = getLoreAudioFilename(loreIndex);
        console.warn(`[CairnAudio] Failed to play audio ${filename}:`, error);
        // Clear both the audio reference AND the pending flag on failure
        currentCairnAudio = null;
        cairnAudioPending = false;
        // Don't reject - we want the cairn interaction to continue even if audio fails
        resolve();
      });
  });
}

/**
 * Stop currently playing cairn audio
 */
export function stopCairnLoreAudio(): void {
  cairnAudioPending = false;
  if (currentCairnAudio) {
    currentCairnAudio.pause();
    currentCairnAudio.currentTime = 0;
    currentCairnAudio = null;
    console.log('[CairnAudio] Audio stopped');
  }
}

/**
 * Check if cairn audio is currently playing or pending (about to play).
 * 
 * IMPORTANT: This includes a "pending" check that returns true immediately
 * when createCairnLoreAudio is called, BEFORE audio.play() completes.
 * This prevents race conditions where notification sounds could sneak in
 * during the brief window between audio creation and playback start.
 */
export function isCairnAudioPlaying(): boolean {
  // Check pending flag first - this catches the race condition window
  if (cairnAudioPending) {
    return true;
  }
  // Also check actual playback state
  return currentCairnAudio !== null && !currentCairnAudio.paused;
}

/**
 * Get the total number of cairn lore entries
 */
export function getTotalCairnLoreCount(): number {
  return 14; // Total number of lore entries in CAIRN_LORE_TIDBITS
}