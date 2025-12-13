import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Identity } from 'spacetimedb';
import { Cairn as SpacetimeDBCairn, PlayerDiscoveredCairn as SpacetimeDBPlayerDiscoveredCairn } from '../generated';
import { CAIRN_LORE_TIDBITS, CairnLoreCategory, CairnLoreEntry } from '../data/cairnLoreData';
import { playCairnLoreAudio, stopCairnLoreAudio, isCairnAudioPlaying } from '../utils/cairnAudioUtils';
import './CairnsPanel.css';

interface CairnsPanelProps {
  cairns: Map<string, SpacetimeDBCairn>;  // All cairns in world
  playerDiscoveredCairns: Map<string, SpacetimeDBPlayerDiscoveredCairn>;
  currentPlayerIdentity: Identity | null;
}

// Reward tiers matching server-side constants
const REWARD_COMMON = 25;
const REWARD_UNCOMMON = 50;
const REWARD_RARE = 100;
const REWARD_EPIC = 150;
const REWARD_LEGENDARY = 200;

// Category colors - each category has its own distinct color
const CATEGORY_COLORS: Record<CairnLoreCategory, string> = {
  // Common tier (25 shards)
  'island': '#7BAE7F',        // Sage green - geography/nature
  'infrastructure': '#C49A6C', // Sandy brown - buildings/tech
  // Uncommon tier (50 shards)
  'shards': '#B388FF',        // Light purple - memory shards
  'alk': '#00E5CC',           // Cyan - ALK system
  'survival': '#F0A050',      // Amber - survival mechanics
  // Rare tier (100 shards)
  'aleuts': '#FF7043',        // Deep orange - Aleut culture
  'admiralty': '#5C8BE0',     // Royal blue - Admiralty
  'compound': '#90A4AE',      // Blue gray - Compound
  // Epic tier (150 shards)
  'philosophy': '#CE93D8',    // Pink purple - philosophy
  // Legendary tier (200 shards)
  'meta': '#FFD54F',          // Gold - SOVA/meta lore
};

// Helper function to get reward for category (matches server-side mapping)
function getRewardForCategory(category: CairnLoreCategory): number {
  switch(category) {
    case 'island':
    case 'infrastructure':
      return REWARD_COMMON;
    case 'shards':
    case 'alk':
    case 'survival':
      return REWARD_UNCOMMON;
    case 'aleuts':
    case 'admiralty':
    case 'compound':
      return REWARD_RARE;
    case 'philosophy':
      return REWARD_EPIC;
    case 'meta':
      return REWARD_LEGENDARY;
  }
}

// Helper function to get rarity tier name
function getRarityTierName(reward: number): string {
  if (reward >= REWARD_LEGENDARY) return 'LEGENDARY';
  if (reward >= REWARD_EPIC) return 'EPIC';
  if (reward >= REWARD_RARE) return 'RARE';
  if (reward >= REWARD_UNCOMMON) return 'UNCOMMON';
  return 'COMMON';
}

// Helper function to get rarity tier color (for tier headers)
function getRarityTierColor(reward: number): string {
  if (reward >= REWARD_LEGENDARY) return '#FFD700'; // Gold
  if (reward >= REWARD_EPIC) return '#9D4EDD';      // Purple
  if (reward >= REWARD_RARE) return '#4A90E2';      // Blue
  if (reward >= REWARD_UNCOMMON) return '#4CAF50';  // Green
  return '#9E9E9E';                                  // Gray
}

// Helper function to get category display name
function getCategoryDisplayName(category: CairnLoreCategory): string {
  const names: Record<CairnLoreCategory, string> = {
    'island': 'Island',
    'infrastructure': 'Infrastructure',
    'shards': 'Memory Shards',
    'alk': 'ALK System',
    'survival': 'Survival',
    'aleuts': 'Aleuts',
    'admiralty': 'Admiralty',
    'compound': 'The Compound',
    'philosophy': 'Philosophy',
    'meta': 'SOVA / Meta',
  };
  return names[category] || category;
}

// Group entries by reward tier
interface TierGroup {
  tier: string;
  reward: number;
  color: string;
  entries: CairnLoreEntry[];
}

