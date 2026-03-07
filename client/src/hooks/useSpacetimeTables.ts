/**
 * useSpacetimeTables - Central SpacetimeDB subscription and state management hook
 *
 * This hook is the single source of truth for all game entity data from SpacetimeDB.
 * It manages two subscription strategies:
 *
 * 1. NON-SPATIAL: Global subscriptions for tables that are small or not viewport-dependent
 *    (players, inventory, world state, recipes, etc.). Subscribed once on connect.
 *
 * 2. SPATIAL: Chunk-based subscriptions for entities that exist in the world grid
 *    (trees, stones, campfires, wild animals, etc.). Subscribed only for chunks
 *    within the viewport + buffer. Uses hysteresis (delayed unsub) to prevent
 *    rapid re-subscribe cycles when crossing chunk boundaries.
 *
 * Performance optimizations:
 * - Batched subscriptions: Multiple tables per chunk combined into single queries
 * - Throttled updates: Player position, wild animals, projectiles use refs + batched
 *   React updates to avoid re-renders on every server tick
 * - Microtask batching: Tree/stone/campfire inserts coalesced via queueMicrotask
 * - Progressive loading: Chunk subscriptions spread across frames to avoid lag spikes
 */

import { useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import * as SpacetimeDB from '../generated/types';
import {
    RangedWeaponStats as SpacetimeDBRangedWeaponStats,
    Projectile as SpacetimeDBProjectile,
} from '../generated/types';
import { DbConnection} from '../generated';
import { Identity } from 'spacetimedb';
import { gameConfig } from '../config/gameConfig';
import { triggerExplosionEffect } from '../utils/renderers/explosiveRenderingUtils';
import { triggerAnimalCorpseDestructionEffect } from '../utils/renderers/animalCorpseRenderingUtils';
import { triggerBarrelDestructionEffect } from '../utils/renderers/barrelRenderingUtils';
import { runtimeEngine } from '../engine/runtimeEngine';
import { useEngineWorldTableState } from '../engine/react/useEngineStoreState';
import { gameplaySubscriptionsRuntime } from '../engine/runtime/gameplaySubscriptionsRuntime';
import {
    setupGameplayConnection,
    type GameplayTableBindings,
} from '../engine/adapters/spacetime/gameplayConnectionSetup';
import { composeGameplayTableBindings } from '../engine/adapters/spacetime/gameplayTableBindings';
import { recordProjectileDebugEvent } from '../utils/projectileDebug';
import {
    getDefaultEnvironmentalQueries,
    getDefaultSpatialResourceTables,
    subscribeChunkBatches,
    subscribeChunkIndividually,
    subscribeGrassChunk,
} from '../engine/adapters/spacetime/spatialSubscriptions';

// ─── Spatial chunk-subscription strategy ─────────────────────────────────────
// - Batch and throttle chunk subscriptions to avoid bursty update spikes.
// - Keep configuration centralized below for easier tuning.
// - Performance logging can be enabled temporarily when investigating issues.

// Spatial subscription control flags.
const DISABLE_ALL_SPATIAL_SUBSCRIPTIONS = false; // Master switch for spatial subscriptions.
const ENABLE_CLOUDS = true; // Controls cloud spatial subscriptions
// ENABLE_GRASS is now controlled by the grassEnabled prop passed to the hook

// Performance tuning flags.
const GRASS_PERFORMANCE_MODE = true; // If enabled, only subscribe to healthy grass (reduces update volume)

// Batched subscription optimization.
const ENABLE_BATCHED_SUBSCRIPTIONS = true; // Combines similar tables into batched queries for massive performance gains

// Session-level flag to prevent duplicate event dispatches
// (Multiple hostile NPCs spawning can trigger events before localStorage updates)
let hasDispatchedHostileEncounterEvent = false;

// Toggle ENABLE_BATCHED_SUBSCRIPTIONS to compare:
// - true:  ~3 batched calls per chunk (recommended for production)
// - false: ~12 individual calls per chunk (legacy approach, for debugging only)

// Define the shape of the state returned by the hook
export interface SpacetimeTableStates {
    players: Map<string, SpacetimeDB.Player>;
    trees: Map<string, SpacetimeDB.Tree>;
    stones: Map<string, SpacetimeDB.Stone>;
    runeStones: Map<string, SpacetimeDB.RuneStone>;
    cairns: Map<string, SpacetimeDB.Cairn>;
    playerDiscoveredCairns: Map<string, SpacetimeDB.PlayerDiscoveredCairn>;
    campfires: Map<string, SpacetimeDB.Campfire>;
    furnaces: Map<string, SpacetimeDB.Furnace>;
    barbecues: Map<string, SpacetimeDB.Barbecue>;
    lanterns: Map<string, SpacetimeDB.Lantern>;
    turrets: Map<string, SpacetimeDB.Turret>;
    homesteadHearths: Map<string, SpacetimeDB.HomesteadHearth>;
    brothPots: Map<string, SpacetimeDB.BrothPot>;
    harvestableResources: Map<string, SpacetimeDB.HarvestableResource>;
    itemDefinitions: Map<string, SpacetimeDB.ItemDefinition>;
    inventoryItems: Map<string, SpacetimeDB.InventoryItem>;
    worldState: SpacetimeDB.WorldState | null;
    activeEquipments: Map<string, SpacetimeDB.ActiveEquipment>;
    droppedItems: Map<string, SpacetimeDB.DroppedItem>;
    woodenStorageBoxes: Map<string, SpacetimeDB.WoodenStorageBox>;
    stashes: Map<string, SpacetimeDB.Stash>;
    rainCollectors: Map<string, SpacetimeDB.RainCollector>;
    waterPatches: Map<string, SpacetimeDB.WaterPatch>;
    fertilizerPatches: Map<string, SpacetimeDB.FertilizerPatch>;
    firePatches: Map<string, SpacetimeDB.FirePatch>;
    placedExplosives: Map<string, SpacetimeDB.PlacedExplosive>; // Placed explosive entities (bombs)
    hotSprings: Map<string, any>; // HotSpring - placeholder (hot springs are tile-based, not entities)
    recipes: Map<string, SpacetimeDB.Recipe>;
    craftingQueueItems: Map<string, SpacetimeDB.CraftingQueueItem>;
    messages: Map<string, SpacetimeDB.Message>;
    playerPins: Map<string, SpacetimeDB.PlayerPin>;
    activeConnections: Map<string, SpacetimeDB.ActiveConnection>;
    sleepingBags: Map<string, SpacetimeDB.SleepingBag>;
    playerCorpses: Map<string, SpacetimeDB.PlayerCorpse>;
    activeConsumableEffects: Map<string, SpacetimeDB.ActiveConsumableEffect>;
    localPlayerRegistered: boolean;
    clouds: Map<string, SpacetimeDB.Cloud>;
    grass: Map<string, SpacetimeDB.Grass>;
    grassState: Map<string, SpacetimeDB.GrassState>; // Split tables: GrassState has is_alive/respawn data
    knockedOutStatus: Map<string, SpacetimeDB.KnockedOutStatus>;
    rangedWeaponStats: Map<string, SpacetimeDBRangedWeaponStats>;
    projectiles: Map<string, SpacetimeDBProjectile>;
    deathMarkers: Map<string, SpacetimeDB.DeathMarker>;
    shelters: Map<string, SpacetimeDB.Shelter>;
    minimapCache: SpacetimeDB.MinimapCache | null;
    playerDodgeRollStates: Map<string, SpacetimeDB.PlayerDodgeRollState>;
    fishingSessions: Map<string, SpacetimeDB.FishingSession>;
    plantedSeeds: Map<string, SpacetimeDB.PlantedSeed>;
    soundEvents: Map<string, SpacetimeDB.SoundEvent>;
    continuousSounds: Map<string, SpacetimeDB.ContinuousSound>;
    localPlayerIdentity: Identity | null;
    playerDrinkingCooldowns: Map<string, SpacetimeDB.PlayerDrinkingCooldown>;
    wildAnimals: Map<string, SpacetimeDB.WildAnimal>;
    // Note: Hostile NPCs (Shorebound, Shardkin, DrownedWatch) are now part of WildAnimal with is_hostile_npc = true
    hostileDeathEvents: Array<{ id: string, x: number, y: number, species: string, timestamp: number }>; // Client-side death events for particle effects
    animalCorpses: Map<string, SpacetimeDB.AnimalCorpse>;
    barrels: Map<string, SpacetimeDB.Barrel>;
    roadLampposts: Map<string, SpacetimeDB.RoadLamppost>;
    seaStacks: Map<string, SpacetimeDB.SeaStack>;
    fumaroles: Map<string, SpacetimeDB.Fumarole>;
    basaltColumns: Map<string, SpacetimeDB.BasaltColumn>;
    foundationCells: Map<string, SpacetimeDB.FoundationCell>;
    wallCells: Map<string, SpacetimeDB.WallCell>;
    doors: Map<string, SpacetimeDB.Door>;
    fences: Map<string, SpacetimeDB.Fence>;
    chunkWeather: Map<string, any>; // Chunk-based weather (types generated at build-time).
    alkStations: Map<string, SpacetimeDB.AlkStation>;
    alkContracts: Map<string, SpacetimeDB.AlkContract>;
    alkPlayerContracts: Map<string, SpacetimeDB.AlkPlayerContract>;
    alkState: SpacetimeDB.AlkState | null;
    playerShardBalance: Map<string, SpacetimeDB.PlayerShardBalance>;
    memoryGridProgress: Map<string, SpacetimeDB.MemoryGridProgress>;
    monumentParts: Map<string, any>;
    largeQuarries: Map<string, any>;
    // Coral system tables
    livingCorals: Map<string, SpacetimeDB.LivingCoral>; // Living coral for underwater harvesting (combat system).
    // Matronage system tables
    matronages: Map<string, any>;
    matronageMembers: Map<string, any>;
    matronageInvitations: Map<string, any>;
    matronageOwedShards: Map<string, any>;
    // Player progression system tables
    playerStats: Map<string, SpacetimeDB.PlayerStats>;
    achievementDefinitions: Map<string, SpacetimeDB.AchievementDefinition>;
    playerAchievements: Map<string, SpacetimeDB.PlayerAchievement>;
    achievementUnlockNotifications: Map<string, SpacetimeDB.AchievementUnlockNotification>;
    levelUpNotifications: Map<string, SpacetimeDB.LevelUpNotification>;
    dailyLoginNotifications: Map<string, SpacetimeDB.DailyLoginNotification>;
    progressNotifications: Map<string, SpacetimeDB.ProgressNotification>;
    comparativeStatNotifications: Map<string, SpacetimeDB.ComparativeStatNotification>;
    leaderboardEntries: Map<string, SpacetimeDB.LeaderboardEntry>;
    dailyLoginRewards: Map<string, SpacetimeDB.DailyLoginReward>;
    plantConfigDefinitions: Map<string, SpacetimeDB.PlantConfigDefinition>;
    discoveredPlants: Map<string, SpacetimeDB.PlayerDiscoveredPlant>;
    // Quest system tables
    tutorialQuestDefinitions: Map<string, SpacetimeDB.TutorialQuestDefinition>;
    dailyQuestDefinitions: Map<string, SpacetimeDB.DailyQuestDefinition>;
    playerTutorialProgress: Map<string, SpacetimeDB.PlayerTutorialProgress>;
    playerDailyQuests: Map<string, SpacetimeDB.PlayerDailyQuest>;
    questCompletionNotifications: Map<string, SpacetimeDB.QuestCompletionNotification>;
    questProgressNotifications: Map<string, SpacetimeDB.QuestProgressNotification>;
    sovaQuestMessages: Map<string, SpacetimeDB.SovaQuestMessage>;
    beaconDropEvents: Map<string, SpacetimeDB.BeaconDropEvent>; // Memory Beacon server events (airdrop-style).
    droneEvents: Map<string, SpacetimeDB.DroneEvent>; // Sky drone events (periodic flyover).
    // Animal breeding system data
    caribouBreedingData: Map<string, SpacetimeDB.CaribouBreedingData>;
    walrusBreedingData: Map<string, SpacetimeDB.WalrusBreedingData>;
    // Animal rut state (breeding season) - global state
    caribouRutState: SpacetimeDB.CaribouRutState | null;
    walrusRutState: SpacetimeDB.WalrusRutState | null;
}

// Define the props the hook accepts
interface UseSpacetimeTablesProps {
    connection: DbConnection | null;
    cancelPlacement: () => void; // Function to cancel placement mode
    viewport: { minX: number; minY: number; maxX: number; maxY: number } | null; // New viewport prop
    grassEnabled?: boolean; // Toggle for grass subscriptions (defaults to true)
}

// Helper type for subscription handles (adjust if SDK provides a specific type)
type SubscriptionHandle = { unsubscribe: () => void } | null;

export const useSpacetimeTables = ({
    connection,
    cancelPlacement,
    viewport, // Get viewport from props
    grassEnabled = true, // Default to enabled if not provided
}: UseSpacetimeTablesProps): SpacetimeTableStates => {

    // ─── Entity State (Map<id, entity>) ─────────────────────────────────────
    // Each table is stored as a Map for O(1) lookup. Keys are string IDs (bigint.toString()).
    const [players, setPlayers] = useEngineWorldTableState<Map<string, SpacetimeDB.Player>>('players', () => new Map());
    const [trees, setTrees] = useEngineWorldTableState<Map<string, SpacetimeDB.Tree>>('trees', () => new Map());
    const [stones, setStones] = useEngineWorldTableState<Map<string, SpacetimeDB.Stone>>('stones', () => new Map());
    const [runeStones, setRuneStones] = useEngineWorldTableState<Map<string, SpacetimeDB.RuneStone>>('runeStones', () => new Map());
    const [cairns, setCairns] = useEngineWorldTableState<Map<string, SpacetimeDB.Cairn>>('cairns', () => new Map());
    const [playerDiscoveredCairns, setPlayerDiscoveredCairns] = useEngineWorldTableState<Map<string, SpacetimeDB.PlayerDiscoveredCairn>>('playerDiscoveredCairns', () => new Map());
    const [campfires, setCampfires] = useEngineWorldTableState<Map<string, SpacetimeDB.Campfire>>('campfires', () => new Map());
    const [furnaces, setFurnaces] = useEngineWorldTableState<Map<string, SpacetimeDB.Furnace>>('furnaces', () => new Map());
    const [barbecues, setBarbecues] = useEngineWorldTableState<Map<string, SpacetimeDB.Barbecue>>('barbecues', () => new Map());
    const [lanterns, setLanterns] = useEngineWorldTableState<Map<string, SpacetimeDB.Lantern>>('lanterns', () => new Map());
    const [turrets, setTurrets] = useEngineWorldTableState<Map<string, SpacetimeDB.Turret>>('turrets', () => new Map());
    const [homesteadHearths, setHomesteadHearths] = useEngineWorldTableState<Map<string, SpacetimeDB.HomesteadHearth>>('homesteadHearths', () => new Map());
    const [brothPots, setBrothPots] = useEngineWorldTableState<Map<string, SpacetimeDB.BrothPot>>('brothPots', () => new Map());
    const [harvestableResources, setHarvestableResources] = useEngineWorldTableState<Map<string, SpacetimeDB.HarvestableResource>>('harvestableResources', () => new Map());
    const [plantedSeeds, setPlantedSeeds] = useEngineWorldTableState<Map<string, SpacetimeDB.PlantedSeed>>('plantedSeeds', () => new Map());
    const [itemDefinitions, setItemDefinitions] = useEngineWorldTableState<Map<string, SpacetimeDB.ItemDefinition>>('itemDefinitions', () => new Map());
    const [inventoryItems, setInventoryItems] = useEngineWorldTableState<Map<string, SpacetimeDB.InventoryItem>>('inventoryItems', () => new Map());
    const [worldState, setWorldState] = useEngineWorldTableState<SpacetimeDB.WorldState | null>('worldState', () => null);
    const [activeEquipments, setActiveEquipments] = useEngineWorldTableState<Map<string, SpacetimeDB.ActiveEquipment>>('activeEquipments', () => new Map());
    const [droppedItems, setDroppedItems] = useEngineWorldTableState<Map<string, SpacetimeDB.DroppedItem>>('droppedItems', () => new Map());
    const [woodenStorageBoxes, setWoodenStorageBoxes] = useEngineWorldTableState<Map<string, SpacetimeDB.WoodenStorageBox>>('woodenStorageBoxes', () => new Map());
    const [recipes, setRecipes] = useEngineWorldTableState<Map<string, SpacetimeDB.Recipe>>('recipes', () => new Map());
    const [craftingQueueItems, setCraftingQueueItems] = useEngineWorldTableState<Map<string, SpacetimeDB.CraftingQueueItem>>('craftingQueueItems', () => new Map());
    const [messages, setMessages] = useEngineWorldTableState<Map<string, SpacetimeDB.Message>>('messages', () => new Map());
    const [localPlayerRegistered, setLocalPlayerRegistered] = useEngineWorldTableState<boolean>('localPlayerRegistered', () => false);
    const [playerPins, setPlayerPins] = useEngineWorldTableState<Map<string, SpacetimeDB.PlayerPin>>('playerPins', () => new Map());
    const [activeConnections, setActiveConnections] = useEngineWorldTableState<Map<string, SpacetimeDB.ActiveConnection>>('activeConnections', () => new Map());
    const [sleepingBags, setSleepingBags] = useEngineWorldTableState<Map<string, SpacetimeDB.SleepingBag>>('sleepingBags', () => new Map());
    const [playerCorpses, setPlayerCorpses] = useEngineWorldTableState<Map<string, SpacetimeDB.PlayerCorpse>>('playerCorpses', () => new Map());
    const [stashes, setStashes] = useEngineWorldTableState<Map<string, SpacetimeDB.Stash>>('stashes', () => new Map());
    const [rainCollectors, setRainCollectors] = useEngineWorldTableState<Map<string, SpacetimeDB.RainCollector>>('rainCollectors', () => new Map());
    const [waterPatches, setWaterPatches] = useEngineWorldTableState<Map<string, SpacetimeDB.WaterPatch>>('waterPatches', () => new Map());
    const [fertilizerPatches, setFertilizerPatches] = useEngineWorldTableState<Map<string, SpacetimeDB.FertilizerPatch>>('fertilizerPatches', () => new Map());
    const [firePatches, setFirePatches] = useEngineWorldTableState<Map<string, SpacetimeDB.FirePatch>>('firePatches', () => new Map());
    const [placedExplosives, setPlacedExplosives] = useEngineWorldTableState<Map<string, SpacetimeDB.PlacedExplosive>>('placedExplosives', () => new Map());
    const [hotSprings, setHotSprings] = useEngineWorldTableState<Map<string, any>>('hotSprings', () => new Map());
    const [activeConsumableEffects, setActiveConsumableEffects] = useEngineWorldTableState<Map<string, SpacetimeDB.ActiveConsumableEffect>>('activeConsumableEffects', () => new Map());
    const [clouds, setClouds] = useEngineWorldTableState<Map<string, SpacetimeDB.Cloud>>('clouds', () => new Map());
    const [droneEvents, setDroneEvents] = useEngineWorldTableState<Map<string, SpacetimeDB.DroneEvent>>('droneEvents', () => new Map());
    const [grass, setGrass] = useEngineWorldTableState<Map<string, SpacetimeDB.Grass>>('grass', () => new Map());
    const [grassState, setGrassState] = useEngineWorldTableState<Map<string, SpacetimeDB.GrassState>>('grassState', () => new Map());
    const [knockedOutStatus, setKnockedOutStatus] = useEngineWorldTableState<Map<string, SpacetimeDB.KnockedOutStatus>>('knockedOutStatus', () => new Map());
    const [rangedWeaponStats, setRangedWeaponStats] = useEngineWorldTableState<Map<string, SpacetimeDBRangedWeaponStats>>('rangedWeaponStats', () => new Map());
    const [projectiles, setProjectiles] = useEngineWorldTableState<Map<string, SpacetimeDBProjectile>>('projectiles', () => new Map());
    const [deathMarkers, setDeathMarkers] = useEngineWorldTableState<Map<string, SpacetimeDB.DeathMarker>>('deathMarkers', () => new Map());
    const [shelters, setShelters] = useEngineWorldTableState<Map<string, SpacetimeDB.Shelter>>('shelters', () => new Map());
    const [minimapCache, setMinimapCache] = useEngineWorldTableState<SpacetimeDB.MinimapCache | null>('minimapCache', () => null);
    const [playerDodgeRollStates, setPlayerDodgeRollStates] = useEngineWorldTableState<Map<string, SpacetimeDB.PlayerDodgeRollState>>('playerDodgeRollStates', () => new Map());
    const [fishingSessions, setFishingSessions] = useEngineWorldTableState<Map<string, SpacetimeDB.FishingSession>>('fishingSessions', () => new Map());
    const [soundEvents, setSoundEvents] = useEngineWorldTableState<Map<string, SpacetimeDB.SoundEvent>>('soundEvents', () => new Map());
    const [continuousSounds, setContinuousSounds] = useEngineWorldTableState<Map<string, SpacetimeDB.ContinuousSound>>('continuousSounds', () => new Map());
    const [playerDrinkingCooldowns, setPlayerDrinkingCooldowns] = useEngineWorldTableState<Map<string, SpacetimeDB.PlayerDrinkingCooldown>>('playerDrinkingCooldowns', () => new Map());
    const [wildAnimals, setWildAnimals] = useEngineWorldTableState<Map<string, SpacetimeDB.WildAnimal>>('wildAnimals', () => new Map());
    // Note: Hostile NPCs (Shorebound, Shardkin, DrownedWatch) are now part of WildAnimal table with is_hostile_npc = true
    // Track hostile death events for client-side particle effects (no server subscription needed)
    const [hostileDeathEvents, setHostileDeathEvents] = useEngineWorldTableState<Array<{ id: string, x: number, y: number, species: string, timestamp: number }>>('hostileDeathEvents', () => []);
    const [animalCorpses, setAnimalCorpses] = useEngineWorldTableState<Map<string, SpacetimeDB.AnimalCorpse>>('animalCorpses', () => new Map());
    const [barrels, setBarrels] = useEngineWorldTableState<Map<string, SpacetimeDB.Barrel>>('barrels', () => new Map());
    const [roadLampposts, setRoadLampposts] = useEngineWorldTableState<Map<string, SpacetimeDB.RoadLamppost>>('roadLampposts', () => new Map());
    const [seaStacks, setSeaStacks] = useEngineWorldTableState<Map<string, SpacetimeDB.SeaStack>>('seaStacks', () => new Map());
    const [fumaroles, setFumaroles] = useEngineWorldTableState<Map<string, SpacetimeDB.Fumarole>>('fumaroles', () => new Map());
    const [basaltColumns, setBasaltColumns] = useEngineWorldTableState<Map<string, SpacetimeDB.BasaltColumn>>('basaltColumns', () => new Map());
    const [livingCorals, setLivingCorals] = useEngineWorldTableState<Map<string, SpacetimeDB.LivingCoral>>('livingCorals', () => new Map());
    const [foundationCells, setFoundationCells] = useEngineWorldTableState<Map<string, SpacetimeDB.FoundationCell>>('foundationCells', () => new Map());
    const [wallCells, setWallCells] = useEngineWorldTableState<Map<string, SpacetimeDB.WallCell>>('wallCells', () => new Map());
    const [doors, setDoors] = useEngineWorldTableState<Map<string, SpacetimeDB.Door>>('doors', () => new Map());
    const [fences, setFences] = useEngineWorldTableState<Map<string, SpacetimeDB.Fence>>('fences', () => new Map());
    const [chunkWeather, setChunkWeather] = useEngineWorldTableState<Map<string, any>>('chunkWeather', () => new Map());
    const [alkStations, setAlkStations] = useEngineWorldTableState<Map<string, SpacetimeDB.AlkStation>>('alkStations', () => new Map());
    const [alkContracts, setAlkContracts] = useEngineWorldTableState<Map<string, SpacetimeDB.AlkContract>>('alkContracts', () => new Map());
    const [alkPlayerContracts, setAlkPlayerContracts] = useEngineWorldTableState<Map<string, SpacetimeDB.AlkPlayerContract>>('alkPlayerContracts', () => new Map());
    const [alkState, setAlkState] = useEngineWorldTableState<SpacetimeDB.AlkState | null>('alkState', () => null);
    const [playerShardBalance, setPlayerShardBalance] = useEngineWorldTableState<Map<string, SpacetimeDB.PlayerShardBalance>>('playerShardBalance', () => new Map());
    const [memoryGridProgress, setMemoryGridProgress] = useEngineWorldTableState<Map<string, SpacetimeDB.MemoryGridProgress>>('memoryGridProgress', () => new Map());
    const [monumentParts, setMonumentParts] = useEngineWorldTableState<Map<string, any>>('monumentParts', () => new Map());
    const [largeQuarries, setLargeQuarries] = useEngineWorldTableState<Map<string, any>>('largeQuarries', () => new Map());
    const [matronages, setMatronages] = useEngineWorldTableState<Map<string, any>>('matronages', () => new Map());
    const [matronageMembers, setMatronageMembers] = useEngineWorldTableState<Map<string, any>>('matronageMembers', () => new Map());
    const [matronageInvitations, setMatronageInvitations] = useEngineWorldTableState<Map<string, any>>('matronageInvitations', () => new Map());
    const [matronageOwedShards, setMatronageOwedShards] = useEngineWorldTableState<Map<string, any>>('matronageOwedShards', () => new Map());
    const [playerStats, setPlayerStats] = useEngineWorldTableState<Map<string, SpacetimeDB.PlayerStats>>('playerStats', () => new Map());
    const [achievementDefinitions, setAchievementDefinitions] = useEngineWorldTableState<Map<string, SpacetimeDB.AchievementDefinition>>('achievementDefinitions', () => new Map());
    const [playerAchievements, setPlayerAchievements] = useEngineWorldTableState<Map<string, SpacetimeDB.PlayerAchievement>>('playerAchievements', () => new Map());
    const [achievementUnlockNotifications, setAchievementUnlockNotifications] = useEngineWorldTableState<Map<string, SpacetimeDB.AchievementUnlockNotification>>('achievementUnlockNotifications', () => new Map());
    const [levelUpNotifications, setLevelUpNotifications] = useEngineWorldTableState<Map<string, SpacetimeDB.LevelUpNotification>>('levelUpNotifications', () => new Map());
    const [dailyLoginNotifications, setDailyLoginNotifications] = useEngineWorldTableState<Map<string, SpacetimeDB.DailyLoginNotification>>('dailyLoginNotifications', () => new Map());
    const [progressNotifications, setProgressNotifications] = useEngineWorldTableState<Map<string, SpacetimeDB.ProgressNotification>>('progressNotifications', () => new Map());
    const [comparativeStatNotifications, setComparativeStatNotifications] = useEngineWorldTableState<Map<string, SpacetimeDB.ComparativeStatNotification>>('comparativeStatNotifications', () => new Map());
    const [leaderboardEntries, setLeaderboardEntries] = useEngineWorldTableState<Map<string, SpacetimeDB.LeaderboardEntry>>('leaderboardEntries', () => new Map());
    const [dailyLoginRewards, setDailyLoginRewards] = useEngineWorldTableState<Map<string, SpacetimeDB.DailyLoginReward>>('dailyLoginRewards', () => new Map());
    const [plantConfigDefinitions, setPlantConfigDefinitions] = useEngineWorldTableState<Map<string, SpacetimeDB.PlantConfigDefinition>>('plantConfigDefinitions', () => new Map());
    const [discoveredPlants, setDiscoveredPlants] = useEngineWorldTableState<Map<string, SpacetimeDB.PlayerDiscoveredPlant>>('discoveredPlants', () => new Map());
    const [tutorialQuestDefinitions, setTutorialQuestDefinitions] = useEngineWorldTableState<Map<string, SpacetimeDB.TutorialQuestDefinition>>('tutorialQuestDefinitions', () => new Map());
    const [dailyQuestDefinitions, setDailyQuestDefinitions] = useEngineWorldTableState<Map<string, SpacetimeDB.DailyQuestDefinition>>('dailyQuestDefinitions', () => new Map());
    const [playerTutorialProgress, setPlayerTutorialProgress] = useEngineWorldTableState<Map<string, SpacetimeDB.PlayerTutorialProgress>>('playerTutorialProgress', () => new Map());
    const [playerDailyQuests, setPlayerDailyQuests] = useEngineWorldTableState<Map<string, SpacetimeDB.PlayerDailyQuest>>('playerDailyQuests', () => new Map());
    const [questCompletionNotifications, setQuestCompletionNotifications] = useEngineWorldTableState<Map<string, SpacetimeDB.QuestCompletionNotification>>('questCompletionNotifications', () => new Map());
    const [questProgressNotifications, setQuestProgressNotifications] = useEngineWorldTableState<Map<string, SpacetimeDB.QuestProgressNotification>>('questProgressNotifications', () => new Map());
    const [sovaQuestMessages, setSovaQuestMessages] = useEngineWorldTableState<Map<string, SpacetimeDB.SovaQuestMessage>>('sovaQuestMessages', () => new Map());
    const [beaconDropEvents, setBeaconDropEvents] = useEngineWorldTableState<Map<string, SpacetimeDB.BeaconDropEvent>>('beaconDropEvents', () => new Map());
    const [caribouBreedingData, setCaribouBreedingData] = useEngineWorldTableState<Map<string, SpacetimeDB.CaribouBreedingData>>('caribouBreedingData', () => new Map());
    const [walrusBreedingData, setWalrusBreedingData] = useEngineWorldTableState<Map<string, SpacetimeDB.WalrusBreedingData>>('walrusBreedingData', () => new Map());
    const [caribouRutState, setCaribouRutState] = useEngineWorldTableState<SpacetimeDB.CaribouRutState | null>('caribouRutState', () => null);
    const [walrusRutState, setWalrusRutState] = useEngineWorldTableState<SpacetimeDB.WalrusRutState | null>('walrusRutState', () => null);

    // ─── Performance Refs (avoid re-renders on high-frequency updates) ───────
    const chunkWeatherRef = useRef<Map<string, any>>(new Map());
    const chunkWeatherUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Batched wild animal updates (AI ticks 8x/sec) - keep responsive while still
    // limiting React churn when many animals are active.
    const wildAnimalsRef = useRef<Map<string, SpacetimeDB.WildAnimal>>(new Map());
    const wildAnimalsUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const WILD_ANIMAL_BATCH_INTERVAL_MS = 50; // Flush at 20fps for lower perceived movement latency

    // Batched projectile updates (high frequency during combat)
    const projectilesRef = useRef<Map<string, SpacetimeDBProjectile>>(new Map());
    const projectilesUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const PROJECTILE_BATCH_INTERVAL_MS = 50; // Flush at 20fps - needs to be responsive for combat

    // Phase 5: Batched harvestable resource updates (bursts during mass harvesting)
    const harvestableResourceBatchRef = useRef<Array<{ op: 'set'; id: string; resource: SpacetimeDB.HarvestableResource } | { op: 'delete'; id: string }>>([]);
    const harvestableResourceFlushScheduledRef = useRef(false);

    // Phase 5: Batched dropped item updates (bursts when dropping/picking many items)
    const droppedItemBatchRef = useRef<Array<{ op: 'set'; id: string; item: SpacetimeDB.DroppedItem } | { op: 'delete'; id: string }>>([]);
    const droppedItemFlushScheduledRef = useRef(false);

    // Hostile death cleanup timeouts (cleared on unmount to prevent memory leak)
    const hostileDeathCleanupTimeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
    const HOSTILE_DEATH_EVENTS_MAX = 30; // Cap to prevent unbounded growth during mass encounters

    // Get local player identity for sound system
    const localPlayerIdentity = connection?.identity || null;

    // Ref to hold the cancelPlacement function
    const cancelPlacementRef = useRef(cancelPlacement);
    useEffect(() => { cancelPlacementRef.current = cancelPlacement; }, [cancelPlacement]);

    const playerDodgeRollStatesRef = useRef<Map<string, SpacetimeDB.PlayerDodgeRollState>>(new Map());
    const playersRef = useRef<Map<string, SpacetimeDB.Player>>(new Map());
    // PERF FIX: Use a global render timestamp instead of per-player.
    // With N players sending interleaved updates, a single shared timestamp
    // effectively batches all position-only updates into one React render per throttle window.
    const lastPlayerRenderTimeRef = useRef<number>(0);
    const playerRenderPendingRef = useRef<boolean>(false);
    const playerRenderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Phase 4a: queueMicrotask batching for entity inserts (collapses N Map copies into 1 per microtask)
    const treeBatchRef = useRef<SpacetimeDB.Tree[]>([]);
    const treeFlushScheduledRef = useRef(false);
    const stoneBatchRef = useRef<SpacetimeDB.Stone[]>([]);
    const stoneFlushScheduledRef = useRef(false);
    const campfireBatchRef = useRef<SpacetimeDB.Campfire[]>([]);
    const campfireFlushScheduledRef = useRef(false);

    // 🧪 CHUNK SIZE PERFORMANCE TESTING: Track metrics for different chunk sizes
    const chunkPerformanceMetricsRef = useRef<{
        totalChunkCrossings: number;
        totalSubscriptionTime: number;
        totalSubscriptionsCreated: number;
        chunkCrossingTimes: number[];
        subscriptionCreationTimes: number[];
        chunksVisibleHistory: number[];
        lastMetricsLog: number;
    }>({
        totalChunkCrossings: 0,
        totalSubscriptionTime: 0,
        totalSubscriptionsCreated: 0,
        chunkCrossingTimes: [],
        subscriptionCreationTimes: [],
        chunksVisibleHistory: [],
        lastMetricsLog: performance.now()
    });

    // Keep chunk perf instrumentation off during normal gameplay.
    const ENABLE_CHUNK_PERFORMANCE_LOGGING = false;
    const CHUNK_METRICS_LOG_INTERVAL_MS = 10000; // Log metrics every 10 seconds

    // Helper function for safely unsubscribing
    const safeUnsubscribe = (sub: SubscriptionHandle) => {
        if (sub) {
            try {
                sub.unsubscribe();
            } catch (e) {
                // console.warn('[useSpacetimeTables] Error unsubscribing:', e);
            }
        }
    };

    const subscribeToChunk = (chunkIndex: number): SubscriptionHandle[] => {
        if (!connection) return [];

        const subscriptionStartTime = ENABLE_CHUNK_PERFORMANCE_LOGGING ? performance.now() : 0;
        const newHandlesForChunk: SubscriptionHandle[] = [];
        try {
            if (ENABLE_BATCHED_SUBSCRIPTIONS) {
                const resourceTables = getDefaultSpatialResourceTables();
                const environmentalQueries = getDefaultEnvironmentalQueries(chunkIndex, {
                    cloudsEnabled: ENABLE_CLOUDS,
                    grassEnabled,
                    grassPerformanceMode: GRASS_PERFORMANCE_MODE,
                });
                newHandlesForChunk.push(
                    ...subscribeChunkBatches(connection, chunkIndex, resourceTables, environmentalQueries),
                );
            } else {
                const resourceTables = getDefaultSpatialResourceTables();
                const environmentalQueries = getDefaultEnvironmentalQueries(chunkIndex, {
                    cloudsEnabled: ENABLE_CLOUDS,
                    grassEnabled,
                    grassPerformanceMode: GRASS_PERFORMANCE_MODE,
                });
                newHandlesForChunk.push(
                    ...subscribeChunkIndividually(connection, chunkIndex, resourceTables, environmentalQueries),
                );
            }
        } catch (error) {
            console.error(`[CHUNK_ERROR] Failed to create subscriptions for chunk ${chunkIndex}:`, error);
            // Clean up any partial subscriptions
            newHandlesForChunk.forEach(safeUnsubscribe);
            return [];
        }

        // 🧪 PERFORMANCE TRACKING: Log subscription creation time
        if (ENABLE_CHUNK_PERFORMANCE_LOGGING && subscriptionStartTime > 0) {
            const subscriptionTime = performance.now() - subscriptionStartTime;
            const metrics = chunkPerformanceMetricsRef.current;
            metrics.totalSubscriptionTime += subscriptionTime;
            metrics.totalSubscriptionsCreated += newHandlesForChunk.length;
            metrics.subscriptionCreationTimes.push(subscriptionTime);

            // Keep only last 100 measurements to avoid memory bloat
            if (metrics.subscriptionCreationTimes.length > 100) {
                metrics.subscriptionCreationTimes.shift();
            }
        }

        return newHandlesForChunk;
    };

    const ensureConnectionSetup = () => {
        // Callback registration and initial non-spatial subscriptions (once per connection)
        if (connection && !gameplaySubscriptionsRuntime.isConnectionSetupComplete()) {
            console.log("[useSpacetimeTables] ENTERING gameplay subscription runtime connection setup.");

            // Define table callbacks (insert/update/delete handlers that update React state)
            const upsertMapState = <T,>(setter: Dispatch<SetStateAction<Map<string, T>>>, key: string, value: T) => {
                setter(prev => {
                    if (prev.get(key) === value) return prev;
                    const next = new Map(prev);
                    next.set(key, value);
                    return next;
                });
            };

            // --- Player Subscriptions ---
            const handlePlayerInsert = (ctx: any, player: SpacetimeDB.Player) => {
                // Update Ref immediately
                playersRef.current.set(player.identity.toHexString(), player);

                // Always trigger render for insertions
                setPlayers(new Map(playersRef.current));

                // Determine local player registration status within the callback
                const localPlayerIdHex = connection?.identity?.toHexString();
                if (localPlayerIdHex && player.identity.toHexString() === localPlayerIdHex) {
                    console.log('[useSpacetimeTables] Local player matched! Setting localPlayerRegistered = true.');
                    setLocalPlayerRegistered(true);
                }
            };
            const handlePlayerUpdate = (ctx: any, oldPlayer: SpacetimeDB.Player, newPlayer: SpacetimeDB.Player) => {
                const playerHexId = newPlayer.identity.toHexString();

                // 1. Always update the Source of Truth (Ref) immediately
                // This is O(1) and doesn't trigger React re-renders
                playersRef.current.set(playerHexId, newPlayer);

                // 2. Check for significant changes that require IMMEDIATE React re-render
                const oldLastHitTimeMicros = oldPlayer.lastHitTime ? BigInt(oldPlayer.lastHitTime.__timestamp_micros_since_unix_epoch__) : null;
                const newLastHitTimeMicros = newPlayer.lastHitTime ? BigInt(newPlayer.lastHitTime.__timestamp_micros_since_unix_epoch__) : null;
                const lastHitTimeChanged = oldLastHitTimeMicros !== newLastHitTimeMicros;

                const statsChanged = Math.round(oldPlayer.health) !== Math.round(newPlayer.health) || Math.round(oldPlayer.stamina) !== Math.round(newPlayer.stamina) || Math.round(oldPlayer.hunger) !== Math.round(newPlayer.hunger) || Math.round(oldPlayer.thirst) !== Math.round(newPlayer.thirst) || Math.round(oldPlayer.warmth) !== Math.round(newPlayer.warmth);
                const stateChanged = oldPlayer.isSprinting !== newPlayer.isSprinting || oldPlayer.direction !== newPlayer.direction || oldPlayer.jumpStartTimeMs !== newPlayer.jumpStartTimeMs || oldPlayer.isDead !== newPlayer.isDead || oldPlayer.isTorchLit !== newPlayer.isTorchLit;
                const onlineStatusChanged = oldPlayer.isOnline !== newPlayer.isOnline;
                const usernameChanged = oldPlayer.username !== newPlayer.username;

                const isImmediate = statsChanged || stateChanged || onlineStatusChanged || usernameChanged || lastHitTimeChanged;

                if (isImmediate) {
                    // Non-positional data changed - flush immediately
                    if (playerRenderTimerRef.current) {
                        clearTimeout(playerRenderTimerRef.current);
                        playerRenderTimerRef.current = null;
                    }
                    setPlayers(new Map(playersRef.current));
                    lastPlayerRenderTimeRef.current = performance.now();
                    playerRenderPendingRef.current = false;
                    return;
                }

                // === BATCHED RENDER THROTTLE for position-only updates ===
                // With N players sending interleaved position updates, we batch them
                // into a single React re-render per throttle window (50ms = ~20fps).
                // The Ref always has the latest data, so the render sees ALL accumulated changes.
                const now = performance.now();
                const timeSinceLastRender = now - lastPlayerRenderTimeRef.current;

                if (timeSinceLastRender >= 50) {
                    // Enough time passed - flush now (batches all player position changes)
                    setPlayers(new Map(playersRef.current));
                    lastPlayerRenderTimeRef.current = now;
                    playerRenderPendingRef.current = false;
                    if (playerRenderTimerRef.current) {
                        clearTimeout(playerRenderTimerRef.current);
                        playerRenderTimerRef.current = null;
                    }
                } else if (!playerRenderPendingRef.current) {
                    // Schedule a deferred flush to guarantee we don't miss updates
                    playerRenderPendingRef.current = true;
                    const remainingMs = 50 - timeSinceLastRender;
                    playerRenderTimerRef.current = setTimeout(() => {
                        setPlayers(new Map(playersRef.current));
                        lastPlayerRenderTimeRef.current = performance.now();
                        playerRenderPendingRef.current = false;
                        playerRenderTimerRef.current = null;
                    }, remainingMs);
                }
                // else: timer already scheduled, pending changes will be included in next flush
            };
            const handlePlayerDelete = (ctx: any, deletedPlayer: SpacetimeDB.Player) => {
                // Update Ref
                playersRef.current.delete(deletedPlayer.identity.toHexString());

                // Always render on delete
                setPlayers(new Map(playersRef.current));

                if (connection && connection.identity && deletedPlayer.identity && deletedPlayer.identity.isEqual(connection.identity)) {
                    if (localPlayerRegistered) {
                        console.warn('[useSpacetimeTables] Local player deleted from server.');
                        setLocalPlayerRegistered(false);
                    }
                }
            };

            // --- Tree Subscriptions (Phase 4a: batched inserts) ---
            const handleTreeInsert = (ctx: any, tree: SpacetimeDB.Tree) => {
                treeBatchRef.current.push(tree);
                if (!treeFlushScheduledRef.current) {
                    treeFlushScheduledRef.current = true;
                    queueMicrotask(() => {
                        const batch = treeBatchRef.current;
                        treeBatchRef.current = [];
                        treeFlushScheduledRef.current = false;
                        setTrees(prev => {
                            const next = new Map(prev);
                            for (const t of batch) next.set(t.id.toString(), t);
                            return next;
                        });
                    });
                }
            };
            const handleTreeUpdate = (ctx: any, oldTree: SpacetimeDB.Tree, newTree: SpacetimeDB.Tree) => {
                // Only update for visually significant changes
                // Ignore lastHitTime micro-updates that cause excessive re-renders
                const visuallySignificant =
                    Math.abs(oldTree.posX - newTree.posX) > 0.1 ||  // Position changed significantly
                    Math.abs(oldTree.posY - newTree.posY) > 0.1 ||  // Position changed significantly  
                    Math.abs(oldTree.health - newTree.health) > 0.1 || // Health changed significantly
                    oldTree.treeType !== newTree.treeType ||         // Tree type changed
                    (oldTree.respawnAt?.microsSinceUnixEpoch ?? 0n) !== (newTree.respawnAt?.microsSinceUnixEpoch ?? 0n); // Respawn state changed

                if (visuallySignificant) {
                    setTrees(prev => new Map(prev).set(newTree.id.toString(), newTree));
                }
            };
            const handleTreeDelete = (ctx: any, tree: SpacetimeDB.Tree) => setTrees(prev => { const newMap = new Map(prev); newMap.delete(tree.id.toString()); return newMap; });

            // --- Stone Subscriptions (Phase 4a: batched inserts) ---
            const handleStoneInsert = (ctx: any, stone: SpacetimeDB.Stone) => {
                stoneBatchRef.current.push(stone);
                if (!stoneFlushScheduledRef.current) {
                    stoneFlushScheduledRef.current = true;
                    queueMicrotask(() => {
                        const batch = stoneBatchRef.current;
                        stoneBatchRef.current = [];
                        stoneFlushScheduledRef.current = false;
                        setStones(prev => {
                            const next = new Map(prev);
                            for (const s of batch) next.set(s.id.toString(), s);
                            return next;
                        });
                    });
                }
            };
            const handleStoneUpdate = (ctx: any, oldStone: SpacetimeDB.Stone, newStone: SpacetimeDB.Stone) => {
                // Only update for visually significant changes
                // Ignore lastHitTime micro-updates that cause excessive re-renders
                const visuallySignificant =
                    Math.abs(oldStone.posX - newStone.posX) > 0.1 ||  // Position changed significantly
                    Math.abs(oldStone.posY - newStone.posY) > 0.1 ||  // Position changed significantly
                    Math.abs(oldStone.health - newStone.health) > 0.1 || // Health changed significantly
                    (oldStone.respawnAt?.microsSinceUnixEpoch ?? 0n) !== (newStone.respawnAt?.microsSinceUnixEpoch ?? 0n); // Respawn state changed

                if (visuallySignificant) {
                    setStones(prev => new Map(prev).set(newStone.id.toString(), newStone));
                }
            };
            const handleStoneDelete = (ctx: any, stone: SpacetimeDB.Stone) => setStones(prev => { const newMap = new Map(prev); newMap.delete(stone.id.toString()); return newMap; });

            // --- Rune Stone Subscriptions ---
            const handleRuneStoneInsert = (ctx: any, runeStone: SpacetimeDB.RuneStone) => setRuneStones(prev => new Map(prev).set(runeStone.id.toString(), runeStone));
            const handleRuneStoneUpdate = (ctx: any, oldRuneStone: SpacetimeDB.RuneStone, newRuneStone: SpacetimeDB.RuneStone) => {
                // Only update for visually significant changes
                const visuallySignificant =
                    Math.abs(oldRuneStone.posX - newRuneStone.posX) > 0.1 ||
                    Math.abs(oldRuneStone.posY - newRuneStone.posY) > 0.1 ||
                    oldRuneStone.runeType !== newRuneStone.runeType;

                if (visuallySignificant) {
                    setRuneStones(prev => new Map(prev).set(newRuneStone.id.toString(), newRuneStone));
                }
            };
            const handleRuneStoneDelete = (ctx: any, runeStone: SpacetimeDB.RuneStone) => setRuneStones(prev => { const newMap = new Map(prev); newMap.delete(runeStone.id.toString()); return newMap; });

            // --- Cairn Subscriptions ---
            const handleCairnInsert = (ctx: any, cairn: SpacetimeDB.Cairn) => setCairns(prev => new Map(prev).set(cairn.id.toString(), cairn));
            const handleCairnUpdate = (ctx: any, oldCairn: SpacetimeDB.Cairn, newCairn: SpacetimeDB.Cairn) => {
                // Only update for visually significant changes
                const visuallySignificant =
                    Math.abs(oldCairn.posX - newCairn.posX) > 0.1 ||
                    Math.abs(oldCairn.posY - newCairn.posY) > 0.1 ||
                    oldCairn.loreId !== newCairn.loreId;
                if (visuallySignificant) {
                    setCairns(prev => new Map(prev).set(newCairn.id.toString(), newCairn));
                }
            };
            const handleCairnDelete = (ctx: any, cairn: SpacetimeDB.Cairn) => setCairns(prev => { const newMap = new Map(prev); newMap.delete(cairn.id.toString()); return newMap; });

            // --- Player Discovered Cairn Subscriptions ---
            const handlePlayerDiscoveredCairnInsert = (ctx: any, discovery: SpacetimeDB.PlayerDiscoveredCairn) => {
                console.log(`[useSpacetimeTables] PlayerDiscoveredCairn INSERT: id=${discovery.id}, cairnId=${discovery.cairnId}, playerIdentity=${discovery.playerIdentity?.toHexString()?.slice(0, 16)}...`);
                setPlayerDiscoveredCairns(prev => {
                    const newMap = new Map(prev).set(discovery.id.toString(), discovery);
                    console.log(`[useSpacetimeTables] PlayerDiscoveredCairns map now has ${newMap.size} entries`);
                    return newMap;
                });
            };
            const handlePlayerDiscoveredCairnUpdate = (ctx: any, oldDiscovery: SpacetimeDB.PlayerDiscoveredCairn, newDiscovery: SpacetimeDB.PlayerDiscoveredCairn) => {
                console.log(`[useSpacetimeTables] PlayerDiscoveredCairn UPDATE: id=${newDiscovery.id}`);
                setPlayerDiscoveredCairns(prev => new Map(prev).set(newDiscovery.id.toString(), newDiscovery));
            };
            const handlePlayerDiscoveredCairnDelete = (ctx: any, discovery: SpacetimeDB.PlayerDiscoveredCairn) => {
                console.log(`[useSpacetimeTables] PlayerDiscoveredCairn DELETE: id=${discovery.id}`);
                setPlayerDiscoveredCairns(prev => { const newMap = new Map(prev); newMap.delete(discovery.id.toString()); return newMap; });
            };

            // --- Campfire Subscriptions (Phase 4a: batched inserts) ---
            const handleCampfireInsert = (ctx: any, campfire: SpacetimeDB.Campfire) => {
                campfireBatchRef.current.push(campfire);
                if (!campfireFlushScheduledRef.current) {
                    campfireFlushScheduledRef.current = true;
                    queueMicrotask(() => {
                        const batch = campfireBatchRef.current;
                        campfireBatchRef.current = [];
                        campfireFlushScheduledRef.current = false;
                        for (const c of batch) {
                            if (connection.identity && c.placedBy && c.placedBy.isEqual(connection.identity)) {
                                cancelPlacementRef.current();
                                break;
                            }
                        }
                        setCampfires(prev => {
                            const next = new Map(prev);
                            for (const c of batch) next.set(c.id.toString(), c);
                            return next;
                        });
                    });
                }
            };
            const handleCampfireUpdate = (ctx: any, oldFire: SpacetimeDB.Campfire, newFire: SpacetimeDB.Campfire) => setCampfires(prev => new Map(prev).set(newFire.id.toString(), newFire));
            const handleCampfireDelete = (ctx: any, campfire: SpacetimeDB.Campfire) => setCampfires(prev => { const newMap = new Map(prev); newMap.delete(campfire.id.toString()); return newMap; });

            // --- Barbecue Subscriptions ---
            const handleBarbecueInsert = (ctx: any, barbecue: SpacetimeDB.Barbecue) => {
                setBarbecues(prev => new Map(prev).set(barbecue.id.toString(), barbecue));
                if (connection.identity && barbecue.placedBy && barbecue.placedBy.isEqual(connection.identity)) {
                    cancelPlacementRef.current();
                }
            };
            const handleBarbecueUpdate = (ctx: any, oldBarbecue: SpacetimeDB.Barbecue, newBarbecue: SpacetimeDB.Barbecue) => setBarbecues(prev => new Map(prev).set(newBarbecue.id.toString(), newBarbecue));
            const handleBarbecueDelete = (ctx: any, barbecue: SpacetimeDB.Barbecue) => setBarbecues(prev => { const newMap = new Map(prev); newMap.delete(barbecue.id.toString()); return newMap; });

            // --- Furnace Subscriptions ---
            const handleFurnaceInsert = (ctx: any, furnace: SpacetimeDB.Furnace) => {
                setFurnaces(prev => new Map(prev).set(furnace.id.toString(), furnace));
                if (connection.identity && furnace.placedBy && furnace.placedBy.isEqual(connection.identity)) {
                    cancelPlacementRef.current();
                }
            };
            const handleFurnaceUpdate = (ctx: any, oldFurnace: SpacetimeDB.Furnace, newFurnace: SpacetimeDB.Furnace) => setFurnaces(prev => new Map(prev).set(newFurnace.id.toString(), newFurnace));
            const handleFurnaceDelete = (ctx: any, furnace: SpacetimeDB.Furnace) => setFurnaces(prev => { const newMap = new Map(prev); newMap.delete(furnace.id.toString()); return newMap; });

            // --- Lantern Subscriptions ---
            const handleLanternInsert = (ctx: any, lantern: SpacetimeDB.Lantern) => {
                setLanterns(prev => new Map(prev).set(lantern.id.toString(), lantern));
                if (connection.identity && lantern.placedBy && lantern.placedBy.isEqual(connection.identity)) {
                    cancelPlacementRef.current();
                }
            };
            const handleLanternUpdate = (ctx: any, oldLantern: SpacetimeDB.Lantern, newLantern: SpacetimeDB.Lantern) => setLanterns(prev => new Map(prev).set(newLantern.id.toString(), newLantern));
            const handleLanternDelete = (ctx: any, lantern: SpacetimeDB.Lantern) => setLanterns(prev => { const newMap = new Map(prev); newMap.delete(lantern.id.toString()); return newMap; });

            // --- Turret Subscriptions ---
            const handleTurretInsert = (ctx: any, turret: SpacetimeDB.Turret) => {
                setTurrets(prev => new Map(prev).set(turret.id.toString(), turret));
                if (connection.identity && turret.placedBy && turret.placedBy.isEqual(connection.identity)) {
                    cancelPlacementRef.current();
                }
            };
            const handleTurretUpdate = (ctx: any, oldTurret: SpacetimeDB.Turret, newTurret: SpacetimeDB.Turret) => setTurrets(prev => new Map(prev).set(newTurret.id.toString(), newTurret));
            const handleTurretDelete = (ctx: any, turret: SpacetimeDB.Turret) => setTurrets(prev => { const newMap = new Map(prev); newMap.delete(turret.id.toString()); return newMap; });

            // --- Homestead Hearth Subscriptions ---
            const handleHomesteadHearthInsert = (ctx: any, hearth: SpacetimeDB.HomesteadHearth) => {
                setHomesteadHearths(prev => new Map(prev).set(hearth.id.toString(), hearth));
                if (connection.identity && hearth.placedBy && hearth.placedBy.isEqual(connection.identity)) {
                    cancelPlacementRef.current();
                }
            };
            const handleHomesteadHearthUpdate = (ctx: any, oldHearth: SpacetimeDB.HomesteadHearth, newHearth: SpacetimeDB.HomesteadHearth) => setHomesteadHearths(prev => new Map(prev).set(newHearth.id.toString(), newHearth));
            const handleHomesteadHearthDelete = (ctx: any, hearth: SpacetimeDB.HomesteadHearth) => setHomesteadHearths(prev => { const newMap = new Map(prev); newMap.delete(hearth.id.toString()); return newMap; });

            // --- Broth Pot Subscriptions ---
            const handleBrothPotInsert = (ctx: any, brothPot: SpacetimeDB.BrothPot) => {
                setBrothPots(prev => new Map(prev).set(brothPot.id.toString(), brothPot));
                if (connection.identity && brothPot.placedBy && brothPot.placedBy.isEqual(connection.identity)) {
                    cancelPlacementRef.current();
                }
            };
            const handleBrothPotUpdate = (ctx: any, oldPot: SpacetimeDB.BrothPot, newPot: SpacetimeDB.BrothPot) => setBrothPots(prev => new Map(prev).set(newPot.id.toString(), newPot));
            const handleBrothPotDelete = (ctx: any, brothPot: SpacetimeDB.BrothPot) => setBrothPots(prev => { const newMap = new Map(prev); newMap.delete(brothPot.id.toString()); return newMap; });
            const handleItemDefInsert = (ctx: any, itemDef: SpacetimeDB.ItemDefinition) => {
                setItemDefinitions(prev => new Map(prev).set(itemDef.id.toString(), itemDef));
            };
            const handleItemDefUpdate = (ctx: any, oldDef: SpacetimeDB.ItemDefinition, newDef: SpacetimeDB.ItemDefinition) => {
                setItemDefinitions(prev => new Map(prev).set(newDef.id.toString(), newDef));
            };
            const handleItemDefDelete = (ctx: any, itemDef: SpacetimeDB.ItemDefinition) => setItemDefinitions(prev => { const newMap = new Map(prev); newMap.delete(itemDef.id.toString()); return newMap; });

            // --- Inventory Subscriptions ---
            const handleInventoryInsert = (ctx: any, invItem: SpacetimeDB.InventoryItem) => upsertMapState(setInventoryItems, invItem.instanceId.toString(), invItem);
            const handleInventoryUpdate = (ctx: any, oldItem: SpacetimeDB.InventoryItem, newItem: SpacetimeDB.InventoryItem) => upsertMapState(setInventoryItems, newItem.instanceId.toString(), newItem);
            const handleInventoryDelete = (ctx: any, invItem: SpacetimeDB.InventoryItem) => setInventoryItems(prev => { const newMap = new Map(prev); newMap.delete(invItem.instanceId.toString()); return newMap; });

            // --- World State Subscriptions ---
            const handleWorldStateInsert = (ctx: any, state: SpacetimeDB.WorldState) => setWorldState(state);
            const handleWorldStateUpdate = (ctx: any, oldState: SpacetimeDB.WorldState, newState: SpacetimeDB.WorldState) => {
                // Include cycleProgress so we accept tick updates; otherwise we'd ignore cycleProgress-only
                // updates and show stale time (which could appear to "change" when player moves due to
                // delayed/cached display finally updating). Compare timeOfDay by tag for value equality.
                const timeTagChanged = (oldState.timeOfDay?.tag ?? '') !== (newState.timeOfDay?.tag ?? '');
                const significantChange = timeTagChanged
                    || oldState.cycleProgress !== newState.cycleProgress
                    || oldState.isFullMoon !== newState.isFullMoon
                    || oldState.cycleCount !== newState.cycleCount;
                if (significantChange) setWorldState(newState);
            };
            const handleWorldStateDelete = (ctx: any, state: SpacetimeDB.WorldState) => setWorldState(null);

            // --- Active Equipment Subscriptions ---
            const handleActiveEquipmentInsert = (ctx: any, equip: SpacetimeDB.ActiveEquipment) => {
                setActiveEquipments(prev => new Map(prev).set(equip.playerIdentity.toHexString(), equip));
            };
            const handleActiveEquipmentUpdate = (ctx: any, oldEquip: SpacetimeDB.ActiveEquipment, newEquip: SpacetimeDB.ActiveEquipment) => {
                setActiveEquipments(prev => new Map(prev).set(newEquip.playerIdentity.toHexString(), newEquip));
            };
            const handleActiveEquipmentDelete = (ctx: any, equip: SpacetimeDB.ActiveEquipment) => {
                setActiveEquipments(prev => { const newMap = new Map(prev); newMap.delete(equip.playerIdentity.toHexString()); return newMap; });
            };

            // --- Unified Harvestable Resource Subscriptions (Phase 5: batched) ---
            const scheduleHarvestableResourceFlush = () => {
                if (harvestableResourceFlushScheduledRef.current) return;
                harvestableResourceFlushScheduledRef.current = true;
                queueMicrotask(() => {
                    const batch = harvestableResourceBatchRef.current;
                    harvestableResourceBatchRef.current = [];
                    harvestableResourceFlushScheduledRef.current = false;
                    if (batch.length === 0) return;
                    setHarvestableResources(prev => {
                        const next = new Map(prev);
                        for (const e of batch) {
                            if (e.op === 'set') next.set(e.id, e.resource);
                            else next.delete(e.id);
                        }
                        return next;
                    });
                });
            };
            const handleHarvestableResourceInsert = (ctx: any, resource: SpacetimeDB.HarvestableResource) => {
                harvestableResourceBatchRef.current.push({ op: 'set', id: resource.id.toString(), resource });
                scheduleHarvestableResourceFlush();
            };
            const handleHarvestableResourceUpdate = (ctx: any, oldResource: SpacetimeDB.HarvestableResource, newResource: SpacetimeDB.HarvestableResource) => {
                const changed = oldResource.posX !== newResource.posX ||
                    oldResource.posY !== newResource.posY ||
                    (oldResource.respawnAt?.microsSinceUnixEpoch ?? 0n) !== (newResource.respawnAt?.microsSinceUnixEpoch ?? 0n);
                if (changed) {
                    harvestableResourceBatchRef.current.push({ op: 'set', id: newResource.id.toString(), resource: newResource });
                    scheduleHarvestableResourceFlush();
                }
            };
            const handleHarvestableResourceDelete = (ctx: any, resource: SpacetimeDB.HarvestableResource) => {
                harvestableResourceBatchRef.current.push({ op: 'delete', id: resource.id.toString() });
                scheduleHarvestableResourceFlush();
            };

            // --- Planted Seed Subscriptions ---
            const handlePlantedSeedInsert = (ctx: any, seed: SpacetimeDB.PlantedSeed) => {
                setPlantedSeeds(prev => {
                    const newMap = new Map(prev);
                    newMap.set(seed.id.toString(), seed);
                    return newMap;
                });
            };
            const handlePlantedSeedUpdate = (ctx: any, oldSeed: SpacetimeDB.PlantedSeed, newSeed: SpacetimeDB.PlantedSeed) => {
                const changed = oldSeed.willMatureAt !== newSeed.willMatureAt || oldSeed.chunkIndex !== newSeed.chunkIndex;
                if (changed) {
                    setPlantedSeeds(prev => new Map(prev).set(newSeed.id.toString(), newSeed));
                }
            };
            const handlePlantedSeedDelete = (ctx: any, seed: SpacetimeDB.PlantedSeed) => setPlantedSeeds(prev => { const newMap = new Map(prev); newMap.delete(seed.id.toString()); return newMap; });

            // --- Dropped Item Subscriptions (Phase 5: batched) ---
            const scheduleDroppedItemFlush = () => {
                if (droppedItemFlushScheduledRef.current) return;
                droppedItemFlushScheduledRef.current = true;
                queueMicrotask(() => {
                    const batch = droppedItemBatchRef.current;
                    droppedItemBatchRef.current = [];
                    droppedItemFlushScheduledRef.current = false;
                    if (batch.length === 0) return;
                    setDroppedItems(prev => {
                        const next = new Map(prev);
                        for (const e of batch) {
                            if (e.op === 'set') next.set(e.id, e.item);
                            else next.delete(e.id);
                        }
                        return next;
                    });
                });
            };
            const handleDroppedItemInsert = (ctx: any, item: SpacetimeDB.DroppedItem) => {
                droppedItemBatchRef.current.push({ op: 'set', id: item.id.toString(), item });
                scheduleDroppedItemFlush();
            };
            const handleDroppedItemUpdate = (ctx: any, oldItem: SpacetimeDB.DroppedItem, newItem: SpacetimeDB.DroppedItem) => {
                droppedItemBatchRef.current.push({ op: 'set', id: newItem.id.toString(), item: newItem });
                scheduleDroppedItemFlush();
            };
            const handleDroppedItemDelete = (ctx: any, item: SpacetimeDB.DroppedItem) => {
                droppedItemBatchRef.current.push({ op: 'delete', id: item.id.toString() });
                scheduleDroppedItemFlush();
            };

            // --- Wooden Storage Box Subscriptions ---
            const handleWoodenStorageBoxInsert = (ctx: any, box: SpacetimeDB.WoodenStorageBox) => {
                setWoodenStorageBoxes(prev => new Map(prev).set(box.id.toString(), box));
                if (connection.identity && box.placedBy && box.placedBy.isEqual(connection.identity)) {
                    cancelPlacementRef.current();
                }
            };
            const handleWoodenStorageBoxUpdate = (ctx: any, oldBox: SpacetimeDB.WoodenStorageBox, newBox: SpacetimeDB.WoodenStorageBox) => setWoodenStorageBoxes(prev => new Map(prev).set(newBox.id.toString(), newBox));
            const handleWoodenStorageBoxDelete = (ctx: any, box: SpacetimeDB.WoodenStorageBox) => setWoodenStorageBoxes(prev => { const newMap = new Map(prev); newMap.delete(box.id.toString()); return newMap; });

            // --- Recipe Subscriptions ---
            const handleRecipeInsert = (ctx: any, recipe: SpacetimeDB.Recipe) => setRecipes(prev => new Map(prev).set(recipe.recipeId.toString(), recipe));
            const handleRecipeUpdate = (ctx: any, oldRecipe: SpacetimeDB.Recipe, newRecipe: SpacetimeDB.Recipe) => setRecipes(prev => new Map(prev).set(newRecipe.recipeId.toString(), newRecipe));
            const handleRecipeDelete = (ctx: any, recipe: SpacetimeDB.Recipe) => setRecipes(prev => { const newMap = new Map(prev); newMap.delete(recipe.recipeId.toString()); return newMap; });

            // --- Crafting Queue Subscriptions ---
            const handleCraftingQueueInsert = (ctx: any, queueItem: SpacetimeDB.CraftingQueueItem) => setCraftingQueueItems(prev => new Map(prev).set(queueItem.queueItemId.toString(), queueItem));
            const handleCraftingQueueUpdate = (ctx: any, oldItem: SpacetimeDB.CraftingQueueItem, newItem: SpacetimeDB.CraftingQueueItem) => setCraftingQueueItems(prev => new Map(prev).set(newItem.queueItemId.toString(), newItem));
            const handleCraftingQueueDelete = (ctx: any, queueItem: SpacetimeDB.CraftingQueueItem) => setCraftingQueueItems(prev => { const newMap = new Map(prev); newMap.delete(queueItem.queueItemId.toString()); return newMap; });

            // --- Message Subscriptions ---
            const handleMessageInsert = (ctx: any, msg: SpacetimeDB.Message) => setMessages(prev => new Map(prev).set(msg.id.toString(), msg));
            const handleMessageUpdate = (ctx: any, oldMsg: SpacetimeDB.Message, newMsg: SpacetimeDB.Message) => setMessages(prev => new Map(prev).set(newMsg.id.toString(), newMsg));
            const handleMessageDelete = (ctx: any, msg: SpacetimeDB.Message) => setMessages(prev => { const newMap = new Map(prev); newMap.delete(msg.id.toString()); return newMap; });

            // --- Player Progression System Handlers ---
            const handlePlayerStatsInsert = (ctx: any, stats: SpacetimeDB.PlayerStats) => setPlayerStats(prev => new Map(prev).set(stats.playerId.toHexString(), stats));
            const handlePlayerStatsUpdate = (ctx: any, oldStats: SpacetimeDB.PlayerStats, newStats: SpacetimeDB.PlayerStats) => setPlayerStats(prev => new Map(prev).set(newStats.playerId.toHexString(), newStats));
            const handlePlayerStatsDelete = (ctx: any, stats: SpacetimeDB.PlayerStats) => setPlayerStats(prev => { const newMap = new Map(prev); newMap.delete(stats.playerId.toHexString()); return newMap; });

            const handleAchievementDefinitionInsert = (ctx: any, def: SpacetimeDB.AchievementDefinition) => setAchievementDefinitions(prev => new Map(prev).set(def.id, def));
            const handleAchievementDefinitionUpdate = (ctx: any, oldDef: SpacetimeDB.AchievementDefinition, newDef: SpacetimeDB.AchievementDefinition) => setAchievementDefinitions(prev => new Map(prev).set(newDef.id, newDef));
            const handleAchievementDefinitionDelete = (ctx: any, def: SpacetimeDB.AchievementDefinition) => setAchievementDefinitions(prev => { const newMap = new Map(prev); newMap.delete(def.id); return newMap; });

            const handlePlayerAchievementInsert = (ctx: any, achievement: SpacetimeDB.PlayerAchievement) => setPlayerAchievements(prev => new Map(prev).set(achievement.id.toString(), achievement));
            const handlePlayerAchievementUpdate = (ctx: any, oldAchievement: SpacetimeDB.PlayerAchievement, newAchievement: SpacetimeDB.PlayerAchievement) => setPlayerAchievements(prev => new Map(prev).set(newAchievement.id.toString(), newAchievement));
            const handlePlayerAchievementDelete = (ctx: any, achievement: SpacetimeDB.PlayerAchievement) => setPlayerAchievements(prev => { const newMap = new Map(prev); newMap.delete(achievement.id.toString()); return newMap; });

            const handleAchievementUnlockNotificationInsert = (ctx: any, notif: SpacetimeDB.AchievementUnlockNotification) => {
                // Only show notifications for local player
                if (connection && connection.identity && notif.playerId && notif.playerId.isEqual(connection.identity)) {
                    setAchievementUnlockNotifications(prev => new Map(prev).set(notif.id.toString(), notif));
                }
            };
            const handleAchievementUnlockNotificationUpdate = (ctx: any, oldNotif: SpacetimeDB.AchievementUnlockNotification, newNotif: SpacetimeDB.AchievementUnlockNotification) => {
                if (connection && connection.identity && newNotif.playerId && newNotif.playerId.isEqual(connection.identity)) {
                    setAchievementUnlockNotifications(prev => new Map(prev).set(newNotif.id.toString(), newNotif));
                }
            };
            const handleAchievementUnlockNotificationDelete = (ctx: any, notif: SpacetimeDB.AchievementUnlockNotification) => setAchievementUnlockNotifications(prev => { const newMap = new Map(prev); newMap.delete(notif.id.toString()); return newMap; });

            const handleLevelUpNotificationInsert = (ctx: any, notif: SpacetimeDB.LevelUpNotification) => {
                if (connection && connection.identity && notif.playerId && notif.playerId.isEqual(connection.identity)) {
                    setLevelUpNotifications(prev => new Map(prev).set(notif.id.toString(), notif));
                }
            };
            const handleLevelUpNotificationUpdate = (ctx: any, oldNotif: SpacetimeDB.LevelUpNotification, newNotif: SpacetimeDB.LevelUpNotification) => {
                if (connection && connection.identity && newNotif.playerId && newNotif.playerId.isEqual(connection.identity)) {
                    setLevelUpNotifications(prev => new Map(prev).set(newNotif.id.toString(), newNotif));
                }
            };
            const handleLevelUpNotificationDelete = (ctx: any, notif: SpacetimeDB.LevelUpNotification) => setLevelUpNotifications(prev => { const newMap = new Map(prev); newMap.delete(notif.id.toString()); return newMap; });

            const handleDailyLoginNotificationInsert = (ctx: any, notif: SpacetimeDB.DailyLoginNotification) => {
                if (connection && connection.identity && notif.playerId && notif.playerId.isEqual(connection.identity)) {
                    setDailyLoginNotifications(prev => new Map(prev).set(notif.id.toString(), notif));
                }
            };
            const handleDailyLoginNotificationUpdate = (ctx: any, oldNotif: SpacetimeDB.DailyLoginNotification, newNotif: SpacetimeDB.DailyLoginNotification) => {
                if (connection && connection.identity && newNotif.playerId && newNotif.playerId.isEqual(connection.identity)) {
                    setDailyLoginNotifications(prev => new Map(prev).set(newNotif.id.toString(), newNotif));
                }
            };
            const handleDailyLoginNotificationDelete = (ctx: any, notif: SpacetimeDB.DailyLoginNotification) => setDailyLoginNotifications(prev => { const newMap = new Map(prev); newMap.delete(notif.id.toString()); return newMap; });

            const handleProgressNotificationInsert = (ctx: any, notif: SpacetimeDB.ProgressNotification) => {
                if (connection && connection.identity && notif.playerId && notif.playerId.isEqual(connection.identity)) {
                    setProgressNotifications(prev => new Map(prev).set(notif.id.toString(), notif));
                }
            };
            const handleProgressNotificationUpdate = (ctx: any, oldNotif: SpacetimeDB.ProgressNotification, newNotif: SpacetimeDB.ProgressNotification) => {
                if (connection && connection.identity && newNotif.playerId && newNotif.playerId.isEqual(connection.identity)) {
                    setProgressNotifications(prev => new Map(prev).set(newNotif.id.toString(), newNotif));
                }
            };
            const handleProgressNotificationDelete = (ctx: any, notif: SpacetimeDB.ProgressNotification) => setProgressNotifications(prev => { const newMap = new Map(prev); newMap.delete(notif.id.toString()); return newMap; });

            const handleComparativeStatNotificationInsert = (ctx: any, notif: SpacetimeDB.ComparativeStatNotification) => {
                if (connection && connection.identity && notif.playerId && notif.playerId.isEqual(connection.identity)) {
                    setComparativeStatNotifications(prev => new Map(prev).set(notif.id.toString(), notif));
                }
            };
            const handleComparativeStatNotificationUpdate = (ctx: any, oldNotif: SpacetimeDB.ComparativeStatNotification, newNotif: SpacetimeDB.ComparativeStatNotification) => {
                if (connection && connection.identity && newNotif.playerId && newNotif.playerId.isEqual(connection.identity)) {
                    setComparativeStatNotifications(prev => new Map(prev).set(newNotif.id.toString(), newNotif));
                }
            };
            const handleComparativeStatNotificationDelete = (ctx: any, notif: SpacetimeDB.ComparativeStatNotification) => setComparativeStatNotifications(prev => { const newMap = new Map(prev); newMap.delete(notif.id.toString()); return newMap; });

            const handleLeaderboardEntryInsert = (ctx: any, entry: SpacetimeDB.LeaderboardEntry) => setLeaderboardEntries(prev => new Map(prev).set(entry.id.toString(), entry));
            const handleLeaderboardEntryUpdate = (ctx: any, oldEntry: SpacetimeDB.LeaderboardEntry, newEntry: SpacetimeDB.LeaderboardEntry) => setLeaderboardEntries(prev => new Map(prev).set(newEntry.id.toString(), newEntry));
            const handleLeaderboardEntryDelete = (ctx: any, entry: SpacetimeDB.LeaderboardEntry) => setLeaderboardEntries(prev => { const newMap = new Map(prev); newMap.delete(entry.id.toString()); return newMap; });

            const handleDailyLoginRewardInsert = (ctx: any, reward: SpacetimeDB.DailyLoginReward) => setDailyLoginRewards(prev => new Map(prev).set(reward.day.toString(), reward));
            const handleDailyLoginRewardUpdate = (ctx: any, oldReward: SpacetimeDB.DailyLoginReward, newReward: SpacetimeDB.DailyLoginReward) => setDailyLoginRewards(prev => new Map(prev).set(newReward.day.toString(), newReward));
            const handleDailyLoginRewardDelete = (ctx: any, reward: SpacetimeDB.DailyLoginReward) => setDailyLoginRewards(prev => { const newMap = new Map(prev); newMap.delete(reward.day.toString()); return newMap; });

            // --- Plant Config Definition Subscriptions (for Encyclopedia) ---
            const handlePlantConfigDefinitionInsert = (ctx: any, config: SpacetimeDB.PlantConfigDefinition) => setPlantConfigDefinitions(prev => new Map(prev).set(config.plantType?.tag || 'unknown', config));
            const handlePlantConfigDefinitionUpdate = (ctx: any, oldConfig: SpacetimeDB.PlantConfigDefinition, newConfig: SpacetimeDB.PlantConfigDefinition) => setPlantConfigDefinitions(prev => new Map(prev).set(newConfig.plantType?.tag || 'unknown', newConfig));
            const handlePlantConfigDefinitionDelete = (ctx: any, config: SpacetimeDB.PlantConfigDefinition) => setPlantConfigDefinitions(prev => { const newMap = new Map(prev); newMap.delete(config.plantType?.tag || 'unknown'); return newMap; });

            // --- Discovered Plants Subscriptions (for Encyclopedia filtering) ---
            const handleDiscoveredPlantInsert = (ctx: any, discovery: SpacetimeDB.PlayerDiscoveredPlant) => {
                // Only track discoveries for the current player
                if (connection?.identity && discovery.playerId.toHexString() === connection.identity.toHexString()) {
                    setDiscoveredPlants(prev => new Map(prev).set(discovery.plantType?.tag || 'unknown', discovery));
                }
            };
            const handleDiscoveredPlantDelete = (ctx: any, discovery: SpacetimeDB.PlayerDiscoveredPlant) => {
                if (connection?.identity && discovery.playerId.toHexString() === connection.identity.toHexString()) {
                    setDiscoveredPlants(prev => { const newMap = new Map(prev); newMap.delete(discovery.plantType?.tag || 'unknown'); return newMap; });
                }
            };

            // --- Quest System Subscriptions ---
            const handleTutorialQuestDefinitionInsert = (ctx: any, def: SpacetimeDB.TutorialQuestDefinition) => setTutorialQuestDefinitions(prev => new Map(prev).set(def.id, def));
            const handleTutorialQuestDefinitionUpdate = (ctx: any, oldDef: SpacetimeDB.TutorialQuestDefinition, newDef: SpacetimeDB.TutorialQuestDefinition) => setTutorialQuestDefinitions(prev => new Map(prev).set(newDef.id, newDef));
            const handleTutorialQuestDefinitionDelete = (ctx: any, def: SpacetimeDB.TutorialQuestDefinition) => setTutorialQuestDefinitions(prev => { const newMap = new Map(prev); newMap.delete(def.id); return newMap; });

            const handleDailyQuestDefinitionInsert = (ctx: any, def: SpacetimeDB.DailyQuestDefinition) => setDailyQuestDefinitions(prev => new Map(prev).set(def.id, def));
            const handleDailyQuestDefinitionUpdate = (ctx: any, oldDef: SpacetimeDB.DailyQuestDefinition, newDef: SpacetimeDB.DailyQuestDefinition) => setDailyQuestDefinitions(prev => new Map(prev).set(newDef.id, newDef));
            const handleDailyQuestDefinitionDelete = (ctx: any, def: SpacetimeDB.DailyQuestDefinition) => setDailyQuestDefinitions(prev => { const newMap = new Map(prev); newMap.delete(def.id); return newMap; });

            const handlePlayerTutorialProgressInsert = (ctx: any, progress: SpacetimeDB.PlayerTutorialProgress) => {
                if (connection?.identity && progress.playerId.toHexString() === connection.identity.toHexString()) {
                    setPlayerTutorialProgress(prev => new Map(prev).set(progress.playerId.toHexString(), progress));
                }
            };
            const handlePlayerTutorialProgressUpdate = (ctx: any, oldProgress: SpacetimeDB.PlayerTutorialProgress, newProgress: SpacetimeDB.PlayerTutorialProgress) => {
                if (connection?.identity && newProgress.playerId.toHexString() === connection.identity.toHexString()) {
                    setPlayerTutorialProgress(prev => new Map(prev).set(newProgress.playerId.toHexString(), newProgress));
                }
            };
            const handlePlayerTutorialProgressDelete = (ctx: any, progress: SpacetimeDB.PlayerTutorialProgress) => {
                if (connection?.identity && progress.playerId.toHexString() === connection.identity.toHexString()) {
                    setPlayerTutorialProgress(prev => { const newMap = new Map(prev); newMap.delete(progress.playerId.toHexString()); return newMap; });
                }
            };

            const handlePlayerDailyQuestInsert = (ctx: any, quest: SpacetimeDB.PlayerDailyQuest) => {
                if (connection?.identity && quest.playerId.toHexString() === connection.identity.toHexString()) {
                    setPlayerDailyQuests(prev => new Map(prev).set(quest.id.toString(), quest));
                }
            };
            const handlePlayerDailyQuestUpdate = (ctx: any, oldQuest: SpacetimeDB.PlayerDailyQuest, newQuest: SpacetimeDB.PlayerDailyQuest) => {
                if (connection?.identity && newQuest.playerId.toHexString() === connection.identity.toHexString()) {
                    setPlayerDailyQuests(prev => new Map(prev).set(newQuest.id.toString(), newQuest));
                }
            };
            const handlePlayerDailyQuestDelete = (ctx: any, quest: SpacetimeDB.PlayerDailyQuest) => {
                if (connection?.identity && quest.playerId.toHexString() === connection.identity.toHexString()) {
                    setPlayerDailyQuests(prev => { const newMap = new Map(prev); newMap.delete(quest.id.toString()); return newMap; });
                }
            };

            const handleQuestCompletionNotificationInsert = (ctx: any, notif: SpacetimeDB.QuestCompletionNotification) => {
                if (connection?.identity && notif.playerId.toHexString() === connection.identity.toHexString()) {
                    setQuestCompletionNotifications(prev => new Map(prev).set(notif.id.toString(), notif));
                }
            };
            const handleQuestCompletionNotificationDelete = (ctx: any, notif: SpacetimeDB.QuestCompletionNotification) => {
                if (connection?.identity && notif.playerId.toHexString() === connection.identity.toHexString()) {
                    setQuestCompletionNotifications(prev => { const newMap = new Map(prev); newMap.delete(notif.id.toString()); return newMap; });
                }
            };

            const handleQuestProgressNotificationInsert = (ctx: any, notif: SpacetimeDB.QuestProgressNotification) => {
                if (connection?.identity && notif.playerId.toHexString() === connection.identity.toHexString()) {
                    setQuestProgressNotifications(prev => new Map(prev).set(notif.id.toString(), notif));
                }
            };
            const handleQuestProgressNotificationDelete = (ctx: any, notif: SpacetimeDB.QuestProgressNotification) => {
                if (connection?.identity && notif.playerId.toHexString() === connection.identity.toHexString()) {
                    setQuestProgressNotifications(prev => { const newMap = new Map(prev); newMap.delete(notif.id.toString()); return newMap; });
                }
            };

            const handleSovaQuestMessageInsert = (ctx: any, msg: SpacetimeDB.SovaQuestMessage) => {
                if (connection?.identity && msg.playerId.toHexString() === connection.identity.toHexString()) {
                    setSovaQuestMessages(prev => new Map(prev).set(msg.id.toString(), msg));
                }
            };
            const handleSovaQuestMessageDelete = (ctx: any, msg: SpacetimeDB.SovaQuestMessage) => {
                if (connection?.identity && msg.playerId.toHexString() === connection.identity.toHexString()) {
                    setSovaQuestMessages(prev => { const newMap = new Map(prev); newMap.delete(msg.id.toString()); return newMap; });
                }
            };

            // --- Beacon Drop Event Subscriptions (server events for minimap markers) ---
            const handleBeaconDropEventInsert = (ctx: any, event: SpacetimeDB.BeaconDropEvent) => {
                setBeaconDropEvents(prev => new Map(prev).set(event.id.toString(), event));
            };
            const handleBeaconDropEventUpdate = (ctx: any, oldEvent: SpacetimeDB.BeaconDropEvent, newEvent: SpacetimeDB.BeaconDropEvent) => {
                setBeaconDropEvents(prev => new Map(prev).set(newEvent.id.toString(), newEvent));
            };
            const handleBeaconDropEventDelete = (ctx: any, event: SpacetimeDB.BeaconDropEvent) => {
                setBeaconDropEvents(prev => { const newMap = new Map(prev); newMap.delete(event.id.toString()); return newMap; });
            };
            const handleDroneEventInsert = (ctx: any, event: SpacetimeDB.DroneEvent) => {
                setDroneEvents(prev => new Map(prev).set(event.id.toString(), event));
            };
            const handleDroneEventDelete = (ctx: any, event: SpacetimeDB.DroneEvent) => {
                setDroneEvents(prev => { const newMap = new Map(prev); newMap.delete(event.id.toString()); return newMap; });
            };

            // --- Player Pin Subscriptions ---
            const handlePlayerPinInsert = (ctx: any, pin: SpacetimeDB.PlayerPin) => setPlayerPins(prev => new Map(prev).set(pin.playerId.toHexString(), pin));
            const handlePlayerPinUpdate = (ctx: any, oldPin: SpacetimeDB.PlayerPin, newPin: SpacetimeDB.PlayerPin) => setPlayerPins(prev => new Map(prev).set(newPin.playerId.toHexString(), newPin));
            const handlePlayerPinDelete = (ctx: any, pin: SpacetimeDB.PlayerPin) => setPlayerPins(prev => { const newMap = new Map(prev); newMap.delete(pin.playerId.toHexString()); return newMap; });

            // --- Active Connection Subscriptions ---
            const handleActiveConnectionInsert = (ctx: any, conn: SpacetimeDB.ActiveConnection) => {
                setActiveConnections(prev => new Map(prev).set(conn.identity.toHexString(), conn));
            };
            const handleActiveConnectionDelete = (ctx: any, conn: SpacetimeDB.ActiveConnection) => {
                setActiveConnections(prev => {
                    const newMap = new Map(prev);
                    newMap.delete(conn.identity.toHexString());
                    return newMap;
                });
            };

            // --- Sleeping Bag Subscriptions ---
            const handleSleepingBagInsert = (ctx: any, bag: SpacetimeDB.SleepingBag) => {
                setSleepingBags(prev => new Map(prev).set(bag.id.toString(), bag));
                if (connection.identity && bag.placedBy && bag.placedBy.isEqual(connection.identity)) {
                    cancelPlacementRef.current();
                }
            };
            const handleSleepingBagUpdate = (ctx: any, oldBag: SpacetimeDB.SleepingBag, newBag: SpacetimeDB.SleepingBag) => {
                setSleepingBags(prev => new Map(prev).set(newBag.id.toString(), newBag));
            };
            const handleSleepingBagDelete = (ctx: any, bag: SpacetimeDB.SleepingBag) => {
                setSleepingBags(prev => { const newMap = new Map(prev); newMap.delete(bag.id.toString()); return newMap; });
            };

            // --- Player Corpse Subscriptions ---
            const handlePlayerCorpseInsert = (ctx: any, corpse: SpacetimeDB.PlayerCorpse) => {
                setPlayerCorpses(prev => new Map(prev).set(corpse.id.toString(), corpse));
            };
            const handlePlayerCorpseUpdate = (ctx: any, oldCorpse: SpacetimeDB.PlayerCorpse, newCorpse: SpacetimeDB.PlayerCorpse) => {
                setPlayerCorpses(prev => new Map(prev).set(newCorpse.id.toString(), newCorpse));
            };
            const handlePlayerCorpseDelete = (ctx: any, corpse: SpacetimeDB.PlayerCorpse) => {
                setPlayerCorpses(prev => { const newMap = new Map(prev); newMap.delete(corpse.id.toString()); return newMap; });
            };

            // --- Stash Subscriptions ---
            const handleStashInsert = (ctx: any, stash: SpacetimeDB.Stash) => {
                setStashes(prev => new Map(prev).set(stash.id.toString(), stash));
                if (connection.identity && stash.placedBy && stash.placedBy.isEqual(connection.identity)) {
                    cancelPlacementRef.current();
                }
            };
            const handleStashUpdate = (ctx: any, oldStash: SpacetimeDB.Stash, newStash: SpacetimeDB.Stash) => {
                setStashes(prev => new Map(prev).set(newStash.id.toString(), newStash));
            };
            const handleStashDelete = (ctx: any, stash: SpacetimeDB.Stash) => {
                setStashes(prev => { const newMap = new Map(prev); newMap.delete(stash.id.toString()); return newMap; });
            };

            // --- ActiveConsumableEffect Subscriptions ---
            const handleActiveConsumableEffectInsert = (ctx: any, effect: SpacetimeDB.ActiveConsumableEffect) => {
                setActiveConsumableEffects(prev => new Map(prev).set(effect.effectId.toString(), effect));
            };
            const handleActiveConsumableEffectUpdate = (ctx: any, oldEffect: SpacetimeDB.ActiveConsumableEffect, newEffect: SpacetimeDB.ActiveConsumableEffect) => {
                setActiveConsumableEffects(prev => new Map(prev).set(newEffect.effectId.toString(), newEffect));
            };
            const handleActiveConsumableEffectDelete = (ctx: any, effect: SpacetimeDB.ActiveConsumableEffect) => {
                setActiveConsumableEffects(prev => { const newMap = new Map(prev); newMap.delete(effect.effectId.toString()); return newMap; });
            };

            // --- Cloud Subscriptions ---
            const handleCloudInsert = (ctx: any, cloud: SpacetimeDB.Cloud) => {
                setClouds(prev => new Map(prev).set(cloud.id.toString(), cloud));
            };
            const handleCloudUpdate = (ctx: any, oldCloud: SpacetimeDB.Cloud, newCloud: SpacetimeDB.Cloud) => {
                setClouds(prev => new Map(prev).set(newCloud.id.toString(), newCloud));
            };
            const handleCloudDelete = (ctx: any, cloud: SpacetimeDB.Cloud) => {
                setClouds(prev => { const newMap = new Map(prev); newMap.delete(cloud.id.toString()); return newMap; });
            };

            // --- Grass Subscriptions (Split Tables) ---
            // Grass (static): position, appearance - rarely changes
            // GrassState (dynamic): health, respawn - updates on damage
            const handleGrassInsert = (ctx: any, item: SpacetimeDB.Grass) => upsertMapState(setGrass, item.id.toString(), item);
            const handleGrassUpdate = (ctx: any, oldItem: SpacetimeDB.Grass, newItem: SpacetimeDB.Grass) => upsertMapState(setGrass, newItem.id.toString(), newItem);
            const handleGrassDelete = (ctx: any, item: SpacetimeDB.Grass) => setGrass(prev => { const newMap = new Map(prev); newMap.delete(item.id.toString()); return newMap; });

            // --- GrassState Subscriptions (Split Tables) ---
            // This table updates when grass is damaged/respawned - much smaller payload than old combined table
            const handleGrassStateInsert = (ctx: any, item: SpacetimeDB.GrassState) => {
                setGrassState(prev => new Map(prev).set(item.grassId.toString(), item));
            };
            const handleGrassStateUpdate = (ctx: any, oldItem: SpacetimeDB.GrassState, newItem: SpacetimeDB.GrassState) => {
                // Only update if relevant fields changed (is_alive, respawn)
                const hasChanges = oldItem.isAlive !== newItem.isAlive ||
                    oldItem.respawnAt !== newItem.respawnAt;
                if (hasChanges) {
                    setGrassState(prev => new Map(prev).set(newItem.grassId.toString(), newItem));
                }
            };
            const handleGrassStateDelete = (ctx: any, item: SpacetimeDB.GrassState) => {
                setGrassState(prev => { const newMap = new Map(prev); newMap.delete(item.grassId.toString()); return newMap; });
            };

            // --- KnockedOutStatus Subscriptions ---
            const handleKnockedOutStatusInsert = (ctx: any, status: SpacetimeDB.KnockedOutStatus) => {
                setKnockedOutStatus(prev => new Map(prev).set(status.playerId.toHexString(), status));
            };
            const handleKnockedOutStatusUpdate = (ctx: any, oldStatus: SpacetimeDB.KnockedOutStatus, newStatus: SpacetimeDB.KnockedOutStatus) => {
                setKnockedOutStatus(prev => new Map(prev).set(newStatus.playerId.toHexString(), newStatus));
            };
            const handleKnockedOutStatusDelete = (ctx: any, status: SpacetimeDB.KnockedOutStatus) => {
                setKnockedOutStatus(prev => { const newMap = new Map(prev); newMap.delete(status.playerId.toHexString()); return newMap; });
            };

            // --- RangedWeaponStats Callbacks ---
            const handleRangedWeaponStatsInsert = (ctx: any, stats: SpacetimeDBRangedWeaponStats) =>
                setRangedWeaponStats(prev => new Map(prev).set(stats.itemName, stats));
            const handleRangedWeaponStatsUpdate = (ctx: any, oldStats: SpacetimeDBRangedWeaponStats, newStats: SpacetimeDBRangedWeaponStats) =>
                setRangedWeaponStats(prev => new Map(prev).set(newStats.itemName, newStats));
            const handleRangedWeaponStatsDelete = (ctx: any, stats: SpacetimeDBRangedWeaponStats) =>
                setRangedWeaponStats(prev => { const newMap = new Map(prev); newMap.delete(stats.itemName); return newMap; });

            // Projectile callbacks use batched refs to reduce React re-renders during combat
            // Projectiles update frequently when arrows/thrown items are in flight
            const scheduleProjectileUpdate = () => {
                if (projectilesUpdateTimeoutRef.current) return; // Already scheduled
                projectilesUpdateTimeoutRef.current = setTimeout(() => {
                    setProjectiles(new Map(projectilesRef.current));
                    projectilesUpdateTimeoutRef.current = null;
                }, PROJECTILE_BATCH_INTERVAL_MS);
            };

            const handleProjectileInsert = (ctx: any, projectile: SpacetimeDBProjectile) => {
                projectilesRef.current.set(projectile.id.toString(), projectile);
                const localIdentity = connection?.identity?.toHexString?.();
                const ownerId = projectile.ownerId?.toHexString?.();
                if (localIdentity && ownerId === localIdentity && projectile.sourceType === 0) {
                    recordProjectileDebugEvent('table-insert', {
                        id: projectile.id.toString(),
                        clientShotId: projectile.clientShotId,
                        ownerId,
                        startPosX: projectile.startPosX,
                        startPosY: projectile.startPosY,
                        velocityX: projectile.velocityX,
                        velocityY: projectile.velocityY,
                    });
                }
                // CRITICAL: Flush inserts immediately so newly-fired projectiles are visible
                // from their first replicated frame. If insert+delete are coalesced inside
                // the 50ms batch window, the projectile can otherwise be skipped entirely.
                setProjectiles(new Map(projectilesRef.current));
            };
            const handleProjectileUpdate = (ctx: any, oldProjectile: SpacetimeDBProjectile, newProjectile: SpacetimeDBProjectile) => {
                projectilesRef.current.set(newProjectile.id.toString(), newProjectile);
                scheduleProjectileUpdate();
            };
            const handleProjectileDelete = (ctx: any, projectile: SpacetimeDBProjectile) => {
                const localIdentity = connection?.identity?.toHexString?.();
                const ownerId = projectile.ownerId?.toHexString?.();
                if (localIdentity && ownerId === localIdentity && projectile.sourceType === 0) {
                    recordProjectileDebugEvent('table-delete', {
                        id: projectile.id.toString(),
                        clientShotId: projectile.clientShotId,
                        ownerId,
                    });
                }
                projectilesRef.current.delete(projectile.id.toString());
                scheduleProjectileUpdate();
            };

            const handleDeathMarkerInsert = (ctx: any, marker: SpacetimeDB.DeathMarker) => {
                setDeathMarkers(prev => new Map(prev).set(marker.playerId.toHexString(), marker));
            };
            const handleDeathMarkerUpdate = (ctx: any, oldMarker: SpacetimeDB.DeathMarker, newMarker: SpacetimeDB.DeathMarker) => {
                setDeathMarkers(prev => new Map(prev).set(newMarker.playerId.toHexString(), newMarker));
            };
            const handleDeathMarkerDelete = (ctx: any, marker: SpacetimeDB.DeathMarker) => {
                setDeathMarkers(prev => { const newMap = new Map(prev); newMap.delete(marker.playerId.toHexString()); return newMap; });
            };

            // --- Shelter Callbacks ---
            const handleShelterInsert = (ctx: any, shelter: SpacetimeDB.Shelter) => {
                setShelters(prev => new Map(prev).set(shelter.id.toString(), shelter));
                // If this client placed the shelter, cancel placement mode
                if (connection && connection.identity && shelter.placedBy && shelter.placedBy.isEqual(connection.identity)) {
                    cancelPlacementRef.current();
                }
            };
            const handleShelterUpdate = (ctx: any, oldShelter: SpacetimeDB.Shelter, newShelter: SpacetimeDB.Shelter) => {
                setShelters(prev => new Map(prev).set(newShelter.id.toString(), newShelter));
            };
            const handleShelterDelete = (ctx: any, shelter: SpacetimeDB.Shelter) => {
                // console.log('[useSpacetimeTables] Shelter Deleted:', shelter.id);
                setShelters(prev => { const newMap = new Map(prev); newMap.delete(shelter.id.toString()); return newMap; });
            };

            // WorldTile handlers removed – world background now uses compressed chunk data on client

            // --- MinimapCache Handlers ---
            const handleMinimapCacheInsert = (ctx: any, cache: SpacetimeDB.MinimapCache) => {
                // console.log('[useSpacetimeTables] Minimap cache received:', cache.width, 'x', cache.height, 'data length:', cache.data.length);
                setMinimapCache(cache);
            };
            const handleMinimapCacheUpdate = (ctx: any, oldCache: SpacetimeDB.MinimapCache, newCache: SpacetimeDB.MinimapCache) => {
                // console.log('[useSpacetimeTables] Minimap cache updated:', newCache.width, 'x', newCache.height);
                setMinimapCache(newCache);
            };
            const handleMinimapCacheDelete = (ctx: any, cache: SpacetimeDB.MinimapCache) => {
                // console.log('[useSpacetimeTables] Minimap cache deleted');
                setMinimapCache(null);
            };

            // --- PlayerDodgeRollState Handlers ---
            const handlePlayerDodgeRollStateInsert = (ctx: any, dodgeState: SpacetimeDB.PlayerDodgeRollState) => {
                const playerKey = dodgeState.playerId.toHexString();
                const existingState = playerDodgeRollStatesRef.current.get(playerKey) as any;
                // IMPORTANT: preserve reception time for the same roll start_time_ms.
                // Subscription re-applies/duplicate updates must not restart local roll timing.
                const clientReceptionTimeMs =
                    existingState && existingState.startTimeMs === dodgeState.startTimeMs
                        ? existingState.clientReceptionTimeMs
                        : Date.now();
                const stateWithReceptionTime = {
                    ...dodgeState,
                    clientReceptionTimeMs // Track when CLIENT received this state
                };

                // console.log(`[DODGE DEBUG] Server state INSERT for player ${dodgeState.playerId.toHexString()}`);
                playerDodgeRollStatesRef.current.set(playerKey, stateWithReceptionTime as any);
                setPlayerDodgeRollStates(new Map(playerDodgeRollStatesRef.current));
            };
            const handlePlayerDodgeRollStateUpdate = (ctx: any, oldDodgeState: SpacetimeDB.PlayerDodgeRollState, newDodgeState: SpacetimeDB.PlayerDodgeRollState) => {
                const playerKey = newDodgeState.playerId.toHexString();
                const existingState = playerDodgeRollStatesRef.current.get(playerKey) as any;
                // IMPORTANT: preserve reception time for the same roll start_time_ms.
                // This prevents animation restarts (double-roll effect) on repeated updates.
                const clientReceptionTimeMs =
                    existingState && existingState.startTimeMs === newDodgeState.startTimeMs
                        ? existingState.clientReceptionTimeMs
                        : Date.now();
                const stateWithReceptionTime = {
                    ...newDodgeState,
                    clientReceptionTimeMs // Track when CLIENT received this state
                };

                // console.log(`[DODGE DEBUG] Server state UPDATE for player ${newDodgeState.playerId.toHexString()}`);
                playerDodgeRollStatesRef.current.set(playerKey, stateWithReceptionTime as any);
                setPlayerDodgeRollStates(new Map(playerDodgeRollStatesRef.current));
            };
            const handlePlayerDodgeRollStateDelete = (ctx: any, dodgeState: SpacetimeDB.PlayerDodgeRollState) => {
                // console.log(`[DODGE DEBUG] Server state DELETE for player ${dodgeState.playerId.toHexString()}`);
                playerDodgeRollStatesRef.current.delete(dodgeState.playerId.toHexString());
                setPlayerDodgeRollStates(new Map(playerDodgeRollStatesRef.current));
            };

            // --- FishingSession Subscriptions ---
            const handleFishingSessionInsert = (ctx: any, session: SpacetimeDB.FishingSession) => {
                //console.log('[useSpacetimeTables] FishingSession INSERT:', session.playerId.toHexString(), 'at', session.targetX, session.targetY);
                setFishingSessions(prev => new Map(prev).set(session.playerId.toHexString(), session));
            };
            const handleFishingSessionUpdate = (ctx: any, oldSession: SpacetimeDB.FishingSession, newSession: SpacetimeDB.FishingSession) => {
                console.log('[useSpacetimeTables] FishingSession UPDATE:', newSession.playerId.toHexString());
                setFishingSessions(prev => new Map(prev).set(newSession.playerId.toHexString(), newSession));
            };
            const handleFishingSessionDelete = (ctx: any, session: SpacetimeDB.FishingSession) => {
                console.log('[useSpacetimeTables] FishingSession DELETE:', session.playerId.toHexString());
                setFishingSessions(prev => { const newMap = new Map(prev); newMap.delete(session.playerId.toHexString()); return newMap; });
            };

            // Sound Event Handlers
            const handleSoundEventInsert = (ctx: any, soundEvent: SpacetimeDB.SoundEvent) => {
                setSoundEvents(prev => new Map(prev).set(soundEvent.id.toString(), soundEvent));
            };
            const handleSoundEventUpdate = (ctx: any, oldSoundEvent: SpacetimeDB.SoundEvent, newSoundEvent: SpacetimeDB.SoundEvent) => {
                setSoundEvents(prev => new Map(prev).set(newSoundEvent.id.toString(), newSoundEvent));
            };
            const handleSoundEventDelete = (ctx: any, soundEvent: SpacetimeDB.SoundEvent) => {
                setSoundEvents(prev => { const newMap = new Map(prev); newMap.delete(soundEvent.id.toString()); return newMap; });
            };

            // Continuous Sound Handlers
            const handleContinuousSoundInsert = (ctx: any, continuousSound: SpacetimeDB.ContinuousSound) => {
                setContinuousSounds(prev => new Map(prev).set(continuousSound.objectId.toString(), continuousSound));
            };
            const handleContinuousSoundUpdate = (ctx: any, oldContinuousSound: SpacetimeDB.ContinuousSound, newContinuousSound: SpacetimeDB.ContinuousSound) => {
                setContinuousSounds(prev => new Map(prev).set(newContinuousSound.objectId.toString(), newContinuousSound));
            };
            const handleContinuousSoundDelete = (ctx: any, continuousSound: SpacetimeDB.ContinuousSound) => {
                setContinuousSounds(prev => { const newMap = new Map(prev); newMap.delete(continuousSound.objectId.toString()); return newMap; });
            };

            // --- PlayerDrinkingCooldown Subscriptions ---
            const handlePlayerDrinkingCooldownInsert = (ctx: any, cooldown: SpacetimeDB.PlayerDrinkingCooldown) => {
                setPlayerDrinkingCooldowns(prev => new Map(prev).set(cooldown.playerId.toHexString(), cooldown));
            };
            const handlePlayerDrinkingCooldownUpdate = (ctx: any, oldCooldown: SpacetimeDB.PlayerDrinkingCooldown, newCooldown: SpacetimeDB.PlayerDrinkingCooldown) => {
                setPlayerDrinkingCooldowns(prev => new Map(prev).set(newCooldown.playerId.toHexString(), newCooldown));
            };
            const handlePlayerDrinkingCooldownDelete = (ctx: any, cooldown: SpacetimeDB.PlayerDrinkingCooldown) => {
                setPlayerDrinkingCooldowns(prev => { const newMap = new Map(prev); newMap.delete(cooldown.playerId.toHexString()); return newMap; });
            };

            // --- RainCollector Subscriptions ---
            const handleRainCollectorInsert = (ctx: any, rainCollector: SpacetimeDB.RainCollector) => {
                setRainCollectors(prev => new Map(prev).set(rainCollector.id.toString(), rainCollector));
                if (connection.identity && rainCollector.placedBy && rainCollector.placedBy.isEqual(connection.identity)) {
                    cancelPlacementRef.current();
                }
            };
            const handleRainCollectorUpdate = (ctx: any, oldRainCollector: SpacetimeDB.RainCollector, newRainCollector: SpacetimeDB.RainCollector) => {
                setRainCollectors(prev => new Map(prev).set(newRainCollector.id.toString(), newRainCollector));
            };
            const handleRainCollectorDelete = (ctx: any, rainCollector: SpacetimeDB.RainCollector) => {
                setRainCollectors(prev => { const newMap = new Map(prev); newMap.delete(rainCollector.id.toString()); return newMap; });
            };

            // --- WaterPatch Subscriptions ---
            const handleWaterPatchInsert = (ctx: any, waterPatch: SpacetimeDB.WaterPatch) => {
                // CRITICAL FIX: Ensure we're subscribed to the chunk containing this water patch
                // Water patches are created via left-click and might be in a chunk we haven't subscribed to yet
                const patchChunkIndex = waterPatch.chunkIndex;

                // Check if we're subscribed to this chunk
                if (!gameplaySubscriptionsRuntime.hasSpatialSubscription(patchChunkIndex) && connection) {
                    // We received a water patch insert but aren't subscribed to its chunk
                    // This can happen if the water patch was created just outside the viewport buffer
                    // Subscribe to this chunk immediately to ensure we receive updates
                    console.log(`[WATER_PATCH] Received water patch insert for chunk ${patchChunkIndex} but not subscribed - subscribing now`);

                    gameplaySubscriptionsRuntime.ensureChunkSubscribed(patchChunkIndex, subscribeToChunk);
                }

                // Add the water patch to state
                setWaterPatches(prev => new Map(prev).set(waterPatch.id.toString(), waterPatch));
            };
            const handleWaterPatchUpdate = (ctx: any, oldWaterPatch: SpacetimeDB.WaterPatch, newWaterPatch: SpacetimeDB.WaterPatch) => {
                setWaterPatches(prev => new Map(prev).set(newWaterPatch.id.toString(), newWaterPatch));
            };
            const handleWaterPatchDelete = (ctx: any, waterPatch: SpacetimeDB.WaterPatch) => {
                setWaterPatches(prev => { const newMap = new Map(prev); newMap.delete(waterPatch.id.toString()); return newMap; });
            };

            // --- FertilizerPatch Subscriptions ---
            const handleFertilizerPatchInsert = (ctx: any, fertilizerPatch: SpacetimeDB.FertilizerPatch) => {
                // CRITICAL FIX: Ensure we're subscribed to the chunk containing this fertilizer patch
                const patchChunkIndex = fertilizerPatch.chunkIndex;

                // Check if we're subscribed to this chunk
                if (!gameplaySubscriptionsRuntime.hasSpatialSubscription(patchChunkIndex) && connection) {
                    console.log(`[FERTILIZER_PATCH] Received fertilizer patch insert for chunk ${patchChunkIndex} but not subscribed - subscribing now`);

                    gameplaySubscriptionsRuntime.ensureChunkSubscribed(patchChunkIndex, subscribeToChunk);
                }

                // Add the fertilizer patch to state
                setFertilizerPatches(prev => new Map(prev).set(fertilizerPatch.id.toString(), fertilizerPatch));
            };
            const handleFertilizerPatchUpdate = (ctx: any, oldFertilizerPatch: SpacetimeDB.FertilizerPatch, newFertilizerPatch: SpacetimeDB.FertilizerPatch) => {
                setFertilizerPatches(prev => new Map(prev).set(newFertilizerPatch.id.toString(), newFertilizerPatch));
            };
            const handleFertilizerPatchDelete = (ctx: any, fertilizerPatch: SpacetimeDB.FertilizerPatch) => {
                setFertilizerPatches(prev => { const newMap = new Map(prev); newMap.delete(fertilizerPatch.id.toString()); return newMap; });
            };

            // --- FirePatch Subscriptions ---
            const handleFirePatchInsert = (ctx: any, firePatch: SpacetimeDB.FirePatch) => {
                // CRITICAL FIX: Ensure we're subscribed to the chunk containing this fire patch
                // Fire patches are created via fire arrows and might be in a chunk we haven't subscribed to yet
                const patchChunkIndex = firePatch.chunkIndex;

                console.log(`[FIRE_PATCH] Insert callback: fire patch ${firePatch.id} at chunk ${patchChunkIndex}, pos (${firePatch.posX.toFixed(1)}, ${firePatch.posY.toFixed(1)})`);

                // Check if we're subscribed to this chunk
                if (!gameplaySubscriptionsRuntime.hasSpatialSubscription(patchChunkIndex) && connection) {
                    // We received a fire patch insert but aren't subscribed to its chunk
                    // This can happen if the fire patch was created just outside the viewport buffer
                    // Subscribe to this chunk immediately to ensure we receive updates
                    console.log(`[FIRE_PATCH] Received fire patch insert for chunk ${patchChunkIndex} but not subscribed - subscribing now`);

                    gameplaySubscriptionsRuntime.ensureChunkSubscribed(patchChunkIndex, subscribeToChunk);
                }

                // Add the fire patch to state
                setFirePatches(prev => {
                    const newMap = new Map(prev).set(firePatch.id.toString(), firePatch);
                    console.log(`[FIRE_PATCH] State updated, total fire patches: ${newMap.size}`);
                    return newMap;
                });
            };
            const handleFirePatchUpdate = (ctx: any, oldFirePatch: SpacetimeDB.FirePatch, newFirePatch: SpacetimeDB.FirePatch) => {
                setFirePatches(prev => new Map(prev).set(newFirePatch.id.toString(), newFirePatch));
            };
            const handleFirePatchDelete = (ctx: any, firePatch: SpacetimeDB.FirePatch) => {
                setFirePatches(prev => { const newMap = new Map(prev); newMap.delete(firePatch.id.toString()); return newMap; });
            };

            // Placed Explosive handlers
            const handlePlacedExplosiveInsert = (ctx: any, explosive: SpacetimeDB.PlacedExplosive) => {
                const subscribedChunks = gameplaySubscriptionsRuntime.getSubscribedChunks().sort((a, b) => a - b);
                const isChunkSubscribed = subscribedChunks.includes(explosive.chunkIndex);
                console.log(`[EXPLOSIVE INSERT] id=${explosive.id}, type=${explosive.explosiveType.tag}, pos=(${explosive.posX.toFixed(1)}, ${explosive.posY.toFixed(1)}), chunk=${explosive.chunkIndex}`);
                console.log(`[EXPLOSIVE INSERT] Subscribed chunks: [${subscribedChunks.slice(0, 20).join(', ')}${subscribedChunks.length > 20 ? '...' : ''}] (total: ${subscribedChunks.length})`);
                console.log(`[EXPLOSIVE INSERT] Chunk ${explosive.chunkIndex} is ${isChunkSubscribed ? 'IN' : 'NOT IN'} subscribed chunks`);
                setPlacedExplosives(prev => new Map(prev).set(explosive.id.toString(), explosive));
                // Cancel placement if this explosive was placed by the local player
                if (connection.identity && explosive.placedBy && explosive.placedBy.isEqual(connection.identity)) {
                    cancelPlacementRef.current();
                }
            };
            const handlePlacedExplosiveUpdate = (ctx: any, oldExplosive: SpacetimeDB.PlacedExplosive, newExplosive: SpacetimeDB.PlacedExplosive) => {
                setPlacedExplosives(prev => new Map(prev).set(newExplosive.id.toString(), newExplosive));
            };
            const handlePlacedExplosiveDelete = (ctx: any, explosive: SpacetimeDB.PlacedExplosive) => {
                setPlacedExplosives(prev => { const newMap = new Map(prev); newMap.delete(explosive.id.toString()); return newMap; });

                // Trigger explosion visual effect when explosive is deleted (detonated)
                // Don't trigger for duds (they stay in the world with isDud = true)
                if (!explosive.isDud) {
                    const tier = explosive.explosiveType.tag === 'BabushkaSurprise' ? 'babushka' : 'matriarch';
                    triggerExplosionEffect(explosive.posX, explosive.posY, explosive.blastRadius, tier);
                    console.log(`[EXPLOSION] ${tier} explosive detonated at (${explosive.posX.toFixed(1)}, ${explosive.posY.toFixed(1)})`);
                }
            };

            // Wild Animal handlers - NOW USES SPATIAL SUBSCRIPTIONS (not global)
            // Performance fix: only receive updates for animals in nearby chunks (~5-15)
            // instead of all ~100 animals on the entire map
            // 
            // Batched updates to reduce React re-renders
            // AI ticks 8x/sec per animal - batching reduces re-renders from 8/sec/animal to ~10/sec total
            const scheduleWildAnimalUpdate = () => {
                if (wildAnimalsUpdateTimeoutRef.current) return; // Already scheduled
                wildAnimalsUpdateTimeoutRef.current = setTimeout(() => {
                    setWildAnimals(new Map(wildAnimalsRef.current));
                    wildAnimalsUpdateTimeoutRef.current = null;
                }, WILD_ANIMAL_BATCH_INTERVAL_MS);
            };

            const handleWildAnimalInsert = (ctx: any, animal: SpacetimeDB.WildAnimal) => {
                wildAnimalsRef.current.set(animal.id.toString(), animal);
                scheduleWildAnimalUpdate();

                // SOVA Tutorial: First Hostile Encounter
                // Trigger when the player first sees a hostile NPC at night
                if (animal.isHostileNpc) {
                    const storageKey = 'broth_first_hostile_encounter_played';
                    // Check both localStorage AND session flag to prevent duplicate dispatches
                    // (Multiple hostiles can spawn before localStorage is updated)
                    if (localStorage.getItem(storageKey) !== 'true' && !hasDispatchedHostileEncounterEvent) {
                        console.log('[useSpacetimeTables] 👹 First hostile NPC detected! Dispatching tutorial event');
                        hasDispatchedHostileEncounterEvent = true; // Prevent duplicate dispatches in this session
                        window.dispatchEvent(new CustomEvent('sova-first-hostile-encounter'));
                    }
                }
            };
            const handleWildAnimalUpdate = (ctx: any, oldAnimal: SpacetimeDB.WildAnimal, newAnimal: SpacetimeDB.WildAnimal) => {
                wildAnimalsRef.current.set(newAnimal.id.toString(), newAnimal);
                scheduleWildAnimalUpdate();
            };
            const handleWildAnimalDelete = (ctx: any, animal: SpacetimeDB.WildAnimal) => {
                // Check if this was a hostile NPC death - trigger client-side particle effects
                if (animal.isHostileNpc) {
                    const speciesTag = (animal.species as { tag?: string })?.tag ?? String(animal.species);
                    const deathEvent = {
                        id: `death-${animal.id}-${Date.now()}`,
                        x: animal.posX,
                        y: animal.posY,
                        species: speciesTag,
                        timestamp: Date.now(),
                    };
                    setHostileDeathEvents(prev => {
                        const next = [...prev, deathEvent];
                        // Cap size to prevent memory/performance degradation during mass encounters
                        return next.length > HOSTILE_DEATH_EVENTS_MAX ? next.slice(-HOSTILE_DEATH_EVENTS_MAX) : next;
                    });

                    // Auto-cleanup after 3 seconds (particle system will have consumed this)
                    const timeoutId = setTimeout(() => {
                        hostileDeathCleanupTimeoutsRef.current.delete(timeoutId);
                        setHostileDeathEvents(prev => prev.filter(e => e.id !== deathEvent.id));
                    }, 3000);
                    hostileDeathCleanupTimeoutsRef.current.add(timeoutId);
                }

                wildAnimalsRef.current.delete(animal.id.toString());
                scheduleWildAnimalUpdate();
            };

            // Note: Hostile NPCs (Shorebound, Shardkin, DrownedWatch) are now part of WildAnimal table
            // They are handled by the handleWildAnimalInsert/Update/Delete handlers above
            // with is_hostile_npc = true to distinguish them from regular wild animals

            const handleAnimalCorpseInsert = (ctx: any, corpse: SpacetimeDB.AnimalCorpse) => {
                setAnimalCorpses(prev => new Map(prev).set(corpse.id.toString(), corpse));
            };
            const handleAnimalCorpseUpdate = (ctx: any, oldCorpse: SpacetimeDB.AnimalCorpse, newCorpse: SpacetimeDB.AnimalCorpse) => {
                setAnimalCorpses(prev => new Map(prev).set(newCorpse.id.toString(), newCorpse));
            };
            const handleAnimalCorpseDelete = (ctx: any, corpse: SpacetimeDB.AnimalCorpse) => {
                const nowMs = Date.now();
                const despawnAtMs = Number(corpse.despawnAt.microsSinceUnixEpoch / 1000n);
                const deletedBeforeNaturalDespawn = nowMs < (despawnAtMs - 500);
                if (corpse.health === 0 || deletedBeforeNaturalDespawn) {
                    triggerAnimalCorpseDestructionEffect(corpse);
                }
                setAnimalCorpses(prev => { const newMap = new Map(prev); newMap.delete(corpse.id.toString()); return newMap; });
            };

            // CaribouBreedingData handlers - for age/sex/pregnancy tracking
            const handleCaribouBreedingDataInsert = (ctx: any, data: SpacetimeDB.CaribouBreedingData) => {
                setCaribouBreedingData(prev => new Map(prev).set(data.animalId.toString(), data));
            };
            const handleCaribouBreedingDataUpdate = (ctx: any, oldData: SpacetimeDB.CaribouBreedingData, newData: SpacetimeDB.CaribouBreedingData) => {
                setCaribouBreedingData(prev => new Map(prev).set(newData.animalId.toString(), newData));
            };
            const handleCaribouBreedingDataDelete = (ctx: any, data: SpacetimeDB.CaribouBreedingData) => {
                setCaribouBreedingData(prev => { const newMap = new Map(prev); newMap.delete(data.animalId.toString()); return newMap; });
            };

            // WalrusBreedingData handlers - for age/sex/pregnancy tracking
            const handleWalrusBreedingDataInsert = (ctx: any, data: SpacetimeDB.WalrusBreedingData) => {
                setWalrusBreedingData(prev => new Map(prev).set(data.animalId.toString(), data));
            };
            const handleWalrusBreedingDataUpdate = (ctx: any, oldData: SpacetimeDB.WalrusBreedingData, newData: SpacetimeDB.WalrusBreedingData) => {
                setWalrusBreedingData(prev => new Map(prev).set(newData.animalId.toString(), newData));
            };
            const handleWalrusBreedingDataDelete = (ctx: any, data: SpacetimeDB.WalrusBreedingData) => {
                setWalrusBreedingData(prev => { const newMap = new Map(prev); newMap.delete(data.animalId.toString()); return newMap; });
            };

            // CaribouRutState handlers - global single-row table for breeding season
            const handleCaribouRutStateInsert = (ctx: any, data: SpacetimeDB.CaribouRutState) => {
                setCaribouRutState(data);
            };
            const handleCaribouRutStateUpdate = (ctx: any, oldData: SpacetimeDB.CaribouRutState, newData: SpacetimeDB.CaribouRutState) => {
                setCaribouRutState(newData);
            };
            const handleCaribouRutStateDelete = (ctx: any, data: SpacetimeDB.CaribouRutState) => {
                setCaribouRutState(null);
            };

            // WalrusRutState handlers - global single-row table for breeding season
            const handleWalrusRutStateInsert = (ctx: any, data: SpacetimeDB.WalrusRutState) => {
                setWalrusRutState(data);
            };
            const handleWalrusRutStateUpdate = (ctx: any, oldData: SpacetimeDB.WalrusRutState, newData: SpacetimeDB.WalrusRutState) => {
                setWalrusRutState(newData);
            };
            const handleWalrusRutStateDelete = (ctx: any, data: SpacetimeDB.WalrusRutState) => {
                setWalrusRutState(null);
            };

            // Barrel handlers
            const handleBarrelInsert = (ctx: any, barrel: SpacetimeDB.Barrel) => setBarrels(prev => new Map(prev).set(barrel.id.toString(), barrel));
            const handleBarrelUpdate = (ctx: any, oldBarrel: SpacetimeDB.Barrel, newBarrel: SpacetimeDB.Barrel) => {
                // Update for visually significant changes including lastHitTime (needed for shake on each hit)
                const visuallySignificant =
                    Math.abs(oldBarrel.posX - newBarrel.posX) > 0.1 ||  // Position changed significantly
                    Math.abs(oldBarrel.posY - newBarrel.posY) > 0.1 ||  // Position changed significantly
                    Math.abs(oldBarrel.health - newBarrel.health) > 0.1 || // Health changed significantly
                    oldBarrel.variant !== newBarrel.variant ||           // Barrel variant changed
                    (oldBarrel.respawnAt?.microsSinceUnixEpoch ?? 0n) !== (newBarrel.respawnAt?.microsSinceUnixEpoch ?? 0n) || // Respawn state changed
                    (oldBarrel.lastHitTime?.microsSinceUnixEpoch ?? 0n) !== (newBarrel.lastHitTime?.microsSinceUnixEpoch ?? 0n); // lastHitTime changed (shake on each hit)

                if (visuallySignificant) {
                    setBarrels(prev => new Map(prev).set(newBarrel.id.toString(), newBarrel));
                }

                // Trigger barrel destruction effect immediately when server reports destruction
                // (Same pattern as explosive onDelete - ensures effect fires before entity disappears from view)
                const wasHealthy = (oldBarrel.respawnAt?.microsSinceUnixEpoch ?? 0n) === 0n;
                const isDestroyed = (newBarrel.respawnAt?.microsSinceUnixEpoch ?? 0n) !== 0n;
                if (wasHealthy && isDestroyed && (newBarrel.variant ?? 0) !== 6) {
                    triggerBarrelDestructionEffect(newBarrel);
                }
            };
            const handleBarrelDelete = (ctx: any, barrel: SpacetimeDB.Barrel) => {
                setBarrels(prev => { const newMap = new Map(prev); newMap.delete(barrel.id.toString()); return newMap; });
                // If barrel was deleted (e.g. server removes destroyed barrels), trigger effect with last known position
                if ((barrel.variant ?? 0) !== 6) {
                    triggerBarrelDestructionEffect(barrel);
                }
            };

            // RoadLamppost handlers - SPATIAL
            const handleRoadLamppostInsert = (ctx: any, lamppost: SpacetimeDB.RoadLamppost) => setRoadLampposts(prev => new Map(prev).set(lamppost.id.toString(), lamppost));
            const handleRoadLamppostUpdate = (ctx: any, _old: SpacetimeDB.RoadLamppost, newLamppost: SpacetimeDB.RoadLamppost) => setRoadLampposts(prev => new Map(prev).set(newLamppost.id.toString(), newLamppost));
            const handleRoadLamppostDelete = (ctx: any, lamppost: SpacetimeDB.RoadLamppost) => setRoadLampposts(prev => { const newMap = new Map(prev); newMap.delete(lamppost.id.toString()); return newMap; });

            // Sea Stack handlers - SPATIAL
            const handleSeaStackInsert = (ctx: any, seaStack: SpacetimeDB.SeaStack) => setSeaStacks(prev => new Map(prev).set(seaStack.id.toString(), seaStack));
            const handleSeaStackUpdate = (ctx: any, oldSeaStack: SpacetimeDB.SeaStack, newSeaStack: SpacetimeDB.SeaStack) => {
                setSeaStacks(prev => new Map(prev).set(newSeaStack.id.toString(), newSeaStack));
            };
            const handleSeaStackDelete = (ctx: any, seaStack: SpacetimeDB.SeaStack) => setSeaStacks(prev => { const newMap = new Map(prev); newMap.delete(seaStack.id.toString()); return newMap; });

            // Foundation Cell handlers - SPATIAL
            const handleFoundationCellInsert = (ctx: any, foundation: SpacetimeDB.FoundationCell) => {
                setFoundationCells(prev => new Map(prev).set(foundation.id.toString(), foundation));
            };
            const handleFoundationCellUpdate = (ctx: any, oldFoundation: SpacetimeDB.FoundationCell, newFoundation: SpacetimeDB.FoundationCell) => {
                // Only update for visually significant changes
                const visuallySignificant =
                    oldFoundation.cellX !== newFoundation.cellX ||
                    oldFoundation.cellY !== newFoundation.cellY ||
                    oldFoundation.shape !== newFoundation.shape ||
                    oldFoundation.tier !== newFoundation.tier ||
                    Math.abs(oldFoundation.health - newFoundation.health) > 0.1 ||
                    oldFoundation.isDestroyed !== newFoundation.isDestroyed;

                if (visuallySignificant) {
                    setFoundationCells(prev => new Map(prev).set(newFoundation.id.toString(), newFoundation));
                }
            };
            const handleFoundationCellDelete = (ctx: any, foundation: SpacetimeDB.FoundationCell) => {
                setFoundationCells(prev => { const newMap = new Map(prev); newMap.delete(foundation.id.toString()); return newMap; });
            };

            // Wall Cell handlers - SPATIAL
            const handleWallCellInsert = (ctx: any, wall: SpacetimeDB.WallCell) => {
                console.log(`[Wall Insert] Wall inserted: id=${wall.id.toString()}, cellX=${wall.cellX}, cellY=${wall.cellY}, edge=${wall.edge}, chunk=${wall.chunkIndex}`);
                setWallCells(prev => {
                    const newMap = new Map(prev);
                    newMap.set(wall.id.toString(), wall);
                    console.log(`[Wall Insert] Map size changed from ${prev.size} to ${newMap.size}`);
                    return newMap;
                });
            };
            const handleWallCellUpdate = (ctx: any, oldWall: SpacetimeDB.WallCell, newWall: SpacetimeDB.WallCell) => {
                // Only update for visually significant changes
                const visuallySignificant =
                    oldWall.cellX !== newWall.cellX ||
                    oldWall.cellY !== newWall.cellY ||
                    oldWall.edge !== newWall.edge ||
                    oldWall.facing !== newWall.facing ||
                    oldWall.tier !== newWall.tier ||
                    Math.abs(oldWall.health - newWall.health) > 0.1 ||
                    oldWall.isDestroyed !== newWall.isDestroyed;

                if (visuallySignificant) {
                    setWallCells(prev => new Map(prev).set(newWall.id.toString(), newWall));
                }
            };
            const handleWallCellDelete = (ctx: any, wall: SpacetimeDB.WallCell) => {
                setWallCells(prev => { const newMap = new Map(prev); newMap.delete(wall.id.toString()); return newMap; });
            };

            // Door handlers - SPATIAL
            const handleDoorInsert = (ctx: any, door: SpacetimeDB.Door) => {
                console.log(`[Door Insert] Door inserted: id=${door.id.toString()}, cellX=${door.cellX}, cellY=${door.cellY}, edge=${door.edge}, isOpen=${door.isOpen}`);
                setDoors(prev => {
                    const newMap = new Map(prev);
                    newMap.set(door.id.toString(), door);
                    return newMap;
                });
            };
            const handleDoorUpdate = (ctx: any, oldDoor: SpacetimeDB.Door, newDoor: SpacetimeDB.Door) => {
                // Update on any visually significant change
                const visuallySignificant =
                    oldDoor.posX !== newDoor.posX ||
                    oldDoor.posY !== newDoor.posY ||
                    oldDoor.isOpen !== newDoor.isOpen ||
                    oldDoor.health !== newDoor.health ||
                    oldDoor.isDestroyed !== newDoor.isDestroyed;

                if (visuallySignificant) {
                    setDoors(prev => new Map(prev).set(newDoor.id.toString(), newDoor));
                }
            };
            const handleDoorDelete = (ctx: any, door: SpacetimeDB.Door) => {
                setDoors(prev => { const newMap = new Map(prev); newMap.delete(door.id.toString()); return newMap; });
            };

            // Fence handlers - SPATIAL
            const handleFenceInsert = (ctx: any, fence: SpacetimeDB.Fence) => {
                setFences(prev => {
                    const newMap = new Map(prev);
                    newMap.set(fence.id.toString(), fence);
                    return newMap;
                });
            };
            const handleFenceUpdate = (ctx: any, oldFence: SpacetimeDB.Fence, newFence: SpacetimeDB.Fence) => {
                // Only update for visually significant changes
                const visuallySignificant =
                    Math.abs(oldFence.posX - newFence.posX) > 0.1 ||
                    Math.abs(oldFence.posY - newFence.posY) > 0.1 ||
                    oldFence.edge !== newFence.edge ||
                    oldFence.health !== newFence.health ||
                    oldFence.isDestroyed !== newFence.isDestroyed;

                if (visuallySignificant) {
                    setFences(prev => new Map(prev).set(newFence.id.toString(), newFence));
                }
            };
            const handleFenceDelete = (ctx: any, fence: SpacetimeDB.Fence) => {
                setFences(prev => { const newMap = new Map(prev); newMap.delete(fence.id.toString()); return newMap; });
            };

            // Fumarole handlers - SPATIAL
            const handleFumaroleInsert = (ctx: any, fumarole: SpacetimeDB.Fumarole) => {
                // console.log('🔥 [FUMAROLE INSERT] Fumarole', fumarole.id, 'at', fumarole.posX, fumarole.posY, 'chunk', fumarole.chunkIndex);
                setFumaroles(prev => new Map(prev).set(fumarole.id.toString(), fumarole));
            };
            const handleFumaroleUpdate = (ctx: any, oldFumarole: SpacetimeDB.Fumarole, newFumarole: SpacetimeDB.Fumarole) => {
                // Check for any significant changes (position, broth pot, OR slot contents)
                const visuallySignificant =
                    Math.abs(oldFumarole.posX - newFumarole.posX) > 0.1 ||
                    Math.abs(oldFumarole.posY - newFumarole.posY) > 0.1 ||
                    oldFumarole.attachedBrothPotId !== newFumarole.attachedBrothPotId ||
                    // Check all 6 slots for changes
                    oldFumarole.slotInstanceId0 !== newFumarole.slotInstanceId0 ||
                    oldFumarole.slotDefId0 !== newFumarole.slotDefId0 ||
                    oldFumarole.slotInstanceId1 !== newFumarole.slotInstanceId1 ||
                    oldFumarole.slotDefId1 !== newFumarole.slotDefId1 ||
                    oldFumarole.slotInstanceId2 !== newFumarole.slotInstanceId2 ||
                    oldFumarole.slotDefId2 !== newFumarole.slotDefId2 ||
                    oldFumarole.slotInstanceId3 !== newFumarole.slotInstanceId3 ||
                    oldFumarole.slotDefId3 !== newFumarole.slotDefId3 ||
                    oldFumarole.slotInstanceId4 !== newFumarole.slotInstanceId4 ||
                    oldFumarole.slotDefId4 !== newFumarole.slotDefId4 ||
                    oldFumarole.slotInstanceId5 !== newFumarole.slotInstanceId5 ||
                    oldFumarole.slotDefId5 !== newFumarole.slotDefId5;

                if (visuallySignificant) {
                    setFumaroles(prev => new Map(prev).set(newFumarole.id.toString(), newFumarole));
                }
            };
            const handleFumaroleDelete = (ctx: any, fumarole: SpacetimeDB.Fumarole) => setFumaroles(prev => { const newMap = new Map(prev); newMap.delete(fumarole.id.toString()); return newMap; });

            // Basalt Column handlers - SPATIAL
            const handleBasaltColumnInsert = (ctx: any, basaltColumn: SpacetimeDB.BasaltColumn) => {
                // console.log('🗿 [BASALT INSERT] Basalt column', basaltColumn.id, 'at', basaltColumn.posX, basaltColumn.posY, 'chunk', basaltColumn.chunkIndex, 'type', basaltColumn.columnType);
                setBasaltColumns(prev => new Map(prev).set(basaltColumn.id.toString(), basaltColumn));
            };
            const handleBasaltColumnUpdate = (ctx: any, oldBasaltColumn: SpacetimeDB.BasaltColumn, newBasaltColumn: SpacetimeDB.BasaltColumn) => {
                // Only update for visually significant changes
                const visuallySignificant =
                    Math.abs(oldBasaltColumn.posX - newBasaltColumn.posX) > 0.1 ||
                    Math.abs(oldBasaltColumn.posY - newBasaltColumn.posY) > 0.1 ||
                    oldBasaltColumn.columnType !== newBasaltColumn.columnType;

                if (visuallySignificant) {
                    setBasaltColumns(prev => new Map(prev).set(newBasaltColumn.id.toString(), newBasaltColumn));
                }
            };
            const handleBasaltColumnDelete = (ctx: any, basaltColumn: SpacetimeDB.BasaltColumn) => setBasaltColumns(prev => { const newMap = new Map(prev); newMap.delete(basaltColumn.id.toString()); return newMap; });

            // --- Living Coral handlers - SPATIAL (underwater coral for harvesting via combat system) ---
            const handleLivingCoralInsert = (ctx: any, coral: SpacetimeDB.LivingCoral) => setLivingCorals(prev => new Map(prev).set(coral.id.toString(), coral));
            const handleLivingCoralUpdate = (ctx: any, oldCoral: SpacetimeDB.LivingCoral, newCoral: SpacetimeDB.LivingCoral) => {
                // Only update for visually significant changes
                const visuallySignificant =
                    Math.abs(oldCoral.posX - newCoral.posX) > 0.1 ||
                    Math.abs(oldCoral.posY - newCoral.posY) > 0.1 ||
                    oldCoral.resourceRemaining !== newCoral.resourceRemaining || // Resource amount changed
                    (oldCoral.respawnAt?.microsSinceUnixEpoch ?? 0n) !== (newCoral.respawnAt?.microsSinceUnixEpoch ?? 0n); // Respawn state changed
                if (visuallySignificant) {
                    setLivingCorals(prev => new Map(prev).set(newCoral.id.toString(), newCoral));
                }
            };
            const handleLivingCoralDelete = (ctx: any, coral: SpacetimeDB.LivingCoral) => setLivingCorals(prev => { const newMap = new Map(prev); newMap.delete(coral.id.toString()); return newMap; });

            // --- Chunk Weather handlers - NON-SPATIAL (subscribe to all chunks) ---
            // OPTIMIZED: Batch updates to prevent UI lag from 14k+ chunks
            const scheduleChunkWeatherUpdate = () => {
                if (chunkWeatherUpdateTimeoutRef.current) return;
                chunkWeatherUpdateTimeoutRef.current = setTimeout(() => {
                    setChunkWeather(new Map(chunkWeatherRef.current));
                    chunkWeatherUpdateTimeoutRef.current = null;
                }, 250); // Throttle to 4fps - weather changes slowly, no need for 60fps react updates
            };

            const handleChunkWeatherInsert = (ctx: any, weather: any) => {
                chunkWeatherRef.current.set(weather.chunkIndex.toString(), weather);
                scheduleChunkWeatherUpdate();
            };
            const handleChunkWeatherUpdate = (ctx: any, oldWeather: any, newWeather: any) => {
                chunkWeatherRef.current.set(newWeather.chunkIndex.toString(), newWeather);
                scheduleChunkWeatherUpdate();
            };
            const handleChunkWeatherDelete = (ctx: any, weather: any) => {
                chunkWeatherRef.current.delete(weather.chunkIndex.toString());
                scheduleChunkWeatherUpdate();
            };

            // ALK Station handlers - for minimap delivery points
            const handleAlkStationInsert = (ctx: any, station: SpacetimeDB.AlkStation) => {
                setAlkStations(prev => new Map(prev).set(station.stationId.toString(), station));
            };
            const handleAlkStationUpdate = (ctx: any, oldStation: SpacetimeDB.AlkStation, newStation: SpacetimeDB.AlkStation) => {
                setAlkStations(prev => new Map(prev).set(newStation.stationId.toString(), newStation));
            };
            const handleAlkStationDelete = (ctx: any, station: SpacetimeDB.AlkStation) => {
                setAlkStations(prev => { const newMap = new Map(prev); newMap.delete(station.stationId.toString()); return newMap; });
            };

            // Monument Part handlers - unified handler for all monument types (shipwreck, fishing village, whale bone graveyard)
            const handleMonumentPartInsert = (ctx: any, part: any) => {
                setMonumentParts(prev => new Map(prev).set(part.id.toString(), part));
            };
            const handleMonumentPartUpdate = (ctx: any, oldPart: any, newPart: any) => {
                setMonumentParts(prev => new Map(prev).set(newPart.id.toString(), newPart));
            };
            const handleMonumentPartDelete = (ctx: any, part: any) => {
                setMonumentParts(prev => { const newMap = new Map(prev); newMap.delete(part.id.toString()); return newMap; });
            };

            // Large Quarry handlers - for minimap quarry type labels (Stone/Sulfur/Metal Quarry)
            const handleLargeQuarryInsert = (ctx: any, quarry: any) => {
                setLargeQuarries(prev => new Map(prev).set(quarry.id.toString(), quarry));
            };
            const handleLargeQuarryUpdate = (ctx: any, oldQuarry: any, newQuarry: any) => {
                setLargeQuarries(prev => new Map(prev).set(newQuarry.id.toString(), newQuarry));
            };
            const handleLargeQuarryDelete = (ctx: any, quarry: any) => {
                setLargeQuarries(prev => { const newMap = new Map(prev); newMap.delete(quarry.id.toString()); return newMap; });
            };

            // ALK Contract handlers
            const handleAlkContractInsert = (ctx: any, contract: SpacetimeDB.AlkContract) => {
                setAlkContracts(prev => new Map(prev).set(contract.contractId.toString(), contract));
            };
            const handleAlkContractUpdate = (ctx: any, oldContract: SpacetimeDB.AlkContract, newContract: SpacetimeDB.AlkContract) => {
                setAlkContracts(prev => new Map(prev).set(newContract.contractId.toString(), newContract));
            };
            const handleAlkContractDelete = (ctx: any, contract: SpacetimeDB.AlkContract) => {
                setAlkContracts(prev => { const newMap = new Map(prev); newMap.delete(contract.contractId.toString()); return newMap; });
            };

            // ALK Player Contract handlers
            const handleAlkPlayerContractInsert = (ctx: any, contract: SpacetimeDB.AlkPlayerContract) => {
                setAlkPlayerContracts(prev => new Map(prev).set(contract.id.toString(), contract));
            };
            const handleAlkPlayerContractUpdate = (ctx: any, oldContract: SpacetimeDB.AlkPlayerContract, newContract: SpacetimeDB.AlkPlayerContract) => {
                setAlkPlayerContracts(prev => new Map(prev).set(newContract.id.toString(), newContract));
            };
            const handleAlkPlayerContractDelete = (ctx: any, contract: SpacetimeDB.AlkPlayerContract) => {
                setAlkPlayerContracts(prev => { const newMap = new Map(prev); newMap.delete(contract.id.toString()); return newMap; });
            };

            // ALK State handlers (single row table)
            const handleAlkStateInsert = (ctx: any, state: SpacetimeDB.AlkState) => {
                setAlkState(state);
            };
            const handleAlkStateUpdate = (ctx: any, oldState: SpacetimeDB.AlkState, newState: SpacetimeDB.AlkState) => {
                setAlkState(newState);
            };
            const handleAlkStateDelete = (ctx: any, state: SpacetimeDB.AlkState) => {
                setAlkState(null);
            };

            // Player Shard Balance handlers
            const handlePlayerShardBalanceInsert = (ctx: any, balance: SpacetimeDB.PlayerShardBalance) => {
                setPlayerShardBalance(prev => new Map(prev).set(balance.playerId.toString(), balance));
            };
            const handlePlayerShardBalanceUpdate = (ctx: any, oldBalance: SpacetimeDB.PlayerShardBalance, newBalance: SpacetimeDB.PlayerShardBalance) => {
                setPlayerShardBalance(prev => new Map(prev).set(newBalance.playerId.toString(), newBalance));
            };
            const handlePlayerShardBalanceDelete = (ctx: any, balance: SpacetimeDB.PlayerShardBalance) => {
                setPlayerShardBalance(prev => { const newMap = new Map(prev); newMap.delete(balance.playerId.toString()); return newMap; });
            };

            // Memory Grid Progress handlers
            const handleMemoryGridProgressInsert = (ctx: any, progress: SpacetimeDB.MemoryGridProgress) => {
                setMemoryGridProgress(prev => new Map(prev).set(progress.playerId.toString(), progress));
            };
            const handleMemoryGridProgressUpdate = (ctx: any, oldProgress: SpacetimeDB.MemoryGridProgress, newProgress: SpacetimeDB.MemoryGridProgress) => {
                setMemoryGridProgress(prev => new Map(prev).set(newProgress.playerId.toString(), newProgress));
            };
            const handleMemoryGridProgressDelete = (ctx: any, progress: SpacetimeDB.MemoryGridProgress) => {
                setMemoryGridProgress(prev => { const newMap = new Map(prev); newMap.delete(progress.playerId.toString()); return newMap; });
            };

            // Matronage handlers
            const handleMatronageInsert = (ctx: any, matronage: any) => {
                setMatronages(prev => new Map(prev).set(matronage.id.toString(), matronage));
            };
            const handleMatronageUpdate = (ctx: any, oldMatronage: any, newMatronage: any) => {
                setMatronages(prev => new Map(prev).set(newMatronage.id.toString(), newMatronage));
            };
            const handleMatronageDelete = (ctx: any, matronage: any) => {
                setMatronages(prev => { const newMap = new Map(prev); newMap.delete(matronage.id.toString()); return newMap; });
            };

            // Matronage Member handlers
            const handleMatronageMemberInsert = (ctx: any, member: any) => {
                setMatronageMembers(prev => new Map(prev).set(member.playerId.toHexString(), member));
            };
            const handleMatronageMemberUpdate = (ctx: any, oldMember: any, newMember: any) => {
                setMatronageMembers(prev => new Map(prev).set(newMember.playerId.toHexString(), newMember));
            };
            const handleMatronageMemberDelete = (ctx: any, member: any) => {
                setMatronageMembers(prev => { const newMap = new Map(prev); newMap.delete(member.playerId.toHexString()); return newMap; });
            };

            // Matronage Invitation handlers
            const handleMatronageInvitationInsert = (ctx: any, invitation: any) => {
                setMatronageInvitations(prev => new Map(prev).set(invitation.id.toString(), invitation));
            };
            const handleMatronageInvitationUpdate = (ctx: any, oldInvitation: any, newInvitation: any) => {
                setMatronageInvitations(prev => new Map(prev).set(newInvitation.id.toString(), newInvitation));
            };
            const handleMatronageInvitationDelete = (ctx: any, invitation: any) => {
                setMatronageInvitations(prev => { const newMap = new Map(prev); newMap.delete(invitation.id.toString()); return newMap; });
            };

            // Matronage Owed Shards handlers
            const handleMatronageOwedShardsInsert = (ctx: any, owed: any) => {
                setMatronageOwedShards(prev => new Map(prev).set(owed.playerId.toHexString(), owed));
            };
            const handleMatronageOwedShardsUpdate = (ctx: any, oldOwed: any, newOwed: any) => {
                setMatronageOwedShards(prev => new Map(prev).set(newOwed.playerId.toHexString(), newOwed));
            };
            const handleMatronageOwedShardsDelete = (ctx: any, owed: any) => {
                setMatronageOwedShards(prev => { const newMap = new Map(prev); newMap.delete(owed.playerId.toHexString()); return newMap; });
            };

            const tableBindings: GameplayTableBindings = composeGameplayTableBindings({
                progression: {
                    player_stats: { onInsert: handlePlayerStatsInsert, onUpdate: handlePlayerStatsUpdate, onDelete: handlePlayerStatsDelete },
                    achievement_definition: { onInsert: handleAchievementDefinitionInsert, onUpdate: handleAchievementDefinitionUpdate, onDelete: handleAchievementDefinitionDelete },
                    player_achievement: { onInsert: handlePlayerAchievementInsert, onUpdate: handlePlayerAchievementUpdate, onDelete: handlePlayerAchievementDelete },
                    achievement_unlock_notification: { onInsert: handleAchievementUnlockNotificationInsert, onUpdate: handleAchievementUnlockNotificationUpdate, onDelete: handleAchievementUnlockNotificationDelete },
                    level_up_notification: { onInsert: handleLevelUpNotificationInsert, onUpdate: handleLevelUpNotificationUpdate, onDelete: handleLevelUpNotificationDelete },
                    daily_login_notification: { onInsert: handleDailyLoginNotificationInsert, onUpdate: handleDailyLoginNotificationUpdate, onDelete: handleDailyLoginNotificationDelete },
                    progress_notification: { onInsert: handleProgressNotificationInsert, onUpdate: handleProgressNotificationUpdate, onDelete: handleProgressNotificationDelete },
                    comparative_stat_notification: { onInsert: handleComparativeStatNotificationInsert, onUpdate: handleComparativeStatNotificationUpdate, onDelete: handleComparativeStatNotificationDelete },
                    leaderboard_entry: { onInsert: handleLeaderboardEntryInsert, onUpdate: handleLeaderboardEntryUpdate, onDelete: handleLeaderboardEntryDelete },
                    daily_login_reward: { onInsert: handleDailyLoginRewardInsert, onUpdate: handleDailyLoginRewardUpdate, onDelete: handleDailyLoginRewardDelete },
                    plant_config_definition: { onInsert: handlePlantConfigDefinitionInsert, onUpdate: handlePlantConfigDefinitionUpdate, onDelete: handlePlantConfigDefinitionDelete },
                    player_discovered_plant: { onInsert: handleDiscoveredPlantInsert, onDelete: handleDiscoveredPlantDelete },
                    alk_contract: { onInsert: handleAlkContractInsert, onUpdate: handleAlkContractUpdate, onDelete: handleAlkContractDelete },
                    alk_player_contract: { onInsert: handleAlkPlayerContractInsert, onUpdate: handleAlkPlayerContractUpdate, onDelete: handleAlkPlayerContractDelete },
                    alk_state: { onInsert: handleAlkStateInsert, onUpdate: handleAlkStateUpdate, onDelete: handleAlkStateDelete },
                    player_shard_balance: { onInsert: handlePlayerShardBalanceInsert, onUpdate: handlePlayerShardBalanceUpdate, onDelete: handlePlayerShardBalanceDelete },
                    memory_grid_progress: { onInsert: handleMemoryGridProgressInsert, onUpdate: handleMemoryGridProgressUpdate, onDelete: handleMemoryGridProgressDelete },
                    alk_station: { onInsert: handleAlkStationInsert, onUpdate: handleAlkStationUpdate, onDelete: handleAlkStationDelete },
                    monument_part: { onInsert: handleMonumentPartInsert, onUpdate: handleMonumentPartUpdate, onDelete: handleMonumentPartDelete },
                    large_quarry: { onInsert: handleLargeQuarryInsert, onUpdate: handleLargeQuarryUpdate, onDelete: handleLargeQuarryDelete },
                },
                structures: {
                    campfire: { onInsert: handleCampfireInsert, onUpdate: handleCampfireUpdate, onDelete: handleCampfireDelete },
                    barbecue: { onInsert: handleBarbecueInsert, onUpdate: handleBarbecueUpdate, onDelete: handleBarbecueDelete },
                    furnace: { onInsert: handleFurnaceInsert, onUpdate: handleFurnaceUpdate, onDelete: handleFurnaceDelete },
                    lantern: { onInsert: handleLanternInsert, onUpdate: handleLanternUpdate, onDelete: handleLanternDelete },
                    turret: { onInsert: handleTurretInsert, onUpdate: handleTurretUpdate, onDelete: handleTurretDelete },
                    homestead_hearth: { onInsert: handleHomesteadHearthInsert, onUpdate: handleHomesteadHearthUpdate, onDelete: handleHomesteadHearthDelete },
                    broth_pot: { onInsert: handleBrothPotInsert, onUpdate: handleBrothPotUpdate, onDelete: handleBrothPotDelete },
                    wooden_storage_box: { onInsert: handleWoodenStorageBoxInsert, onUpdate: handleWoodenStorageBoxUpdate, onDelete: handleWoodenStorageBoxDelete },
                    sleeping_bag: { onInsert: handleSleepingBagInsert, onUpdate: handleSleepingBagUpdate, onDelete: handleSleepingBagDelete },
                    stash: { onInsert: handleStashInsert, onUpdate: handleStashUpdate, onDelete: handleStashDelete },
                    rain_collector: { onInsert: handleRainCollectorInsert, onUpdate: handleRainCollectorUpdate, onDelete: handleRainCollectorDelete },
                    water_patch: { onInsert: handleWaterPatchInsert, onUpdate: handleWaterPatchUpdate, onDelete: handleWaterPatchDelete },
                    fertilizer_patch: { onInsert: handleFertilizerPatchInsert, onUpdate: handleFertilizerPatchUpdate, onDelete: handleFertilizerPatchDelete },
                    fire_patch: { onInsert: handleFirePatchInsert, onUpdate: handleFirePatchUpdate, onDelete: handleFirePatchDelete },
                    placed_explosive: { onInsert: handlePlacedExplosiveInsert, onUpdate: handlePlacedExplosiveUpdate, onDelete: handlePlacedExplosiveDelete },
                    shelter: { onInsert: handleShelterInsert, onUpdate: handleShelterUpdate, onDelete: handleShelterDelete },
                    barrel: { onInsert: handleBarrelInsert, onUpdate: handleBarrelUpdate, onDelete: handleBarrelDelete },
                    road_lamppost: { onInsert: handleRoadLamppostInsert, onUpdate: handleRoadLamppostUpdate, onDelete: handleRoadLamppostDelete },
                    foundation_cell: { onInsert: handleFoundationCellInsert, onUpdate: handleFoundationCellUpdate, onDelete: handleFoundationCellDelete },
                    wall_cell: { onInsert: handleWallCellInsert, onUpdate: handleWallCellUpdate, onDelete: handleWallCellDelete },
                    door: { onInsert: handleDoorInsert, onUpdate: handleDoorUpdate, onDelete: handleDoorDelete },
                    fence: { onInsert: handleFenceInsert, onUpdate: handleFenceUpdate, onDelete: handleFenceDelete },
                },
                items: {
                    item_definition: { onInsert: handleItemDefInsert, onUpdate: handleItemDefUpdate, onDelete: handleItemDefDelete },
                    inventory_item: { onInsert: handleInventoryInsert, onUpdate: handleInventoryUpdate, onDelete: handleInventoryDelete },
                    active_equipment: { onInsert: handleActiveEquipmentInsert, onUpdate: handleActiveEquipmentUpdate, onDelete: handleActiveEquipmentDelete },
                    harvestable_resource: { onInsert: handleHarvestableResourceInsert, onUpdate: handleHarvestableResourceUpdate, onDelete: handleHarvestableResourceDelete },
                    planted_seed: { onInsert: handlePlantedSeedInsert, onUpdate: handlePlantedSeedUpdate, onDelete: handlePlantedSeedDelete },
                    dropped_item: { onInsert: handleDroppedItemInsert, onUpdate: handleDroppedItemUpdate, onDelete: handleDroppedItemDelete },
                    recipe: { onInsert: handleRecipeInsert, onUpdate: handleRecipeUpdate, onDelete: handleRecipeDelete },
                    crafting_queue_item: { onInsert: handleCraftingQueueInsert, onUpdate: handleCraftingQueueUpdate, onDelete: handleCraftingQueueDelete },
                    active_consumable_effect: { onInsert: handleActiveConsumableEffectInsert, onUpdate: handleActiveConsumableEffectUpdate, onDelete: handleActiveConsumableEffectDelete },
                    ranged_weapon_stats: { onInsert: handleRangedWeaponStatsInsert, onUpdate: handleRangedWeaponStatsUpdate, onDelete: handleRangedWeaponStatsDelete },
                    player_drinking_cooldown: { onInsert: handlePlayerDrinkingCooldownInsert, onUpdate: handlePlayerDrinkingCooldownUpdate, onDelete: handlePlayerDrinkingCooldownDelete },
                    minimap_cache: { onInsert: handleMinimapCacheInsert, onUpdate: handleMinimapCacheUpdate, onDelete: handleMinimapCacheDelete },
                },
                world: {
                    tree: { onInsert: handleTreeInsert, onUpdate: handleTreeUpdate, onDelete: handleTreeDelete },
                    stone: { onInsert: handleStoneInsert, onUpdate: handleStoneUpdate, onDelete: handleStoneDelete },
                    rune_stone: { onInsert: handleRuneStoneInsert, onUpdate: handleRuneStoneUpdate, onDelete: handleRuneStoneDelete },
                    cairn: { onInsert: handleCairnInsert, onUpdate: handleCairnUpdate, onDelete: handleCairnDelete },
                    player_discovered_cairn: { onInsert: handlePlayerDiscoveredCairnInsert, onUpdate: handlePlayerDiscoveredCairnUpdate, onDelete: handlePlayerDiscoveredCairnDelete },
                    world_state: { onInsert: handleWorldStateInsert, onUpdate: handleWorldStateUpdate, onDelete: handleWorldStateDelete },
                    cloud: { onInsert: handleCloudInsert, onUpdate: handleCloudUpdate, onDelete: handleCloudDelete },
                    grass: { onInsert: handleGrassInsert, onUpdate: handleGrassUpdate, onDelete: handleGrassDelete },
                    grass_state: { onInsert: handleGrassStateInsert, onUpdate: handleGrassStateUpdate, onDelete: handleGrassStateDelete },
                    sea_stack: { onInsert: handleSeaStackInsert, onUpdate: handleSeaStackUpdate, onDelete: handleSeaStackDelete },
                    fumarole: { onInsert: handleFumaroleInsert, onUpdate: handleFumaroleUpdate, onDelete: handleFumaroleDelete },
                    basalt_column: { onInsert: handleBasaltColumnInsert, onUpdate: handleBasaltColumnUpdate, onDelete: handleBasaltColumnDelete },
                    living_coral: { onInsert: handleLivingCoralInsert, onUpdate: handleLivingCoralUpdate, onDelete: handleLivingCoralDelete },
                    chunk_weather: { onInsert: handleChunkWeatherInsert, onUpdate: handleChunkWeatherUpdate, onDelete: handleChunkWeatherDelete },
                    drone_event: { onInsert: handleDroneEventInsert, onDelete: handleDroneEventDelete },
                },
                combat: {
                    player: { onInsert: handlePlayerInsert, onUpdate: handlePlayerUpdate, onDelete: handlePlayerDelete },
                    knocked_out_status: { onInsert: handleKnockedOutStatusInsert, onUpdate: handleKnockedOutStatusUpdate, onDelete: handleKnockedOutStatusDelete },
                    projectile: { onInsert: handleProjectileInsert, onUpdate: handleProjectileUpdate, onDelete: handleProjectileDelete },
                    death_marker: { onInsert: handleDeathMarkerInsert, onUpdate: handleDeathMarkerUpdate, onDelete: handleDeathMarkerDelete },
                    player_dodge_roll_state: { onInsert: handlePlayerDodgeRollStateInsert, onUpdate: handlePlayerDodgeRollStateUpdate, onDelete: handlePlayerDodgeRollStateDelete },
                    fishing_session: { onInsert: handleFishingSessionInsert, onUpdate: handleFishingSessionUpdate, onDelete: handleFishingSessionDelete },
                    sound_event: { onInsert: handleSoundEventInsert, onUpdate: handleSoundEventUpdate, onDelete: handleSoundEventDelete },
                    continuous_sound: { onInsert: handleContinuousSoundInsert, onUpdate: handleContinuousSoundUpdate, onDelete: handleContinuousSoundDelete },
                    wild_animal: { onInsert: handleWildAnimalInsert, onUpdate: handleWildAnimalUpdate, onDelete: handleWildAnimalDelete },
                    animal_corpse: { onInsert: handleAnimalCorpseInsert, onUpdate: handleAnimalCorpseUpdate, onDelete: handleAnimalCorpseDelete },
                    caribou_breeding_data: { onInsert: handleCaribouBreedingDataInsert, onUpdate: handleCaribouBreedingDataUpdate, onDelete: handleCaribouBreedingDataDelete },
                    walrus_breeding_data: { onInsert: handleWalrusBreedingDataInsert, onUpdate: handleWalrusBreedingDataUpdate, onDelete: handleWalrusBreedingDataDelete },
                    caribou_rut_state: { onInsert: handleCaribouRutStateInsert, onUpdate: handleCaribouRutStateUpdate, onDelete: handleCaribouRutStateDelete },
                    walrus_rut_state: { onInsert: handleWalrusRutStateInsert, onUpdate: handleWalrusRutStateUpdate, onDelete: handleWalrusRutStateDelete },
                },
                social: {
                    player_corpse: { onInsert: handlePlayerCorpseInsert, onUpdate: handlePlayerCorpseUpdate, onDelete: handlePlayerCorpseDelete },
                },
            });

            const currentInitialSubs = setupGameplayConnection({
                connection,
                tableBindings,
                onFirePatchCacheHydrated: (existingFirePatches) => {
                    if (existingFirePatches.length === 0) {
                        return;
                    }

                setFirePatches(prev => {
                    const newMap = new Map(prev);
                    existingFirePatches.forEach(fp => {
                        newMap.set(fp.id.toString(), fp);
                        console.log(`[FIRE_PATCH] Added cached fire patch ${fp.id} at (${fp.posX.toFixed(1)}, ${fp.posY.toFixed(1)})`);
                    });
                    return newMap;
                });
                },
            });
            gameplaySubscriptionsRuntime.replaceNonSpatialHandles(currentInitialSubs);
            gameplaySubscriptionsRuntime.markConnectionSetupComplete();
        }
    };

    const subscribeGrassForChunk = (chunkIndex: number): SubscriptionHandle[] => {
        if (!connection) {
            return [];
        }

        try {
            console.log(`[GRASS_RESUB] Subscribing to grass/grass_state for chunk ${chunkIndex}`);
            return subscribeGrassChunk(connection, chunkIndex, GRASS_PERFORMANCE_MODE);
                        } catch (error) {
            console.error(`[GRASS_RESUB] Failed to re-subscribe grass for chunk ${chunkIndex}:`, error);
            return [];
        }
    };

    const clearGrassData = () => {
        console.log('[useSpacetimeTables] Grass disabled - clearing grass/grassState maps');
        setGrass(new Map());
        setGrassState(new Map());
    };

    const resetDataState = () => {
                if (playerRenderTimerRef.current) {
                    clearTimeout(playerRenderTimerRef.current);
                    playerRenderTimerRef.current = null;
                }

                setLocalPlayerRegistered(false);

                const mapResetters: Array<React.Dispatch<React.SetStateAction<Map<any, any>>>> = [
                    setPlayers, setTrees, setStones, setRuneStones, setCairns, setPlayerDiscoveredCairns,
                    setCampfires, setBarbecues, setFurnaces, setLanterns, setHomesteadHearths, setBrothPots,
                    setHarvestableResources, setItemDefinitions, setRecipes, setInventoryItems, setActiveEquipments,
                    setDroppedItems, setWoodenStorageBoxes, setCraftingQueueItems, setMessages, setPlayerPins,
                    setActiveConnections, setSleepingBags, setPlayerCorpses, setStashes, setRainCollectors,
            setWaterPatches, setFertilizerPatches, setFirePatches, setPlacedExplosives, setHotSprings,
            setActiveConsumableEffects, setClouds, setGrass, setGrassState, setKnockedOutStatus,
            setRangedWeaponStats, setProjectiles, setDeathMarkers, setShelters, setPlayerDodgeRollStates,
            setFishingSessions, setPlantedSeeds, setSoundEvents, setContinuousSounds,
            setPlayerDrinkingCooldowns, setWildAnimals, setAnimalCorpses, setSeaStacks, setChunkWeather,
            setFumaroles, setBasaltColumns, setLivingCorals,
                ];
                for (const resetMap of mapResetters) {
                    resetMap(new Map());
                }
                setWorldState(null);

                projectilesRef.current.clear();
                if (projectilesUpdateTimeoutRef.current) {
                    clearTimeout(projectilesUpdateTimeoutRef.current);
                    projectilesUpdateTimeoutRef.current = null;
                }

                playerDodgeRollStatesRef.current.clear();
                wildAnimalsRef.current.clear();
                if (wildAnimalsUpdateTimeoutRef.current) {
                    clearTimeout(wildAnimalsUpdateTimeoutRef.current);
                    wildAnimalsUpdateTimeoutRef.current = null;
                }

        hostileDeathCleanupTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
                hostileDeathCleanupTimeoutsRef.current.clear();
                setHostileDeathEvents([]);
    };

    useEffect(() => {
        gameplaySubscriptionsRuntime.sync({
            connection,
            viewport,
            grassEnabled,
            ensureConnectionSetup,
            subscribeToChunk,
            subscribeGrassForChunk,
            clearGrassData,
            resetDataState,
            setViewport: (nextViewport) => runtimeEngine.setWorldViewport(nextViewport),
        });
    }, [connection, viewport, grassEnabled, ensureConnectionSetup]);

    useEffect(() => {
        return () => {
            gameplaySubscriptionsRuntime.stop({
                resetDataState,
            });
        };
    }, []);

    // ─── Return: all entity state for consumers (App.tsx → GameScreen → GameCanvas) ─
    return {
        players,
        trees,
        stones,
        campfires,
        furnaces,
        barbecues,
        lanterns,
        turrets,
        homesteadHearths,
        brothPots,
        harvestableResources,
        itemDefinitions,
        inventoryItems,
        worldState,
        activeEquipments,
        droppedItems,
        woodenStorageBoxes,
        recipes,
        craftingQueueItems,
        messages,
        localPlayerRegistered,
        playerPins,
        activeConnections,
        sleepingBags,
        playerCorpses,
        stashes,
        rainCollectors,
        waterPatches,
        fertilizerPatches,
        firePatches,
        placedExplosives,
        hotSprings,
        activeConsumableEffects,
        clouds,
        droneEvents,
        grass,
        grassState, // Split tables: dynamic state (is_alive, respawn)
        knockedOutStatus,
        rangedWeaponStats,
        projectiles,
        deathMarkers,
        shelters,
        minimapCache,
        playerDodgeRollStates,
        fishingSessions,
        plantedSeeds,
        soundEvents,
        continuousSounds,
        localPlayerIdentity,
        playerDrinkingCooldowns,
        wildAnimals, // Includes hostile NPCs (Shorebound, Shardkin, DrownedWatch) with is_hostile_npc = true
        hostileDeathEvents, // Client-side death events for particle effects (no server subscription)
        animalCorpses,
        barrels,
        roadLampposts,
        seaStacks,
        foundationCells,
        wallCells,
        doors,
        fences,
        runeStones,
        cairns,
        playerDiscoveredCairns,
        chunkWeather,
        fumaroles,
        basaltColumns,
        alkStations,
        alkContracts,
        alkPlayerContracts,
        alkState,
        playerShardBalance,
        memoryGridProgress,
        monumentParts,
        largeQuarries,
        livingCorals,
        matronages,
        matronageMembers,
        matronageInvitations,
        matronageOwedShards,
        playerStats,
        achievementDefinitions,
        playerAchievements,
        achievementUnlockNotifications,
        levelUpNotifications,
        dailyLoginNotifications,
        progressNotifications,
        comparativeStatNotifications,
        leaderboardEntries,
        dailyLoginRewards,
        plantConfigDefinitions,
        discoveredPlants,
        tutorialQuestDefinitions,
        dailyQuestDefinitions,
        playerTutorialProgress,
        playerDailyQuests,
        questCompletionNotifications,
        questProgressNotifications,
        sovaQuestMessages,
        beaconDropEvents,
        caribouBreedingData,
        walrusBreedingData,
        caribouRutState,
        walrusRutState,
    };
}; 