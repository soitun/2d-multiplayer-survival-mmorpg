/**
 * GameScreen.tsx
 * 
 * Renders the main game view after the player has successfully logged in.
 * Composes the core game UI components:
 *  - `GameCanvas`: Renders the game world, players, entities.
 *  - `PlayerUI`: Renders inventory, equipment, crafting, container UIs, and Hotbar.
 *  - `DayNightCycleTracker`: Displays the current time of day visually.
 * Receives all necessary game state and action handlers as props from `App.tsx` 
 * and passes them down to the relevant child components.
 */

import { memo, useState, useEffect, useRef, useCallback, useMemo } from 'react';

// Import child components
import GameCanvas from './GameCanvas';
import PlayerUI from './PlayerUI';
import DayNightCycleTracker from './DayNightCycleTracker';
import Chat from './Chat';
import SpeechBubbleManager from './SpeechBubbleManager';
import TargetingReticle from './TargetingReticle';
import FishingManager from './FishingManager';
import MusicControlPanel from './MusicControlPanel';
import DebugPanel from './DebugPanel';
// Import menu components
import GameMenuButton from './GameMenuButton';
import GameMenu from './GameMenu';
import ControlsMenu from './ControlsMenu';
import GameTipsMenu from './GameTipsMenu';
import GameSettingsMenu from './GameSettingsMenu';
import GameVisualSettingsMenu from './GameVisualSettingsMenu';
import type { MenuType } from './GameMenu';
import AlkDeliveryPanel from './AlkDeliveryPanel';
import MobileControlBar from './MobileControlBar';
import CairnUnlockNotification, { CairnNotification } from './CairnUnlockNotification';
// SovaDirectivesIndicator has been merged into DayNightCycleTracker
import QuestsPanel from './QuestsPanel';
import UplinkNotifications from './UplinkNotifications'; // Unified notifications in uplink style
import ErrorDisplay from './ErrorDisplay'; // In-game error feedback above XP bar
import * as SpacetimeDB from '../generated';

// Import types used by props
import {
    Player as SpacetimeDBPlayer,
    Tree as SpacetimeDBTree,
    Stone as SpacetimeDBStone,
    RuneStone as SpacetimeDBRuneStone,
    Cairn as SpacetimeDBCairn,
    PlayerDiscoveredCairn as SpacetimeDBPlayerDiscoveredCairn,
    Campfire as SpacetimeDBCampfire,
    Furnace as SpacetimeDBFurnace,
    Barbecue as SpacetimeDBBarbecue,
    Lantern as SpacetimeDBLantern,
    Turret as SpacetimeDBTurret,
    HarvestableResource as SpacetimeDBHarvestableResource,
    DroppedItem as SpacetimeDBDroppedItem,
    WoodenStorageBox as SpacetimeDBWoodenStorageBox,
    InventoryItem as SpacetimeDBInventoryItem,
    ItemDefinition as SpacetimeDBItemDefinition,
    WorldState as SpacetimeDBWorldState,
    ActiveEquipment as SpacetimeDBActiveEquipment,
    Recipe as SpacetimeDBRecipe,
    CraftingQueueItem as SpacetimeDBCraftingQueueItem,
    DbConnection,
    SleepingBag as SpacetimeDBSleepingBag,
    PlayerCorpse as SpacetimeDBPlayerCorpse,
    Stash as SpacetimeDBStash,
    RainCollector as SpacetimeDBRainCollector,
    WaterPatch as SpacetimeDBWaterPatch,
    FertilizerPatch as SpacetimeDBFertilizerPatch,
    FirePatch as SpacetimeDBFirePatch,
    PlacedExplosive as SpacetimeDBPlacedExplosive,
    ActiveConsumableEffect as SpacetimeDBActiveConsumableEffect,
    Cloud as SpacetimeDBCloud,
    Grass as SpacetimeDBGrass,
    KnockedOutStatus as SpacetimeDBKnockedOutStatus,
    RangedWeaponStats,
    Projectile as SpacetimeDBProjectile,
    DeathMarker as SpacetimeDBDeathMarker,
    Shelter as SpacetimeDBShelter,
    MinimapCache as SpacetimeDBMinimapCache,
    FishingSession,
    PlantedSeed as SpacetimeDBPlantedSeed,
    PlayerDrinkingCooldown as SpacetimeDBPlayerDrinkingCooldown,
    WildAnimal as SpacetimeDBWildAnimal, // Includes hostile NPCs with is_hostile_npc = true
    AnimalCorpse as SpacetimeDBAnimalCorpse,
    Barrel as SpacetimeDBBarrel,
    HomesteadHearth as SpacetimeDBHomesteadHearth,
    BrothPot as SpacetimeDBBrothPot,
    AlkStation as SpacetimeDBAlkStation,
    AlkContract as SpacetimeDBAlkContract,
    AlkPlayerContract as SpacetimeDBAlkPlayerContract,
    AlkState as SpacetimeDBAlkState,
    PlayerShardBalance as SpacetimeDBPlayerShardBalance,
    MemoryGridProgress as SpacetimeDBMemoryGridProgress,
} from '../generated';
// PlayerStats is accessed via SpacetimeDB namespace
import { Identity } from 'spacetimedb';
import { PlacementItemInfo, PlacementActions } from '../hooks/usePlacementManager';
import { InteractionTarget } from '../hooks/useInteractionManager';
import { DraggedItemInfo, DragSourceSlotInfo } from '../types/dragDropTypes';

// Import useSpeechBubbleManager hook
import { useSpeechBubbleManager } from '../hooks/useSpeechBubbleManager';

// Import voice interface components and hooks
import VoiceInterface from './VoiceInterface';
import SOVALoadingBar from './SOVALoadingBar';
import { useVoiceInterface } from '../hooks/useVoiceInterface';

// Import SOVA sound hooks (insanity/entrainment voices)
import { useInsanitySovaSounds } from '../hooks/useInsanitySovaSounds';
import { useEntrainmentSovaSounds } from '../hooks/useEntrainmentSovaSounds';

// Import other necessary imports
import { useInteractionManager } from '../hooks/useInteractionManager';
import { useWorldChunkDataMap, createIsWaterTile } from '../hooks/useWorldChunkDataMap';
import { useSovaTutorials } from '../hooks/useSovaTutorials';
import { useQuestNotifications } from '../hooks/useQuestNotifications';
import { useMusicSystem } from '../hooks/useMusicSystem';
import { useUISubscriptions } from '../hooks/useUISubscriptions';

// Import debug context
import { useDebug } from '../contexts/DebugContext';
import { useErrorDisplay } from '../contexts/ErrorDisplayContext';
import { isAnySovaAudioPlaying } from '../hooks/useSovaSoundBox';

const MemoGameCanvas = memo(GameCanvas);
const MemoPlayerUI = memo(PlayerUI);

