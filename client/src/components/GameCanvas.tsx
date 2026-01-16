import React, { useEffect, useRef, useCallback, useState, useMemo } from 'react';
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
  AlkStation as SpacetimeDBAlkStation, // ADDED: ALK delivery stations
  AlkContract as SpacetimeDBAlkContract, // ADDED: ALK contracts
  AlkPlayerContract as SpacetimeDBAlkPlayerContract, // ADDED: ALK player contracts
  AlkState as SpacetimeDBAlkState, // ADDED: ALK state
  PlayerShardBalance as SpacetimeDBPlayerShardBalance, // ADDED: Player shard balances
  MemoryGridProgress as SpacetimeDBMemoryGridProgress, // ADDED: Memory Grid progress
} from '../generated';

// --- Core Hooks ---
import { useWalkingAnimationCycle, useSprintAnimationCycle, useIdleAnimationCycle, walkingAnimationFrameRef, sprintAnimationFrameRef, idleAnimationFrameRef } from '../hooks/useAnimationCycle';
import { useAssetLoader } from '../hooks/useAssetLoader';
import { useGameViewport } from '../hooks/useGameViewport';
import { useMousePosition } from '../hooks/useMousePosition';
import { useDayNightCycle } from '../hooks/useDayNightCycle';
import { useInteractionFinder } from '../hooks/useInteractionFinder';
import { useGameLoop } from '../hooks/useGameLoop';
import type { FrameInfo } from '../hooks/useGameLoop';
import { usePlayerHover } from '../hooks/usePlayerHover';
import { usePlantedSeedHover } from '../hooks/usePlantedSeedHover';
import { useRuneStoneHover } from '../hooks/useRuneStoneHover';
import { useMinimapInteraction } from '../hooks/useMinimapInteraction';
import { useEntityFiltering, YSortedEntityType } from '../hooks/useEntityFiltering';
import { useSpacetimeTables } from '../hooks/useSpacetimeTables';
import { useCampfireParticles, Particle } from '../hooks/useCampfireParticles';
import { useTorchParticles } from '../hooks/useTorchParticles';
import { useResourceSparkleParticles } from '../hooks/useResourceSparkleParticles';
import { useHostileDeathEffects } from '../hooks/useHostileDeathEffects';
import { useImpactParticles } from '../hooks/useImpactParticles';
import { useStructureImpactParticles } from '../hooks/useStructureImpactParticles';
import { useCloudInterpolation, InterpolatedCloudData } from '../hooks/useCloudInterpolation';
import { useGrassInterpolation, InterpolatedGrassData } from '../hooks/useGrassInterpolation';
import { useArrowBreakEffects } from '../hooks/useArrowBreakEffects';
// Thunder effects removed - system disabled for now
import { useChunkBasedRainSounds } from '../hooks/useChunkBasedRainSounds';
import { useFireArrowParticles } from '../hooks/useFireArrowParticles';
import { useFirePatchParticles } from '../hooks/useFirePatchParticles';
import { useWorldTileCache } from '../hooks/useWorldTileCache';
import { useAmbientSounds } from '../hooks/useAmbientSounds';
import { useFurnaceParticles } from '../hooks/useFurnaceParticles';
import { useBarbecueParticles } from '../hooks/useBarbecueParticles';
import { useShoreWaveParticles, renderShoreWaves } from '../hooks/useShoreWaveParticles';
import { playImmediateSound } from '../hooks/useSoundSystem';
import { useDamageEffects } from '../hooks/useDamageEffects';

// --- Rendering Utilities ---
import { renderWorldBackground } from '../utils/renderers/worldRenderingUtils';
import { renderCyberpunkGridBackground } from '../utils/renderers/cyberpunkGridBackground';
import { getCollisionShapesForDebug, CollisionShape, PLAYER_RADIUS as CLIENT_PLAYER_RADIUS, COLLISION_OFFSETS } from '../utils/clientCollision'; // ADDED: Collision debug rendering
import { renderAttackRangeDebug } from '../utils/renderers/attackRangeDebugUtils'; // Attack range debug visualization
import { renderChunkBoundaries, renderInteriorDebug, renderCollisionDebug, renderYSortDebug } from '../utils/renderers/debugOverlayUtils'; // Consolidated debug overlays
import { renderMobileTapAnimation } from '../utils/renderers/mobileRenderingUtils'; // Mobile-specific rendering
import { renderYSortedEntities } from '../utils/renderers/renderingUtils.ts';
import { preloadMonumentImages } from '../utils/renderers/monumentRenderingUtils';
import { renderFoundationTargetIndicator, renderWallTargetIndicator } from '../utils/renderers/foundationRenderingUtils'; // ADDED: Foundation and wall target indicators
import { renderInteractionLabels } from '../utils/renderers/labelRenderingUtils.ts';
import { renderPlacementPreview, isPlacementTooFar } from '../utils/renderers/placementRenderingUtils.ts';
import { detectHotSprings } from '../utils/hotSpringDetector'; // ADDED: Hot spring detection
import { renderHotSprings } from '../utils/renderers/hotSpringRenderingUtils'; // ADDED: Hot spring rendering
import { useBuildingManager, BuildingMode, BuildingTier, FoundationShape } from '../hooks/useBuildingManager'; // ADDED: Building manager
import { BuildingRadialMenu } from './BuildingRadialMenu'; // ADDED: Building radial menu
import { UpgradeRadialMenu } from './UpgradeRadialMenu'; // ADDED: Upgrade radial menu
import { useFoundationTargeting } from '../hooks/useFoundationTargeting'; // ADDED: Foundation targeting
import { useWallTargeting } from '../hooks/useWallTargeting'; // ADDED: Wall targeting
import { drawInteractionIndicator } from '../utils/interactionIndicator';
import { ENTITY_VISUAL_CONFIG, getIndicatorPosition } from '../utils/entityVisualConfig';
import { drawMinimapOntoCanvas } from './Minimap';
import { renderCampfire } from '../utils/renderers/campfireRenderingUtils';
import { renderBarbecue } from '../utils/renderers/barbecueRenderingUtils'; // ADDED: Barbecue renderer import
import { renderPlayerCorpse } from '../utils/renderers/playerCorpseRenderingUtils';
import { renderStash } from '../utils/renderers/stashRenderingUtils';
import { renderCampfireLight, renderLanternLight, renderFurnaceLight, renderBarbecueLight, renderAllPlayerLights, renderFishingVillageCampfireLight, renderSovaAura } from '../utils/renderers/lightRenderingUtils';
import { renderRuneStoneNightLight } from '../utils/renderers/runeStoneRenderingUtils';
import { renderAllShipwreckNightLights, renderAllShipwreckDebugZones } from '../utils/renderers/shipwreckRenderingUtils';
import { preloadCairnImages } from '../utils/renderers/cairnRenderingUtils';
import { renderTree } from '../utils/renderers/treeRenderingUtils';
import { renderTillerPreview } from '../utils/renderers/tillerPreviewRenderingUtils';
import { renderCloudsDirectly } from '../utils/renderers/cloudRenderingUtils';
import { useFallingTreeAnimations } from '../hooks/useFallingTreeAnimations';
import { renderProjectile } from '../utils/renderers/projectileRenderingUtils';
import { renderShelter } from '../utils/renderers/shelterRenderingUtils';
import { setShelterClippingData } from '../utils/renderers/shadowUtils';
import { renderRain } from '../utils/renderers/rainRenderingUtils';
import { renderCombinedHealthOverlays } from '../utils/renderers/healthOverlayUtils';
import { renderBrothEffectsOverlays } from '../utils/renderers/brothEffectsOverlayUtils';
import { renderInsanityOverlay } from '../utils/renderers/insanityOverlayUtils';
import { renderWeatherOverlay } from '../utils/renderers/weatherOverlayUtils';
import { calculateChunkIndex } from '../utils/chunkUtils';
import { renderWaterOverlay } from '../utils/renderers/waterOverlayUtils';
import { renderPlayer, isPlayerHovered, getSpriteCoordinates } from '../utils/renderers/playerRenderingUtils';
import { renderSeaStackSingle, renderSeaStackShadowOnly, renderSeaStackBottomOnly, renderSeaStackWaterEffectsOnly, renderSeaStackWaterLineOnly, renderSeaStackUnderwaterSilhouette } from '../utils/renderers/seaStackRenderingUtils';
import { renderBarrelUnderwaterSilhouette } from '../utils/renderers/barrelRenderingUtils';
import { renderWaterPatches } from '../utils/renderers/waterPatchRenderingUtils';
import { renderFertilizerPatches } from '../utils/renderers/fertilizerPatchRenderingUtils';
import { renderFirePatches } from '../utils/renderers/firePatchRenderingUtils';
import { renderPlacedExplosives, preloadExplosiveImages } from '../utils/renderers/explosiveRenderingUtils';
import { drawUnderwaterShadowOnly } from '../utils/renderers/swimmingEffectsUtils';
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
import { itemIcons } from '../utils/itemIconUtils';
import { PlacementItemInfo, PlacementActions } from '../hooks/usePlacementManager';
import { gameConfig, HOLD_INTERACTION_DURATION_MS, REVIVE_HOLD_DURATION_MS } from '../config/gameConfig';
import {
  CAMPFIRE_HEIGHT,
  SERVER_CAMPFIRE_DAMAGE_RADIUS,
  SERVER_CAMPFIRE_DAMAGE_CENTER_Y_OFFSET
} from '../utils/renderers/campfireRenderingUtils';
// V2 system removed due to performance issues
import { BOX_HEIGHT } from '../utils/renderers/woodenStorageBoxRenderingUtils';
import { useInputHandler } from '../hooks/useInputHandler';
import { useRemotePlayerInterpolation } from '../hooks/useRemotePlayerInterpolation';


// Define a placeholder height for Stash for indicator rendering
const STASH_HEIGHT = 40; // Adjust as needed to match stash sprite or desired indicator position

// Import cut grass effect renderer
import { renderCutGrassEffects } from '../effects/cutGrassEffect';
import { renderArrowBreakEffects } from '../effects/arrowBreakEffect';

