/**
 * GameCanvas - Main 2D game renderer and input coordinator.
 *
 * This component is the central orchestrator for rendering the game world and handling
 * player input. It receives entity data from props (fed by useSpacetimeTables via App →
 * GameScreen) and does not subscribe to SpacetimeDB directly.
 *
 * Responsibilities:
 * 1. RENDERING: Draws the full game scene each frame—procedural tiles, water, entities
 *    (Y-sorted for depth), structures (campfires, furnaces, buildings), lights, weather,
 *    and overlays. Uses useGameLoop for the canvas render cycle.
 *
 * 2. VIEWPORT & CULLING: useEntityFiltering filters entities by viewport bounds and
 *    produces Y-sorted arrays for correct draw order (e.g., player behind a tree).
 *
 * 3. INTERACTION: useInteractionFinder finds the closest interactable entity (E key)
 *    for doors, cairns, furnaces, animals, etc. useInputHandler maps keyboard/mouse
 *    input to reducer calls (movement, pickup, attack, building placement).
 *
 * 4. BUILDING: useBuildingManager handles placement mode; useFoundationTargeting,
 *    useWallTargeting, useFenceTargeting provide targeting for construction.
 *
 * Performance: Refs are used for high-frequency data (positions, animation frames);
 * state updates are batched to avoid re-renders on every server tick.
 */

import React, { useEffect, useRef, useCallback, useState, useMemo } from 'react';

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
  RoadLamppost as SpacetimeDBRoadLamppost,
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
  Fumarole as SpacetimeDBFumarole,
  BasaltColumn as SpacetimeDBBasaltColumn,
  HarvestableResource as SpacetimeDBHarvestableResource,
  FoundationCell,
  HomesteadHearth as SpacetimeDBHomesteadHearth,
  Turret as SpacetimeDBTurret,
  AlkStation as SpacetimeDBAlkStation,
  AlkContract as SpacetimeDBAlkContract,
  AlkPlayerContract as SpacetimeDBAlkPlayerContract,
  AlkState as SpacetimeDBAlkState,
  PlayerShardBalance as SpacetimeDBPlayerShardBalance,
  MemoryGridProgress as SpacetimeDBMemoryGridProgress,
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
import { getCollisionShapesForDebug, CollisionShape, PLAYER_RADIUS as CLIENT_PLAYER_RADIUS, COLLISION_OFFSETS } from '../utils/clientCollision'; // Collision debug rendering
import { renderAttackRangeDebug } from '../utils/renderers/attackRangeDebugUtils'; // Attack range visualization
import { renderChunkBoundaries, renderInteriorDebug, renderCollisionDebug, renderYSortDebug, renderProjectileCollisionDebug } from '../utils/renderers/debugOverlayUtils'; // Consolidated debug overlays
import { renderMobileTapAnimation } from '../utils/renderers/mobileRenderingUtils'; // Mobile-specific rendering
import { renderYSortedEntities } from '../utils/renderers/renderingUtils';
import { renderAllFootprints } from '../utils/renderers/terrainTrailUtils';
import { renderWardRadius, LANTERN_TYPE_LANTERN } from '../utils/renderers/lanternRenderingUtils';
import { preloadMonumentImages } from '../utils/renderers/monumentRenderingUtils';
import { renderFoundationTargetIndicator, renderWallTargetIndicator, renderFenceTargetIndicator } from '../utils/renderers/foundationRenderingUtils'; // Foundation/wall/fence target indicators
import { renderInteractionLabels, renderLocalPlayerStatusTags } from '../utils/renderers/labelRenderingUtils';
import { renderInteractionIndicators } from '../utils/renderers/interactionIndicatorRenderingUtils';
import { renderPlacementPreview, isPlacementTooFar } from '../utils/renderers/placementRenderingUtils';
import { detectHotSprings } from '../utils/hotSpringDetector'; // Hot spring detection
import { detectQuarries } from '../utils/quarryDetector'; // Small quarry detection for build restriction zones
import { renderHotSprings } from '../utils/renderers/hotSpringRenderingUtils'; // Hot spring rendering
import { useBuildingManager, BuildingMode, BuildingTier, FoundationShape } from '../hooks/useBuildingManager'; // Building mode manager
import { BuildingRadialMenu } from './BuildingRadialMenu';
import { UpgradeRadialMenu } from './UpgradeRadialMenu';
import { useFoundationTargeting } from '../hooks/useFoundationTargeting';
import { useWallTargeting } from '../hooks/useWallTargeting';
import { useFenceTargeting } from '../hooks/useFenceTargeting';
import { getInteractableLabel } from '../utils/interactionLabelUtils';
import { logDebug, logLagDiagnostic } from '../utils/gameDebugUtils';
import { drawMinimapOntoCanvas } from './Minimap';
import { renderCampfire } from '../utils/renderers/campfireRenderingUtils';
import { renderBarbecue } from '../utils/renderers/barbecueRenderingUtils';
import { renderPlayerCorpse } from '../utils/renderers/playerCorpseRenderingUtils';
import { renderStash } from '../utils/renderers/stashRenderingUtils';
import { renderCampfireLight, renderLanternLight, renderFurnaceLight, renderBarbecueLight, renderRoadLamppostLight, renderBuoyLight, renderAllPlayerLights, renderAllStructureLights, renderFishingVillageCampfireLight, renderSovaAura } from '../utils/renderers/lightRenderingUtils';
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
import { renderPlayer, isPlayerHovered, getSpriteCoordinates, getPlayerForRendering } from '../utils/renderers/playerRenderingUtils';
import { renderSeaStackSingle, renderSeaStackShadowOnly, renderSeaStackBottomOnly, renderSeaStackUnderwaterSilhouette, renderSeaStackShadowsOverlay } from '../utils/renderers/seaStackRenderingUtils';
import { renderBarrelUnderwaterSilhouette, renderSeaBarrelWaterShadowOnly } from '../utils/renderers/barrelRenderingUtils';
import { renderWaterPatches } from '../utils/renderers/waterPatchRenderingUtils';
import { renderFertilizerPatches } from '../utils/renderers/fertilizerPatchRenderingUtils';
import { renderFirePatches } from '../utils/renderers/firePatchRenderingUtils';
import { renderPlacedExplosives, preloadExplosiveImages } from '../utils/renderers/explosiveRenderingUtils';
import { renderUnderwaterShadowIfOverWater } from '../utils/renderers/swimmingEffectsUtils';
import { renderParticlesToCanvas } from '../utils/renderers/particleRenderingUtils';
import { worldPosToTileCoords, getTileTypeFromChunkData } from '../utils/renderers/placementRenderingUtils';
import { isOceanTileTag, isWaterTileTag } from '../utils/tileTypeGuards';
import { updateUnderwaterEffects, renderUnderwaterEffectsUnder, renderUnderwaterEffectsOver, renderUnderwaterVignette, clearUnderwaterEffects } from '../utils/renderers/underwaterEffectsUtils';
import { renderWildAnimal, preloadWildAnimalImages, renderBurrowEffects, cleanupBurrowTracking, processWildAnimalsForBurrowEffects } from '../utils/renderers/wildAnimalRenderingUtils';
import { renderAnimalCorpse, preloadAnimalCorpseImages } from '../utils/renderers/animalCorpseRenderingUtils';
import { renderEquippedItem } from '../utils/renderers/equippedItemRenderingUtils';
import { renderFumarole, preloadFumaroleImages } from '../utils/renderers/fumaroleRenderingUtils';
import { renderBasaltColumn, preloadBasaltColumnImages } from '../utils/renderers/basaltColumnRenderingUtils';

