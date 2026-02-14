/**
 * ErrorDisplay
 *
 * Red rectangle with white text, positioned above the XP bar (above the hotbar).
 * Fades out in 2 seconds or when clicked.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useErrorDisplay } from '../contexts/ErrorDisplayContext';

// Match Hotbar layout constants
const HOTBAR_BOTTOM_DESKTOP = 15;
const SLOT_SIZE_DESKTOP = 60;
const SLOT_MARGIN = 6;
const XP_BAR_HEIGHT = 20;
const HOTBAR_BOTTOM_MOBILE = 90;
const SLOT_SIZE_MOBILE = 48;

function getBottomOffset(isMobile: boolean): number {
  const hotbarBottom = isMobile ? HOTBAR_BOTTOM_MOBILE : HOTBAR_BOTTOM_DESKTOP;
  const slotSize = isMobile ? SLOT_SIZE_MOBILE : SLOT_SIZE_DESKTOP;
  // XP bar sits above hotbar; error display sits above XP bar
  return hotbarBottom + slotSize + SLOT_MARGIN * 2 + 8 + XP_BAR_HEIGHT + 8;
}

interface ErrorDisplayProps {
  isMobile?: boolean;
}

const ErrorDisplay: React.FC<ErrorDisplayProps> = ({ isMobile = false }) => {
  const { currentError, dismissError } = useErrorDisplay();
  const [isFading, setIsFading] = useState(false);
  const bottomOffset = getBottomOffset(isMobile);

  useEffect(() => {
    if (!currentError) {
      setIsFading(false);
      return;
    }
    // Start fade ~1.5s in so user has time to read
    const fadeTimer = setTimeout(() => setIsFading(true), 1500);
    return () => clearTimeout(fadeTimer);
  }, [currentError?.id]);

  const handleClick = useCallback(() => {
    dismissError();
  }, [dismissError]);

  if (!currentError) return null;

  return (
    <div
      role="alert"
      onClick={handleClick}
      onKeyDown={(e) => e.key === 'Enter' && handleClick()}
      tabIndex={0}
      style={{
        position: 'fixed',
        left: '50%',
        transform: 'translateX(-50%)',
        bottom: `${bottomOffset}px`,
        minWidth: '200px',
        maxWidth: 'min(90vw, 400px)',
        padding: '8px 14px',
        background: 'rgba(180, 40, 40, 0.95)',
        border: '1px solid rgba(255, 100, 100, 0.6)',
        borderRadius: '4px',
        color: '#ffffff',
        fontSize: '12px',
        fontFamily: '"Press Start 2P", cursive',
        textAlign: 'center',
        cursor: 'pointer',
        zIndex: 1000,
        opacity: isFading ? 0 : 1,
        transition: 'opacity 0.5s ease-out',
        boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
      }}
    >
      {currentError.message}
    </div>
  );
};

export default ErrorDisplay;