// Define props required by GameScreen and its children
interface GameScreenProps {
    // Core Game State (from useSpacetimeTables)
    players: Map<string, SpacetimeDBPlayer>;
    trees: Map<string, SpacetimeDBTree>;
    clouds: Map<string, SpacetimeDBCloud>;
    droneEvents: Map<string, SpacetimeDB.DroneEvent>;
    stones: Map<string, SpacetimeDBStone>;
    runeStones: Map<string, SpacetimeDBRuneStone>;
    cairns: Map<string, SpacetimeDBCairn>;
    playerDiscoveredCairns: Map<string, SpacetimeDBPlayerDiscoveredCairn>;
    campfires: Map<string, SpacetimeDBCampfire>;
    furnaces: Map<string, SpacetimeDBFurnace>;
    barbecues: Map<string, SpacetimeDBBarbecue>;
    lanterns: Map<string, SpacetimeDBLantern>;
    turrets: Map<string, SpacetimeDBTurret>;
    harvestableResources: Map<string, SpacetimeDBHarvestableResource>;
    droppedItems: Map<string, SpacetimeDBDroppedItem>;
    woodenStorageBoxes: Map<string, SpacetimeDBWoodenStorageBox>;
    sleepingBags: Map<string, SpacetimeDBSleepingBag>;
    playerCorpses: Map<string, SpacetimeDBPlayerCorpse>;
    stashes: Map<string, SpacetimeDBStash>;
    shelters: Map<string, SpacetimeDBShelter>;
    plantedSeeds: Map<string, SpacetimeDBPlantedSeed>;
    // worldTiles removed – world background now derived client-side from compressed chunk data
    minimapCache: SpacetimeDBMinimapCache | null;
    wildAnimals: Map<string, SpacetimeDBWildAnimal>; // Includes hostile NPCs with is_hostile_npc = true
    hostileDeathEvents: Array<{ id: string, x: number, y: number, species: string, timestamp: number }>; // Client-side death events for particles
    animalCorpses: Map<string, SpacetimeDBAnimalCorpse>;
    barrels: Map<string, SpacetimeDBBarrel>;
    roadLampposts: Map<string, SpacetimeDB.RoadLamppost>;
    seaStacks: Map<string, any>;
    homesteadHearths: Map<string, SpacetimeDBHomesteadHearth>;
    foundationCells: Map<string, any>;
    wallCells: Map<string, any>;
    doors: Map<string, any>;
    fences: Map<string, any>;
    fumaroles: Map<string, any>;
    basaltColumns: Map<string, any>;
    livingCorals: Map<string, any>; // Living coral for underwater harvesting (uses combat system)
    inventoryItems: Map<string, SpacetimeDBInventoryItem>;
    itemDefinitions: Map<string, SpacetimeDBItemDefinition>;
    worldState: SpacetimeDBWorldState | null;
    activeEquipments: Map<string, SpacetimeDBActiveEquipment>;
    recipes: Map<string, SpacetimeDBRecipe>;
    craftingQueueItems: Map<string, SpacetimeDBCraftingQueueItem>;
    activeConsumableEffects: Map<string, SpacetimeDBActiveConsumableEffect>;
    grass: Map<string, SpacetimeDBGrass>;
    grassState: Map<string, SpacetimeDB.GrassState>; // Split tables: dynamic state
    knockedOutStatus: Map<string, SpacetimeDBKnockedOutStatus>;
    rangedWeaponStats: Map<string, RangedWeaponStats>;

    // Player drinking cooldowns for water interaction.
    playerDrinkingCooldowns: Map<string, SpacetimeDBPlayerDrinkingCooldown>;

    // Player dodge-roll states for animation.
    playerDodgeRollStates: Map<string, any>; // PlayerDodgeRollState from generated types

    // Rain collectors
    rainCollectors: Map<string, SpacetimeDBRainCollector>;

    // Broth pots
    brothPots: Map<string, SpacetimeDBBrothPot>;

    // Water patches
    waterPatches: Map<string, SpacetimeDBWaterPatch>;

    // Fertilizer patches
    fertilizerPatches: Map<string, SpacetimeDBFertilizerPatch>;

    // Fire patches
    firePatches: Map<string, SpacetimeDBFirePatch>;

    // Placed explosives (raiding bombs)
    placedExplosives: Map<string, SpacetimeDBPlacedExplosive>;

    // Hot springs
    hotSprings: Map<string, any>; // HotSpring from generated types

    // Connection & Player Info
    localPlayerId?: string;
    playerIdentity: Identity | null;
    connection: DbConnection | null;

    // Predicted Position
    predictedPosition: { x: number; y: number } | null;
    getCurrentPositionNow: () => { x: number; y: number } | null;
    canvasRef: React.RefObject<HTMLCanvasElement | null>;

    // Placement State/Actions (from usePlacementManager)
    placementInfo: PlacementItemInfo | null;
    placementActions: PlacementActions; // Pass whole object if GameCanvas needs more than cancel
    placementError: string | null;
    placementWarning: string | null;
    setPlacementWarning: (warning: string | null) => void;
    startPlacement: (itemInfo: PlacementItemInfo) => void;
    cancelPlacement: () => void;

    // Interaction Handler (from useInteractionManager)
    interactingWith: InteractionTarget;
    handleSetInteractingWith: (target: InteractionTarget) => void;

    // Drag/Drop Handlers (from useDragDropManager)
    draggedItemInfo: DraggedItemInfo | null;
    onItemDragStart: (info: DraggedItemInfo) => void;
    onItemDrop: (targetSlotInfo: DragSourceSlotInfo | null) => void;

    // Reducer Actions (from usePlayerActions)
    isMinimapOpen: boolean;
    setIsMinimapOpen: React.Dispatch<React.SetStateAction<boolean>>;
    // Initial view for InterfaceContainer (e.g., 'matronage' after creating one)
    interfaceInitialView?: 'minimap' | 'encyclopedia' | 'memory-grid' | 'alk' | 'cairns' | 'matronage' | 'leaderboard' | 'achievements';
    setInterfaceInitialView?: React.Dispatch<React.SetStateAction<'minimap' | 'encyclopedia' | 'memory-grid' | 'alk' | 'cairns' | 'matronage' | 'leaderboard' | 'achievements' | undefined>>;
    // Callback to reset interface initial view (called when interface closes)
    onInterfaceClose?: () => void;
    isChatting: boolean;
    setIsChatting: React.Dispatch<React.SetStateAction<boolean>>;

    // Additional props
    projectiles: Map<string, SpacetimeDBProjectile>;
    deathMarkers: Map<string, SpacetimeDBDeathMarker>;
    setIsCraftingSearchFocused: React.Dispatch<React.SetStateAction<boolean>>;
    isCraftingSearchFocused: boolean;

    // Notify parent when fishing state changes.
    onFishingStateChange?: (isFishing: boolean) => void;

    // Fishing sessions for rendering other players' fishing states.
    fishingSessions: Map<string, FishingSession>;

    // Music system for debug controls
    musicSystem: ReturnType<typeof useMusicSystem>;

    // Settings (audio + visual) are now in SettingsContext -- no longer passed as props.

    // Sound system for immediate sound effects
    soundSystem: ReturnType<typeof import('../hooks/useSoundSystem').useSoundSystem>;

    // Music panel state
    isMusicPanelVisible: boolean;
    setIsMusicPanelVisible: React.Dispatch<React.SetStateAction<boolean>>;

    // Movement direction for dodge roll system
    movementDirection: { x: number; y: number };
    isAutoWalking: boolean; // Auto-walk state for dodge roll detection

    // ADD: Local facing direction for instant visual feedback (client-authoritative)
    facingDirection?: string;

    // Chunk-based weather
    chunkWeather: Map<string, any>;

    // ALK delivery stations for minimap
    alkStations?: Map<string, SpacetimeDBAlkStation>;
    // ALK contracts for provisioning board
    alkContracts?: Map<string, SpacetimeDBAlkContract>;
    // Player's accepted ALK contracts
    alkPlayerContracts?: Map<string, SpacetimeDBAlkPlayerContract>;
    // ALK system state
    alkState?: SpacetimeDBAlkState | null;
    // Unified monument parts (all monument types, one-time read of static world gen data)
    monumentParts?: Map<string, any>;
    // Large quarry locations with types for minimap labels (Stone/Sulfur/Metal Quarry)
    largeQuarries?: Map<string, any>;
    // Player shard balances
    playerShardBalance?: Map<string, SpacetimeDBPlayerShardBalance>;
    // Memory Grid progress for crafting unlocks
    memoryGridProgress?: Map<string, SpacetimeDBMemoryGridProgress>;
    // Player stats (XP, level, achievements)
    playerStats?: Map<string, any>;
    // Player unlocked achievements (for title selection)
    playerAchievements?: Map<string, any>;
    // Achievement definitions (for title names)
    achievementDefinitions?: Map<string, any>;
    // Leaderboard entries
    leaderboardEntries?: Map<string, any>;
    // Plant encyclopedia data
    plantConfigDefinitions?: Map<string, any>;
    // Plants discovered by current player (for encyclopedia filtering)
    discoveredPlants?: Map<string, any>;


    // Player progression notifications (unified in UplinkNotifications)
    levelUpNotifications?: SpacetimeDB.LevelUpNotification[];
    achievementUnlockNotifications?: SpacetimeDB.AchievementUnlockNotification[];
    onOpenAchievements?: () => void;

    // Mobile controls
    isMobile?: boolean;
    onMobileTap?: (worldX: number, worldY: number) => void;
    tapAnimation?: { x: number; y: number; startTime: number } | null;
    onMobileSprintToggle?: (enabled: boolean | undefined) => void;
    mobileSprintOverride?: boolean;

    // SOVA Sound Box callback (for deterministic voice notifications)
    showSovaSoundBox?: (audio: HTMLAudioElement, label: string) => void;

    // Animal breeding system data for age-based rendering and pregnancy indicators
    caribouBreedingData?: Map<string, any>; // Caribou sex, age stage, and pregnancy
    walrusBreedingData?: Map<string, any>; // Walrus sex, age stage, and pregnancy
    // Animal rut state (breeding season) for tooltip
    caribouRutState?: any; // Global caribou rut state
    walrusRutState?: any; // Global walrus rut state
}