// --- Other Components & Utils ---
import DeathScreen from './DeathScreen.tsx';
import InterfaceContainer from './InterfaceContainer';
import PlantedSeedTooltip from './PlantedSeedTooltip';
import TamedAnimalTooltip from './TamedAnimalTooltip';
import { itemIcons } from '../utils/itemIconUtils';
import { PlacementItemInfo, PlacementActions } from '../hooks/usePlacementManager';
import { gameConfig, getViewBounds, isPlayerMoving, HOLD_INTERACTION_DURATION_MS, REVIVE_HOLD_DURATION_MS } from '../config/gameConfig';
import {
  SERVER_CAMPFIRE_DAMAGE_RADIUS,
  SERVER_CAMPFIRE_DAMAGE_CENTER_Y_OFFSET
} from '../utils/renderers/campfireRenderingUtils';
// V2 system removed due to performance issues
import { BOX_TYPE_PLAYER_BEEHIVE, BOX_TYPE_WILD_BEEHIVE } from '../utils/renderers/woodenStorageBoxRenderingUtils';
import { useInputHandler } from '../hooks/useInputHandler';
import { useGameReducerFeedbackHandlers } from '../hooks/useGameReducerFeedbackHandlers';
import { useViewportSync } from '../hooks/useViewportSync';
import { useRemotePlayerInterpolation } from '../hooks/useRemotePlayerInterpolation';

// Import cut grass effect renderer
import { renderCutGrassEffects } from '../effects/cutGrassEffect';
import { renderArrowBreakEffects } from '../effects/arrowBreakEffect';

// Stable empty Map fallback to avoid per-render allocations.
const EMPTY_MAP = new Map();

