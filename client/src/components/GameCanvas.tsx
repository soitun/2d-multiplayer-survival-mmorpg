import React, { useEffect, useRef, useCallback, useState, useMemo } from 'react';

// PERFORMANCE: Stable empty Map for fallbacks - avoids per-render allocations and GC churn
const EMPTY_MAP = new Map();
import {
  Player as SpacetimeDBPlayer,
  Tree as SpacetimeDBTree,
  Stone as SpacetimeDBStone,
  RuneStone as SpacetimeDBRuneStone,
  Cairn as SpacetimeDBCairn,
  PlayerDiscoveredCairn as SpacetimeDBPlayerDiscoveredCairn,
  Campfire as SpacetimeDBCampfire,
  Furnace as SpacetimeDBFurnace, // ADDED: Furnace import
  Barbecue as SpacetimeDBBarbecue, // ADDED: Barbecue import
  RoadLamppost as SpacetimeDBRoadLamppost, // ADDED: Aleutian whale oil lampposts
  Lantern as SpacetimeDBLantern,
  WorldState as SpacetimeDBWorldState,
  ActiveEquipment as SpacetimeDBActiveEquipment,
  InventoryItem as SpacetimeDBInventoryItem,
  ItemDefinition as SpacetimeDBItemDefinition,
  DroppedItem as SpacetimeDBDroppedItem,
  WoodenStorageBox as SpacetimeDBWoodenStorageBox,
  PlayerPin as SpacetimeDBPlayerPin,
  ActiveConnection,
  SleepingBag as SpacetimeDBSleepingBag,
  PlayerCorpse as SpacetimeDBPlayerCorpse,
  Stash as SpacetimeDBStash,
  RainCollector as SpacetimeDBRainCollector,
  BrothPot as SpacetimeDBBrothPot,
  WaterPatch as SpacetimeDBWaterPatch,
  FertilizerPatch as SpacetimeDBFertilizerPatch,
  FirePatch as SpacetimeDBFirePatch,
  PlacedExplosive as SpacetimeDBPlacedExplosive,
  Cloud as SpacetimeDBCloud,
  ActiveConsumableEffect as SpacetimeDBActiveConsumableEffect,
  Grass as SpacetimeDBGrass,
  GrassState as SpacetimeDBGrassState, // Split tables: dynamic state
  Projectile as SpacetimeDBProjectile,
  DeathMarker as SpacetimeDBDeathMarker,
  Shelter as SpacetimeDBShelter,
  MinimapCache as SpacetimeDBMinimapCache,
  WorldChunkData as SpacetimeDBWorldChunkData,
  FishingSession,
  PlantedSeed as SpacetimeDBPlantedSeed,
  PlantType as SpacetimeDBPlantType,
  PlayerDrinkingCooldown as SpacetimeDBPlayerDrinkingCooldown,
  WildAnimal as SpacetimeDBWildAnimal, // Includes hostile NPCs with is_hostile_npc = true
  AnimalCorpse as SpacetimeDBAnimalCorpse,
  Barrel as SpacetimeDBBarrel,
  Fumarole as SpacetimeDBFumarole, // ADDED: Fumarole type
  BasaltColumn as SpacetimeDBBasaltColumn, // ADDED: Basalt column type
  HarvestableResource as SpacetimeDBHarvestableResource,
  FoundationCell, // ADDED: Foundation cell type
  HomesteadHearth as SpacetimeDBHomesteadHearth, // ADDED: HomesteadHearth type
  Turret as SpacetimeDBTurret, // ADDED: Turret type
  AlkStation as SpacetimeDBAlkStation, // ADDED: ALK delivery stations
  AlkContract as SpacetimeDBAlkContract, // ADDED: ALK contracts
  AlkPlayerContract as SpacetimeDBAlkPlayerContract, // ADDED: ALK player contracts
  AlkState as SpacetimeDBAlkState, // ADDED: ALK state
  PlayerShardBalance as SpacetimeDBPlayerShardBalance, // ADDED: Player shard balances
  MemoryGridProgress as SpacetimeDBMemoryGridProgress, // ADDED: Memory Grid progress
  DroneEvent as SpacetimeDBDroneEvent,
} from '../generated';

// --- Core Hooks ---
import { useWalkingAnimationCycle, useSprintAnimationCycle, useIdleAnimationCycle, walkingAnimationFrameRef, sprintAnimationFrameRef, idleAnimationFrameRef } from '../hooks/useAnimationCycle';
import { useAssetLoader } from '../hooks/useAssetLoader';
import { useDoodadImages } from '../hooks/useDoodadImages';
import { useGameViewport } from '../hooks/useGameViewport';
import { useMousePosition } from '../hooks/useMousePosition';
import { useDayNightCycle } from '../hooks/useDayNightCycle';
import { useInteractionFinder } from '../hooks/useInteractionFinder';
import { useGameLoop } from '../hooks/useGameLoop';
import type { FrameInfo } from '../hooks/useGameLoop';
import { usePlayerHover } from '../hooks/usePlayerHover';
import { usePlantedSeedHover } from '../hooks/usePlantedSeedHover';
import { useTamedAnimalHover } from '../hooks/useTamedAnimalHover';
import { useRuneStoneHover } from '../hooks/useRuneStoneHover';
import { useMinimapInteraction } from '../hooks/useMinimapInteraction';
import { useEntityFiltering, YSortedEntityType } from '../hooks/useEntityFiltering';
import { useSpacetimeTables } from '../hooks/useSpacetimeTables';
import { useCampfireParticles, Particle } from '../hooks/useCampfireParticles';
import { useTorchParticles } from '../hooks/useTorchParticles';
import { useWardParticles, renderWardParticles } from '../hooks/useWardParticles';
import { useResourceSparkleParticles } from '../hooks/useResourceSparkleParticles';
import { useHostileDeathEffects } from '../hooks/useHostileDeathEffects';
import { useImpactParticles } from '../hooks/useImpactParticles';
import { useStructureImpactParticles } from '../hooks/useStructureImpactParticles';
import { useCloudInterpolation, InterpolatedCloudData } from '../hooks/useCloudInterpolation';
import { useGrassInterpolation, InterpolatedGrassData } from '../hooks/useGrassInterpolation';
import { useArrowBreakEffects } from '../hooks/useArrowBreakEffects';
import { useThunderEffects } from '../hooks/useThunderEffects';
import { useChunkBasedRainSounds } from '../hooks/useChunkBasedRainSounds';
import { useFireArrowParticles } from '../hooks/useFireArrowParticles';
import { useFirePatchParticles } from '../hooks/useFirePatchParticles';
import { useWorldTileCache } from '../hooks/useWorldTileCache';
import { useAmbientSounds } from '../hooks/useAmbientSounds';
import { useFurnaceParticles } from '../hooks/useFurnaceParticles';
import { useBarbecueParticles } from '../hooks/useBarbecueParticles';

import { playImmediateSound } from '../hooks/useSoundSystem';
import { useDamageEffects, shakeOffsetXRef, shakeOffsetYRef, vignetteOpacityRef } from '../hooks/useDamageEffects';
import { useSettings } from '../contexts/SettingsContext';
import { useErrorDisplay } from '../contexts/ErrorDisplayContext';
import { isAnySovaAudioPlaying } from '../hooks/useSovaSoundBox';

// --- Rendering Utilities ---
import { renderWorldBackground, renderShorelineOverlay } from '../utils/renderers/worldRenderingUtils';
import { renderCyberpunkGridBackground } from '../utils/renderers/cyberpunkGridBackground';
import { getCollisionShapesForDebug, CollisionShape, PLAYER_RADIUS as CLIENT_PLAYER_RADIUS, COLLISION_OFFSETS } from '../utils/clientCollision'; // ADDED: Collision debug rendering
import { renderAttackRangeDebug } from '../utils/renderers/attackRangeDebugUtils'; // Attack range debug visualization
import { renderChunkBoundaries, renderInteriorDebug, renderCollisionDebug, renderYSortDebug, renderProjectileCollisionDebug } from '../utils/renderers/debugOverlayUtils'; // Consolidated debug overlays
import { renderMobileTapAnimation } from '../utils/renderers/mobileRenderingUtils'; // Mobile-specific rendering
import { renderYSortedEntities } from '../utils/renderers/renderingUtils';
import { renderAllFootprints } from '../utils/renderers/terrainTrailUtils';
import { renderWardRadius, LANTERN_TYPE_LANTERN } from '../utils/renderers/lanternRenderingUtils';
import { preloadMonumentImages } from '../utils/renderers/monumentRenderingUtils';
import { renderFoundationTargetIndicator, renderWallTargetIndicator, renderFenceTargetIndicator } from '../utils/renderers/foundationRenderingUtils'; // ADDED: Foundation, wall, and fence target indicators
import { renderInteractionLabels, renderLocalPlayerStatusTags } from '../utils/renderers/labelRenderingUtils';
import { renderPlacementPreview, isPlacementTooFar } from '../utils/renderers/placementRenderingUtils';
import { detectHotSprings } from '../utils/hotSpringDetector'; // ADDED: Hot spring detection
import { detectQuarries } from '../utils/quarryDetector'; // ADDED: Small quarry detection for building restriction zones
import { renderHotSprings } from '../utils/renderers/hotSpringRenderingUtils'; // ADDED: Hot spring rendering
import { useBuildingManager, BuildingMode, BuildingTier, FoundationShape } from '../hooks/useBuildingManager'; // ADDED: Building manager
import { BuildingRadialMenu } from './BuildingRadialMenu'; // ADDED: Building radial menu
import { UpgradeRadialMenu } from './UpgradeRadialMenu'; // ADDED: Upgrade radial menu
import { useFoundationTargeting } from '../hooks/useFoundationTargeting'; // ADDED: Foundation targeting
import { useWallTargeting } from '../hooks/useWallTargeting'; // ADDED: Wall targeting
import { useFenceTargeting } from '../hooks/useFenceTargeting'; // ADDED: Fence targeting
import { drawInteractionIndicator } from '../utils/interactionIndicator';
import { ENTITY_VISUAL_CONFIG, getIndicatorPosition } from '../utils/entityVisualConfig';
import { drawMinimapOntoCanvas } from './Minimap';
import { renderCampfire } from '../utils/renderers/campfireRenderingUtils';
import { renderBarbecue } from '../utils/renderers/barbecueRenderingUtils'; // ADDED: Barbecue renderer import
import { getFurnaceDimensions, FURNACE_TYPE_LARGE } from '../utils/renderers/furnaceRenderingUtils'; // ADDED: Furnace dimensions helper
import { isCompoundMonument } from '../config/compoundBuildings';
import { renderPlayerCorpse } from '../utils/renderers/playerCorpseRenderingUtils';
import { renderStash } from '../utils/renderers/stashRenderingUtils';
import { renderCampfireLight, renderLanternLight, renderFurnaceLight, renderBarbecueLight, renderRoadLamppostLight, renderBuoyLight, renderAllPlayerLights, renderFishingVillageCampfireLight, renderSovaAura } from '../utils/renderers/lightRenderingUtils';
import { renderRuneStoneNightLight } from '../utils/renderers/runeStoneRenderingUtils';
import { renderAllShipwreckNightLights, renderAllShipwreckDebugZones } from '../utils/renderers/shipwreckRenderingUtils';
import { renderCompoundEerieLights } from '../utils/renderers/compoundEerieLightUtils';
import { preloadCairnImages } from '../utils/renderers/cairnRenderingUtils';
import { preloadRoadLamppostImages } from '../utils/renderers/roadLamppostRenderingUtils';
import { renderTree, renderTreeCanopyShadowsOverlay } from '../utils/renderers/treeRenderingUtils';
import { renderTillerPreview } from '../utils/renderers/tillerPreviewRenderingUtils';
import { renderCloudsDirectly } from '../utils/renderers/cloudRenderingUtils';
import { renderDronesDirectly, getInterpolatedDrones } from '../utils/renderers/droneRenderingUtils';
import { useFallingTreeAnimations } from '../hooks/useFallingTreeAnimations';
import { renderProjectile, cleanupProjectileTrackingForDeleted } from '../utils/renderers/projectileRenderingUtils';
import { renderShelter } from '../utils/renderers/shelterRenderingUtils';
import { setShelterClippingData } from '../utils/renderers/shadowUtils';
import { renderRain } from '../utils/renderers/rainRenderingUtils';
import { renderCombinedHealthOverlays } from '../utils/renderers/healthOverlayUtils';
import { renderBrothEffectsOverlays } from '../utils/renderers/brothEffectsOverlayUtils';
import { renderInsanityOverlay } from '../utils/renderers/insanityOverlayUtils';
import { renderWeatherOverlay } from '../utils/renderers/weatherOverlayUtils';
import { calculateChunkIndex } from '../utils/chunkUtils';
import { renderWaterOverlay } from '../utils/renderers/waterOverlayUtils';
import { FpsProfiler, mark, getRecordButtonBounds } from '../utils/profiler';
import { renderPlayer, isPlayerHovered, getSpriteCoordinates } from '../utils/renderers/playerRenderingUtils';
import { renderSeaStackSingle, renderSeaStackShadowOnly, renderSeaStackBottomOnly, renderSeaStackUnderwaterSilhouette, renderSeaStackShadowsOverlay } from '../utils/renderers/seaStackRenderingUtils';
import { renderBarrelUnderwaterSilhouette, renderSeaBarrelWaterShadowOnly } from '../utils/renderers/barrelRenderingUtils';
import { renderWaterPatches } from '../utils/renderers/waterPatchRenderingUtils';
import { renderFertilizerPatches } from '../utils/renderers/fertilizerPatchRenderingUtils';
import { renderFirePatches } from '../utils/renderers/firePatchRenderingUtils';
import { renderPlacedExplosives, preloadExplosiveImages } from '../utils/renderers/explosiveRenderingUtils';
import { drawUnderwaterShadowOnly } from '../utils/renderers/swimmingEffectsUtils';
import { worldPosToTileCoords } from '../utils/renderers/placementRenderingUtils';
import { updateUnderwaterEffects, renderUnderwaterEffectsUnder, renderUnderwaterEffectsOver, renderUnderwaterVignette, clearUnderwaterEffects } from '../utils/renderers/underwaterEffectsUtils';
import { renderWildAnimal, preloadWildAnimalImages, renderBurrowEffects, cleanupBurrowTracking, processWildAnimalsForBurrowEffects } from '../utils/renderers/wildAnimalRenderingUtils';
import { renderAnimalCorpse, preloadAnimalCorpseImages } from '../utils/renderers/animalCorpseRenderingUtils';
import { renderEquippedItem } from '../utils/renderers/equippedItemRenderingUtils';
import { renderFumarole, preloadFumaroleImages } from '../utils/renderers/fumaroleRenderingUtils'; // ADDED: Fumarole rendering
import { renderBasaltColumn, preloadBasaltColumnImages } from '../utils/renderers/basaltColumnRenderingUtils'; // ADDED: Basalt column rendering

// --- Other Components & Utils ---
import DeathScreen from './DeathScreen.tsx';
import InterfaceContainer from './InterfaceContainer';
import PlantedSeedTooltip from './PlantedSeedTooltip';
import TamedAnimalTooltip from './TamedAnimalTooltip';
import { itemIcons } from '../utils/itemIconUtils';
import { PlacementItemInfo, PlacementActions } from '../hooks/usePlacementManager';
import { gameConfig, HOLD_INTERACTION_DURATION_MS, REVIVE_HOLD_DURATION_MS } from '../config/gameConfig';
import {
  CAMPFIRE_HEIGHT,
  SERVER_CAMPFIRE_DAMAGE_RADIUS,
  SERVER_CAMPFIRE_DAMAGE_CENTER_Y_OFFSET
} from '../utils/renderers/campfireRenderingUtils';
// V2 system removed due to performance issues
import { BOX_HEIGHT, BOX_TYPE_PLAYER_BEEHIVE, BOX_TYPE_WILD_BEEHIVE } from '../utils/renderers/woodenStorageBoxRenderingUtils';
import { useInputHandler } from '../hooks/useInputHandler';
import { useRemotePlayerInterpolation } from '../hooks/useRemotePlayerInterpolation';


// Define a placeholder height for Stash for indicator rendering
const STASH_HEIGHT = 40; // Adjust as needed to match stash sprite or desired indicator position

// Import cut grass effect renderer
import { renderCutGrassEffects } from '../effects/cutGrassEffect';
import { renderArrowBreakEffects } from '../effects/arrowBreakEffect';

// --- Prop Interface ---
interface GameCanvasProps {
  /** O(1) chunk map from useWorldChunkDataMap - when provided, GameCanvas skips its own subscription */
  worldChunkDataMap?: Map<string, any>;
  players: Map<string, SpacetimeDBPlayer>;
  trees: Map<string, SpacetimeDBTree>;
  clouds: Map<string, SpacetimeDBCloud>;
  droneEvents: Map<string, SpacetimeDBDroneEvent>;
  stones: Map<string, SpacetimeDBStone>;
  runeStones: Map<string, SpacetimeDBRuneStone>;
  cairns: Map<string, SpacetimeDBCairn>;
  playerDiscoveredCairns: Map<string, SpacetimeDBPlayerDiscoveredCairn>;
  campfires: Map<string, SpacetimeDBCampfire>;
  furnaces: Map<string, SpacetimeDBFurnace>; // ADDED: Furnaces prop
  barbecues: Map<string, SpacetimeDBBarbecue>; // ADDED: Barbecues prop
  lanterns: Map<string, SpacetimeDBLantern>;
  turrets: Map<string, SpacetimeDBTurret>; // ADDED: Turret prop
  harvestableResources: Map<string, SpacetimeDBHarvestableResource>;
  droppedItems: Map<string, SpacetimeDBDroppedItem>;
  woodenStorageBoxes: Map<string, SpacetimeDBWoodenStorageBox>;
  sleepingBags: Map<string, SpacetimeDBSleepingBag>;
  playerCorpses: Map<string, SpacetimeDBPlayerCorpse>;
  stashes: Map<string, SpacetimeDBStash>;
  rainCollectors: Map<string, SpacetimeDBRainCollector>;
  brothPots: Map<string, SpacetimeDBBrothPot>;
  waterPatches: Map<string, SpacetimeDBWaterPatch>;
  fertilizerPatches: Map<string, SpacetimeDBFertilizerPatch>;
  firePatches: Map<string, SpacetimeDBFirePatch>;
  placedExplosives: Map<string, SpacetimeDBPlacedExplosive>;
  playerPins: Map<string, SpacetimeDBPlayerPin>;
  inventoryItems: Map<string, SpacetimeDBInventoryItem>;
  itemDefinitions: Map<string, SpacetimeDBItemDefinition>;
  activeConsumableEffects: Map<string, SpacetimeDBActiveConsumableEffect>;
  worldState: SpacetimeDBWorldState | null;
  activeConnections: Map<string, ActiveConnection> | undefined;
  localPlayerId?: string;
  connection: any | null;
  predictedPosition: { x: number; y: number } | null;
  getCurrentPositionNow: () => { x: number; y: number } | null; // ADDED: Function for exact position at firing time
  activeEquipments: Map<string, SpacetimeDBActiveEquipment>;
  grass: Map<string, SpacetimeDBGrass>;
  grassState: Map<string, SpacetimeDBGrassState>; // Split tables: dynamic state
  placementInfo: PlacementItemInfo | null;
  placementActions: PlacementActions;
  placementError: string | null;
  placementWarning: string | null;
  setPlacementWarning: (warning: string | null) => void;
  onSetInteractingWith: (target: { type: string; id: number | bigint } | null) => void;
  isMinimapOpen: boolean;
  setIsMinimapOpen: React.Dispatch<React.SetStateAction<boolean>>;
  // Initial view for InterfaceContainer (e.g., 'matronage' after creating one)
  interfaceInitialView?: 'minimap' | 'encyclopedia' | 'memory-grid' | 'alk' | 'cairns' | 'matronage' | 'leaderboard' | 'achievements';
  // Initial tab for ALK Panel (e.g., 'buy-orders' when coming from delivery panel)
  alkInitialTab?: 'seasonal' | 'materials' | 'arms' | 'armor' | 'tools' | 'provisions' | 'bonus' | 'buy-orders' | 'my-contracts';
  // Callback to reset the initial view after interface closes
  onInterfaceClose?: () => void;
  isChatting: boolean;
  messages: any;
  isSearchingCraftRecipes?: boolean;
  onSearchFocusChange?: (isFocused: boolean) => void; // Callback to block player movement when search inputs are focused
  showInventory: boolean;
  gameCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  projectiles: Map<string, SpacetimeDBProjectile>;
  addSOVAMessage?: (message: { id: string; text: string; isUser: boolean; timestamp: Date; flashTab?: boolean }) => void; // ADDED: SOVA message adder for cairn lore
  showSovaSoundBox?: (audio: HTMLAudioElement, label: string) => void; // ADDED: SOVA sound box for cairn lore audio with waveform
  onCairnNotification?: (notification: { id: string; cairnNumber: number; totalCairns: number; title: string; isFirstDiscovery: boolean; timestamp: number }) => void; // ADDED: Cairn unlock notification callback
  deathMarkers: Map<string, SpacetimeDBDeathMarker>;
  shelters: Map<string, SpacetimeDBShelter>;
  showAutotileDebug: boolean;
  showChunkBoundaries: boolean;
  showInteriorDebug: boolean;
  showCollisionDebug: boolean;
  showAttackRangeDebug: boolean;
  showYSortDebug: boolean;
  showShipwreckDebug: boolean;
  showFpsProfiler?: boolean; // FPS profiler overlay - lightweight, no extra lag when enabled
  isProfilerRecording?: boolean; // Show REC indicator when recording
  startProfilerRecording?: () => void;
  stopProfilerRecording?: () => Promise<boolean>;
  onProfilerCopied?: () => void; // Toast callback when stop & copy succeeds
  minimapCache: any; // Add this for minimapCache
  isGameMenuOpen: boolean; // Add this prop
  onAutoActionStatesChange?: (isAutoAttacking: boolean) => void;
  isFishing: boolean;
  plantedSeeds: Map<string, SpacetimeDBPlantedSeed>;
  playerDrinkingCooldowns: Map<string, SpacetimeDBPlayerDrinkingCooldown>; // Add player drinking cooldowns
  wildAnimals: Map<string, SpacetimeDBWildAnimal>; // Includes hostile NPCs with is_hostile_npc = true
  hostileDeathEvents: Array<{ id: string, x: number, y: number, species: string, timestamp: number }>; // Client-side death events for particles
  animalCorpses: Map<string, SpacetimeDBAnimalCorpse>;
  barrels: Map<string, SpacetimeDBBarrel>; // Add barrels
  roadLampposts?: Map<string, SpacetimeDBRoadLamppost>; // ADDED: Aleutian whale oil lampposts along roads
  fumaroles: Map<string, SpacetimeDBFumarole>; // ADDED: Fumaroles
  basaltColumns: Map<string, SpacetimeDBBasaltColumn>; // ADDED: Basalt columns
  livingCorals: Map<string, any>; // Living coral for underwater harvesting (uses combat system)
  seaStacks: Map<string, any>; // Add sea stacks
  homesteadHearths: Map<string, SpacetimeDBHomesteadHearth>; // ADDED: HomesteadHearths
  foundationCells: Map<string, any>; // ADDED: Building foundations
  wallCells: Map<string, any>; // ADDED: Building walls
  doors: Map<string, any>; // ADDED: Building doors
  fences: Map<string, any>; // ADDED: Building fences
  setMusicPanelVisible: React.Dispatch<React.SetStateAction<boolean>>;
  movementDirection: { x: number; y: number };
  isAutoWalking: boolean; // Auto-walk state for dodge roll detection
  playerDodgeRollStates: Map<string, any>; // PlayerDodgeRollState from generated types
  // ADD: Local facing direction for instant visual feedback (client-authoritative)
  localFacingDirection?: string;
  // Chunk-based weather data
  chunkWeather: Map<string, any>;
  // ALK delivery stations for minimap
  alkStations?: Map<string, SpacetimeDBAlkStation>;
  // ALK contracts for provisioning board
  alkContracts?: Map<string, SpacetimeDBAlkContract>;
  // Player's accepted ALK contracts
  alkPlayerContracts?: Map<string, SpacetimeDBAlkPlayerContract>;
  // ALK system state
  alkState?: SpacetimeDBAlkState | null;
  // Player shard balances
  playerShardBalance?: Map<string, SpacetimeDBPlayerShardBalance>;
  // Memory Grid progress for crafting unlocks
  memoryGridProgress?: Map<string, SpacetimeDBMemoryGridProgress>;
  // Unified monument parts (all monument types, dynamically placed during world generation)
  monumentParts?: Map<string, any>;
  // Large quarry locations with types for minimap labels (Stone/Sulfur/Metal Quarry)
  largeQuarries?: Map<string, any>;
  // showWeatherOverlay, showStatusOverlays, treeShadowsEnabled, alwaysShowPlayerNames,
  // environmentalVolume are now in SettingsContext.

  // Matronage system
  matronages?: Map<string, any>;
  matronageMembers?: Map<string, any>;
  matronageInvitations?: Map<string, any>;
  matronageOwedShards?: Map<string, any>;
  // Leaderboard entries
  leaderboardEntries?: Map<string, any>;
  // Achievements data
  achievementDefinitions?: Map<string, any>;
  playerAchievements?: Map<string, any>;
  // Plant encyclopedia data
  plantConfigs?: Map<string, any>;
  // Plants discovered by current player (for encyclopedia filtering)
  discoveredPlants?: Map<string, any>;

  // Player stats for title display on name labels
  playerStats?: Map<string, any>;

  // Ranged weapon stats for auto-fire detection
  rangedWeaponStats?: Map<string, any>;

  // Mobile controls
  isMobile?: boolean;
  onMobileTap?: (worldX: number, worldY: number) => void;
  tapAnimation?: { x: number; y: number; startTime: number } | null;
  onMobileInteractInfoChange?: (info: { hasTarget: boolean; label?: string } | null) => void;
  mobileInteractTrigger?: number;

  // Memory Beacon server events (airdrop-style)
  beaconDropEvents?: Map<string, any>;

  // Animal breeding system data for age-based rendering and pregnancy indicators
  caribouBreedingData?: Map<string, any>; // Caribou sex, age stage, and pregnancy
  walrusBreedingData?: Map<string, any>; // Walrus sex, age stage, and pregnancy
  // Animal rut state (breeding season) for tooltip
  caribouRutState?: any; // Global caribou rut state
  walrusRutState?: any; // Global walrus rut state
}

/**
 * GameCanvas Component
 *
 * The main component responsible for rendering the game world, entities, UI elements,
 * and handling the game loop orchestration. It integrates various custom hooks
 * to manage specific aspects like input, viewport, assets, day/night cycle, etc.
 */
