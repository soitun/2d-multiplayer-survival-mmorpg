import React, { useEffect, useState, useRef } from 'react';
import { Player, ItemDefinition, RangedWeaponStats, ActiveEquipment } from '../generated/types';
import { Identity } from 'spacetimedb';

interface TargetingReticleProps {
  localPlayer: Player | null;
  playerIdentity: Identity | null;
  activeItemDef: ItemDefinition | null;
  activeEquipment: ActiveEquipment | null;
  rangedWeaponStats: Map<string, RangedWeaponStats>;
  gameCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  cameraOffsetX: number;
  cameraOffsetY: number;
  isInventoryOpen: boolean;
  isGameMenuOpen: boolean;
  isMinimapOpen: boolean; // Hide crosshair when InterfaceContainer is open
}

const TargetingReticle: React.FC<TargetingReticleProps> = ({
  localPlayer,
  playerIdentity,
  activeItemDef,
  activeEquipment,
  rangedWeaponStats,
  gameCanvasRef,
  cameraOffsetX,
  cameraOffsetY,
  isInventoryOpen,
  isGameMenuOpen,
  isMinimapOpen,
}) => {
  // console.log('[TargetingReticle] Component rendering/re-rendering.', { activeItemDefName: activeItemDef?.name, localPlayerExists: !!localPlayer });

  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [reticlePosition, setReticlePosition] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const animationFrameRef = useRef<number | undefined>(undefined);

  // Check if we should show the reticle
  const shouldShowReticle = (
    localPlayer && !localPlayer.isDead && !isInventoryOpen && !isGameMenuOpen && !isMinimapOpen && (
      // Show for ranged weapons
      (activeItemDef && (activeItemDef.category?.tag === 'RangedWeapon' || activeItemDef.name === 'Hunting Bow'))
    )
  );
  
  // Check if weapon is ready to fire (loaded with ammo)
  const isReadyToFire = activeEquipment?.isReadyToFire ?? false;
  
  // Reticle color: red when not loaded, white when ready to fire
  const reticleColor = isReadyToFire ? 'rgba(255, 255, 255, 0.8)' : 'rgba(255, 80, 80, 0.9)';
  const reticleCenterColor = isReadyToFire ? 'rgba(255, 255, 255, 0.6)' : 'rgba(255, 50, 50, 0.8)';
  const reticleSecondaryColor = isReadyToFire ? 'rgba(255, 255, 255, 0.6)' : 'rgba(255, 100, 100, 0.7)';
  
  // Get weapon stats - use actual weapon range from stats
  const weaponStats = activeItemDef ? rangedWeaponStats.get(activeItemDef.name || '') : null;
  const weaponRange = weaponStats?.weaponRange ?? 0;

  // Update rotation continuously for animation
  useEffect(() => {
    if (!shouldShowReticle) return;

    const animate = () => {
      setRotation(prev => (prev + 2) % 360); // Rotate 2 degrees per frame
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    
    animationFrameRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [shouldShowReticle]);

  // Handle mouse movement
  useEffect(() => {
    if (!shouldShowReticle || !gameCanvasRef.current || !localPlayer) return;

    const canvas = gameCanvasRef.current;
    
    const handleMouseMove = (event: MouseEvent) => {
      const viewportMouseX = event.clientX;
      const viewportMouseY = event.clientY;
      
      const canvasRect = canvas.getBoundingClientRect();
      const playerViewportX = localPlayer.positionX + cameraOffsetX + canvasRect.left;
      const playerViewportY = localPlayer.positionY + cameraOffsetY + canvasRect.top;
      
      const deltaX = viewportMouseX - playerViewportX;
      const deltaY = viewportMouseY - playerViewportY;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      // console.log('[Reticle MouseMove]', {
      //   viewportMouseX, viewportMouseY,
      //   playerWorldX: localPlayer.positionX, playerWorldY: localPlayer.positionY,
      //   cameraOffsetX, cameraOffsetY,
      //   canvasRectLeft: canvasRect.left, canvasRectTop: canvasRect.top,
      //   playerViewportX, playerViewportY,
      //   deltaX, deltaY, distance,
      //   weaponRange,
      //   isWithinRange: distance <= weaponRange
      // });
      
      if (distance <= weaponRange) {
        setReticlePosition({ x: viewportMouseX, y: viewportMouseY });
      } else {
        // Constrain reticle to max weapon range
        const angle = Math.atan2(deltaY, deltaX);
        const constrainedX = playerViewportX + Math.cos(angle) * weaponRange;
        const constrainedY = playerViewportY + Math.sin(angle) * weaponRange;
        setReticlePosition({ x: constrainedX, y: constrainedY });
      }

      // Optional: Store canvas-relative mouse if needed elsewhere
      // const canvasMouseX = event.clientX - canvasRect.left;
      // const canvasMouseY = event.clientY - canvasRect.top;
      // setMousePosition({ x: canvasMouseX, y: canvasMouseY }); 
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [shouldShowReticle, gameCanvasRef, localPlayer, weaponRange, cameraOffsetX, cameraOffsetY]);

  // Don't render if we shouldn't show the reticle
  if (!shouldShowReticle) {
    return null;
  }

  return (
    <div
      className="targeting-reticle"
      style={{
        position: 'fixed',
        left: reticlePosition.x - 20, // Center the 40px reticle
        top: reticlePosition.y - 20,
        width: '40px',
        height: '40px',
        pointerEvents: 'none',
        zIndex: 10000,
        transform: `rotate(${rotation}deg)`,
        // transition: 'left 0.1s ease-out, top 0.1s ease-out', // Removed for snappier movement
      }}
    >
      <svg
        width="40"
        height="40"
        viewBox="0 0 40 40"
        style={{
          filter: isReadyToFire 
            ? 'drop-shadow(0 0 2px rgba(0, 0, 0, 0.8))'
            : 'drop-shadow(0 0 4px rgba(255, 0, 0, 0.6))',
          transition: 'filter 0.2s ease',
        }}
      >
        {/* Outer circle */}
        <circle
          cx="20"
          cy="20"
          r="18"
          fill="none"
          stroke={reticleColor}
          strokeWidth="2"
          style={{ transition: 'stroke 0.2s ease' }}
        />
        
        {/* Inner circle */}
        <circle
          cx="20"
          cy="20"
          r="3"
          fill={reticleCenterColor}
          style={{ transition: 'fill 0.2s ease' }}
        />
        
        {/* Crosshair lines */}
        <line
          x1="20"
          y1="2"
          x2="20"
          y2="10"
          stroke={reticleColor}
          strokeWidth="2"
          style={{ transition: 'stroke 0.2s ease' }}
        />
        <line
          x1="20"
          y1="30"
          x2="20"
          y2="38"
          stroke={reticleColor}
          strokeWidth="2"
          style={{ transition: 'stroke 0.2s ease' }}
        />
        <line
          x1="2"
          y1="20"
          x2="10"
          y2="20"
          stroke={reticleColor}
          strokeWidth="2"
          style={{ transition: 'stroke 0.2s ease' }}
        />
        <line
          x1="30"
          y1="20"
          x2="38"
          y2="20"
          stroke={reticleColor}
          strokeWidth="2"
          style={{ transition: 'stroke 0.2s ease' }}
        />
        
        {/* Corner indicators */}
        <line
          x1="6"
          y1="6"
          x2="10"
          y2="10"
          stroke={reticleSecondaryColor}
          strokeWidth="1.5"
          style={{ transition: 'stroke 0.2s ease' }}
        />
        <line
          x1="34"
          y1="6"
          x2="30"
          y2="10"
          stroke={reticleSecondaryColor}
          strokeWidth="1.5"
          style={{ transition: 'stroke 0.2s ease' }}
        />
        <line
          x1="6"
          y1="34"
          x2="10"
          y2="30"
          stroke={reticleSecondaryColor}
          strokeWidth="1.5"
          style={{ transition: 'stroke 0.2s ease' }}
        />
        <line
          x1="34"
          y1="34"
          x2="30"
          y2="30"
          stroke={reticleSecondaryColor}
          strokeWidth="1.5"
          style={{ transition: 'stroke 0.2s ease' }}
        />
      </svg>
    </div>
  );
};

export default TargetingReticle; 