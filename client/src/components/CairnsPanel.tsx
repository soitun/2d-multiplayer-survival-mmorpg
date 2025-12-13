import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Cairn as SpacetimeDBCairn, PlayerDiscoveredCairn as SpacetimeDBPlayerDiscoveredCairn, Identity } from '../generated';
import { CAIRN_LORE_TIDBITS, CairnLoreCategory, CairnLoreEntry } from '../data/cairnLoreData';
import { playCairnLoreAudio, stopCairnLoreAudio, isCairnAudioPlaying } from '../utils/cairnAudioUtils';
import './CairnsPanel.css';

interface CairnsPanelProps {
  cairns: Map<string, SpacetimeDBCairn>;  // All cairns in world
  playerDiscoveredCairns: Map<string, SpacetimeDBPlayerDiscoveredCairn>;
  currentPlayerIdentity: Identity | null;
}

// Helper function to get reward for category (matches server-side mapping)
function getRewardForCategory(category: CairnLoreCategory): number {
  switch(category) {
    case 'island':
    case 'infrastructure':
      return 25; // Common
    case 'shards':
    case 'alk':
    case 'survival':
      return 50; // Uncommon
    case 'aleuts':
    case 'admiralty':
    case 'compound':
      return 100; // Rare
    case 'philosophy':
      return 150; // Epic
    case 'meta':
      return 200; // Legendary
  }
}

// Helper function to get rarity color
function getRarityColor(reward: number): string {
  if (reward >= 200) return '#FFD700'; // Legendary - Gold
  if (reward >= 150) return '#9D4EDD'; // Epic - Purple
  if (reward >= 100) return '#4A90E2'; // Rare - Blue
  if (reward >= 50) return '#4CAF50';  // Uncommon - Green
  return '#9E9E9E'; // Common - Gray
}

// Helper function to get category display name
function getCategoryDisplayName(category: CairnLoreCategory): string {
  return category.charAt(0).toUpperCase() + category.slice(1);
}