const GameCanvas: React.FC<GameCanvasProps> = ({
  worldChunkDataMap: worldChunkDataMapProp,
  players,
  trees,
  clouds,
  droneEvents,
  stones,
  runeStones,
  cairns,
  playerDiscoveredCairns,
  campfires,
  furnaces, // ADDED: Furnaces destructuring
  barbecues, // ADDED: Barbecues destructuring
  lanterns,
  turrets, // ADDED: Turrets destructuring
  harvestableResources,
  droppedItems,
  woodenStorageBoxes,
  sleepingBags,
  playerCorpses,
  stashes,
  rainCollectors,
  brothPots,
  waterPatches,
  fertilizerPatches,
  firePatches,
  placedExplosives,
  playerPins,
  inventoryItems,
  itemDefinitions,
  activeConsumableEffects,
  worldState,
  localPlayerId,
  connection,
  predictedPosition,
  getCurrentPositionNow,
  activeEquipments,
  activeConnections,
  placementInfo,
  placementActions,
  placementError,
  placementWarning,
  setPlacementWarning,
  onSetInteractingWith,
  isMinimapOpen,
  setIsMinimapOpen,
  interfaceInitialView,
  alkInitialTab,
  onInterfaceClose,
  isChatting,
  messages,
  isSearchingCraftRecipes,
  onSearchFocusChange,
  showInventory,
  grass,
  grassState,
  gameCanvasRef,
  projectiles,
  deathMarkers,
  shelters,
  showAutotileDebug,
  showChunkBoundaries,
  showInteriorDebug,
  showCollisionDebug,
  showAttackRangeDebug,
  showYSortDebug,
  showShipwreckDebug,
  showFpsProfiler = false,
  isProfilerRecording = false,
  startProfilerRecording,
  stopProfilerRecording,
  onProfilerCopied,
  minimapCache,
  isGameMenuOpen,
  onAutoActionStatesChange,
  isFishing,
  plantedSeeds,
  playerDrinkingCooldowns,
  wildAnimals,
  hostileDeathEvents,
  animalCorpses,
  barrels,
  roadLampposts,
  fumaroles, // ADDED: Fumaroles destructuring
  basaltColumns, // ADDED: Basalt columns destructuring
  livingCorals, // Living coral for underwater harvesting (uses combat system)
  seaStacks,
  homesteadHearths, // ADDED: HomesteadHearths destructuring
  foundationCells, // ADDED: Building foundations
  wallCells, // ADDED: Building walls
  doors, // ADDED: Building doors
  fences, // ADDED: Building fences
  setMusicPanelVisible,
  movementDirection,
  isAutoWalking, // Auto-walk state for dodge roll detection
  addSOVAMessage, // ADDED: SOVA message adder for cairn lore
  showSovaSoundBox, // ADDED: SOVA sound box for cairn lore audio with waveform
  onCairnNotification, // ADDED: Cairn unlock notification callback
  playerDodgeRollStates,
  localFacingDirection, // ADD: Destructure local facing direction for client-authoritative direction changes
  chunkWeather, // Chunk-based weather data
  alkStations, // ALK delivery stations for minimap
  monumentParts, // Unified monument parts (all monument types)
  largeQuarries, // Large quarry locations with types for minimap labels
  alkContracts, // ALK contracts for provisioning board
  alkPlayerContracts, // Player's accepted ALK contracts
  alkState, // ALK system state
  playerShardBalance, // Player shard balances
  memoryGridProgress, // Memory Grid progress for crafting unlocks
  // Matronage system
  matronages, // Matronage pooled rewards organizations
  matronageMembers, // Matronage membership tracking
  matronageInvitations, // Pending matronage invitations
  matronageOwedShards, // Owed shard balances from matronage
  leaderboardEntries, // Leaderboard entries
  achievementDefinitions, // Achievement definitions
  playerAchievements, // Player unlocked achievements
  plantConfigs, // Plant encyclopedia data
  discoveredPlants, // Plants discovered by current player
  playerStats, // Player stats for title display on name labels
  rangedWeaponStats, // Ranged weapon stats for auto-fire detection
  // Mobile controls
  isMobile = false,
  onMobileTap,
  tapAnimation,
  onMobileInteractInfoChange,
  mobileInteractTrigger,
  // Memory Beacon server events (airdrop-style)
  beaconDropEvents,
  // Animal breeding system data for age-based rendering and pregnancy indicators
  caribouBreedingData,
  walrusBreedingData,
  // Animal rut state (breeding season) for tooltip
  caribouRutState,
  walrusRutState,
}) => {
  // --- Settings from context (audio + visual) ---
  const {
    environmentalVolume,
    treeShadowsEnabled,
    weatherOverlayEnabled: showWeatherOverlay,
    statusOverlaysEnabled: showStatusOverlays,
    alwaysShowPlayerNames,
  } = useSettings();

  const { showError } = useErrorDisplay();

  // --- Refs ---
  const frameNumber = useRef(0);
  const lastPositionsRef = useRef<Map<string, { x: number, y: number }>>(new Map());
  const placementActionsRef = useRef(placementActions);
  const lastPlacementWarningRef = useRef<string | null>(null);
  const prevPlayerHealthRef = useRef<number | undefined>(undefined);
  const [damagingCampfireIds, setDamagingCampfireIds] = useState<Set<string>>(new Set());
  const burnSoundPlayedRef = useRef<Set<string>>(new Set()); // Track which burn effects we've played sounds for

  // Minimap canvas ref for the InterfaceContainer
  const minimapCanvasRef = useRef<HTMLCanvasElement>(null);

  // Track minimap canvas size for hook (must be declared before useMinimapInteraction)
  // Initial value of 1 - will be set by useEffect when minimap opens
  const [minimapCanvasSizeState, setMinimapCanvasSizeState] = useState({ width: 1, height: 1 });

  // Minimap weather overlay state (separate from game canvas weather overlay)
  // This controls the informative weather display on the minimap (always available)
  const [minimapShowWeatherOverlay, setMinimapShowWeatherOverlay] = useState<boolean>(() => {
    const saved = localStorage.getItem('minimap_show_weather_overlay');
    return saved !== null ? saved === 'true' : false;
  });

  // Minimap show names state (for shipwreck labels, etc.)
  const [minimapShowNames, setMinimapShowNames] = useState<boolean>(() => {
    const saved = localStorage.getItem('minimap_show_names');
    return saved !== null ? saved === 'true' : true; // Default to true (show by default)
  });

  // PERFORMANCE: Ref instead of state - avoids React re-render every frame when drones active
  // Minimap RAF loop calls drawMinimapRef directly instead of triggering useEffect via setState
  const minimapDrawRef = useRef<() => void>(() => {});

  // Particle system refs
  const campfireParticlesRef = useRef<Particle[]>([]);
  const torchParticlesRef = useRef<Particle[]>([]);
  // PERFORMANCE: Cache memory particle gradients by (color, radiusBucket) - avoids GC spikes from per-particle gradient creation
  const memoryParticleGradientCacheRef = useRef<Map<string, CanvasGradient>>(new Map());
  const particleBucketsRef = useRef<{
    fire: any[];
    ember: any[];
    spark: any[];
    other: any[];
    memory: any[];
    regularSmoke: any[];
  }>({
    fire: [],
    ember: [],
    spark: [],
    other: [],
    memory: [],
    regularSmoke: [],
  });

  // High-frequency value refs (to avoid renderGame dependency array churn)
  // NOTE: Animation frame refs are now imported directly from useAnimationCycle.ts
  // walkingAnimationFrameRef, sprintAnimationFrameRef, idleAnimationFrameRef are module-level exports
  const worldMousePosRef = useRef<{ x: number | null; y: number | null }>({ x: 0, y: 0 });
  const cameraOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const predictedPositionRef = useRef<{ x: number; y: number } | null>(null);
  const interpolatedCloudsRef = useRef<Map<string, any>>(new Map());
  const cycleProgressRef = useRef<number>(0.375);
  const ySortedEntitiesRef = useRef<any[]>([]);

  // Phase 3d: Reusable scratch objects for render hot path (avoid spread-operator allocation)
  const swimmingPlayerScratchRef = useRef<Partial<SpacetimeDBPlayer> & { positionX: number; positionY: number }>({ positionX: 0, positionY: 0 });
  const swimmingPlayerTopHalfScratchRef = useRef<{ entity: SpacetimeDBPlayer; playerId: string; yPosition: number }>({ entity: null as any, playerId: '', yPosition: 0 });
  const localPlayerScratchRef = useRef<Record<string, unknown>>({ positionX: 0, positionY: 0, direction: 0 });

  // Phase 4b: Ref for frequently-changing renderGame deps (reduces callback recreation)
  const renderGameDepsRef = useRef<{
    messages: any;
    projectiles: Map<string, SpacetimeDBProjectile>;
    holdInteractionProgress: { targetId: string | number | bigint | null; targetType: string; startTime: number } | null;
    isActivelyHolding: boolean;
    closestInteractableHarvestableResourceId: bigint | null;
    closestInteractableCampfireId: number | bigint | null;
    closestInteractableDroppedItemId: number | bigint | null;
    closestInteractableBoxId: number | bigint | null;
    isClosestInteractableBoxEmpty: boolean;
    closestInteractableWaterPosition: { x: number; y: number } | null;
    closestInteractableStashId: number | bigint | null;
    closestInteractableSleepingBagId: number | bigint | null;
    closestInteractableDoorId: number | bigint | null;
    closestInteractableTarget: any;
    unifiedInteractableTarget: any;
    closestInteractableKnockedOutPlayerId: string | null;
    closestInteractableCorpseId: number | bigint | null;
    closestInteractableAlkStationId: number | bigint | null;
    closestInteractableCairnId: number | bigint | null;
    closestInteractableMilkableAnimalId: number | bigint | null;
  }>({
    messages: new Map(),
    projectiles: new Map(),
    holdInteractionProgress: null,
    isActivelyHolding: false,
    closestInteractableHarvestableResourceId: null,
    closestInteractableCampfireId: null,
    closestInteractableDroppedItemId: null,
    closestInteractableBoxId: null,
    isClosestInteractableBoxEmpty: false,
    closestInteractableWaterPosition: null,
    closestInteractableStashId: null,
    closestInteractableSleepingBagId: null,
    closestInteractableDoorId: null,
    closestInteractableTarget: null,
    unifiedInteractableTarget: null,
    closestInteractableKnockedOutPlayerId: null,
    closestInteractableCorpseId: null,
    closestInteractableAlkStationId: null,
    closestInteractableCairnId: null,
    closestInteractableMilkableAnimalId: null,
  });

  useEffect(() => {
    placementActionsRef.current = placementActions;
  }, [placementActions]);

  // --- Core Game State Hooks ---
  const localPlayer = useMemo(() => {
    if (!localPlayerId) {
      // console.log('[GameCanvas DEBUG] localPlayerId is falsy:', localPlayerId);
      return undefined;
    }
    const player = players.get(localPlayerId);
    // console.log('[GameCanvas DEBUG] localPlayerId:', localPlayerId, 'found player:', !!player, 'players.size:', players.size);
    if (player) {
      // console.log('[GameCanvas DEBUG] player position:', player.positionX, player.positionY);
      // console.log('[GameCanvas DEBUG] predicted position:', predictedPosition);
    } else {
      // console.log('[GameCanvas DEBUG] Player not found in players map. Available player IDs:', Array.from(players.keys()));
    }
    return player;
  }, [players, localPlayerId, predictedPosition]);

  // Initialize remote player interpolation
  const remotePlayerInterpolation = useRemotePlayerInterpolation();

  const { canvasSize, cameraOffsetX: baseCameraOffsetX, cameraOffsetY: baseCameraOffsetY } = useGameViewport(localPlayer, predictedPosition);

  // === AAA Combat Effects: Screen shake, vignette, heartbeat ===
  // PERFORMANCE FIX: shakeOffset and vignetteOpacity are now refs (updated by RAF loop,
  // not React state). Only low-health UI state triggers re-renders.
  const {
    isLowHealth,
    isCriticalHealth,
    heartbeatPulse
  } = useDamageEffects(localPlayer, 100); // 100 = max health

  // Camera offset WITHOUT shake - used by hooks (mouse position, day/night, etc.)
  // Screen shake is applied directly inside renderGame() by reading shakeOffsetXRef/YRef,
  // which avoids triggering React re-renders on every shake frame.
  const cameraOffsetX = baseCameraOffsetX;
  const cameraOffsetY = baseCameraOffsetY;
  // console.log('[GameCanvas DEBUG] Camera offsets:', cameraOffsetX, cameraOffsetY, 'canvas size:', canvasSize);

  const { heroImageRef, heroSprintImageRef, heroIdleImageRef, heroWaterImageRef, heroCrouchImageRef, heroDodgeImageRef, itemImagesRef, cloudImagesRef, droneImageRef, shelterImageRef } = useAssetLoader();
  const doodadImagesRef = useDoodadImages(); // Extracted to dedicated hook
  const foundationTileImagesRef = useRef<Map<string, HTMLImageElement>>(new Map()); // ADDED: Foundation tile images
  const { worldMousePos, canvasMousePos } = useMousePosition({ canvasRef: gameCanvasRef, cameraOffsetX, cameraOffsetY, canvasSize });

  // ADDED: Building manager hook (after worldMousePos is available)
  const localPlayerX = predictedPosition?.x ?? localPlayer?.positionX ?? 0;
  const localPlayerY = predictedPosition?.y ?? localPlayer?.positionY ?? 0;
  const [buildingState, buildingActions] = useBuildingManager(connection, localPlayerX, localPlayerY, activeEquipments, itemDefinitions, localPlayerId, worldMousePos.x, worldMousePos.y);

  // Check if Repair Hammer is equipped
  const hasRepairHammer = useMemo(() => {
    if (!localPlayerId || !activeEquipments || !itemDefinitions) return false;
    const equipment = activeEquipments.get(localPlayerId);
    if (!equipment?.equippedItemDefId) return false;
    const itemDef = itemDefinitions.get(String(equipment.equippedItemDefId));
    return itemDef?.name === 'Repair Hammer';
  }, [localPlayerId, activeEquipments, itemDefinitions]);

  // Check if Stone Tiller is equipped (for tile preview)
  const hasStoneTiller = useMemo(() => {
    if (!localPlayerId || !activeEquipments || !itemDefinitions) return false;
    const equipment = activeEquipments.get(localPlayerId);
    if (!equipment?.equippedItemDefId) return false;
    const itemDef = itemDefinitions.get(String(equipment.equippedItemDefId));
    return itemDef?.name === 'Stone Tiller';
  }, [localPlayerId, activeEquipments, itemDefinitions]);

  // Foundation targeting when Repair Hammer is equipped
  const { targetedFoundation, targetTileX, targetTileY } = useFoundationTargeting(
    connection,
    localPlayerX,
    localPlayerY,
    worldMousePos.x,
    worldMousePos.y,
    hasRepairHammer
  );

  // Wall targeting when Repair Hammer is equipped (prioritize over foundations)
  const { targetedWall, targetTileX: targetWallTileX, targetTileY: targetWallTileY } = useWallTargeting(
    connection,
    localPlayerX,
    localPlayerY,
    worldMousePos.x,
    worldMousePos.y,
    hasRepairHammer
  );

  // Fence targeting when Repair Hammer is equipped
  const { targetedFence } = useFenceTargeting(
    connection,
    localPlayerX,
    localPlayerY,
    worldMousePos.x,
    worldMousePos.y,
    hasRepairHammer
  );

  // Add a state to track when images are loaded to trigger re-renders
  const [imageLoadTrigger, setImageLoadTrigger] = useState(0);
  const lastTriggeredSizeRef = useRef(0);

  // Effect to trigger re-render when item images load (including death_marker.png for death screen)
  // Must trigger when death_marker.png arrives - it may load after burlap_sack, so we trigger on each new image
  useEffect(() => {
    const checkImages = () => {
      const currentSize = itemImagesRef.current?.size ?? 0;
      if (currentSize > lastTriggeredSizeRef.current && currentSize > 0) {
        lastTriggeredSizeRef.current = currentSize;
        setImageLoadTrigger((prev) => prev + 1);
      }
    };

    checkImages();
    const interval = setInterval(checkImages, 100);

    return () => clearInterval(interval);
  }, []);

  // Lift deathMarkerImg definition here - reactive to image loading
  const deathMarkerImg = useMemo(() => {
    const img = itemImagesRef.current?.get('death_marker.png');
    // console.log('[GameCanvas] Computing deathMarkerImg. itemImagesRef keys:', Array.from(itemImagesRef.current?.keys() || []), 'death_marker.png found:', !!img, 'trigger:', imageLoadTrigger);
    return img;
  }, [itemImagesRef, imageLoadTrigger]);

  // Minimap icon images loading using imports (Vite way)
  const [pinMarkerImg, setPinMarkerImg] = useState<HTMLImageElement | null>(null);
  const [campfireWarmthImg, setCampfireWarmthImg] = useState<HTMLImageElement | null>(null);
  const [torchOnImg, setTorchOnImg] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    // Load pin marker image using dynamic import
    import('../assets/ui/marker.png').then((module) => {
      const pinImg = new Image();
      pinImg.onload = () => {
        // console.log('[GameCanvas] Pin marker image loaded successfully');
        setPinMarkerImg(pinImg);
      };
      pinImg.onerror = () => console.error('Failed to load pin marker image');
      pinImg.src = module.default;
    });

    // Load campfire warmth image using dynamic import
    import('../assets/ui/warmth.png').then((module) => {
      const warmthImg = new Image();
      warmthImg.onload = () => {
        // console.log('[GameCanvas] Campfire warmth image loaded successfully');
        setCampfireWarmthImg(warmthImg);
      };
      warmthImg.onerror = () => console.error('Failed to load campfire warmth image');
      warmthImg.src = module.default;
    });

    // Load torch image using dynamic import
    import('../assets/items/torch_on.png').then((module) => {
      const torchImg = new Image();
      torchImg.onload = () => {
        // console.log('[GameCanvas] Torch image loaded successfully');
        setTorchOnImg(torchImg);
      };
      torchImg.onerror = () => console.error('Failed to load torch image');
      torchImg.src = module.default;
    });
  }, []);

  // useDayNightCycle hook moved after useEntityFiltering (needs buildingClusters)

  // useInteractionFinder moved after visibleWorldTiles definition

  // useInputHandler moved after unifiedInteractableTarget definition

  const animationFrame = useWalkingAnimationCycle(); // Faster, smoother walking animation
  const sprintAnimationFrame = useSprintAnimationCycle(); // Even faster animation for sprinting
  const idleAnimationFrame = useIdleAnimationCycle(); // Slower, relaxed animation for idle state

  // Track falling tree animations
  const { isTreeFalling, getFallProgress, TREE_FALL_DURATION_MS } = useFallingTreeAnimations(trees);

  // Use ref instead of state to avoid re-renders every frame
  const deltaTimeRef = useRef<number>(0);

  // Sync high-frequency values to refs (reduces renderGame dependency array churn)
  // NOTE: Animation frame refs are now directly exported from useAnimationCycle.ts - no syncing needed
  useEffect(() => { worldMousePosRef.current = worldMousePos; }, [worldMousePos]);
  useEffect(() => { cameraOffsetRef.current = { x: cameraOffsetX, y: cameraOffsetY }; }, [cameraOffsetX, cameraOffsetY]);
  useEffect(() => { predictedPositionRef.current = predictedPosition; }, [predictedPosition]);

  const interpolatedClouds = useCloudInterpolation({ serverClouds: clouds, deltaTime: deltaTimeRef.current });
  useEffect(() => { interpolatedCloudsRef.current = interpolatedClouds; }, [interpolatedClouds]);
  useEffect(() => { cycleProgressRef.current = worldState?.cycleProgress ?? 0.375; }, [worldState?.cycleProgress]);

  // Set up non-passive touch event listeners to allow preventDefault
  useEffect(() => {
    const canvas = gameCanvasRef.current;
    if (!canvas || !isMobile) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (!onMobileTap) return;

      // Only handle single touch for tap-to-walk
      if (e.touches.length !== 1) return;

      const touch = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      const screenX = touch.clientX - rect.left;
      const screenY = touch.clientY - rect.top;

      // Convert screen position to world position (subtract camera offset)
      const worldX = screenX - cameraOffsetX;
      const worldY = screenY - cameraOffsetY;

      onMobileTap(worldX, worldY);
      e.preventDefault();
    };

    const handleTouchMove = (e: TouchEvent) => {
      // Prevent scrolling while touching the canvas
      e.preventDefault();
    };

    // Add event listeners with { passive: false } to allow preventDefault
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });

    return () => {
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
    };
  }, [isMobile, onMobileTap, cameraOffsetX, cameraOffsetY]);

  // Note: ySortedEntities sync is done after useEntityFiltering hook below
  // Split tables: merge Grass (static) + GrassState (dynamic) for rendering
  const interpolatedGrass = useGrassInterpolation({
    serverGrass: grass,
    serverGrassState: grassState,
    deltaTime: deltaTimeRef.current
  });

  // PERFORMANCE FIX: Chunk cache refs moved here (before useEntityFiltering) to enable memoized worldChunkDataMap
  // This avoids creating a new Map on every render, reducing GC pressure
  const chunkCacheRef = useRef<Map<string, SpacetimeDBWorldChunkData>>(new Map());
  const chunkSizeRef = useRef<number>(8);
  const [chunkCacheVersion, setChunkCacheVersion] = useState(0);

  // PERFORMANCE FIX: Use worldChunkDataMap from parent (GameScreen) when provided, else build from internal cache
  // Parent provides O(1) map from useWorldChunkDataMap - avoids duplicate subscription
  const worldChunkDataMapInternal = useMemo(() => {
    if (chunkCacheRef.current.size === 0) return undefined;
    return new Map(chunkCacheRef.current);
  }, [chunkCacheVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  const worldChunkDataMap = worldChunkDataMapProp ?? worldChunkDataMapInternal;

  // --- Use Entity Filtering Hook ---
  const {
    visibleSleepingBags,
    visibleHarvestableResources,
    visibleDroppedItems,
    visibleCampfires,
    visibleFurnaces, // ADDED: Furnaces visible array
    visibleBarbecues, // ADDED: Barbecues visible array
    visibleHarvestableResourcesMap,
    visibleCampfiresMap,
    visibleFurnacesMap, // ADDED: Furnaces visible map
    visibleBarbecuesMap, // ADDED: Barbecues visible map
    visibleLanternsMap,
    visibleTurretsMap, // ADDED: Turrets visible map
    visibleRuneStonesMap, // ADDED: Rune stones visible map
    visibleCairns, // ADDED: Cairns visible array
    visibleCairnsMap, // ADDED: Cairns visible map
    visibleDroppedItemsMap,
    visibleBoxesMap,
    visiblePlayerCorpses,
    visibleStashes,
    visiblePlayerCorpsesMap,
    visibleStashesMap,
    visibleSleepingBagsMap,
    visibleTrees,
    visibleTreesMap,
    visibleStonesMap,
    ySortedEntities,
    visibleGrass,
    visibleGrassMap,
    visibleShelters,
    visibleSheltersMap,
    visibleLanterns,
    visibleWildAnimals,
    visibleWildAnimalsMap,
    visibleAnimalCorpses,
    visibleAnimalCorpsesMap,
    visibleBarrels,
    visibleBarrelsMap,
    visibleRoadLampposts,
    visibleRoadLamppostsMap,
    visibleFumaroles, // ADDED: Fumaroles
    visibleFumarolesMap, // ADDED: Fumaroles map
    visibleBasaltColumns, // ADDED: Basalt columns
    visibleBasaltColumnsMap, // ADDED: Basalt columns map
    visibleLivingCorals, // Living corals (uses combat system)
    visibleLivingCoralsMap, // Living corals map
    visibleSeaStacks,
    visibleSeaStacksMap,
    visibleHomesteadHearths,
    visibleHomesteadHearthsMap, // ADDED: Homestead Hearths map
    visibleDoors, // ADDED: Building doors
    visibleDoorsMap, // ADDED: Building doors map
    visibleFences, // ADDED: Building fences
    visibleFencesMap, // ADDED: Building fences map
    buildingClusters, // ADDED: Building clusters for fog of war
    playerBuildingClusterId, // ADDED: Which building the player is in
    visibleAlkStations, // ADDED: ALK delivery stations
    visibleAlkStationsMap, // ADDED: ALK delivery stations map
  } = useEntityFiltering(
    players,
    trees,
    stones,
    runeStones,
    cairns, // ADDED: Cairns to useEntityFiltering
    campfires,
    furnaces, // ADDED: Furnaces to useEntityFiltering
    barbecues, // ADDED: Barbecues to useEntityFiltering
    lanterns,
    turrets, // ADDED: Turrets to useEntityFiltering
    homesteadHearths, // ADDED: HomesteadHearths (must match function signature order)
    harvestableResources,
    droppedItems,
    woodenStorageBoxes,
    sleepingBags,
    playerCorpses,
    stashes,
    cameraOffsetX,
    cameraOffsetY,
    canvasSize.width,
    canvasSize.height,
    interpolatedGrass,
    projectiles,
    shelters,
    clouds,
    plantedSeeds,
    rainCollectors,
    brothPots,
    wildAnimals,
    animalCorpses,
    barrels,
    roadLampposts ?? EMPTY_MAP, // ADDED: Road lampposts (Aleutian whale oil lampposts along roads)
    fumaroles, // ADDED: Fumaroles
    basaltColumns, // ADDED: Basalt columns
    seaStacks,
    foundationCells, // ADDED: Building foundations
    wallCells, // ADDED: Building walls
    doors, // ADDED: Building doors
    fences, // ADDED: Building fences
    localPlayerId, // ADDED: Local player ID for building visibility
    localPlayer?.isSnorkeling ?? false, // Phase 3c: Swimming player split-render (snorkeling = full sprite)
    predictedPosition ? { x: predictedPosition.x, y: predictedPosition.y } : null, // Phase 3c fix: Predicted position for swimming top half Y-sort
    isTreeFalling, // NEW: Pass falling tree checker so falling trees stay visible
    worldChunkDataMap, // PERFORMANCE FIX: Use memoized Map instead of creating new one every render
    alkStations, // ADDED: ALK delivery stations
    monumentParts, // ADDED: Unified monument parts for rendering and interaction
    livingCorals, // Living coral for underwater harvesting (uses combat system)
  );

  // Memoize predictedPosition by coordinates so useDayNightCycle's effect doesn't re-run
  // when the parent re-renders with the same position (e.g. player stationary)
  const stablePredictedPosition = useMemo(() => {
    if (!predictedPosition) return null;
    return { x: predictedPosition.x, y: predictedPosition.y };
  }, [predictedPosition?.x, predictedPosition?.y]);

  // --- Day/Night Cycle with Indoor Light Containment ---
  // Must be after useEntityFiltering since it uses buildingClusters
  const { overlayRgba, maskCanvasRef } = useDayNightCycle({
    worldState,
    campfires,
    lanterns,
    furnaces, // Add furnaces for darkness cutouts
    barbecues, // ADDED: Barbecues for night light cutouts
    roadLampposts: roadLampposts ?? EMPTY_MAP, // ADDED: Aleutian whale oil lampposts for night light cutouts
    barrels: barrels ?? EMPTY_MAP, // ADDED: Barrels (buoys for night light cutouts)
    runeStones, // ADDED: RuneStones for night light cutouts
    firePatches, // ADDED: Fire patches for night light cutouts
    fumaroles, // ADDED: Fumaroles for heat glow at night
    monumentParts: monumentParts ?? EMPTY_MAP, // ADDED: Unified monument parts (fishing village campfire light)
    players, // Pass all players
    activeEquipments, // Pass all active equipments
    itemDefinitions, // Pass all item definitions
    cameraOffsetX,
    cameraOffsetY,
    canvasSize,
    // Add interpolation parameters for smooth torch light cutouts
    localPlayerId,
    predictedPosition: stablePredictedPosition,
    remotePlayerInterpolation,
    // Indoor light containment - clip light cutouts to building interiors
    buildingClusters,
    // Mouse position for local player's flashlight aiming (smooth 360° tracking)
    worldMouseX: worldMousePos.x,
    worldMouseY: worldMousePos.y,
  });

  // Sync ySortedEntities to ref (reduces renderGame dependency array churn)
  useEffect(() => { ySortedEntitiesRef.current = ySortedEntities; }, [ySortedEntities]);

  // Cleanup projectile tracking for deleted projectiles (player, hostile, turret - all types)
  // Prevents unbounded Map growth during long combat sessions
  useEffect(() => {
    const ids = new Set<string>();
    projectiles.forEach((_, id) => ids.add(id));
    cleanupProjectileTrackingForDeleted(ids);
  }, [projectiles]);

  // Filter shipwreck parts from unified monument parts (for night lights rendering)
  const shipwreckPartsMap = useMemo(() => {
    if (!monumentParts) return EMPTY_MAP;
    const filtered = new Map();
    monumentParts.forEach((part: any, id: string) => {
      if (part.monumentType?.tag === 'Shipwreck') {
        filtered.set(id, part);
      }
    });
    return filtered;
  }, [monumentParts]);

  // --- UI State ---
  const { hoveredPlayerIds, handlePlayerHover } = usePlayerHover();

  // --- Planted Seed Hover Detection ---
  const { hoveredSeed, hoveredSeedId } = usePlantedSeedHover(
    plantedSeeds,
    worldMousePos.x,
    worldMousePos.y
  );

  // --- Tamed Animal Hover Detection ---
  const { hoveredTamedAnimal, hoveredAnimalId } = useTamedAnimalHover(
    wildAnimals,
    worldMousePos.x,
    worldMousePos.y
  );

  // --- Rune Stone Hover Detection ---
  const { hoveredRuneStone, hoveredRuneStoneId } = useRuneStoneHover(
    runeStones,
    worldMousePos.x,
    worldMousePos.y
  );

  // --- Use the new Minimap Interaction Hook ---
  const { minimapZoom, isMouseOverMinimap, isMouseOverXButton, localPlayerPin, viewCenterOffset } = useMinimapInteraction({
    canvasRef: minimapCanvasRef, // Use minimap canvas instead of game canvas
    localPlayer,
    isMinimapOpen,
    connection,
    playerPins,
    localPlayerId,
    canvasSize: minimapCanvasSizeState, // Dynamic size based on mobile/desktop
    setIsMinimapOpen
  });

  // --- Procedural World Tile Management ---
  const { proceduralRenderer, isInitialized: isWorldRendererInitialized, updateTileCache } = useWorldTileCache();

  // Subscribe once to all compressed chunks - only when parent does NOT provide worldChunkDataMap
  // NOTE: chunkCacheRef, chunkSizeRef, chunkCacheVersion are now declared earlier (before useEntityFiltering)
  useEffect(() => {
    if (!connection || worldChunkDataMapProp !== undefined) return;

    // Row callbacks
    const handleChunkInsert = (_ctx: any, row: SpacetimeDBWorldChunkData) => {
      const key = `${row.chunkX},${row.chunkY}`;
      chunkCacheRef.current.set(key, row);
      chunkSizeRef.current = row.chunkSize || chunkSizeRef.current;
      setChunkCacheVersion(v => v + 1);
    };
    const handleChunkUpdate = (_ctx: any, _oldRow: SpacetimeDBWorldChunkData, row: SpacetimeDBWorldChunkData) => {
      const key = `${row.chunkX},${row.chunkY}`;
      chunkCacheRef.current.set(key, row);
      chunkSizeRef.current = row.chunkSize || chunkSizeRef.current;
      setChunkCacheVersion(v => v + 1);
    };
    const handleChunkDelete = (_ctx: any, row: SpacetimeDBWorldChunkData) => {
      const key = `${row.chunkX},${row.chunkY}`;
      chunkCacheRef.current.delete(key);
      setChunkCacheVersion(v => v + 1);
    };

    // Register callbacks
    connection.db.worldChunkData.onInsert(handleChunkInsert);
    connection.db.worldChunkData.onUpdate(handleChunkUpdate);
    connection.db.worldChunkData.onDelete(handleChunkDelete);

    // Subscribe to the entire table once (hundreds of rows, lightweight)
    const handle = connection
      .subscriptionBuilder()
      .onError((err: any) => console.error('[WORLD_CHUNK_DATA Sub Error]:', err))
      .subscribe('SELECT * FROM world_chunk_data');

    return () => {
      try { handle?.unsubscribe?.(); } catch { }
    };
  }, [connection, worldChunkDataMapProp]);

  // Monitor burn effects for local player and play sound when burn is applied/extended
  useEffect(() => {
    if (!localPlayerId || !activeConsumableEffects) return;

    // Find burn effects for local player
    const localPlayerBurnEffects = Array.from(activeConsumableEffects.values()).filter(
      effect => effect.playerId.toHexString() === localPlayerId && effect.effectType.tag === 'Burn'
    );

    // Track burn effects by their end time to detect when they're extended (stacked)
    if (!burnSoundPlayedRef.current) {
      burnSoundPlayedRef.current = new Set<string>();
    }

    localPlayerBurnEffects.forEach(effect => {
      const effectKey = `${effect.effectId}_${effect.endsAt.microsSinceUnixEpoch}`;

      // Play sound if this is a new effect or if the end time changed (effect was extended)
      if (!burnSoundPlayedRef.current!.has(effectKey)) {
        console.log('[BURN_SOUND] Playing burn sound for effect', effect.effectId, 'ending at', effect.endsAt.microsSinceUnixEpoch);
        playImmediateSound('player_burnt', 1.0);
        burnSoundPlayedRef.current!.add(effectKey);
      }
    });

    // Clean up old effect keys that no longer exist
    const currentEffectKeys = new Set(localPlayerBurnEffects.map(e => `${e.effectId}_${e.endsAt.microsSinceUnixEpoch}`));
    burnSoundPlayedRef.current.forEach(oldKey => {
      if (!currentEffectKeys.has(oldKey)) {
        burnSoundPlayedRef.current!.delete(oldKey);
      }
    });
  }, [activeConsumableEffects, localPlayerId]);

  // Detect hot springs from world chunk data (use prop when provided, else internal cache)
  const detectedHotSprings = useMemo(() => {
    return detectHotSprings((worldChunkDataMap ?? EMPTY_MAP) as Map<string, SpacetimeDBWorldChunkData>);
  }, [chunkCacheVersion, worldChunkDataMap]); // Recalculate when chunk data changes

  // Detect small quarries from world chunk data for building restriction zones
  const detectedQuarries = useMemo(() => {
    return detectQuarries((worldChunkDataMap ?? EMPTY_MAP) as Map<string, SpacetimeDBWorldChunkData>);
  }, [chunkCacheVersion, worldChunkDataMap]); // Recalculate when chunk data changes

  // Optimized: Memoize the integer tile coordinates for the viewport
  // This prevents visibleWorldTiles from recalculating on every sub-pixel camera movement
  const tileSize = 48; // matches server TILE_SIZE_PX
  const viewTileX = Math.floor((-cameraOffsetX) / tileSize);
  const viewTileY = Math.floor((-cameraOffsetY) / tileSize);
  // Add a buffer of 2 tiles to ensure smooth rendering at edges
  const bufferedViewTileX = viewTileX - 2;
  const bufferedViewTileY = viewTileY - 2;

  // Only recalculate when the set of visible TILES changes, not pixel offsets
  const visibleWorldTiles = useMemo(() => {
    const map = new Map<string, any>();
    const chunkSize = chunkSizeRef.current;

    // Calculate dimensions in tiles
    const tilesHorz = Math.ceil(canvasSize.width / tileSize) + 4; // +4 for buffer (2 left, 2 right)
    const tilesVert = Math.ceil(canvasSize.height / tileSize) + 4; // +4 for buffer (2 top, 2 bottom)

    const minTileX = Math.max(0, bufferedViewTileX);
    const minTileY = Math.max(0, bufferedViewTileY);
    const maxTileX = bufferedViewTileX + tilesHorz;
    const maxTileY = bufferedViewTileY + tilesVert;

    const typeFromU8 = (v: number): string => {
      switch (v) {
        case 0: return 'Grass';
        case 1: return 'Dirt';
        case 2: return 'DirtRoad';
        case 3: return 'Sea';
        case 4: return 'Beach';
        case 5: return 'Sand';
        case 6: return 'HotSpringWater'; // Hot spring water pools
        case 7: return 'Quarry'; // Quarry tiles (rocky gray-brown)
        case 8: return 'Asphalt'; // Paved compound areas
        case 9: return 'Forest'; // Dense forested areas
        case 10: return 'Tundra'; // Arctic tundra (northern regions)
        case 11: return 'Alpine'; // High-altitude rocky terrain
        case 12: return 'TundraGrass'; // Grassy patches in tundra biome
        case 13: return 'Tilled'; // Tilled soil for farming (uses Dirt graphics)
        default: return 'Grass';
      }
    };

    const chunkSource = worldChunkDataMap ?? chunkCacheRef.current;
    for (let ty = minTileY; ty < maxTileY; ty++) {
      for (let tx = minTileX; tx < maxTileX; tx++) {
        const cx = Math.floor(tx / chunkSize);
        const cy = Math.floor(ty / chunkSize);
        const chunk = chunkSource.get(`${cx},${cy}`);
        if (!chunk) continue;

        const localX = tx % chunkSize;
        const localY = ty % chunkSize;
        if (localX < 0 || localY < 0) continue;
        const idx = localY * chunk.chunkSize + localX;
        if (idx < 0 || idx >= chunk.tileTypes.length) continue;

        const t = chunk.tileTypes[idx];
        const v = chunk.variants?.[idx] ?? 0;
        const key = `${tx}_${ty}`;
        map.set(key, {
          worldX: tx,
          worldY: ty,
          tileType: { tag: typeFromU8(t) },
          variant: v,
        });
      }
    }
    return map;
  }, [bufferedViewTileX, bufferedViewTileY, canvasSize.width, canvasSize.height, chunkCacheVersion, worldChunkDataMap]);

  // Feed the renderer with only the visible tiles
  useEffect(() => {
    if (visibleWorldTiles && visibleWorldTiles.size > 0) {
      updateTileCache(visibleWorldTiles);
    }
  }, [visibleWorldTiles, updateTileCache]);

  // PERFORMANCE: Create fast lookup Map for water tile checks (O(1) instead of O(n))
  // This is critical for 50+ players checking shadow positions every frame
  const waterTileLookup = useMemo(() => {
    const lookup = new Map<string, boolean>();
    if (visibleWorldTiles) {
      visibleWorldTiles.forEach(tile => {
        const key = `${tile.worldX},${tile.worldY}`;
        lookup.set(key, tile.tileType?.tag === 'Sea');
      });
    }
    return lookup;
  }, [visibleWorldTiles]);

  // 🌊 AMBIENT SOUND: Calculate distance to nearest water tile for ocean ambience proximity
  // OPTIMIZED: Uses waterTileLookup (O(1) per check) with spiral search pattern
  // Exits early when water found, max search radius limited to ~17 tiles (800px)
  // Also throttled - only recalculates when player moves significantly (every ~2 tiles)
  const lastShoreCheckPosRef = React.useRef({ x: 0, y: 0 });
  const cachedDistanceToShoreRef = React.useRef(9999);

  const distanceToShore = useMemo(() => {
    if (!localPlayer || waterTileLookup.size === 0) {
      return 9999; // Far from shore if no data
    }

    const playerX = localPlayer.positionX;
    const playerY = localPlayer.positionY;
    const TILE_SIZE = 48;

    // THROTTLE: Only recalculate if player moved more than 2 tiles (~96px)
    const dx = playerX - lastShoreCheckPosRef.current.x;
    const dy = playerY - lastShoreCheckPosRef.current.y;
    const movedDistSq = dx * dx + dy * dy;
    if (movedDistSq < 96 * 96) {
      return cachedDistanceToShoreRef.current; // Return cached value
    }

    // Update last check position
    lastShoreCheckPosRef.current = { x: playerX, y: playerY };

    const playerTileX = Math.floor(playerX / TILE_SIZE);
    const playerTileY = Math.floor(playerY / TILE_SIZE);
    const MAX_SEARCH_RADIUS = 17; // ~800px / 48px per tile

    // Spiral search outward from player - check expanding rings
    // This is O(k) where k = tiles checked, exits early when water found
    for (let radius = 0; radius <= MAX_SEARCH_RADIUS; radius++) {
      // Check all tiles at this radius (ring around player)
      for (let offsetX = -radius; offsetX <= radius; offsetX++) {
        for (let offsetY = -radius; offsetY <= radius; offsetY++) {
          // Only check tiles on the current ring edge (not interior - already checked)
          if (Math.abs(offsetX) !== radius && Math.abs(offsetY) !== radius) continue;

          const tileKey = `${playerTileX + offsetX},${playerTileY + offsetY}`;
          if (waterTileLookup.get(tileKey)) {
            // Found water! Calculate exact distance to tile center
            const tileWorldX = (playerTileX + offsetX) * TILE_SIZE + TILE_SIZE / 2;
            const tileWorldY = (playerTileY + offsetY) * TILE_SIZE + TILE_SIZE / 2;
            const distX = playerX - tileWorldX;
            const distY = playerY - tileWorldY;
            const distance = Math.sqrt(distX * distX + distY * distY);
            cachedDistanceToShoreRef.current = distance;
            return distance;
          }
        }
      }
    }

    // No water found within search radius
    cachedDistanceToShoreRef.current = 9999;
    return 9999;
  }, [localPlayer, waterTileLookup]);

  // 🌊 AMBIENT SOUND: Distance to nearest map edge for deep ocean (open water, no waves)
  // Simple check - when player is near map boundary, play ambient ocean instead of shore waves
  const distanceToMapEdge = useMemo(() => {
    if (!localPlayer) return Infinity;
    const playerX = localPlayer.positionX ?? 0;
    const playerY = localPlayer.positionY ?? 0;
    const worldW = gameConfig.worldWidthPx;
    const worldH = gameConfig.worldHeightPx;
    return Math.min(playerX, worldW - playerX, playerY, worldH - playerY);
  }, [localPlayer]);

  // --- Interaction Finding System ---
  const {
    closestInteractableTarget,
    closestInteractableHarvestableResourceId,
    closestInteractableCampfireId,
    closestInteractableDroppedItemId,
    closestInteractableBoxId,
    isClosestInteractableBoxEmpty,
    closestInteractableCorpseId,
    closestInteractableStashId,
    closestInteractableSleepingBagId,
    closestInteractableDoorId, // ADDED: Door support
    closestInteractableAlkStationId, // ADDED: ALK station support
    closestInteractableCairnId, // ADDED: Cairn support
    closestInteractableKnockedOutPlayerId,
    closestInteractableWaterPosition,
    closestInteractableMilkableAnimalId, // ADDED: Milkable animal support
  } = useInteractionFinder({
    localPlayer,
    campfires,
    furnaces, // ADDED: Furnaces to useInteractionFinder
    barbecues, // ADDED: Barbecues to useInteractionFinder
    fumaroles, // ADDED: Fumaroles to useInteractionFinder (volcanic heat source)
    lanterns,
    turrets: visibleTurretsMap, // ADDED: Turrets to useInteractionFinder (use visible map)
    homesteadHearths, // ADDED: HomesteadHearths to useInteractionFinder
    droppedItems,
    woodenStorageBoxes,
    playerCorpses,
    stashes,
    sleepingBags,
    players,
    shelters,
    connection,
    inventoryItems,
    itemDefinitions,
    playerDrinkingCooldowns,
    rainCollectors,
    brothPots,
    doors, // ADDED: Doors to useInteractionFinder
    alkStations: visibleAlkStationsMap, // ADDED: ALK stations to useInteractionFinder
    cairns, // ADDED: Cairns to useInteractionFinder
    harvestableResources,
    worldTiles: visibleWorldTiles,
    // ADDED: Milkable animal support
    wildAnimals,
    caribouBreedingData,
    walrusBreedingData,
    worldState,
  });

  // Synthesize unified target including water when no other target exists
  const unifiedInteractableTarget = useMemo(() => {
    // If we have a regular target, use it
    if (closestInteractableTarget) return closestInteractableTarget;

    // If no regular target but we have water position, create water target
    if (closestInteractableWaterPosition) {
      return {
        type: 'water' as const,
        id: 'water',
        position: { x: closestInteractableWaterPosition.x, y: closestInteractableWaterPosition.y },
        distance: 0,
        data: undefined,
      };
    }

    return null;
  }, [closestInteractableTarget, closestInteractableWaterPosition]);

  // Profiler Record button click handler (only when profiler visible)
  const onProfilerRecordClick = useCallback((canvasX: number, canvasY: number): boolean => {
    if (!showFpsProfiler || !startProfilerRecording || !stopProfilerRecording) return false;
    const bounds = getRecordButtonBounds(canvasSize.width);
    if (!bounds) return false;
    const { x, y, w, h } = bounds;
    if (canvasX < x || canvasX > x + w || canvasY < y || canvasY > y + h) return false;
    if (isProfilerRecording) {
      stopProfilerRecording().then((ok) => {
        if (ok) onProfilerCopied?.();
      });
    } else {
      startProfilerRecording();
    }
    return true;
  }, [showFpsProfiler, isProfilerRecording, canvasSize.width, startProfilerRecording, stopProfilerRecording, onProfilerCopied]);

  // --- Action Input Handler ---
  const {
    interactionProgress: holdInteractionProgress,
    isActivelyHolding,
    currentJumpOffsetY,
    isAutoAttacking,
    isCrouching: localPlayerIsCrouching,
    showBuildingRadialMenu,
    radialMenuMouseX,
    radialMenuMouseY,
    setShowBuildingRadialMenu,
    showUpgradeRadialMenu,
    setShowUpgradeRadialMenu,
    processInputsAndActions,
  } = useInputHandler({
    canvasRef: gameCanvasRef,
    connection,
    localPlayerId: localPlayer?.identity?.toHexString(),
    localPlayer,
    predictedPosition, // ADDED: Client's predicted position for accurate projectile firing
    getCurrentPositionNow, // ADDED: Function for exact position at firing time
    activeEquipments,
    itemDefinitions,
    inventoryItems,
    placementInfo,
    placementActions,
    buildingState, // ADDED: Building state
    buildingActions, // ADDED: Building actions
    worldMousePos,
    // UNIFIED INTERACTION TARGET - single source of truth (includes water fallback)
    closestInteractableTarget: unifiedInteractableTarget,
    // Essential entity maps for validation and data lookup (optimistic shake on hit)
    trees: visibleTreesMap,
    stones: visibleStonesMap,
    livingCorals: visibleLivingCoralsMap,
    barrels: visibleBarrelsMap,
    animalCorpses: visibleAnimalCorpsesMap,
    wildAnimals: visibleWildAnimalsMap,
    woodenStorageBoxes,
    turrets: visibleTurretsMap, // ADDED: Turrets for pickup check (use visible map)
    stashes,
    players,
    cairns, // ADDED: Cairns for lore lookup
    playerDiscoveredCairns, // ADDED: Player discovery tracking
    playerCorpses: visiblePlayerCorpsesMap, // Visible map for optimistic shake + protection check
    addSOVAMessage, // ADDED: SOVA message adder for cairn lore
    showSovaSoundBox, // ADDED: SOVA sound box for cairn lore audio with waveform
    onCairnNotification, // ADDED: Cairn unlock notification callback
    onSetInteractingWith: onSetInteractingWith,
    isMinimapOpen,
    setIsMinimapOpen,
    isChatting: isChatting,
    isInventoryOpen: showInventory,
    isGameMenuOpen,
    isSearchingCraftRecipes,
    isFishing,
    setMusicPanelVisible,
    movementDirection,
    isAutoWalking, // Pass auto-walk state for dodge roll detection
    targetedFoundation, // ADDED: Pass targeted foundation to input handler
    targetedWall, // ADDED: Pass targeted wall to input handler
    targetedFence, // ADDED: Pass targeted fence to input handler
    rangedWeaponStats, // ADDED: Pass ranged weapon stats for auto-fire detection
    onProfilerRecordClick,
  });

  // Phase 4b: Sync frequently-changing values to ref (reduces renderGame dependency array churn)
  useEffect(() => {
    const d = renderGameDepsRef.current;
    d.messages = messages;
    d.projectiles = projectiles;
    d.holdInteractionProgress = holdInteractionProgress;
    d.isActivelyHolding = isActivelyHolding;
    d.closestInteractableHarvestableResourceId = closestInteractableHarvestableResourceId;
    d.closestInteractableCampfireId = closestInteractableCampfireId;
    d.closestInteractableDroppedItemId = closestInteractableDroppedItemId;
    d.closestInteractableBoxId = closestInteractableBoxId;
    d.isClosestInteractableBoxEmpty = isClosestInteractableBoxEmpty;
    d.closestInteractableWaterPosition = closestInteractableWaterPosition;
    d.closestInteractableStashId = closestInteractableStashId;
    d.closestInteractableSleepingBagId = closestInteractableSleepingBagId;
    d.closestInteractableDoorId = closestInteractableDoorId;
    d.closestInteractableTarget = closestInteractableTarget;
    d.unifiedInteractableTarget = unifiedInteractableTarget;
    d.closestInteractableKnockedOutPlayerId = closestInteractableKnockedOutPlayerId;
    d.closestInteractableCorpseId = closestInteractableCorpseId;
    d.closestInteractableAlkStationId = closestInteractableAlkStationId;
    d.closestInteractableCairnId = closestInteractableCairnId;
    d.closestInteractableMilkableAnimalId = closestInteractableMilkableAnimalId;
  }, [
    messages,
    projectiles,
    holdInteractionProgress,
    isActivelyHolding,
    closestInteractableHarvestableResourceId,
    closestInteractableCampfireId,
    closestInteractableDroppedItemId,
    closestInteractableBoxId,
    isClosestInteractableBoxEmpty,
    closestInteractableWaterPosition,
    closestInteractableStashId,
    closestInteractableSleepingBagId,
    closestInteractableDoorId,
    closestInteractableTarget,
    unifiedInteractableTarget,
    closestInteractableKnockedOutPlayerId,
    closestInteractableCorpseId,
    closestInteractableAlkStationId,
    closestInteractableCairnId,
    closestInteractableMilkableAnimalId,
  ]);

  // --- Mobile Interaction Support ---
  // Helper to get human-readable label for interaction targets
  const getInteractableLabel = useCallback((target: any): string => {
    if (!target) return '';
    switch (target.type) {
      case 'harvestable_resource': return 'PICK';
      case 'campfire': return 'FIRE';
      case 'furnace': return 'SMELT';
      case 'fumarole': return 'HEAT';
      case 'lantern': return 'LAMP';
      case 'homestead_hearth': return 'HOME';
      case 'dropped_item': return 'ITEM';
      case 'box': return 'BOX';
      case 'corpse': return 'LOOT';
      case 'stash': return 'STASH';
      case 'sleeping_bag': return 'BED';
      case 'knocked_out_player': return 'HELP';
      case 'water': return 'DRINK';
      case 'rain_collector': return 'WATER';
      case 'broth_pot': return 'COOK';
      case 'door': return 'DOOR';
      case 'alk_station': return 'ALK';
      default: return 'USE';
    }
  }, []);

  // Update mobile interact info when target changes
  useEffect(() => {
    if (onMobileInteractInfoChange && isMobile) {
      onMobileInteractInfoChange(
        unifiedInteractableTarget
          ? { hasTarget: true, label: getInteractableLabel(unifiedInteractableTarget) }
          : null
      );
    }
  }, [unifiedInteractableTarget, isMobile, onMobileInteractInfoChange, getInteractableLabel]);

  // Handle mobile interact button press - ref to track trigger value
  const lastMobileInteractTriggerRef = useRef(mobileInteractTrigger || 0);
  useEffect(() => {
    if (!isMobile || !mobileInteractTrigger || mobileInteractTrigger === lastMobileInteractTriggerRef.current) return;
    lastMobileInteractTriggerRef.current = mobileInteractTrigger;

    // Trigger interaction with current target
    if (!unifiedInteractableTarget) return;

    const target = unifiedInteractableTarget;

    // Mobile: block containers, placeables, inventory - play SOVA error instead
    const blocked = ['campfire', 'furnace', 'lantern', 'box', 'stash', 'corpse', 'sleeping_bag', 'rain_collector', 'homestead_hearth', 'fumarole', 'broth_pot', 'alk_station', 'door'];
    if (blocked.includes(target.type)) {
      if (isAnySovaAudioPlaying()) {
        showError('Not available on mobile.');
      } else if (showSovaSoundBox) {
        const audio = new Audio('/sounds/sova_error_mobile_capability.mp3');
        audio.volume = 0.8;
        showSovaSoundBox(audio, 'SOVA');
        audio.play().catch((e) => {
          console.warn('[Mobile] Failed to play capability error:', e);
        });
      }
      return;
    }

    if (connection?.reducers) {
      switch (target.type) {
        case 'harvestable_resource':
          connection.reducers.interactWithHarvestableResource(target.id as bigint);
          break;
        case 'dropped_item':
          connection.reducers.pickupDroppedItem(target.id as bigint);
          break;
        case 'door':
          connection.reducers.interactDoor(target.id as bigint);
          break;
        case 'water':
          // Water requires hold - for mobile just show a message or ignore
          console.log('[Mobile] Water drinking requires hold action - not supported in tap');
          break;
        case 'knocked_out_player':
          // Revive requires hold - for mobile just show a message or ignore
          console.log('[Mobile] Reviving requires hold action - not supported in tap');
          break;
      }
    }
  }, [mobileInteractTrigger, isMobile, unifiedInteractableTarget, connection, onSetInteractingWith, showSovaSoundBox, showError]);

  // Store the foundation/wall/fence when upgrade menu opens (prevents flickering)
  const upgradeMenuFoundationRef = useRef<FoundationCell | null>(null);
  const upgradeMenuWallRef = useRef<any | null>(null); // WallCell type
  const upgradeMenuFenceRef = useRef<any | null>(null); // Fence type
  const prevShowUpgradeRadialMenuRef = useRef(false);

  // Update stored foundation/wall/fence when menu opens (only when menu state changes from false to true)
  useEffect(() => {
    const wasOpen = prevShowUpgradeRadialMenuRef.current;
    const isOpen = showUpgradeRadialMenu;

    if (!wasOpen && isOpen) {
      // Menu just opened - store the foundation, wall, or fence (priority: wall > fence > foundation)
      if (targetedWall) {
        upgradeMenuWallRef.current = targetedWall;
        upgradeMenuFoundationRef.current = null;
        upgradeMenuFenceRef.current = null;
      } else if (targetedFence) {
        upgradeMenuFenceRef.current = targetedFence;
        upgradeMenuFoundationRef.current = null;
        upgradeMenuWallRef.current = null;
      } else if (targetedFoundation) {
        upgradeMenuFoundationRef.current = targetedFoundation;
        upgradeMenuWallRef.current = null;
        upgradeMenuFenceRef.current = null;
      }
    } else if (!isOpen) {
      // Menu closed - clear the stored foundation/wall/fence
      upgradeMenuFoundationRef.current = null;
      upgradeMenuWallRef.current = null;
      upgradeMenuFenceRef.current = null;
    }

    prevShowUpgradeRadialMenuRef.current = isOpen;
  }, [showUpgradeRadialMenu, targetedFoundation, targetedWall, targetedFence]);

  // Define camera and canvas dimensions for rendering
  const camera = { x: cameraOffsetX, y: cameraOffsetY };
  const currentCanvasWidth = canvasSize.width;
  const currentCanvasHeight = canvasSize.height;

  // Audio enabled state
  const audioEnabled = true; // You can make this configurable later

  // --- Should show death screen ---
  // Show death screen only based on isDead flag now
  const shouldShowDeathScreen = !!(localPlayer?.isDead && connection);

  // Set cursor style based on placement, but don't override if game menu is open
  const cursorStyle = isGameMenuOpen ? 'default' : (placementInfo ? 'cell' : 'crosshair');

  // CORRECTLY DERIVE localPlayerDeathMarker from the deathMarkers prop
  const localPlayerDeathMarker = useMemo(() => {
    // console.log('[GameCanvas] Computing localPlayerDeathMarker. localPlayer:', localPlayer?.identity?.toHexString(), 'deathMarkers size:', deathMarkers?.size, 'all markers:', Array.from(deathMarkers?.keys() || []));
    if (localPlayer && localPlayer.identity && deathMarkers) {
      const marker = deathMarkers.get(localPlayer.identity.toHexString());
      // console.log('[GameCanvas] Found death marker for player:', marker);
      return marker || null;
    }
    return null;
  }, [localPlayer, deathMarkers]);

  // Add debug logging for death screen
  // console.log('[GameCanvas] Death screen check:', {
  //   localPlayerIsDead: localPlayer?.isDead,
  //   hasConnection: !!connection,
  //   shouldShowDeathScreen,
  //   localPlayerDeathMarker: localPlayerDeathMarker ? 'present' : 'null',
  //   deathMarkerImg: deathMarkerImg ? 'loaded' : 'null'
  // });

  // --- Effects ---

  // Sync flashlight aim angle to server when flashlight is on
  const lastSentFlashlightAngleRef = useRef<number>(0);
  const lastFlashlightSyncTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!connection || !localPlayer?.isFlashlightOn) return;
    if (worldMousePos.x === null || worldMousePos.y === null) return;

    // Calculate aim angle from player to mouse
    const playerX = predictedPosition?.x ?? localPlayer.positionX;
    const playerY = predictedPosition?.y ?? localPlayer.positionY;
    const dx = worldMousePos.x - playerX;
    const dy = worldMousePos.y - playerY;
    const aimAngle = Math.atan2(dy, dx);

    // Only send update if angle changed significantly (>5 degrees) or enough time passed (100ms)
    const angleDiff = Math.abs(aimAngle - lastSentFlashlightAngleRef.current);
    const timeSinceLastSync = Date.now() - lastFlashlightSyncTimeRef.current;
    const angleThreshold = 0.087; // ~5 degrees in radians

    if (angleDiff > angleThreshold || timeSinceLastSync > 100) {
      lastSentFlashlightAngleRef.current = aimAngle;
      lastFlashlightSyncTimeRef.current = Date.now();

      try {
        connection.reducers.updateFlashlightAim(aimAngle);
      } catch (e) {
        // Silently ignore errors (reducer might not exist during hot reload)
      }
    }
  }, [connection, localPlayer?.isFlashlightOn, worldMousePos.x, worldMousePos.y, predictedPosition, localPlayer?.positionX, localPlayer?.positionY]);

  // Register error handlers for consumeItem reducer
  useEffect(() => {
    if (!connection) return;

    const handleConsumeItemResult = (ctx: any, itemInstanceId: bigint) => {
      console.log(`[GameCanvas] consumeItem reducer callback triggered for instance ${itemInstanceId.toString()}`);
      console.log(`[GameCanvas] Event status:`, ctx.event?.status);

      if (ctx.event?.status?.tag === 'Failed') {
        const errorMsg = ctx.event.status.value || 'Unknown error';

        // Check for brew cooldown error - SOVA voice or red box when narrative playing
        if (errorMsg === 'BREW_COOLDOWN') {
          if (isAnySovaAudioPlaying()) {
            showError('Brew cooldown active.');
          } else {
            const brewCooldownSounds = [
              '/sounds/sova_brew_cooldown.mp3',
              '/sounds/sova_brew_cooldown1.mp3',
              '/sounds/sova_brew_cooldown2.mp3',
              '/sounds/sova_brew_cooldown3.mp3'
            ];
            const randomSound = brewCooldownSounds[Math.floor(Math.random() * brewCooldownSounds.length)];
            try {
              const audio = new Audio(randomSound);
              audio.volume = 0.7;
              audio.play().catch(err => {
                console.warn(`[GameCanvas] Failed to play SOVA brew cooldown sound:`, err);
              });
            } catch (err) {
              console.warn(`[GameCanvas] Error creating brew cooldown audio:`, err);
            }
          }
        } else {
          console.error(`[GameCanvas] ❌ consumeItem failed for instance ${itemInstanceId.toString()}:`, errorMsg);
          showError(errorMsg.length > 80 ? errorMsg.slice(0, 77) + '…' : errorMsg);
        }
      } else if (ctx.event?.status?.tag === 'Committed') {
        console.log(`[GameCanvas] ✅ consumeItem succeeded for instance ${itemInstanceId.toString()}`);
      } else {
        console.log(`[GameCanvas] consumeItem status:`, ctx.event?.status);
      }
    };

    connection.reducers.onConsumeItem(handleConsumeItemResult);

    return () => {
      connection.reducers.removeOnConsumeItem(handleConsumeItemResult);
    };
  }, [connection, showError]);

  // Register error handlers for applyFertilizer reducer
  useEffect(() => {
    if (!connection) return;

    const handleApplyFertilizerResult = (ctx: any, fertilizerInstanceId: bigint) => {
      console.log(`[GameCanvas] applyFertilizer reducer callback triggered for instance ${fertilizerInstanceId.toString()}`);
      console.log(`[GameCanvas] Event status:`, ctx.event?.status);

      if (ctx.event?.status?.tag === 'Failed') {
        const errorMsg = ctx.event.status.value || 'Unknown error';
        console.error(`[GameCanvas] ❌ applyFertilizer failed for instance ${fertilizerInstanceId.toString()}:`, errorMsg);
        showError(errorMsg.length > 80 ? errorMsg.slice(0, 77) + '…' : errorMsg);
      } else if (ctx.event?.status?.tag === 'Committed') {
        console.log(`[GameCanvas] ✅ applyFertilizer succeeded for instance ${fertilizerInstanceId.toString()}`);
      } else {
        console.log(`[GameCanvas] applyFertilizer status:`, ctx.event?.status);
      }
    };

    connection.reducers.onApplyFertilizer(handleApplyFertilizerResult);

    return () => {
      connection.reducers.removeOnApplyFertilizer(handleApplyFertilizerResult);
    };
  }, [connection, showError]);

  // Register error handlers for destroy reducers
  useEffect(() => {
    if (!connection) return;

    const handleDestroyFoundationResult = (ctx: any, foundationId: bigint) => {
      console.log('[GameCanvas] destroyFoundation reducer result:', ctx.event?.status);
      if (ctx.event?.status?.tag === 'Failed') {
        const errorMsg = ctx.event.status.value || 'Failed to destroy foundation';
        console.error('[GameCanvas] destroyFoundation failed:', errorMsg);
        showError(errorMsg.length > 80 ? errorMsg.slice(0, 77) + '…' : errorMsg);
      } else if (ctx.event?.status?.tag === 'Committed') {
        console.log('[GameCanvas] destroyFoundation succeeded! Foundation', foundationId, 'destroyed');
      }
    };

    const handleDestroyWallResult = (ctx: any, wallId: bigint) => {
      console.log('[GameCanvas] destroyWall reducer result:', ctx.event?.status);
      if (ctx.event?.status?.tag === 'Failed') {
        const errorMsg = ctx.event.status.value || 'Failed to destroy wall';
        console.error('[GameCanvas] destroyWall failed:', errorMsg);
        showError(errorMsg.length > 80 ? errorMsg.slice(0, 77) + '…' : errorMsg);
      } else if (ctx.event?.status?.tag === 'Committed') {
        console.log('[GameCanvas] destroyWall succeeded! Wall', wallId, 'destroyed');
      }
    };

    const handleFireProjectileResult = (ctx: any, targetWorldX: number, targetWorldY: number) => {
      if (ctx.event?.status?.tag === 'Failed') {
        const errorMsg = ctx.event.status.value || '';

        // CRITICAL: The client only calls fireProjectile if isReadyToFire was true.
        // If we get here, it means the client thought the weapon was ready when it called fireProjectile.
        // ANY error from fireProjectile is a sync issue, not a user error.
        // The weapon state may have gotten out of sync between client and server.
        console.log('[FireProjectile] Client-server sync issue - suppressing sound for all fireProjectile errors');
        console.log('[FireProjectile] Error details:', errorMsg);
        return; // Don't play sound - this is a sync issue, not a user error
      }
    };

    const handleLoadRangedWeaponResult = (ctx: any) => {
      if (ctx.event?.status?.tag === 'Failed') {
        const errorMsg = ctx.event.status.value || '';

        // This is where the "no arrows detected" error sound should play
        // The user tried to load the weapon (right-click) but has no arrows
        console.log('[LoadRangedWeapon] Load failed - this is a legitimate user error:', errorMsg);

        // Play the error sound for legitimate loading failures
        if (errorMsg.includes('need at least 1 arrow')) {
          playImmediateSound('error_arrows', 1.0);
        }
        showError(errorMsg || 'Failed to load weapon');
      }
    };

    const handleUpgradeFoundationResult = (ctx: any, foundationId: bigint, newTier: number) => {
      if (ctx.event?.status?.tag === 'Failed') {
        const errorMsg = ctx.event.status.value || '';
        // Check if error is about building privilege
        if (errorMsg.includes('Building privilege') || errorMsg.includes('building privilege')) {
          playImmediateSound('error_building_privilege', 1.0);
        }
        // Check if error is about tier upgrade (cannot downgrade or already at tier)
        else if (errorMsg.includes('Cannot downgrade') ||
          errorMsg.includes('Current tier') ||
          errorMsg.includes('Target tier')) {
          playImmediateSound('error_tier_upgrade', 1.0);
        }
        // Check if error is about insufficient resources
        else if (errorMsg.includes('Not enough') ||
          errorMsg.includes('wood') ||
          errorMsg.includes('stone') ||
          errorMsg.includes('metal fragments') ||
          errorMsg.includes('Required:')) {
          playImmediateSound('error_resources', 1.0);
        }
        showError(errorMsg.length > 80 ? errorMsg.slice(0, 77) + '…' : errorMsg);
      }
    };

    // Generic placement error handler for all placeable items (campfire, furnace, lantern, etc.)
    // Always shows server errors (e.g. "Placement location is too far away") in the red error box
    const handlePlacementError = (ctx: any, itemName: string) => {
      const status = ctx.event?.status;
      const isFailed = status?.tag === 'Failed' || (status && typeof status === 'object' && 'Failed' in status);
      if (isFailed) {
        // Extract error message - try multiple possible SDK structures
        let errorMsg =
          (status?.tag === 'Failed' && status?.value) ||
          status?.Failed ||
          ctx.event?.message ||
          `${itemName} placement failed`;
        if (typeof errorMsg !== 'string') errorMsg = String(errorMsg);
        console.log(`[GameCanvas] ${itemName} placement failed:`, errorMsg);
        playImmediateSound('error_placement_failed', 1.0);
        showError(errorMsg.length > 80 ? errorMsg.slice(0, 77) + '…' : errorMsg);
      }
    };

    // Placement reducer error handlers
    const handlePlaceCampfireResult = (ctx: any, itemInstanceId: bigint, worldX: number, worldY: number) => {
      handlePlacementError(ctx, 'Campfire');
    };
    const handlePlaceFurnaceResult = (ctx: any, itemInstanceId: bigint, worldX: number, worldY: number) => {
      handlePlacementError(ctx, 'Furnace');
    };
    const handlePlaceLanternResult = (ctx: any, itemInstanceId: bigint, worldX: number, worldY: number) => {
      handlePlacementError(ctx, 'Lantern');
    };
    const handlePlaceWoodenStorageBoxResult = (ctx: any, itemInstanceId: bigint, worldX: number, worldY: number) => {
      handlePlacementError(ctx, 'Wooden Storage Box');
    };
    const handlePlaceSleepingBagResult = (ctx: any, itemInstanceId: bigint, worldX: number, worldY: number) => {
      handlePlacementError(ctx, 'Sleeping Bag');
    };
    const handlePlaceStashResult = (ctx: any, itemInstanceId: bigint, worldX: number, worldY: number) => {
      handlePlacementError(ctx, 'Stash');
    };
    const handlePlaceShelterResult = (ctx: any, itemInstanceId: bigint, worldX: number, worldY: number) => {
      handlePlacementError(ctx, 'Shelter');
    };
    const handlePlaceRainCollectorResult = (ctx: any, itemInstanceId: bigint, worldX: number, worldY: number) => {
      handlePlacementError(ctx, 'Rain Collector');
    };
    const handlePlaceHomesteadHearthResult = (ctx: any, itemInstanceId: bigint, worldX: number, worldY: number) => {
      handlePlacementError(ctx, "Matron's Chest");
    };
    const handlePlaceBarbecueResult = (ctx: any, itemInstanceId: bigint, worldX: number, worldY: number) => {
      handlePlacementError(ctx, 'Barbecue');
    };
    const handlePlaceTurretResult = (ctx: any, itemInstanceId: bigint, worldX: number, worldY: number) => {
      handlePlacementError(ctx, 'Turret');
    };
    const handlePlaceExplosiveResult = (ctx: any, itemInstanceId: bigint, worldX: number, worldY: number) => {
      handlePlacementError(ctx, 'Explosive');
    };

    connection.reducers.onDestroyFoundation(handleDestroyFoundationResult);
    connection.reducers.onDestroyWall(handleDestroyWallResult);
    connection.reducers.onFireProjectile(handleFireProjectileResult);
    connection.reducers.onLoadRangedWeapon(handleLoadRangedWeaponResult);
    connection.reducers.onUpgradeFoundation(handleUpgradeFoundationResult);

    // Register placement error handlers (all placement errors, including "too far away", show in red box)
    connection.reducers.onPlaceCampfire(handlePlaceCampfireResult);
    connection.reducers.onPlaceFurnace(handlePlaceFurnaceResult);
    connection.reducers.onPlaceLantern(handlePlaceLanternResult);
    connection.reducers.onPlaceWoodenStorageBox(handlePlaceWoodenStorageBoxResult);
    connection.reducers.onPlaceSleepingBag(handlePlaceSleepingBagResult);
    connection.reducers.onPlaceStash(handlePlaceStashResult);
    connection.reducers.onPlaceShelter(handlePlaceShelterResult);
    connection.reducers.onPlaceRainCollector(handlePlaceRainCollectorResult);
    connection.reducers.onPlaceHomesteadHearth(handlePlaceHomesteadHearthResult);
    connection.reducers.onPlaceBarbecue(handlePlaceBarbecueResult);
    connection.reducers.onPlaceTurret(handlePlaceTurretResult);
    connection.reducers.onPlaceExplosive(handlePlaceExplosiveResult);

    // --- Gameplay interaction error handlers (pickup, doors, cairns, milking, fishing) ---
    // Skip sync/edge-case errors: "too far", "not found" (race), "no active session"
    const handlePickupDroppedItemResult = (ctx: any, droppedItemId: bigint) => {
      if (ctx.event?.status?.tag === 'Failed') {
        const errorMsg = ctx.event.status.value || 'Cannot pick up item';
        if (errorMsg.toLowerCase().includes('too far')) return;
        if (errorMsg.toLowerCase().includes('not found')) return; // Someone else picked it up
        showError(errorMsg.length > 80 ? errorMsg.slice(0, 77) + '…' : errorMsg);
      }
    };
    const handleInteractDoorResult = (ctx: any, doorId: bigint) => {
      if (ctx.event?.status?.tag === 'Failed') {
        const errorMsg = ctx.event.status.value || 'Cannot interact with door';
        if (errorMsg.toLowerCase().includes('too far')) return;
        showError(errorMsg.length > 80 ? errorMsg.slice(0, 77) + '…' : errorMsg);
      }
    };
    const handleInteractWithCairnResult = (ctx: any, cairnId: bigint) => {
      if (ctx.event?.status?.tag === 'Failed') {
        const errorMsg = ctx.event.status.value || 'Cannot interact with cairn';
        if (errorMsg.toLowerCase().includes('too far')) return;
        showError(errorMsg.length > 80 ? errorMsg.slice(0, 77) + '…' : errorMsg);
      }
    };
    const handleMilkAnimalResult = (ctx: any, animalId: bigint) => {
      if (ctx.event?.status?.tag === 'Failed') {
        const errorMsg = ctx.event.status.value || 'Cannot milk animal';
        if (errorMsg.toLowerCase().includes('too far')) return;
        showError(errorMsg.length > 80 ? errorMsg.slice(0, 77) + '…' : errorMsg);
      }
    };
    const handleCastFishingLineResult = (ctx: any, targetX: number, targetY: number) => {
      if (ctx.event?.status?.tag === 'Failed') {
        const errorMsg = ctx.event.status.value || 'Cannot cast fishing line';
        if (errorMsg.toLowerCase().includes('too far')) return;
        showError(errorMsg.length > 80 ? errorMsg.slice(0, 77) + '…' : errorMsg);
      }
    };
    const handleFinishFishingResult = (ctx: any, success: boolean, caughtItems: string[]) => {
      if (ctx.event?.status?.tag === 'Failed') {
        const errorMsg = ctx.event.status.value || 'Fishing failed';
        if (errorMsg.toLowerCase().includes('no active') || errorMsg.toLowerCase().includes('session is not active')) return;
        showError(errorMsg.length > 80 ? errorMsg.slice(0, 77) + '…' : errorMsg);
      }
    };

    if (connection.reducers.onPickupDroppedItem) connection.reducers.onPickupDroppedItem(handlePickupDroppedItemResult);
    if (connection.reducers.onInteractDoor) connection.reducers.onInteractDoor(handleInteractDoorResult);
    if (connection.reducers.onInteractWithCairn) connection.reducers.onInteractWithCairn(handleInteractWithCairnResult);
    if (connection.reducers.onMilkAnimal) connection.reducers.onMilkAnimal(handleMilkAnimalResult);
    if (connection.reducers.onCastFishingLine) connection.reducers.onCastFishingLine(handleCastFishingLineResult);
    if (connection.reducers.onFinishFishing) connection.reducers.onFinishFishing(handleFinishFishingResult);

    return () => {
      connection.reducers.removeOnDestroyFoundation(handleDestroyFoundationResult);
      connection.reducers.removeOnDestroyWall(handleDestroyWallResult);
      connection.reducers.removeOnFireProjectile(handleFireProjectileResult);
      connection.reducers.removeOnLoadRangedWeapon(handleLoadRangedWeaponResult);
      connection.reducers.removeOnUpgradeFoundation(handleUpgradeFoundationResult);

      // Cleanup placement error handlers
      connection.reducers.removeOnPlaceCampfire(handlePlaceCampfireResult);
      connection.reducers.removeOnPlaceFurnace(handlePlaceFurnaceResult);
      connection.reducers.removeOnPlaceLantern(handlePlaceLanternResult);
      connection.reducers.removeOnPlaceWoodenStorageBox(handlePlaceWoodenStorageBoxResult);
      connection.reducers.removeOnPlaceSleepingBag(handlePlaceSleepingBagResult);
      connection.reducers.removeOnPlaceStash(handlePlaceStashResult);
      connection.reducers.removeOnPlaceShelter(handlePlaceShelterResult);
      connection.reducers.removeOnPlaceRainCollector(handlePlaceRainCollectorResult);
      connection.reducers.removeOnPlaceHomesteadHearth(handlePlaceHomesteadHearthResult);
      connection.reducers.removeOnPlaceBarbecue(handlePlaceBarbecueResult);
      connection.reducers.removeOnPlaceTurret(handlePlaceTurretResult);
      connection.reducers.removeOnPlaceExplosive(handlePlaceExplosiveResult);

      if (connection.reducers.removeOnPickupDroppedItem) connection.reducers.removeOnPickupDroppedItem(handlePickupDroppedItemResult);
      if (connection.reducers.removeOnInteractDoor) connection.reducers.removeOnInteractDoor(handleInteractDoorResult);
      if (connection.reducers.removeOnInteractWithCairn) connection.reducers.removeOnInteractWithCairn(handleInteractWithCairnResult);
      if (connection.reducers.removeOnMilkAnimal) connection.reducers.removeOnMilkAnimal(handleMilkAnimalResult);
      if (connection.reducers.removeOnCastFishingLine) connection.reducers.removeOnCastFishingLine(handleCastFishingLineResult);
      if (connection.reducers.removeOnFinishFishing) connection.reducers.removeOnFinishFishing(handleFinishFishingResult);
    };
  }, [connection, showError]);

  useEffect(() => {
    // Iterate over all known icons in itemIconUtils.ts to ensure they are preloaded
    Object.entries(itemIcons).forEach(([assetName, iconSrc]) => {
      // Ensure iconSrc is a string (path) and not already loaded
      if (iconSrc && typeof iconSrc === 'string' && !itemImagesRef.current.has(assetName)) {
        const img = new Image();
        img.src = iconSrc; // iconSrc is the imported image path
        img.onload = () => {
          itemImagesRef.current.set(assetName, img); // Store with assetName as key
        };
        img.onerror = () => console.error(`Failed to preload item image asset: ${assetName} (Source: ${iconSrc})`);
      }
    });
  }, [itemImagesRef]); // itemIcons is effectively constant from import, so run once on mount based on itemImagesRef

  // Load compound building images
  useEffect(() => {
    preloadMonumentImages();
    preloadCairnImages(); // ADDED: Preload cairn images
    preloadRoadLamppostImages(); // Aleutian whale oil lampposts (day/night variants)
  }, []);

  // Load foundation and wall tile images
  useEffect(() => {
    import('../assets/tiles/foundation_wood.png').then((module) => {
      const img = new Image();
      img.onload = () => {
        foundationTileImagesRef.current.set('foundation_wood.png', img);
      };
      img.onerror = () => console.error('Failed to load foundation_wood.png');
      img.src = module.default;
    });

    // Load twig foundation tile
    import('../assets/tiles/foundation_twig.png').then((module) => {
      const img = new Image();
      img.onload = () => {
        foundationTileImagesRef.current.set('foundation_twig.png', img);
      };
      img.onerror = () => console.error('Failed to load foundation_twig.png');
      img.src = module.default;
    });

    // Load stone foundation tile
    import('../assets/tiles/foundation_stone.png').then((module) => {
      const img = new Image();
      img.onload = () => {
        foundationTileImagesRef.current.set('foundation_stone.png', img);
      };
      img.onerror = () => console.error('Failed to load foundation_stone.png');
      img.src = module.default;
    });

    // Load metal foundation tile
    import('../assets/tiles/foundation_metal.png').then((module) => {
      const img = new Image();
      img.onload = () => {
        foundationTileImagesRef.current.set('foundation_metal.png', img);
      };
      img.onerror = () => console.error('Failed to load foundation_metal.png');
      img.src = module.default;
    });

    // Load wall tile images
    import('../assets/tiles/wall_twig.png').then((module) => {
      const img = new Image();
      img.onload = () => {
        foundationTileImagesRef.current.set('wall_twig.png', img);
      };
      img.onerror = () => console.error('Failed to load wall_twig.png');
      img.src = module.default;
    });

    import('../assets/tiles/wall_wood.png').then((module) => {
      const img = new Image();
      img.onload = () => {
        foundationTileImagesRef.current.set('wall_wood.png', img);
      };
      img.onerror = () => console.error('Failed to load wall_wood.png');
      img.src = module.default;
    });

    import('../assets/tiles/wall_stone.png').then((module) => {
      const img = new Image();
      img.onload = () => {
        foundationTileImagesRef.current.set('wall_stone.png', img);
      };
      img.onerror = () => console.error('Failed to load wall_stone.png');
      img.src = module.default;
    });

    import('../assets/tiles/wall_metal.png').then((module) => {
      const img = new Image();
      img.onload = () => {
        foundationTileImagesRef.current.set('wall_metal.png', img);
      };
      img.onerror = () => console.error('Failed to load wall_metal.png');
      img.src = module.default;
    });

    // Load ceiling tile for fog of war overlay
    import('../assets/tiles/ceiling_twig.png').then((module) => {
      const img = new Image();
      img.onload = () => {
        foundationTileImagesRef.current.set('ceiling_twig.png', img);
      };
      img.onerror = () => console.error('Failed to load ceiling_twig.png');
      img.src = module.default;
    });

    // Note: Interior wall images are no longer needed - interior walls now use the same
    // images as exterior walls with visual modifications (lighter color, bottom half, shadow)
  }, []);

  // Register reducer callbacks for wall upgrades
  useEffect(() => {
    if (!connection) return;

    const handleUpgradeWallResult = (ctx: any, wallId: bigint, newTier: number) => {
      console.log('[GameCanvas] upgradeWall reducer result:', ctx.event?.status);
      if (ctx.event?.status?.tag === 'Failed') {
        const errorMsg = ctx.event.status.value || 'Failed to upgrade wall';
        console.error('[GameCanvas] upgradeWall failed:', errorMsg);
        // Check if error is about building privilege
        if (errorMsg.includes('Building privilege') || errorMsg.includes('building privilege')) {
          playImmediateSound('error_building_privilege', 1.0);
        }
        // Check if error is about tier upgrade (cannot downgrade or already at tier)
        else if (errorMsg.includes('Cannot downgrade') ||
          errorMsg.includes('Current tier') ||
          errorMsg.includes('Target tier')) {
          playImmediateSound('error_tier_upgrade', 1.0);
        }
        // Check if error is about insufficient resources
        else if (errorMsg.includes('Not enough') ||
          errorMsg.includes('wood') ||
          errorMsg.includes('stone') ||
          errorMsg.includes('metal fragments') ||
          errorMsg.includes('Required:')) {
          playImmediateSound('error_resources', 1.0);
        }
        showError(errorMsg.length > 80 ? errorMsg.slice(0, 77) + '…' : errorMsg);
      } else if (ctx.event?.status?.tag === 'Committed') {
        console.log('[GameCanvas] upgradeWall succeeded! Wall', wallId, 'upgraded to tier', newTier);
        // The wall tier update will come through SpacetimeDB subscriptions automatically
        // The sound is played server-side via sound events
      }
    };

    connection.reducers.onUpgradeWall(handleUpgradeWallResult);

    return () => {
      connection.reducers.removeOnUpgradeWall(handleUpgradeWallResult);
    };
  }, [connection, showError]);

  // Preload images
  useEffect(() => {
    preloadWildAnimalImages();
    preloadAnimalCorpseImages();
    preloadFumaroleImages();
    preloadBasaltColumnImages();
  }, []);

  // Use arrow break effects hook
  useArrowBreakEffects({ connection });

  // Notify parent component of auto-action state changes
  useEffect(() => {
    if (onAutoActionStatesChange) {
      onAutoActionStatesChange(isAutoAttacking);
    }
  }, [isAutoAttacking, onAutoActionStatesChange]);

  // Village campfire positions for fire/smoke particles (fishing village center + hunting village campfire)
  const villageCampfirePositions = useMemo(() => {
    if (!monumentParts || monumentParts.size === 0) return [];
    const positions: { id: string; posX: number; posY: number }[] = [];
    monumentParts.forEach((part: { id: bigint; worldX: number; worldY: number; imagePath?: string; monumentType?: { tag?: string }; partType?: string; isCenter?: boolean }) => {
      const tag = part.monumentType?.tag ?? '';
      const isFishingVillageCampfire = tag === 'FishingVillage' && part.isCenter;
      const isHuntingVillageCampfire = tag === 'HuntingVillage' && part.partType === 'campfire';
      if ((isFishingVillageCampfire || isHuntingVillageCampfire) && part.imagePath === 'fv_campfire.png') {
        positions.push({ id: part.id.toString(), posX: part.worldX, posY: part.worldY });
      }
    });
    return positions;
  }, [monumentParts, monumentParts?.size]);

  // Use the particle hooks - they now run independently
  const campfireParticles = useCampfireParticles({
    visibleCampfiresMap,
    deltaTime: 0, // Not used anymore, but kept for compatibility
    staticCampfires: villageCampfirePositions, // Fire/smoke particles for village campfires (fishing + hunting)
  });

  const torchParticles = useTorchParticles({
    players,
    activeEquipments,
    itemDefinitions,
    deltaTime: 0, // Not used anymore, but kept for compatibility
  });

  // Fire arrow particle effects
  const fireArrowParticles = useFireArrowParticles({
    players,
    activeEquipments,
    itemDefinitions,
    projectiles,
    deltaTime: 0 // Not used anymore, but kept for compatibility
  });

  // Furnace particle effects - industrial forge sparks and flames
  const furnaceParticles = useFurnaceParticles({
    visibleFurnacesMap,
  });

  // Barbecue particle effects - grill fire, embers and smoke
  const barbecueParticles = useBarbecueParticles({
    visibleBarbecuesMap,
  });

  // Fire patch particle effects - fire and smoke from fire patches on the ground
  const firePatchParticles = useFirePatchParticles({
    visibleFirePatchesMap: firePatches,
    localPlayer: localPlayer ?? null,
  });

  // Ward particle effects - unique effects for each ward type when active
  // Ancestral Ward: tallow smoke, Signal Disruptor: electrical static, Memory Beacon: ethereal glow
  const wardParticles = useWardParticles({
    visibleLanternsMap,
    deltaTime: 0, // Not used anymore, but kept for compatibility
  });

  // Viewport bounds used by footprints and other systems
  const viewBounds = useMemo(() => ({
    minX: -cameraOffsetX,
    maxX: -cameraOffsetX + canvasSize.width,
    minY: -cameraOffsetY,
    maxY: -cameraOffsetY + canvasSize.height,
  }), [cameraOffsetX, cameraOffsetY, canvasSize.width, canvasSize.height]);

  // Resource sparkle particle effects - shows sparkles on harvestable resources (viewport-culled)
  const resourceSparkleParticles = useResourceSparkleParticles({
    harvestableResources: visibleHarvestableResourcesMap,
    cycleProgress: worldState?.cycleProgress ?? 0.5, // Pass current time of day (defaults to noon if not available)
  });

  // Hostile death particle effects - shows blue/purple sparks when hostile NPCs die
  const hostileDeathParticles = useHostileDeathEffects({
    hostileDeathEvents,
  });

  // Impact particle effects - blood splatter for animals, ethereal wisps for apparitions
  const impactParticles = useImpactParticles({
    wildAnimals,
    animalCorpses,
    localPlayer,
  });

  // Structure impact particles - sparks when walls/doors/shelters are hit (by players or hostile NPCs)
  const structureImpactParticles = useStructureImpactParticles({
    walls: wallCells,
    doors,
    shelters,
  });

  // 🌊 AMBIENT SOUND SYSTEM - Seamless atmospheric audio for the Aleutian island
  // Wind sounds use regional weather (checks nearby chunks for stability)
  // When underwater (snorkeling), applies lowpass filter to muffle surface sounds
  // When indoors, applies mild muffling to outdoor sounds (walls block sound)
  const ambientSoundSystem = useAmbientSounds({
    masterVolume: 1.0, // Master volume (could be made configurable later)
    environmentalVolume: environmentalVolume ?? 0.7, // Use environmental volume from settings or default
    timeOfDay: worldState?.timeOfDay, // Pass actual server time of day
    weatherCondition: worldState?.currentWeather, // Fallback for global weather (deprecated)
    chunkWeather, // Chunk-based weather for regional wind calculation
    localPlayer, // Player position for determining nearby chunks
    activeConsumableEffects, // For detecting Entrainment effect
    localPlayerId, // For detecting Entrainment effect
    isUnderwater: localPlayer?.isSnorkeling ?? false, // Apply muffled audio when underwater
    currentSeason: worldState?.currentSeason, // Season affects crickets (silent in winter)
    isIndoors: localPlayer?.isInsideBuilding ?? false, // Muffle outdoor sounds when inside buildings
    distanceToShore, // Distance to water for ocean sound proximity fading
    distanceToMapEdge, // Distance to map edge for deep ocean (open water, no waves)
    wildAnimals: visibleWildAnimalsMap, // Pass wild animals for bee buzzing proximity
  });

  // 🧪 DEBUG: Expose ambient sound test function to window for debugging
  React.useEffect(() => {
    (window as any).testAmbientVariants = ambientSoundSystem.testAllVariants;
    return () => {
      delete (window as any).testAmbientVariants;
    };
  }, [ambientSoundSystem.testAllVariants]);

  // Optimized particle renderer - batches particles by type to minimize ctx state changes
  const renderParticlesToCanvas = (ctx: CanvasRenderingContext2D, particles: any[]) => {
    if (particles.length === 0) return;

    // Separate particles by type for batched rendering (reused arrays to avoid per-frame allocations)
    const buckets = particleBucketsRef.current;
    buckets.fire.length = 0;
    buckets.ember.length = 0;
    buckets.spark.length = 0;
    buckets.other.length = 0;
    buckets.memory.length = 0;
    buckets.regularSmoke.length = 0;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (p.type === 'fire') {
        buckets.fire.push(p);
      } else if (p.type === 'ember') {
        buckets.ember.push(p);
      } else if (p.type === 'spark') {
        buckets.spark.push(p);
      } else {
        buckets.other.push(p);
      }
    }

    // Render fire particles with AAA pixel art style (Sea of Stars inspired)
    // Use square pixels instead of circles for crisp pixel art look
    if (buckets.fire.length > 0) {
      ctx.save();
      // Disable anti-aliasing for crisp pixel art
      ctx.imageSmoothingEnabled = false;
      for (let i = 0; i < buckets.fire.length; i++) {
        const particle = buckets.fire[i];
        const isStaticCampfire = particle.id && particle.id.startsWith('fire_static_');

        ctx.globalAlpha = particle.alpha || 1;
        ctx.fillStyle = particle.color || '#ff4500';

        if (isStaticCampfire) {
          // AAA pixel art style: larger square pixels with subtle glow for fishing village fire
          ctx.shadowColor = particle.color || '#ff4500';
          ctx.shadowBlur = particle.size * 0.3; // Subtle glow for pixel art
        } else {
          // Regular campfire: smaller glow
          ctx.shadowColor = particle.color || '#ff4500';
          ctx.shadowBlur = particle.size * 0.5;
        }

        // Use square pixels for pixel art style (Sea of Stars)
        const pixelSize = Math.max(1, Math.floor(particle.size));
        const pixelX = Math.floor(particle.x - pixelSize / 2);
        const pixelY = Math.floor(particle.y - pixelSize / 2);
        ctx.fillRect(pixelX, pixelY, pixelSize, pixelSize);
      }
      ctx.restore();
    }

    // Render ember particles - glowing floating embers with warm glow
    if (buckets.ember.length > 0) {
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      for (let i = 0; i < buckets.ember.length; i++) {
        const particle = buckets.ember[i];

        ctx.globalAlpha = particle.alpha || 1;
        ctx.fillStyle = particle.color || '#FFE066';
        // Embers have a warm, pulsing glow
        ctx.shadowColor = particle.color || '#FFE066';
        ctx.shadowBlur = particle.size * 2 + Math.sin(Date.now() * 0.01 + i) * 2;

        // Small square pixels for embers
        const pixelSize = Math.max(1, Math.floor(particle.size));
        const pixelX = Math.floor(particle.x - pixelSize / 2);
        const pixelY = Math.floor(particle.y - pixelSize / 2);
        ctx.fillRect(pixelX, pixelY, pixelSize, pixelSize);
      }
      ctx.restore();
    }

    // Render spark particles - bright, fast-moving sparks
    if (buckets.spark.length > 0) {
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      for (let i = 0; i < buckets.spark.length; i++) {
        const particle = buckets.spark[i];

        ctx.globalAlpha = particle.alpha || 1;
        ctx.fillStyle = particle.color || '#FFFFFF';
        // Sparks have a bright, intense glow
        ctx.shadowColor = '#FFFFFF';
        ctx.shadowBlur = particle.size * 4;

        // Tiny square pixels for sparks
        const pixelSize = Math.max(1, Math.floor(particle.size));
        const pixelX = Math.floor(particle.x - pixelSize / 2);
        const pixelY = Math.floor(particle.y - pixelSize / 2);
        ctx.fillRect(pixelX, pixelY, pixelSize, pixelSize);
      }
      ctx.restore();
    }

    // Render other particles (smoke, smoke_burst) with AAA pixel art style
    if (buckets.other.length > 0) {
      ctx.save();

      // Separate memory particles from regular smoke for different rendering
      for (let i = 0; i < buckets.other.length; i++) {
        const p = buckets.other[i];
        if (p.id && (p.id.startsWith('memory_') || p.id.startsWith('memoryfrag_'))) {
          buckets.memory.push(p);
        } else {
          buckets.regularSmoke.push(p);
        }
      }

      // Render MEMORY BEACON particles as soft glowing circles (ethereal effect)
      // PERFORMANCE: Cache gradients by (color, radiusBucket) - avoids per-particle allocations and GC spikes
      if (buckets.memory.length > 0) {
        ctx.imageSmoothingEnabled = true; // Enable smoothing for soft glow effect
        const gradCache = memoryParticleGradientCacheRef.current;
        for (let i = 0; i < buckets.memory.length; i++) {
          const particle = buckets.memory[i];
          const isFragment = particle.id && particle.id.startsWith('memoryfrag_');

          ctx.globalAlpha = particle.alpha || 1;

          const radius = Math.max(2, particle.size * (isFragment ? 1.5 : 1.2));
          const radiusBucket = Math.round(radius);
          const baseColor = particle.color || '#9966FF';
          const cacheKey = `${baseColor}_${radiusBucket}`;

          let gradient = gradCache.get(cacheKey);
          if (!gradient) {
            gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radiusBucket);
            gradient.addColorStop(0, baseColor);
            gradient.addColorStop(0.4, baseColor);
            gradient.addColorStop(1, 'transparent');
            gradCache.set(cacheKey, gradient);
          }

          ctx.save();
          ctx.translate(particle.x, particle.y);
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(0, 0, radiusBucket, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();

          if (isFragment) {
            ctx.globalAlpha = (particle.alpha || 1) * 0.5;
            const innerRadius = Math.round(radius * 0.5);
            const innerKey = `inner_${innerRadius}`;
            let innerGradient = gradCache.get(innerKey);
            if (!innerGradient) {
              innerGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, innerRadius);
              innerGradient.addColorStop(0, '#FFFFFF');
              innerGradient.addColorStop(1, 'transparent');
              gradCache.set(innerKey, innerGradient);
            }
            ctx.save();
            ctx.translate(particle.x, particle.y);
            ctx.fillStyle = innerGradient;
            ctx.beginPath();
            ctx.arc(0, 0, innerRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }
      }

      // Render regular smoke particles with pixel art style
      if (buckets.regularSmoke.length > 0) {
        ctx.imageSmoothingEnabled = false;
        ctx.shadowBlur = 0; // No shadow for smoke particles
        for (let i = 0; i < buckets.regularSmoke.length; i++) {
          const particle = buckets.regularSmoke[i];

          ctx.globalAlpha = particle.alpha || 1;
          ctx.fillStyle = particle.color || '#888888';

          // Use square pixels for pixel art style (Sea of Stars)
          const pixelSize = Math.max(1, Math.floor(particle.size));
          const pixelX = Math.floor(particle.x - pixelSize / 2);
          const pixelY = Math.floor(particle.y - pixelSize / 2);
          ctx.fillRect(pixelX, pixelY, pixelSize, pixelSize);
        }
      }

      ctx.restore();
    }
  };

  // Used to trigger cloud fetching and updating -- keep this logic at the top level
  // THROTTLED: Only send updates to server periodically or when moving significant distance
  const lastViewportUpdateRef = useRef<number>(0);
  const lastViewportPosRef = useRef<{ x: number, y: number } | null>(null);

  useEffect(() => {
    if (connection) {
      const now = Date.now();
      const timeDiff = now - lastViewportUpdateRef.current;

      // Check distance moved since last update
      let distSq = 0;
      if (lastViewportPosRef.current) {
        const dx = camera.x - lastViewportPosRef.current.x;
        const dy = camera.y - lastViewportPosRef.current.y;
        distSq = dx * dx + dy * dy;
      } else {
        distSq = Infinity; // Always update first time
      }

      // Update if > 500ms passed OR moved > 200px (approx 4 tiles)
      // This drastically reduces websocket traffic during smooth panning
      if (timeDiff > 500 || distSq > 40000) {
        lastViewportUpdateRef.current = now;
        lastViewportPosRef.current = { x: camera.x, y: camera.y };

        // Update viewport in the database so server knows what's visible to this client
        // This informs the server about the client's view bounds for cloud generation
        const viewportMinX = camera.x - currentCanvasWidth / 2;
        const viewportMinY = camera.y - currentCanvasHeight / 2;
        const viewportMaxX = camera.x + currentCanvasWidth / 2;
        const viewportMaxY = camera.y + currentCanvasHeight / 2;

        // Call reducer to update the server-side viewport
        try {
          connection.reducers.updateViewport(viewportMinX, viewportMinY, viewportMaxX, viewportMaxY);
        } catch (error) {
          console.error('[GameCanvas] Failed to update viewport on server:', error);
        }
      }
    }
  }, [connection, camera.x, camera.y, currentCanvasWidth, currentCanvasHeight]);

  // Lightning flash + delayed thunder sound in heavy storm zones
  useThunderEffects({ connection, localPlayer });

  // Hook for chunk-based rain sounds (manages rain sounds based on player's chunk weather)
  useChunkBasedRainSounds({ connection, localPlayer, chunkWeather });

  // Helper function to convert shelter data for shadow clipping
  const shelterClippingData = useMemo(() => {
    if (!shelters) return [];
    return Array.from(shelters.values()).map(shelter => ({
      posX: shelter.posX,
      posY: shelter.posY,
      isDestroyed: shelter.isDestroyed,
    }));
  }, [shelters]);

  // Performance monitoring - detect lag spikes
  const checkPerformance = useCallback((frameStartTime: number) => {
    const frameTime = performance.now() - frameStartTime;
    // Emergency mode removed; retain frame time tracking only
    performanceMode.current.lastFrameTime = frameTime;
  }, []);

  // === PERFORMANCE PROFILING ===
  // 🔧 SET TO true TO ENABLE LAG DIAGNOSTICS IN CONSOLE
  const ENABLE_LAG_DIAGNOSTICS = false;
  const LAG_DIAGNOSTIC_INTERVAL_MS = 5000; // Log every 5 seconds
  const PLAYER_SORT_FEET_OFFSET_PX = 48;
  // 🔧 SET TO true TO ENABLE Y-SORT DEBUG LOGGING (throttled to 400ms; adds findIndex + loop overhead)
  const ENABLE_YSORT_DEBUG = false;
  const YSORT_DEBUG_INTERVAL_MS = 400;
  const ySortDebugRef = useRef({
    lastLogTime: 0,
  });

  const perfProfilingRef = useRef({
    lastLogTime: Date.now(),
    frameCount: 0,
    totalFrameTime: 0,
    maxFrameTime: 0,
    slowFrames: 0, // frames > 16ms
    verySlowFrames: 0, // frames > 33ms (below 30fps)
    // Network latency tracking
    lastServerUpdateTime: 0,
    serverUpdateCount: 0,
    maxServerLatency: 0,
    totalServerLatency: 0,
    // React re-render tracking
    renderCallCount: 0,
  });

  const fpsProfilerRef = useRef(new FpsProfiler());

  // Track server updates via player position changes
  const lastKnownPlayerPosRef = useRef<{ x: number; y: number; timestamp: number } | null>(null);

  // Track server update timing when localPlayer position changes
  useEffect(() => {
    if (!ENABLE_LAG_DIAGNOSTICS || !localPlayer) return;

    const now = performance.now();
    const lastKnown = lastKnownPlayerPosRef.current;

    // Detect server-side position update (different from client prediction)
    if (lastKnown && (localPlayer.positionX !== lastKnown.x || localPlayer.positionY !== lastKnown.y)) {
      const timeSinceLastUpdate = now - lastKnown.timestamp;
      perfProfilingRef.current.serverUpdateCount++;
      perfProfilingRef.current.totalServerLatency += timeSinceLastUpdate;
      if (timeSinceLastUpdate > perfProfilingRef.current.maxServerLatency) {
        perfProfilingRef.current.maxServerLatency = timeSinceLastUpdate;
      }
      perfProfilingRef.current.lastServerUpdateTime = now;
    }

    lastKnownPlayerPosRef.current = {
      x: localPlayer.positionX,
      y: localPlayer.positionY,
      timestamp: now
    };
  }, [localPlayer?.positionX, localPlayer?.positionY]);

  const renderGame = useCallback(() => {
    const frameStartTime = performance.now();

    // Track frame count for periodic logging
    perfProfilingRef.current.frameCount++;
    const canvas = gameCanvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    if (!canvas || !maskCanvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Emergency performance mode removed

    const now_ms = Date.now();
    // Read from refs to avoid dependency array churn
    const currentWorldMouseX = worldMousePosRef.current.x;
    const currentWorldMouseY = worldMousePosRef.current.y;
    // PERFORMANCE FIX: Apply screen shake from refs directly in the render loop.
    // shakeOffsetXRef/YRef are updated at 60fps by the damage effects RAF loop;
    // reading them here means shake is always current without triggering React re-renders.
    const currentCameraOffsetX = cameraOffsetRef.current.x + shakeOffsetXRef.current;
    const currentCameraOffsetY = cameraOffsetRef.current.y + shakeOffsetYRef.current;
    const currentPredictedPosition = predictedPositionRef.current;
    // Read animation frames directly from module-level exported refs (updated by single RAF loop)
    const currentAnimationFrame = walkingAnimationFrameRef.current;
    const currentSprintAnimationFrame = sprintAnimationFrameRef.current;
    const currentIdleAnimationFrame = idleAnimationFrameRef.current;
    const currentInterpolatedClouds = interpolatedCloudsRef.current;
    const currentCycleProgress = cycleProgressRef.current;
    const currentYSortedEntities = ySortedEntitiesRef.current;
    const currentCanvasWidth = canvasSize.width;
    const currentCanvasHeight = canvasSize.height;
    // Phase 4b: Read frequently-changing deps from ref
    const rd = renderGameDepsRef.current;

    // Y-sort debug logging (throttled). Helps diagnose order mismatches in real time.
    if (ENABLE_YSORT_DEBUG && localPlayerId) {
      const nowDebug = Date.now();
      if (nowDebug - ySortDebugRef.current.lastLogTime >= YSORT_DEBUG_INTERVAL_MS) {
        ySortDebugRef.current.lastLogTime = nowDebug;

        const localPosX = currentPredictedPosition?.x ?? localPlayer?.positionX ?? null;
        const localPosY = currentPredictedPosition?.y ?? localPlayer?.positionY ?? null;
        if (localPosX != null && localPosY != null) {
          const localFeetY = localPosY + PLAYER_SORT_FEET_OFFSET_PX;

          const playerIndex = currentYSortedEntities.findIndex((item: any) =>
            item?.type === 'player' && item?.entity?.identity?.toHexString?.() === localPlayerId
          );

          // Find nearest grass/harvestable entity to local player by XY distance.
          let nearest: any = null;
          let nearestDistSq = Number.POSITIVE_INFINITY;
          for (const item of currentYSortedEntities as any[]) {
            if (!item || !item.entity) continue;
            if (item.type !== 'grass' && item.type !== 'harvestable_resource') continue;

            const ex = item.type === 'grass'
              ? Number(item.entity.serverPosX ?? item.entity.posX ?? 0)
              : Number(item.entity.posX ?? 0);
            const ey = item.type === 'grass'
              ? Number(item.entity.serverPosY ?? item.entity.posY ?? 0)
              : Number(item.entity.posY ?? 0);
            const dx = ex - localPosX;
            const dy = ey - localPosY;
            const distSq = dx * dx + dy * dy;
            if (distSq < nearestDistSq) {
              nearestDistSq = distSq;
              nearest = item;
            }
          }

          if (nearest) {
            const nearestIndex = currentYSortedEntities.indexOf(nearest);
            const entityBaseY = nearest.type === 'grass'
              ? Number(nearest.entity.serverPosY ?? 0) + 5
              : Number(nearest.entity.posY ?? 0);
            const expectedPlayerInFront = localFeetY >= entityBaseY;
            const actualPlayerInFront =
              playerIndex !== -1 && nearestIndex !== -1 ? playerIndex > nearestIndex : null;

            // Keep this concise but complete so users can screenshot and share exact values.
            console.log('[YSORT_DEBUG]', {
              localPlayerId,
              localPosX,
              localPosY,
              localFeetY,
              nearestType: nearest.type,
              nearestId: nearest.entity?.id?.toString?.() ?? null,
              nearestTag: nearest.entity?.appearanceType?.tag ?? nearest.entity?.plantType?.tag ?? null,
              nearestX: nearest.type === 'grass' ? nearest.entity?.serverPosX : nearest.entity?.posX,
              nearestY: nearest.type === 'grass' ? nearest.entity?.serverPosY : nearest.entity?.posY,
              entityBaseY,
              expectedPlayerInFront,
              playerIndex,
              entityIndex: nearestIndex,
              actualPlayerInFront,
              orderMismatch: actualPlayerInFront != null ? actualPlayerInFront !== expectedPlayerInFront : null,
              distSq: Math.round(nearestDistSq),
            });
          }
        }
      }
    }

    // currentCycleProgress is read from ref above (defaults to 0.375 in ref initialization)

    // --- ADD THESE LOGS for basic renderGame entry check ---
    // console.log(
    //     `[GameCanvas renderGame ENTRY] localPlayerId: ${localPlayerId}, ` +
    //     `playerCorpses type: ${typeof playerCorpses}, isMap: ${playerCorpses instanceof Map}, size: ${playerCorpses?.size}, ` +
    //     `localPlayer defined: ${!!localPlayer}, localPlayer.identity defined: ${!!localPlayer?.identity}`
    // );
    // --- END ADDED LOGS ---

    // --- Rendering ---
    ctx.clearRect(0, 0, currentCanvasWidth, currentCanvasHeight);

    // 🎯 CYBERPUNK: Render SOVA simulation grid background instead of plain black
    // This creates the lore-consistent illusion that the game world exists within a cyberpunk simulation
    renderCyberpunkGridBackground(
      ctx,
      currentCanvasWidth,
      currentCanvasHeight,
      currentCameraOffsetX,
      currentCameraOffsetY
    );

    ctx.save();
    ctx.translate(currentCameraOffsetX, currentCameraOffsetY);
    const _t0 = mark(showFpsProfiler);

    // Set shelter clipping data for shadow rendering
    setShelterClippingData(shelterClippingData);

    // Pass the necessary viewport parameters to the optimized background renderer
    // When snorkeling, render underwater view mode (land as dark blue, sea as normal)
    const isSnorkeling = localPlayer?.isSnorkeling ?? false;
    renderWorldBackground(ctx, currentCameraOffsetX, currentCameraOffsetY, currentCanvasWidth, currentCanvasHeight, visibleWorldTiles, showAutotileDebug, isSnorkeling);

    // MOVED: Swimming shadows now render after water overlay to appear above sea stack underwater zones

    // MOVED: Water overlay now renders after players to appear on top

    // --- Render Water Patches ---
    // Water patches show as transparent black circles on the ground that boost plant growth
    // Note: Context is already translated by cameraOffset, so we pass the actual camera world position
    renderWaterPatches(
      ctx,
      waterPatches,
      -currentCameraOffsetX, // Camera world X position
      -currentCameraOffsetY, // Camera world Y position
      currentCanvasWidth,
      currentCanvasHeight
    );
    // --- End Water Patches ---

    // --- Render Fertilizer Patches ---
    // Fertilizer patches show as brown/organic circles on the ground where fertilizer was applied
    // Note: Context is already translated by cameraOffset, so we pass the actual camera world position
    renderFertilizerPatches(
      ctx,
      fertilizerPatches,
      -currentCameraOffsetX, // Camera world X position
      -currentCameraOffsetY, // Camera world Y position
      currentCanvasWidth,
      currentCanvasHeight
    );
    // --- End Fertilizer Patches ---

    // --- Render Fire Patches ---
    // Fire patches show as animated flames created by fire arrows that damage players and structures
    // Note: Context is already translated by cameraOffset, so we pass the actual camera world position
    renderFirePatches(
      ctx,
      firePatches,
      -currentCameraOffsetX, // Camera world X position
      -currentCameraOffsetY, // Camera world Y position
      currentCanvasWidth,
      currentCanvasHeight,
      now_ms
    );
    // --- End Fire Patches ---

    // --- Render Placed Explosives ---
    // Placed explosives show as items on the ground with a pulsing fuse animation
    renderPlacedExplosives(
      ctx,
      placedExplosives,
      -currentCameraOffsetX, // Camera world X position
      -currentCameraOffsetY, // Camera world Y position
      currentCanvasWidth,
      currentCanvasHeight,
      now_ms
    );
    // --- End Placed Explosives ---
    const _t1 = mark(showFpsProfiler);

    // --- Render Sea Stacks (SERVER-AUTHORITATIVE SYSTEM) ---
    // DISABLED: Sea stacks are now rendered through the Y-sorted entities system for proper depth layering
    // This ensures players can walk behind and in front of sea stacks based on Y position
    // renderSeaStacks(
    //   ctx,
    //   -cameraOffsetX, // Camera world X position
    //   -cameraOffsetY, // Camera world Y position
    //   currentCanvasWidth,
    //   currentCanvasHeight,
    //   seaStacks // Pass server-provided sea stack entities
    // );
    // --- End Sea Stacks ---

    const isPlacementTooFarValue = (placementInfo && localPlayer && currentWorldMouseX !== null && currentWorldMouseY !== null)
      ? isPlacementTooFar(placementInfo, localPlayer.positionX, localPlayer.positionY, currentWorldMouseX, currentWorldMouseY)
      : false;

    // --- Render Ground Items Individually --- 

    // First pass: Draw ONLY shadows for ground items that have custom shadows
    // Render Campfire Shadows
    visibleCampfires.forEach(campfire => {
      renderCampfire(ctx, campfire, now_ms, currentCycleProgress, true /* onlyDrawShadow */);
    });
    // Render Barbecue Shadows
    visibleBarbecues.forEach(barbecue => {
      renderBarbecue(ctx, barbecue, now_ms, currentCycleProgress, true /* onlyDrawShadow */);
    });
    // Note: Pumpkin and Mushroom shadows are now handled by the unified resource renderer
    // through the Y-sorted entities system
    // Tree shadows are now handled by the Y-sorted entity system for proper shadow layering
    // TODO: Add other ground items like mushrooms, crops here if they get custom dynamic shadows

    // --- Render Clouds on Canvas --- (MOVED HERE)
    // Clouds are rendered after all world entities and particles,
    // but before world-anchored UI like labels.
    // The context (ctx) should still be translated by cameraOffset at this point.
    /* REMOVING THIS FIRST CALL TO RENDER CLOUDS
    if (clouds && clouds.size > 0 && cloudImagesRef.current) {
      renderCloudsDirectly({ 
        ctx, 
        clouds: interpolatedClouds,
        cloudImages: cloudImagesRef.current,
        worldScale: 1, // Use a scale of 1 for clouds
        cameraOffsetX, // Pass camera offsets so clouds move with the world view
        cameraOffsetY  
      });
    }
    */
    // --- End Render Clouds on Canvas ---

    // Second pass: Draw the actual entities for ground items
    // Render Campfires (actual image, skip shadow as it's already drawn if burning)
    /*visibleCampfires.forEach(campfire => {
        renderCampfire(ctx, campfire, now_ms, currentCycleProgress, false, !campfire.isBurning );
    });*/
    // Note: Dropped items are now handled by the Y-sorted entities system
    // Note: Mushrooms, Corn, Pumpkins, and Hemp are now handled by the unified resource renderer
    // through the Y-sorted entities system
    // Note: Sleeping bags are now handled by the Y-sorted entities system
    // Render Stashes (Remove direct rendering as it's now y-sorted)
    /*visibleStashes.forEach(stash => {
        renderStash(ctx, stash, now_ms, currentCycleProgress);
    });*/
    // --- End Ground Items --- 

    // --- STEP 0.4: Render sea stack underwater silhouettes (snorkeling) or bottom halves + water effects ---
    // Sea stack ground shadows are now rendered as an overlay AFTER Y-sorted entities (see below)
    // Skip normal sea stack rendering when snorkeling - use underwater silhouettes instead
    if (isSnorkeling) {
      // When snorkeling, render sea stacks as feathered dark circles (underwater view of obstacles)
      visibleSeaStacks.forEach(seaStack => {
        renderSeaStackUnderwaterSilhouette(ctx, seaStack, currentCycleProgress);
      });

      // Also render sea barrels (floating barrels) as underwater silhouettes
      // Only sea barrel variants (3, 4, 5) will be rendered - the function filters internally
      // Pass nowMs for sway/bob animation sync with above-water barrels
      visibleBarrels.forEach(barrel => {
        renderBarrelUnderwaterSilhouette(ctx, barrel, currentCycleProgress, now_ms);
      });
    } else {
      // Normal rendering: bottom half and water effects
      // NOTE: Sea stack shadows are now rendered as an OVERLAY pass after Y-sorted entities
      // (similar to tree canopy shadows) so they appear ON TOP of players walking near sea stacks.

      // --- STEP 0.5: Render sea stack BOTTOM halves WITHOUT shadows (underwater rock texture) ---
      const localPlayerPositionForSeaStacks = currentPredictedPosition ?? (localPlayer ? { x: localPlayer.positionX, y: localPlayer.positionY } : null);
      visibleSeaStacks.forEach(seaStack => {
        renderSeaStackBottomOnly(ctx, seaStack, doodadImagesRef.current, currentCycleProgress, now_ms, localPlayerPositionForSeaStacks);
      });
      // --- END SEA STACK BOTTOMS ---
    }
    // --- END SEA STACK RENDERING ---
    const _t1a = mark(showFpsProfiler);

    // --- UNDERWATER CAUSTIC EFFECTS (snorkeling mode) ---
    // Render caustic light patterns on the sea floor when snorkeling
    if (isSnorkeling) {
      // Update underwater effects system
      updateUnderwaterEffects(
        deltaTimeRef.current / 1000, // Convert ms to seconds
        -currentCameraOffsetX,
        -currentCameraOffsetY,
        canvasSize.width,
        canvasSize.height
      );

      // Render caustics below players
      renderUnderwaterEffectsUnder(
        ctx,
        -currentCameraOffsetX,
        -currentCameraOffsetY,
        canvasSize.width,
        canvasSize.height,
        now_ms
      );
    }
    // --- END UNDERWATER CAUSTIC EFFECTS ---
    const _t1b = mark(showFpsProfiler);

    // MOVED: Water line now renders AFTER sea stack tops (see below after Y-sorted entities)

    // Now players render OVER the rock, water gradient

    // --- STEP 0.75: Render sea barrel/buoy water shadows (BEFORE swimming bottom halves so player renders on top) ---
    // PERFORMANCE: Use O(1) waterTileLookup instead of getTileTypeFromChunkData per barrel per frame
    const isOnSeaTileForBarrels = (worldX: number, worldY: number): boolean => {
      const { tileX, tileY } = worldPosToTileCoords(worldX, worldY);
      return waterTileLookup.get(`${tileX},${tileY}`) ?? false;
    };
    visibleBarrels.forEach(barrel => {
      renderSeaBarrelWaterShadowOnly(ctx, barrel, now_ms, currentCycleProgress, isOnSeaTileForBarrels);
    });
    // --- END SEA BARREL WATER SHADOWS ---

    // --- STEP 1: Render ONLY swimming player bottom halves ---
    // Filter out swimming players and render them manually with exact same logic as renderYSortedEntities
    // EXCEPTION: Snorkeling players (local OR remote) should NOT be split - they render as full sprite
    const swimmingPlayersForBottomHalf: SpacetimeDBPlayer[] = [];
    players.forEach((player) => {
      // Basic swimming conditions
      if (!player.isOnWater || player.isDead || player.isKnockedOut) return;
      // Skip local player if they're snorkeling - they render as full sprite in Y-sorted entities
      if (isSnorkeling && player.identity.toHexString() === localPlayerId) return;
      // Skip ANY player who is snorkeling - they render as full sprite (fully underwater)
      if (player.isSnorkeling) return;
      swimmingPlayersForBottomHalf.push(player);
    });

    // Render swimming player bottom halves using exact same logic as renderYSortedEntities
    swimmingPlayersForBottomHalf.forEach(player => {
      const playerId = player.identity.toHexString();
      const isLocalPlayer = localPlayerId === playerId;

      // EXACT same position logic as renderYSortedEntities
      let playerForRendering = player;
      if (isLocalPlayer && currentPredictedPosition) {
        const scratch = swimmingPlayerScratchRef.current;
        Object.assign(scratch, player);
        scratch.positionX = currentPredictedPosition.x;
        scratch.positionY = currentPredictedPosition.y;
        scratch.direction = localFacingDirection ?? player.direction;
        playerForRendering = scratch as SpacetimeDBPlayer;
      } else if (!isLocalPlayer && remotePlayerInterpolation) {
        const interpolatedPosition = remotePlayerInterpolation.updateAndGetSmoothedPosition(player, localPlayerId);
        const scratch = swimmingPlayerScratchRef.current;
        Object.assign(scratch, player);
        scratch.positionX = interpolatedPosition.x;
        scratch.positionY = interpolatedPosition.y;
        playerForRendering = scratch as SpacetimeDBPlayer;
      }

      // EXACT same movement detection logic as renderYSortedEntities  
      const lastPos = lastPositionsRef.current?.get(playerId);
      let isPlayerMoving = false;

      if (lastPos) {
        const positionThreshold = 0.1;
        const dx = Math.abs(playerForRendering.positionX - lastPos.x);
        const dy = Math.abs(playerForRendering.positionY - lastPos.y);
        isPlayerMoving = dx > positionThreshold || dy > positionThreshold;
      }

      // EXACT same animation frame logic as renderYSortedEntities
      let currentAnimFrame: number;
      if (playerForRendering.isOnWater) {
        // Swimming animations - ALL swimming uses idle animation frames from water sprite
        currentAnimFrame = currentIdleAnimationFrame; // Swimming sprite uses idle frames for all swimming movement
      } else {
        // Land animation
        if (!isPlayerMoving) {
          currentAnimFrame = currentIdleAnimationFrame;
        } else if (playerForRendering.isSprinting) {
          currentAnimFrame = currentSprintAnimationFrame;
        } else {
          currentAnimFrame = currentAnimationFrame;
        }
      }

      // Update last positions (same as renderYSortedEntities)
      lastPositionsRef.current?.set(playerId, { x: playerForRendering.positionX, y: playerForRendering.positionY });

      // Choose correct sprite image - FIX: Add fallback to walking sprite if water sprite not loaded
      let heroImg: HTMLImageElement | null = heroWaterImageRef.current || heroImageRef.current;

      if (heroImg) {
        const isOnline = activeConnections ? activeConnections.has(playerId) : false;
        const isHovered = worldMousePos ? isPlayerHovered(worldMousePos.x, worldMousePos.y, playerForRendering) : false;

        renderPlayer(
          ctx,
          playerForRendering,
          heroImg,
          heroSprintImageRef.current || heroImg,
          heroIdleImageRef.current || heroImg,
          heroCrouchImageRef.current || heroImg,
          heroWaterImageRef.current || heroImageRef.current || heroImg, // heroSwimImg - with fallback chain
          heroDodgeImageRef.current || heroImg, // heroDodgeImg
          isOnline,
          isPlayerMoving,
          isHovered,
          currentAnimFrame,
          now_ms,
          0, // no jump offset for swimming players
          alwaysShowPlayerNames || isHovered, // show label if setting enabled or hovered
          activeConsumableEffects,
          localPlayerId,
          false, // not corpse
          currentCycleProgress,
          localPlayerIsCrouching,
          'bottom', // Render only bottom half
          false, // isDodgeRolling - swimming players don't dodge roll
          0, // dodgeRollProgress
          false, // isSnorkeling - these are regular swimming players (snorkeling ones are excluded)
          isSnorkeling // isViewerUnderwater - pass local player's snorkeling state
        );
      }
    });

    // --- STEP 1.5: Render underwater shadows for swimming players (must be BEFORE water overlay) ---
    // MOVED HERE: Underwater shadows must render BEFORE Y-sorted entities and water overlay
    swimmingPlayersForBottomHalf.forEach(player => {
      const playerId = player.identity.toHexString();
      const isLocalPlayer = localPlayerId === playerId;

      // Use predicted/interpolated position so shadow tracks the sprite perfectly
      let playerForRendering = player;
      if (isLocalPlayer && currentPredictedPosition) {
        const scratch = swimmingPlayerScratchRef.current;
        Object.assign(scratch, player);
        scratch.positionX = currentPredictedPosition.x;
        scratch.positionY = currentPredictedPosition.y;
        scratch.direction = localFacingDirection || player.direction;
        playerForRendering = scratch as SpacetimeDBPlayer;
      } else if (!isLocalPlayer && remotePlayerInterpolation) {
        // FIX: Use interpolated position for remote players so shadow doesn't lag behind sprite
        const interpolatedPosition = remotePlayerInterpolation.updateAndGetSmoothedPosition(player, localPlayerId);
        const scratch = swimmingPlayerScratchRef.current;
        Object.assign(scratch, player);
        scratch.positionX = interpolatedPosition.x;
        scratch.positionY = interpolatedPosition.y;
        playerForRendering = scratch as SpacetimeDBPlayer;
      }

      // Determine which sprite image to use for shadow shape
      let heroImg: HTMLImageElement | null = null;
      const effectiveIsCrouching = isLocalPlayer && localPlayerIsCrouching !== undefined
        ? localPlayerIsCrouching
        : player.isCrouching;

      // Choose sprite based on priority: water > crouching > default
      // FIX: Add fallbacks to ensure we render with available sprite
      if (player.isOnWater) {
        heroImg = heroWaterImageRef.current || heroImageRef.current;
      } else if (effectiveIsCrouching) {
        heroImg = heroCrouchImageRef.current || heroImageRef.current;
      } else {
        heroImg = heroImageRef.current;
      }

      if (heroImg) {
        // Calculate sprite position
        const drawWidth = gameConfig.spriteWidth * 2;
        const drawHeight = gameConfig.spriteHeight * 2;
        const spriteBaseX = playerForRendering.positionX - drawWidth / 2;
        const spriteBaseY = playerForRendering.positionY - drawHeight / 2;

        // Calculate if player is moving (same logic as main rendering)
        let isPlayerMoving = false;
        const lastPos = lastPositionsRef.current?.get(playerId);
        if (lastPos) {
          const positionThreshold = 0.1;
          const dx = Math.abs(playerForRendering.positionX - lastPos.x);
          const dy = Math.abs(playerForRendering.positionY - lastPos.y);
          isPlayerMoving = dx > positionThreshold || dy > positionThreshold;
        }

        // Calculate animated sprite coordinates for swimming
        // IMPORTANT: Swimming uses idleAnimationFrame, NOT animationFrame (matches main rendering logic)
        const totalSwimmingFrames = 24; // Swimming animation has 24 frames
        const { sx, sy } = getSpriteCoordinates(
          playerForRendering,
          isPlayerMoving,
          currentIdleAnimationFrame, // Swimming uses idle animation frames, same as main player rendering!
          false, // isUsingItem
          totalSwimmingFrames,
          false, // isIdle
          false, // isCrouching
          true,  // isSwimming - IMPORTANT: This tells it to use swimming animation
          false, // isDodgeRolling
          0      // dodgeRollProgress
        );

        // Calculate shadow position (same offset as in drawUnderwaterShadow function)
        const centerX = playerForRendering.positionX;
        const centerY = playerForRendering.positionY;
        const shadowOffsetX = drawWidth * 0.28; // Small shift right
        const shadowOffsetY = drawHeight * 0.9; // Small shift down
        const shadowX = centerX + shadowOffsetX;
        const shadowY = centerY + shadowOffsetY;

        // Check if shadow position is over water before rendering
        // Convert world position to tile coordinates
        const shadowTileX = Math.floor(shadowX / gameConfig.tileSize);
        const shadowTileY = Math.floor(shadowY / gameConfig.tileSize);

        // PERFORMANCE: O(1) lookup using pre-computed Map instead of O(n) iteration
        // Critical for 50+ players checking shadow positions every frame
        const shadowTileKey = `${shadowTileX},${shadowTileY}`;
        const isShadowOverWater = waterTileLookup.get(shadowTileKey) ?? false;

        // Only render shadow if it's over water
        if (isShadowOverWater) {
          // Call the underwater shadow function with animated sprite coordinates
          drawUnderwaterShadowOnly(
            ctx,
            heroImg,
            sx, // Use calculated sprite x coordinate
            sy, // Use calculated sprite y coordinate
            spriteBaseX,
            spriteBaseY,
            drawWidth,
            drawHeight
          );
        }
      }
    });

    // --- STEP 1.6: Render underwater shadow for snorkeling (underwater) local player ---
    // Snorkeling players are excluded from swimmingPlayersForBottomHalf but still need an underwater shadow
    if (isSnorkeling && localPlayer && currentPredictedPosition) {
      // Use underwater sprite for snorkeling shadow shape - FIX: Add fallback
      const heroImg = heroWaterImageRef.current || heroImageRef.current;

      if (heroImg) {
        const drawWidth = gameConfig.spriteWidth * 2;
        const drawHeight = gameConfig.spriteHeight * 2;
        const spriteBaseX = currentPredictedPosition.x - drawWidth / 2;
        const spriteBaseY = currentPredictedPosition.y - drawHeight / 2;

        // Calculate if player is moving
        let isPlayerMoving = false;
        const lastPos = lastPositionsRef.current?.get(localPlayerId ?? '');
        if (lastPos) {
          const positionThreshold = 0.1;
          const dx = Math.abs(currentPredictedPosition.x - lastPos.x);
          const dy = Math.abs(currentPredictedPosition.y - lastPos.y);
          isPlayerMoving = dx > positionThreshold || dy > positionThreshold;
        }

        // Calculate animated sprite coordinates for swimming/snorkeling (Phase 3d: use scratch to avoid allocation)
        const totalSwimmingFrames = 24;
        const localScratch = localPlayerScratchRef.current;
        Object.assign(localScratch, localPlayer);
        localScratch.positionX = currentPredictedPosition.x;
        localScratch.positionY = currentPredictedPosition.y;
        localScratch.direction = localFacingDirection ?? localPlayer.direction;
        const { sx, sy } = getSpriteCoordinates(
          localScratch as SpacetimeDBPlayer,
          isPlayerMoving,
          currentIdleAnimationFrame,
          false, // isUsingItem
          totalSwimmingFrames,
          false, // isIdle
          false, // isCrouching
          true,  // isSwimming
          false, // isDodgeRolling
          0      // dodgeRollProgress
        );

        // Calculate shadow position (same offset as in drawUnderwaterShadow function)
        const centerX = currentPredictedPosition.x;
        const centerY = currentPredictedPosition.y;
        const shadowOffsetX = drawWidth * 0.28;
        const shadowOffsetY = drawHeight * 0.9;
        const shadowX = centerX + shadowOffsetX;
        const shadowY = centerY + shadowOffsetY;

        // Check if shadow position is over water before rendering
        const shadowTileX = Math.floor(shadowX / gameConfig.tileSize);
        const shadowTileY = Math.floor(shadowY / gameConfig.tileSize);
        const shadowTileKey = `${shadowTileX},${shadowTileY}`;
        const isShadowOverWater = waterTileLookup.get(shadowTileKey) ?? false;

        // Render underwater shadow for snorkeling player
        if (isShadowOverWater) {
          drawUnderwaterShadowOnly(
            ctx,
            heroImg,
            sx,
            sy,
            spriteBaseX,
            spriteBaseY,
            drawWidth,
            drawHeight
          );
        }
      }
    }

    // --- STEP 1.7: Render underwater shadows for REMOTE snorkeling players ---
    // Remote snorkeling players are excluded from swimmingPlayersForBottomHalf but still need underwater shadows
    players.forEach((player) => {
      // Only remote snorkeling players (not local, and is snorkeling)
      if (player.identity.toHexString() === localPlayerId) return;
      if (!player.isSnorkeling) return;
      if (player.isDead || player.isKnockedOut) return;
        // FIX: Add fallback to walking sprite if water sprite not loaded
        const heroImg = heroWaterImageRef.current || heroImageRef.current;

        if (heroImg) {
          const playerId = player.identity.toHexString();

          // FIX: Use interpolated position for remote players so shadow tracks the sprite perfectly
          let playerForRendering = player;
          if (remotePlayerInterpolation) {
            const interpolatedPosition = remotePlayerInterpolation.updateAndGetSmoothedPosition(player, localPlayerId);
            const scratch = swimmingPlayerScratchRef.current;
            Object.assign(scratch, player);
            scratch.positionX = interpolatedPosition.x;
            scratch.positionY = interpolatedPosition.y;
            playerForRendering = scratch as SpacetimeDBPlayer;
          }

          const drawWidth = gameConfig.spriteWidth * 2;
          const drawHeight = gameConfig.spriteHeight * 2;
          const spriteBaseX = playerForRendering.positionX - drawWidth / 2;
          const spriteBaseY = playerForRendering.positionY - drawHeight / 2;

          // Calculate if player is moving
          let isPlayerMoving = false;
          const lastPos = lastPositionsRef.current?.get(playerId);
          if (lastPos) {
            const positionThreshold = 0.1;
            const dx = Math.abs(playerForRendering.positionX - lastPos.x);
            const dy = Math.abs(playerForRendering.positionY - lastPos.y);
            isPlayerMoving = dx > positionThreshold || dy > positionThreshold;
          }

          // Calculate animated sprite coordinates for swimming
          const totalSwimmingFrames = 24;
          const { sx, sy } = getSpriteCoordinates(
            playerForRendering,
            isPlayerMoving,
            currentIdleAnimationFrame,
            false, // isUsingItem
            totalSwimmingFrames,
            false, // isIdleAnimation
            false, // isCrouchingAnimation
            true,  // isSwimmingAnimation
            false, // isDodgeRollingAnimation
            0      // dodgeRollProgress
          );

          // Calculate shadow position using interpolated position
          const centerX = playerForRendering.positionX;
          const centerY = playerForRendering.positionY;
          const shadowOffsetX = drawWidth * 0.28;
          const shadowOffsetY = drawHeight * 0.9;
          const shadowX = centerX + shadowOffsetX;
          const shadowY = centerY + shadowOffsetY;

          // Check if shadow is over water tile
          const shadowTileX = Math.floor(shadowX / 48);
          const shadowTileY = Math.floor(shadowY / 48);
          const shadowTileKey = `${shadowTileX},${shadowTileY}`;
          const isShadowOverWater = waterTileLookup.get(shadowTileKey) ?? false;

          // Render underwater shadow for remote snorkeling player
          if (isShadowOverWater) {
            drawUnderwaterShadowOnly(
              ctx,
              heroImg,
              sx,
              sy,
              spriteBaseX,
              spriteBaseY,
              drawWidth,
              drawHeight
            );
          }
        }
      });
    // --- END UNDERWATER SHADOWS ---
    const _t1c = mark(showFpsProfiler);

    // --- Render water overlay (ABOVE underwater shadows and sea stack bottoms, BELOW sea stack tops and player heads) ---
    // Skip water overlay when snorkeling - player is underwater so surface effects aren't visible
    if (!isSnorkeling) {
      renderWaterOverlay(
        ctx,
        -currentCameraOffsetX, // Convert camera offset to world camera position
        -currentCameraOffsetY,
        canvasSize.width,
        canvasSize.height,
        deltaTimeRef.current / 1000, // Convert ms to seconds
        visibleWorldTiles
      );
      // Shoreline overlay (white foam line) on Beach_Sea tiles - must render AFTER water overlay
      renderShorelineOverlay(
        ctx,
        currentCameraOffsetX,
        currentCameraOffsetY,
        canvasSize.width,
        canvasSize.height,
        isSnorkeling
      );
    }
    // --- END WATER OVERLAY ---
    const _t2 = mark(showFpsProfiler);

    // --- STEP 2.5 & 3 COMBINED: Render Y-sorted entities AND swimming player top halves together ---
    // This ensures swimming player tops are properly Y-sorted with sea stacks and other tall entities

    // Render terrain footprints (snow/beach) ONCE as ground decals, before any Y-sorted entities.
    // This ensures footprints are always below players/trees/structures regardless of
    // how many times renderYSortedEntities is called (e.g. batched swimming player rendering).
    renderAllFootprints(ctx, viewBounds, now_ms);

    // Phase 3c: useEntityFiltering now pre-merges swimmingPlayerTopHalf into ySortedEntities.
    // Single loop: batch non-swimming entities, flush and render swimming tops when encountered.
    const flushBatch = (batch: typeof currentYSortedEntities) => {
      if (batch.length > 0) {
        renderYSortedEntities({
          ctx,
          ySortedEntities: batch,
        heroImageRef,
        heroSprintImageRef,
        heroIdleImageRef,
        heroWaterImageRef,
        heroCrouchImageRef,
        heroDodgeImageRef,
        lastPositionsRef,
        activeConnections,
        activeEquipments,
        activeConsumableEffects,
        itemDefinitions,
        inventoryItems,
        itemImagesRef,
        doodadImagesRef,
        shelterImage: shelterImageRef.current,
        worldMouseX: currentWorldMouseX,
        worldMouseY: currentWorldMouseY,
        localPlayerId: localPlayerId,
        animationFrame: currentAnimationFrame,
        sprintAnimationFrame: currentSprintAnimationFrame,
        idleAnimationFrame: currentIdleAnimationFrame,
        nowMs: now_ms,
        hoveredPlayerIds,
        onPlayerHover: handlePlayerHover,
        cycleProgress: currentCycleProgress,
        renderPlayerCorpse: (props) => renderPlayerCorpse({ ...props, cycleProgress: currentCycleProgress, heroImageRef: heroImageRef, heroWaterImageRef: heroWaterImageRef, heroCrouchImageRef: heroCrouchImageRef }),
        localPlayerPosition: currentPredictedPosition ?? { x: localPlayer?.positionX ?? 0, y: localPlayer?.positionY ?? 0 },
        playerDodgeRollStates,
        remotePlayerInterpolation,
        localPlayerIsCrouching,
        closestInteractableCampfireId: rd.closestInteractableCampfireId as number | null,
        closestInteractableBoxId: rd.closestInteractableBoxId as number | null,
        closestInteractableStashId: rd.closestInteractableStashId as number | null,
        closestInteractableSleepingBagId: rd.closestInteractableSleepingBagId as number | null,
        closestInteractableHarvestableResourceId: rd.closestInteractableHarvestableResourceId as bigint | null,
        closestInteractableDroppedItemId: rd.closestInteractableDroppedItemId as bigint | null,
        closestInteractableDoorId: rd.closestInteractableDoorId as bigint | null,
        closestInteractableTarget: rd.closestInteractableTarget,
        shelterClippingData,
        localFacingDirection,
        treeShadowsEnabled,
        isTreeFalling,
        getFallProgress,
        cameraOffsetX: currentCameraOffsetX,
        cameraOffsetY: currentCameraOffsetY,
        foundationTileImagesRef,
        allWalls: wallCells,
        allFoundations: foundationCells,
        allFences: visibleFences, // ADDED: All fences for smart sprite selection based on neighbors
        buildingClusters,
        playerBuildingClusterId,
        connection, // ADDED: Pass connection for cairn biome lookup
        isLocalPlayerSnorkeling: isSnorkeling, // ADDED: Pass snorkeling state for underwater rendering
        alwaysShowPlayerNames, // ADDED: Pass setting for always showing player names
        playerStats, // ADDED: Pass player stats for title display on name labels
        largeQuarries, // ADDED: Pass large quarry locations for building restriction zones
        detectedHotSprings, // ADDED: Pass hot spring locations for building restriction zones
        detectedQuarries, // ADDED: Pass small quarry locations for building restriction zones
        placementInfo, // ADDED: Pass placement info for showing restriction zones when placing items
        caribouBreedingData, // ADDED: Pass caribou breeding data for age-based size scaling and pregnancy indicators
        walrusBreedingData, // ADDED: Pass walrus breeding data for age-based size scaling and pregnancy indicators
        chunkWeather, // ADDED: Chunk weather for grass sway (Clear=minimal, storm=dramatic)
        });
      }
    };

    // Helper to render swimming player top half (Phase 3c: entity has interpolated position when called)
    const renderSwimmingPlayerTopHalf = (item: { entity: SpacetimeDBPlayer; playerId: string; yPosition: number }) => {
      const player = item.entity;
      const playerId = item.playerId;

      const lastPos = lastPositionsRef.current?.get(playerId);
      let isPlayerMoving = false;

      if (lastPos) {
        const positionThreshold = 0.1;
        const dx = Math.abs(player.positionX - lastPos.x);
        const dy = Math.abs(player.positionY - lastPos.y);
        isPlayerMoving = dx > positionThreshold || dy > positionThreshold;
      }

      let currentAnimFrame: number;
      if (player.isOnWater) {
        // Swimming: use idle frames for ALL swimming movement (matches bottom half - Phase 3c fix)
        currentAnimFrame = currentIdleAnimationFrame;
      } else {
        if (!isPlayerMoving) {
          currentAnimFrame = currentIdleAnimationFrame;
        } else if (player.isSprinting) {
          currentAnimFrame = currentSprintAnimationFrame;
        } else {
          currentAnimFrame = currentAnimationFrame;
        }
      }

      // FIX: Add fallbacks to ensure we render with available sprite
      let heroImg: HTMLImageElement | null;
      if (player.isOnWater) {
        heroImg = heroWaterImageRef.current || heroImageRef.current;
      } else if (player.isCrouching) {
        heroImg = heroCrouchImageRef.current || heroImageRef.current;
      } else {
        heroImg = heroImageRef.current;
      }

      if (heroImg) {
        const isOnline = activeConnections ? activeConnections.has(playerId) : false;
        const isHovered = worldMousePos ? isPlayerHovered(worldMousePos.x, worldMousePos.y, player) : false;

        const equipment = activeEquipments.get(playerId);
        let itemDef: SpacetimeDBItemDefinition | null = null;
        let itemImg: HTMLImageElement | null = null;

        if (equipment && equipment.equippedItemDefId && equipment.equippedItemInstanceId) {
          const equippedItemInstance = inventoryItems.get(equipment.equippedItemInstanceId.toString());
          if (equippedItemInstance && equippedItemInstance.quantity > 0) {
            itemDef = itemDefinitions.get(equipment.equippedItemDefId.toString()) || null;
            itemImg = (itemDef ? itemImagesRef.current.get(itemDef.iconAssetName) : null) || null;
          }
        }

        const canRenderItem = itemDef && itemImg && itemImg.complete && itemImg.naturalHeight !== 0;
        const itemBehindPlayer = player.direction === 'up' || player.direction === 'left';

        const renderSwimmingEquippedItem = () => {
          if (player.direction === 'up') {
            ctx.save();
            ctx.beginPath();
            ctx.rect(player.positionX - 2000, player.positionY - 2000, 4000, 2000);
            ctx.clip();
            renderEquippedItem(ctx, player, equipment!, itemDef!, itemDefinitions, itemImg!, now_ms, 0, itemImagesRef.current, activeConsumableEffects, localPlayerId, player.direction);
            ctx.restore();
          } else {
            renderEquippedItem(ctx, player, equipment!, itemDef!, itemDefinitions, itemImg!, now_ms, 0, itemImagesRef.current, activeConsumableEffects, localPlayerId, player.direction);
          }
        };

        if (itemBehindPlayer && canRenderItem && equipment) {
          renderSwimmingEquippedItem();
        }

        renderPlayer(
          ctx,
          player,
          heroImg,
          heroSprintImageRef.current || heroImg,
          heroIdleImageRef.current || heroImg,
          heroCrouchImageRef.current || heroImg,
          heroWaterImageRef.current || heroImageRef.current || heroImg,
          heroDodgeImageRef.current || heroImg,
          isOnline,
          isPlayerMoving,
          isHovered,
          currentAnimFrame,
          now_ms,
          0,
          alwaysShowPlayerNames || isHovered,
          activeConsumableEffects,
          localPlayerId,
          false,
          currentCycleProgress,
          localPlayerIsCrouching,
          'top',
          false,
          0,
          false,
          isSnorkeling
        );

        if (!itemBehindPlayer && canRenderItem && equipment) {
          renderSwimmingEquippedItem();
        }
      }
    };

    // Phase 3c: Iterate over pre-merged ySortedEntities from useEntityFiltering
    let currentBatch: typeof currentYSortedEntities = [];
    for (const item of currentYSortedEntities) {
      if (item.type === 'swimmingPlayerTopHalf') {
        flushBatch(currentBatch);
        currentBatch.length = 0;
        const scratch = swimmingPlayerScratchRef.current;
        const topHalfScratch = swimmingPlayerTopHalfScratchRef.current;
        let playerForRendering: SpacetimeDBPlayer = item.entity;
        if (item.playerId === localPlayerId && currentPredictedPosition) {
          Object.assign(scratch, item.entity);
          scratch.positionX = currentPredictedPosition.x;
          scratch.positionY = currentPredictedPosition.y;
          scratch.direction = localFacingDirection ?? item.entity.direction;
          playerForRendering = scratch as SpacetimeDBPlayer;
        } else if (remotePlayerInterpolation) {
          const interp = remotePlayerInterpolation.updateAndGetSmoothedPosition(item.entity, localPlayerId);
          Object.assign(scratch, item.entity);
          scratch.positionX = interp.x;
          scratch.positionY = interp.y;
          playerForRendering = scratch as SpacetimeDBPlayer;
        }
        topHalfScratch.entity = playerForRendering;
        topHalfScratch.playerId = item.playerId;
        topHalfScratch.yPosition = item.yPosition;
        renderSwimmingPlayerTopHalf(topHalfScratch);
      } else {
        currentBatch.push(item);
      }
    }
    flushBatch(currentBatch);
    currentBatch.length = 0;
    // --- END Y-SORTED ENTITIES AND SWIMMING PLAYER TOP HALVES ---
    const _t3 = mark(showFpsProfiler);

    // --- Render Tree Canopy Shadow Overlays ---
    // These render AFTER all Y-sorted entities so shadows appear ON TOP of all entities under tree canopies.
    // The overlay uses tree-to-tree Y-sorted compositing to ensure shadows from trees behind
    // don't appear on tree canopies that are in front (higher Y = closer to camera).
    // Players walking under a tree (whether in front of or behind the trunk) will be in shade.
    // NOTE: Canopy shadows are skipped at night (no sunlight to cast shadows)
    // NOTE: Canopy shadows respect the treeShadowsEnabled visual setting
    if (visibleTrees && visibleTrees.length > 0 && treeShadowsEnabled) {
      renderTreeCanopyShadowsOverlay(ctx, visibleTrees, now_ms, isTreeFalling, worldState?.timeOfDay, treeShadowsEnabled);
    }
    // --- END TREE CANOPY SHADOWS ---

    // --- Render Sea Stack Ground Shadow Overlays ---
    // These render AFTER all Y-sorted entities so shadows appear ON TOP of players near sea stacks,
    // matching how tree canopy shadows work. Uses an offscreen canvas with sea stack body cutouts
    // so the shadow appears on the ground/players but NOT on the sea stack rock itself.
    // Skip when snorkeling (underwater silhouettes are used instead).
    if (!isSnorkeling && visibleSeaStacks && visibleSeaStacks.length > 0) {
      renderSeaStackShadowsOverlay(ctx, visibleSeaStacks, doodadImagesRef.current, currentCycleProgress);
    }
    // --- END SEA STACK GROUND SHADOW OVERLAYS ---
    const _t3a = mark(showFpsProfiler);

    // --- Render animal burrow effects (dirt particles when animals burrow underground) ---
    // Process all wild animals to detect newly burrowed animals
    processWildAnimalsForBurrowEffects(wildAnimals, now_ms);
    // Render the active burrow particle effects
    renderBurrowEffects(ctx, now_ms);
    // --- END BURROW EFFECTS ---

    // --- Render Hot Springs (ABOVE players for steam/bubbles to show on top) ---
    renderHotSprings(
      ctx,
      detectedHotSprings,
      -currentCameraOffsetX, // Camera X in world coordinates
      -currentCameraOffsetY, // Camera Y in world coordinates
      canvasSize.width,
      canvasSize.height
    );
    // --- END HOT SPRINGS ---

    // --- UNDERWATER BUBBLE EFFECTS (snorkeling mode) ---
    // Render bubbles floating upward when snorkeling (only over sea tiles)
    if (isSnorkeling) {
      // Create water tile checker using the lookup map
      // Tiles are 48px each (matches server TILE_SIZE_PX)
      const TILE_SIZE = 48;
      const checkIsWaterTile = (worldX: number, worldY: number): boolean => {
        const tileX = Math.floor(worldX / TILE_SIZE);
        const tileY = Math.floor(worldY / TILE_SIZE);
        const key = `${tileX},${tileY}`;
        return waterTileLookup.get(key) ?? false;
      };

      renderUnderwaterEffectsOver(
        ctx,
        -currentCameraOffsetX,
        -currentCameraOffsetY,
        canvasSize.width,
        canvasSize.height,
        now_ms,
        false, // Don't apply vignette here - do it in screen space after ctx.restore()
        checkIsWaterTile // Only render bubbles over water tiles
      );
    }
    // --- END UNDERWATER BUBBLE EFFECTS ---

    // --- Render Foundation Target Indicator (for upgrade targeting) ---
    if (targetedFoundation && hasRepairHammer && !targetedWall && ctx) {
      // Only show foundation indicator if no wall is targeted
      renderFoundationTargetIndicator({
        ctx,
        foundation: targetedFoundation,
        worldScale: 1.0,
        viewOffsetX: -currentCameraOffsetX,
        viewOffsetY: -currentCameraOffsetY,
      });
    }
    // --- End Foundation Target Indicator ---

    // --- Render Wall Target Indicator (for upgrade targeting) ---
    // Render AFTER walls so it's visible on top
    if (targetedWall && hasRepairHammer && ctx) {
      renderWallTargetIndicator({
        ctx,
        wall: targetedWall,
        worldScale: 1.0,
        viewOffsetX: -currentCameraOffsetX,
        viewOffsetY: -currentCameraOffsetY,
      });
    }
    // --- End Wall Target Indicator ---

    // --- Render Fence Target Indicator (for repair/demolish targeting) ---
    // Render AFTER fences so it's visible on top
    if (targetedFence && hasRepairHammer && ctx) {
      renderFenceTargetIndicator({
        ctx,
        fence: targetedFence,
        worldScale: 1.0,
        viewOffsetX: -currentCameraOffsetX,
        viewOffsetY: -currentCameraOffsetY,
      });
    }
    // --- End Fence Target Indicator ---

    // REMOVED: Top half rendering now integrated into Y-sorted system above
    // REMOVED: Swimming shadows now render earlier, before sea stacks

    // REMOVED: Swimming players now render normally in Y-sorted entities for proper depth sorting

    // REMOVED: Sea stacks now render fully in Y-sorted entities
    // Water overlay will be clipped to only appear over underwater zones

    // Wild animals are now rendered through the Y-sorted entities system for proper layering

    // Render particle systems
    if (ctx) {
      // REMOVED: Shore wave particles now render earlier (after water overlay, before sea stack tops)
      // This ensures they appear below sea stacks for proper depth layering

      // Call without camera offsets, as ctx is already translated
      renderParticlesToCanvas(ctx, campfireParticles);
      renderParticlesToCanvas(ctx, torchParticles);
      renderParticlesToCanvas(ctx, fireArrowParticles);
      renderParticlesToCanvas(ctx, furnaceParticles);
      renderParticlesToCanvas(ctx, barbecueParticles);
      renderParticlesToCanvas(ctx, firePatchParticles);
      renderWardParticles(ctx, wardParticles, 0, 0); // Custom renderer for proper flame/wisp shapes
      // NOTE: Resource sparkle particles moved to after day/night overlay for visibility at night

      // Render cut grass effects
      renderCutGrassEffects(ctx, now_ms);

      // Render arrow break effects
      renderArrowBreakEffects(ctx, now_ms);

      // Render other players' fishing lines and bobbers
      if (typeof window !== 'undefined' && (window as any).renderOtherPlayersFishing) {
        // console.log('[FISHING RENDER] Calling renderOtherPlayersFishing from GameCanvas');
        (window as any).renderOtherPlayersFishing(ctx);
      } else {
        // console.log('[FISHING RENDER] renderOtherPlayersFishing not available on window');
      }
    }

    renderInteractionLabels({
      ctx,
      harvestableResources: visibleHarvestableResourcesMap,
      campfires: visibleCampfiresMap,
      furnaces: visibleFurnacesMap, // ADDED: furnaces parameter
      barbecues: visibleBarbecuesMap, // ADDED: barbecues parameter
      fumaroles: fumaroles, // ADDED: fumaroles parameter
      droppedItems: visibleDroppedItemsMap,
      woodenStorageBoxes: visibleBoxesMap,
      playerCorpses: visiblePlayerCorpsesMap,
      stashes: stashes,
      sleepingBags: visibleSleepingBagsMap,
      players: players,
      itemDefinitions,
      closestInteractableTarget: rd.unifiedInteractableTarget as any,
      lanterns: visibleLanternsMap,
      turrets: visibleTurretsMap, // ADDED: Turrets to interaction labels
      rainCollectors: rainCollectors,
      brothPots: brothPots,
      homesteadHearths: visibleHomesteadHearthsMap,
      doors: visibleDoorsMap, // ADDED: Doors
      alkStations: alkStations || EMPTY_MAP, // ADDED: ALK Stations for E label rendering
    });

    // Render local player status tags (AUTO ATTACK, AUTO WALK indicators)
    // These are LOCAL ONLY - not visible to other players
    if (localPlayer && !localPlayer.isDead) {
      // Get local player's screen position (use predicted position if available)
      const localPlayerScreenX = currentPredictedPosition?.x ?? localPlayer.positionX;
      const localPlayerScreenY = currentPredictedPosition?.y ?? localPlayer.positionY;

      renderLocalPlayerStatusTags({
        ctx,
        playerX: localPlayerScreenX,
        playerY: localPlayerScreenY,
        isAutoAttacking,
        isAutoWalking,
      });
    }

    const placementWarningResult = renderPlacementPreview({
      ctx, placementInfo, buildingState, itemImagesRef, shelterImageRef, worldMouseX: currentWorldMouseX,
      worldMouseY: currentWorldMouseY, isPlacementTooFar: isPlacementTooFarValue, placementError,
      onClearPlacementError: placementActions.clearPlacementError,
      connection,
      doodadImagesRef,
      worldScale: 1,
      viewOffsetX: -currentCameraOffsetX,
      viewOffsetY: -currentCameraOffsetY,
      localPlayerX,
      localPlayerY,
      inventoryItems,
      itemDefinitions,
      foundationTileImagesRef,
    });
    if (placementWarningResult !== lastPlacementWarningRef.current) {
      lastPlacementWarningRef.current = placementWarningResult;
      setPlacementWarning(placementWarningResult);
    }

    // --- Render Clouds on Canvas --- (NEW POSITION)
    // Clouds are rendered after all other world-anchored entities and UI,
    // so they appear on top of everything in the world space.
    if (clouds && clouds.size > 0 && cloudImagesRef.current) {
      renderCloudsDirectly({
        ctx,
        clouds: currentInterpolatedClouds,
        cloudImages: cloudImagesRef.current,
        worldScale: 1,
        cameraOffsetX: currentCameraOffsetX,
        cameraOffsetY: currentCameraOffsetY
      });
    }
    // --- End Render Clouds on Canvas ---

    // --- Render Drones on Canvas --- (shadow-style like clouds)
    if (droneEvents && droneEvents.size > 0 && droneImageRef.current) {
      const interpolatedDrones = getInterpolatedDrones(droneEvents, droneImageRef.current, now_ms);
      if (interpolatedDrones.size > 0) {
        renderDronesDirectly({
          ctx,
          drones: interpolatedDrones,
          droneImage: droneImageRef.current,
          worldScale: 1,
          cameraOffsetX: currentCameraOffsetX,
          cameraOffsetY: currentCameraOffsetY
        });
      }
    }
    // --- End Render Drones on Canvas ---

    // --- Render Chunk Boundaries (Debug) ---
    if (showChunkBoundaries && worldState) {
      renderChunkBoundaries(ctx, {
        chunkSizePx: gameConfig.chunkSizePx,
        cameraOffsetX: currentCameraOffsetX,
        cameraOffsetY: currentCameraOffsetY,
        canvasWidth: currentCanvasWidth,
        canvasHeight: currentCanvasHeight,
      });
    }
    // --- End Render Chunk Boundaries ---

    // --- Render Interior Debug Overlay ---
    if (showInteriorDebug && buildingClusters.size > 0) {
      renderInteriorDebug(ctx, {
        buildingClusters,
        playerBuildingClusterId,
        foundationTileSize: gameConfig.foundationTileSize,
      });
    }
    // --- End Render Interior Debug Overlay ---

    // --- Render Collision Debug Overlay ---
    if (showCollisionDebug && localPlayer) {
      const playerX = currentPredictedPosition?.x ?? localPlayer.positionX;
      const playerY = currentPredictedPosition?.y ?? localPlayer.positionY;

      // Build the game entities map for collision debug
      const gameEntitiesForDebug = {
        trees: trees || EMPTY_MAP,
        stones: stones || EMPTY_MAP,
        runeStones: runeStones || EMPTY_MAP,
        cairns: cairns || EMPTY_MAP,
        boxes: woodenStorageBoxes || EMPTY_MAP,
        rainCollectors: rainCollectors || EMPTY_MAP,
        furnaces: furnaces || EMPTY_MAP,
        barbecues: barbecues || EMPTY_MAP,
        shelters: shelters || EMPTY_MAP,
        players: players || EMPTY_MAP,
        wildAnimals: wildAnimals || EMPTY_MAP,
        barrels: barrels || EMPTY_MAP,
        roadLampposts: roadLampposts || EMPTY_MAP,
        seaStacks: seaStacks || EMPTY_MAP,
        wallCells: wallCells || EMPTY_MAP,
        foundationCells: foundationCells || EMPTY_MAP,
        homesteadHearths: homesteadHearths || EMPTY_MAP,
        basaltColumns: basaltColumns || EMPTY_MAP,
        doors: doors || EMPTY_MAP,
        alkStations: alkStations || EMPTY_MAP,
        lanterns: lanterns || EMPTY_MAP, // Add lanterns for ward collision
        turrets: turrets || EMPTY_MAP, // ADDED: Turrets for collision
        monumentParts: monumentParts ?? EMPTY_MAP, // Village campfires, etc.
      };

      // Get collision shapes from the client collision system
      const collisionShapes = getCollisionShapesForDebug(
        gameEntitiesForDebug,
        playerX,
        playerY,
        localPlayer.identity.toHexString()
      );

      renderCollisionDebug(ctx, {
        playerX,
        playerY,
        localPlayerId: localPlayer.identity.toHexString(),
        collisionShapes,
      });

      // Render projectile collision debug (hit radii for projectiles)
      renderProjectileCollisionDebug(ctx, {
        projectiles: rd.projectiles,
        playerX,
        playerY,
        currentTimeMs: performance.now(),
      });
    }
    // --- End Render Collision Debug Overlay ---

    // --- Render Y-Sort Debug Overlay ---
    if (showYSortDebug && localPlayer) {
      const playerX = currentPredictedPosition?.x ?? localPlayer.positionX;
      const playerY = currentPredictedPosition?.y ?? localPlayer.positionY;

      renderYSortDebug(ctx, {
        playerX,
        playerY,
        ySortedEntities: currentYSortedEntities,
        viewMinX: -currentCameraOffsetX,
        viewMaxX: -currentCameraOffsetX + currentCanvasWidth,
        localPlayerId: localPlayer.identity?.toHexString?.(),
      });
    }
    // --- End Render Y-Sort Debug Overlay ---

    // --- Render Stone Tiller Target Preview ---
    if (hasStoneTiller && localPlayer && connection) {
      const playerX = currentPredictedPosition?.x ?? localPlayer.positionX;
      const playerY = currentPredictedPosition?.y ?? localPlayer.positionY;
      const facingDir = localFacingDirection || localPlayer.direction;

      renderTillerPreview({
        ctx,
        connection,
        playerX,
        playerY,
        facingDirection: facingDir,
      });
    }
    // --- End Stone Tiller Target Preview ---

    // --- Render Attack Range Debug Overlay ---
    if (showAttackRangeDebug && localPlayer) {
      const playerX = currentPredictedPosition?.x ?? localPlayer.positionX;
      const playerY = currentPredictedPosition?.y ?? localPlayer.positionY;
      const facingDir = localFacingDirection || localPlayer.direction;

      // Get the equipped item definition for weapon-specific range display
      const playerId = localPlayer.identity.toHexString();
      const equipment = activeEquipments.get(playerId);
      let equippedItemDef: SpacetimeDBItemDefinition | null = null;
      if (equipment?.equippedItemDefId) {
        equippedItemDef = itemDefinitions.get(equipment.equippedItemDefId.toString()) || null;
      }

      renderAttackRangeDebug(ctx, {
        playerX,
        playerY,
        facingDirection: facingDir,
        localPlayerId: playerId,
        equippedItemDef, // Pass equipped weapon for correct range display
      }, {
        woodenStorageBoxes,
        barbecues,
        furnaces,
        campfires,
        sleepingBags,
        stashes,
        trees,
        stones,
        wildAnimals,
        players,
        barrels,
        grass: interpolatedGrass, // Use merged grass data with health/respawnAt
      });
    }
    // --- End Render Attack Range Debug Overlay ---

    ctx.restore(); // This is the restore from translate(currentCameraOffsetX, currentCameraOffsetY)

    // --- Render Rain Before Color Overlay ---
    // Rain should be rendered before the day/night overlay so it doesn't show above the darkness at night
    // Calculate rain intensity from chunk-based weather system
    let rainIntensity = 0.0;
    if (localPlayer && chunkWeather) {
      const playerX = currentPredictedPosition?.x ?? localPlayer.positionX;
      const playerY = currentPredictedPosition?.y ?? localPlayer.positionY;
      const currentChunkIndex = calculateChunkIndex(playerX, playerY);
      const chunkWeatherData = chunkWeather.get(currentChunkIndex.toString());

      if (chunkWeatherData && chunkWeatherData.currentWeather?.tag !== 'Clear') {
        // Use rain intensity from chunk weather (0.0 to 1.0)
        rainIntensity = chunkWeatherData.rainIntensity ?? 0.0;
      }
    }

    // Fallback to global weather if chunk weather not available (backward compatibility)
    if (rainIntensity === 0.0 && worldState?.rainIntensity) {
      rainIntensity = worldState.rainIntensity;
    }

    // Only render rain/snow if weather overlay is enabled (performance toggle)
    // Don't render rain when snorkeling - player is underwater!
    // In winter, render snow instead of rain (same server mechanics, different visuals)
    // IMPORTANT: Call renderRain even when rainIntensity is 0 so thunder flash can show
    // (thunder can occur in clear weather; flash is rendered inside renderRain)
    const isWinter = worldState?.currentSeason?.tag === 'Winter';
    if (showWeatherOverlay && !isSnorkeling) {
      renderRain(
        ctx,
        -currentCameraOffsetX, // Convert screen offset to world camera position
        -currentCameraOffsetY, // Convert screen offset to world camera position
        currentCanvasWidth,
        currentCanvasHeight,
        rainIntensity,
        deltaTimeRef.current / 1000, // Convert milliseconds to seconds
        isWinter // Render snow instead of rain in winter
      );
    }
    // --- End Rain Rendering ---

    // --- Render Weather Atmosphere Overlay ---
    // Darkens and desaturates the scene based on storm intensity
    // Renders BEFORE day/night overlay so both effects layer naturally
    // Smoothly fades in/out when moving between chunks with different weather
    // Always render atmospheric overlay - it's lightweight and provides visual feedback
    renderWeatherOverlay(
      ctx,
      currentCanvasWidth,
      currentCanvasHeight,
      rainIntensity, // Target intensity (will smoothly transition)
      currentCycleProgress, // Time of day progress (read from ref)
      Date.now() // Current time for transition timing
    );
    // --- End Weather Atmosphere Overlay ---

    // --- Post-Processing (Day/Night, Indicators, Lights, Minimap) ---
    // Day/Night mask overlay
    if (overlayRgba !== 'transparent' && overlayRgba !== 'rgba(0,0,0,0.00)' && maskCanvas) {
      ctx.drawImage(maskCanvas, 0, 0);
    }

    // --- Render Ward Protection Radius (Above Day/Night Overlay for visibility) ---
    // Ward radius uses diegetic energy field rendering that glows through darkness
    if (visibleLanterns && visibleLanterns.length > 0) {
      ctx.save();
      ctx.translate(currentCameraOffsetX, currentCameraOffsetY);
      for (const lantern of visibleLanterns) {
        // Only render for wards (not regular lanterns)
        if (lantern.lanternType !== LANTERN_TYPE_LANTERN && !lantern.isDestroyed) {
          renderWardRadius(ctx, lantern, currentCycleProgress, true); // true = over day/night, diegetic rendering
        }
      }
      ctx.restore();
    }
    // --- End Ward Protection Radius ---

    // --- Render Resource Sparkle Particles (Above Day/Night Overlay for visibility) ---
    // Resource sparkle particles render AFTER day/night overlay so they glow visibly at night
    ctx.save();
    ctx.translate(currentCameraOffsetX, currentCameraOffsetY); // Re-apply camera translation for world-space particles
    renderParticlesToCanvas(ctx, resourceSparkleParticles);
    ctx.restore();
    // --- End Resource Sparkle Particles ---

    // --- Render Impact Particles (Blood/Ethereal hit effects) ---
    // Impact particles render at world level so they move with entities
    if (impactParticles.length > 0) {
      ctx.save();
      ctx.translate(currentCameraOffsetX, currentCameraOffsetY);
      renderParticlesToCanvas(ctx, impactParticles);
      ctx.restore();
    }
    // --- End Impact Particles ---

    // --- Render Structure Impact Particles (Sparks when walls/doors are hit) ---
    // Orange/yellow sparks when hostiles or players attack structures
    if (structureImpactParticles.length > 0) {
      ctx.save();
      ctx.translate(currentCameraOffsetX, currentCameraOffsetY);
      renderParticlesToCanvas(ctx, structureImpactParticles);
      ctx.restore();
    }
    // --- End Structure Impact Particles ---

    // --- Render Hostile Death Particles (Above Day/Night Overlay for visibility) ---
    // Hostile death particles (blue/purple sparks) render AFTER day/night overlay so they glow dramatically at night
    if (hostileDeathParticles.length > 0) {
      ctx.save();
      ctx.translate(currentCameraOffsetX, currentCameraOffsetY); // Re-apply camera translation for world-space particles
      renderParticlesToCanvas(ctx, hostileDeathParticles);
      ctx.restore();
    }
    // --- End Hostile Death Particles ---

    // --- UNDERWATER VIGNETTE (snorkeling mode) ---
    // Renders a depth vignette around screen edges for underwater immersion
    if (isSnorkeling) {
      renderUnderwaterVignette(ctx, currentCanvasWidth, currentCanvasHeight);
    }
    // --- END UNDERWATER VIGNETTE ---

    // --- Render Health/Frost Overlays (Above Day/Night, Below UI) ---
    // These overlays render AFTER day/night so they're visible at night
    if (showStatusOverlays && localPlayer && !localPlayer.isDead && !localPlayer.isKnockedOut) {
      const healthPercent = localPlayer.health / 100.0; // Health is 0-100
      const warmthPercent = localPlayer.warmth / 100.0; // Warmth is 0-100

      // Use combined rendering function that handles blending when both conditions are met
      renderCombinedHealthOverlays(
        ctx,
        currentCanvasWidth,
        currentCanvasHeight,
        healthPercent,
        warmthPercent,
        deltaTimeRef.current / 1000 // Convert to seconds for animation timing
      );
    }
    // --- End Health/Frost Overlays ---

    // --- Broth Effects Overlays (NightVision, Intoxicated) ---
    if (showStatusOverlays && localPlayer && !localPlayer.isDead && !localPlayer.isKnockedOut) {
      // Render broth effects (NightVision and Intoxicated)
      renderBrothEffectsOverlays(
        ctx,
        currentCanvasWidth,
        currentCanvasHeight,
        deltaTimeRef.current / 1000, // Convert to seconds for animation timing
        activeConsumableEffects,
        localPlayerId,
        currentCycleProgress // Pass day/night cycle progress for NightVision effect
      );
    }
    // --- End Broth Effects Overlays ---

    // --- Insanity Overlay (Memory Shard Effect) ---
    // Render insanity overlay independently - always show when player has insanity
    if (localPlayer && !localPlayer.isDead && !localPlayer.isKnockedOut) {
      // Calculate insanity intensity (0.0-1.0) from player insanity / max (100.0)
      const insanityIntensity = (localPlayer.insanity ?? 0) / 100.0;

      // Check if player has Entrainment effect (max insanity death sentence)
      const hasEntrainment = localPlayerId && activeConsumableEffects
        ? Array.from(activeConsumableEffects.values()).some(
          effect => effect.playerId.toHexString() === localPlayerId &&
            effect.effectType.tag === 'Entrainment'
        )
        : false;

      // Always render (even at 0 intensity for smooth transitions)
      renderInsanityOverlay(
        ctx,
        currentCanvasWidth,
        currentCanvasHeight,
        deltaTimeRef.current / 1000, // Convert to seconds for animation timing
        insanityIntensity,
        hasEntrainment // Pass Entrainment status for extra chaotic effects
      );
    }
    // --- End Insanity Overlay ---

    // Interaction indicators - Draw only for visible entities that are interactable
    // Uses centralized ENTITY_VISUAL_CONFIG to position indicator at center of blue box
    const drawIndicatorIfNeeded = (entityType: 'campfire' | 'furnace' | 'barbecue' | 'fumarole' | 'lantern' | 'box' | 'stash' | 'corpse' | 'knocked_out_player' | 'water' | 'homestead_hearth' | 'door', entityId: number | bigint | string, entityPosX: number, entityPosY: number, entityHeight: number, isInView: boolean, boxType?: number) => {
      const hip = rd.holdInteractionProgress;
      // If holdInteractionProgress is null (meaning no interaction is even being tracked by the state object),
      // or if the entity is not in view, do nothing.
      if (!isInView || !hip) {
        return;
      }

      let targetId: number | bigint | string;
      if (typeof entityId === 'string') {
        targetId = entityId; // For knocked out players (hex string) or water ('water')
      } else if (typeof entityId === 'bigint') {
        targetId = BigInt(hip.targetId ?? 0);
      } else {
        targetId = Number(hip.targetId ?? 0);
      }

      // Check if the current entity being processed is the target of the (potentially stale) holdInteractionProgress object.
      if (hip.targetType === entityType && targetId === entityId) {

        // IMPORTANT: Only draw the indicator if the hold is *currently active* (isActivelyHolding is true).
        // If isActivelyHolding is false, it means the hold was just released/cancelled.
        // In this case, we don't draw anything for this entity, not even the background circle.
        // The indicator will completely disappear once holdInteractionProgress becomes null in the next state update.
        if (rd.isActivelyHolding) {
          // Use appropriate duration based on interaction type
          const interactionDuration = entityType === 'knocked_out_player' ? REVIVE_HOLD_DURATION_MS : HOLD_INTERACTION_DURATION_MS;
          const currentProgress = Math.min(Math.max((Date.now() - hip.startTime) / interactionDuration, 0), 1);

          // Map entity type to config key - use appropriate config for each box type
          let configKey: string;
          if (entityType === 'box') {
            if (boxType === 3) {
              configKey = 'compost';
            } else if (boxType === 2) {
              configKey = 'refrigerator';
            } else {
              configKey = 'wooden_storage_box';
            }
          } else if (entityType === 'furnace') {
            // Use monument_large_furnace config for monument large furnaces
            configKey = entityHeight >= 480 ? 'monument_large_furnace'
              : entityHeight >= 256 ? 'large_furnace'
                : 'furnace';
          } else {
            configKey = entityType;
          }
          const config = ENTITY_VISUAL_CONFIG[configKey];

          // Use centralized config for indicator position (center of blue box)
          // Fallback to old calculation if config not found
          let indicatorX: number;
          let indicatorY: number;
          if (config) {
            const pos = getIndicatorPosition(entityPosX, entityPosY, config);
            indicatorX = pos.x + currentCameraOffsetX;
            indicatorY = pos.y + currentCameraOffsetY;
          } else {
            indicatorX = entityPosX + currentCameraOffsetX;
            indicatorY = entityPosY + currentCameraOffsetY - (entityHeight / 2) - 15;
          }

          drawInteractionIndicator(ctx, indicatorX, indicatorY, currentProgress);
        }
      }
    };

    // Iterate through visible entities MAPS for indicators
    visibleCampfiresMap.forEach((fire: SpacetimeDBCampfire) => {
      drawIndicatorIfNeeded('campfire', fire.id, fire.posX, fire.posY, CAMPFIRE_HEIGHT, true);
    });

    // Furnace interaction indicators (for hold actions like toggle burning)
    visibleFurnacesMap.forEach((furnace: SpacetimeDBFurnace) => {
      // Use correct height based on furnace type and monument status
      const dimensions = getFurnaceDimensions(furnace.furnaceType, isCompoundMonument(furnace.isMonument, furnace.posX, furnace.posY));
      drawIndicatorIfNeeded('furnace', furnace.id, furnace.posX, furnace.posY, dimensions.height, true);
    });

    // Barbecue interaction indicators (for hold actions like toggle burning)
    visibleBarbecuesMap.forEach((barbecue: SpacetimeDBBarbecue) => {
      drawIndicatorIfNeeded('barbecue', barbecue.id, barbecue.posX, barbecue.posY, 128, true); // 128px height for barbecue
    });

    // Fumarole interaction indicators - removed empty forEach loop for performance
    // Fumaroles don't need hold indicators since they're always on

    // Lantern interaction indicators
    visibleLanternsMap.forEach((lantern: SpacetimeDBLantern) => {
      // For lanterns, the indicator is only relevant if a hold action is in progress (e.g., picking up an empty lantern)
      if (rd.holdInteractionProgress && rd.holdInteractionProgress.targetId === lantern.id && rd.holdInteractionProgress.targetType === 'lantern') {
        drawIndicatorIfNeeded('lantern', lantern.id, lantern.posX, lantern.posY, 56, true); // 56px height for lanterns
      }
    });

    visibleBoxesMap.forEach((box: SpacetimeDBWoodenStorageBox) => {
      // For boxes, the indicator is only relevant if a hold action is in progress (e.g., picking up an empty box)
      if (rd.holdInteractionProgress && rd.holdInteractionProgress.targetId === box.id && rd.holdInteractionProgress.targetType === 'box') {
        drawIndicatorIfNeeded('box', box.id, box.posX, box.posY, BOX_HEIGHT, true, box.boxType);
      }
    });

    // Corrected: Iterate over the full 'stashes' map for drawing indicators for stashes
    // The 'isInView' check within drawIndicatorIfNeeded can be enhanced if needed,
    // but for interaction progress, if it's the target, we likely want to show it if player is close.
    if (stashes instanceof Map) { // Ensure stashes is a Map
      stashes.forEach((stash: SpacetimeDBStash) => {
        // Check if this stash is the one currently being interacted with for a hold action
        if (rd.holdInteractionProgress && rd.holdInteractionProgress.targetId === stash.id && rd.holdInteractionProgress.targetType === 'stash') {
          // For a hidden stash being surfaced, we want to draw the indicator.
          // The 'true' for isInView might need refinement if stashes can be off-screen 
          // but still the closest interactable (though unlikely for a hold interaction).
          // For now, assume if it's the interaction target, it's relevant to draw the indicator.
          drawIndicatorIfNeeded('stash', stash.id, stash.posX, stash.posY, STASH_HEIGHT, true);
        }
      });
    }

    // Knocked Out Player Indicators
    if (rd.closestInteractableKnockedOutPlayerId && players instanceof Map) {
      const knockedOutPlayer = players.get(rd.closestInteractableKnockedOutPlayerId);
      if (knockedOutPlayer && knockedOutPlayer.isKnockedOut && !knockedOutPlayer.isDead) {
        // Check if this knocked out player is the one currently being revived
        if (rd.holdInteractionProgress && String(rd.holdInteractionProgress.targetId) === rd.closestInteractableKnockedOutPlayerId && rd.holdInteractionProgress.targetType === 'knocked_out_player') {
          const playerHeight = 48; // Approximate player sprite height
          drawIndicatorIfNeeded('knocked_out_player', rd.closestInteractableKnockedOutPlayerId, knockedOutPlayer.positionX, knockedOutPlayer.positionY, playerHeight, true);
        }
      }
    }

    // Water Drinking Indicators
    if (rd.closestInteractableWaterPosition && rd.holdInteractionProgress && rd.holdInteractionProgress.targetType === 'water') {
      // Draw indicator at the water position
      drawIndicatorIfNeeded('water', 'water', rd.closestInteractableWaterPosition.x, rd.closestInteractableWaterPosition.y, 0, true);
    }

    // Door Pickup Indicators (hold E to pickup)
    visibleDoorsMap.forEach((door: any) => {
      // For doors, the indicator is only relevant if a hold action is in progress (picking up the door)
      if (rd.holdInteractionProgress && rd.holdInteractionProgress.targetId === door.id && rd.holdInteractionProgress.targetType === 'door') {
        const DOOR_HEIGHT = 96; // Standard door height
        drawIndicatorIfNeeded('door', door.id, door.posX, door.posY, DOOR_HEIGHT, true);
      }
    });
    const _t4 = mark(showFpsProfiler);

    // Campfire Lights - Only draw for visible campfires
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    visibleCampfiresMap.forEach((fire: SpacetimeDBCampfire) => {
      renderCampfireLight({
        ctx,
        campfire: fire,
        cameraOffsetX: currentCameraOffsetX,
        cameraOffsetY: currentCameraOffsetY,
        // Indoor light containment - clip light to building interior
        buildingClusters,
      });
    });

    // Village Campfire Lights - Fishing + Hunting (same fv_campfire doodad, always burning)
    // Renders the warm, cozy light from Aleut-style communal campfires
    if (monumentParts && monumentParts.size > 0) {
      monumentParts.forEach((part: any) => {
        const isFishingVillageCampfire = part.monumentType?.tag === 'FishingVillage' && part.isCenter;
        const isHuntingVillageCampfire = part.monumentType?.tag === 'HuntingVillage' && part.partType === 'campfire';
        if (isFishingVillageCampfire || isHuntingVillageCampfire) {
          renderFishingVillageCampfireLight({
            ctx,
            worldX: part.worldX,
            worldY: part.worldY,
            cameraOffsetX: currentCameraOffsetX,
            cameraOffsetY: currentCameraOffsetY,
            cycleProgress: currentCycleProgress,
          });
        }
      });
    }

    // Lantern Lights - Only draw for visible lanterns
    visibleLanternsMap.forEach((lantern: SpacetimeDBLantern) => {
      renderLanternLight({
        ctx,
        lantern: lantern,
        cameraOffsetX: currentCameraOffsetX,
        cameraOffsetY: currentCameraOffsetY,
        // Indoor light containment - clip light to building interior
        buildingClusters,
      });
    });

    // Furnace Lights - Only draw for visible furnaces with industrial red glow
    visibleFurnacesMap.forEach((furnace: SpacetimeDBFurnace) => {
      renderFurnaceLight({
        ctx,
        furnace: furnace,
        cameraOffsetX: currentCameraOffsetX,
        cameraOffsetY: currentCameraOffsetY,
        // Indoor light containment - clip light to building interior
        buildingClusters,
      });
    });

    // Barbecue Lights - Only draw for visible barbecues (same as campfire)
    visibleBarbecuesMap.forEach((barbecue: SpacetimeDBBarbecue) => {
      renderBarbecueLight({
        ctx,
        barbecue: barbecue,
        cameraOffsetX: currentCameraOffsetX,
        cameraOffsetY: currentCameraOffsetY,
        // Indoor light containment - clip light to building interior
        buildingClusters,
      });
    });

    // Road Lamppost Lights - Aleutian whale oil lampposts along dirt roads (only at night)
    visibleRoadLamppostsMap.forEach((lamppost: SpacetimeDBRoadLamppost) => {
      renderRoadLamppostLight({
        ctx,
        lamppost,
        cameraOffsetX: currentCameraOffsetX,
        cameraOffsetY: currentCameraOffsetY,
        cycleProgress: currentCycleProgress,
      });
    });

    // Buoy Night Lights - Red LED glow on navigational buoys (same "lights on" as road lamps)
    visibleBarrelsMap.forEach((barrel: SpacetimeDBBarrel) => {
      if ((barrel.variant ?? 0) === 6) {
        renderBuoyLight({
          ctx,
          barrel,
          cameraOffsetX: currentCameraOffsetX,
          cameraOffsetY: currentCameraOffsetY,
          cycleProgress: currentCycleProgress,
        });
      }
    });

    // Rune Stone Night Lights - Light cutouts handled by useDayNightCycle hook
    // Render rising glowing particles (Sea of Stars style) on top of the light area
    visibleRuneStonesMap.forEach((runeStone: SpacetimeDBRuneStone) => {
      renderRuneStoneNightLight(
        ctx,
        runeStone,
        currentCycleProgress,
        currentCameraOffsetX,
        currentCameraOffsetY,
        now_ms // Pass nowMs to enable particle rendering
      );
    });

    // Shipwreck Night Lights - Eerie blue/purple glow for protected zones
    // Shipwrecks serve as safe havens for new players - hostile NPCs won't approach
    // shipwreckPartsMap is pre-computed at component level via useMemo
    if (shipwreckPartsMap && shipwreckPartsMap.size > 0) {
      renderAllShipwreckNightLights(
        ctx,
        shipwreckPartsMap,
        currentCycleProgress,
        currentCameraOffsetX,
        currentCameraOffsetY,
        -currentCameraOffsetX, // viewMinX
        -currentCameraOffsetX + currentCanvasWidth, // viewMaxX
        -currentCameraOffsetY, // viewMinY
        -currentCameraOffsetY + currentCanvasHeight, // viewMaxY
        now_ms
      );

      // Compound Eerie Lights - Nanobot-style blue/purple ambient glow (replaces street lamps)
      renderCompoundEerieLights(
        ctx,
        currentCycleProgress,
        currentCameraOffsetX,
        currentCameraOffsetY,
        -currentCameraOffsetX,
        -currentCameraOffsetX + currentCanvasWidth,
        -currentCameraOffsetY,
        -currentCameraOffsetY + currentCanvasHeight,
        now_ms
      );

      // DEBUG: Visible protection zone circles for shipwreck parts
      // Shows purple circle (protection zone), green crosshair (visual center), red dot (anchor point)
      // Toggle via Debug Panel -> SHIPWRECK button
      if (showShipwreckDebug) {
        renderAllShipwreckDebugZones(
          ctx,
          shipwreckPartsMap,
          currentCameraOffsetX,
          currentCameraOffsetY,
          -currentCameraOffsetX, // viewMinX
          -currentCameraOffsetX + currentCanvasWidth, // viewMaxX
          -currentCameraOffsetY, // viewMinY
          -currentCameraOffsetY + currentCanvasHeight // viewMaxY
        );
      }
    }

    // Homestead hearth interaction indicators (for hold actions like grant building privilege)
    // Hearth visual is 125x125, so use 125 for height to match the visual
    // Offset moved up by ~20% (15px) for better alignment
    visibleHomesteadHearthsMap.forEach((hearth: SpacetimeDBHomesteadHearth) => {
      drawIndicatorIfNeeded('homestead_hearth', hearth.id, hearth.posX, hearth.posY - 15, 125, true);
    });

    // --- Player Lights (Torch, Flashlight, Headlamp) ---
    // Unified rendering of all player light sources in a single pass
    renderAllPlayerLights({
      ctx,
      players,
      localPlayerId,
      currentPredictedPosition,
      remotePlayerInterpolation,
      activeEquipments,
      itemDefinitions,
      cameraOffsetX: currentCameraOffsetX,
      cameraOffsetY: currentCameraOffsetY,
      buildingClusters,
      currentWorldMouseX,
      currentWorldMouseY,
    });
    // --- End Player Lights ---

    // --- SOVA Aura (Local Player Night Vision Aid) ---
    // Renders a subtle blue-cyan night vision bubble around the local player ONLY.
    // This is purely visual - no gameplay effects, not visible to remote players.
    // Automatically activates during nighttime (dusk to dawn).
    if (localPlayerId && currentPredictedPosition) {
      renderSovaAura({
        ctx,
        playerWorldX: currentPredictedPosition.x,
        playerWorldY: currentPredictedPosition.y,
        cameraOffsetX: currentCameraOffsetX,
        cameraOffsetY: currentCameraOffsetY,
        cycleProgress: currentCycleProgress,
      });
    }
    // --- End SOVA Aura ---

    ctx.restore(); // Restore from 'lighter' blend mode for lights
    const _t5 = mark(showFpsProfiler);

    // --- Mobile Tap Animation ---
    if (isMobile && tapAnimation) {
      renderMobileTapAnimation({
        ctx,
        tapAnimation,
        cameraOffsetX: currentCameraOffsetX,
        cameraOffsetY: currentCameraOffsetY,
      });
    }
    // --- End Mobile Tap Animation ---

    // === AAA Damage Vignette Effect (rendered on canvas, not as React DOM) ===
    // PERFORMANCE FIX: Reading from ref instead of React state eliminates
    // 15-20 re-renders per combat hit during the 350ms vignette animation.
    const currentVignetteOpacity = vignetteOpacityRef.current;
    if (currentVignetteOpacity > 0) {
      ctx.save();
      // Reset transform to screen space (vignette is a screen-space overlay)
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const cx = currentCanvasWidth / 2;
      const cy = currentCanvasHeight / 2;
      const maxRadius = Math.sqrt(cx * cx + cy * cy);
      const gradient = ctx.createRadialGradient(cx, cy, maxRadius * 0.2, cx, cy, maxRadius);
      gradient.addColorStop(0, 'transparent');
      gradient.addColorStop(0.7, `rgba(180, 20, 20, ${currentVignetteOpacity * 0.7})`);
      gradient.addColorStop(1, `rgba(120, 0, 0, ${currentVignetteOpacity})`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, currentCanvasWidth, currentCanvasHeight);
      ctx.restore();
    }
    // === End Damage Vignette ===

    // === PERFORMANCE PROFILING - Frame time tracking ===
    const frameEndTime = performance.now();
    const frameTime = frameEndTime - frameStartTime;
    perfProfilingRef.current.totalFrameTime += frameTime;

    // === FPS Profiler Overlay (delegated to FpsProfiler module) ===
    if (showFpsProfiler) {
      const timings = { t0: _t0, t1: _t1, t1a: _t1a, t1b: _t1b, t1c: _t1c, t2: _t2, t3: _t3, t3a: _t3a, t4: _t4, t5: _t5 };
      const profiler = fpsProfilerRef.current;
      profiler.update(timings, frameTime, currentYSortedEntities.length);
      profiler.recordIfActive(timings, frameTime, currentYSortedEntities.length);
      profiler.render(ctx, currentCanvasWidth, isProfilerRecording ?? false);
    }
    perfProfilingRef.current.renderCallCount++;
    if (frameTime > perfProfilingRef.current.maxFrameTime) {
      perfProfilingRef.current.maxFrameTime = frameTime;
    }
    if (frameTime > 16) {
      perfProfilingRef.current.slowFrames++;
    }
    if (frameTime > 33) {
      perfProfilingRef.current.verySlowFrames++;
    }

    // === LAG DIAGNOSTICS ===
    // Comprehensive performance analysis to identify lag source
    if (ENABLE_LAG_DIAGNOSTICS && Date.now() - perfProfilingRef.current.lastLogTime > LAG_DIAGNOSTIC_INTERVAL_MS) {
      const p = perfProfilingRef.current;
      const avgFrameTime = p.frameCount > 0 ? p.totalFrameTime / p.frameCount : 0;
      const avgServerLatency = p.serverUpdateCount > 0 ? p.totalServerLatency / p.serverUpdateCount : 0;
      const fps = p.frameCount > 0 ? (1000 / avgFrameTime) : 0;
      const slowFramePct = p.frameCount > 0 ? ((p.slowFrames / p.frameCount) * 100).toFixed(1) : '0';
      const verySlowFramePct = p.frameCount > 0 ? ((p.verySlowFrames / p.frameCount) * 100).toFixed(1) : '0';

      // Determine primary lag source
      const isReactBottleneck = avgFrameTime > 16 || parseFloat(slowFramePct) > 10;
      const isNetworkBottleneck = avgServerLatency > 100;

      console.log('%c═══════════════════════════════════════════════════════════════', 'color: #00ff00');
      console.log('%c                    🎮 LAG DIAGNOSTIC REPORT                    ', 'color: #00ff00; font-weight: bold; font-size: 14px');
      console.log('%c═══════════════════════════════════════════════════════════════', 'color: #00ff00');

      // VERDICT
      if (isReactBottleneck && isNetworkBottleneck) {
        console.log('%c⚠️  VERDICT: BOTH React AND Network are causing lag!', 'color: #ff6600; font-weight: bold');
      } else if (isReactBottleneck) {
        console.log('%c🔴 VERDICT: REACT/RENDERING is the primary bottleneck', 'color: #ff0000; font-weight: bold');
      } else if (isNetworkBottleneck) {
        console.log('%c🔵 VERDICT: NETWORK LATENCY is the primary bottleneck', 'color: #0088ff; font-weight: bold');
      } else {
        console.log('%c✅ VERDICT: Performance is GOOD - no major bottleneck detected', 'color: #00ff00; font-weight: bold');
      }

      console.log('');
      console.log('%c📊 RENDER PERFORMANCE (React/Canvas)', 'color: #ffaa00; font-weight: bold');
      console.log(`   FPS: ${fps.toFixed(1)} | Avg Frame: ${avgFrameTime.toFixed(2)}ms | Max Frame: ${p.maxFrameTime.toFixed(2)}ms`);
      console.log(`   Slow Frames (>16ms): ${p.slowFrames}/${p.frameCount} (${slowFramePct}%)`);
      console.log(`   Very Slow (>33ms): ${p.verySlowFrames}/${p.frameCount} (${verySlowFramePct}%)`);
      if (avgFrameTime > 16) {
        console.log('%c   ⚠️  Average frame time exceeds 60fps budget!', 'color: #ff6600');
      }

      console.log('');
      console.log('%c🌐 NETWORK PERFORMANCE (SpacetimeDB)', 'color: #00aaff; font-weight: bold');
      console.log(`   Server Updates: ${p.serverUpdateCount} | Avg Interval: ${avgServerLatency.toFixed(0)}ms | Max: ${p.maxServerLatency.toFixed(0)}ms`);
      if (avgServerLatency > 100) {
        console.log('%c   ⚠️  High server update latency - check network/maincloud RTT', 'color: #ff6600');
      } else if (p.serverUpdateCount < 10) {
        console.log('%c   ℹ️  Low update count - player may be stationary', 'color: #888888');
      }

      console.log('');
      console.log('%c📦 ENTITY COUNTS (data volume)', 'color: #aa88ff; font-weight: bold');
      console.log(`   Players: ${players.size} | Trees: ${trees?.size || 0} | Stones: ${stones?.size || 0}`);
      console.log(`   Y-Sorted Entities: ${currentYSortedEntities.length}`);
      console.log(`   Visible - Campfires: ${visibleCampfiresMap.size} | Boxes: ${visibleBoxesMap.size} | Resources: ${visibleHarvestableResourcesMap.size}`);
      console.log(`   Visible - Items: ${visibleDroppedItemsMap.size} | Grass: ${visibleGrassMap?.size || 0} | SeaStacks: ${visibleSeaStacksMap.size}`);

      // Recommendations
      console.log('');
      console.log('%c💡 RECOMMENDATIONS', 'color: #ffff00; font-weight: bold');
      if (isReactBottleneck) {
        if (currentYSortedEntities.length > 500) {
          console.log('   - Y-sorted entities are high - consider reducing view distance');
        }
        if ((visibleGrassMap?.size || 0) > 200) {
          console.log('   - Grass count is high - consider disabling grass in settings');
        }
        if (p.verySlowFrames > 5) {
          console.log('   - Many frames below 30fps - check for GC pressure or heavy useMemo');
        }
        console.log('   - Try disabling weather overlay, tree shadows, or reducing particle effects');
      }
      if (isNetworkBottleneck) {
        console.log('   - Consider testing with local SpacetimeDB instance');
        console.log('   - Check if you are far from maincloud servers');
        console.log('   - Reduce movement input frequency if possible');
      }

      console.log('%c═══════════════════════════════════════════════════════════════', 'color: #00ff00');

      // Reset counters
      perfProfilingRef.current = {
        lastLogTime: Date.now(),
        frameCount: 0,
        totalFrameTime: 0,
        maxFrameTime: 0,
        slowFrames: 0,
        verySlowFrames: 0,
        lastServerUpdateTime: p.lastServerUpdateTime, // Preserve
        serverUpdateCount: 0,
        maxServerLatency: 0,
        totalServerLatency: 0,
        renderCallCount: 0,
      };
    }
    // === END LAG DIAGNOSTICS ===

    // Performance monitoring - check frame time at end
    checkPerformance(frameStartTime);

    // Minimap now rendered as React component overlay, not on game canvas

  }, [checkPerformance,
    // Dependencies
    // NOTE: High-frequency values are now read from refs to avoid callback recreation every frame:
    // - cameraOffsetX/Y, worldMousePos, animationFrame, predictedPosition
    // - sprintAnimationFrame, idleAnimationFrame, interpolatedClouds, worldState.cycleProgress
    visibleHarvestableResources,
    visibleHarvestableResourcesMap,
    visibleDroppedItems, visibleCampfires, visibleSleepingBags,
    visibleCampfiresMap, visibleDroppedItemsMap, visibleBoxesMap,
    players, itemDefinitions, inventoryItems, trees, stones,
    worldState, localPlayerId, localPlayer, activeEquipments, localPlayerPin, viewCenterOffset,
    itemImagesRef, heroImageRef, heroSprintImageRef, heroWaterImageRef, heroCrouchImageRef, heroDodgeImageRef, cloudImagesRef,
    canvasSize.width, canvasSize.height,
    placementInfo, placementError, overlayRgba, maskCanvasRef,
    // Phase 4b: messages, projectiles, holdInteractionProgress, closestInteractable* moved to renderGameDepsRef
    hoveredPlayerIds, handlePlayerHover,
    isMinimapOpen, isMouseOverMinimap, minimapZoom,
    activeConnections,
    activeConsumableEffects,
    visiblePlayerCorpses,
    visibleStashes,
    visibleSleepingBags,
    isSearchingCraftRecipes,
    visibleTrees,
    visibleTreesMap,
    playerCorpses,
    showInventory,
    gameCanvasRef,
    deathMarkerImg,
    localPlayerDeathMarker,
    shelters,
    visibleShelters,
    visibleSheltersMap,
    shelterImageRef.current,
    minimapCache,
    chunkWeather,
    clouds, // Only need clouds prop for the size check, interpolation is via ref
    droneEvents,
    droneImageRef,
    showFpsProfiler,
  ]);

  const gameLoopCallback = useCallback((frameInfo: FrameInfo) => {
    // Update deltaTime ref directly to avoid re-renders
    // Clamp deltaTime to reasonable bounds for consistent particle behavior
    if (frameInfo.deltaTime > 0 && frameInfo.deltaTime < 100) {
      deltaTimeRef.current = frameInfo.deltaTime;
    } else {
      // Use fallback deltaTime for extreme cases (pause/resume, tab switching, etc.)
      deltaTimeRef.current = 16.667; // 60fps fallback
    }

    // PERFORMANCE FIX: Process inputs in the same RAF cycle as rendering
    // Previously this was a separate useGameLoop call, effectively running 2 RAF loops
    processInputsAndActions();

    renderGame();
  }, [renderGame, processInputsAndActions]);

  // Use the updated hook with optimized performance settings
  // PERFORMANCE: Profiling disabled for production - enable temporarily to debug
  useGameLoop(gameLoopCallback, {
    targetFPS: 60,
    maxFrameTime: 33, // 30fps budget to avoid false alarms on lower-end devices
    enableProfiling: false // Set to true temporarily for debugging performance issues
  });

  // Convert sleepingBags map key from string to number for DeathScreen
  const sleepingBagsById = useMemo(() => {
    const mapById = new Map<number, SpacetimeDBSleepingBag>();
    if (sleepingBags instanceof Map) {
      sleepingBags.forEach(bag => {
        mapById.set(bag.id, bag);
      });
    }
    return mapById;
  }, [sleepingBags]);

  // Calculate the viewport bounds needed by useSpacetimeTables
  const worldViewport = useMemo(() => {
    // Return null if canvas size is zero to avoid issues
    if (canvasSize.width === 0 || canvasSize.height === 0) {
      return null;
    }

    // 🚨 FIX: Cap viewport size to prevent subscription overload
    // Max viewport should cover ~1920x1080 pixels to keep chunk subscriptions reasonable
    const maxViewportWidth = 1920;
    const maxViewportHeight = 1080;
    const effectiveWidth = Math.min(canvasSize.width, maxViewportWidth);
    const effectiveHeight = Math.min(canvasSize.height, maxViewportHeight);

    return {
      minX: -cameraOffsetX,
      minY: -cameraOffsetY,
      maxX: -cameraOffsetX + effectiveWidth,
      maxY: -cameraOffsetY + effectiveHeight,
    };
  }, [cameraOffsetX, cameraOffsetY, canvasSize.width, canvasSize.height]);



  // --- Logic to detect player damage from campfires and trigger effects ---
  useEffect(() => {
    if (localPlayer && visibleCampfiresMap) {
      const currentHealth = localPlayer.health;
      const prevHealth = prevPlayerHealthRef.current;

      if (prevHealth !== undefined) { // Only proceed if prevHealth is initialized
        if (currentHealth < prevHealth) { // Health decreased
          const newlyDamagingIds = new Set<string>();
          visibleCampfiresMap.forEach((campfire, id) => {
            if (campfire.isBurning && !campfire.isDestroyed) {
              const dx = localPlayer.positionX - campfire.posX;
              const effectiveCampfireY = campfire.posY - SERVER_CAMPFIRE_DAMAGE_CENTER_Y_OFFSET;
              const dy = localPlayer.positionY - effectiveCampfireY;
              const distSq = dx * dx + dy * dy;
              const damageRadiusSq = SERVER_CAMPFIRE_DAMAGE_RADIUS * SERVER_CAMPFIRE_DAMAGE_RADIUS;

              if (distSq < damageRadiusSq) {
                newlyDamagingIds.add(id.toString());
                // console.log(`[GameCanvas] Player took damage near burning campfire ${id}. Health: ${prevHealth} -> ${currentHealth}`);
              }
            }
          });
          // Set the IDs if any were found, otherwise, this will be an empty set if health decreased but not by a known campfire.
          setDamagingCampfireIds(newlyDamagingIds);
        } else {
          // Health did not decrease (or increased / stayed same). Clear any damaging IDs from previous tick.
          if (damagingCampfireIds.size > 0) {
            setDamagingCampfireIds(new Set());
          }
        }
      }
      prevPlayerHealthRef.current = currentHealth; // Always update prevHealth
    } else {
      // No localPlayer or no visibleCampfiresMap
      if (damagingCampfireIds.size > 0) { // Clear if there are lingering IDs
        setDamagingCampfireIds(new Set());
      }
      if (!localPlayer) { // If player becomes null (e.g. disconnect), reset prevHealth
        prevPlayerHealthRef.current = undefined;
      }
    }
  }, [localPlayer, visibleCampfiresMap]); // Dependencies: localPlayer (for health) and campfires map
  // Note: damagingCampfireIds is NOT in this dependency array. We set it, we don't react to its changes here.

  // --- Register respawn reducer callbacks ---
  useEffect(() => {
    if (!connection) return;

    const handleRespawnRandomlyResult = (ctx: any) => {
      if (ctx.event?.status?.tag === 'Failed') {
        const errorMsg = ctx.event.status.value || 'Respawn failed';
        console.error('[GameCanvas] Respawn randomly failed:', errorMsg);
        showError(errorMsg.length > 80 ? errorMsg.slice(0, 77) + '…' : errorMsg);
      }
    };

    const handleRespawnAtBagResult = (ctx: any, bagId: number) => {
      if (ctx.event?.status?.tag === 'Failed') {
        const errorMsg = ctx.event.status.value || 'Respawn at sleeping bag failed';
        console.error('[GameCanvas] Respawn at bag failed:', errorMsg);
        showError(errorMsg.length > 80 ? errorMsg.slice(0, 77) + '…' : errorMsg);
      }
    };

    // Register the callbacks
    connection.reducers?.onRespawnRandomly?.(handleRespawnRandomlyResult);
    connection.reducers?.onRespawnAtSleepingBag?.(handleRespawnAtBagResult);

    // Cleanup function to remove callbacks
    return () => {
      connection.reducers?.removeOnRespawnRandomly?.(handleRespawnRandomlyResult);
      connection.reducers?.removeOnRespawnAtSleepingBag?.(handleRespawnAtBagResult);
    };
  }, [connection, showError]);

  // --- Dynamically resize canvas to fill container (both mobile and desktop) ---
  // This ensures the canvas logical size matches the display size, eliminating CSS scaling distortion
  useEffect(() => {
    if (!isMinimapOpen || !minimapCanvasRef.current) return;

    const canvas = minimapCanvasRef.current;
    const container = canvas.parentElement;
    if (!container) return;

    const updateCanvasSize = () => {
      // Get container dimensions (actual display size)
      const rect = container.getBoundingClientRect();
      const containerWidth = Math.floor(rect.width);
      const containerHeight = Math.floor(rect.height);

      // Update canvas logical resolution to match display size
      // This eliminates non-uniform CSS scaling and ensures 1:1 pixel mapping
      if (canvas.width !== containerWidth || canvas.height !== containerHeight) {
        canvas.width = containerWidth;
        canvas.height = containerHeight;
        setMinimapCanvasSizeState({ width: containerWidth, height: containerHeight });
      }
    };

    // Initial size update
    updateCanvasSize();

    // Watch for container size changes
    const resizeObserver = new ResizeObserver(() => {
      updateCanvasSize();
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [isMinimapOpen, isMobile]);

  // --- Drone flyover: RAF loop for smooth minimap interpolation ---
  // PERFORMANCE: Call draw directly via ref - no setState, no React re-renders every frame
  useEffect(() => {
    if (!isMinimapOpen || !droneEvents || droneEvents.size === 0) return;
    let rafId: number;
    const loop = () => {
      minimapDrawRef.current();
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [isMinimapOpen, droneEvents?.size ?? 0]);

  // --- Minimap rendering effect ---
  useEffect(() => {
    if (!isMinimapOpen || !minimapCanvasRef.current) return;

    const canvas = minimapCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const doDraw = () => {
      if (!minimapCanvasRef.current) return;
      const c = minimapCanvasRef.current;
      const context = c.getContext('2d');
      if (!context) return;

      context.clearRect(0, 0, c.width, c.height);

      const validPlayers = players instanceof Map ? players : EMPTY_MAP;
      const validTrees = trees instanceof Map ? trees : EMPTY_MAP;
      const validStones = stones instanceof Map ? stones : EMPTY_MAP;
      const validRuneStones = runeStones instanceof Map ? runeStones : EMPTY_MAP;
      const validSleepingBags = sleepingBags instanceof Map ? sleepingBags : EMPTY_MAP;
      const validCampfires = campfires instanceof Map ? campfires : EMPTY_MAP;

      const savedGridPref = localStorage.getItem('minimap_show_grid_coordinates');
      const showGridCoordinates = savedGridPref !== null ? savedGridPref === 'true' : true;

      const chunkWeatherForMinimap = new Map<number, any>();
      if (chunkWeather) {
        chunkWeather.forEach((weather, chunkIndexStr) => {
          const chunkIndex = parseInt(chunkIndexStr, 10);
          if (!isNaN(chunkIndex)) {
            chunkWeatherForMinimap.set(chunkIndex, weather);
          }
        });
      }

      drawMinimapOntoCanvas({
        ctx: context,
        players: validPlayers,
        trees: validTrees,
        stones: validStones,
        runeStones: validRuneStones,
        barrels: barrels instanceof Map ? barrels : EMPTY_MAP,
        campfires: validCampfires,
        sleepingBags: validSleepingBags,
        localPlayer,
        localPlayerId,
        viewCenterOffset,
        playerPin: localPlayerPin,
        canvasWidth: c.width,
        canvasHeight: c.height,
        isMouseOverMinimap,
        zoomLevel: minimapZoom,
        sleepingBagImage: itemImagesRef.current?.get('sleeping_bag.png'),
        localPlayerDeathMarker: localPlayerDeathMarker,
        deathMarkerImage: deathMarkerImg,
        worldState: worldState,
        minimapCache: minimapCache,
        pinMarkerImage: pinMarkerImg,
        campfireWarmthImage: campfireWarmthImg,
        torchOnImage: torchOnImg,
        showGridCoordinates,
        showWeatherOverlay: minimapShowWeatherOverlay,
        chunkWeatherData: chunkWeatherForMinimap,
        alkStations: alkStations,
        monumentParts: monumentParts,
        largeQuarries: largeQuarries,
        livingCorals: visibleLivingCoralsMap,
        showNames: minimapShowNames,
        matronageMembers: matronageMembers,
        matronages: matronages,
        beaconDropEvents: beaconDropEvents,
        droneEvents: droneEvents,
      });
    };

    minimapDrawRef.current = doDraw;
    doDraw();
  }, [
    isMinimapOpen,
    players,
    trees,
    stones,
    runeStones,
    sleepingBags,
    campfires,
    barrels,
    localPlayer,
    localPlayerId,
    viewCenterOffset,
    localPlayerPin,
    isMouseOverMinimap,
    minimapZoom,
    itemImagesRef,
    localPlayerDeathMarker,
    deathMarkerImg,
    worldState,
    minimapCache,
    pinMarkerImg,
    campfireWarmthImg,
    torchOnImg,
    minimapShowWeatherOverlay,
    chunkWeather,
    alkStations,
    monumentParts,
    largeQuarries,
    visibleLivingCoralsMap,
    minimapShowNames,
    matronageMembers,
    matronages,
    beaconDropEvents,
    droneEvents,
  ]);

  // PERFORMANCE FIX: Removed duplicate useGameLoop(processInputsAndActions)
  // Input processing now happens in the main gameLoopCallback above
  // This eliminates running 2 separate RAF cycles

  // Performance tracking (emergency mode removed)
  const performanceMode = useRef({
    lastFrameTime: 0
  });

  return (
    <div style={{ position: 'relative', width: canvasSize.width, height: canvasSize.height, overflow: 'hidden' }}>
      <canvas
        ref={gameCanvasRef}
        id="game-canvas"
        width={canvasSize.width}
        height={canvasSize.height}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          cursor: cursorStyle,
          pointerEvents: isGameMenuOpen ? 'none' : 'auto', // Don't capture events when menu is open
          touchAction: isMobile ? 'none' : 'auto', // Prevent default touch behaviors on mobile
        }}
        onContextMenu={(e) => {
          if (placementInfo) {
            e.preventDefault();
          }
        }}
      />

      {/* === AAA Damage Vignette Effect === */}
      {/* PERFORMANCE FIX: Vignette is now rendered on the game canvas in renderGame() */}
      {/* Reading from vignetteOpacityRef avoids React re-renders during damage animations */}

      {/* === Low Health Warning Effect === */}
      {/* Pulsing red border when health is critically low */}
      {isLowHealth && !localPlayer?.isDead && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            boxShadow: `inset 0 0 ${isCriticalHealth ? 80 : 50}px ${isCriticalHealth ? 30 : 15}px rgba(180, 20, 20, ${0.3 + heartbeatPulse * 0.4})`,
            zIndex: 49,
            transition: 'box-shadow 0.1s ease-out',
          }}
        />
      )}

      {shouldShowDeathScreen && (
        <DeathScreen
          // Remove respawnAt prop, add others later
          // respawnAt={respawnTimestampMs}
          // onRespawn={handleRespawnRequest} // We'll wire new callbacks later
          onRespawnRandomly={() => {
            console.log("Respawn Randomly Clicked");
            connection?.reducers?.respawnRandomly();
          }}
          onRespawnAtBag={(bagId) => {
            console.log("Respawn At Bag Clicked:", bagId);
            connection?.reducers?.respawnAtSleepingBag(bagId);
          }}
          localPlayerIdentity={localPlayerId ?? null}
          sleepingBags={sleepingBagsById} // Pass converted map
          // Pass other required props for minimap rendering within death screen
          players={players}
          trees={trees}
          stones={stones}
          runeStones={runeStones}
          barrels={barrels}
          campfires={campfires}
          playerPin={localPlayerPin}
          sleepingBagImage={itemImagesRef.current?.get('sleeping_bag.png')}
          // Pass the identified corpse and its image for the death screen minimap
          localPlayerDeathMarker={localPlayerDeathMarker}
          deathMarkerImage={deathMarkerImg}
          worldState={worldState}
          minimapCache={minimapCache} // Add minimapCache prop
          // Add the new minimap icon images
          pinMarkerImage={pinMarkerImg}
          campfireWarmthImage={campfireWarmthImg}
          torchOnImage={torchOnImg}
          // Unified monument parts for minimap (will filter by type internally)
          monumentParts={monumentParts}
          // Large quarry locations with types for minimap labels
          largeQuarries={largeQuarries}
          // Living coral reefs for minimap
          livingCorals={visibleLivingCoralsMap}
        />
      )}

      {isMinimapOpen && (
        <>
          {/* Subtle overlay to indicate interface is blocking interaction */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              backgroundColor: 'rgba(0, 0, 0, 0.2)',
              zIndex: 9997, // Below InterfaceContainer (9998) but above game canvas
              pointerEvents: 'none', // Don't block interface interactions
            }}
          />
          <InterfaceContainer
            canvasWidth={canvasSize.width}
            canvasHeight={canvasSize.height}
            style={{
              zIndex: 9998, // Just below MobileControlBar (9999) so it's clickable but stays below control bar
            }}
            onClose={() => {
              setIsMinimapOpen(false);
              onInterfaceClose?.(); // Reset the initial view for next open
            }}
            initialView={interfaceInitialView}
            showWeatherOverlay={minimapShowWeatherOverlay}
            onToggleWeatherOverlay={(checked) => {
              setMinimapShowWeatherOverlay(checked);
              localStorage.setItem('minimap_show_weather_overlay', checked.toString());
            }}
            showNames={minimapShowNames}
            onToggleShowNames={(checked) => {
              setMinimapShowNames(checked);
              localStorage.setItem('minimap_show_names', checked.toString());
            }}
            // ALK Panel data props
            alkContracts={alkContracts}
            alkPlayerContracts={alkPlayerContracts}
            alkStations={alkStations}
            alkState={alkState}
            playerShardBalance={playerShardBalance && localPlayerId ? playerShardBalance.get(localPlayerId) || null : null}
            worldState={worldState}
            itemDefinitions={itemDefinitions}
            inventoryItems={inventoryItems}
            playerPosition={predictedPosition ?? (localPlayer ? { x: localPlayer.positionX, y: localPlayer.positionY } : null)}
            alkInitialTab={alkInitialTab}
            // Cairns Panel data props
            cairns={cairns}
            playerDiscoveredCairns={playerDiscoveredCairns}
            // Matronage Panel data props
            matronages={matronages}
            matronageMembers={matronageMembers}
            matronageInvitations={matronageInvitations}
            matronageOwedShards={matronageOwedShards}
            players={players}
            playerUsername={localPlayer?.username || ''}
            leaderboardEntries={leaderboardEntries}
            achievementDefinitions={achievementDefinitions}
            playerAchievements={playerAchievements}
            plantConfigs={plantConfigs}
            discoveredPlants={discoveredPlants}
            onSearchFocusChange={onSearchFocusChange}
          >
            <canvas
              ref={minimapCanvasRef}
              width={1} // Initial value - will be resized by useEffect to match container
              height={1} // Initial value - will be resized by useEffect to match container
              style={{
                width: '100%',
                height: '100%',
                display: 'block' // Remove inline spacing
              }}
            />
          </InterfaceContainer>
        </>
      )}

      {/* Building Radial Menu */}
      {showBuildingRadialMenu && (
        <BuildingRadialMenu
          isVisible={showBuildingRadialMenu}
          mouseX={radialMenuMouseX}
          mouseY={radialMenuMouseY}
          connection={connection}
          inventoryItems={inventoryItems}
          itemDefinitions={itemDefinitions}
          onSelect={(mode: BuildingMode, tier: BuildingTier, initialShape?: FoundationShape) => {
            if (buildingActions) {
              buildingActions.startBuildingMode(mode, tier, initialShape);
            }
            setShowBuildingRadialMenu(false); // Close menu after selection
          }}
          onCancel={() => {
            setShowBuildingRadialMenu(false); // Close menu on cancel
            buildingActions.cancelBuildingMode(); // Clear building selection
          }}
        />
      )}


      {/* Upgrade Radial Menu - for foundations */}
      {showUpgradeRadialMenu && upgradeMenuFoundationRef.current && (
        <UpgradeRadialMenu
          isVisible={showUpgradeRadialMenu}
          mouseX={radialMenuMouseX}
          mouseY={radialMenuMouseY}
          connection={connection}
          inventoryItems={inventoryItems}
          itemDefinitions={itemDefinitions}
          tile={upgradeMenuFoundationRef.current}
          tileType="foundation"
          activeConsumableEffects={activeConsumableEffects}
          localPlayerId={localPlayerId}
          homesteadHearths={homesteadHearths}
          onSelect={(tier: BuildingTier) => {
            if (connection && upgradeMenuFoundationRef.current) {
              console.log('[UpgradeRadialMenu] Upgrading foundation', upgradeMenuFoundationRef.current.id, 'to tier', tier);
              connection.reducers.upgradeFoundation(
                upgradeMenuFoundationRef.current.id,
                tier as number
              );
            }
            // Clear all menu state immediately
            setShowUpgradeRadialMenu(false);
            upgradeMenuFoundationRef.current = null;
          }}
          onCancel={() => {
            // Clear all menu state immediately
            setShowUpgradeRadialMenu(false);
            upgradeMenuFoundationRef.current = null;
          }}
          onDestroy={() => {
            if (connection && upgradeMenuFoundationRef.current) {
              console.log('[UpgradeRadialMenu] Destroying foundation', upgradeMenuFoundationRef.current.id);
              connection.reducers.destroyFoundation(upgradeMenuFoundationRef.current.id);
            }
            // Clear all menu state immediately
            setShowUpgradeRadialMenu(false);
            upgradeMenuFoundationRef.current = null;
          }}
        />
      )}

      {/* Upgrade Radial Menu - for walls */}
      {showUpgradeRadialMenu && upgradeMenuWallRef.current && (
        <UpgradeRadialMenu
          isVisible={showUpgradeRadialMenu}
          mouseX={radialMenuMouseX}
          mouseY={radialMenuMouseY}
          connection={connection}
          inventoryItems={inventoryItems}
          itemDefinitions={itemDefinitions}
          tile={upgradeMenuWallRef.current}
          tileType="wall"
          activeConsumableEffects={activeConsumableEffects}
          localPlayerId={localPlayerId}
          homesteadHearths={homesteadHearths}
          onSelect={(tier: BuildingTier) => {
            if (connection && upgradeMenuWallRef.current) {
              console.log('[UpgradeRadialMenu] Upgrading wall', upgradeMenuWallRef.current.id, 'to tier', tier);
              connection.reducers.upgradeWall(
                upgradeMenuWallRef.current.id,
                tier as number
              );
            }
            // Clear all menu state immediately
            setShowUpgradeRadialMenu(false);
            upgradeMenuWallRef.current = null;
          }}
          onCancel={() => {
            // Clear all menu state immediately
            setShowUpgradeRadialMenu(false);
            upgradeMenuWallRef.current = null;
          }}
          onDestroy={() => {
            if (connection && upgradeMenuWallRef.current) {
              console.log('[UpgradeRadialMenu] Destroying wall', upgradeMenuWallRef.current.id);
              connection.reducers.destroyWall(upgradeMenuWallRef.current.id);
            }
            // Clear all menu state immediately
            setShowUpgradeRadialMenu(false);
            upgradeMenuWallRef.current = null;
          }}
        />
      )}

      {/* Upgrade Radial Menu - for fences (destroy only - fences don't have tiers) */}
      {showUpgradeRadialMenu && upgradeMenuFenceRef.current && (
        <UpgradeRadialMenu
          isVisible={showUpgradeRadialMenu}
          mouseX={radialMenuMouseX}
          mouseY={radialMenuMouseY}
          connection={connection}
          inventoryItems={inventoryItems}
          itemDefinitions={itemDefinitions}
          tile={upgradeMenuFenceRef.current}
          tileType="fence"
          activeConsumableEffects={activeConsumableEffects}
          localPlayerId={localPlayerId}
          homesteadHearths={homesteadHearths}
          onSelect={(tier: BuildingTier) => {
            if (connection && upgradeMenuFenceRef.current) {
              console.log('[UpgradeRadialMenu] Upgrading fence', upgradeMenuFenceRef.current.id, 'to tier', tier);
              connection.reducers.upgradeFence(
                upgradeMenuFenceRef.current.id,
                tier as number
              );
            }
            // Clear all menu state immediately
            setShowUpgradeRadialMenu(false);
            upgradeMenuFenceRef.current = null;
          }}
          onCancel={() => {
            // Clear all menu state immediately
            setShowUpgradeRadialMenu(false);
            upgradeMenuFenceRef.current = null;
          }}
          onDestroy={() => {
            if (connection && upgradeMenuFenceRef.current) {
              console.log('[UpgradeRadialMenu] Destroying fence', upgradeMenuFenceRef.current.id);
              connection.reducers.destroyFence(upgradeMenuFenceRef.current.id);
            }
            // Clear all menu state immediately
            setShowUpgradeRadialMenu(false);
            upgradeMenuFenceRef.current = null;
          }}
        />
      )}

      {/* Planted Seed Tooltip - shows info when hovering over seeds */}
      {hoveredSeed && canvasMousePos && canvasMousePos.x !== null && canvasMousePos.y !== null && !isGameMenuOpen && !showInventory && (
        <PlantedSeedTooltip
          seed={hoveredSeed}
          visible={true}
          position={{ x: canvasMousePos.x, y: canvasMousePos.y }}
          currentTime={Date.now()}
          clouds={clouds}
          worldState={worldState}
          chunkWeather={chunkWeather}
          waterPatches={waterPatches}
          campfires={campfires}
          lanterns={lanterns}
          furnaces={furnaces}
          trees={trees}
          runeStones={runeStones}
          fertilizerPatches={fertilizerPatches}
          worldChunkData={worldChunkDataMap}
        />
      )}

      {/* Tamed Animal Tooltip - shows info when hovering over tamed animals */}
      {hoveredTamedAnimal && canvasMousePos && canvasMousePos.x !== null && canvasMousePos.y !== null && !isGameMenuOpen && !showInventory && (
        <TamedAnimalTooltip
          animal={hoveredTamedAnimal}
          visible={true}
          position={{ x: canvasMousePos.x, y: canvasMousePos.y }}
          currentTime={Date.now()}
          caribouBreedingData={caribouBreedingData}
          walrusBreedingData={walrusBreedingData}
          caribouRutState={caribouRutState}
          walrusRutState={walrusRutState}
          players={players}
        />
      )}
    </div>
  );
};

const MemoizedGameCanvas = React.memo(GameCanvas);
export default MemoizedGameCanvas;
