import React, { useMemo } from 'react';
import { WildAnimal, Player } from '../generated';
import { CaribouBreedingData } from '../generated/caribou_breeding_data_type';
import { WalrusBreedingData } from '../generated/walrus_breeding_data_type';
import { CaribouRutState } from '../generated/caribou_rut_state_type';
import { WalrusRutState } from '../generated/walrus_rut_state_type';
import styles from './TamedAnimalTooltip.module.css';

// Animal species info for display
const SPECIES_INFO: Record<string, { name: string; icon: string; maxHealth: number }> = {
  Caribou: { name: 'Caribou', icon: '🦌', maxHealth: 150 },
  ArcticWalrus: { name: 'Arctic Walrus', icon: '🦭', maxHealth: 200 },
  CinderFox: { name: 'Cinder Fox', icon: '🦊', maxHealth: 80 },
  TundraWolf: { name: 'Tundra Wolf', icon: '🐺', maxHealth: 120 },
  CableViper: { name: 'Cable Viper', icon: '🐍', maxHealth: 60 },
  BeachCrab: { name: 'Beach Crab', icon: '🦀', maxHealth: 40 },
};

interface TamedAnimalTooltipProps {
  animal: WildAnimal;
  visible: boolean;
  position: { x: number; y: number };
  currentTime: number;
  // Breeding data
  caribouBreedingData?: Map<string, CaribouBreedingData>;
  walrusBreedingData?: Map<string, WalrusBreedingData>;
  // Rut state data
  caribouRutState?: CaribouRutState | null;
  walrusRutState?: WalrusRutState | null;
  // Owner info
  players?: Map<string, Player>;
}

