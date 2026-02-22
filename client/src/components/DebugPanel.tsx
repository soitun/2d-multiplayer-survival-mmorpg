import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useDebug } from '../contexts/DebugContext';
import { WorldState as SpacetimeDBWorldState, ItemDefinition } from '../generated';
import { DbConnection } from '../generated';
import springIcon from '../assets/ui/spring.png';
import summerIcon from '../assets/ui/summer.png';
import autumnIcon from '../assets/ui/autumn.png';
import winterIcon from '../assets/ui/winter.png';
import clockIcon from '../assets/ui/clock.png';

interface DebugPanelProps {
    localPlayer: any;
    worldState: SpacetimeDBWorldState | null;
    connection: DbConnection | null;
    itemDefinitions?: Map<string, ItemDefinition>;
}

// Custom scrollbar styles for the debug panel
const scrollbarStyles = `
    .debug-panel-scroll::-webkit-scrollbar {
        width: 8px;
    }
    .debug-panel-scroll::-webkit-scrollbar-track {
        background: rgba(0, 30, 50, 0.5);
        border-radius: 4px;
    }
    .debug-panel-scroll::-webkit-scrollbar-thumb {
        background: rgba(0, 212, 255, 0.4);
        border-radius: 4px;
        border: 1px solid rgba(0, 212, 255, 0.2);
    }
    .debug-panel-scroll::-webkit-scrollbar-thumb:hover {
        background: rgba(0, 212, 255, 0.6);
    }
    /* Hide native number input spinners */
    .debug-qty-input::-webkit-outer-spin-button,
    .debug-qty-input::-webkit-inner-spin-button {
        -webkit-appearance: none;
        margin: 0;
    }
    .debug-qty-input {
        -moz-appearance: textfield;
    }
`;

// All spawnable animal/NPC species
const ANIMAL_SPECIES = [
    // Wildlife
    { value: 'CinderFox', label: '🦊 Cinder Fox', category: 'Wildlife' },
    { value: 'TundraWolf', label: '🐺 Tundra Wolf', category: 'Wildlife' },
    { value: 'CableViper', label: '🐍 Cable Viper', category: 'Wildlife' },
    { value: 'ArcticWalrus', label: '🦭 Arctic Walrus', category: 'Wildlife' },
    { value: 'BeachCrab', label: '🦀 Beach Crab', category: 'Wildlife' },
    { value: 'Vole', label: '🐭 Vole', category: 'Wildlife' },
    { value: 'Wolverine', label: '🦡 Wolverine', category: 'Wildlife' },
    { value: 'Caribou', label: '🦌 Caribou', category: 'Wildlife' },
    // Birds
    { value: 'Tern', label: '🐦 Tern', category: 'Birds' },
    { value: 'Crow', label: '🐦‍⬛ Crow', category: 'Birds' },
    // Aquatic
    { value: 'SalmonShark', label: '🦈 Salmon Shark', category: 'Aquatic' },
    { value: 'Jellyfish', label: '🪼 Jellyfish', category: 'Aquatic' },
    // Hostile NPCs
    { value: 'Shorebound', label: '👹 Shorebound', category: 'Hostile NPCs' },
    { value: 'Shardkin', label: '👾 Shardkin', category: 'Hostile NPCs' },
    { value: 'DrownedWatch', label: '💀 Drowned Watch', category: 'Hostile NPCs' },
];

// Category display order for item spawner
const ITEM_CATEGORY_ORDER = ['Tool', 'Weapon', 'RangedWeapon', 'Ammunition', 'Armor', 'Consumable', 'Material', 'Placeable'];