/** Swimming animation frame count (sprite sheet). */
const TOTAL_SWIMMING_FRAMES = 24;

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
  getCurrentPositionNow: () => { x: number; y: number } | null; // Exact position at action time.
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
  addSOVAMessage?: (message: { id: string; text: string; isUser: boolean; timestamp: Date; flashTab?: boolean }) => void; // SOVA message sink for cairn lore.
  showSovaSoundBox?: (audio: HTMLAudioElement, label: string) => void; // SOVA audio visualization callback.
  onCairnNotification?: (notification: { id: string; cairnNumber: number; totalCairns: number; title: string; isFirstDiscovery: boolean; timestamp: number }) => void;
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
  minimapCache: any;
  isGameMenuOpen: boolean;
  onAutoActionStatesChange?: (isAutoAttacking: boolean) => void;
  isFishing: boolean;
  plantedSeeds: Map<string, SpacetimeDBPlantedSeed>;
  playerDrinkingCooldowns: Map<string, SpacetimeDBPlayerDrinkingCooldown>;
  wildAnimals: Map<string, SpacetimeDBWildAnimal>; // Includes hostile NPCs with is_hostile_npc = true
  hostileDeathEvents: Array<{ id: string, x: number, y: number, species: string, timestamp: number }>; // Client-side death events for particles
  animalCorpses: Map<string, SpacetimeDBAnimalCorpse>;
  barrels: Map<string, SpacetimeDBBarrel>;
  roadLampposts?: Map<string, SpacetimeDBRoadLamppost>;
  fumaroles: Map<string, SpacetimeDBFumarole>;
  basaltColumns: Map<string, SpacetimeDBBasaltColumn>;
  livingCorals: Map<string, any>; // Living coral for underwater harvesting (uses combat system)
  seaStacks: Map<string, any>;
  homesteadHearths: Map<string, SpacetimeDBHomesteadHearth>;
  foundationCells: Map<string, any>;
  wallCells: Map<string, any>;
  doors: Map<string, any>;
  fences: Map<string, any>;
  setMusicPanelVisible: React.Dispatch<React.SetStateAction<boolean>>;
  movementDirection: { x: number; y: number };
  isAutoWalking: boolean; // Auto-walk state for dodge roll detection
  playerDodgeRollStates: Map<string, any>; // PlayerDodgeRollState from generated types
  // Local facing direction for instant visual feedback (client-authoritative).
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
  furnaces,
  barbecues,
  lanterns,
  turrets,
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
  fumaroles,
  basaltColumns,
  livingCorals, // Living coral for underwater harvesting (uses combat system)
  seaStacks,
  homesteadHearths,
  foundationCells,
  wallCells,
  doors,
  fences,
  setMusicPanelVisible,
  movementDirection,
  isAutoWalking, // Auto-walk state for dodge roll detection
  addSOVAMessage,
  showSovaSoundBox,
  onCairnNotification,
  playerDodgeRollStates,
  localFacingDirection, // Destructure local facing direction for client-authoritative direction changes
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
  const minimapDrawRef = useRef<() => void>(() => { });

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
    if (!localPlayerId) return undefined;
    return players.get(localPlayerId);
  }, [players, localPlayerId]);

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

  const { heroImageRef, heroSprintImageRef, heroIdleImageRef, heroWaterImageRef, heroCrouchImageRef, heroDodgeImageRef, itemImagesRef, cloudImagesRef, droneImageRef, shelterImageRef } = useAssetLoader();
  const doodadImagesRef = useDoodadImages(); // Extracted to dedicated hook
  const foundationTileImagesRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const { worldMousePos, canvasMousePos } = useMousePosition({ canvasRef: gameCanvasRef, cameraOffsetX, cameraOffsetY, canvasSize });

  // Building manager hook (requires worldMousePos)
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
    return itemImagesRef.current?.get('death_marker.png');
  }, [imageLoadTrigger]);

  // Minimap icon images loading using imports (Vite way)
  const [pinMarkerImg, setPinMarkerImg] = useState<HTMLImageElement | null>(null);
  const [campfireWarmthImg, setCampfireWarmthImg] = useState<HTMLImageElement | null>(null);
  const [torchOnImg, setTorchOnImg] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    // Load pin marker image using dynamic import
    import('../assets/ui/marker.png').then((module) => {
      const pinImg = new Image();
      pinImg.onload = () => {
        setPinMarkerImg(pinImg);
      };
      pinImg.onerror = () => console.error('Failed to load pin marker image');
      pinImg.src = module.default;
    });

    // Load campfire warmth image using dynamic import
    import('../assets/ui/warmth.png').then((module) => {
      const warmthImg = new Image();
      warmthImg.onload = () => {
        setCampfireWarmthImg(warmthImg);
      };
      warmthImg.onerror = () => console.error('Failed to load campfire warmth image');
      warmthImg.src = module.default;
    });

    // Load torch image using dynamic import
    import('../assets/items/torch_on.png').then((module) => {
      const torchImg = new Image();
      torchImg.onload = () => {
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

  // Visible tiles and lookups - MUST be before useEntityFiltering (needs seaTransitionTileLookup)
  const tileSize = gameConfig.tileSize;
  const viewTileX = Math.floor((-cameraOffsetX) / tileSize);
  const viewTileY = Math.floor((-cameraOffsetY) / tileSize);
  const bufferedViewTileX = viewTileX - 2;
  const bufferedViewTileY = viewTileY - 2;
  const visibleWorldTiles = useMemo(() => {
    const map = new Map<string, any>();
    const chunkSize = chunkSizeRef.current;
    const tilesHorz = Math.ceil(canvasSize.width / tileSize) + 4;
    const tilesVert = Math.ceil(canvasSize.height / tileSize) + 4;
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
        case 6: return 'HotSpringWater';
        case 7: return 'Quarry';
        case 8: return 'Asphalt';
        case 9: return 'Forest';
        case 10: return 'Tundra';
        case 11: return 'Alpine';
        case 12: return 'TundraGrass';
        case 13: return 'Tilled';
        case 14: return 'DeepSea';
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
        map.set(`${tx}_${ty}`, { worldX: tx, worldY: ty, tileType: { tag: typeFromU8(t) }, variant: v });
      }
    }
    return map;
  }, [bufferedViewTileX, bufferedViewTileY, canvasSize.width, canvasSize.height, chunkCacheVersion, worldChunkDataMap]);
  const waterTileLookup = useMemo(() => {
    const lookup = new Map<string, boolean>();
    if (visibleWorldTiles) {
      visibleWorldTiles.forEach(tile => {
        lookup.set(`${tile.worldX},${tile.worldY}`, isOceanTileTag(tile.tileType?.tag));
      });
    }
    return lookup;
  }, [visibleWorldTiles]);
  const seaTransitionTileLookup = useMemo(() => {
    const lookup = new Map<string, boolean>();
    if (!connection || !visibleWorldTiles) return lookup;
    const isLandAtShore = (t: string | null) => t === 'Beach' || t === 'Asphalt';
    const isShoreWater = (t: string | null) => isWaterTileTag(t);
    visibleWorldTiles.forEach(tile => {
      const tx = tile.worldX;
      const ty = tile.worldY;
      const center = getTileTypeFromChunkData(connection, tx, ty);
      const n = getTileTypeFromChunkData(connection, tx, ty - 1);
      const s = getTileTypeFromChunkData(connection, tx, ty + 1);
      const e = getTileTypeFromChunkData(connection, tx + 1, ty);
      const w = getTileTypeFromChunkData(connection, tx - 1, ty);
      const hasWater = isShoreWater(n) || isShoreWater(s) || isShoreWater(e) || isShoreWater(w);
      const hasLand = isLandAtShore(n) || isLandAtShore(s) || isLandAtShore(e) || isLandAtShore(w);
      const isTransition = (isShoreWater(center) && hasLand) || (isLandAtShore(center) && hasWater);
      if (isTransition) lookup.set(`${tx},${ty}`, true);
    });
    return lookup;
  }, [connection, visibleWorldTiles]);

  // --- Use Entity Filtering Hook ---
  const {
    visibleSleepingBags,
    visibleHarvestableResources,
    visibleDroppedItems,
    visibleCampfires,
    visibleFurnaces,
    visibleBarbecues,
    visibleHarvestableResourcesMap,
    visibleCampfiresMap,
    visibleFurnacesMap,
    visibleBarbecuesMap,
    visibleLanternsMap,
    visibleTurretsMap,
    visibleRuneStonesMap,
    visibleCairns,
    visibleCairnsMap,
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
    visibleFumaroles,
    visibleFumarolesMap,
    visibleBasaltColumns,
    visibleBasaltColumnsMap,
    visibleLivingCorals, // Living corals (uses combat system)
    visibleLivingCoralsMap, // Living corals map
    visibleSeaStacks,
    visibleSeaStacksMap,
    visibleHomesteadHearths,
    visibleHomesteadHearthsMap,
    visibleDoors,
    visibleDoorsMap,
    visibleFences,
    visibleFencesMap,
    buildingClusters,
    playerBuildingClusterId,
    visibleAlkStations,
    visibleAlkStationsMap,
    swimmingPlayersForBottomHalf: swimmingPlayersForBottomHalfFromHook,
  } = useEntityFiltering(
    players,
    trees,
    stones,
    runeStones,
    cairns,
    campfires,
    furnaces,
    barbecues,
    lanterns,
    turrets,
    homesteadHearths,
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
    roadLampposts ?? EMPTY_MAP,
    fumaroles,
    basaltColumns,
    seaStacks,
    foundationCells,
    wallCells,
    doors,
    fences,
    localPlayerId,
    localPlayer?.isSnorkeling ?? false, // Phase 3c: Swimming player split-render (snorkeling = full sprite)
    predictedPosition ? { x: predictedPosition.x, y: predictedPosition.y } : null, // Phase 3c fix: Predicted position for swimming top half Y-sort
    isTreeFalling, // NEW: Pass falling tree checker so falling trees stay visible
    worldChunkDataMap, // PERFORMANCE FIX: Use memoized Map instead of creating new one every render
    alkStations,
    monumentParts,
    livingCorals, // Living coral for underwater harvesting (uses combat system)
    seaTransitionTileLookup // Sea transition tiles: player renders full sprite, no swimming split
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
    droppedItems: visibleDroppedItemsMap,
    campfires,
    lanterns,
    furnaces, // Add furnaces for darkness cutouts
    barbecues,
    roadLampposts: roadLampposts ?? EMPTY_MAP,
    barrels: barrels ?? EMPTY_MAP,
    runeStones,
    firePatches,
    fumaroles,
    monumentParts: monumentParts ?? EMPTY_MAP,
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

    // Find burn effects for local player without intermediate Array.from allocation
    const localPlayerBurnEffects: any[] = [];
    for (const effect of activeConsumableEffects.values()) {
      if (effect.playerId.toHexString() === localPlayerId && effect.effectType.tag === 'Burn') {
        localPlayerBurnEffects.push(effect);
      }
    }

    // Track burn effects by their end time to detect when they're extended (stacked)
    if (!burnSoundPlayedRef.current) {
      burnSoundPlayedRef.current = new Set<string>();
    }

    localPlayerBurnEffects.forEach(effect => {
      const effectKey = `${effect.effectId}_${effect.endsAt.microsSinceUnixEpoch}`;

      // Play sound if this is a new effect or if the end time changed (effect was extended)
      if (!burnSoundPlayedRef.current!.has(effectKey)) {
        logDebug('[BURN_SOUND] Playing burn sound for effect', effect.effectId, 'ending at', effect.endsAt.microsSinceUnixEpoch);
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

  // Feed the renderer with only the visible tiles
  useEffect(() => {
    if (visibleWorldTiles && visibleWorldTiles.size > 0) {
      updateTileCache(visibleWorldTiles);
    }
  }, [visibleWorldTiles, updateTileCache]);

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
    const tileSize = gameConfig.tileSize;

    // THROTTLE: Only recalculate if player moved more than 2 tiles (~96px)
    const dx = playerX - lastShoreCheckPosRef.current.x;
    const dy = playerY - lastShoreCheckPosRef.current.y;
    const movedDistSq = dx * dx + dy * dy;
    if (movedDistSq < 96 * 96) {
      return cachedDistanceToShoreRef.current; // Return cached value
    }

    // Update last check position
    lastShoreCheckPosRef.current = { x: playerX, y: playerY };

    const playerTileX = Math.floor(playerX / tileSize);
    const playerTileY = Math.floor(playerY / tileSize);
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
            const tileWorldX = (playerTileX + offsetX) * tileSize + tileSize / 2;
            const tileWorldY = (playerTileY + offsetY) * tileSize + tileSize / 2;
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
    closestInteractableDoorId,
    closestInteractableAlkStationId,
    closestInteractableCairnId,
    closestInteractableKnockedOutPlayerId,
    closestInteractableWaterPosition,
    closestInteractableMilkableAnimalId,
  } = useInteractionFinder({
    localPlayer,
    campfires,
    furnaces,
    barbecues,
    fumaroles,
    lanterns,
    turrets: visibleTurretsMap,
    homesteadHearths,
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
    doors,
    alkStations: visibleAlkStationsMap,
    cairns,
    harvestableResources,
    worldTiles: visibleWorldTiles,
    // Milkable animal support
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
    predictedPosition,
    getCurrentPositionNow,
    activeEquipments,
    itemDefinitions,
    inventoryItems,
    placementInfo,
    placementActions,
    buildingState,
    buildingActions,
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
    turrets: visibleTurretsMap,
    stashes,
    players,
    cairns,
    playerDiscoveredCairns,
    playerCorpses: visiblePlayerCorpsesMap, // Visible map for optimistic shake + protection check
    addSOVAMessage,
    showSovaSoundBox,
    onCairnNotification,
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
    targetedFoundation,
    targetedWall,
    targetedFence,
    rangedWeaponStats,
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
  // Update mobile interact info when target changes
  useEffect(() => {
    if (onMobileInteractInfoChange && isMobile) {
      onMobileInteractInfoChange(
        unifiedInteractableTarget
          ? { hasTarget: true, label: getInteractableLabel(unifiedInteractableTarget) }
          : null
      );
    }
  }, [unifiedInteractableTarget, isMobile, onMobileInteractInfoChange]);

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
          logDebug('[Mobile] Water drinking requires hold action - not supported in tap');
          break;
        case 'knocked_out_player':
          // Revive requires hold - for mobile just show a message or ignore
          logDebug('[Mobile] Reviving requires hold action - not supported in tap');
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
    if (localPlayer && localPlayer.identity && deathMarkers) {
      const marker = deathMarkers.get(localPlayer.identity.toHexString());
      return marker || null;
    }
    return null;
  }, [localPlayer, deathMarkers]);

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

  useGameReducerFeedbackHandlers({
    connection,
    showError,
    playImmediateSound: playImmediateSound as (soundType: string, volume?: number) => void,
    isAnySovaAudioPlaying,
  });

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
    preloadCairnImages();
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

  // Wrapper for particle renderer (passes refs to extracted util)
  const renderParticles = useCallback((ctx: CanvasRenderingContext2D, particles: any[]) => {
    renderParticlesToCanvas(ctx, particles, particleBucketsRef.current, memoryParticleGradientCacheRef.current);
  }, []);

  useViewportSync(connection, camera.x, camera.y, currentCanvasWidth, currentCanvasHeight);

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
  const PLAYER_SORT_FEET_OFFSET_PX = gameConfig.tileSize;
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

    if (ENABLE_LAG_DIAGNOSTICS) {
      // Track frame count for periodic logging
      perfProfilingRef.current.frameCount++;
    }
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
    const viewBounds = getViewBounds(currentCameraOffsetX, currentCameraOffsetY, currentCanvasWidth, currentCanvasHeight);
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

    // --- RENDER PASS 1: Scene prep & background ---
    ctx.clearRect(0, 0, currentCanvasWidth, currentCanvasHeight);
    renderCyberpunkGridBackground(ctx, currentCanvasWidth, currentCanvasHeight, currentCameraOffsetX, currentCameraOffsetY);
    ctx.save();
    ctx.translate(currentCameraOffsetX, currentCameraOffsetY);
    const _t0 = mark(showFpsProfiler);
    setShelterClippingData(shelterClippingData);
    const isSnorkeling = localPlayer?.isSnorkeling ?? false;
    renderWorldBackground(ctx, currentCameraOffsetX, currentCameraOffsetY, currentCanvasWidth, currentCanvasHeight, visibleWorldTiles, showAutotileDebug, isSnorkeling);

    // --- RENDER PASS 2: World patches (water, fertilizer, fire, explosives) ---
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

    // --- RENDER PASS 3: Ground shadows, sea stacks, caustics, barrel shadows ---
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
    // Skip on sea transition tiles (Beach/Sea, Beach/HotSpringWater, Asphalt/Sea) - same as player swimming shadow
    const isOnSeaTileForBarrels = (worldX: number, worldY: number): boolean => {
      const { tileX, tileY } = worldPosToTileCoords(worldX, worldY);
      return waterTileLookup.get(`${tileX},${tileY}`) ?? false;
    };
    visibleBarrels.forEach(barrel => {
      renderSeaBarrelWaterShadowOnly(ctx, barrel, now_ms, currentCycleProgress, isOnSeaTileForBarrels, seaTransitionTileLookup);
    });
    // --- END SEA BARREL WATER SHADOWS ---

    // --- STEP 1: Render ONLY swimming player bottom halves ---
    // Use single source of truth from useEntityFiltering - prevents half-body glitches (head/body invisible)
    const swimmingPlayersForBottomHalf = swimmingPlayersForBottomHalfFromHook;

    // Render swimming player bottom halves using exact same logic as renderYSortedEntities
    swimmingPlayersForBottomHalf.forEach(player => {
      const playerId = player.identity.toHexString();
      const isLocalPlayer = localPlayerId === playerId;

      // EXACT same position logic as renderYSortedEntities
      const playerForRendering = getPlayerForRendering(
        player,
        isLocalPlayer,
        currentPredictedPosition,
        localFacingDirection,
        remotePlayerInterpolation,
        localPlayerId,
        swimmingPlayerScratchRef.current
      ) as SpacetimeDBPlayer;

      const lastPos = lastPositionsRef.current?.get(playerId);
      const moving = isPlayerMoving(lastPos, playerForRendering.positionX, playerForRendering.positionY);

      // EXACT same animation frame logic as renderYSortedEntities
      let currentAnimFrame: number;
      if (playerForRendering.isOnWater) {
        // Swimming animations - ALL swimming uses idle animation frames from water sprite
        currentAnimFrame = currentIdleAnimationFrame; // Swimming sprite uses idle frames for all swimming movement
      } else {
        // Land animation
        if (!moving) {
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
          moving,
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

      const playerForRendering = getPlayerForRendering(
        player,
        isLocalPlayer,
        currentPredictedPosition,
        localFacingDirection,
        remotePlayerInterpolation,
        localPlayerId,
        swimmingPlayerScratchRef.current
      ) as SpacetimeDBPlayer;

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
        const lastPos = lastPositionsRef.current?.get(playerId);
        const moving = isPlayerMoving(lastPos, playerForRendering.positionX, playerForRendering.positionY);
        const { sx, sy } = getSpriteCoordinates(
          playerForRendering,
          moving,
          currentIdleAnimationFrame,
          false,
          TOTAL_SWIMMING_FRAMES,
          false,
          false,
          true,
          false,
          0
        );
        renderUnderwaterShadowIfOverWater(
          ctx,
          heroImg,
          playerForRendering.positionX,
          playerForRendering.positionY,
          sx,
          sy,
          waterTileLookup,
          seaTransitionTileLookup
        );
      }
    });

    // --- STEP 1.6: Render underwater shadow for snorkeling (underwater) local player ---
    // Snorkeling players are excluded from swimmingPlayersForBottomHalf but still need an underwater shadow
    if (isSnorkeling && localPlayer && currentPredictedPosition) {
      const heroImg = heroWaterImageRef.current || heroImageRef.current;
      if (heroImg) {
        const lastPos = lastPositionsRef.current?.get(localPlayerId ?? '');
        const moving = isPlayerMoving(lastPos, currentPredictedPosition.x, currentPredictedPosition.y);
        const localScratch = localPlayerScratchRef.current;
        Object.assign(localScratch, localPlayer);
        localScratch.positionX = currentPredictedPosition.x;
        localScratch.positionY = currentPredictedPosition.y;
        localScratch.direction = localFacingDirection ?? localPlayer.direction;
        const { sx, sy } = getSpriteCoordinates(
          localScratch as SpacetimeDBPlayer,
          moving,
          currentIdleAnimationFrame,
          false,
          TOTAL_SWIMMING_FRAMES,
          false,
          false,
          true,
          false,
          0
        );
        renderUnderwaterShadowIfOverWater(
          ctx,
          heroImg,
          currentPredictedPosition.x,
          currentPredictedPosition.y,
          sx,
          sy,
          waterTileLookup,
          seaTransitionTileLookup
        );
      }
    }

    // --- STEP 1.7: Render underwater shadows for REMOTE snorkeling players ---
    players.forEach((player) => {
      if (player.identity.toHexString() === localPlayerId) return;
      if (!player.isSnorkeling) return;
      if (player.isDead || player.isKnockedOut) return;
      const heroImg = heroWaterImageRef.current || heroImageRef.current;
      if (heroImg) {
        const playerId = player.identity.toHexString();
        const playerForRendering = getPlayerForRendering(
          player,
          false,
          null,
          undefined,
          remotePlayerInterpolation,
          localPlayerId,
          swimmingPlayerScratchRef.current
        ) as SpacetimeDBPlayer;
        const lastPos = lastPositionsRef.current?.get(playerId);
        const moving = isPlayerMoving(lastPos, playerForRendering.positionX, playerForRendering.positionY);
        const { sx, sy } = getSpriteCoordinates(
          playerForRendering,
          moving,
          currentIdleAnimationFrame,
          false,
          TOTAL_SWIMMING_FRAMES,
          false,
          false,
          true,
          false,
          0
        );
        renderUnderwaterShadowIfOverWater(
          ctx,
          heroImg,
          playerForRendering.positionX,
          playerForRendering.positionY,
          sx,
          sy,
          waterTileLookup,
          seaTransitionTileLookup
        );
      }
    });
    // --- END UNDERWATER SHADOWS ---
    const _t1c = mark(showFpsProfiler);

    // --- RENDER PASS 4: Water overlay ---
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

    // --- RENDER PASS 5: Y-sorted entities and swimming player top halves ---
    // This ensures swimming player tops are properly Y-sorted with sea stacks and other tall entities

    // Render terrain footprints (snow/beach) ONCE as ground decals, before any Y-sorted entities.
    // Skip when local player is underwater (snorkeling) - surface footprints aren't visible from below.
    if (!isSnorkeling) {
      renderAllFootprints(ctx, viewBounds, now_ms);
    }

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
          allFences: visibleFences,
          buildingClusters,
          playerBuildingClusterId,
          connection,
          isLocalPlayerSnorkeling: isSnorkeling,
          alwaysShowPlayerNames,
          playerStats,
          largeQuarries,
          detectedHotSprings,
          detectedQuarries,
          placementInfo,
          caribouBreedingData,
          walrusBreedingData,
          chunkWeather,
          seaTransitionTileLookup,
        });
      }
    };

    // Helper to render swimming player top half (Phase 3c: entity has interpolated position when called)
    const renderSwimmingPlayerTopHalf = (item: { entity: SpacetimeDBPlayer; playerId: string; yPosition: number }) => {
      const player = item.entity;
      const playerId = item.playerId;

      const lastPos = lastPositionsRef.current?.get(playerId);
      const moving = isPlayerMoving(lastPos, player.positionX, player.positionY);

      let currentAnimFrame: number;
      if (player.isOnWater) {
        // Swimming: use idle frames for ALL swimming movement (matches bottom half - Phase 3c fix)
        currentAnimFrame = currentIdleAnimationFrame;
      } else {
        if (!moving) {
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
          moving,
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

    // --- RENDER PASS 6: Shadow overlays (tree canopy, sea stack) ---
    // These render AFTER all Y-sorted entities so shadows appear ON TOP of all entities under tree canopies.
    // The overlay uses tree-to-tree Y-sorted compositing to ensure shadows from trees behind
    // don't appear on tree canopies that are in front (higher Y = closer to camera).
    // Players walking under a tree (whether in front of or behind the trunk) will be in shade.
    // Skipped at night (no sunlight); respects treeShadowsEnabled setting.
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
      const tileSize = gameConfig.tileSize;
      const checkIsWaterTile = (worldX: number, worldY: number): boolean => {
        const tileX = Math.floor(worldX / tileSize);
        const tileY = Math.floor(worldY / tileSize);
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



    // Water overlay will be clipped to only appear over underwater zones

    // Wild animals are now rendered through the Y-sorted entities system for proper layering

    // Render particle systems
    if (ctx) {
      // This ensures they appear below sea stacks for proper depth layering

      renderParticles(ctx, campfireParticles);
      renderParticles(ctx, torchParticles);
      renderParticles(ctx, fireArrowParticles);
      renderParticles(ctx, furnaceParticles);
      renderParticles(ctx, barbecueParticles);
      renderParticles(ctx, firePatchParticles);
      renderWardParticles(ctx, wardParticles, 0, 0); // Custom renderer for proper flame/wisp shapes

      // Render cut grass effects
      renderCutGrassEffects(ctx, now_ms);

      // Render arrow break effects
      renderArrowBreakEffects(ctx, now_ms);

      // Render other players' fishing lines and bobbers
      if (typeof window !== 'undefined' && (window as any).renderOtherPlayersFishing) {
        (window as any).renderOtherPlayersFishing(ctx);
      }
    }

    renderInteractionLabels({
      ctx,
      harvestableResources: visibleHarvestableResourcesMap,
      campfires: visibleCampfiresMap,
      furnaces: visibleFurnacesMap,
      barbecues: visibleBarbecuesMap,
      fumaroles: fumaroles,
      droppedItems: visibleDroppedItemsMap,
      woodenStorageBoxes: visibleBoxesMap,
      playerCorpses: visiblePlayerCorpsesMap,
      stashes: stashes,
      sleepingBags: visibleSleepingBagsMap,
      players: players,
      itemDefinitions,
      closestInteractableTarget: rd.unifiedInteractableTarget as any,
      lanterns: visibleLanternsMap,
      turrets: visibleTurretsMap,
      rainCollectors: rainCollectors,
      brothPots: brothPots,
      homesteadHearths: visibleHomesteadHearthsMap,
      doors: visibleDoorsMap,
      alkStations: alkStations || EMPTY_MAP,
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
        turrets: turrets || EMPTY_MAP,
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
        viewMinX: viewBounds.minX,
        viewMaxX: viewBounds.maxX,
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
    renderParticles(ctx, resourceSparkleParticles);
    ctx.restore();
    // --- End Resource Sparkle Particles ---

    // --- Render Impact Particles (Blood/Ethereal hit effects) ---
    // Impact particles render at world level so they move with entities
    if (impactParticles.length > 0) {
      ctx.save();
      ctx.translate(currentCameraOffsetX, currentCameraOffsetY);
      renderParticles(ctx, impactParticles);
      ctx.restore();
    }
    // --- End Impact Particles ---

    // --- Render Structure Impact Particles (Sparks when walls/doors are hit) ---
    // Orange/yellow sparks when hostiles or players attack structures
    if (structureImpactParticles.length > 0) {
      ctx.save();
      ctx.translate(currentCameraOffsetX, currentCameraOffsetY);
      renderParticles(ctx, structureImpactParticles);
      ctx.restore();
    }
    // --- End Structure Impact Particles ---

    // --- Render Hostile Death Particles (Above Day/Night Overlay for visibility) ---
    // Hostile death particles (blue/purple sparks) render AFTER day/night overlay so they glow dramatically at night
    if (hostileDeathParticles.length > 0) {
      ctx.save();
      ctx.translate(currentCameraOffsetX, currentCameraOffsetY); // Re-apply camera translation for world-space particles
      renderParticles(ctx, hostileDeathParticles);
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
      let hasEntrainment = false;
      if (localPlayerId && activeConsumableEffects) {
        for (const effect of activeConsumableEffects.values()) {
          if (effect.playerId.toHexString() === localPlayerId && effect.effectType.tag === 'Entrainment') {
            hasEntrainment = true;
            break;
          }
        }
      }

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

    // --- RENDER PASS 7: Interaction indicators (hold-progress circles) ---
    renderInteractionIndicators({
      ctx,
      cameraOffsetX: currentCameraOffsetX,
      cameraOffsetY: currentCameraOffsetY,
      holdInteractionProgress: rd.holdInteractionProgress,
      isActivelyHolding: rd.isActivelyHolding,
      closestInteractableKnockedOutPlayerId: rd.closestInteractableKnockedOutPlayerId ?? null,
      closestInteractableWaterPosition: rd.closestInteractableWaterPosition,
      visibleCampfiresMap,
      visibleFurnacesMap,
      visibleBarbecuesMap,
      visibleLanternsMap,
      visibleBoxesMap,
      visibleDoorsMap,
      visibleHomesteadHearthsMap,
      stashes,
      players,
      emptyMap: EMPTY_MAP,
    });
    const _t4 = mark(showFpsProfiler);

    // --- RENDER PASS 8: Structure lights ---
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    renderAllStructureLights({
      ctx,
      cameraOffsetX: currentCameraOffsetX,
      cameraOffsetY: currentCameraOffsetY,
      buildingClusters,
      visibleCampfiresMap,
      visibleLanternsMap,
      visibleFurnacesMap,
      visibleBarbecuesMap,
    });

    // Village Campfire Lights - Hunting only (fv_campfire doodad, cozy effect)
    // Fishing village campfire has no light/cozy effects per user request
    if (monumentParts && monumentParts.size > 0) {
      monumentParts.forEach((part: any) => {
        const isHuntingVillageCampfire = part.monumentType?.tag === 'HuntingVillage' && part.partType === 'campfire';
        if (isHuntingVillageCampfire) {
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
        viewBounds.minX,
        viewBounds.maxX,
        viewBounds.minY,
        viewBounds.maxY,
        now_ms
      );

      // Compound Eerie Lights - Nanobot-style blue/purple ambient glow (replaces street lamps)
      renderCompoundEerieLights(
        ctx,
        currentCycleProgress,
        currentCameraOffsetX,
        currentCameraOffsetY,
        viewBounds.minX,
        viewBounds.maxX,
        viewBounds.minY,
        viewBounds.maxY,
        now_ms
      );

      if (showShipwreckDebug) {
        renderAllShipwreckDebugZones(
          ctx,
          shipwreckPartsMap,
          currentCameraOffsetX,
          currentCameraOffsetY,
          viewBounds.minX,
          viewBounds.maxX,
          viewBounds.minY,
          viewBounds.maxY
        );
      }
    }

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
    if (ENABLE_LAG_DIAGNOSTICS) {
      perfProfilingRef.current.totalFrameTime += frameTime;
    }

    // === FPS Profiler Overlay (delegated to FpsProfiler module) ===
    if (showFpsProfiler) {
      const timings = { t0: _t0, t1: _t1, t1a: _t1a, t1b: _t1b, t1c: _t1c, t2: _t2, t3: _t3, t3a: _t3a, t4: _t4, t5: _t5 };
      const profiler = fpsProfilerRef.current;
      profiler.update(timings, frameTime, currentYSortedEntities.length);
      profiler.recordIfActive(timings, frameTime, currentYSortedEntities.length);
      profiler.render(ctx, currentCanvasWidth, isProfilerRecording ?? false);
    }
    if (ENABLE_LAG_DIAGNOSTICS) {
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
    }

    // === LAG DIAGNOSTICS ===
    if (ENABLE_LAG_DIAGNOSTICS && Date.now() - perfProfilingRef.current.lastLogTime > LAG_DIAGNOSTIC_INTERVAL_MS) {
      const p = perfProfilingRef.current;
      logLagDiagnostic(p, {
        players: players.size,
        trees: trees?.size || 0,
        stones: stones?.size || 0,
        ySorted: currentYSortedEntities.length,
        campfires: visibleCampfiresMap.size,
        boxes: visibleBoxesMap.size,
        resources: visibleHarvestableResourcesMap.size,
        items: visibleDroppedItemsMap.size,
        grass: visibleGrassMap?.size || 0,
        seaStacks: visibleSeaStacksMap.size,
      });
      perfProfilingRef.current = {
        lastLogTime: Date.now(),
        frameCount: 0,
        totalFrameTime: 0,
        maxFrameTime: 0,
        slowFrames: 0,
        verySlowFrames: 0,
        lastServerUpdateTime: p.lastServerUpdateTime,
        serverUpdateCount: 0,
        maxServerLatency: 0,
        totalServerLatency: 0,
        renderCallCount: 0,
      };
    }

    // Performance monitoring - check frame time at end
    checkPerformance(frameStartTime);

    // Minimap now rendered as React component overlay, not on game canvas

  }, [checkPerformance,
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
    shelterImageRef,
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
            logDebug('Respawn Randomly Clicked');
            connection?.reducers?.respawnRandomly();
          }}
          onRespawnAtBag={(bagId) => {
            logDebug('Respawn At Bag Clicked:', bagId);
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
          minimapCache={minimapCache}
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
              logDebug('[UpgradeRadialMenu] Upgrading foundation', upgradeMenuFoundationRef.current.id, 'to tier', tier);
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
              logDebug('[UpgradeRadialMenu] Destroying foundation', upgradeMenuFoundationRef.current.id);
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
              logDebug('[UpgradeRadialMenu] Upgrading wall', upgradeMenuWallRef.current.id, 'to tier', tier);
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
              logDebug('[UpgradeRadialMenu] Destroying wall', upgradeMenuWallRef.current.id);
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
              logDebug('[UpgradeRadialMenu] Upgrading fence', upgradeMenuFenceRef.current.id, 'to tier', tier);
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
              logDebug('[UpgradeRadialMenu] Destroying fence', upgradeMenuFenceRef.current.id);
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