const CairnsPanel: React.FC<CairnsPanelProps> = ({
  cairns,
  playerDiscoveredCairns,
  currentPlayerIdentity,
}) => {
  // Debug logging
  useEffect(() => {
    console.log('[CairnsPanel] Props received:', {
      cairnsCount: cairns?.size || 0,
      playerDiscoveredCairnsCount: playerDiscoveredCairns?.size || 0,
      currentPlayerIdentity: currentPlayerIdentity?.toHexString()?.slice(0, 16) || 'null',
    });
    
    // Log first few cairns for debugging
    if (cairns && cairns.size > 0) {
      const firstCairns = Array.from(cairns.values()).slice(0, 3);
      console.log('[CairnsPanel] Sample cairns:', firstCairns.map(c => ({
        id: c.id.toString(),
        loreId: c.loreId,
      })));
    }
    
    // Log discoveries for debugging
    if (playerDiscoveredCairns && playerDiscoveredCairns.size > 0) {
      const discoveries = Array.from(playerDiscoveredCairns.values());
      console.log('[CairnsPanel] All discoveries:', discoveries.map(d => ({
        id: d.id.toString(),
        cairnId: d.cairnId.toString(),
        playerIdentity: d.playerIdentity?.toHexString()?.slice(0, 16),
      })));
    }
  }, [cairns, playerDiscoveredCairns, currentPlayerIdentity]);

  // Get discovered cairn IDs for current player
  const discoveredCairnIds = useMemo(() => {
    if (!currentPlayerIdentity) {
      console.log('[CairnsPanel] No currentPlayerIdentity, returning empty set');
      return new Set<bigint>();
    }
    
    const discoveredIds = new Set<bigint>();
    const currentIdentityStr = currentPlayerIdentity.toHexString();
    
    console.log(`[CairnsPanel] Filtering discoveries for player: ${currentIdentityStr.slice(0, 16)}...`);
    console.log(`[CairnsPanel] Total discoveries in map: ${playerDiscoveredCairns.size}`);
    
    let matchCount = 0;
    playerDiscoveredCairns.forEach((discovery, key) => {
      const discoveryIdentityStr = discovery.playerIdentity?.toHexString();
      const isMatch = discoveryIdentityStr === currentIdentityStr;
      if (isMatch) {
        discoveredIds.add(discovery.cairnId);
        matchCount++;
        console.log(`[CairnsPanel] ✓ Match: discovery.cairnId=${discovery.cairnId}, discoveryIdentity=${discoveryIdentityStr?.slice(0, 16)}...`);
      }
    });
    
    console.log(`[CairnsPanel] Found ${matchCount} discoveries for current player out of ${playerDiscoveredCairns.size} total`);
    console.log('[CairnsPanel] Discovered cairn IDs for current player:', 
      Array.from(discoveredIds).map(id => id.toString()));
    
    return discoveredIds;
  }, [playerDiscoveredCairns, currentPlayerIdentity]);

  // Build a map from loreId to discovered status
  const discoveredLoreIds = useMemo(() => {
    const loreIdSet = new Set<string>();
    
    discoveredCairnIds.forEach((cairnId) => {
      // Find the cairn by ID
      const cairn = Array.from(cairns.values()).find(c => c.id === cairnId);
      if (cairn) {
        loreIdSet.add(cairn.loreId);
        console.log(`[CairnsPanel] Cairn ${cairnId} has loreId: ${cairn.loreId} - marking as discovered`);
      }
    });
    
    console.log('[CairnsPanel] Discovered lore IDs:', Array.from(loreIdSet));
    return loreIdSet;
  }, [discoveredCairnIds, cairns]);

  // Calculate total shards earned
  const totalShardsEarned = useMemo(() => {
    let total = 0;
    discoveredLoreIds.forEach((loreId) => {
      const loreEntry = CAIRN_LORE_TIDBITS.find(entry => entry.id === loreId);
      if (loreEntry) {
        total += getRewardForCategory(loreEntry.category);
      }
    });
    return total;
  }, [discoveredLoreIds]);

  // Group lore entries by reward tier (sorted Legendary to Common)
  const tierGroups = useMemo((): TierGroup[] => {
    const groups: TierGroup[] = [
      { tier: 'LEGENDARY', reward: REWARD_LEGENDARY, color: '#FFD700', entries: [] },
      { tier: 'EPIC', reward: REWARD_EPIC, color: '#9D4EDD', entries: [] },
      { tier: 'RARE', reward: REWARD_RARE, color: '#4A90E2', entries: [] },
      { tier: 'UNCOMMON', reward: REWARD_UNCOMMON, color: '#4CAF50', entries: [] },
      { tier: 'COMMON', reward: REWARD_COMMON, color: '#9E9E9E', entries: [] },
    ];
    
    // Sort entries into their tier groups
    CAIRN_LORE_TIDBITS.forEach((entry) => {
      const reward = getRewardForCategory(entry.category);
      const group = groups.find(g => g.reward === reward);
      if (group) {
        group.entries.push(entry);
      }
    });
    
    // Sort entries within each group by index
    groups.forEach(group => {
      group.entries.sort((a, b) => a.index - b.index);
    });
    
    // Filter out empty groups
    return groups.filter(g => g.entries.length > 0);
  }, []);

  // Check if a lore entry is discovered
  const isLoreEntryDiscovered = (loreEntry: CairnLoreEntry): boolean => {
    return discoveredLoreIds.has(loreEntry.id);
  };

  const discoveredCount = discoveredLoreIds.size;
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
        {tierGroups.map((group) => {
          const discoveredInTier = group.entries.filter(e => isLoreEntryDiscovered(e)).length;
          
          return (
            <div key={group.tier} className="cairn-tier-group">
              {/* Tier Header */}
              <div 
                className="cairn-tier-header"
                style={{ borderColor: group.color }}
              >
                <span 
                  className="cairn-tier-name"
                  style={{ color: group.color }}
                >
                  {group.tier}
                </span>
                <span className="cairn-tier-reward" style={{ color: group.color }}>
                  {group.reward} SHARDS
                </span>
                <span className="cairn-tier-progress">
                  {discoveredInTier}/{group.entries.length}
                </span>
              </div>
              
              {/* Entries in this tier */}
              {group.entries.map((loreEntry) => {
                const isDiscovered = isLoreEntryDiscovered(loreEntry);
                const categoryColor = CATEGORY_COLORS[loreEntry.category];
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
                            <span className="cairn-checkmark" style={{ color: categoryColor }}>✓</span>
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
                              style={{ 
                                borderColor: categoryColor, 
                                color: categoryColor,
                                backgroundColor: `${categoryColor}15`
                              }}
                            >
                              {getCategoryDisplayName(loreEntry.category)}
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
                      <div 
                        className="cairn-lore-text"
                        style={{ borderLeftColor: categoryColor }}
                      >
                        {loreEntry.text}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CairnsPanel;