const GameScreen: React.FC<GameScreenProps> = (props) => {
    // ADD THIS LOG AT THE VERY BEGINNING OF THE COMPONENT
    // console.log("[GameScreen.tsx] Received props including activeConsumableEffects:", props.activeConsumableEffects);
    const [showInventoryState, setShowInventoryState] = useState(false);
    const [showCraftingScreenState, setShowCraftingScreenState] = useState(false);

    // Menu state management
    const [currentMenu, setCurrentMenu] = useState<MenuType>(null);

    // Auto-action state management
    const [autoActionStates, setAutoActionStates] = useState({ isAutoAttacking: false });

    // Refresh confirmation dialog state
    const [showRefreshDialog, setShowRefreshDialog] = useState(false);

    // SOVA message adder function from Chat component
    const [sovaMessageAdder, setSOVAMessageAdder] = useState<((message: { id: string; text: string; isUser: boolean; timestamp: Date; flashTab?: boolean }) => void) | null>(null);

    // Cairn unlock notification state
    const [cairnNotification, setCairnNotification] = useState<CairnNotification | null>(null);
    const handleCairnNotification = useCallback((notification: CairnNotification) => {
        setCairnNotification(notification);
    }, []);
    const dismissCairnNotification = useCallback(() => {
        setCairnNotification(null);
    }, []);

    // Quest panel state
    const [isQuestsPanelOpen, setIsQuestsPanelOpen] = useState(false);
    const openQuestsPanel = useCallback(() => setIsQuestsPanelOpen(true), []);
    const closeQuestsPanel = useCallback(() => setIsQuestsPanelOpen(false), []);

    // Track whether DayNightCycleTracker is expanded (not minimized)
    // Can be used by other components that need to know the panel state
    const [, setIsDayNightExpanded] = useState(true);
    const handleDayNightMinimizedChange = useCallback((isMinimized: boolean) => {
        setIsDayNightExpanded(!isMinimized);
    }, []);

    // 🎣 FISHING INPUT FIX: Track fishing state to disable input
    const [isFishing, setIsFishing] = useState(false);

    // Mobile interact state
    const [mobileInteractInfo, setMobileInteractInfo] = useState<{ hasTarget: boolean; label?: string } | null>(null);
    const [mobileInteractTrigger, setMobileInteractTrigger] = useState(0);


    // Debug logging for SOVA message adder
    useEffect(() => {
        console.log('[GameScreen] SOVA message adder changed:', sovaMessageAdder ? 'Available' : 'Not available');
        if (sovaMessageAdder) {
            console.log('[GameScreen] SOVA message adder function is now ready for VoiceInterface');
        }
    }, [sovaMessageAdder]);

    // Callback to receive SOVA message adder from Chat
    const handleSOVAMessageAdderReady = useCallback((addMessage: (message: { id: string; text: string; isUser: boolean; timestamp: Date; flashTab?: boolean }) => void) => {
        console.log('[GameScreen] Received SOVA message adder from Chat component');
        setSOVAMessageAdder(() => addMessage); // Use function form to avoid stale closure
    }, []);

    // Debug context
    const { showAutotileDebug, toggleAutotileDebug, showMusicDebug, toggleMusicDebug, showChunkBoundaries, toggleChunkBoundaries, showInteriorDebug, toggleInteriorDebug, showCollisionDebug, toggleCollisionDebug, showAttackRangeDebug, toggleAttackRangeDebug, showYSortDebug, toggleYSortDebug, showShipwreckDebug, toggleShipwreckDebug, showFpsProfiler, isProfilerRecording, startProfilerRecording, stopProfilerRecording } = useDebug();
    const { showError } = useErrorDisplay();
    const [profilerCopyToast, setProfilerCopyToast] = useState(false);
    const onProfilerCopied = useCallback(() => {
        setProfilerCopyToast(true);
        setTimeout(() => setProfilerCopyToast(false), 2000);
    }, []);



    // Destructure props for cleaner usage
    const {
        players, trees, stones, runeStones, cairns, playerDiscoveredCairns, campfires, furnaces, barbecues, lanterns, turrets, harvestableResources, droppedItems, woodenStorageBoxes, sleepingBags,
        playerCorpses, stashes,
        shelters,
        plantedSeeds,

        minimapCache,
        wildAnimals,
        hostileDeathEvents,
        animalCorpses,
        inventoryItems, itemDefinitions, worldState, activeEquipments, recipes, craftingQueueItems,
        localPlayerId, playerIdentity, connection,
        predictedPosition, getCurrentPositionNow, canvasRef,
        placementInfo, placementActions, placementError, placementWarning, setPlacementWarning, startPlacement, cancelPlacement,
        interactingWith, handleSetInteractingWith,
        draggedItemInfo, onItemDragStart, onItemDrop,
        isMinimapOpen,
        setIsMinimapOpen,
        interfaceInitialView,
        setInterfaceInitialView,
        isChatting,
        setIsChatting,
        activeConsumableEffects,
        clouds,
        droneEvents,
        grass,
        grassState,
        knockedOutStatus,
        rangedWeaponStats,
        projectiles,
        deathMarkers,
        setIsCraftingSearchFocused,
        isCraftingSearchFocused,
        // Auto-walking removed
        onFishingStateChange,
        fishingSessions,
        musicSystem,
        // Settings props removed -- consumers read from SettingsContext directly
        soundSystem,
        playerDrinkingCooldowns,
        playerDodgeRollStates,
        rainCollectors,
        brothPots,
        waterPatches,
        fertilizerPatches,
        isMusicPanelVisible,
        setIsMusicPanelVisible,
        movementDirection,
        chunkWeather,
        showSovaSoundBox,
    } = props;

    const {
        messages,
        playerPins,
        activeConnections,
        matronages,
        matronageMembers,
        matronageInvitations,
        matronageOwedShards,
        tutorialQuestDefinitions,
        dailyQuestDefinitions,
        playerTutorialProgress,
        playerDailyQuests,
        questCompletionNotifications,
        questProgressNotifications,
        sovaQuestMessages,
        beaconDropEvents,
    } = useUISubscriptions(connection);

    const gameCanvasRef = useRef<HTMLCanvasElement>(null);

    // O(1) chunk Map for water tile detection (fishing, etc.) - avoids O(n) iteration over all chunks
    const worldChunkDataMap = useWorldChunkDataMap(connection);
    const isWaterTile = useMemo(
        () => createIsWaterTile(worldChunkDataMap),
        [worldChunkDataMap]
    );

    // Voice interface hook
    const {
        voiceState,
        handleTranscriptionComplete,
        handleError: handleVoiceError,
        forceClose: forceCloseVoice,
    } = useVoiceInterface({
        isEnabled: true,
        isChatting,
        isGameMenuOpen: currentMenu !== null,
        isInventoryOpen: showInventoryState || showCraftingScreenState,
    });

    // Mobile chat visibility state (separate from isChatting which controls input focus)
    const [isMobileChatOpen, setIsMobileChatOpen] = useState(false);

    // Local speech bubbles for /s (say) command
    const [localBubbles, setLocalBubbles] = useState<Array<{ id: string, message: string, playerId: string, timestamp: number }>>([]);

    // ALK initial tab state - used when opening ALK panel from delivery panel
    type AlkTab = 'seasonal' | 'materials' | 'arms' | 'armor' | 'tools' | 'provisions' | 'bonus' | 'buy-orders' | 'my-contracts';
    const [alkInitialTab, setAlkInitialTab] = useState<AlkTab | undefined>(undefined);

    // SOVA loading bar state
    const [sovaLoadingState, setSOVALoadingState] = useState({
        isRecording: false,
        isTranscribing: false,
        isGeneratingResponse: false,
        isSynthesizingVoice: false,
        isPlayingAudio: false,
        transcribedText: '',
        currentPhase: 'Ready',
    });

    // Handle SOVA loading state changes from VoiceInterface
    const handleSOVALoadingStateChange = useCallback((state: typeof sovaLoadingState) => {
        setSOVALoadingState(state);
    }, []);

    // === SOVA Two-Part Tutorial System ===
    // Part 1: Crash Intro (30 seconds) - Introduces SOVA, lore context, stakes
    // Part 2: Press V Hint (3.5 minutes) - Teaches SOVA chat mechanic

    const showSovaSoundBoxRef = useRef(showSovaSoundBox);
    const sovaMessageAdderRef = useRef(sovaMessageAdder);

    // Keep refs updated
    useEffect(() => {
        showSovaSoundBoxRef.current = showSovaSoundBox;
    }, [showSovaSoundBox]);

    useEffect(() => {
        sovaMessageAdderRef.current = sovaMessageAdder;
    }, [sovaMessageAdder]);

    // Get local player's server-side tutorial flags (ALL tutorials now server-validated)
    const localPlayerForTutorial = localPlayerId ? props.players.get(localPlayerId) : undefined;
    const hasSeenSovaIntro = localPlayerForTutorial?.hasSeenSovaIntro;
    const hasSeenMemoryShardTutorial = localPlayerForTutorial?.hasSeenMemoryShardTutorial;
    const hasSeenTutorialHint = localPlayerForTutorial?.hasSeenTutorialHint;
    const hasSeenHostileEncounterTutorial = localPlayerForTutorial?.hasSeenHostileEncounterTutorial;
    const hasSeenRuneStoneTutorial = localPlayerForTutorial?.hasSeenRuneStoneTutorial;
    const hasSeenAlkStationTutorial = localPlayerForTutorial?.hasSeenAlkStationTutorial;
    const hasSeenCrashedDroneTutorial = localPlayerForTutorial?.hasSeenCrashedDroneTutorial;

    // Callbacks to mark tutorials as seen on the server (all tutorials now server-side)
    const callTutorialSeenReducer = useCallback((
        reducerName: string,
        successLog: string,
        failureLog: string
    ) => {
        const reducers = props.connection?.reducers as Record<string, (() => void) | undefined> | undefined;
        const reducerFn = reducers?.[reducerName];
        if (!reducerFn) return;
        try {
            reducerFn();
            console.log(successLog);
        } catch (error) {
            console.error(failureLog, error);
        }
    }, [props.connection]);

    const handleMarkSovaIntroSeen = useCallback(() => {
        callTutorialSeenReducer(
            'markSovaIntroSeen',
            '[GameScreen] Called markSovaIntroSeen reducer',
            '[GameScreen] Failed to mark SOVA intro as seen:'
        );
    }, [callTutorialSeenReducer]);

    const handleMarkTutorialHintSeen = useCallback(() => {
        callTutorialSeenReducer(
            'markTutorialHintSeen',
            '[GameScreen] Called markTutorialHintSeen reducer',
            '[GameScreen] Failed to mark tutorial hint as seen:'
        );
    }, [callTutorialSeenReducer]);

    const handleMarkHostileEncounterTutorialSeen = useCallback(() => {
        callTutorialSeenReducer(
            'markHostileEncounterTutorialSeen',
            '[GameScreen] Called markHostileEncounterTutorialSeen reducer',
            '[GameScreen] Failed to mark hostile encounter tutorial as seen:'
        );
    }, [callTutorialSeenReducer]);

    const handleMarkRuneStoneTutorialSeen = useCallback(() => {
        callTutorialSeenReducer(
            'markRuneStoneTutorialSeen',
            '[GameScreen] Called markRuneStoneTutorialSeen reducer',
            '[GameScreen] Failed to mark rune stone tutorial as seen:'
        );
    }, [callTutorialSeenReducer]);

    const handleMarkAlkStationTutorialSeen = useCallback(() => {
        callTutorialSeenReducer(
            'markAlkStationTutorialSeen',
            '[GameScreen] Called markAlkStationTutorialSeen reducer',
            '[GameScreen] Failed to mark ALK station tutorial as seen:'
        );
    }, [callTutorialSeenReducer]);

    const handleMarkCrashedDroneTutorialSeen = useCallback(() => {
        callTutorialSeenReducer(
            'markCrashedDroneTutorialSeen',
            '[GameScreen] Called markCrashedDroneTutorialSeen reducer',
            '[GameScreen] Failed to mark crashed drone tutorial as seen:'
        );
    }, [callTutorialSeenReducer]);

    // === SOVA Tutorial Sounds (abstracted to useSovaTutorials hook) ===
    // Handles: crash intro (2.5s), tutorial hint (3.5min), memory shard, rune stone, alk station tutorials
    // ALL tutorials now use SERVER-SIDE flags (no localStorage) - survives browser cache clears
    useSovaTutorials({
        localPlayerId,
        showSovaSoundBoxRef,
        sovaMessageAdderRef,
        // Server-side tutorial flags
        hasSeenSovaIntro,
        hasSeenMemoryShardTutorial,
        hasSeenTutorialHint,
        hasSeenHostileEncounterTutorial,
        hasSeenRuneStoneTutorial,
        hasSeenAlkStationTutorial,
        hasSeenCrashedDroneTutorial,
        // Callbacks to mark tutorials as seen on server
        onMarkSovaIntroSeen: handleMarkSovaIntroSeen,
        onMarkTutorialHintSeen: handleMarkTutorialHintSeen,
        onMarkHostileEncounterTutorialSeen: handleMarkHostileEncounterTutorialSeen,
        onMarkRuneStoneTutorialSeen: handleMarkRuneStoneTutorialSeen,
        onMarkAlkStationTutorialSeen: handleMarkAlkStationTutorialSeen,
        onMarkCrashedDroneTutorialSeen: handleMarkCrashedDroneTutorialSeen,
        // Entity data for proximity detection
        localPlayerPosition: predictedPosition,
        runeStones: props.runeStones,
        alkStations: props.alkStations,
        monumentParts: props.monumentParts,
    });

    // === QUEST NOTIFICATION HANDLERS (abstracted to useQuestNotifications hook) ===
    // Handles: SOVA quest messages, quest completion celebrations, progress milestones
    const {
        questCompletionNotification,
        dismissQuestCompletionNotification,
        hasNewQuestNotification,
    } = useQuestNotifications({
        sovaQuestMessages,
        questCompletionNotifications,
        questProgressNotifications,
        playerIdentity: props.playerIdentity,
        showSovaSoundBoxRef,
        sovaMessageAdderRef,
    });

    // Handle matronage creation - close delivery panel and open interface to matronage page
    const handleMatronageCreated = useCallback(() => {
        // Close the ALK delivery panel
        handleSetInteractingWith(null);
        // Open interface container to matronage tab
        setInterfaceInitialView?.('matronage');
        setIsMinimapOpen(true);
    }, [handleSetInteractingWith, setInterfaceInitialView, setIsMinimapOpen]);

    // Handle opening ALK Board to a specific tab - close delivery panel and open ALK panel
    const handleOpenAlkBoard = useCallback((tab?: string) => {
        // Close the ALK delivery panel
        handleSetInteractingWith(null);
        // Store the desired ALK tab in state so it can be passed to InterfaceContainer
        setAlkInitialTab(tab as AlkTab | undefined);
        // Open interface container to ALK tab
        setInterfaceInitialView?.('alk');
        setIsMinimapOpen(true);
    }, [handleSetInteractingWith, setInterfaceInitialView, setIsMinimapOpen]);

    // Reset interface initial view when interface closes (G always opens to map)
    const handleInterfaceClose = useCallback(() => {
        setInterfaceInitialView?.(undefined); // Reset so G opens to map (default)
        setIsMinimapOpen(false);
    }, [setInterfaceInitialView, setIsMinimapOpen]);

    // You can also add a useEffect here if the above doesn't show up
    useEffect(() => {
        // console.log("[GameScreen.tsx] activeConsumableEffects prop after destructuring:", activeConsumableEffects);
    }, [activeConsumableEffects]);

    // Find local player for viewport calculations
    const localPlayer = localPlayerId ? players.get(localPlayerId) : undefined;

    // === SOVA Insanity & Entrainment Sound Hooks ===
    // These play SOVA voice lines when player crosses insanity thresholds or has Entrainment effect
    // Moved from App.tsx to GameScreen.tsx so we have access to sovaMessageAdder for tab switching/flashing
    useInsanitySovaSounds({
        localPlayer,
        onSoundPlay: showSovaSoundBox,
        onAddMessage: sovaMessageAdder || undefined
    });

    useEntrainmentSovaSounds({
        activeConsumableEffects,
        localPlayerId,
        onSoundPlay: showSovaSoundBox,
        onAddMessage: sovaMessageAdder || undefined
    });

    // Use our custom hook to get camera offsets
    // CRITICAL: Pass predictedPosition so camera offset matches GameCanvas exactly
    const { cameraOffsetX, cameraOffsetY } = useSpeechBubbleManager(localPlayer, predictedPosition);

    // Derive activeItemDef for TargetingReticle
    const localPlayerActiveEquipment = localPlayerId ? activeEquipments.get(localPlayerId) : undefined;
    const activeItemDef = localPlayerActiveEquipment?.equippedItemDefId && itemDefinitions
        ? itemDefinitions.get(localPlayerActiveEquipment.equippedItemDefId.toString()) || null
        : null;

    // Menu handlers
    const handleMenuOpen = () => {
        setCurrentMenu('main');
    };

    const handleMenuClose = () => {
        setCurrentMenu(null);
    };

    // Handle title selection - calls reducer to set active title
    const handleTitleSelect = useCallback((titleId: string | null) => {
        if (props.connection?.reducers) {
            try {
                props.connection.reducers.setActiveTitle(titleId ?? '');
            } catch (error) {
                console.error('[GameScreen] Failed to set active title:', error);
            }
        }
    }, [props.connection]);

    const handleMenuNavigate = (menu: MenuType) => {
        setCurrentMenu(menu);
    };

    const handleMenuBack = () => {
        setCurrentMenu('main');
    };

    // Handler for auto-action state changes from GameCanvas
    const handleAutoActionStatesChange = useCallback((isAutoAttacking: boolean) => {
        // console.log('[GameScreen] Auto-action states changed:', { isAutoAttacking });
        setAutoActionStates({ isAutoAttacking });
    }, []);

    // Combined keyboard handler for game menu (Escape), refresh confirmation (Ctrl+R), and time debug cycler (Arrow keys)
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            // Handle Escape key for game menu
            if (event.key === 'Escape') {
                if (currentMenu === null) {
                    // No menu open - open main menu
                    setCurrentMenu('main');
                } else if (currentMenu === 'main') {
                    // Main menu open - close menu entirely
                    setCurrentMenu(null);
                } else {
                    // Sub-menu open (controls/tips) - return to main menu
                    setCurrentMenu('main');
                }
            }
            // Handle Ctrl+R / Cmd+R for refresh confirmation
            else if ((event.ctrlKey || event.metaKey) && event.key === 'r') {
                console.log('[GameScreen] Ctrl+R intercepted, showing refresh dialog');
                event.preventDefault(); // Prevent default browser refresh
                setShowRefreshDialog(true); // Show our custom dialog
            }
            // Handle M key for music debug panel toggle
            else if (event.key === 'm' || event.key === 'M') {
                toggleMusicDebug();
            }
            // Handle J key for quest panel toggle
            else if ((event.key === 'j' || event.key === 'J') && !isChatting) {
                setIsQuestsPanelOpen(prev => !prev);
            }
            // Handle G key for map panel (always opens to map)
            else if ((event.key === 'g' || event.key === 'G') && !isChatting) {
                event.preventDefault();
                event.stopPropagation(); // Prevent useInputHandler from also handling this
                if (isMinimapOpen) {
                    // If already on map (undefined = map), close it
                    // If on another tab, switch to map first
                    if (interfaceInitialView === undefined || interfaceInitialView === 'minimap') {
                        // Already on map - close
                        setIsMinimapOpen(false);
                    } else {
                        // On another tab (achievements, etc.) - switch to map
                        setInterfaceInitialView?.(undefined);
                    }
                } else {
                    // Open to map (reset interfaceInitialView to ensure map view)
                    setInterfaceInitialView?.(undefined);
                    setIsMinimapOpen(true);
                }
            }
            // Handle Y key for achievements panel (toggle behavior)
            else if ((event.key === 'y' || event.key === 'Y') && !isChatting) {
                event.preventDefault();
                if (isMinimapOpen && interfaceInitialView === 'achievements') {
                    // Already showing achievements - close it
                    setInterfaceInitialView?.(undefined);
                    setIsMinimapOpen(false);
                } else {
                    // Not showing achievements - open/switch to it
                    setInterfaceInitialView?.('achievements');
                    setIsMinimapOpen(true);
                }
            }
            // Handle Arrow keys for time debug cycler (only when menu is closed and not typing)
            else if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && currentMenu === null && !isChatting) {
                event.preventDefault();
                // Correct cycle order: Night -> Midnight -> TwilightMorning -> Dawn -> Morning -> Noon -> Afternoon -> Dusk -> TwilightEvening -> Night
                const timeOrder = ['Night', 'Midnight', 'TwilightMorning', 'Dawn', 'Morning', 'Noon', 'Afternoon', 'Dusk', 'TwilightEvening'];
                const currentTimeOfDay = worldState?.timeOfDay?.tag || 'Noon';
                const currentIndex = timeOrder.indexOf(currentTimeOfDay);

                let newIndex: number;
                if (event.key === 'ArrowRight') {
                    // Move forward
                    newIndex = (currentIndex + 1) % timeOrder.length;
                } else {
                    // Move backward
                    newIndex = (currentIndex - 1 + timeOrder.length) % timeOrder.length;
                }

                const newTime = timeOrder[newIndex];

                if (connection) {
                    try {
                        (connection.reducers as any).debugSetTime(newTime);
                    } catch (error) {
                        console.warn('Debug time function not available (production build?):', error);
                    }
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [currentMenu, worldState?.timeOfDay?.tag, connection, isChatting, isMinimapOpen, interfaceInitialView, setIsMinimapOpen, setInterfaceInitialView]); // Include all dependencies

    // Handler for refresh dialog actions
    const handleRefreshConfirm = () => {
        window.location.reload(); // Actually refresh the page
    };

    const handleRefreshCancel = () => {
        setShowRefreshDialog(false); // Close the dialog
    };

    // Auto-close ALK delivery panel when walking out of interaction range
    useEffect(() => {
        // Only run if we're interacting with an ALK station
        if (interactingWith?.type !== 'alk_station') return;

        // Check if we have the necessary data
        const station = props.alkStations?.get(String(interactingWith.id));
        if (!station) {
            // Station was removed or doesn't exist - close panel
            handleSetInteractingWith(null);
            return;
        }

        // Get player position
        const playerPos = predictedPosition || (localPlayer ? { x: localPlayer.positionX, y: localPlayer.positionY } : null);
        if (!playerPos) return;

        // Check distance to station (using same threshold as interaction finder)
        const dx = playerPos.x - station.worldPosX;
        const dy = playerPos.y - station.worldPosY;
        const distSq = dx * dx + dy * dy;

        // Use slightly larger threshold than interaction distance to avoid flickering
        // PLAYER_ALK_STATION_INTERACTION_DISTANCE_SQUARED = 280 * 280 = 78400
        // Use 320px (102400) for closing to give some buffer
        const closeThresholdSq = 320 * 320;

        if (distSq > closeThresholdSq) {
            console.log('[GameScreen] Player walked out of ALK station range, closing panel');
            handleSetInteractingWith(null);
        }
    }, [interactingWith, props.alkStations, predictedPosition, localPlayer, handleSetInteractingWith]);

    return (
        <div className="game-container">
            {/* CSS Animation for Auto-Action Indicators */}
            <style>{`
                @keyframes pulse {
                    0% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.7; transform: scale(1.05); }
                    100% { opacity: 1; transform: scale(1); }
                }
            `}</style>

            {/* Game Menu Button */}
            <GameMenuButton onClick={handleMenuOpen} />

            {/* Auto-Action Status Indicators - Hidden on mobile */}
            {!props.isMobile && autoActionStates.isAutoAttacking && (
                <div style={{
                    position: 'fixed',
                    top: '70px', // Position below DayNightCycleTracker (which is at 15px)
                    right: '15px', // Same right position as DayNightCycleTracker
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    zIndex: 50, // Same z-index as DayNightCycleTracker
                    pointerEvents: 'none' // Don't interfere with clicks
                }}>
                    {autoActionStates.isAutoAttacking && (
                        <div style={{
                            backgroundColor: 'rgba(40, 40, 60, 0.85)', // Same as DayNightCycleTracker
                            color: 'white',
                            padding: '8px 12px', // Slightly less padding for compact look
                            borderRadius: '4px', // Same as DayNightCycleTracker
                            fontSize: '10px', // Same as DayNightCycleTracker
                            fontFamily: '"Press Start 2P", cursive', // Same as DayNightCycleTracker
                            fontWeight: 'normal', // Remove bold for pixel font
                            textAlign: 'center',
                            border: '1px solid #a0a0c0', // Same border as DayNightCycleTracker
                            boxShadow: '2px 2px 0px rgba(0,0,0,0.5)', // Same shadow as DayNightCycleTracker
                            width: '140px', // Fixed width for consistency
                            animation: 'pulse 2s infinite'
                        }}>
                            ⚔️ AUTO ATTACK (Z)
                        </div>
                    )}
                </div>
            )}

            {/* Debug Panel - Hidden on mobile */}
            {!props.isMobile && process.env.NODE_ENV === 'development' && localPlayer && (
                <DebugPanel
                    localPlayer={localPlayer}
                    worldState={worldState}
                    connection={connection}
                    itemDefinitions={itemDefinitions}
                />
            )}


            {/* Game Menu Overlays */}
            {currentMenu === 'main' && (
                <GameMenu
                    onClose={handleMenuClose}
                    onNavigate={handleMenuNavigate}
                />
            )}
            {currentMenu === 'controls' && (
                <ControlsMenu
                    onBack={handleMenuBack}
                    onClose={handleMenuClose}
                />
            )}
            {currentMenu === 'tips' && (
                <GameTipsMenu
                    onBack={handleMenuBack}
                    onClose={handleMenuClose}
                />
            )}
            {currentMenu === 'settings' && (
                <GameSettingsMenu
                    onBack={handleMenuBack}
                    onClose={handleMenuClose}
                />
            )}
            {currentMenu === 'visual_settings' && (
                <GameVisualSettingsMenu
                    onBack={handleMenuBack}
                    onClose={handleMenuClose}
                    playerStats={props.playerStats}
                    playerAchievements={props.playerAchievements}
                    achievementDefinitions={props.achievementDefinitions}
                    localPlayerIdentity={props.localPlayerId}
                    onTitleSelect={handleTitleSelect}
                />
            )}

            {/* Refresh Confirmation Dialog */}
            {showRefreshDialog && (
                <div
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        backgroundColor: 'rgba(0, 0, 0, 0.7)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 9999,
                        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif",
                    }}
                    onClick={handleRefreshCancel} // Click outside to close
                >
                    <div
                        style={{
                            backgroundColor: 'rgba(20, 20, 40, 0.95)',
                            border: '2px solid #00aaff',
                            borderRadius: '8px',
                            padding: '24px',
                            maxWidth: '400px',
                            textAlign: 'center',
                            boxShadow: '0 0 30px rgba(0, 170, 255, 0.3)',
                        }}
                        onClick={(e) => e.stopPropagation()} // Prevent click from bubbling up
                    >
                        <div style={{
                            color: '#00ddff',
                            fontSize: '16px',
                            marginBottom: '12px',
                            textShadow: '0 0 10px rgba(0, 221, 255, 0.5)',
                            fontWeight: 'bold',
                        }}>
                            NEUROVEIL™ REFRESH REQUEST
                        </div>

                        <div style={{
                            color: '#e0e0e0',
                            fontSize: '14px',
                            lineHeight: '1.6',
                            marginBottom: '24px',
                            padding: '16px',
                            backgroundColor: 'rgba(0, 0, 0, 0.3)',
                            borderRadius: '4px',
                        }}>
                            Your neural interface is requesting to refresh the Babachain connection.
                            This will reinitialize your session with the latest quantum state synchronization.
                            <br /><br />
                            Proceed with Neuroveil™ Refresh?
                        </div>

                        <div style={{
                            display: 'flex',
                            gap: '15px',
                            justifyContent: 'center',
                        }}>
                            <button
                                onClick={handleRefreshConfirm}
                                style={{
                                    background: 'linear-gradient(135deg, rgba(255, 140, 0, 0.8), rgba(200, 100, 0, 0.9))',
                                    color: '#ffffff',
                                    border: '2px solid #ff8c00',
                                    borderRadius: '8px',
                                    padding: '15px 25px',
                                    fontFamily: '"Press Start 2P", cursive',
                                    fontSize: '12px',
                                    cursor: 'pointer',
                                    transition: 'all 0.3s ease',
                                    boxShadow: '0 0 15px rgba(255, 140, 0, 0.3), inset 0 0 10px rgba(255, 140, 0, 0.1)',
                                    textShadow: '0 0 5px currentColor',
                                    position: 'relative',
                                    overflow: 'hidden',
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255, 160, 20, 0.9), rgba(220, 120, 10, 1))';
                                    e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)';
                                    e.currentTarget.style.boxShadow = '0 0 25px rgba(255, 140, 0, 0.6), inset 0 0 15px rgba(255, 140, 0, 0.2)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255, 140, 0, 0.8), rgba(200, 100, 0, 0.9))';
                                    e.currentTarget.style.transform = 'translateY(0px) scale(1)';
                                    e.currentTarget.style.boxShadow = '0 0 15px rgba(255, 140, 0, 0.3), inset 0 0 10px rgba(255, 140, 0, 0.1)';
                                }}
                            >
                                REFRESH NEUROVEIL™
                            </button>

                            <button
                                onClick={handleRefreshCancel}
                                style={{
                                    background: 'linear-gradient(135deg, rgba(20, 40, 80, 0.8), rgba(10, 30, 70, 0.9))',
                                    color: '#ffffff',
                                    border: '2px solid #00aaff',
                                    borderRadius: '8px',
                                    padding: '15px 25px',
                                    fontFamily: '"Press Start 2P", cursive',
                                    fontSize: '12px',
                                    cursor: 'pointer',
                                    transition: 'all 0.3s ease',
                                    boxShadow: '0 0 15px rgba(0, 170, 255, 0.3), inset 0 0 10px rgba(0, 170, 255, 0.1)',
                                    textShadow: '0 0 5px currentColor',
                                    position: 'relative',
                                    overflow: 'hidden',
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'linear-gradient(135deg, rgba(30, 50, 100, 0.9), rgba(15, 40, 90, 1))';
                                    e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)';
                                    e.currentTarget.style.boxShadow = '0 0 25px rgba(0, 170, 255, 0.6), inset 0 0 15px rgba(0, 170, 255, 0.2)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'linear-gradient(135deg, rgba(20, 40, 80, 0.8), rgba(10, 30, 70, 0.9))';
                                    e.currentTarget.style.transform = 'translateY(0px) scale(1)';
                                    e.currentTarget.style.boxShadow = '0 0 15px rgba(0, 170, 255, 0.3), inset 0 0 10px rgba(0, 170, 255, 0.1)';
                                }}
                            >
                                CANCEL
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <MemoGameCanvas
                worldChunkDataMap={worldChunkDataMap}
                players={players}
                trees={trees}
                clouds={clouds}
                droneEvents={droneEvents}
                stones={stones}
                runeStones={runeStones}
                cairns={cairns}
                playerDiscoveredCairns={playerDiscoveredCairns}
                campfires={campfires}
                furnaces={furnaces}
                barbecues={props.barbecues}
                harvestableResources={harvestableResources}
                droppedItems={droppedItems}
                woodenStorageBoxes={woodenStorageBoxes}
                sleepingBags={sleepingBags}
                playerPins={playerPins}
                playerCorpses={playerCorpses}
                stashes={stashes}
                plantedSeeds={plantedSeeds}
                wildAnimals={wildAnimals}
                hostileDeathEvents={hostileDeathEvents}
                animalCorpses={animalCorpses}
                barrels={props.barrels}
                roadLampposts={props.roadLampposts}
                seaStacks={props.seaStacks}
                homesteadHearths={props.homesteadHearths}
                foundationCells={props.foundationCells}
                wallCells={props.wallCells}
                doors={props.doors}
                fences={props.fences}
                fumaroles={props.fumaroles}
                basaltColumns={props.basaltColumns}
                livingCorals={props.livingCorals}
                addSOVAMessage={sovaMessageAdder || undefined}
                showSovaSoundBox={showSovaSoundBox}
                onCairnNotification={handleCairnNotification}
                inventoryItems={inventoryItems}
                itemDefinitions={itemDefinitions}
                worldState={worldState}
                activeEquipments={activeEquipments}
                activeConnections={activeConnections}
                localPlayerId={localPlayerId}
                connection={connection}
                predictedPosition={predictedPosition}
                getCurrentPositionNow={getCurrentPositionNow}
                localFacingDirection={props.facingDirection} // ADD: Pass local facing direction for instant visual feedback
                placementInfo={placementInfo}
                placementActions={placementActions}
                placementError={placementError}
                placementWarning={placementWarning}
                setPlacementWarning={setPlacementWarning}
                onSetInteractingWith={handleSetInteractingWith}
                isMinimapOpen={isMinimapOpen}
                setIsMinimapOpen={setIsMinimapOpen}
                interfaceInitialView={interfaceInitialView}
                alkInitialTab={alkInitialTab}
                onInterfaceClose={handleInterfaceClose}
                isChatting={isChatting}
                messages={messages}
                isSearchingCraftRecipes={isCraftingSearchFocused}
                onSearchFocusChange={setIsCraftingSearchFocused}
                activeConsumableEffects={activeConsumableEffects}
                showInventory={showInventoryState || showCraftingScreenState}
                grass={grass}
                grassState={grassState}
                gameCanvasRef={canvasRef}
                projectiles={projectiles}
                deathMarkers={deathMarkers}
                shelters={shelters}
                showAutotileDebug={showAutotileDebug}
                showChunkBoundaries={showChunkBoundaries}
                showInteriorDebug={showInteriorDebug}
                showCollisionDebug={showCollisionDebug}
                showAttackRangeDebug={showAttackRangeDebug}
                showYSortDebug={showYSortDebug}
                showShipwreckDebug={showShipwreckDebug}
                showFpsProfiler={showFpsProfiler}
                isProfilerRecording={isProfilerRecording}
                startProfilerRecording={startProfilerRecording}
                stopProfilerRecording={stopProfilerRecording}
                onProfilerCopied={onProfilerCopied}
                minimapCache={minimapCache}
                isGameMenuOpen={currentMenu !== null}
                onAutoActionStatesChange={handleAutoActionStatesChange}
                isFishing={isFishing}
                lanterns={lanterns}
                turrets={turrets}
                playerDrinkingCooldowns={playerDrinkingCooldowns}
                rainCollectors={rainCollectors}
                brothPots={brothPots}
                waterPatches={waterPatches}
                fertilizerPatches={fertilizerPatches}
                firePatches={props.firePatches}
                placedExplosives={props.placedExplosives}
                setMusicPanelVisible={setIsMusicPanelVisible}
                movementDirection={movementDirection}
                isAutoWalking={props.isAutoWalking}
                playerDodgeRollStates={props.playerDodgeRollStates}
                chunkWeather={chunkWeather}
                alkStations={props.alkStations}
                alkContracts={props.alkContracts}
                monumentParts={props.monumentParts}
                largeQuarries={props.largeQuarries}
                alkPlayerContracts={props.alkPlayerContracts}
                alkState={props.alkState}
                playerShardBalance={props.playerShardBalance}
                memoryGridProgress={props.memoryGridProgress}
                // Matronage system
                matronages={matronages}
                matronageMembers={matronageMembers}
                matronageInvitations={matronageInvitations}
                matronageOwedShards={matronageOwedShards}
                leaderboardEntries={props.leaderboardEntries}
                achievementDefinitions={props.achievementDefinitions}
                playerAchievements={props.playerAchievements}
                plantConfigs={props.plantConfigDefinitions}
                discoveredPlants={props.discoveredPlants}
                playerStats={props.playerStats}
                rangedWeaponStats={rangedWeaponStats}
                beaconDropEvents={beaconDropEvents}
                // Animal breeding system data
                caribouBreedingData={props.caribouBreedingData}
                walrusBreedingData={props.walrusBreedingData}
                caribouRutState={props.caribouRutState}
                walrusRutState={props.walrusRutState}
                // Mobile controls
                isMobile={props.isMobile}
                onMobileTap={props.onMobileTap}
                tapAnimation={props.tapAnimation}
                onMobileInteractInfoChange={setMobileInteractInfo}
                mobileInteractTrigger={mobileInteractTrigger}
            />

            {/* Use our camera offsets for SpeechBubbleManager */}
            {/* Pass predicted position so local player bubble tracks smoothly */}
            <SpeechBubbleManager
                messages={messages}
                players={players}
                cameraOffsetX={cameraOffsetX}
                cameraOffsetY={cameraOffsetY}
                localPlayerId={localPlayerId}
                localBubbles={localBubbles}
                predictedPosition={predictedPosition}
            />

            {/* PlayerUI - Always render for status bars, but inventory only when opened on mobile */}
            <MemoPlayerUI
                identity={playerIdentity}
                players={players}
                inventoryItems={inventoryItems}
                itemDefinitions={itemDefinitions}
                rangedWeaponStats={rangedWeaponStats}
                recipes={recipes}
                craftingQueueItems={craftingQueueItems}
                onItemDragStart={onItemDragStart}
                onItemDrop={onItemDrop}
                draggedItemInfo={draggedItemInfo}
                interactingWith={interactingWith}
                onSetInteractingWith={handleSetInteractingWith}
                campfires={campfires}
                furnaces={furnaces}
                barbecues={barbecues}
                fumaroles={props.fumaroles}
                lanterns={lanterns}
                turrets={turrets}
                woodenStorageBoxes={woodenStorageBoxes}
                playerCorpses={playerCorpses}
                stashes={stashes}
                rainCollectors={rainCollectors}
                brothPots={brothPots}
                homesteadHearths={props.homesteadHearths}
                currentStorageBox={
                    interactingWith?.type === 'wooden_storage_box'
                        ? woodenStorageBoxes.get(interactingWith.id.toString()) || null
                        : null
                }
                startPlacement={startPlacement}
                cancelPlacement={cancelPlacement}
                placementInfo={placementInfo}
                connection={connection}
                chunkWeather={props.chunkWeather}
                activeEquipments={activeEquipments}
                activeConsumableEffects={activeConsumableEffects}
                onCraftingSearchFocusChange={setIsCraftingSearchFocused}
                onToggleInventory={() => {
                    if (props.isMobile && !showInventoryState) {
                        // Block opening inventory on mobile - SOVA error or red box when narrative playing
                        if (isAnySovaAudioPlaying()) {
                            showError('Not available on mobile.');
                        } else if (showSovaSoundBox) {
                            const audio = new Audio('/sounds/sova_error_mobile_capability.mp3');
                            audio.volume = 0.8;
                            showSovaSoundBox(audio, 'SOVA');
                            audio.play().catch(() => { });
                        }
                        return;
                    }
                    setShowInventoryState(prev => !prev);
                }}
                showInventory={props.isMobile ? showInventoryState : showInventoryState}
                knockedOutStatus={knockedOutStatus}
                worldState={worldState}
                isGameMenuOpen={currentMenu !== null}
                memoryGridProgress={props.memoryGridProgress}
                playerStats={props.playerStats}
                isMobile={props.isMobile}
                showCraftingScreen={showCraftingScreenState}
                onToggleCraftingScreen={() => {
                    if (props.isMobile && !showCraftingScreenState) {
                        // Block opening crafting on mobile - SOVA error or red box when narrative playing
                        if (isAnySovaAudioPlaying()) {
                            showError('Not available on mobile.');
                        } else if (showSovaSoundBox) {
                            const audio = new Audio('/sounds/sova_error_mobile_capability.mp3');
                            audio.volume = 0.8;
                            showSovaSoundBox(audio, 'SOVA');
                            audio.play().catch(() => { });
                        }
                        return;
                    }
                    setShowCraftingScreenState(prev => !prev);
                }}
                onPauseBackgroundMusic={musicSystem.stop}
                onResumeBackgroundMusic={musicSystem.start}
            />
            {/* DayNightCycleTracker with integrated SOVA Directives */}
            <DayNightCycleTracker
                worldState={worldState}
                chunkWeather={chunkWeather}
                localPlayer={localPlayer}
                isMobile={props.isMobile}
                onMinimizedChange={handleDayNightMinimizedChange}
                tutorialQuestDefinitions={tutorialQuestDefinitions}
                dailyQuestDefinitions={dailyQuestDefinitions}
                playerTutorialProgress={playerTutorialProgress}
                playerDailyQuests={playerDailyQuests}
                localPlayerId={props.playerIdentity || undefined}
                onOpenQuestsPanel={openQuestsPanel}
                hasNewNotification={hasNewQuestNotification}
            />
            {/* Quest Panel Overlay */}
            <QuestsPanel
                isOpen={isQuestsPanelOpen}
                onClose={closeQuestsPanel}
                tutorialQuestDefinitions={tutorialQuestDefinitions}
                dailyQuestDefinitions={dailyQuestDefinitions}
                playerTutorialProgress={playerTutorialProgress}
                playerDailyQuests={playerDailyQuests}
                localPlayerId={props.playerIdentity || undefined}
                isMobile={props.isMobile}
                showSovaSoundBox={showSovaSoundBox}
                addSOVAMessage={sovaMessageAdder || undefined}
                // Server-side tutorial flags for Audio Logs tab (ALL tutorials now server-validated)
                hasSeenSovaIntro={hasSeenSovaIntro}
                hasSeenMemoryShardTutorial={hasSeenMemoryShardTutorial}
                hasSeenTutorialHint={hasSeenTutorialHint}
                hasSeenHostileEncounterTutorial={hasSeenHostileEncounterTutorial}
                hasSeenRuneStoneTutorial={hasSeenRuneStoneTutorial}
                hasSeenAlkStationTutorial={hasSeenAlkStationTutorial}
                hasSeenCrashedDroneTutorial={hasSeenCrashedDroneTutorial}
            />
            {/* MusicControlPanel - Hidden on mobile */}
            {!props.isMobile && (
                <MusicControlPanel
                    musicSystem={musicSystem}
                    isVisible={isMusicPanelVisible}
                    onClose={() => setIsMusicPanelVisible(false)}
                />
            )}
            <Chat
                connection={connection}
                messages={messages}
                players={players}
                isChatting={isChatting}
                setIsChatting={setIsChatting}
                localPlayerIdentity={localPlayerId}
                onSOVAMessageAdderReady={handleSOVAMessageAdderReady}
                worldState={worldState}
                localPlayer={localPlayer}
                itemDefinitions={itemDefinitions}
                activeEquipments={activeEquipments}
                inventoryItems={inventoryItems}
                isMobile={props.isMobile}
                isMobileChatOpen={isMobileChatOpen}
                matronageMembers={matronageMembers}
                matronages={matronages}
                onSayCommand={(message: string) => {
                    // Create a local-only speech bubble for /s command
                    if (localPlayerId) {
                        const bubbleId = `local-${Date.now()}-${Math.random()}`;
                        const newBubble = {
                            id: bubbleId,
                            message: message,
                            playerId: localPlayerId,
                            timestamp: Date.now()
                        };
                        setLocalBubbles(prev => {
                            // Remove any existing bubbles from the same player
                            const filtered = prev.filter(b => b.playerId !== localPlayerId);
                            return [...filtered, newBubble];
                        });
                        // Auto-remove after 8 seconds
                        setTimeout(() => {
                            setLocalBubbles(prev => prev.filter(b => b.id !== bubbleId));
                        }, 8000);
                    }
                }}
            />

            {/* TargetingReticle - Hidden on mobile */}
            {!props.isMobile && (
                <TargetingReticle
                    localPlayer={localPlayer || null}
                    playerIdentity={playerIdentity}
                    activeItemDef={activeItemDef}
                    activeEquipment={localPlayerActiveEquipment || null}
                    rangedWeaponStats={rangedWeaponStats || new Map()}
                    gameCanvasRef={canvasRef}
                    cameraOffsetX={cameraOffsetX}
                    cameraOffsetY={cameraOffsetY}
                    isInventoryOpen={showInventoryState || showCraftingScreenState}
                    isGameMenuOpen={currentMenu !== null}
                    isMinimapOpen={isMinimapOpen}
                />
            )}

            {/* FishingManager - Hidden on mobile */}
            {!props.isMobile && (
                <FishingManager
                    localPlayer={localPlayer || null}
                    playerIdentity={playerIdentity}
                    activeItemDef={activeItemDef}
                    gameCanvasRef={canvasRef}
                    cameraOffsetX={cameraOffsetX}
                    cameraOffsetY={cameraOffsetY}
                    connection={connection}
                    // 🎣 FISHING INPUT FIX: Add callback to track fishing state
                    onFishingStateChange={setIsFishing}
                    // Fishing sessions and players for rendering other players' fishing
                    fishingSessions={fishingSessions}
                    players={players}
                    // worldState for weather information
                    worldState={worldState}
                    isWaterTile={isWaterTile}
                    isInventoryOpen={showInventoryState || showCraftingScreenState}
                    isGameMenuOpen={currentMenu !== null}
                    isMinimapOpen={isMinimapOpen}
                />
            )}

            {/* SOVA Loading Bar - Hidden on mobile */}
            {!props.isMobile && (
                <SOVALoadingBar
                    isRecording={sovaLoadingState.isRecording}
                    isTranscribing={sovaLoadingState.isTranscribing}
                    isGeneratingResponse={sovaLoadingState.isGeneratingResponse}
                    isSynthesizingVoice={sovaLoadingState.isSynthesizingVoice}
                    isPlayingAudio={sovaLoadingState.isPlayingAudio}
                    currentPhase={sovaLoadingState.currentPhase}
                />
            )}

            {/* Voice Interface - Hidden on mobile */}
            {!props.isMobile && (
                <VoiceInterface
                    isVisible={voiceState.isVisible}
                    onTranscriptionComplete={handleTranscriptionComplete}
                    onError={handleVoiceError}
                    onAddSOVAMessage={sovaMessageAdder}
                    localPlayerIdentity={localPlayerId}
                    worldState={worldState}
                    localPlayer={localPlayer}
                    itemDefinitions={itemDefinitions}
                    activeEquipments={activeEquipments}
                    inventoryItems={inventoryItems}
                    onLoadingStateChange={handleSOVALoadingStateChange}
                />
            )}

            {/* Hotbar is now rendered in PlayerUI with hot loot support */}

            {/* Error Display - Red rectangle above XP bar, fades in 2s or on click */}
            <ErrorDisplay isMobile={props.isMobile} />

            {/* Profiler copy toast - shows when Stop & Copy succeeds */}
            {profilerCopyToast && (
                <div
                    role="status"
                    aria-live="polite"
                    style={{
                        position: 'fixed',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        bottom: '80px',
                        padding: '10px 18px',
                        background: 'rgba(40, 180, 80, 0.95)',
                        border: '1px solid rgba(80, 255, 120, 0.6)',
                        borderRadius: '6px',
                        color: '#ffffff',
                        fontSize: '11px',
                        fontFamily: '"Press Start 2P", monospace',
                        textAlign: 'center',
                        zIndex: 1001,
                        boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
                    }}
                >
                    Copied to clipboard
                </div>
            )}

            {/* ALK Delivery Panel - Shows when interacting with an ALK station */}
            {interactingWith?.type === 'alk_station' && props.alkStations && (
                <AlkDeliveryPanel
                    playerIdentity={playerIdentity}
                    onClose={() => handleSetInteractingWith(null)}
                    stationId={Number(interactingWith.id)}
                    alkStations={props.alkStations}
                    alkContracts={props.alkContracts || new Map()}
                    alkPlayerContracts={props.alkPlayerContracts || new Map()}
                    playerShardBalance={
                        playerIdentity && props.playerShardBalance
                            ? props.playerShardBalance.get(playerIdentity.toHexString()) || null
                            : null
                    }
                    itemDefinitions={itemDefinitions}
                    inventoryItems={inventoryItems}
                    matronageMembers={matronageMembers}
                    matronages={matronages}
                    onMatronageCreated={handleMatronageCreated}
                    onOpenAlkBoard={handleOpenAlkBoard}
                />
            )}

            {/* Mobile Control Bar - Only shown on mobile */}
            {props.isMobile && (
                <MobileControlBar
                    onMapToggle={() => setIsMinimapOpen(prev => !prev)}
                    onChatToggle={() => setIsMobileChatOpen(prev => !prev)}
                    onInteract={() => setMobileInteractTrigger(prev => prev + 1)}
                    isMapOpen={isMinimapOpen}
                    isChatOpen={isMobileChatOpen}
                    hasInteractable={mobileInteractInfo?.hasTarget || false}
                    interactableLabel={mobileInteractInfo?.label}
                />
            )}

            {/* Cairn Unlock Notification - Shows when player discovers a cairn */}
            <CairnUnlockNotification
                notification={cairnNotification}
                onDismiss={dismissCairnNotification}
            />

            {/* Unified Uplink Notifications - Level up, Achievement, Mission complete */}
            {/* Renders in same position as DayNightCycleTracker for diegetic feel */}
            <UplinkNotifications
                levelUpNotifications={props.levelUpNotifications || []}
                achievementNotifications={props.achievementUnlockNotifications || []}
                achievementDefinitions={props.achievementDefinitions}
                questCompletionNotification={questCompletionNotification}
                onDismissQuestCompletion={dismissQuestCompletionNotification}
                onOpenAchievements={props.onOpenAchievements}
                onOpenQuests={openQuestsPanel}
            />

        </div>
    );
};

export default GameScreen; 