const TamedAnimalTooltip: React.FC<TamedAnimalTooltipProps> = ({
  animal,
  visible,
  position,
  currentTime,
  caribouBreedingData,
  walrusBreedingData,
  caribouRutState,
  walrusRutState,
  players,
}) => {
  // Only show for tamed animals
  if (!visible || !animal || !animal.tamedBy) {
    return null;
  }

  const speciesTag = animal.species.tag;
  const speciesInfo = SPECIES_INFO[speciesTag] || { name: speciesTag, icon: '🐾', maxHealth: 100 };
  const animalId = animal.id.toString();

  // Get breeding data for this animal
  const breedingData = useMemo(() => {
    if (speciesTag === 'Caribou' && caribouBreedingData) {
      return caribouBreedingData.get(animalId);
    }
    if (speciesTag === 'ArcticWalrus' && walrusBreedingData) {
      return walrusBreedingData.get(animalId);
    }
    return null;
  }, [speciesTag, animalId, caribouBreedingData, walrusBreedingData]);

  // Calculate health percentage
  const healthPercent = Math.round((animal.health / speciesInfo.maxHealth) * 100);
  const healthStatus = healthPercent > 60 ? 'healthy' : healthPercent > 25 ? 'wounded' : 'critical';

  // Get gender display
  const getGenderDisplay = () => {
    if (!breedingData) return { text: 'Unknown', className: '' };
    
    const sexTag = (breedingData as any).sex?.tag;
    if (sexTag === 'Male') return { text: '♂ Male', className: styles.male };
    if (sexTag === 'Female') return { text: '♀ Female', className: styles.female };
    return { text: 'Unknown', className: '' };
  };

  // Get age stage display
  const getAgeStageDisplay = () => {
    if (!breedingData) return { text: 'Unknown', className: styles.ageStage };
    
    const ageTag = (breedingData as any).ageStage?.tag;
    if (ageTag === 'Calf' || ageTag === 'Pup') {
      return { text: ageTag === 'Calf' ? '🍼 Calf' : '🍼 Pup', className: styles.agePup };
    }
    if (ageTag === 'Juvenile') {
      return { text: '🌱 Juvenile', className: styles.ageJuvenile };
    }
    if (ageTag === 'Adult') {
      return { text: '✓ Adult', className: styles.ageAdult };
    }
    return { text: ageTag || 'Unknown', className: styles.ageStage };
  };

  // Get pregnancy status
  const getPregnancyStatus = () => {
    if (!breedingData) return null;
    
    const isPregnant = (breedingData as any).isPregnant;
    if (!isPregnant) return null;
    
    // Check if we have conception time to calculate progress
    const conceptionTime = (breedingData as any).conceptionTime;
    if (conceptionTime) {
      // Gestation periods (in game days, roughly 10 minutes per day)
      const gestationDays = speciesTag === 'Caribou' ? 5 : 7; // Caribou: 5 days, Walrus: 7 days
      const gestationMs = gestationDays * 10 * 60 * 1000; // Convert to milliseconds
      const conceptionTimeMs = Number(conceptionTime.microsSinceUnixEpoch) / 1000;
      const elapsed = currentTime - conceptionTimeMs;
      const progress = Math.min(100, Math.round((elapsed / gestationMs) * 100));
      
      return { 
        isPregnant: true, 
        progress,
        text: `💕 Pregnant (${progress}%)`
      };
    }
    
    return { isPregnant: true, progress: 0, text: '💕 Pregnant' };
  };

  // Get rut status (breeding season)
  const getRutStatus = () => {
    if (speciesTag === 'Caribou' && caribouRutState) {
      return caribouRutState.isRutActive ? { isActive: true, text: '🔥 In Rut (Breeding Season)' } : null;
    }
    if (speciesTag === 'ArcticWalrus' && walrusRutState) {
      return walrusRutState.isRutActive ? { isActive: true, text: '🔥 In Rut (Breeding Season)' } : null;
    }
    return null;
  };

  // Get owner name
  const getOwnerName = () => {
    if (!animal.tamedBy || !players) return 'Unknown';
    const ownerHex = animal.tamedBy.toHexString();
    const owner = players.get(ownerHex);
    return owner?.displayName || ownerHex.substring(0, 8) + '...';
  };

  const genderDisplay = getGenderDisplay();
  const ageDisplay = getAgeStageDisplay();
  const pregnancyStatus = getPregnancyStatus();
  const rutStatus = getRutStatus();
  const ownerName = getOwnerName();

  // Position tooltip slightly offset from cursor
  const tooltipStyle = {
    left: `${position.x + 15}px`,
    top: `${position.y + 15}px`,
  };

  // Get species-specific class
  const speciesClass = speciesTag === 'Caribou' ? styles.caribou 
    : speciesTag === 'ArcticWalrus' ? styles.walrus
    : speciesTag === 'CinderFox' ? styles.fox
    : speciesTag === 'TundraWolf' ? styles.wolf
    : '';

  return (
    <div className={`${styles.tooltipContainer} ${speciesClass}`} style={tooltipStyle}>
      {/* Header with animal name and tamed badge */}
      <div className={styles.header}>
        <span className={styles.animalIcon}>{speciesInfo.icon}</span>
        <span className={styles.animalName}>{speciesInfo.name}</span>
        <span className={styles.tamedBadge}>Tamed</span>
      </div>

      {/* Health bar */}
      <div className={styles.healthSection}>
        <div className={styles.healthLabel}>
          <span>Health</span>
          <span className={`${styles.healthPercent} ${styles[healthStatus]}`}>
            {animal.health}/{speciesInfo.maxHealth}
          </span>
        </div>
        <div className={styles.healthBarContainer}>
          <div
            className={`${styles.healthBarFill} ${styles[healthStatus]}`}
            style={{ width: `${healthPercent}%` }}
          />
        </div>
      </div>

      {/* Basic Info */}
      <div className={styles.infoSection}>
        <div className={styles.infoRow}>
          <span className={styles.infoLabel}>Owner:</span>
          <span className={styles.infoValue}>{ownerName}</span>
        </div>

        {breedingData && (
          <>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Gender:</span>
              <span className={`${styles.infoValue} ${genderDisplay.className}`}>
                {genderDisplay.text}
              </span>
            </div>

            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Age:</span>
              <span className={`${styles.infoValue} ${ageDisplay.className}`}>
                {ageDisplay.text}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Breeding Status Section */}
      {(pregnancyStatus || rutStatus) && (
        <div className={styles.statusSection}>
          <div className={styles.statusHeader}>Breeding Status</div>

          {rutStatus && (
            <div className={styles.statusRow}>
              <span className={styles.statusLabel}>Season:</span>
              <span className={`${styles.statusValue} ${styles.rutting}`}>
                {rutStatus.text}
              </span>
            </div>
          )}

          {pregnancyStatus && (
            <div className={styles.statusRow}>
              <span className={styles.statusLabel}>Status:</span>
              <span className={`${styles.statusValue} ${styles.special}`}>
                {pregnancyStatus.text}
              </span>
            </div>
          )}
        </div>
      )}

      {/* State info */}
      <div className={styles.statusSection}>
        <div className={styles.statusHeader}>Behavior</div>
        <div className={styles.statusRow}>
          <span className={styles.statusLabel}>Current:</span>
          <span className={`${styles.statusValue} ${styles.neutral}`}>
            {animal.state.tag === 'Following' ? '🚶 Following Owner' :
             animal.state.tag === 'Protecting' ? '⚔️ Protecting!' :
             animal.state.tag === 'Idle' ? '😴 Waiting' :
             animal.state.tag}
          </span>
        </div>
      </div>
    </div>
  );
};

export default TamedAnimalTooltip;