// --- Prop Interface ---
interface GameCanvasProps {
  players: Map<string, SpacetimeDBPlayer>;
  trees: Map<string, SpacetimeDBTree>;
  clouds: Map<string, SpacetimeDBCloud>;
  stones: Map<string, SpacetimeDBStone>;
  runeStones: Map<string, SpacetimeDBRuneStone>;
  cairns: Map<string, SpacetimeDBCairn>;
  playerDiscoveredCairns: Map<string, SpacetimeDBPlayerDiscoveredCairn>;
  campfires: Map<string, SpacetimeDBCampfire>;
  furnaces: Map<string, SpacetimeDBFurnace>; // ADDED: Furnaces prop
  barbecues: Map<string, SpacetimeDBBarbecue>; // ADDED: Barbecues prop
  lanterns: Map<string, SpacetimeDBLantern>;
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
  placementInfo: PlacementItemInfo | null;
  placementActions: PlacementActions;
  placementError: string | null;
  onSetInteractingWith: (target: { type: string; id: number | bigint } | null) => void;
  isMinimapOpen: boolean;
  setIsMinimapOpen: React.Dispatch<React.SetStateAction<boolean>>;
  // Initial view for InterfaceContainer (e.g., 'matronage' after creating one)
  interfaceInitialView?: 'minimap' | 'encyclopedia' | 'memory-grid' | 'alk' | 'cairns' | 'matronage' | 'leaderboard' | 'achievements';
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
  minimapCache: any; // Add this for minimapCache
  isGameMenuOpen: boolean; // Add this prop
  onAutoActionStatesChange?: (isAutoAttacking: boolean) => void;
  isFishing: boolean;
  plantedSeeds: Map<string, SpacetimeDBPlantedSeed>;
  playerDrinkingCooldowns: Map<string, SpacetimeDBPlayerDrinkingCooldown>; // Add player drinking cooldowns
  wildAnimals: Map<string, SpacetimeDBWildAnimal>; // Includes hostile NPCs with is_hostile_npc = true
  hostileDeathEvents: Array<{id: string, x: number, y: number, species: string, timestamp: number}>; // Client-side death events for particles
  animalCorpses: Map<string, SpacetimeDBAnimalCorpse>;
  barrels: Map<string, SpacetimeDBBarrel>; // Add barrels
  fumaroles: Map<string, SpacetimeDBFumarole>; // ADDED: Fumaroles
  basaltColumns: Map<string, SpacetimeDBBasaltColumn>; // ADDED: Basalt columns
  livingCorals: Map<string, any>; // Living coral for underwater harvesting (uses combat system)
  seaStacks: Map<string, any>; // Add sea stacks
  homesteadHearths: Map<string, SpacetimeDBHomesteadHearth>; // ADDED: HomesteadHearths
  foundationCells: Map<string, any>; // ADDED: Building foundations
  wallCells: Map<string, any>; // ADDED: Building walls
  doors: Map<string, any>; // ADDED: Building doors
  setMusicPanelVisible: React.Dispatch<React.SetStateAction<boolean>>;
  // Add ambient sound volume control
  environmentalVolume?: number; // 0-1 scale for ambient/environmental sounds
  movementDirection: { x: number; y: number };
  isAutoWalking: boolean; // Auto-walk state for dodge roll detection
  playerDodgeRollStates: Map<string, any>; // PlayerDodgeRollState from generated types
  // ADD: Local facing direction for instant visual feedback (client-authoritative)
  localFacingDirection?: string;
  // NEW: Visual cortex module setting for tree shadows
  treeShadowsEnabled?: boolean;
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
  // Shipwreck monument parts (dynamically placed during world generation)
  shipwreckParts?: Map<string, any>;
  // Fishing village monument parts (dynamically placed during world generation)
  fishingVillageParts?: Map<string, any>;
  // Large quarry locations with types for minimap labels (Stone/Sulfur/Metal Quarry)
  largeQuarries?: Map<string, any>;
  // Weather overlay toggle for main game canvas atmospheric effects
  showWeatherOverlay?: boolean;
  // Status overlays toggle for cold/low health screen effects
  showStatusOverlays?: boolean;

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
  
  // Always show player names above heads
  alwaysShowPlayerNames?: boolean;
  
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
}

/**
 * GameCanvas Component
 *
 * The main component responsible for rendering the game world, entities, UI elements,
 * and handling the game loop orchestration. It integrates various custom hooks
 * to manage specific aspects like input, viewport, assets, day/night cycle, etc.
 */
