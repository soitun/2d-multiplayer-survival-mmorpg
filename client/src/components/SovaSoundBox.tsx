/**
 * SovaSoundBox Component
 * 
 * A dismissible audio notification box that appears when SOVA speaks deterministically
 * (tutorial hints, insanity quotes, entrainment quotes, etc.)
 * 
 * Features:
 * - Animated waveform visualization representing SOVA's voice
 * - Click-to-close functionality that stops the audio
 * - Positioned above the hotbar, centered
 * - Cyberpunk SOVA themed styling
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import './SovaSoundBox.css';
import sovaLogo from '../assets/ui/sova.png';

export interface SovaSoundBoxProps {
  /** The audio element being played - will be stopped when box is closed */
  audio: HTMLAudioElement | null;
  /** Optional label to show what type of SOVA message this is */
  label?: string;
  /** Callback when the box is closed (either by click or audio ending) */
  onClose: () => void;
  /** Whether to auto-close when audio finishes playing */
  autoCloseOnEnd?: boolean;
  /** Position offset from bottom (in pixels) - accounts for hotbar height */
  bottomOffset?: number;
}

// Constants matching Hotbar styling
const HOTBAR_BOTTOM_DESKTOP = 15;
const HOTBAR_HEIGHT_DESKTOP = 60 + 6 * 2 + 4; // slot size + margins + border
const XP_BAR_HEIGHT = 28; // Height of XP bar above hotbar

const SovaSoundBox: React.FC<SovaSoundBoxProps> = ({
  audio,
  label = 'SOVA',
  onClose,
  autoCloseOnEnd = true,
  bottomOffset,
}) => {
  const [isVisible, setIsVisible] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const animationFrameRef = useRef<number | null>(null);
  const barsRef = useRef<HTMLDivElement[]>([]);

  // Calculate bottom position (above hotbar + XP bar)
  const calculatedBottomOffset = bottomOffset ?? (HOTBAR_BOTTOM_DESKTOP + HOTBAR_HEIGHT_DESKTOP + XP_BAR_HEIGHT + 12);

  // Handle close action
  const handleClose = useCallback(() => {
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setIsVisible(false);
    setIsPlaying(false);
    onClose();
  }, [audio, onClose]);

  // Listen for audio end event
  useEffect(() => {
    if (!audio) return;

    const handleEnded = () => {
      setIsPlaying(false);
      if (autoCloseOnEnd) {
        // Small delay before closing to let user see it finished
        setTimeout(() => {
          setIsVisible(false);
          onClose();
        }, 500);
      }
    };

    const handlePause = () => {
      setIsPlaying(false);
    };

    const handlePlay = () => {
      setIsPlaying(true);
    };

    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('play', handlePlay);

    // Set initial playing state
    setIsPlaying(!audio.paused);

    return () => {
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('play', handlePlay);
    };
  }, [audio, autoCloseOnEnd, onClose]);

  // Cleanup animation on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Don't render if not visible
  if (!isVisible) return null;

  const barCount = 12;

  return createPortal(
    <div
      className={`sova-sound-box ${isPlaying ? 'playing' : 'paused'}`}
      style={{ bottom: `${calculatedBottomOffset}px` }}
      onClick={handleClose}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
          handleClose();
        }
      }}
      title="Click to close"
    >
      {/* SOVA Icon */}
      <div className="sova-sound-box-icon">
        <img src={sovaLogo} alt="SOVA" className="sova-icon-image" />
      </div>

      {/* Waveform visualization */}
      <div className="sova-sound-box-waveform">
        {Array.from({ length: barCount }).map((_, index) => (
          <div
            key={index}
            ref={(el) => {
              if (el) barsRef.current[index] = el;
            }}
            className="sova-waveform-bar"
            style={{
              animationDelay: `${index * 0.08}s`,
              height: isPlaying ? undefined : '4px',
            }}
          />
        ))}
      </div>

      {/* Label */}
      <div className="sova-sound-box-label">
        <span className="sova-label-text">{label}</span>
        <span className="sova-close-hint">× CLICK TO CLOSE</span>
      </div>

      {/* Glowing edge effect */}
      <div className="sova-sound-box-glow" />
    </div>,
    document.body
  );
};

export default React.memo(SovaSoundBox);