const CairnsPanel: React.FC<CairnsPanelProps> = ({
  cairns,
  playerDiscoveredCairns,
  currentPlayerIdentity,
}) => {
  // Get discovered cairn IDs for current player
  const discoveredCairnIds = useMemo(() => {
    if (!currentPlayerIdentity) return new Set<bigint>();
    
    const discoveredIds = new Set<bigint>();
    playerDiscoveredCairns.forEach((discovery) => {
      if (discovery.playerIdentity?.toString() === currentPlayerIdentity.toString()) {
        discoveredIds.add(discovery.cairnId);
      }
    });
    return discoveredIds;
  }, [playerDiscoveredCairns, currentPlayerIdentity]);

  // Calculate total shards earned
  const totalShardsEarned = useMemo(() => {
    let total = 0;
    discoveredCairnIds.forEach((cairnId) => {
      // Find the cairn to get its lore_id
      const cairn = Array.from(cairns.values()).find(c => c.id === cairnId);
      if (cairn) {
        const loreEntry = CAIRN_LORE_TIDBITS.find(entry => entry.id === cairn.loreId);
        if (loreEntry) {
          total += getRewardForCategory(loreEntry.category);
        }
      }
    });
    return total;
  }, [discoveredCairnIds, cairns]);

  // Get all lore entries sorted by index
  const sortedLoreEntries = useMemo(() => {
    return [...CAIRN_LORE_TIDBITS].sort((a, b) => a.index - b.index);
  }, []);

  // Check if a lore entry is discovered (has a cairn in world that's been discovered)
  const isLoreEntryDiscovered = (loreEntry: CairnLoreEntry): boolean => {
    // Find all cairns with this lore_id
    const matchingCairns = Array.from(cairns.values()).filter(c => c.loreId === loreEntry.id);
    // Check if any of them are discovered
    return matchingCairns.some(cairn => discoveredCairnIds.has(cairn.id));
  };

  const discoveredCount = discoveredCairnIds.size;
  const totalCairns = CAIRN_LORE_TIDBITS.length;

  // Track which cairns are expanded to show lore text
  const [expandedCairns, setExpandedCairns] = useState<Set<string>>(new Set());
  
  // Track which cairn audio is currently playing (by lore index)
  const [playingCairnIndex, setPlayingCairnIndex] = useState<number | null>(null);
  const audioCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Monitor audio playback state to update UI when audio stops
  useEffect(() => {
    if (playingCairnIndex !== null) {
      // Check periodically if audio stopped
      audioCheckIntervalRef.current = setInterval(() => {
        if (!isCairnAudioPlaying()) {
          setPlayingCairnIndex(null);
        }
      }, 100); // Check every 100ms
    } else {
      // Clear interval when no audio is playing
      if (audioCheckIntervalRef.current) {
        clearInterval(audioCheckIntervalRef.current);
        audioCheckIntervalRef.current = null;
      }
    }

    // Cleanup on unmount
    return () => {
      if (audioCheckIntervalRef.current) {
        clearInterval(audioCheckIntervalRef.current);
      }
    };
  }, [playingCairnIndex]);

  const toggleExpand = (loreId: string) => {
    setExpandedCairns(prev => {
      const newSet = new Set(prev);
      if (newSet.has(loreId)) {
        newSet.delete(loreId);
      } else {
        newSet.add(loreId);
      }
      return newSet;
    });
  };

  const handleReplayAudio = async (loreEntry: CairnLoreEntry) => {
    // If this cairn is already playing, stop it
    if (playingCairnIndex === loreEntry.index) {
      stopCairnLoreAudio();
      setPlayingCairnIndex(null);
      return;
    }

    // Stop any currently playing audio
    if (playingCairnIndex !== null) {
      stopCairnLoreAudio();
    }

    // Start playing this cairn's audio
    setPlayingCairnIndex(loreEntry.index);
    await playCairnLoreAudio(loreEntry.index, 0.9);
    
    // Audio might have failed to start, check if it's actually playing
    if (!isCairnAudioPlaying()) {
      setPlayingCairnIndex(null);
    }
  };

  return (
    <div className="cairns-panel">
      <div className="cairns-panel-header">
        <h2 className="cairns-panel-title">CAIRNS</h2>
        <div className="cairns-panel-stats">
          <div className="cairns-discovered-count">
            {discoveredCount}/{totalCairns} DISCOVERED
          </div>
          <div className="cairns-shards-earned">
            {totalShardsEarned.toLocaleString()} SHARDS EARNED
          </div>
        </div>
      </div>
      
      <div className="cairns-list">
        {sortedLoreEntries.map((loreEntry) => {
          const isDiscovered = isLoreEntryDiscovered(loreEntry);
          const reward = getRewardForCategory(loreEntry.category);
          const rarityColor = getRarityColor(reward);
          
          const isExpanded = expandedCairns.has(loreEntry.id);

          return (
            <div
              key={loreEntry.id}
              className={`cairn-entry ${isDiscovered ? 'discovered' : 'undiscovered'} ${isExpanded ? 'expanded' : ''}`}
              onClick={() => {
                if (isDiscovered) {
                  toggleExpand(loreEntry.id);
                }
              }}
            >
              <div className="cairn-entry-main">
                <div className="cairn-entry-left">
                  <div className="cairn-status-icon">
                    {isDiscovered ? (
                      <span className="cairn-checkmark">✓</span>
                    ) : (
                      <span className="cairn-lock">🔒</span>
                    )}
                  </div>
                  <div className="cairn-info">
                    <div className="cairn-number-title">
                      <span className="cairn-number">#{loreEntry.index}</span>
                      <span className="cairn-title">{loreEntry.title}</span>
                    </div>
                    <div className="cairn-badges">
                      <span
                        className="cairn-category-badge"
                        style={{ borderColor: rarityColor, color: rarityColor }}
                      >
                        {getCategoryDisplayName(loreEntry.category)}
                      </span>
                      <span
                        className="cairn-reward-badge"
                        style={{ backgroundColor: rarityColor }}
                      >
                        {reward} SHARDS
                      </span>
                    </div>
                  </div>
                </div>
                {isDiscovered && (
                  <div className="cairn-actions">
                    <button
                      className={`cairn-replay-button ${playingCairnIndex === loreEntry.index ? 'playing' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleReplayAudio(loreEntry);
                      }}
                      title={playingCairnIndex === loreEntry.index ? "Stop audio" : "Play audio"}
                    >
                      {playingCairnIndex === loreEntry.index ? '⏹️' : '🔊'}
                    </button>
                    <button
                      className="cairn-expand-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpand(loreEntry.id);
                      }}
                      title={isExpanded ? "Hide lore text" : "Show lore text"}
                    >
                      {isExpanded ? '▼' : '▶'}
                    </button>
                  </div>
                )}
              </div>
              {isDiscovered && isExpanded && (
                <div className="cairn-lore-text">
                  {loreEntry.text}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CairnsPanel;