const GameCanvas: React.FC<GameCanvasProps> = ({
  players,
  trees,
  clouds,
  stones,
  runeStones,
  cairns,
  playerDiscoveredCairns,
  campfires,
  furnaces, // ADDED: Furnaces destructuring
  barbecues, // ADDED: Barbecues destructuring
  lanterns,
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
  onSetInteractingWith,
  isMinimapOpen,
  setIsMinimapOpen,
  interfaceInitialView,
  onInterfaceClose,
  isChatting,
  messages,
  isSearchingCraftRecipes,
  onSearchFocusChange,
  showInventory,
  grass,
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
  fumaroles, // ADDED: Fumaroles destructuring
  basaltColumns, // ADDED: Basalt columns destructuring
  livingCorals, // Living coral for underwater harvesting (uses combat system)
  seaStacks,
  homesteadHearths, // ADDED: HomesteadHearths destructuring
  foundationCells, // ADDED: Building foundations
  wallCells, // ADDED: Building walls
  doors, // ADDED: Building doors
  setMusicPanelVisible,
  environmentalVolume,
  movementDirection,
  isAutoWalking, // Auto-walk state for dodge roll detection
  addSOVAMessage, // ADDED: SOVA message adder for cairn lore
  showSovaSoundBox, // ADDED: SOVA sound box for cairn lore audio with waveform
  onCairnNotification, // ADDED: Cairn unlock notification callback
  playerDodgeRollStates,
  localFacingDirection, // ADD: Destructure local facing direction for client-authoritative direction changes
  treeShadowsEnabled, // NEW: Destructure treeShadowsEnabled for visual cortex module setting
  chunkWeather, // Chunk-based weather data
  alkStations, // ALK delivery stations for minimap
  shipwreckParts, // Shipwreck monument parts
  fishingVillageParts, // Fishing village monument parts
  largeQuarries, // Large quarry locations with types for minimap labels
  alkContracts, // ALK contracts for provisioning board
  alkPlayerContracts, // Player's accepted ALK contracts
  alkState, // ALK system state
  playerShardBalance, // Player shard balances
  memoryGridProgress, // Memory Grid progress for crafting unlocks
  showWeatherOverlay, // Weather overlay toggle for main game canvas atmospheric effects (managed internally if not provided)
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
  alwaysShowPlayerNames = true, // Always show player names above heads
  playerStats, // Player stats for title display on name labels
  rangedWeaponStats, // Ranged weapon stats for auto-fire detection
  showStatusOverlays = true, // Status overlays toggle for cold/low health screen effects
  // Mobile controls
  isMobile = false,
  onMobileTap,
  tapAnimation,
  onMobileInteractInfoChange,
  mobileInteractTrigger,
}) => {
  // console.log('[GameCanvas IS RUNNING] showInventory:', showInventory);

  // console.log("Cloud data in GameCanvas:", Array.from(clouds?.values() || []));

  // --- Refs ---
  const frameNumber = useRef(0);
  const lastPositionsRef = useRef<Map<string, { x: number, y: number }>>(new Map());
  const placementActionsRef = useRef(placementActions);
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

  // Particle system refs
  const campfireParticlesRef = useRef<Particle[]>([]);
  const torchParticlesRef = useRef<Particle[]>([]);

  // High-frequency value refs (to avoid renderGame dependency array churn)
  // NOTE: Animation frame refs are now imported directly from useAnimationCycle.ts
  // walkingAnimationFrameRef, sprintAnimationFrameRef, idleAnimationFrameRef are module-level exports
  const worldMousePosRef = useRef<{ x: number | null; y: number | null }>({ x: 0, y: 0 });
  const cameraOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const predictedPositionRef = useRef<{ x: number; y: number } | null>(null);
  const interpolatedCloudsRef = useRef<Map<string, any>>(new Map());
  const cycleProgressRef = useRef<number>(0.375);
  const ySortedEntitiesRef = useRef<any[]>([]);

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
  const { 
    shakeOffsetX, 
    shakeOffsetY, 
    vignetteOpacity, 
    isLowHealth, 
    isCriticalHealth,
    heartbeatPulse 
  } = useDamageEffects(localPlayer, 100); // 100 = max health
  
  // Apply screen shake to camera offset
  const cameraOffsetX = baseCameraOffsetX + shakeOffsetX;
  const cameraOffsetY = baseCameraOffsetY + shakeOffsetY;
  // console.log('[GameCanvas DEBUG] Camera offsets:', cameraOffsetX, cameraOffsetY, 'canvas size:', canvasSize);
  
  const { heroImageRef, heroSprintImageRef, heroIdleImageRef, heroWaterImageRef, heroCrouchImageRef, heroDodgeImageRef, itemImagesRef, cloudImagesRef, shelterImageRef } = useAssetLoader();
  const doodadImagesRef = useRef<Map<string, HTMLImageElement>>(new Map());
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

  // Add a state to track when images are loaded to trigger re-renders
  const [imageLoadTrigger, setImageLoadTrigger] = useState(0);

  // Effect to trigger re-render when images are loaded
  useEffect(() => {
    const checkImages = () => {
      if (itemImagesRef.current && itemImagesRef.current.size > 0) {
        setImageLoadTrigger(prev => prev + 1);
      }
    };

    // Check immediately
    checkImages();

    // Set up an interval to check periodically (will be cleaned up when images are loaded)
    const interval = setInterval(checkImages, 100);

    // Clean up interval when we have images
    if (itemImagesRef.current && itemImagesRef.current.size > 0) {
      clearInterval(interval);
    }

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
  const interpolatedGrass = useGrassInterpolation({ serverGrass: grass, deltaTime: deltaTimeRef.current });

  // PERFORMANCE FIX: Chunk cache refs moved here (before useEntityFiltering) to enable memoized worldChunkDataMap
  // This avoids creating a new Map on every render, reducing GC pressure
  const chunkCacheRef = useRef<Map<string, SpacetimeDBWorldChunkData>>(new Map());
  const chunkSizeRef = useRef<number>(8);
  const [chunkCacheVersion, setChunkCacheVersion] = useState(0);
  
  // PERFORMANCE FIX: Memoize worldChunkData Map to avoid creating new Map on every render
  // This was previously created inline in useEntityFiltering and TillerPreview, causing GC pressure
  // The map only recalculates when chunkCacheVersion changes (on insert/update/delete)
  const worldChunkDataMap = useMemo(() => {
    // Use the cached data from chunkCacheRef which is updated by the subscription callbacks
    if (chunkCacheRef.current.size === 0) return undefined;
    // Return a copy of the cached Map (chunkCacheRef is already keyed by "chunkX,chunkY")
    return new Map(chunkCacheRef.current);
  }, [chunkCacheVersion]); // eslint-disable-line react-hooks/exhaustive-deps

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
    visibleFumaroles, // ADDED: Fumaroles
    visibleFumerolesMap, // ADDED: Fumaroles map
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
    fumaroles, // ADDED: Fumaroles
    basaltColumns, // ADDED: Basalt columns
    seaStacks,
    foundationCells, // ADDED: Building foundations
    wallCells, // ADDED: Building walls
    doors, // ADDED: Building doors
    localPlayerId, // ADDED: Local player ID for building visibility
    isTreeFalling, // NEW: Pass falling tree checker so falling trees stay visible
    worldChunkDataMap, // PERFORMANCE FIX: Use memoized Map instead of creating new one every render
    alkStations, // ADDED: ALK delivery stations
    shipwreckParts, // ADDED: Shipwreck monument parts for rendering and interaction
    fishingVillageParts, // ADDED: Fishing village monument parts for rendering
    livingCorals, // Living coral for underwater harvesting (uses combat system)
  );

  // --- Day/Night Cycle with Indoor Light Containment ---
  // Must be after useEntityFiltering since it uses buildingClusters
  const { overlayRgba, maskCanvasRef } = useDayNightCycle({
    worldState,
    campfires,
    lanterns,
    furnaces, // Add furnaces for darkness cutouts
    barbecues, // ADDED: Barbecues for night light cutouts
    runeStones, // ADDED: RuneStones for night light cutouts
    firePatches, // ADDED: Fire patches for night light cutouts
    fumaroles, // ADDED: Fumaroles for heat glow at night
    fishingVillageParts: fishingVillageParts ?? new Map(), // ADDED: Fishing village campfire light
    players, // Pass all players
    activeEquipments, // Pass all active equipments
    itemDefinitions, // Pass all item definitions
    cameraOffsetX,
    cameraOffsetY,
    canvasSize,
    // Add interpolation parameters for smooth torch light cutouts
    localPlayerId,
    predictedPosition,
    remotePlayerInterpolation,
    // Indoor light containment - clip light cutouts to building interiors
    buildingClusters,
    // Mouse position for local player's flashlight aiming (smooth 360° tracking)
    worldMouseX: worldMousePos.x,
    worldMouseY: worldMousePos.y,
  });

  // Sync ySortedEntities to ref (reduces renderGame dependency array churn)
  useEffect(() => { ySortedEntitiesRef.current = ySortedEntities; }, [ySortedEntities]);

  // --- UI State ---
  const { hoveredPlayerIds, handlePlayerHover } = usePlayerHover();
  
  // --- Planted Seed Hover Detection ---
  const { hoveredSeed, hoveredSeedId } = usePlantedSeedHover(
    plantedSeeds,
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

  // Subscribe once to all compressed chunks (small row count, stable; avoids spatial churn)
  // NOTE: chunkCacheRef, chunkSizeRef, chunkCacheVersion are now declared earlier (before useEntityFiltering)
  useEffect(() => {
    if (!connection) return;

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
      try { handle?.unsubscribe?.(); } catch {}
    };
  }, [connection]);

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

  // Detect hot springs from world chunk data
  const detectedHotSprings = useMemo(() => {
    return detectHotSprings(chunkCacheRef.current);
  }, [chunkCacheVersion]); // Recalculate when chunk data changes

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

    for (let ty = minTileY; ty < maxTileY; ty++) {
      for (let tx = minTileX; tx < maxTileX; tx++) {
        const cx = Math.floor(tx / chunkSize);
        const cy = Math.floor(ty / chunkSize);
        const chunk = chunkCacheRef.current.get(`${cx},${cy}`);
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
  }, [bufferedViewTileX, bufferedViewTileY, canvasSize.width, canvasSize.height, chunkCacheVersion]);

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
  } = useInteractionFinder({
    localPlayer,
    campfires,
    furnaces, // ADDED: Furnaces to useInteractionFinder
    barbecues, // ADDED: Barbecues to useInteractionFinder
    fumaroles, // ADDED: Fumaroles to useInteractionFinder (volcanic heat source)
    lanterns,
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
    // Essential entity maps for validation and data lookup
    woodenStorageBoxes,
    stashes,
    players,
    cairns, // ADDED: Cairns for lore lookup
    playerDiscoveredCairns, // ADDED: Player discovery tracking
    playerCorpses, // ADDED: Player corpses for protection check
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
    rangedWeaponStats, // ADDED: Pass ranged weapon stats for auto-fire detection
    // Individual entity IDs for consistency and backward compatibility
  });

  // --- Mobile Interaction Support ---
  // Helper to get human-readable label for interaction targets
  const getInteractableLabel = useCallback((target: any): string => {
    if (!target) return '';
    switch (target.type) {
      case 'harvestable_resource': return 'PLANT';
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
    if (unifiedInteractableTarget && connection?.reducers) {
      const target = unifiedInteractableTarget;
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
        case 'campfire':
          onSetInteractingWith({ type: 'campfire', id: target.id as number });
          break;
        case 'furnace':
          onSetInteractingWith({ type: 'furnace', id: target.id as number });
          break;
        case 'lantern':
          onSetInteractingWith({ type: 'lantern', id: target.id as number });
          break;
        case 'box':
          onSetInteractingWith({ type: 'wooden_storage_box', id: target.id as bigint });
          break;
        case 'stash':
          onSetInteractingWith({ type: 'stash', id: target.id as bigint });
          break;
        case 'corpse':
          onSetInteractingWith({ type: 'player_corpse', id: target.id as bigint });
          break;
        case 'sleeping_bag':
          onSetInteractingWith({ type: 'sleeping_bag', id: target.id as bigint });
          break;
        case 'rain_collector':
          onSetInteractingWith({ type: 'rain_collector', id: target.id as bigint });
          break;
        case 'homestead_hearth':
          onSetInteractingWith({ type: 'homestead_hearth', id: target.id as bigint });
          break;
        case 'fumarole':
          onSetInteractingWith({ type: 'fumarole', id: target.id as number });
          break;
        case 'broth_pot':
          onSetInteractingWith({ type: 'broth_pot', id: target.id as bigint });
          break;
        case 'alk_station':
          onSetInteractingWith({ type: 'alk_station', id: target.id as bigint });
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
  }, [mobileInteractTrigger, isMobile, unifiedInteractableTarget, connection, onSetInteractingWith]);

  // Store the foundation/wall when upgrade menu opens (prevents flickering)
  const upgradeMenuFoundationRef = useRef<FoundationCell | null>(null);
  const upgradeMenuWallRef = useRef<any | null>(null); // WallCell type
  const prevShowUpgradeRadialMenuRef = useRef(false);
  
  // Update stored foundation/wall when menu opens (only when menu state changes from false to true)
  useEffect(() => {
    const wasOpen = prevShowUpgradeRadialMenuRef.current;
    const isOpen = showUpgradeRadialMenu;
    
    if (!wasOpen && isOpen) {
      // Menu just opened - store the foundation or wall
      if (targetedWall) {
        upgradeMenuWallRef.current = targetedWall;
        upgradeMenuFoundationRef.current = null;
      } else if (targetedFoundation) {
        upgradeMenuFoundationRef.current = targetedFoundation;
        upgradeMenuWallRef.current = null;
      }
    } else if (!isOpen) {
      // Menu closed - clear the stored foundation/wall
      upgradeMenuFoundationRef.current = null;
      upgradeMenuWallRef.current = null;
    }
    
    prevShowUpgradeRadialMenuRef.current = isOpen;
  }, [showUpgradeRadialMenu, targetedFoundation, targetedWall]);

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
        
        // Check for brew cooldown error - play SOVA voice feedback instead of showing error
        if (errorMsg === 'BREW_COOLDOWN') {
          console.log(`[GameCanvas] 🍲 Brew cooldown active - playing SOVA feedback`);
          
          // Play random SOVA brew cooldown voice line
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
        } else {
          console.error(`[GameCanvas] ❌ consumeItem failed for instance ${itemInstanceId.toString()}:`, errorMsg);
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
  }, [connection]);

  // Register error handlers for applyFertilizer reducer
  useEffect(() => {
    if (!connection) return;

    const handleApplyFertilizerResult = (ctx: any, fertilizerInstanceId: bigint) => {
      console.log(`[GameCanvas] applyFertilizer reducer callback triggered for instance ${fertilizerInstanceId.toString()}`);
      console.log(`[GameCanvas] Event status:`, ctx.event?.status);
      
      if (ctx.event?.status?.tag === 'Failed') {
        const errorMsg = ctx.event.status.value || 'Unknown error';
        console.error(`[GameCanvas] ❌ applyFertilizer failed for instance ${fertilizerInstanceId.toString()}:`, errorMsg);
        // TODO: Show error message to player (toast notification or similar)
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
  }, [connection]);

  // Register error handlers for destroy reducers
  useEffect(() => {
    if (!connection) return;

    const handleDestroyFoundationResult = (ctx: any, foundationId: bigint) => {
      console.log('[GameCanvas] destroyFoundation reducer result:', ctx.event?.status);
      if (ctx.event?.status?.tag === 'Failed') {
        const errorMsg = ctx.event.status.value || 'Failed to destroy foundation';
        console.error('[GameCanvas] destroyFoundation failed:', errorMsg);
        console.log('[GameCanvas] Failed destruction details:', { foundationId, errorMsg });
        // TODO: Show error message to user (e.g., toast notification)
      } else if (ctx.event?.status?.tag === 'Committed') {
        console.log('[GameCanvas] destroyFoundation succeeded! Foundation', foundationId, 'destroyed');
      }
    };

    const handleDestroyWallResult = (ctx: any, wallId: bigint) => {
      console.log('[GameCanvas] destroyWall reducer result:', ctx.event?.status);
      if (ctx.event?.status?.tag === 'Failed') {
        const errorMsg = ctx.event.status.value || 'Failed to destroy wall';
        console.error('[GameCanvas] destroyWall failed:', errorMsg);
        console.log('[GameCanvas] Failed destruction details:', { wallId, errorMsg });
        // TODO: Show error message to user (e.g., toast notification)
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
          console.log('[LoadRangedWeapon] Playing error sound for no arrows');
          playImmediateSound('error_arrows', 1.0);
        }
      }
    };

    const handleUpgradeFoundationResult = (ctx: any, foundationId: bigint, newTier: number) => {
      if (ctx.event?.status?.tag === 'Failed') {
        const errorMsg = ctx.event.status.value || '';
        // Check if error is about building privilege
        if (errorMsg.includes('Building privilege') || errorMsg.includes('building privilege')) {
          // Play building privilege error sound for instant feedback
          playImmediateSound('error_building_privilege', 1.0);
        }
        // Check if error is about tier upgrade (cannot downgrade or already at tier)
        else if (errorMsg.includes('Cannot downgrade') || 
                 errorMsg.includes('Current tier') || 
                 errorMsg.includes('Target tier')) {
          // Play tier upgrade error sound for instant feedback
          playImmediateSound('error_tier_upgrade', 1.0);
        }
        // Check if error is about insufficient resources
        else if (errorMsg.includes('Not enough') || 
            errorMsg.includes('wood') || 
            errorMsg.includes('stone') ||
            errorMsg.includes('metal fragments') ||
            errorMsg.includes('Required:')) {
          // Play error sound for instant feedback
          playImmediateSound('error_resources', 1.0);
        }
      }
    };

    // Generic placement error handler for all placeable items (campfire, furnace, lantern, etc.)
    const handlePlacementError = (ctx: any, itemName: string) => {
      if (ctx.event?.status?.tag === 'Failed') {
        const errorMsg = ctx.event.status.value || '';
        console.log(`[GameCanvas] ${itemName} placement failed:`, errorMsg);
        // Play error sound for invalid placement (water, too far, etc.)
        playImmediateSound('error_placement_failed', 1.0);
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

    connection.reducers.onDestroyFoundation(handleDestroyFoundationResult);
    connection.reducers.onDestroyWall(handleDestroyWallResult);
    connection.reducers.onFireProjectile(handleFireProjectileResult);
    connection.reducers.onLoadRangedWeapon(handleLoadRangedWeaponResult);
    connection.reducers.onUpgradeFoundation(handleUpgradeFoundationResult);
    
    // Register placement error handlers
    connection.reducers.onPlaceCampfire(handlePlaceCampfireResult);
    connection.reducers.onPlaceFurnace(handlePlaceFurnaceResult);
    connection.reducers.onPlaceLantern(handlePlaceLanternResult);
    connection.reducers.onPlaceWoodenStorageBox(handlePlaceWoodenStorageBoxResult);
    connection.reducers.onPlaceSleepingBag(handlePlaceSleepingBagResult);
    connection.reducers.onPlaceStash(handlePlaceStashResult);
    connection.reducers.onPlaceShelter(handlePlaceShelterResult);
    connection.reducers.onPlaceRainCollector(handlePlaceRainCollectorResult);
    connection.reducers.onPlaceHomesteadHearth(handlePlaceHomesteadHearthResult);

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
    };
  }, [connection]);

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
  }, []);

  // Load doodad images
  useEffect(() => {
    import('../assets/doodads/planted_seed.png').then((module) => {
      const img = new Image();
      img.onload = () => {
        doodadImagesRef.current.set('planted_seed.png', img);
      };
      img.onerror = () => console.error('Failed to load planted_seed.png');
      img.src = module.default;
    });

    import('../assets/doodads/reed_rain_collector.png').then((module) => {
      const img = new Image();
      img.onload = () => {
        doodadImagesRef.current.set('reed_rain_collector.png', img);
      };
      img.onerror = () => console.error('Failed to load reed_rain_collector.png');
      img.src = module.default;
    });

    // Load door images (south-facing)
    import('../assets/doodads/wood_door.png').then((module) => {
      const img = new Image();
      img.onload = () => {
        doodadImagesRef.current.set('wood_door.png', img);
      };
      img.onerror = () => console.error('Failed to load wood_door.png');
      img.src = module.default;
    });

    import('../assets/doodads/metal_door.png').then((module) => {
      const img = new Image();
      img.onload = () => {
        doodadImagesRef.current.set('metal_door.png', img);
      };
      img.onerror = () => console.error('Failed to load metal_door.png');
      img.src = module.default;
    });

    // Load door images (north-facing)
    import('../assets/doodads/wood_door_north.png').then((module) => {
      const img = new Image();
      img.onload = () => {
        doodadImagesRef.current.set('wood_door_north.png', img);
      };
      img.onerror = () => console.error('Failed to load wood_door_north.png');
      img.src = module.default;
    });

    import('../assets/doodads/metal_door_north.png').then((module) => {
      const img = new Image();
      img.onload = () => {
        doodadImagesRef.current.set('metal_door_north.png', img);
      };
      img.onerror = () => console.error('Failed to load metal_door_north.png');
      img.src = module.default;
    });

    // Load compost image
    import('../assets/doodads/compost.png').then((module) => {
      const img = new Image();
      img.onload = () => {
        doodadImagesRef.current.set('compost.png', img);
      };
      img.onerror = () => console.error('Failed to load compost.png');
      img.src = module.default;
    });

    // Load barbecue image
    import('../assets/doodads/barbecue.png').then((module) => {
      const img = new Image();
      img.onload = () => {
        doodadImagesRef.current.set('barbecue.png', img);
      };
      img.onerror = () => console.error('Failed to load barbecue.png');
      img.src = module.default;
    });

    // Load refrigerator image
    import('../assets/doodads/refrigerator.png').then((module) => {
      const img = new Image();
      img.onload = () => {
        doodadImagesRef.current.set('refrigerator.png', img);
      };
      img.onerror = () => console.error('Failed to load refrigerator.png');
      img.src = module.default;
    });

    // Load large wooden box image
    import('../assets/doodads/large_wood_box.png').then((module) => {
      const img = new Image();
      img.onload = () => {
        doodadImagesRef.current.set('large_wood_box.png', img);
      };
      img.onerror = () => console.error('Failed to load large_wood_box.png');
      img.src = module.default;
    });

    // Load repair bench image
    import('../assets/doodads/repair_bench.png').then((module) => {
      const img = new Image();
      img.onload = () => {
        doodadImagesRef.current.set('repair_bench.png', img);
      };
      img.onerror = () => console.error('Failed to load repair_bench.png');
      img.src = module.default;
    });

    // Load cooking station image
    import('../assets/doodads/cooking_station.png').then((module) => {
      const img = new Image();
      img.onload = () => {
        doodadImagesRef.current.set('cooking_station.png', img);
      };
      img.onerror = () => console.error('Failed to load cooking_station.png');
      img.src = module.default;
    });

    // Monument images are now loaded via static imports in monumentRenderingUtils.ts
    // (same pattern as treeRenderingUtils.ts - uses imageManager for preloading)
    // Includes both static monuments (compound buildings) and dynamic monuments (shipwrecks)

    // Load foundation tile images
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
          // Play building privilege error sound for instant feedback
          playImmediateSound('error_building_privilege', 1.0);
        }
        // Check if error is about tier upgrade (cannot downgrade or already at tier)
        else if (errorMsg.includes('Cannot downgrade') || 
                 errorMsg.includes('Current tier') || 
                 errorMsg.includes('Target tier')) {
          // Play tier upgrade error sound for instant feedback
          playImmediateSound('error_tier_upgrade', 1.0);
        }
        // Check if error is about insufficient resources
        else if (errorMsg.includes('Not enough') || 
            errorMsg.includes('wood') || 
            errorMsg.includes('stone') ||
            errorMsg.includes('metal fragments') ||
            errorMsg.includes('Required:')) {
          // Play error sound for instant feedback
          playImmediateSound('error_resources', 1.0);
        }
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
  }, [connection]);

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

  // Use the particle hooks - they now run independently
  // Compute static campfire positions from fishing village parts (always burning)
  const staticCampfires = useMemo(() => {
    if (!fishingVillageParts || fishingVillageParts.size === 0) return [];
    const campfires: { id: string; posX: number; posY: number }[] = [];
    fishingVillageParts.forEach((part: any) => {
      if (part.partType === 'campfire') {
        campfires.push({ id: part.id.toString(), posX: part.worldX, posY: part.worldY });
      }
    });
    return campfires;
  }, [fishingVillageParts]);

  const campfireParticles = useCampfireParticles({
    visibleCampfiresMap,
    deltaTime: 0, // Not used anymore, but kept for compatibility
    staticCampfires, // ADDED: Fishing village campfire (always burning)
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

  // Shore wave particle effects - animated waves lapping at beach/sea transitions
  // Calculate viewBounds for viewport culling
  const shoreWaveViewBounds = useMemo(() => ({
    minX: -cameraOffsetX,
    maxX: -cameraOffsetX + canvasSize.width,
    minY: -cameraOffsetY,
    maxY: -cameraOffsetY + canvasSize.height,
  }), [cameraOffsetX, cameraOffsetY, canvasSize.width, canvasSize.height]);
  
  const shoreWaveParticles = useShoreWaveParticles({
    worldTiles: visibleWorldTiles,
    viewBounds: shoreWaveViewBounds,
    cameraOffsetX,
    cameraOffsetY,
  });

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
    
    // Separate particles by type for batched rendering
    const fireParticlesLocal: any[] = [];
    const emberParticles: any[] = [];
    const sparkParticles: any[] = [];
    const otherParticles: any[] = [];
    
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (p.type === 'fire') {
        fireParticlesLocal.push(p);
      } else if (p.type === 'ember') {
        emberParticles.push(p);
      } else if (p.type === 'spark') {
        sparkParticles.push(p);
      } else {
        otherParticles.push(p);
      }
    }
    
    // Render fire particles with AAA pixel art style (Sea of Stars inspired)
    // Use square pixels instead of circles for crisp pixel art look
    if (fireParticlesLocal.length > 0) {
      ctx.save();
      // Disable anti-aliasing for crisp pixel art
      ctx.imageSmoothingEnabled = false;
      for (let i = 0; i < fireParticlesLocal.length; i++) {
        const particle = fireParticlesLocal[i];
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
    if (emberParticles.length > 0) {
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      for (let i = 0; i < emberParticles.length; i++) {
        const particle = emberParticles[i];
        
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
    if (sparkParticles.length > 0) {
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      for (let i = 0; i < sparkParticles.length; i++) {
        const particle = sparkParticles[i];
        
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
    if (otherParticles.length > 0) {
      ctx.save();
      // Disable anti-aliasing for crisp pixel art
      ctx.imageSmoothingEnabled = false;
      ctx.shadowBlur = 0; // No shadow for smoke particles
      for (let i = 0; i < otherParticles.length; i++) {
        const particle = otherParticles[i];
        const isStaticCampfireSmoke = particle.id && particle.id.startsWith('smoke_static_');
        
        ctx.globalAlpha = particle.alpha || 1;
        ctx.fillStyle = particle.color || '#888888';
        
        // Use square pixels for pixel art style (Sea of Stars)
        // Static campfire smoke uses larger pixels for dramatic effect
        const pixelSize = Math.max(1, Math.floor(particle.size));
        const pixelX = Math.floor(particle.x - pixelSize / 2);
        const pixelY = Math.floor(particle.y - pixelSize / 2);
        ctx.fillRect(pixelX, pixelY, pixelSize, pixelSize);
      }
      ctx.restore();
    }
  };

  // Used to trigger cloud fetching and updating -- keep this logic at the top level
  // THROTTLED: Only send updates to server periodically or when moving significant distance
  const lastViewportUpdateRef = useRef<number>(0);
  const lastViewportPosRef = useRef<{x: number, y: number} | null>(null);
  
  useEffect(() => {
    if (connection) {
      const now = Date.now();
      const timeDiff = now - lastViewportUpdateRef.current;
      
      // Check distance moved since last update
      let distSq = 0;
      if (lastViewportPosRef.current) {
        const dx = camera.x - lastViewportPosRef.current.x;
        const dy = camera.y - lastViewportPosRef.current.y;
        distSq = dx*dx + dy*dy;
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

  // Thunder effects removed - system disabled for now
  // TODO: Re-enable thunder system after debugging

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
  const perfProfilingRef = useRef({
    lastLogTime: Date.now(),
    frameCount: 0,
    totalFrameTime: 0,
    maxFrameTime: 0,
    slowFrames: 0, // frames > 16ms
  });

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
    const currentCameraOffsetX = cameraOffsetRef.current.x;
    const currentCameraOffsetY = cameraOffsetRef.current.y;
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

    // --- STEP 0.4: Render sea stack SHADOWS ONLY (below everything) ---
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
      // Normal rendering: shadows, bottom half, and water effects
      visibleSeaStacks.forEach(seaStack => {
        renderSeaStackShadowOnly(ctx, seaStack, doodadImagesRef.current, currentCycleProgress);
      });
      // --- END SEA STACK SHADOWS ---

      // --- STEP 0.5: Render sea stack BOTTOM halves WITHOUT shadows (underwater rock texture) ---
      const localPlayerPositionForSeaStacks = currentPredictedPosition ?? (localPlayer ? { x: localPlayer.positionX, y: localPlayer.positionY } : null);
      visibleSeaStacks.forEach(seaStack => {
        renderSeaStackBottomOnly(ctx, seaStack, doodadImagesRef.current, currentCycleProgress, now_ms, localPlayerPositionForSeaStacks);
      });
      // --- END SEA STACK BOTTOMS ---

      // --- STEP 0.6: Render sea stack water effects (blue gradient overlay OVER the rock) ---
      // This creates the underwater tint over the sea stack base
      visibleSeaStacks.forEach(seaStack => {
        renderSeaStackWaterEffectsOnly(ctx, seaStack, doodadImagesRef.current, now_ms);
      });
    }
    // --- END SEA STACK RENDERING ---

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

    // MOVED: Water line now renders AFTER sea stack tops (see below after Y-sorted entities)

    // Now players render OVER the rock, water gradient

    // --- STEP 1: Render ONLY swimming player bottom halves ---
    // Filter out swimming players and render them manually with exact same logic as renderYSortedEntities
    // EXCEPTION: Snorkeling players (local OR remote) should NOT be split - they render as full sprite
    const swimmingPlayersForBottomHalf = Array.from(players.values())
      .filter(player => {
        // Basic swimming conditions
        if (!player.isOnWater || player.isDead || player.isKnockedOut) return false;
        // Skip local player if they're snorkeling - they render as full sprite in Y-sorted entities
        if (isSnorkeling && player.identity.toHexString() === localPlayerId) return false;
        // Skip ANY player who is snorkeling - they render as full sprite (fully underwater)
        if (player.isSnorkeling) return false;
        return true;
      });

    // Render swimming player bottom halves using exact same logic as renderYSortedEntities
    swimmingPlayersForBottomHalf.forEach(player => {
      const playerId = player.identity.toHexString();
      const isLocalPlayer = localPlayerId === playerId;

      // EXACT same position logic as renderYSortedEntities
      let playerForRendering = player;
      if (isLocalPlayer && currentPredictedPosition) {
        playerForRendering = {
          ...player,
          positionX: currentPredictedPosition.x,
          positionY: currentPredictedPosition.y
        };
      } else if (!isLocalPlayer && remotePlayerInterpolation) {
        const interpolatedPosition = remotePlayerInterpolation.updateAndGetSmoothedPosition(player, localPlayerId);
        playerForRendering = {
          ...player,
          positionX: interpolatedPosition.x,
          positionY: interpolatedPosition.y
        };
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

      // Choose correct sprite image
      let heroImg: HTMLImageElement | null = heroWaterImageRef.current;

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
          heroWaterImageRef.current || heroImg, // heroSwimImg
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

      // Use predicted position for local player
      let playerForRendering = player;
      if (isLocalPlayer && currentPredictedPosition) {
        playerForRendering = {
          ...player,
          positionX: currentPredictedPosition.x,
          positionY: currentPredictedPosition.y,
          direction: localFacingDirection || player.direction,
        };
      }

      // Determine which sprite image to use for shadow shape
      let heroImg: HTMLImageElement | null = null;
      const effectiveIsCrouching = isLocalPlayer && localPlayerIsCrouching !== undefined 
        ? localPlayerIsCrouching 
        : player.isCrouching;

      // Choose sprite based on priority: water > crouching > default
      if (player.isOnWater) {
        heroImg = heroWaterImageRef.current;
      } else if (effectiveIsCrouching) {
        heroImg = heroCrouchImageRef.current;
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
      // Use underwater sprite for snorkeling shadow shape
      const heroImg = heroWaterImageRef.current;
      
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

        // Calculate animated sprite coordinates for swimming/snorkeling
        const totalSwimmingFrames = 24;
        const { sx, sy } = getSpriteCoordinates(
          { ...localPlayer, positionX: currentPredictedPosition.x, positionY: currentPredictedPosition.y, direction: localFacingDirection || localPlayer.direction },
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
    Array.from(players.values())
      .filter(player => {
        // Only remote snorkeling players (not local, and is snorkeling)
        if (player.identity.toHexString() === localPlayerId) return false;
        if (!player.isSnorkeling) return false;
        if (player.isDead || player.isKnockedOut) return false;
        return true;
      })
      .forEach(player => {
        const heroImg = heroWaterImageRef.current;

        if (heroImg) {
          const drawWidth = gameConfig.spriteWidth * 2;
          const drawHeight = gameConfig.spriteHeight * 2;
          const spriteBaseX = player.positionX - drawWidth / 2;
          const spriteBaseY = player.positionY - drawHeight / 2;

          // Calculate if player is moving
          const playerId = player.identity.toHexString();
          let isPlayerMoving = false;
          const lastPos = lastPositionsRef.current?.get(playerId);
          if (lastPos) {
            const positionThreshold = 0.1;
            const dx = Math.abs(player.positionX - lastPos.x);
            const dy = Math.abs(player.positionY - lastPos.y);
            isPlayerMoving = dx > positionThreshold || dy > positionThreshold;
          }

          // Calculate animated sprite coordinates for swimming
          const totalSwimmingFrames = 24;
          const { sx, sy } = getSpriteCoordinates(
            player,
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

          // Calculate shadow position
          const centerX = player.positionX;
          const centerY = player.positionY;
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
    }
    // --- END WATER OVERLAY ---

    // --- STEP 2.5 & 3 COMBINED: Render Y-sorted entities AND swimming player top halves together ---
    // This ensures swimming player tops are properly Y-sorted with sea stacks and other tall entities
    
    // PERFORMANCE OPTIMIZATION: Skip complex merging when no swimming players
    // This is the common case and saves significant object creation/sorting overhead
    if (swimmingPlayersForBottomHalf.length === 0) {
      // No swimming players - render Y-sorted entities directly (already sorted by useEntityFiltering)
      renderYSortedEntities({
        ctx,
        ySortedEntities: currentYSortedEntities,
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
        closestInteractableCampfireId,
        closestInteractableBoxId,
        closestInteractableStashId,
        closestInteractableSleepingBagId,
        closestInteractableHarvestableResourceId,
        closestInteractableDroppedItemId,
        closestInteractableDoorId,
        closestInteractableTarget,
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
        buildingClusters,
        playerBuildingClusterId,
        connection, // ADDED: Pass connection for cairn biome lookup
        isLocalPlayerSnorkeling: isSnorkeling, // ADDED: Pass snorkeling state for underwater rendering
        alwaysShowPlayerNames, // ADDED: Pass setting for always showing player names
        playerStats, // ADDED: Pass player stats for title display on name labels
      });
    } else {
    // --- Swimming players exist, need full merge/sort ---
    
    // Filter out swimming players from Y-sorted entities (their bottom halves were rendered earlier)
    // EXCEPTION: Keep snorkeling players (local OR remote) - they render as a full sprite with teal tint, not split
    const nonSwimmingEntities = currentYSortedEntities.filter(entity => {
      // Keep non-swimming entities
      if (!(entity.type === 'player' && entity.entity.isOnWater && !entity.entity.isDead && !entity.entity.isKnockedOut)) {
        return true;
      }
      // Keep snorkeling local player - they render as full sprite underwater
      if (isSnorkeling && entity.type === 'player' && entity.entity.identity.toHexString() === localPlayerId) {
        return true;
      }
      // Keep ANY snorkeling player (remote players who are underwater) - they render as full sprite
      if (entity.type === 'player' && entity.entity.isSnorkeling) {
        return true;
      }
      return false;
    });
    
    // Create swimming player top half entries with Y position for sorting
    // Reuse swimmingPlayersForBottomHalf array instead of filtering again
    const swimmingPlayerTopHalves = swimmingPlayersForBottomHalf
      .map(player => {
        const playerId = player.identity.toHexString();
        const isLocalPlayer = localPlayerId === playerId;
        
        let playerForRendering = player;
        if (isLocalPlayer && currentPredictedPosition) {
          playerForRendering = {
            ...player,
            positionX: currentPredictedPosition.x,
            positionY: currentPredictedPosition.y
          };
        } else if (!isLocalPlayer && remotePlayerInterpolation) {
          const interpolatedPosition = remotePlayerInterpolation.updateAndGetSmoothedPosition(player, localPlayerId);
          playerForRendering = {
            ...player,
            positionX: interpolatedPosition.x,
            positionY: interpolatedPosition.y
          };
        }
        
        return {
          type: 'swimmingPlayerTopHalf' as const,
          entity: playerForRendering,
          // Use foot position for Y-sorting (same as other players)
          yPosition: playerForRendering.positionY + 48,
          playerId
        };
      });
    
    // Helper function to get Y sort position from an entity
    const getEntityYSort = (entity: typeof nonSwimmingEntities[number]): number => {
      if ('positionY' in entity.entity && entity.entity.positionY !== undefined) {
        return entity.entity.positionY + 48; // Player foot position
      } else if ('worldPosY' in entity.entity && (entity.entity as any).worldPosY !== undefined) {
        // ALK stations use worldPosY for their base position
        return (entity.entity as any).worldPosY;
      } else if ('worldY' in entity.entity && (entity.entity as any).worldY !== undefined) {
        // Compound buildings use worldY for their anchor/foot position
        return (entity.entity as any).worldY;
      } else if ('posY' in entity.entity && entity.entity.posY !== undefined) {
        return entity.entity.posY;
      }
      return 0;
    };
    
    // Merge and sort all entities together
    type MergedEntityType = 
      | (typeof nonSwimmingEntities[number] & { _ySort: number; _isSwimmingTop: false })
      | (typeof swimmingPlayerTopHalves[number] & { _ySort: number; _isSwimmingTop: true });
    
    const mergedEntities: MergedEntityType[] = [
      ...nonSwimmingEntities.map(e => ({ ...e, _ySort: getEntityYSort(e), _isSwimmingTop: false as const })),
      ...swimmingPlayerTopHalves.map(e => ({ ...e, _ySort: e.yPosition, _isSwimmingTop: true as const }))
    ].sort((a, b) => {
      // CRITICAL: This sort can undo the useEntityFiltering sort, so we must duplicate key checks here
      const aType = !a._isSwimmingTop && 'type' in a ? a.type : null;
      const bType = !b._isSwimmingTop && 'type' in b ? b.type : null;
      const aEntity = !a._isSwimmingTop && 'entity' in a ? a.entity : null;
      const bEntity = !b._isSwimmingTop && 'entity' in b ? b.entity : null;
      
      // CRITICAL: Player vs ALK Station - tall structure Y-sorting
      // The ALK station sprite has ~24% transparent space at top. The visual "foot level"
      // (where players walk) is about 170px ABOVE worldPosY. Must use offset for correct sorting.
      if (aType === 'player' && bType === 'alk_station') {
        const playerY = (aEntity as any)?.positionY ?? 0;
        const stationY = (bEntity as any)?.worldPosY ?? 0;
        const ALK_VISUAL_FOOT_OFFSET = 170; // Match collision Y offset - where building visually sits
        // Player renders in front if at or south of the building's visual foot level
        if (playerY >= stationY - ALK_VISUAL_FOOT_OFFSET) {
          return 1; // Player at/near/south of building's visual base - player in front
        }
        return -1; // Player clearly north of building - player behind (station on top)
      }
      if (aType === 'alk_station' && bType === 'player') {
        const playerY = (bEntity as any)?.positionY ?? 0;
        const stationY = (aEntity as any)?.worldPosY ?? 0;
        const ALK_VISUAL_FOOT_OFFSET = 170;
        if (playerY >= stationY - ALK_VISUAL_FOOT_OFFSET) {
          return -1; // Player at/near/south of building's visual base - player in front (inverted)
        }
        return 1; // Player clearly north of building - player behind (inverted)
      }
      
      // CRITICAL: Player vs Compound Building - tall structure Y-sorting (same pattern as ALK station)
      // Compound buildings use worldY as their visual foot/anchor point (no offset needed)
      if (aType === 'player' && bType === 'compound_building') {
        const playerY = (aEntity as any)?.positionY ?? 0;
        const buildingY = (bEntity as any)?.worldY ?? 0;
        // Player renders in front if at or south of the building's visual foot level
        if (playerY >= buildingY) {
          return 1; // Player at/south of building's visual base - player in front
        }
        return -1; // Player north of building - player behind (building on top)
      }
      if (aType === 'compound_building' && bType === 'player') {
        const playerY = (bEntity as any)?.positionY ?? 0;
        const buildingY = (aEntity as any)?.worldY ?? 0;
        if (playerY >= buildingY) {
          return -1; // Player at/south of building's visual base - player in front (inverted)
        }
        return 1; // Player north of building - player behind (inverted)
      }
      
      // Flying birds MUST render above everything (trees, stones, players, etc.)
      const aIsFlyingBird = aType === 'wild_animal' && aEntity && 
        'species' in aEntity && 'isFlying' in aEntity &&
        (aEntity.species?.tag === 'Tern' || aEntity.species?.tag === 'Crow') &&
        aEntity.isFlying === true;
      const bIsFlyingBird = bType === 'wild_animal' && bEntity && 
        'species' in bEntity && 'isFlying' in bEntity &&
        (bEntity.species?.tag === 'Tern' || bEntity.species?.tag === 'Crow') &&
        bEntity.isFlying === true;
      
      // Flying bird vs any non-flying entity
      if (aIsFlyingBird && !bIsFlyingBird) {
        return 1; // Flying bird renders after (above) non-flying entities
      }
      if (bIsFlyingBird && !aIsFlyingBird) {
        return -1; // Flying bird renders after (above) non-flying entities
      }
      
      // Broth pot MUST render above campfires and fumaroles
      if (aType === 'broth_pot' && (bType === 'campfire' || bType === 'fumarole')) {
        return 1; // Broth pot renders after (above) campfire/fumarole
      }
      if (bType === 'broth_pot' && (aType === 'campfire' || aType === 'fumarole')) {
        return -1; // Broth pot renders after (above) campfire/fumarole
      }
      
      return a._ySort - b._ySort;
    });
    
    // Helper to render a swimming player top half
    const renderSwimmingPlayerTopHalf = (item: typeof swimmingPlayerTopHalves[number]) => {
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
        if (!isPlayerMoving) {
          currentAnimFrame = currentIdleAnimationFrame;
        } else if (player.isSprinting) {
          currentAnimFrame = currentSprintAnimationFrame;
        } else {
          currentAnimFrame = currentAnimationFrame;
        }
      } else {
        if (!isPlayerMoving) {
          currentAnimFrame = currentIdleAnimationFrame;
        } else if (player.isSprinting) {
          currentAnimFrame = currentSprintAnimationFrame;
        } else {
          currentAnimFrame = currentAnimationFrame;
        }
      }
      
      let heroImg: HTMLImageElement | null;
      if (player.isOnWater) {
        heroImg = heroWaterImageRef.current;
      } else if (player.isCrouching) {
        heroImg = heroCrouchImageRef.current;
      } else {
        heroImg = heroImageRef.current;
      }
      
      if (heroImg) {
        const isOnline = activeConnections ? activeConnections.has(playerId) : false;
        const isHovered = worldMousePos ? isPlayerHovered(worldMousePos.x, worldMousePos.y, player) : false;
        
        renderPlayer(
          ctx,
          player,
          heroImg,
          heroSprintImageRef.current || heroImg,
          heroIdleImageRef.current || heroImg,
          heroCrouchImageRef.current || heroImg,
          heroWaterImageRef.current || heroImg,
          heroDodgeImageRef.current || heroImg,
          isOnline,
          isPlayerMoving,
          isHovered,
          currentAnimFrame,
          now_ms,
          0,
          alwaysShowPlayerNames || isHovered, // show label if setting enabled or hovered
          activeConsumableEffects,
          localPlayerId,
          false,
          currentCycleProgress,
          localPlayerIsCrouching,
          'top',
          false, // isDodgeRolling - swimming players don't dodge roll
          0, // dodgeRollProgress
          false, // isSnorkeling - these are regular swimming players (snorkeling ones are excluded)
          isSnorkeling // isViewerUnderwater - pass local player's snorkeling state
        );
        
        // Render equipped items for swimming players
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
        if (canRenderItem && equipment) {
          // player.direction is already server-synced in this context
          renderEquippedItem(ctx, player, equipment, itemDef!, itemDefinitions, itemImg!, now_ms, 0, itemImagesRef.current, activeConsumableEffects, localPlayerId, player.direction);
        }
      }
    };
    
    // Render entities in Y-sorted order, batching non-swimming entities for performance
    let currentBatch: typeof nonSwimmingEntities = [];
    
    const flushBatch = () => {
      if (currentBatch.length > 0) {
        renderYSortedEntities({
          ctx,
          ySortedEntities: currentBatch,
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
          closestInteractableCampfireId,
          closestInteractableBoxId,
          closestInteractableStashId,
          closestInteractableSleepingBagId,
          closestInteractableHarvestableResourceId,
          closestInteractableDroppedItemId,
          closestInteractableDoorId,
          closestInteractableTarget,
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
          buildingClusters,
          playerBuildingClusterId,
          connection, // ADDED: Pass connection for cairn biome lookup
          isLocalPlayerSnorkeling: isSnorkeling, // ADDED: Pass snorkeling state for underwater rendering
          alwaysShowPlayerNames, // ADDED: Pass setting for always showing player names
          playerStats, // ADDED: Pass player stats for title display on name labels
        });
        currentBatch = [];
      }
    };
    
    // Process merged entities in Y-sorted order
    for (const item of mergedEntities) {
      if (item._isSwimmingTop) {
        // Flush batch before rendering swimming player
        flushBatch();
        // Render swimming player top half at correct Y position
        renderSwimmingPlayerTopHalf(item as typeof swimmingPlayerTopHalves[number] & { _ySort: number; _isSwimmingTop: true });
      } else {
        // Add to batch
        const { _ySort, _isSwimmingTop, ...entityWithoutMeta } = item;
        currentBatch.push(entityWithoutMeta as typeof nonSwimmingEntities[number]);
      }
    }
    // Flush remaining batch
    flushBatch();
    } // End of else block for swimming players exist
    // --- END Y-SORTED ENTITIES AND SWIMMING PLAYER TOP HALVES ---

    // --- Render animal burrow effects (dirt particles when animals burrow underground) ---
    // Process all wild animals to detect newly burrowed animals
    processWildAnimalsForBurrowEffects(wildAnimals, now_ms);
    // Render the active burrow particle effects
    renderBurrowEffects(ctx, now_ms);
    // --- END BURROW EFFECTS ---

    // --- Render sea stack water lines (ABOVE sea stacks) ---
    // Skip water lines when snorkeling - player is underwater, no surface water effects visible
    if (!isSnorkeling) {
      visibleSeaStacks.forEach(seaStack => {
        renderSeaStackWaterLineOnly(ctx, seaStack, doodadImagesRef.current, now_ms);
      });
    }
    // --- END SEA STACK WATER LINES ---

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

    // REMOVED: Top half rendering now integrated into Y-sorted system above
    // REMOVED: Swimming shadows now render earlier, before sea stacks

    // REMOVED: Swimming players now render normally in Y-sorted entities for proper depth sorting

    // REMOVED: Sea stacks now render fully in Y-sorted entities
    // Water overlay will be clipped to only appear over underwater zones

    // Wild animals are now rendered through the Y-sorted entities system for proper layering

    // Render particle systems
    if (ctx) {
      // Render shore wave particles (below fire/smoke particles, on ground level)
      // Pass 0,0 for camera offsets since ctx is already translated
      // Skip shore waves when snorkeling - player is underwater, can't see surface effects
      if (!isSnorkeling) {
        renderShoreWaves(ctx, shoreWaveParticles, 0, 0);
      }
      
      // Call without camera offsets, as ctx is already translated
      renderParticlesToCanvas(ctx, campfireParticles);
      renderParticlesToCanvas(ctx, torchParticles);
      renderParticlesToCanvas(ctx, fireArrowParticles);
      renderParticlesToCanvas(ctx, furnaceParticles);
      renderParticlesToCanvas(ctx, barbecueParticles);
      renderParticlesToCanvas(ctx, firePatchParticles);
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
      closestInteractableTarget: unifiedInteractableTarget as any,
      lanterns: visibleLanternsMap,
      rainCollectors: rainCollectors,
      brothPots: brothPots,
      homesteadHearths: visibleHomesteadHearthsMap,
      doors: visibleDoorsMap, // ADDED: Doors
      alkStations: alkStations || new Map(), // ADDED: ALK Stations for E label rendering
    });
    renderPlacementPreview({
      ctx, placementInfo, buildingState, itemImagesRef, shelterImageRef, worldMouseX: currentWorldMouseX,
      worldMouseY: currentWorldMouseY, isPlacementTooFar: isPlacementTooFarValue, placementError, connection,
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
        trees: trees || new Map(),
        stones: stones || new Map(),
        runeStones: runeStones || new Map(),
        cairns: cairns || new Map(),
        boxes: woodenStorageBoxes || new Map(),
        rainCollectors: rainCollectors || new Map(),
        furnaces: furnaces || new Map(),
        barbecues: barbecues || new Map(),
        shelters: shelters || new Map(),
        players: players || new Map(),
        wildAnimals: wildAnimals || new Map(),
        barrels: barrels || new Map(),
        seaStacks: seaStacks || new Map(),
        wallCells: wallCells || new Map(),
        foundationCells: foundationCells || new Map(),
        homesteadHearths: homesteadHearths || new Map(),
        basaltColumns: basaltColumns || new Map(),
        doors: doors || new Map(),
        alkStations: alkStations || new Map(),
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
        trees,
        stones,
        wildAnimals,
        players,
        barrels,
        grass,
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
    const isWinter = worldState?.currentSeason?.tag === 'Winter';
    if (showWeatherOverlay && rainIntensity > 0 && !isSnorkeling) {
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
      // If holdInteractionProgress is null (meaning no interaction is even being tracked by the state object),
      // or if the entity is not in view, do nothing.
      if (!isInView || !holdInteractionProgress) {
        return;
      }

      let targetId: number | bigint | string;
      if (typeof entityId === 'string') {
        targetId = entityId; // For knocked out players (hex string) or water ('water')
      } else if (typeof entityId === 'bigint') {
        targetId = BigInt(holdInteractionProgress.targetId ?? 0);
      } else {
        targetId = Number(holdInteractionProgress.targetId ?? 0);
      }

      // Check if the current entity being processed is the target of the (potentially stale) holdInteractionProgress object.
      if (holdInteractionProgress.targetType === entityType && targetId === entityId) {

        // IMPORTANT: Only draw the indicator if the hold is *currently active* (isActivelyHolding is true).
        // If isActivelyHolding is false, it means the hold was just released/cancelled.
        // In this case, we don't draw anything for this entity, not even the background circle.
        // The indicator will completely disappear once holdInteractionProgress becomes null in the next state update.
        if (isActivelyHolding) {
          // Use appropriate duration based on interaction type
          const interactionDuration = entityType === 'knocked_out_player' ? REVIVE_HOLD_DURATION_MS : HOLD_INTERACTION_DURATION_MS;
          const currentProgress = Math.min(Math.max((Date.now() - holdInteractionProgress.startTime) / interactionDuration, 0), 1);
          
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
      drawIndicatorIfNeeded('furnace', furnace.id, furnace.posX, furnace.posY, 96, true); // 96px height for standard furnace size
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
      if (holdInteractionProgress && holdInteractionProgress.targetId === lantern.id && holdInteractionProgress.targetType === 'lantern') {
        drawIndicatorIfNeeded('lantern', lantern.id, lantern.posX, lantern.posY, 56, true); // 56px height for lanterns
      }
    });

    visibleBoxesMap.forEach((box: SpacetimeDBWoodenStorageBox) => {
      // For boxes, the indicator is only relevant if a hold action is in progress (e.g., picking up an empty box)
      if (holdInteractionProgress && holdInteractionProgress.targetId === box.id && holdInteractionProgress.targetType === 'box') {
        drawIndicatorIfNeeded('box', box.id, box.posX, box.posY, BOX_HEIGHT, true, box.boxType);
      }
    });

    // Corrected: Iterate over the full 'stashes' map for drawing indicators for stashes
    // The 'isInView' check within drawIndicatorIfNeeded can be enhanced if needed,
    // but for interaction progress, if it's the target, we likely want to show it if player is close.
    if (stashes instanceof Map) { // Ensure stashes is a Map
      stashes.forEach((stash: SpacetimeDBStash) => {
        // Check if this stash is the one currently being interacted with for a hold action
        if (holdInteractionProgress && holdInteractionProgress.targetId === stash.id && holdInteractionProgress.targetType === 'stash') {
          // For a hidden stash being surfaced, we want to draw the indicator.
          // The 'true' for isInView might need refinement if stashes can be off-screen 
          // but still the closest interactable (though unlikely for a hold interaction).
          // For now, assume if it's the interaction target, it's relevant to draw the indicator.
          drawIndicatorIfNeeded('stash', stash.id, stash.posX, stash.posY, STASH_HEIGHT, true);
        }
      });
    }

    // Knocked Out Player Indicators
    if (closestInteractableKnockedOutPlayerId && players instanceof Map) {
      const knockedOutPlayer = players.get(closestInteractableKnockedOutPlayerId);
      if (knockedOutPlayer && knockedOutPlayer.isKnockedOut && !knockedOutPlayer.isDead) {
        // Check if this knocked out player is the one currently being revived
        if (holdInteractionProgress && holdInteractionProgress.targetId === closestInteractableKnockedOutPlayerId && holdInteractionProgress.targetType === 'knocked_out_player') {
          const playerHeight = 48; // Approximate player sprite height
          drawIndicatorIfNeeded('knocked_out_player', closestInteractableKnockedOutPlayerId, knockedOutPlayer.positionX, knockedOutPlayer.positionY, playerHeight, true);
        }
      }
    }

    // Water Drinking Indicators
    if (closestInteractableWaterPosition && holdInteractionProgress && holdInteractionProgress.targetType === 'water') {
      // Draw indicator at the water position
      drawIndicatorIfNeeded('water', 'water', closestInteractableWaterPosition.x, closestInteractableWaterPosition.y, 0, true);
    }

    // Door Pickup Indicators (hold E to pickup)
    visibleDoorsMap.forEach((door: any) => {
      // For doors, the indicator is only relevant if a hold action is in progress (picking up the door)
      if (holdInteractionProgress && holdInteractionProgress.targetId === door.id && holdInteractionProgress.targetType === 'door') {
        const DOOR_HEIGHT = 96; // Standard door height
        drawIndicatorIfNeeded('door', door.id, door.posX, door.posY, DOOR_HEIGHT, true);
      }
    });

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

    // Fishing Village Campfire Light - Always burning communal fire
    // Renders the warm, cozy light from the Aleut-style central campfire
    if (fishingVillageParts && fishingVillageParts.size > 0) {
      fishingVillageParts.forEach((part: any) => {
        if (part.partType === 'campfire') {
          renderFishingVillageCampfireLight({
            ctx,
            worldX: part.worldX,
            worldY: part.worldY,
            cameraOffsetX: currentCameraOffsetX,
            cameraOffsetY: currentCameraOffsetY,
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
    if (shipwreckParts && shipwreckParts.size > 0) {
      renderAllShipwreckNightLights(
        ctx,
        shipwreckParts,
        currentCycleProgress,
        currentCameraOffsetX,
        currentCameraOffsetY,
        -currentCameraOffsetX, // viewMinX
        -currentCameraOffsetX + currentCanvasWidth, // viewMaxX
        -currentCameraOffsetY, // viewMinY
        -currentCameraOffsetY + currentCanvasHeight, // viewMaxY
        now_ms
      );
      
      // DEBUG: Visible protection zone circles for shipwreck parts
      // Shows purple circle (protection zone), green crosshair (visual center), red dot (anchor point)
      // Toggle via Debug Panel -> SHIPWRECK button
      if (showShipwreckDebug) {
        renderAllShipwreckDebugZones(
          ctx,
          shipwreckParts,
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

    // === PERFORMANCE PROFILING - Frame time tracking ===
    const frameEndTime = performance.now();
    const frameTime = frameEndTime - frameStartTime;
    perfProfilingRef.current.totalFrameTime += frameTime;
    if (frameTime > perfProfilingRef.current.maxFrameTime) {
      perfProfilingRef.current.maxFrameTime = frameTime;
    }
    if (frameTime > 16) {
      perfProfilingRef.current.slowFrames++;
    }
    
    // PERFORMANCE DEBUG: Uncomment to enable periodic frame time logging
    // Log every 5 seconds (disabled by default to reduce console overhead)
    /*
    if (Date.now() - perfProfilingRef.current.lastLogTime > 5000) {
      const p = perfProfilingRef.current;
      const avgFrameTime = p.totalFrameTime / p.frameCount;
      console.log(`[FRAME_PERF] Avg: ${avgFrameTime.toFixed(2)}ms, Max: ${p.maxFrameTime.toFixed(2)}ms, Slow(>16ms): ${p.slowFrames}/${p.frameCount} frames`);
      console.log(`[ENTITY_COUNTS] Players: ${players.size}, Trees: ${trees?.size || 0}, Stones: ${stones?.size || 0}, YSorted: ${currentYSortedEntities.length}`);
      console.log(`[VISIBLE_COUNTS] Campfires: ${visibleCampfiresMap.size}, Boxes: ${visibleBoxesMap.size}, Resources: ${visibleHarvestableResourcesMap.size}, DroppedItems: ${visibleDroppedItemsMap.size}, BasaltCols: ${visibleBasaltColumnsMap.size}, Fumaroles: ${visibleFumerolesMap.size}, SeaStacks: ${visibleSeaStacksMap.size}, Grass: ${visibleGrassMap?.size || 0}`);
      // Reset
      perfProfilingRef.current = { lastLogTime: Date.now(), frameCount: 0, totalFrameTime: 0, maxFrameTime: 0, slowFrames: 0 };
    }
    */
    
    // === END PERFORMANCE PROFILING ===

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
    closestInteractableHarvestableResourceId,
    closestInteractableCampfireId, closestInteractableDroppedItemId, closestInteractableBoxId, isClosestInteractableBoxEmpty,
    closestInteractableWaterPosition,
    holdInteractionProgress, hoveredPlayerIds, handlePlayerHover, messages,
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
    projectiles,
    deathMarkerImg,
    localPlayerDeathMarker,
    shelters,
    visibleShelters,
    visibleSheltersMap,
    shelterImageRef.current,
    minimapCache,
    chunkWeather,
    clouds, // Only need clouds prop for the size check, interpolation is via ref
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
      console.log('[GameCanvas] Respawn randomly result:', ctx);
      if (ctx.event?.status === 'Committed') {
        console.log('[GameCanvas] Respawn randomly successful!');
      } else if (ctx.event?.status?.Failed) {
        console.error('[GameCanvas] Respawn randomly failed:', ctx.event.status.Failed);
      }
    };

    const handleRespawnAtBagResult = (ctx: any, bagId: number) => {
      console.log('[GameCanvas] Respawn at bag result:', ctx, 'bagId:', bagId);
      if (ctx.event?.status === 'Committed') {
        console.log('[GameCanvas] Respawn at bag successful!');
      } else if (ctx.event?.status?.Failed) {
        console.error('[GameCanvas] Respawn at bag failed:', ctx.event.status.Failed);
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
  }, [connection]);

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

  // --- Minimap rendering effect ---
  useEffect(() => {
    if (!isMinimapOpen || !minimapCanvasRef.current) return;

    const canvas = minimapCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear the canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Ensure props are valid Maps before passing
    const validPlayers = players instanceof Map ? players : new Map();
    const validTrees = trees instanceof Map ? trees : new Map();
    const validStones = stones instanceof Map ? stones : new Map();
    const validRuneStones = runeStones instanceof Map ? runeStones : new Map();
    const validSleepingBags = sleepingBags instanceof Map ? sleepingBags : new Map();
    const validCampfires = campfires instanceof Map ? campfires : new Map();

    // Read grid coordinates preference from localStorage
    const savedGridPref = localStorage.getItem('minimap_show_grid_coordinates');
    const showGridCoordinates = savedGridPref !== null ? savedGridPref === 'true' : true;

    // Convert chunkWeather Map<string, any> to Map<number, ChunkWeather> for minimap
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
      ctx,
      players: validPlayers,
      trees: validTrees,
      stones: validStones,
      runeStones: validRuneStones,
      barrels: barrels instanceof Map ? barrels : new Map(),
      campfires: validCampfires,
      sleepingBags: validSleepingBags,
      localPlayer,
      localPlayerId,
      viewCenterOffset,
      playerPin: localPlayerPin,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      isMouseOverMinimap,
      zoomLevel: minimapZoom,
      sleepingBagImage: itemImagesRef.current?.get('sleeping_bag.png'),
      localPlayerDeathMarker: localPlayerDeathMarker,
      deathMarkerImage: deathMarkerImg,
      worldState: worldState,
      minimapCache: minimapCache,
      // Add the new minimap icon images
      pinMarkerImage: pinMarkerImg,
      campfireWarmthImage: campfireWarmthImg,
      torchOnImage: torchOnImg,
      // Add grid coordinates visibility preference
      showGridCoordinates,
      // Add minimap weather overlay props (separate from game canvas weather overlay)
      showWeatherOverlay: minimapShowWeatherOverlay,
      chunkWeatherData: chunkWeatherForMinimap,
      // ALK delivery stations for minimap
      alkStations: alkStations,
      // Shipwreck monument parts for minimap
      shipwreckParts: shipwreckParts,
      // Fishing village monument parts for minimap
      fishingVillageParts: fishingVillageParts,
      // Large quarry locations with types for minimap labels
      largeQuarries: largeQuarries,
      // Living coral reefs for minimap (underwater resources)
      livingCorals: visibleLivingCoralsMap,
      // Show names toggle for minimap labels
      showNames: minimapShowNames,
      // Matronage system for player visibility
      matronageMembers: matronageMembers,
      matronages: matronages,
    });
  }, [
    isMinimapOpen,
    players,
    trees,
    stones,
    runeStones,
    sleepingBags,
    campfires,
    localPlayer,
    localPlayerId,
    viewCenterOffset,
    localPlayerPin,
    isMouseOverMinimap,
    isMouseOverXButton,
    minimapZoom,
    itemImagesRef,
    localPlayerDeathMarker,
    deathMarkerImg,
    worldState,
    minimapCache,
    // Add new image dependencies
    pinMarkerImg,
    campfireWarmthImg,
    torchOnImg,
    // Add minimap weather overlay dependencies (separate from game canvas)
    minimapShowWeatherOverlay,
    chunkWeather,
    // ALK stations for minimap
    alkStations,
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
      {/* Red flash overlay when player takes damage */}
      {vignetteOpacity > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            background: `radial-gradient(ellipse at center, transparent 20%, rgba(180, 20, 20, ${vignetteOpacity * 0.7}) 70%, rgba(120, 0, 0, ${vignetteOpacity}) 100%)`,
            zIndex: 50,
          }}
        />
      )}
      
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
          // Shipwreck monument parts for minimap
          shipwreckParts={shipwreckParts}
          // Fishing village monument parts for minimap
          fishingVillageParts={fishingVillageParts}
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
    </div>
  );
};

export default React.memo(GameCanvas);