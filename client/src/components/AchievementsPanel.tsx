import React, { useState, useMemo, useCallback } from 'react';
import { Identity } from 'spacetimedb';
import { AchievementDefinition, PlayerAchievement, AchievementCategory } from '../generated';
import achievementsIcon from '../assets/ui/achievements.png';

interface AchievementsPanelProps {
  playerIdentity: Identity | null;
  achievementDefinitions: Map<string, AchievementDefinition>;
  playerAchievements: Map<string, PlayerAchievement>;
  onClose?: () => void;
  onSearchFocusChange?: (isFocused: boolean) => void; // Blocks player movement when search is focused
}

// Category display names
const CATEGORY_DISPLAY_NAMES: Record<string, string> = {
  Exploration: 'Exploration',
  Combat: 'Combat',
  Gathering: 'Gathering',
  Crafting: 'Crafting',
  Social: 'Social',
  Survival: 'Survival',
  Special: 'Special',
};

// Category icons
const CATEGORY_ICONS: Record<string, string> = {
  Exploration: '🗺️',
  Combat: '⚔️',
  Gathering: '🪓',
  Crafting: '🔨',
  Social: '👥',
  Survival: '❤️',
  Special: '⭐',
};

// Sort options
type SortOption = 'alphabetical' | 'recent';