const DebugPanel: React.FC<DebugPanelProps> = ({ localPlayer, worldState, connection, itemDefinitions }) => {
    const { showAutotileDebug, toggleAutotileDebug, showChunkBoundaries, toggleChunkBoundaries, showInteriorDebug, toggleInteriorDebug, showCollisionDebug, toggleCollisionDebug, showAttackRangeDebug, toggleAttackRangeDebug, showYSortDebug, toggleYSortDebug, showShipwreckDebug, toggleShipwreckDebug, showFpsProfiler, toggleFpsProfiler } = useDebug();
    const [isMinimized, setIsMinimized] = useState(false);
    const [selectedAnimal, setSelectedAnimal] = useState(ANIMAL_SPECIES[0].value);
    
    // Item spawner state
    const [selectedItemDef, setSelectedItemDef] = useState<ItemDefinition | null>(null);
    const [itemSearchQuery, setItemSearchQuery] = useState('');
    const [itemDropdownOpen, setItemDropdownOpen] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const [spawnItemQuantity, setSpawnItemQuantity] = useState('1');
    const [spawnStatus, setSpawnStatus] = useState<{message: string, type: 'success' | 'error'} | null>(null);
    const itemDropdownRef = useRef<HTMLDivElement>(null);
    const highlightedItemRef = useRef<HTMLDivElement>(null);

    // All items from server, sorted by category then name
    const allItems = useMemo(() => {
        if (!itemDefinitions?.size) return [];
        const items = Array.from(itemDefinitions.values());
        return items.sort((a, b) => {
            const catA = a.category?.tag ?? '';
            const catB = b.category?.tag ?? '';
            const catOrderA = ITEM_CATEGORY_ORDER.indexOf(catA);
            const catOrderB = ITEM_CATEGORY_ORDER.indexOf(catB);
            if (catOrderA !== catOrderB) return (catOrderA >= 0 ? catOrderA : 99) - (catOrderB >= 0 ? catOrderB : 99);
            return (a.name ?? '').localeCompare(b.name ?? '');
        });
    }, [itemDefinitions]);

    // Filtered items for dropdown (case-insensitive search, exact matches first)
    const filteredItems = useMemo(() => {
        const q = itemSearchQuery.trim().toLowerCase();
        if (!q) return allItems;
        const exact: ItemDefinition[] = [];
        const partial: ItemDefinition[] = [];
        for (const item of allItems) {
            const name = (item.name ?? '').toLowerCase();
            if (!name.includes(q)) continue;
            if (name === q) exact.push(item);
            else partial.push(item);
        }
        return [...exact, ...partial];
    }, [allItems, itemSearchQuery]);

    // Reset highlighted index when query or filtered results change
    useEffect(() => {
        setHighlightedIndex(0);
    }, [itemSearchQuery, filteredItems.length]);

    // Scroll highlighted item into view when navigating with keyboard
    useEffect(() => {
        highlightedItemRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, [highlightedIndex]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (itemDropdownRef.current && !itemDropdownRef.current.contains(e.target as Node)) {
                setItemDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const cycleWeather = (direction: 'forward' | 'backward') => {
        const weatherTypes = ['Clear', 'LightRain', 'ModerateRain', 'HeavyRain', 'HeavyStorm'];
        const currentWeather = worldState?.currentWeather?.tag;
        const currentIndex = weatherTypes.indexOf(currentWeather || 'Clear');
        
        let nextIndex: number;
        if (direction === 'forward') {
            nextIndex = (currentIndex + 1) % weatherTypes.length;
        } else {
            nextIndex = (currentIndex - 1 + weatherTypes.length) % weatherTypes.length;
        }
        
        const nextWeather = weatherTypes[nextIndex];

        if (connection) {
            try {
                (connection.reducers as any).debugSetWeather(nextWeather);
            } catch (error) {
                console.warn('Debug weather function not available (production build?):', error);
            }
        }
    };

    const cycleTime = (direction: 'forward' | 'backward') => {
        const timeOrder = ['Night', 'Midnight', 'TwilightMorning', 'Dawn', 'Morning', 'Noon', 'Afternoon', 'Dusk', 'TwilightEvening'];
        const currentTimeOfDay = worldState?.timeOfDay?.tag || 'Noon';
        const currentIndex = timeOrder.indexOf(currentTimeOfDay);
        
        let nextIndex: number;
        if (direction === 'forward') {
            nextIndex = (currentIndex + 1) % timeOrder.length;
        } else {
            nextIndex = (currentIndex - 1 + timeOrder.length) % timeOrder.length;
        }
        
        const nextTime = timeOrder[nextIndex];

        if (connection) {
            try {
                (connection.reducers as any).debugSetTime(nextTime);
            } catch (error) {
                console.warn('Debug time function not available (production build?):', error);
            }
        }
    };

    const cycleSeason = (direction: 'forward' | 'backward') => {
        const seasonOrder = ['Spring', 'Summer', 'Autumn', 'Winter'];
        const currentSeason = worldState?.currentSeason?.tag || 'Spring';
        const currentIndex = seasonOrder.indexOf(currentSeason);
        
        let nextIndex: number;
        if (direction === 'forward') {
            nextIndex = (currentIndex + 1) % seasonOrder.length;
        } else {
            nextIndex = (currentIndex - 1 + seasonOrder.length) % seasonOrder.length;
        }
        
        const nextSeason = seasonOrder[nextIndex];

        if (connection) {
            try {
                (connection.reducers as any).debugSetSeason(nextSeason);
            } catch (error) {
                console.warn('Debug season function not available (production build?):', error);
            }
        }
    };

    const spawnAnimal = () => {
        if (connection && selectedAnimal) {
            try {
                (connection.reducers as any).debugSpawnAnimal(selectedAnimal);
                console.log(`Spawning ${selectedAnimal} near player`);
            } catch (error) {
                console.warn('Debug spawn animal function not available (production build?):', error);
            }
        }
    };

    const simulateDrone = () => {
        if (connection) {
            try {
                (connection.reducers as any).debugSimulateDrone();
                console.log('Simulating drone flyover over player');
            } catch (error) {
                console.warn('Debug simulate drone function not available (production build?):', error);
            }
        }
    };

    const spawnItem = (itemOverride?: ItemDefinition | null) => {
        const itemToSpawn = itemOverride ?? selectedItemDef;
        if (connection && itemToSpawn?.name) {
            const qty = parseInt(spawnItemQuantity, 10);
            if (isNaN(qty) || qty < 1) {
                setSpawnStatus({ message: 'Quantity must be at least 1', type: 'error' });
                setTimeout(() => setSpawnStatus(null), 3000);
                return;
            }
            try {
                (connection.reducers as any).debugSpawnItem(itemToSpawn.name, qty);
                console.log(`Spawning ${qty}x ${itemToSpawn.name} near player`);
                setSpawnStatus({ message: `Spawned ${qty}x ${itemToSpawn.name}`, type: 'success' });
                setTimeout(() => setSpawnStatus(null), 3000);
            } catch (error) {
                console.warn('Debug spawn item function not available (production build?):', error);
                setSpawnStatus({ message: 'Spawn function not available', type: 'error' });
                setTimeout(() => setSpawnStatus(null), 3000);
            }
        } else if (!itemToSpawn) {
            setSpawnStatus({ message: 'Select an item from the list', type: 'error' });
            setTimeout(() => setSpawnStatus(null), 3000);
        }
    };

    const getWeatherColor = () => {
        const weather = worldState?.currentWeather?.tag;
        switch (weather) {
            case 'Clear': return { bg: 'linear-gradient(135deg, rgba(76, 175, 80, 0.3), rgba(56, 142, 60, 0.4))', color: '#4CAF50', border: '1px solid #4CAF50' };
            case 'LightRain': return { bg: 'linear-gradient(135deg, rgba(3, 169, 244, 0.3), rgba(2, 136, 209, 0.4))', color: '#03A9F4', border: '1px solid #03A9F4' };
            case 'ModerateRain': return { bg: 'linear-gradient(135deg, rgba(33, 150, 243, 0.3), rgba(25, 118, 210, 0.4))', color: '#2196F3', border: '1px solid #2196F3' };
            case 'HeavyRain': return { bg: 'linear-gradient(135deg, rgba(63, 81, 181, 0.3), rgba(48, 63, 159, 0.4))', color: '#3F51B5', border: '1px solid #3F51B5' };
            case 'HeavyStorm': return { bg: 'linear-gradient(135deg, rgba(156, 39, 176, 0.3), rgba(123, 31, 162, 0.4))', color: '#9C27B0', border: '1px solid #9C27B0' };
            default: return { bg: 'linear-gradient(135deg, rgba(255, 152, 0, 0.3), rgba(245, 124, 0, 0.4))', color: '#FF9800', border: '1px solid #FF9800' };
        }
    };

    const getWeatherLabel = () => {
        const weather = worldState?.currentWeather?.tag;
        switch (weather) {
            case 'Clear': return 'CLEAR';
            case 'LightRain': return 'LIGHT';
            case 'ModerateRain': return 'MODERATE';
            case 'HeavyRain': return 'HEAVY';
            case 'HeavyStorm': return 'STORM';
            default: return 'UNKNOWN';
        }
    };

    const getTimeColor = () => {
        const timeOfDay = worldState?.timeOfDay?.tag;
        if (timeOfDay === 'Night' || timeOfDay === 'Midnight') 
            return { bg: 'linear-gradient(135deg, rgba(63, 81, 181, 0.3), rgba(48, 63, 159, 0.4))', color: '#7986CB', border: '1px solid #7986CB' };
        if (timeOfDay === 'Dawn' || timeOfDay === 'Dusk') 
            return { bg: 'linear-gradient(135deg, rgba(255, 152, 0, 0.3), rgba(245, 124, 0, 0.4))', color: '#FF9800', border: '1px solid #FF9800' };
        if (timeOfDay === 'TwilightMorning' || timeOfDay === 'TwilightEvening') 
            return { bg: 'linear-gradient(135deg, rgba(156, 39, 176, 0.3), rgba(123, 31, 162, 0.4))', color: '#BA68C8', border: '1px solid #BA68C8' };
        return { bg: 'linear-gradient(135deg, rgba(255, 235, 59, 0.3), rgba(251, 192, 45, 0.4))', color: '#FFD54F', border: '1px solid #FFD54F' };
    };

    const getSeasonColor = () => {
        const season = worldState?.currentSeason?.tag;
        switch (season) {
            case 'Spring': return { bg: 'linear-gradient(135deg, rgba(129, 199, 132, 0.3), rgba(102, 187, 106, 0.4))', color: '#81C784', border: '1px solid #81C784', icon: springIcon };
            case 'Summer': return { bg: 'linear-gradient(135deg, rgba(255, 213, 79, 0.3), rgba(255, 193, 7, 0.4))', color: '#FFD54F', border: '1px solid #FFD54F', icon: summerIcon };
            case 'Autumn': return { bg: 'linear-gradient(135deg, rgba(255, 138, 101, 0.3), rgba(255, 112, 67, 0.4))', color: '#FF8A65', border: '1px solid #FF8A65', icon: autumnIcon };
            case 'Winter': return { bg: 'linear-gradient(135deg, rgba(144, 202, 249, 0.3), rgba(100, 181, 246, 0.4))', color: '#90CAF9', border: '1px solid #90CAF9', icon: winterIcon };
            default: return { bg: 'linear-gradient(135deg, rgba(129, 199, 132, 0.3), rgba(102, 187, 106, 0.4))', color: '#81C784', border: '1px solid #81C784', icon: springIcon };
        }
    };

    const weatherColors = getWeatherColor();
    const timeColors = getTimeColor();
    const seasonColors = getSeasonColor();

    return (
        <div style={{
            position: 'absolute',
            top: '70px',
            left: '15px',
            zIndex: 998,
            background: 'linear-gradient(145deg, rgba(15, 30, 50, 0.95), rgba(10, 20, 40, 0.98))',
            border: '2px solid #00d4ff',
            borderRadius: '8px',
            padding: '12px',
            fontSize: '11px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            boxShadow: '0 0 20px rgba(0, 212, 255, 0.3), inset 0 0 15px rgba(0, 212, 255, 0.1)',
            fontFamily: '"Press Start 2P", monospace',
            minWidth: '240px',
            maxHeight: '475px',
            overflowY: 'auto',
            overflowX: 'hidden'
        }}
        className="debug-panel-scroll"
        data-id="debug-panel-scroll"
        onWheel={(e) => e.stopPropagation()}
        >
            {/* Inject scrollbar styles */}
            <style>{scrollbarStyles}</style>
            {/* Header with Minimize Button - sticky so it stays visible when scrolling */}
            <div style={{
                position: 'sticky',
                top: 0,
                zIndex: 10,
                flexShrink: 0,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '4px',
                borderBottom: '1px solid rgba(0, 212, 255, 0.3)',
                paddingBottom: '6px',
                background: 'linear-gradient(145deg, rgba(15, 30, 50, 0.98), rgba(10, 20, 40, 0.99))',
                marginLeft: '-12px',
                marginRight: '-12px',
                marginTop: '-12px',
                padding: '12px 12px 6px 12px'
            }}>
                <div style={{
                    fontSize: '11px',
                    color: '#00d4ff',
                    textShadow: '0 0 8px rgba(0, 212, 255, 0.8)',
                    letterSpacing: '1px',
                    flex: 1,
                    textAlign: 'center'
                }}>
                    DEBUG CONSOLE
                </div>
                <button
                    onClick={() => setIsMinimized(!isMinimized)}
                    onFocus={(e) => e.currentTarget.blur()}
                    style={{
                        background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.2), rgba(0, 170, 255, 0.3))',
                        color: '#00d4ff',
                        border: '1px solid rgba(0, 212, 255, 0.4)',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        fontFamily: 'inherit',
                        minWidth: '28px'
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0, 212, 255, 0.3), rgba(0, 170, 255, 0.4))';
                        e.currentTarget.style.boxShadow = '0 0 10px rgba(0, 212, 255, 0.4)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0, 212, 255, 0.2), rgba(0, 170, 255, 0.3))';
                        e.currentTarget.style.boxShadow = 'none';
                    }}
                >
                    {isMinimized ? '▼' : '▲'}
                </button>
            </div>

            {!isMinimized && (
                <>
                    {/* Tileset Toggle */}
                    <button
                        onClick={(e) => {
                            toggleAutotileDebug();
                            e.currentTarget.blur();
                        }}
                        onFocus={(e) => e.currentTarget.blur()}
                        style={{
                            background: showAutotileDebug 
                                ? 'linear-gradient(135deg, rgba(0, 212, 255, 0.3), rgba(0, 170, 255, 0.4))' 
                                : 'linear-gradient(135deg, rgba(60, 30, 30, 0.6), rgba(40, 20, 20, 0.7))',
                            color: showAutotileDebug ? '#00ffff' : '#ff6b6b',
                            border: showAutotileDebug ? '1px solid #00d4ff' : '1px solid #ff6b6b',
                            padding: '8px 12px',
                            borderRadius: '4px',
                            fontSize: '10px',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            textShadow: showAutotileDebug ? '0 0 5px #00ffff' : '0 0 5px #ff6b6b',
                            boxShadow: showAutotileDebug 
                                ? '0 0 10px rgba(0, 212, 255, 0.3)' 
                                : '0 0 10px rgba(255, 107, 107, 0.2)',
                            fontFamily: 'inherit',
                            letterSpacing: '0.5px'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-1px)';
                            e.currentTarget.style.boxShadow = showAutotileDebug 
                                ? '0 0 15px rgba(0, 212, 255, 0.5)' 
                                : '0 0 15px rgba(255, 107, 107, 0.4)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = showAutotileDebug 
                                ? '0 0 10px rgba(0, 212, 255, 0.3)' 
                                : '0 0 10px rgba(255, 107, 107, 0.2)';
                        }}
                    >
                        TILESET: {showAutotileDebug ? 'ON' : 'OFF'}
                    </button>

                    {/* Chunk Boundaries Toggle */}
                    <button
                        onClick={(e) => {
                            toggleChunkBoundaries();
                            e.currentTarget.blur();
                        }}
                        onFocus={(e) => e.currentTarget.blur()}
                        style={{
                            background: showChunkBoundaries 
                                ? 'linear-gradient(135deg, rgba(255, 165, 0, 0.3), rgba(255, 140, 0, 0.4))' 
                                : 'linear-gradient(135deg, rgba(60, 30, 30, 0.6), rgba(40, 20, 20, 0.7))',
                            color: showChunkBoundaries ? '#ffaa00' : '#ff6b6b',
                            border: showChunkBoundaries ? '1px solid #ff8800' : '1px solid #ff6b6b',
                            padding: '8px 12px',
                            borderRadius: '4px',
                            fontSize: '10px',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            textShadow: showChunkBoundaries ? '0 0 5px #ffaa00' : '0 0 5px #ff6b6b',
                            boxShadow: showChunkBoundaries 
                                ? '0 0 10px rgba(255, 165, 0, 0.3)' 
                                : '0 0 10px rgba(255, 107, 107, 0.2)',
                            fontFamily: 'inherit',
                            letterSpacing: '0.5px'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-1px)';
                            e.currentTarget.style.boxShadow = showChunkBoundaries 
                                ? '0 0 15px rgba(255, 165, 0, 0.5)' 
                                : '0 0 15px rgba(255, 107, 107, 0.4)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = showChunkBoundaries 
                                ? '0 0 10px rgba(255, 165, 0, 0.3)' 
                                : '0 0 10px rgba(255, 107, 107, 0.2)';
                        }}
                    >
                        CHUNKS: {showChunkBoundaries ? 'ON' : 'OFF'}
                    </button>

                    {/* Interior Debug Toggle */}
                    <button
                        onClick={(e) => {
                            toggleInteriorDebug();
                            e.currentTarget.blur();
                        }}
                        onFocus={(e) => e.currentTarget.blur()}
                        style={{
                            background: showInteriorDebug 
                                ? 'linear-gradient(135deg, rgba(0, 255, 136, 0.3), rgba(0, 200, 100, 0.4))' 
                                : 'linear-gradient(135deg, rgba(60, 30, 30, 0.6), rgba(40, 20, 20, 0.7))',
                            color: showInteriorDebug ? '#00ff88' : '#ff6b6b',
                            border: showInteriorDebug ? '1px solid #00ff88' : '1px solid #ff6b6b',
                            padding: '8px 12px',
                            borderRadius: '4px',
                            fontSize: '10px',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            textShadow: showInteriorDebug ? '0 0 5px #00ff88' : '0 0 5px #ff6b6b',
                            boxShadow: showInteriorDebug 
                                ? '0 0 10px rgba(0, 255, 136, 0.3)' 
                                : '0 0 10px rgba(255, 107, 107, 0.2)',
                            fontFamily: 'inherit',
                            letterSpacing: '0.5px'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-1px)';
                            e.currentTarget.style.boxShadow = showInteriorDebug 
                                ? '0 0 15px rgba(0, 255, 136, 0.5)' 
                                : '0 0 15px rgba(255, 107, 107, 0.4)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = showInteriorDebug 
                                ? '0 0 10px rgba(0, 255, 136, 0.3)' 
                                : '0 0 10px rgba(255, 107, 107, 0.2)';
                        }}
                    >
                        INTERIOR: {showInteriorDebug ? 'ON' : 'OFF'}
                    </button>

                    {/* Collision Debug Toggle */}
                    <button
                        onClick={(e) => {
                            toggleCollisionDebug();
                            e.currentTarget.blur();
                        }}
                        onFocus={(e) => e.currentTarget.blur()}
                        style={{
                            background: showCollisionDebug 
                                ? 'linear-gradient(135deg, rgba(255, 0, 128, 0.3), rgba(200, 0, 100, 0.4))' 
                                : 'linear-gradient(135deg, rgba(60, 30, 30, 0.6), rgba(40, 20, 20, 0.7))',
                            color: showCollisionDebug ? '#ff0080' : '#ff6b6b',
                            border: showCollisionDebug ? '1px solid #ff0080' : '1px solid #ff6b6b',
                            padding: '8px 12px',
                            borderRadius: '4px',
                            fontSize: '10px',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            textShadow: showCollisionDebug ? '0 0 5px #ff0080' : '0 0 5px #ff6b6b',
                            boxShadow: showCollisionDebug 
                                ? '0 0 10px rgba(255, 0, 128, 0.3)' 
                                : '0 0 10px rgba(255, 107, 107, 0.2)',
                            fontFamily: 'inherit',
                            letterSpacing: '0.5px'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-1px)';
                            e.currentTarget.style.boxShadow = showCollisionDebug 
                                ? '0 0 15px rgba(255, 0, 128, 0.5)' 
                                : '0 0 15px rgba(255, 107, 107, 0.4)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = showCollisionDebug 
                                ? '0 0 10px rgba(255, 0, 128, 0.3)' 
                                : '0 0 10px rgba(255, 107, 107, 0.2)';
                        }}
                    >
                        COLLISION: {showCollisionDebug ? 'ON' : 'OFF'}
                    </button>

                    {/* Attack Range Debug Toggle */}
                    <button
                        onClick={(e) => {
                            toggleAttackRangeDebug();
                            e.currentTarget.blur();
                        }}
                        onFocus={(e) => e.currentTarget.blur()}
                        style={{
                            background: showAttackRangeDebug 
                                ? 'linear-gradient(135deg, rgba(255, 69, 0, 0.3), rgba(200, 50, 0, 0.4))' 
                                : 'linear-gradient(135deg, rgba(60, 30, 30, 0.6), rgba(40, 20, 20, 0.7))',
                            color: showAttackRangeDebug ? '#ff4500' : '#ff6b6b',
                            border: showAttackRangeDebug ? '1px solid #ff4500' : '1px solid #ff6b6b',
                            padding: '8px 12px',
                            borderRadius: '4px',
                            fontSize: '10px',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            textShadow: showAttackRangeDebug ? '0 0 5px #ff4500' : '0 0 5px #ff6b6b',
                            boxShadow: showAttackRangeDebug 
                                ? '0 0 10px rgba(255, 69, 0, 0.3)' 
                                : '0 0 10px rgba(255, 107, 107, 0.2)',
                            fontFamily: 'inherit',
                            letterSpacing: '0.5px'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-1px)';
                            e.currentTarget.style.boxShadow = showAttackRangeDebug 
                                ? '0 0 15px rgba(255, 69, 0, 0.5)' 
                                : '0 0 15px rgba(255, 107, 107, 0.4)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = showAttackRangeDebug 
                                ? '0 0 10px rgba(255, 69, 0, 0.3)' 
                                : '0 0 10px rgba(255, 107, 107, 0.2)';
                        }}
                    >
                        ATK RANGE: {showAttackRangeDebug ? 'ON' : 'OFF'}
                    </button>

                    {/* Y-Sort Debug Toggle */}
                    <button
                        onClick={(e) => {
                            toggleYSortDebug();
                            e.currentTarget.blur();
                        }}
                        onFocus={(e) => e.currentTarget.blur()}
                        style={{
                            background: showYSortDebug
                                ? 'linear-gradient(135deg, rgba(255, 215, 0, 0.3), rgba(200, 170, 0, 0.4))'
                                : 'linear-gradient(135deg, rgba(60, 30, 30, 0.6), rgba(40, 20, 20, 0.7))',
                            color: showYSortDebug ? '#ffd700' : '#ff6b6b',
                            border: showYSortDebug ? '1px solid #ffd700' : '1px solid #ff6b6b',
                            padding: '8px 12px',
                            borderRadius: '4px',
                            fontSize: '10px',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            textShadow: showYSortDebug ? '0 0 5px #ffd700' : '0 0 5px #ff6b6b',
                            boxShadow: showYSortDebug
                                ? '0 0 10px rgba(255, 215, 0, 0.3)'
                                : '0 0 10px rgba(255, 107, 107, 0.2)',
                            fontFamily: 'inherit',
                            letterSpacing: '0.5px'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-1px)';
                            e.currentTarget.style.boxShadow = showYSortDebug
                                ? '0 0 15px rgba(255, 215, 0, 0.5)'
                                : '0 0 15px rgba(255, 107, 107, 0.4)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = showYSortDebug
                                ? '0 0 10px rgba(255, 215, 0, 0.3)'
                                : '0 0 10px rgba(255, 107, 107, 0.2)';
                        }}
                    >
                        Y-SORT: {showYSortDebug ? 'ON' : 'OFF'}
                    </button>

                    {/* Shipwreck Protection Zone Debug Toggle */}
                    <button
                        onClick={(e) => {
                            toggleShipwreckDebug();
                            e.currentTarget.blur();
                        }}
                        onFocus={(e) => e.currentTarget.blur()}
                        style={{
                            background: showShipwreckDebug
                                ? 'linear-gradient(135deg, rgba(140, 100, 220, 0.3), rgba(100, 60, 180, 0.4))'
                                : 'linear-gradient(135deg, rgba(60, 30, 30, 0.6), rgba(40, 20, 20, 0.7))',
                            color: showShipwreckDebug ? '#8c64dc' : '#ff6b6b',
                            border: showShipwreckDebug ? '1px solid #8c64dc' : '1px solid #ff6b6b',
                            padding: '8px 12px',
                            borderRadius: '4px',
                            fontSize: '10px',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            textShadow: showShipwreckDebug ? '0 0 5px #8c64dc' : '0 0 5px #ff6b6b',
                            boxShadow: showShipwreckDebug
                                ? '0 0 10px rgba(140, 100, 220, 0.3)'
                                : '0 0 10px rgba(255, 107, 107, 0.2)',
                            fontFamily: 'inherit',
                            letterSpacing: '0.5px'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-1px)';
                            e.currentTarget.style.boxShadow = showShipwreckDebug
                                ? '0 0 15px rgba(140, 100, 220, 0.5)'
                                : '0 0 15px rgba(255, 107, 107, 0.4)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = showShipwreckDebug
                                ? '0 0 10px rgba(140, 100, 220, 0.3)'
                                : '0 0 10px rgba(255, 107, 107, 0.2)';
                        }}
                    >
                        SHIPWRECK: {showShipwreckDebug ? 'ON' : 'OFF'}
                    </button>

                    {/* FPS Profiler Toggle */}
                    <button
                        onClick={(e) => {
                            toggleFpsProfiler();
                            e.currentTarget.blur();
                        }}
                        onFocus={(e) => e.currentTarget.blur()}
                        style={{
                            background: showFpsProfiler
                                ? 'linear-gradient(135deg, rgba(0, 255, 127, 0.3), rgba(0, 200, 100, 0.4))'
                                : 'linear-gradient(135deg, rgba(60, 30, 30, 0.6), rgba(40, 20, 20, 0.7))',
                            color: showFpsProfiler ? '#00ff7f' : '#ff6b6b',
                            border: showFpsProfiler ? '1px solid #00ff7f' : '1px solid #ff6b6b',
                            padding: '8px 12px',
                            borderRadius: '4px',
                            fontSize: '10px',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            textShadow: showFpsProfiler ? '0 0 5px #00ff7f' : '0 0 5px #ff6b6b',
                            boxShadow: showFpsProfiler
                                ? '0 0 10px rgba(0, 255, 127, 0.3)'
                                : '0 0 10px rgba(255, 107, 107, 0.2)',
                            fontFamily: 'inherit',
                            letterSpacing: '0.5px'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-1px)';
                            e.currentTarget.style.boxShadow = showFpsProfiler
                                ? '0 0 15px rgba(0, 255, 127, 0.5)'
                                : '0 0 15px rgba(255, 107, 107, 0.4)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = showFpsProfiler
                                ? '0 0 10px rgba(0, 255, 127, 0.3)'
                                : '0 0 10px rgba(255, 107, 107, 0.2)';
                        }}
                    >
                        FPS PROFILER: {showFpsProfiler ? 'ON' : 'OFF'}
                    </button>

                    {/* Position Display */}
                    {localPlayer && (
                        <div style={{
                            fontSize: '10px',
                            color: '#00ff88',
                            textShadow: '0 0 6px rgba(0, 255, 136, 0.6)',
                            background: 'rgba(0, 255, 136, 0.1)',
                            border: '1px solid rgba(0, 255, 136, 0.3)',
                            borderRadius: '4px',
                            padding: '8px 10px',
                            letterSpacing: '0.5px',
                            textAlign: 'center'
                        }}>
                            <div style={{ marginBottom: '4px', opacity: 0.8 }}>📍 POSITION</div>
                            <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', fontSize: '10px' }}>
                                <span>X:{Math.round(localPlayer.positionX)}</span>
                                <span>Y:{Math.round(localPlayer.positionY)}</span>
                            </div>
                        </div>
                    )}

                    {/* Weather Control */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {/* Left Arrow */}
                        <button
                            onClick={(e) => {
                                cycleWeather('backward');
                                e.currentTarget.blur();
                            }}
                            onFocus={(e) => e.currentTarget.blur()}
                            style={{
                                background: 'linear-gradient(135deg, rgba(100, 100, 100, 0.3), rgba(80, 80, 80, 0.4))',
                                color: '#aaaaaa',
                                border: '1px solid rgba(170, 170, 170, 0.3)',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                fontSize: '10px',
                                cursor: 'pointer',
                                minWidth: '32px',
                                transition: 'all 0.2s ease',
                                fontFamily: 'inherit'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(120, 120, 120, 0.4), rgba(100, 100, 100, 0.5))';
                                e.currentTarget.style.color = '#ffffff';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(100, 100, 100, 0.3), rgba(80, 80, 80, 0.4))';
                                e.currentTarget.style.color = '#aaaaaa';
                            }}
                        >
                            ←
                        </button>
                        
                        {/* Weather Display Button (non-clickable) */}
                        <div
                            style={{
                                background: weatherColors.bg,
                                color: weatherColors.color,
                                border: weatherColors.border,
                                padding: '8px 12px',
                                borderRadius: '4px',
                                fontSize: '10px',
                                cursor: 'default',
                                textShadow: '0 0 5px currentColor',
                                boxShadow: '0 0 10px rgba(255, 255, 255, 0.2)',
                                fontFamily: 'inherit',
                                letterSpacing: '0.5px',
                                flex: 1,
                                textAlign: 'center'
                            }}
                        >
                            ☁️ {getWeatherLabel()}
                        </div>
                        
                        {/* Right Arrow */}
                        <button
                            onClick={(e) => {
                                cycleWeather('forward');
                                e.currentTarget.blur();
                            }}
                            onFocus={(e) => e.currentTarget.blur()}
                            style={{
                                background: 'linear-gradient(135deg, rgba(100, 100, 100, 0.3), rgba(80, 80, 80, 0.4))',
                                color: '#aaaaaa',
                                border: '1px solid rgba(170, 170, 170, 0.3)',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                fontSize: '10px',
                                cursor: 'pointer',
                                minWidth: '32px',
                                transition: 'all 0.2s ease',
                                fontFamily: 'inherit'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(120, 120, 120, 0.4), rgba(100, 100, 100, 0.5))';
                                e.currentTarget.style.color = '#ffffff';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(100, 100, 100, 0.3), rgba(80, 80, 80, 0.4))';
                                e.currentTarget.style.color = '#aaaaaa';
                            }}
                        >
                            →
                        </button>
                    </div>

                    {/* Time Control */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {/* Left Arrow */}
                        <button
                            onClick={(e) => {
                                cycleTime('backward');
                                e.currentTarget.blur();
                            }}
                            onFocus={(e) => e.currentTarget.blur()}
                            style={{
                                background: 'linear-gradient(135deg, rgba(100, 100, 100, 0.3), rgba(80, 80, 80, 0.4))',
                                color: '#aaaaaa',
                                border: '1px solid rgba(170, 170, 170, 0.3)',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                fontSize: '10px',
                                cursor: 'pointer',
                                minWidth: '32px',
                                transition: 'all 0.2s ease',
                                fontFamily: 'inherit'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(120, 120, 120, 0.4), rgba(100, 100, 100, 0.5))';
                                e.currentTarget.style.color = '#ffffff';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(100, 100, 100, 0.3), rgba(80, 80, 80, 0.4))';
                                e.currentTarget.style.color = '#aaaaaa';
                            }}
                        >
                            ←
                        </button>
                        
                        {/* Time Display Button (non-clickable) */}
                        <div
                            style={{
                                background: timeColors.bg,
                                color: timeColors.color,
                                border: timeColors.border,
                                padding: '8px 12px',
                                borderRadius: '4px',
                                fontSize: '10px',
                                cursor: 'default',
                                textShadow: '0 0 5px currentColor',
                                boxShadow: '0 0 10px rgba(255, 255, 255, 0.2)',
                                fontFamily: 'inherit',
                                letterSpacing: '0.5px',
                                flex: 1,
                                textAlign: 'center',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '4px'
                            }}
                        >
                            <img 
                                src={clockIcon} 
                                alt="Time"
                                style={{ width: '14px', height: '14px', objectFit: 'contain', verticalAlign: 'middle' }}
                            />
                            {worldState?.timeOfDay?.tag || 'UNKNOWN'}
                        </div>
                        
                        {/* Right Arrow - later in day */}
                        <button
                            onClick={(e) => {
                                cycleTime('forward');
                                e.currentTarget.blur();
                            }}
                            onFocus={(e) => e.currentTarget.blur()}
                            style={{
                                background: 'linear-gradient(135deg, rgba(100, 100, 100, 0.3), rgba(80, 80, 80, 0.4))',
                                color: '#aaaaaa',
                                border: '1px solid rgba(170, 170, 170, 0.3)',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                fontSize: '10px',
                                cursor: 'pointer',
                                minWidth: '32px',
                                transition: 'all 0.2s ease',
                                fontFamily: 'inherit'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(120, 120, 120, 0.4), rgba(100, 100, 100, 0.5))';
                                e.currentTarget.style.color = '#ffffff';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(100, 100, 100, 0.3), rgba(80, 80, 80, 0.4))';
                                e.currentTarget.style.color = '#aaaaaa';
                            }}
                        >
                            →
                        </button>
                    </div>

                    {/* Season Control */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {/* Left Arrow */}
                        <button
                            onClick={(e) => {
                                cycleSeason('backward');
                                e.currentTarget.blur();
                            }}
                            onFocus={(e) => e.currentTarget.blur()}
                            style={{
                                background: 'linear-gradient(135deg, rgba(100, 100, 100, 0.3), rgba(80, 80, 80, 0.4))',
                                color: '#aaaaaa',
                                border: '1px solid rgba(170, 170, 170, 0.3)',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                fontSize: '10px',
                                cursor: 'pointer',
                                minWidth: '32px',
                                transition: 'all 0.2s ease',
                                fontFamily: 'inherit'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(120, 120, 120, 0.4), rgba(100, 100, 100, 0.5))';
                                e.currentTarget.style.color = '#ffffff';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(100, 100, 100, 0.3), rgba(80, 80, 80, 0.4))';
                                e.currentTarget.style.color = '#aaaaaa';
                            }}
                        >
                            ←
                        </button>
                        
                        {/* Season Display Button (non-clickable) */}
                        <div
                            style={{
                                background: seasonColors.bg,
                                color: seasonColors.color,
                                border: seasonColors.border,
                                padding: '8px 12px',
                                borderRadius: '4px',
                                fontSize: '10px',
                                cursor: 'default',
                                textShadow: '0 0 5px currentColor',
                                boxShadow: '0 0 10px rgba(255, 255, 255, 0.2)',
                                fontFamily: 'inherit',
                                letterSpacing: '0.5px',
                                flex: 1,
                                textAlign: 'center'
                            }}
                        >
                            <img 
                                src={seasonColors.icon} 
                                alt={worldState?.currentSeason?.tag || 'SPRING'}
                                style={{ width: '14px', height: '14px', objectFit: 'contain', verticalAlign: 'middle', marginRight: '4px' }}
                            />
                            {worldState?.currentSeason?.tag || 'SPRING'}
                        </div>
                        
                        {/* Right Arrow */}
                        <button
                            onClick={(e) => {
                                cycleSeason('forward');
                                e.currentTarget.blur();
                            }}
                            onFocus={(e) => e.currentTarget.blur()}
                            style={{
                                background: 'linear-gradient(135deg, rgba(100, 100, 100, 0.3), rgba(80, 80, 80, 0.4))',
                                color: '#aaaaaa',
                                border: '1px solid rgba(170, 170, 170, 0.3)',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                fontSize: '10px',
                                cursor: 'pointer',
                                minWidth: '32px',
                                transition: 'all 0.2s ease',
                                fontFamily: 'inherit'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(120, 120, 120, 0.4), rgba(100, 100, 100, 0.5))';
                                e.currentTarget.style.color = '#ffffff';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(100, 100, 100, 0.3), rgba(80, 80, 80, 0.4))';
                                e.currentTarget.style.color = '#aaaaaa';
                            }}
                        >
                            →
                        </button>
                    </div>

                    {/* Animal Spawner Section */}
                    <div style={{
                        marginTop: '8px',
                        paddingTop: '8px',
                        borderTop: '1px solid rgba(0, 212, 255, 0.3)'
                    }}>
                        <style>{`
                            /* Style dropdown options to match dark theme */
                            select option {
                                background: rgba(20, 30, 50, 0.98) !important;
                                color: #ffffff !important;
                            }
                            select optgroup {
                                background: rgba(15, 30, 50, 0.95) !important;
                                color: #00d4ff !important;
                                font-weight: bold;
                            }
                        `}</style>
                        <div style={{
                            fontSize: '10px',
                            color: '#00d4ff',
                            marginBottom: '6px',
                            textAlign: 'center',
                            opacity: 0.8
                        }}>
                            🐾 SPAWN CREATURE
                        </div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                            <select
                                value={selectedAnimal}
                                onChange={(e) => setSelectedAnimal(e.target.value)}
                                onFocus={(e) => e.currentTarget.blur()}
                                style={{
                                    flex: 1,
                                    background: 'linear-gradient(135deg, rgba(30, 40, 60, 0.9), rgba(20, 30, 50, 0.95))',
                                    color: '#ffffff',
                                    border: '1px solid rgba(0, 212, 255, 0.4)',
                                    padding: '6px 8px',
                                    borderRadius: '4px',
                                    fontSize: '10px',
                                    cursor: 'pointer',
                                    fontFamily: 'inherit',
                                    outline: 'none'
                                }}
                            >
                                <optgroup label="🌲 Wildlife">
                                    {ANIMAL_SPECIES.filter(a => a.category === 'Wildlife').map(animal => (
                                        <option key={animal.value} value={animal.value}>{animal.label}</option>
                                    ))}
                                </optgroup>
                                <optgroup label="🐦 Birds">
                                    {ANIMAL_SPECIES.filter(a => a.category === 'Birds').map(animal => (
                                        <option key={animal.value} value={animal.value}>{animal.label}</option>
                                    ))}
                                </optgroup>
                                <optgroup label="🌊 Aquatic">
                                    {ANIMAL_SPECIES.filter(a => a.category === 'Aquatic').map(animal => (
                                        <option key={animal.value} value={animal.value}>{animal.label}</option>
                                    ))}
                                </optgroup>
                                <optgroup label="👹 Hostile NPCs">
                                    {ANIMAL_SPECIES.filter(a => a.category === 'Hostile NPCs').map(animal => (
                                        <option key={animal.value} value={animal.value}>{animal.label}</option>
                                    ))}
                                </optgroup>
                            </select>
                            <button
                                onClick={(e) => {
                                    spawnAnimal();
                                    e.currentTarget.blur();
                                }}
                                onFocus={(e) => e.currentTarget.blur()}
                                style={{
                                    background: 'linear-gradient(135deg, rgba(255, 100, 100, 0.3), rgba(200, 60, 60, 0.4))',
                                    color: '#ff6b6b',
                                    border: '1px solid #ff6b6b',
                                    padding: '6px 12px',
                                    borderRadius: '4px',
                                    fontSize: '10px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                    fontFamily: 'inherit',
                                    textShadow: '0 0 5px #ff6b6b',
                                    whiteSpace: 'nowrap'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255, 100, 100, 0.5), rgba(200, 60, 60, 0.6))';
                                    e.currentTarget.style.boxShadow = '0 0 15px rgba(255, 107, 107, 0.5)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255, 100, 100, 0.3), rgba(200, 60, 60, 0.4))';
                                    e.currentTarget.style.boxShadow = 'none';
                                }}
                            >
                                SPAWN
                            </button>
                        </div>
                    </div>

                    {/* Drone Simulator */}
                    <div style={{ marginTop: '8px' }}>
                        <button
                            onClick={(e) => {
                                simulateDrone();
                                e.currentTarget.blur();
                            }}
                            onFocus={(e) => e.currentTarget.blur()}
                            style={{
                                background: 'linear-gradient(135deg, rgba(80, 80, 100, 0.3), rgba(60, 60, 80, 0.4))',
                                color: '#a0a0c0',
                                border: '1px solid rgba(160, 160, 192, 0.4)',
                                padding: '6px 12px',
                                borderRadius: '4px',
                                fontSize: '10px',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                fontFamily: 'inherit',
                                width: '100%',
                                textShadow: '0 0 4px rgba(160, 160, 192, 0.6)'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(100, 100, 130, 0.4), rgba(80, 80, 100, 0.5))';
                                e.currentTarget.style.boxShadow = '0 0 10px rgba(160, 160, 192, 0.3)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(80, 80, 100, 0.3), rgba(60, 60, 80, 0.4))';
                                e.currentTarget.style.boxShadow = 'none';
                            }}
                        >
                            ✈️ SIMULATE DRONE FLYOVER
                        </button>
                    </div>

                    {/* Item Spawner Section */}
                    <div style={{
                        marginTop: '8px',
                        paddingTop: '8px',
                        borderTop: '1px solid rgba(0, 212, 255, 0.3)'
                    }}>
                        <div style={{
                            fontSize: '10px',
                            color: '#00d4ff',
                            marginBottom: '6px',
                            textAlign: 'center',
                            opacity: 0.8
                        }}>
                            📦 SPAWN ITEM
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }} ref={itemDropdownRef}>
                            {/* Searchable item dropdown */}
                            <div style={{ position: 'relative' }}>
                                <input
                                    type="text"
                                    value={itemDropdownOpen ? itemSearchQuery : (selectedItemDef?.name ?? '')}
                                    onChange={(e) => {
                                        setItemSearchQuery(e.target.value);
                                        setItemDropdownOpen(true);
                                    }}
                                    onFocus={() => setItemDropdownOpen(true)}
                                    placeholder={allItems.length ? "Search items (Tab to complete)" : "Loading items..."}
                                    data-allow-spacebar="true"
                                    style={{
                                        background: 'linear-gradient(135deg, rgba(30, 40, 60, 0.9), rgba(20, 30, 50, 0.95))',
                                        color: '#ffffff',
                                        border: '1px solid rgba(0, 212, 255, 0.4)',
                                        padding: '6px 8px',
                                        borderRadius: '4px',
                                        fontSize: '9px',
                                        fontFamily: 'inherit',
                                        outline: 'none',
                                        width: '100%',
                                        boxSizing: 'border-box'
                                    }}
                                    onKeyDown={(e) => {
                                        e.stopPropagation();
                                        e.nativeEvent.stopImmediatePropagation();
                                        const item = filteredItems[highlightedIndex];
                                        if (e.key === 'Enter') {
                                            if (item) {
                                                setSelectedItemDef(item);
                                                setItemSearchQuery('');
                                                setItemDropdownOpen(false);
                                                spawnItem(item);
                                            } else {
                                                spawnItem();
                                            }
                                        } else if (e.key === 'Escape') {
                                            setItemDropdownOpen(false);
                                        } else if (e.key === 'Tab') {
                                            e.preventDefault();
                                            if (filteredItems.length > 0) {
                                                const target = filteredItems[highlightedIndex];
                                                if (target) {
                                                    const name = target.name ?? '';
                                                    if (itemSearchQuery === name && filteredItems.length > 1) {
                                                        const next = (highlightedIndex + 1) % filteredItems.length;
                                                        setHighlightedIndex(next);
                                                        setItemSearchQuery(filteredItems[next].name ?? '');
                                                        setSelectedItemDef(filteredItems[next]);
                                                    } else {
                                                        setItemSearchQuery(name);
                                                        setSelectedItemDef(target);
                                                    }
                                                }
                                            }
                                        } else if (e.key === 'ArrowDown') {
                                            e.preventDefault();
                                            if (filteredItems.length > 0) {
                                                setHighlightedIndex((i) => (i + 1) % filteredItems.length);
                                            }
                                        } else if (e.key === 'ArrowUp') {
                                            e.preventDefault();
                                            if (filteredItems.length > 0) {
                                                setHighlightedIndex((i) => (i - 1 + filteredItems.length) % filteredItems.length);
                                            }
                                        }
                                    }}
                                    onKeyUp={(e) => {
                                        e.stopPropagation();
                                        e.nativeEvent.stopImmediatePropagation();
                                    }}
                                    onKeyPress={(e) => {
                                        e.stopPropagation();
                                        e.nativeEvent.stopImmediatePropagation();
                                    }}
                                />
                                {itemDropdownOpen && allItems.length > 0 && (
                                    <div
                                        style={{
                                            position: 'absolute',
                                            top: '100%',
                                            left: 0,
                                            right: 0,
                                            marginTop: '2px',
                                            maxHeight: '140px',
                                            overflowY: 'auto',
                                            background: 'rgba(15, 30, 50, 0.98)',
                                            border: '1px solid rgba(0, 212, 255, 0.4)',
                                            borderRadius: '4px',
                                            zIndex: 1000,
                                            boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
                                        }}
                                        className="debug-panel-scroll"
                                    >
                                        {filteredItems.length === 0 ? (
                                            <div style={{ padding: '8px', color: '#888', fontSize: '9px' }}>No matches</div>
                                        ) : (
                                            filteredItems.map((item, idx) => {
                                                const categoryTag = item.category?.tag ?? '';
                                                const isHighlighted = idx === highlightedIndex;
                                                return (
                                                    <div
                                                        key={item.id.toString()}
                                                        ref={isHighlighted ? highlightedItemRef : undefined}
                                                        onClick={() => {
                                                            setSelectedItemDef(item);
                                                            setItemSearchQuery('');
                                                            setItemDropdownOpen(false);
                                                        }}
                                                        onMouseEnter={() => setHighlightedIndex(idx)}
                                                        style={{
                                                            padding: '4px 8px',
                                                            fontSize: '9px',
                                                            cursor: 'pointer',
                                                            color: isHighlighted || selectedItemDef?.id === item.id ? '#00d4ff' : '#ffffff',
                                                            background: isHighlighted ? 'rgba(0, 212, 255, 0.2)' : selectedItemDef?.id === item.id ? 'rgba(0, 212, 255, 0.15)' : 'transparent',
                                                            borderBottom: '1px solid rgba(255,255,255,0.05)'
                                                        }}
                                                    >
                                                        <span style={{ opacity: 0.6, marginRight: '4px' }}>{categoryTag}</span>
                                                        {item.name}
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                )}
                            </div>
                            
                            {/* Quantity and spawn button row */}
                            <div style={{ display: 'flex', gap: '6px' }}>
                                {/* Custom quantity input with +/- buttons */}
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    background: 'linear-gradient(135deg, rgba(30, 40, 60, 0.9), rgba(20, 30, 50, 0.95))',
                                    border: '1px solid rgba(0, 212, 255, 0.4)',
                                    borderRadius: '4px',
                                    overflow: 'hidden'
                                }}>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            const current = parseInt(spawnItemQuantity, 10) || 1;
                                            setSpawnItemQuantity(Math.max(1, current - 1).toString());
                                        }}
                                        style={{
                                            background: 'rgba(0, 212, 255, 0.15)',
                                            color: '#00d4ff',
                                            border: 'none',
                                            borderRight: '1px solid rgba(0, 212, 255, 0.3)',
                                            padding: '4px 8px',
                                            fontSize: '12px',
                                            cursor: 'pointer',
                                            fontFamily: 'inherit',
                                            lineHeight: 1
                                        }}
                                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0, 212, 255, 0.3)'; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0, 212, 255, 0.15)'; }}
                                    >
                                        −
                                    </button>
                                    <input
                                        type="number"
                                        className="debug-qty-input"
                                        value={spawnItemQuantity}
                                        onChange={(e) => setSpawnItemQuantity(e.target.value)}
                                        min="1"
                                        style={{
                                            background: 'transparent',
                                            color: '#ffffff',
                                            border: 'none',
                                            padding: '4px 4px',
                                            fontSize: '10px',
                                            fontFamily: 'inherit',
                                            outline: 'none',
                                            width: '40px',
                                            textAlign: 'center'
                                        }}
                                        onKeyDown={(e) => {
                                            e.stopPropagation();
                                            e.nativeEvent.stopImmediatePropagation();
                                            if (e.key === 'Enter') {
                                                spawnItem();
                                            }
                                        }}
                                        onKeyUp={(e) => {
                                            e.stopPropagation();
                                            e.nativeEvent.stopImmediatePropagation();
                                        }}
                                        onKeyPress={(e) => {
                                            e.stopPropagation();
                                            e.nativeEvent.stopImmediatePropagation();
                                        }}
                                    />
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            const current = parseInt(spawnItemQuantity, 10) || 0;
                                            setSpawnItemQuantity((current + 1).toString());
                                        }}
                                        style={{
                                            background: 'rgba(0, 212, 255, 0.15)',
                                            color: '#00d4ff',
                                            border: 'none',
                                            borderLeft: '1px solid rgba(0, 212, 255, 0.3)',
                                            padding: '4px 8px',
                                            fontSize: '12px',
                                            cursor: 'pointer',
                                            fontFamily: 'inherit',
                                            lineHeight: 1
                                        }}
                                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0, 212, 255, 0.3)'; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0, 212, 255, 0.15)'; }}
                                    >
                                        +
                                    </button>
                                </div>
                                <button
                                    onClick={(e) => {
                                        spawnItem();
                                        e.currentTarget.blur();
                                    }}
                                    onFocus={(e) => e.currentTarget.blur()}
                                    style={{
                                        flex: 1,
                                        background: 'linear-gradient(135deg, rgba(0, 200, 150, 0.3), rgba(0, 150, 100, 0.4))',
                                        color: '#00c896',
                                        border: '1px solid #00c896',
                                        padding: '6px 12px',
                                        borderRadius: '4px',
                                        fontSize: '10px',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease',
                                        fontFamily: 'inherit',
                                        textShadow: '0 0 5px #00c896',
                                        whiteSpace: 'nowrap'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0, 200, 150, 0.5), rgba(0, 150, 100, 0.6))';
                                        e.currentTarget.style.boxShadow = '0 0 15px rgba(0, 200, 150, 0.5)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0, 200, 150, 0.3), rgba(0, 150, 100, 0.4))';
                                        e.currentTarget.style.boxShadow = 'none';
                                    }}
                                >
                                    SPAWN
                                </button>
                            </div>
                            
                            {/* Status message */}
                            {spawnStatus && (
                                <div style={{
                                    fontSize: '8px',
                                    color: spawnStatus.type === 'success' ? '#00ff88' : '#ff6b6b',
                                    textAlign: 'center',
                                    padding: '4px',
                                    background: spawnStatus.type === 'success' 
                                        ? 'rgba(0, 255, 136, 0.1)' 
                                        : 'rgba(255, 107, 107, 0.1)',
                                    borderRadius: '4px',
                                    border: `1px solid ${spawnStatus.type === 'success' ? 'rgba(0, 255, 136, 0.3)' : 'rgba(255, 107, 107, 0.3)'}`
                                }}>
                                    {spawnStatus.message}
                                </div>
                            )}
                            
                        </div>
                    </div>

                    {/* Spacer for scrolling room */}
                    <div style={{ height: '100px' }} />
                </>
            )}
        </div>
    );
};

export default DebugPanel;

