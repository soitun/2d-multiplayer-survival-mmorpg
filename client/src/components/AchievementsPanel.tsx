import React, { useState, useMemo } from 'react';
import { Identity } from 'spacetimedb';
import { AchievementDefinition, PlayerAchievement, AchievementCategory } from '../generated';

interface AchievementsPanelProps {
  playerIdentity: Identity | null;
  achievementDefinitions: Map<string, AchievementDefinition>;
  playerAchievements: Map<string, PlayerAchievement>;
  onClose?: () => void;
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

const AchievementsPanel: React.FC<AchievementsPanelProps> = ({
  playerIdentity,
  achievementDefinitions,
  playerAchievements,
  onClose,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showUnlockedOnly, setShowUnlockedOnly] = useState(false);

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

  // Filter achievements by category and unlock status
  const filteredAchievements = useMemo(() => {
    let achievements = Array.from(achievementDefinitions.values());
    
    if (selectedCategory) {
      achievements = achievements.filter((def) => {
        const categoryTag = typeof def.category === 'object' && def.category?.tag
          ? def.category.tag
          : String(def.category);
        return categoryTag === selectedCategory;
      });
    }
    
    if (showUnlockedOnly) {
      achievements = achievements.filter((def) => unlockedAchievementIds.has(def.id));
    }
    
    // Sort: unlocked first, then by name
    achievements.sort((a, b) => {
      const aUnlocked = unlockedAchievementIds.has(a.id);
      const bUnlocked = unlockedAchievementIds.has(b.id);
      if (aUnlocked !== bUnlocked) return aUnlocked ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    
    return achievements;
  }, [achievementDefinitions, selectedCategory, showUnlockedOnly, unlockedAchievementIds]);

  // Calculate stats
  const stats = useMemo(() => {
    const total = achievementDefinitions.size;
    const unlocked = unlockedAchievementIds.size;
    const percentage = total > 0 ? Math.round((unlocked / total) * 100) : 0;
    return { total, unlocked, percentage };
  }, [achievementDefinitions, unlockedAchievementIds]);

  // Get unlock timestamp for an achievement
  const getUnlockTime = (achievementId: string): Date | null => {
    for (const pa of playerAchievements.values()) {
      if (pa.achievementId === achievementId && 
          playerIdentity && 
          pa.playerId.toHexString() === playerIdentity.toHexString()) {
        // Convert microseconds to milliseconds for Date constructor
        return new Date(Number(pa.unlockedAt.microsSinceUnixEpoch / 1000n));
      }
    }
    return null;
  };

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'rgba(15, 23, 35, 0.95)',
      border: '2px solid #ffd700',
      borderRadius: '4px',
      padding: '20px',
      boxSizing: 'border-box',
      color: '#ffffff',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '15px',
        borderBottom: '1px solid rgba(255, 215, 0, 0.3)',
        paddingBottom: '15px',
      }}>
        <div>
          <h2 style={{
            color: '#ffd700',
            margin: 0,
            fontSize: '24px',
            fontWeight: 'bold',
            textShadow: '0 0 10px rgba(255, 215, 0, 0.5)',
          }}>
            🏆 ACHIEVEMENTS
          </h2>
          <div style={{
            marginTop: '8px',
            fontSize: '13px',
            color: 'rgba(255, 255, 255, 0.8)',
          }}>
            <span style={{ color: '#ffd700', fontWeight: 'bold' }}>{stats.unlocked}</span>
            <span> / {stats.total} ({stats.percentage}%)</span>
          </div>
        </div>
        
        {/* Progress bar */}
        <div style={{
          width: '150px',
          height: '24px',
          background: 'rgba(0, 0, 0, 0.5)',
          borderRadius: '12px',
          overflow: 'hidden',
          border: '1px solid rgba(255, 215, 0, 0.3)',
        }}>
          <div style={{
            width: `${stats.percentage}%`,
            height: '100%',
            background: 'linear-gradient(90deg, #ffd700, #ffaa00)',
            transition: 'width 0.3s ease',
          }} />
        </div>
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px',
        marginBottom: '15px',
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

      {/* Achievements List */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        paddingRight: '8px',
      }}>
        {filteredAchievements.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '40px 20px',
            color: 'rgba(255, 255, 255, 0.6)',
          }}>
            <div style={{ fontSize: '24px', marginBottom: '10px' }}>🏆</div>
            <div>No achievements found.</div>
            {showUnlockedOnly && (
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
                    }}>
                      {achievement.name}
                      {isUnlocked && <span style={{ marginLeft: '8px' }}>✓</span>}
                    </div>
                    <div style={{
                      fontSize: '12px',
                      color: 'rgba(255, 255, 255, 0.7)',
                      marginBottom: '6px',
                      lineHeight: '1.4',
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