const AchievementsPanel: React.FC<AchievementsPanelProps> = ({
  playerIdentity,
  achievementDefinitions,
  playerAchievements,
  onClose,
  onSearchFocusChange,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showUnlockedOnly, setShowUnlockedOnly] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const [searchQuery, setSearchQuery] = useState('');

  // Get the player's unlocked achievement IDs
  const unlockedAchievementIds = useMemo(() => {
    if (!playerIdentity) return new Set<string>();
    const unlocked = new Set<string>();
    playerAchievements.forEach((pa) => {
      if (pa.playerId.toHexString() === playerIdentity.toHexString()) {
        unlocked.add(pa.achievementId);
      }
    });
    return unlocked;
  }, [playerAchievements, playerIdentity]);

  // Get all unique categories
  const categories = useMemo(() => {
    const cats = new Set<string>();
    achievementDefinitions.forEach((def) => {
      // Handle tagged union for category
      const categoryTag = typeof def.category === 'object' && def.category?.tag
        ? def.category.tag
        : String(def.category);
      cats.add(categoryTag);
    });
    return Array.from(cats).sort();
  }, [achievementDefinitions]);

  // Get unlock timestamp for an achievement (returns bigint for sorting)
  const getUnlockTimestamp = useCallback((achievementId: string): bigint | null => {
    for (const pa of playerAchievements.values()) {
      if (pa.achievementId === achievementId && 
          playerIdentity && 
          pa.playerId.toHexString() === playerIdentity.toHexString()) {
        return pa.unlockedAt.microsSinceUnixEpoch;
      }
    }
    return null;
  }, [playerAchievements, playerIdentity]);

  // Get unlock Date for display
  const getUnlockTime = useCallback((achievementId: string): Date | null => {
    const timestamp = getUnlockTimestamp(achievementId);
    if (timestamp !== null) {
      return new Date(Number(timestamp / 1000n));
    }
    return null;
  }, [getUnlockTimestamp]);

  // Filter achievements by category, unlock status, and search query
  const filteredAchievements = useMemo(() => {
    let achievements = Array.from(achievementDefinitions.values());
    
    // Filter by category
    if (selectedCategory) {
      achievements = achievements.filter((def) => {
        const categoryTag = typeof def.category === 'object' && def.category?.tag
          ? def.category.tag
          : String(def.category);
        return categoryTag === selectedCategory;
      });
    }
    
    // Filter by unlock status
    if (showUnlockedOnly) {
      achievements = achievements.filter((def) => unlockedAchievementIds.has(def.id));
    }
    
    // Filter by search query (searches name, description, and title reward)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      achievements = achievements.filter((def) => {
        const nameMatch = def.name.toLowerCase().includes(query);
        const descMatch = def.description.toLowerCase().includes(query);
        const titleMatch = def.titleReward ? def.titleReward.toLowerCase().includes(query) : false;
        return nameMatch || descMatch || titleMatch;
      });
    }
    
    // Sort based on selected option
    if (sortBy === 'recent') {
      // Sort by most recently achieved (unlocked first by date, then locked alphabetically)
      achievements.sort((a, b) => {
        const aUnlocked = unlockedAchievementIds.has(a.id);
        const bUnlocked = unlockedAchievementIds.has(b.id);
        
        // Both unlocked: sort by unlock time (most recent first)
        if (aUnlocked && bUnlocked) {
          const aTime = getUnlockTimestamp(a.id);
          const bTime = getUnlockTimestamp(b.id);
          if (aTime !== null && bTime !== null) {
            return bTime > aTime ? 1 : bTime < aTime ? -1 : 0;
          }
          return 0;
        }
        
        // One unlocked, one not: unlocked first
        if (aUnlocked !== bUnlocked) return aUnlocked ? -1 : 1;
        
        // Both locked: alphabetical
        return a.name.localeCompare(b.name);
      });
    } else {
      // Alphabetical: unlocked first, then by name
      achievements.sort((a, b) => {
        const aUnlocked = unlockedAchievementIds.has(a.id);
        const bUnlocked = unlockedAchievementIds.has(b.id);
        if (aUnlocked !== bUnlocked) return aUnlocked ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    }
    
    return achievements;
  }, [achievementDefinitions, selectedCategory, showUnlockedOnly, unlockedAchievementIds, searchQuery, sortBy, getUnlockTimestamp]);

  // Calculate stats
  const stats = useMemo(() => {
    const total = achievementDefinitions.size;
    const unlocked = unlockedAchievementIds.size;
    const percentage = total > 0 ? Math.round((unlocked / total) * 100) : 0;
    return { total, unlocked, percentage };
  }, [achievementDefinitions, unlockedAchievementIds]);

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'rgba(15, 23, 35, 0.95)',
      border: 'none',
      borderRadius: '0',
      padding: '0',
      boxSizing: 'border-box',
      color: '#ffffff',
      overflow: 'hidden',
      fontFamily: "'Courier New', monospace",
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 16px',
        background: 'linear-gradient(90deg, rgba(255, 215, 0, 0.15) 0%, transparent 100%)',
        borderBottom: 'none',
        marginBottom: '0',
        flexShrink: 0,
      }}>
        <h2 style={{
          color: '#ffd700',
          margin: 0,
          fontSize: '1.2rem',
          fontWeight: 'bold',
          textShadow: '0 0 10px rgba(255, 215, 0, 0.5)',
          letterSpacing: '2px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <img 
            src={achievementsIcon} 
            alt="Achievements" 
            style={{ 
              width: '28px', 
              height: '28px',
              imageRendering: 'pixelated',
            }} 
          />
          ACHIEVEMENTS
        </h2>
        
        {/* Progress bar with text inside */}
        <div style={{
          width: '160px',
          height: '22px',
          background: 'rgba(0, 0, 0, 0.6)',
          borderRadius: '0',
          overflow: 'hidden',
          border: '1px solid rgba(255, 215, 0, 0.4)',
          position: 'relative',
        }}>
          <div style={{
            width: `${stats.percentage}%`,
            height: '100%',
            background: 'linear-gradient(90deg, #ffd700, #ffaa00)',
            transition: 'width 0.3s ease',
          }} />
          <span style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            fontSize: '11px',
            fontWeight: 'bold',
            color: '#fff',
            textShadow: '0 0 4px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.7), 1px 1px 2px rgba(0,0,0,0.8)',
            whiteSpace: 'nowrap',
            letterSpacing: '0.5px',
          }}>
            {stats.unlocked} / {stats.total} ({stats.percentage}%)
          </span>
        </div>
      </div>

      {/* Search Bar */}
      <div style={{
        padding: '8px 12px',
        background: 'rgba(0, 0, 0, 0.3)',
        borderBottom: '1px solid rgba(255, 215, 0, 0.3)',
      }}>
        <div style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
        }}>
          <span style={{
            position: 'absolute',
            left: '12px',
            color: 'rgba(255, 215, 0, 0.6)',
            fontSize: '14px',
            pointerEvents: 'none',
          }}>
            🔍
          </span>
          <input
            type="text"
            placeholder="Search achievements, descriptions, titles..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px 10px 38px',
              background: 'rgba(0, 0, 0, 0.4)',
              border: '1px solid rgba(255, 215, 0, 0.3)',
              borderRadius: '6px',
              color: '#ffffff',
              fontSize: '13px',
              outline: 'none',
              transition: 'all 0.2s ease',
            }}
            onFocus={(e) => {
              e.target.style.borderColor = '#ffd700';
              e.target.style.boxShadow = '0 0 8px rgba(255, 215, 0, 0.3)';
              onSearchFocusChange?.(true); // Block player movement
            }}
            onBlur={(e) => {
              e.target.style.borderColor = 'rgba(255, 215, 0, 0.3)';
              e.target.style.boxShadow = 'none';
              onSearchFocusChange?.(false); // Unblock player movement
            }}
            onKeyDown={(e) => {
              // Block game control keys from bubbling up to the game
              const gameControlKeys = ['f', 'g', ' ', 'e', 'w', 'a', 's', 'd', 'z', 'c', 'm', 'y', 'r', 'q', 'tab'];
              const key = e.key.toLowerCase();
              
              if (gameControlKeys.includes(key)) {
                e.stopPropagation();
              }
              
              // Handle Escape key to blur the input
              if (e.key === 'Escape') {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute',
                right: '10px',
                background: 'none',
                border: 'none',
                color: 'rgba(255, 255, 255, 0.6)',
                cursor: 'pointer',
                fontSize: '14px',
                padding: '4px',
              }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Sort and Filter Options */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '12px',
        padding: '8px 12px',
        background: 'rgba(0, 0, 0, 0.2)',
        borderBottom: '1px solid rgba(255, 215, 0, 0.2)',
        alignItems: 'center',
      }}>
        {/* Sort options */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.6)' }}>Sort:</span>
          <button
            onClick={() => setSortBy('alphabetical')}
            style={{
              background: sortBy === 'alphabetical'
                ? 'linear-gradient(135deg, #4a9eff 0%, #2a7edf 100%)'
                : 'rgba(74, 158, 255, 0.1)',
              border: `1px solid ${sortBy === 'alphabetical' ? '#4a9eff' : 'rgba(74, 158, 255, 0.3)'}`,
              borderRadius: '4px',
              color: sortBy === 'alphabetical' ? '#fff' : 'rgba(255, 255, 255, 0.8)',
              padding: '5px 10px',
              cursor: 'pointer',
              fontSize: '10px',
              fontWeight: 'bold',
              transition: 'all 0.2s ease',
            }}
          >
            A-Z
          </button>
          <button
            onClick={() => setSortBy('recent')}
            style={{
              background: sortBy === 'recent'
                ? 'linear-gradient(135deg, #ff6b9d 0%, #df4b7d 100%)'
                : 'rgba(255, 107, 157, 0.1)',
              border: `1px solid ${sortBy === 'recent' ? '#ff6b9d' : 'rgba(255, 107, 157, 0.3)'}`,
              borderRadius: '4px',
              color: sortBy === 'recent' ? '#fff' : 'rgba(255, 255, 255, 0.8)',
              padding: '5px 10px',
              cursor: 'pointer',
              fontSize: '10px',
              fontWeight: 'bold',
              transition: 'all 0.2s ease',
            }}
          >
            🕒 Recent
          </button>
        </div>

        {/* Show unlocked only toggle */}
        <label style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          cursor: 'pointer',
          marginLeft: 'auto',
          fontSize: '11px',
          color: 'rgba(255, 255, 255, 0.8)',
        }}>
          <input
            type="checkbox"
            checked={showUnlockedOnly}
            onChange={(e) => setShowUnlockedOnly(e.target.checked)}
            style={{
              cursor: 'pointer',
              accentColor: '#ffd700',
            }}
          />
          Show Unlocked Only
        </label>
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px',
        padding: '8px 12px',
        background: 'rgba(0, 0, 0, 0.2)',
        borderBottom: '1px solid rgba(255, 215, 0, 0.3)',
        alignItems: 'center',
      }}>
        {/* All category button */}
        <button
          onClick={() => setSelectedCategory(null)}
          style={{
            background: selectedCategory === null
              ? 'linear-gradient(135deg, #ffd700 0%, #ffaa00 100%)'
              : 'rgba(255, 215, 0, 0.1)',
            border: `1px solid ${selectedCategory === null ? '#ffd700' : 'rgba(255, 215, 0, 0.3)'}`,
            borderRadius: '4px',
            color: selectedCategory === null ? '#000' : '#ffffff',
            padding: '6px 12px',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: 'bold',
            transition: 'all 0.2s ease',
            textTransform: 'uppercase',
          }}
        >
          ALL
        </button>
        
        {categories.map((category) => (
          <button
            key={category}
            onClick={() => setSelectedCategory(category)}
            style={{
              background: selectedCategory === category
                ? 'linear-gradient(135deg, #ffd700 0%, #ffaa00 100%)'
                : 'rgba(255, 215, 0, 0.1)',
              border: `1px solid ${selectedCategory === category ? '#ffd700' : 'rgba(255, 215, 0, 0.3)'}`,
              borderRadius: '4px',
              color: selectedCategory === category ? '#000' : '#ffffff',
              padding: '6px 12px',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 'bold',
              transition: 'all 0.2s ease',
              textTransform: 'uppercase',
            }}
          >
            {CATEGORY_ICONS[category] || '📜'} {CATEGORY_DISPLAY_NAMES[category] || category}
          </button>
        ))}
      </div>

      {/* Achievements List */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: '12px',
      }}>
        {filteredAchievements.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '40px 20px',
            color: 'rgba(255, 255, 255, 0.6)',
          }}>
            <div style={{ fontSize: '24px', marginBottom: '10px' }}>🏆</div>
            <div>No achievements found.</div>
            {searchQuery && (
              <div style={{ marginTop: '8px', fontSize: '12px' }}>
                No results for "{searchQuery}". Try a different search term.
              </div>
            )}
            {showUnlockedOnly && !searchQuery && (
              <div style={{ marginTop: '8px', fontSize: '12px' }}>
                Try showing all achievements.
              </div>
            )}
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '12px',
          }}>
            {filteredAchievements.map((achievement) => {
              const isUnlocked = unlockedAchievementIds.has(achievement.id);
              const unlockTime = isUnlocked ? getUnlockTime(achievement.id) : null;
              
              return (
                <div
                  key={achievement.id}
                  style={{
                    background: isUnlocked
                      ? 'linear-gradient(135deg, rgba(255, 215, 0, 0.15) 0%, rgba(255, 170, 0, 0.1) 100%)'
                      : 'rgba(0, 0, 0, 0.3)',
                    border: `1px solid ${isUnlocked ? 'rgba(255, 215, 0, 0.5)' : 'rgba(255, 255, 255, 0.1)'}`,
                    borderRadius: '8px',
                    padding: '12px',
                    display: 'flex',
                    gap: '12px',
                    transition: 'all 0.2s ease',
                    opacity: isUnlocked ? 1 : 0.6,
                  }}
                >
                  {/* Icon */}
                  <div style={{
                    fontSize: '32px',
                    width: '48px',
                    height: '48px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: isUnlocked 
                      ? 'rgba(255, 215, 0, 0.2)' 
                      : 'rgba(0, 0, 0, 0.3)',
                    borderRadius: '8px',
                    filter: isUnlocked ? 'none' : 'grayscale(100%)',
                  }}>
                    {achievement.icon || '🏆'}
                  </div>
                  
                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontWeight: 'bold',
                      fontSize: '14px',
                      color: isUnlocked ? '#ffd700' : '#ffffff',
                      marginBottom: '4px',
                      textAlign: 'left',
                    }}>
                      {achievement.name}
                      {isUnlocked && <span style={{ marginLeft: '8px' }}>✓</span>}
                    </div>
                    <div style={{
                      fontSize: '12px',
                      color: 'rgba(255, 255, 255, 0.7)',
                      marginBottom: '6px',
                      lineHeight: '1.4',
                      textAlign: 'left',
                    }}>
                      {achievement.description}
                    </div>
                    <div style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '8px',
                      fontSize: '11px',
                    }}>
                      {Number(achievement.xpReward) > 0 && (
                        <span style={{ color: '#00ffff' }}>
                          +{Number(achievement.xpReward)} XP
                        </span>
                      )}
                      {achievement.titleReward && (
                        <span style={{ color: '#ff6b9d' }}>
                          Title: {achievement.titleReward}
                        </span>
                      )}
                      {unlockTime && (
                        <span style={{ 
                          color: 'rgba(255, 255, 255, 0.5)',
                          marginLeft: 'auto',
                        }}>
                          {unlockTime.toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default AchievementsPanel;

