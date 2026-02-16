import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ItemDefinition, InventoryItem, DbConnection, Campfire as SpacetimeDBCampfire, Fumarole as SpacetimeDBFumarole, HotbarLocationData, EquipmentSlotType, Stash, Player, ActiveConsumableEffect, ActiveEquipment, RangedWeaponStats, BrothPot as SpacetimeDBBrothPot } from '../generated';
import { Identity, Timestamp } from 'spacetimedb';
import { isWaterContainer, hasWaterContent, getWaterLevelPercentage, isSaltWater, getWaterCapacity } from '../utils/waterContainerHelpers';
import { isPlantableSeed } from '../utils/plantsUtils';
import { hasDurabilitySystem, getDurabilityPercentage, isItemBroken, getDurabilityColor, getDurability, getMaxDurability, MAX_DURABILITY, isFoodItem, isFoodSpoiled, formatFoodSpoilageTimeRemaining } from '../utils/durabilityHelpers';
import { isCombatLadleHot } from '../utils/itemIconUtils';
import DurabilityBar from './DurabilityBar';

// Import Custom Components
import DraggableItem from './DraggableItem';
import DroppableSlot from './DroppableSlot';

// Import shared types
import { PopulatedItem } from './InventoryUI';
import { DragSourceSlotInfo, DraggedItemInfo } from '../types/dragDropTypes';
import { PlacementItemInfo } from '../hooks/usePlacementManager';

// Style constants - Cyberpunk SOVA theme
const UI_BG_COLOR = 'linear-gradient(135deg, rgba(30, 15, 50, 0.95), rgba(20, 10, 40, 0.98))';
const UI_BORDER_COLOR = '#00aaff';
const UI_SHADOW = '0 0 30px rgba(0, 170, 255, 0.3), inset 0 0 20px rgba(0, 170, 255, 0.1)';
const UI_FONT_FAMILY = '"Press Start 2P", cursive';
const SLOT_SIZE = 60; // Size of each hotbar slot in pixels (desktop)
const MOBILE_SLOT_SIZE = 48; // Size of each hotbar slot in pixels (mobile)
const SLOT_MARGIN = 6;
const MOBILE_SLOT_MARGIN = 4;
const SELECTED_BORDER_COLOR = '#00ffff';
const CONSUMPTION_COOLDOWN_MICROS = 1_000_000; // 1 second, matches server
const DEFAULT_CLIENT_ANIMATION_DURATION_MS = CONSUMPTION_COOLDOWN_MICROS / 1000; // Duration for client animation
const BANDAGE_CLIENT_ANIMATION_DURATION_MS = 5000; // 5 seconds for bandage visual cooldown

// Weapon cooldown state interface - simplified
interface WeaponCooldownState {
  slotIndex: number;
  startTime: number;
  duration: number;
}

// --- Client-side animation tracking for weapon cooldowns ---
const clientWeaponCooldownStartTimes = new Map<string, number>(); // weaponInstanceId -> client timestamp when cooldown started
const lastKnownServerWeaponCooldownTimes = new Map<string, number>(); // weaponInstanceId -> last known server timestamp

// Update HotbarProps
interface HotbarProps {
  playerIdentity: Identity | null;
  localPlayer: Player | null;
  itemDefinitions: Map<string, ItemDefinition>;
  inventoryItems: Map<string, InventoryItem>;
  rangedWeaponStats: Map<string, RangedWeaponStats>; // Add ranged weapon stats
  connection: DbConnection | null;
  onItemDragStart: (info: DraggedItemInfo) => void;
  onItemDrop: (targetSlotInfo: DragSourceSlotInfo | null) => void;
  draggedItemInfo: DraggedItemInfo | null;
  interactingWith: { type: string; id: number | bigint } | null;
  campfires: Map<string, SpacetimeDBCampfire>;
  fumaroles: Map<string, SpacetimeDBFumarole>;
  stashes: Map<string, Stash>;
  brothPots: Map<string, SpacetimeDBBrothPot>;
  startPlacement: (itemInfo: PlacementItemInfo) => void;
  cancelPlacement: () => void;
  activeConsumableEffects: Map<string, ActiveConsumableEffect>;
  activeEquipment: ActiveEquipment | null;
  isGameMenuOpen?: boolean;
  placementInfo: PlacementItemInfo | null; // Add placement state info
  isMobile?: boolean; // Mobile layout flag
  // Hot loot props
  isHotLootActive?: boolean;
  getSlotIndicator?: (slotType: string, slotIndex: number | string, parentId?: number | bigint) => { progress: number } | undefined;
  handleHotLootSlotHover?: (item: PopulatedItem, slotInfo: DragSourceSlotInfo, context: 'player' | 'container') => void;
  setHotLootCurrentHover?: (item: PopulatedItem | null, slotInfo: DragSourceSlotInfo | null, context: 'player' | 'container' | null) => void;
  // XP bar props
  playerStats?: Map<string, any>;
  // ItemInteractionPanel support - allows clicking items when inventory is open
  isInventoryOpen?: boolean;
  onSelectInventoryItem?: (item: PopulatedItem | null) => void;
}

// Add tooltip interface
interface TooltipState {
  visible: boolean;
  content: {
    name: string;
    quantity: number;
    consumableStats?: {
      health: number;
      thirst: number;
      hunger: number;
    };
    waterContentMl?: number; // Water content in mL for water containers
    waterCapacityMl?: number; // Water capacity in mL for water containers
    isSaltWater?: boolean; // Whether the water container has salt water
    ammoLoaded?: number; // Current ammo loaded in magazine (for firearms)
    ammoCapacity?: number; // Magazine capacity (for firearms)
    durability?: number; // Current durability (0-100) for weapons/tools/torches/food
    maxDurability?: number; // Max durability (always 100)
    spoilageTimeRemaining?: string; // Time remaining until food spoils (e.g., "12h 30m" or "Spoiled")
  } | null;
  position: {
    x: number;
    y: number;
  };
}

// Add helper function to determine if player is on salt water
const isOnSaltWater = (localPlayer: Player | null): boolean => {
  // For now, we'll assume all water is fresh water since salt water detection isn't implemented
  // This can be expanded later when salt water tiles are distinguished from fresh water
  return false; // Placeholder - return false for now so fresh water filling works
};

// Add helper function to check if an item can be filled with water
const canFillWithWater = (item: PopulatedItem): boolean => {
  const waterContainers = ['Reed Water Bottle', 'Plastic Water Jug'];
  return waterContainers.includes(item.definition.name);
};

// Add helper function to get remaining capacity of water container
const getWaterContainerRemainingCapacity = (item: PopulatedItem): number => {
  const maxCapacityLiters = getWaterCapacity(item.definition.name);
  const maxCapacityMl = maxCapacityLiters * 1000; // Convert liters to mL
  const currentWater = hasWaterContent(item.instance) ? getWaterLevelPercentage(item.instance, item.definition.name) * maxCapacityMl : 0;
  
  return Math.max(0, maxCapacityMl - currentWater);
};

// --- Hotbar Component ---
const Hotbar: React.FC<HotbarProps> = ({
    playerIdentity,
    localPlayer,
    itemDefinitions,
    inventoryItems,
    rangedWeaponStats,
    connection,
    onItemDragStart,
    onItemDrop,
    interactingWith,
    campfires,
    fumaroles,
    stashes,
    brothPots,
    startPlacement,
    cancelPlacement,
    activeConsumableEffects,
    activeEquipment,
    isGameMenuOpen,
    placementInfo,
    isMobile = false,
    isHotLootActive,
    getSlotIndicator,
    handleHotLootSlotHover,
    setHotLootCurrentHover,
    playerStats,
    isInventoryOpen,
    onSelectInventoryItem,
}) => {
  const [selectedSlot, setSelectedSlot] = useState<number>(-1);
  const [isVisualCooldownActive, setIsVisualCooldownActive] = useState<boolean>(false);
  const [visualCooldownStartTime, setVisualCooldownStartTime] = useState<number | null>(null);
  const [animationProgress, setAnimationProgress] = useState<number>(0);
  const [currentAnimationDuration, setCurrentAnimationDuration] = useState<number>(DEFAULT_CLIENT_ANIMATION_DURATION_MS);
  const [cooldownSlot, setCooldownSlot] = useState<number | null>(null); // Track which slot has the active cooldown
  const [forceRender, setForceRender] = useState<number>(0); // Force re-render counter
  
  // Weapon cooldown state - simplified to match consumable system
  const [isWeaponCooldownActive, setIsWeaponCooldownActive] = useState<boolean>(false);
  const [weaponCooldownStartTime, setWeaponCooldownStartTime] = useState<number | null>(null);
  const [weaponCooldownProgress, setWeaponCooldownProgress] = useState<number>(0);
  const [weaponCooldownDuration, setWeaponCooldownDuration] = useState<number>(1000);
  const [weaponCooldownSlot, setWeaponCooldownSlot] = useState<number | null>(null);
  
  // Reload cooldown state - for magazine reload animations
  const [isReloadCooldownActive, setIsReloadCooldownActive] = useState<boolean>(false);
  const [reloadCooldownStartTime, setReloadCooldownStartTime] = useState<number | null>(null);
  const [reloadCooldownProgress, setReloadCooldownProgress] = useState<number>(0);
  const [reloadCooldownDuration, setReloadCooldownDuration] = useState<number>(2000);
  const [reloadCooldownSlot, setReloadCooldownSlot] = useState<number | null>(null);
  
  // Tooltip state
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    content: null,
    position: { x: 0, y: 0 }
  });
  
  const visualCooldownTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const weaponCooldownAnimationRef = useRef<number | null>(null);
  const weaponCooldownTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reloadCooldownAnimationRef = useRef<number | null>(null);
  const reloadCooldownTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const numSlots = 6;
  const prevSelectedSlotRef = useRef<number>(selectedSlot);
  const prevActiveEffectsRef = useRef<Set<string>>(new Set());
  const hoveredSlotRef = useRef<number | null>(null); // Track which slot is currently hovered for tooltip
  const lastTooltipItemRef = useRef<{ instanceId: bigint; waterContentMl: number | undefined; quantity: number; isSaltWater: boolean | undefined } | null>(null); // Track last tooltip values for change detection
  const selectedSlotRef = useRef<number>(selectedSlot); // Immediate tracking for rapid clicks
  
  // XP Progress calculation for the XP bar above hotbar
  const xpProgress = React.useMemo(() => {
    if (!playerIdentity || !playerStats) return null;
    const localPlayerStats = playerStats.get(playerIdentity.toHexString());
    if (!localPlayerStats) return null;
    
    // XP formula: 100 * level^1.5 (matches server)
    const xpForLevel = (level: number) => Math.floor(100 * Math.pow(level, 1.5));
    
    const level = localPlayerStats.level || 1;
    const totalXp = Number(localPlayerStats.totalXp) || 0;
    const xpForCurrentLevel = level > 1 ? xpForLevel(level) : 0;
    const xpForNextLevel = xpForLevel(level + 1);
    const xpInCurrentLevel = totalXp - xpForCurrentLevel;
    const xpNeededForNext = xpForNextLevel - xpForCurrentLevel;
    
    const percent = xpNeededForNext > 0 ? Math.min(100, (xpInCurrentLevel / xpNeededForNext) * 100) : 0;
    
    return {
      current: xpInCurrentLevel,
      needed: xpNeededForNext,
      percent,
      level
    };
  }, [playerIdentity, playerStats]);
  const lastActivationRef = useRef<{ slot: number; timestamp: number } | null>(null); // Debounce rapid activations
  const lastKeyPressRef = useRef<{ key: string; timestamp: number } | null>(null); // Debounce keyboard events
  
  // Refs for stable access in activateHotbarSlot (prevent recreation)
  const connectionRef = useRef(connection);
  const playerIdentityRef = useRef(playerIdentity);
  const localPlayerRef = useRef(localPlayer);
  const placementInfoRef = useRef(placementInfo);
  
  // Update refs when values change
  useEffect(() => { connectionRef.current = connection; }, [connection]);
  useEffect(() => { playerIdentityRef.current = playerIdentity; }, [playerIdentity]);
  useEffect(() => { localPlayerRef.current = localPlayer; }, [localPlayer]);
  useEffect(() => { placementInfoRef.current = placementInfo; }, [placementInfo]);

  // Cleanup refs on unmount
  useEffect(() => {
    return () => {
      if (visualCooldownTimeoutRef.current) {
        clearTimeout(visualCooldownTimeoutRef.current);
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (weaponCooldownAnimationRef.current) {
        cancelAnimationFrame(weaponCooldownAnimationRef.current);
      }
      if (weaponCooldownTimeoutRef.current) {
        clearTimeout(weaponCooldownTimeoutRef.current);
      }
      if (reloadCooldownAnimationRef.current) {
        cancelAnimationFrame(reloadCooldownAnimationRef.current);
      }
      if (reloadCooldownTimeoutRef.current) {
        clearTimeout(reloadCooldownTimeoutRef.current);
      }
    };
  }, []);

  // Find item for slot - MOVED UP (and should be before animation useEffect)
  const findItemForSlot = useCallback((slotIndex: number): PopulatedItem | null => {
    if (!playerIdentity) return null;
    for (const itemInstance of inventoryItems.values()) {
      if (itemInstance.location.tag === 'Hotbar') {
        const hotbarData = itemInstance.location.value as HotbarLocationData;
        if (hotbarData.ownerId && hotbarData.ownerId.isEqual(playerIdentity) && hotbarData.slotIndex === slotIndex) {
          const definition = itemDefinitions.get(itemInstance.itemDefId.toString());
          if (definition) {
              return { instance: itemInstance, definition };
          }
        }
      }
    }
    return null;
  }, [playerIdentity, inventoryItems, itemDefinitions]);

  // Helper function to check if an item is a weapon/tool with attack interval or reload time
  const isWeaponWithCooldown = useCallback((itemDef: ItemDefinition): boolean => {
    // Check for melee weapons/tools with attackIntervalSecs
    if (itemDef.attackIntervalSecs !== null &&
        itemDef.attackIntervalSecs !== undefined &&
        itemDef.attackIntervalSecs > 0 &&
        (itemDef.category.tag === 'Weapon' ||
         itemDef.category.tag === 'Tool') &&
        itemDef.isEquippable) {
      return true;
    }

    // Check for ranged weapons with reload time in rangedWeaponStats
    if (itemDef.category.tag === 'RangedWeapon' && itemDef.isEquippable && rangedWeaponStats) {
      const weaponStats = rangedWeaponStats.get(itemDef.name);
      return weaponStats !== undefined && weaponStats.reloadTimeSecs > 0;
    }

    return false;
  }, [rangedWeaponStats]);

  // Helper function to get cooldown duration for any weapon type
  const getWeaponCooldownDurationMs = useCallback((itemDef: ItemDefinition): number => {
    // For melee weapons/tools, use attackIntervalSecs
    if (itemDef.category.tag === 'Weapon' || itemDef.category.tag === 'Tool') {
      return (itemDef.attackIntervalSecs || 0) * 1000;
    }

    // For ranged weapons, use reload time from rangedWeaponStats
    if (itemDef.category.tag === 'RangedWeapon' && rangedWeaponStats) {
      const weaponStats = rangedWeaponStats.get(itemDef.name);
      if (weaponStats) {
        return weaponStats.reloadTimeSecs * 1000;
      }
    }

    return 0;
  }, [rangedWeaponStats]);

  // Helper function to check if a slot should be disabled due to water
  // This updates immediately when isSnorkeling changes to show/hide water icons seamlessly
  const isSlotDisabledByWater = useCallback((slotIndex: number): boolean => {
    if (!localPlayer?.isOnWater) return false;
    
    const itemInSlot = findItemForSlot(slotIndex);
    if (!itemInSlot) return false;
    
    // Allow specific items to be used in water (but NOT when snorkeling underwater)
    const allowedInWater = [
      'Reed Water Bottle', 
      'Plastic Water Jug',
      'Reed Harpoon', // Allow reed harpoon melee weapon to be used in water
      'Reed Harpoon Gun', // Allow reed harpoon gun ranged weapon in water
      'Diving Pick', // Allow diving pick for underwater coral harvesting
      'Tidebreaker Blade' // Allow Tidebreaker Blade in water for harvesting jellyfish/shark corpses
    ];
    // Torch is only allowed in water when NOT snorkeling (can't light a torch underwater!)
    if (!localPlayer?.isSnorkeling && itemInSlot.definition.name === 'Torch') return false;
    if (allowedInWater.includes(itemInSlot.definition.name)) return false;
    
    // Allow seeds and food (consumables) to be used in water
    if (itemInSlot.definition.category.tag === 'Consumable') return false;
    
    const categoryTag = itemInSlot.definition.category.tag;
    return categoryTag === 'Weapon' || 
           categoryTag === 'RangedWeapon' || 
           categoryTag === 'Tool' ||
           itemInSlot.definition.isEquippable;
  }, [localPlayer?.isOnWater, localPlayer?.isSnorkeling, findItemForSlot]);

  // Effect to track weapon cooldowns based on activeEquipment swingStartTimeMs - simplified
  // Now shows cooldown overlay for ALL weapons including magazine-based firearms
  // This gives visual feedback on fire rate (e.g., 1 second for pistol)
  // Skip cooldown overlay for magazine-based weapons (they use ammo bar instead)
  useEffect(() => {
    if (!activeEquipment || !playerIdentity) {
      return;
    }

    const serverSwingTime = Number(activeEquipment.swingStartTimeMs);
    
    // Only process if there was a swing
    if (serverSwingTime > 0) {
      // Find which hotbar slot contains the equipped item
      if (activeEquipment.equippedItemInstanceId) {
        const weaponInstanceId = activeEquipment.equippedItemInstanceId.toString();
        
        // Check if this is a NEW swing by comparing server timestamps
        const lastKnownServerTime = lastKnownServerWeaponCooldownTimes.get(weaponInstanceId) || 0;
        
        if (serverSwingTime !== lastKnownServerTime) {
          // NEW swing detected! Record both server time and client time
          lastKnownServerWeaponCooldownTimes.set(weaponInstanceId, serverSwingTime);
          
          for (let slotIndex = 0; slotIndex < numSlots; slotIndex++) {
            const itemInSlot = findItemForSlot(slotIndex);
            if (itemInSlot && BigInt(itemInSlot.instance.instanceId) === activeEquipment.equippedItemInstanceId) {
              
              // Show cooldown overlay for ALL weapons including magazine-based firearms
              // This gives visual feedback on fire rate cooldown (1 second for pistol, etc.)
              
              if (isWeaponWithCooldown(itemInSlot.definition)) {
                const attackIntervalMs = getWeaponCooldownDurationMs(itemInSlot.definition);
                const clientStartTime = Date.now();
                
                // Record client start time for this weapon
                clientWeaponCooldownStartTimes.set(weaponInstanceId, clientStartTime);
                
                // Clear any existing weapon cooldown
                if (weaponCooldownTimeoutRef.current) {
                  clearTimeout(weaponCooldownTimeoutRef.current);
                }
                
                // Start weapon cooldown using client time
                setIsWeaponCooldownActive(true);
                setWeaponCooldownStartTime(clientStartTime);
                setWeaponCooldownProgress(0);
                setWeaponCooldownDuration(attackIntervalMs);
                setWeaponCooldownSlot(slotIndex);
                
                // Set timeout to clear weapon cooldown when it expires
                weaponCooldownTimeoutRef.current = setTimeout(() => {
                  setIsWeaponCooldownActive(false);
                  setWeaponCooldownStartTime(null);
                  setWeaponCooldownProgress(0);
                  setWeaponCooldownSlot(null);
                }, attackIntervalMs);
                
              }
              break;
            }
          }
        } else {
          // Same server timestamp, check if we have a client-side cooldown in progress
          const weaponInstanceId = activeEquipment.equippedItemInstanceId.toString();
          const clientStartTime = clientWeaponCooldownStartTimes.get(weaponInstanceId);
          
          if (clientStartTime) {
            // Continue existing cooldown with client timing
            const elapsedTime = Date.now() - clientStartTime;
            
            // Find the weapon in hotbar to get its cooldown duration
            for (let slotIndex = 0; slotIndex < numSlots; slotIndex++) {
              const itemInSlot = findItemForSlot(slotIndex);
              if (itemInSlot && BigInt(itemInSlot.instance.instanceId) === activeEquipment.equippedItemInstanceId) {
                
                // Show cooldown overlay for ALL weapons including magazine-based firearms
                
                if (isWeaponWithCooldown(itemInSlot.definition)) {
                  const attackIntervalMs = getWeaponCooldownDurationMs(itemInSlot.definition);
                  
                  // Only continue if cooldown should still be active
                  if (elapsedTime < attackIntervalMs) {
                    setIsWeaponCooldownActive(true);
                    setWeaponCooldownStartTime(clientStartTime);
                    setWeaponCooldownProgress(elapsedTime / attackIntervalMs);
                    setWeaponCooldownDuration(attackIntervalMs);
                    setWeaponCooldownSlot(slotIndex);
                    
                    // Set timeout for remaining time
                    const remainingTime = attackIntervalMs - elapsedTime;
                    if (weaponCooldownTimeoutRef.current) {
                      clearTimeout(weaponCooldownTimeoutRef.current);
                    }
                    weaponCooldownTimeoutRef.current = setTimeout(() => {
                      setIsWeaponCooldownActive(false);
                      setWeaponCooldownStartTime(null);
                      setWeaponCooldownProgress(0);
                      setWeaponCooldownSlot(null);
                    }, remainingTime);
                  }
                }
                break;
              }
            }
          }
        }
      }
    }
  }, [activeEquipment, findItemForSlot, isWeaponWithCooldown, playerIdentity, numSlots]);

  // Weapon cooldown animation loop - simplified to match consumable system
  useEffect(() => {
    if (isWeaponCooldownActive && weaponCooldownStartTime !== null) {
      const animate = () => {
        if (weaponCooldownStartTime === null) { 
            if (weaponCooldownAnimationRef.current) cancelAnimationFrame(weaponCooldownAnimationRef.current);
            setIsWeaponCooldownActive(false);
            setWeaponCooldownProgress(0);
            return;
        }
        const elapsedTimeMs = Date.now() - weaponCooldownStartTime;
        const currentProgress = Math.min(1, elapsedTimeMs / weaponCooldownDuration); 
        setWeaponCooldownProgress(currentProgress);
        
        // console.log(`[Hotbar] Weapon cooldown progress: ${(currentProgress * 100).toFixed(1)}%`);

        if (currentProgress < 1) {
          weaponCooldownAnimationRef.current = requestAnimationFrame(animate);
        } else {
          setIsWeaponCooldownActive(false);
          setWeaponCooldownStartTime(null);
          setWeaponCooldownProgress(0);
          setWeaponCooldownSlot(null);
        }
      };
      weaponCooldownAnimationRef.current = requestAnimationFrame(animate);
    } else {
      if (weaponCooldownAnimationRef.current) {
        cancelAnimationFrame(weaponCooldownAnimationRef.current);
        weaponCooldownAnimationRef.current = null;
      }
    }

    return () => {
      if (weaponCooldownAnimationRef.current) {
        cancelAnimationFrame(weaponCooldownAnimationRef.current);
        weaponCooldownAnimationRef.current = null;
      }
    };
  }, [isWeaponCooldownActive, weaponCooldownStartTime, weaponCooldownDuration]);

  // Track reload cooldowns based on activeEquipment.reloadStartTimeMs
  // This shows an overlay when reloading magazines (makarov, KEDR, crossbow, etc.)
  // Hunting bow has 0 reload time so it doesn't show an overlay
  useEffect(() => {
    if (!activeEquipment || !playerIdentity) {
      return;
    }

    // Get reload start time from active equipment (in milliseconds)
    const serverReloadTime = Number((activeEquipment as any).reloadStartTimeMs ?? 0);
    
    // Only process if there's a reload in progress
    if (serverReloadTime > 0 && activeEquipment.equippedItemDefId) {
      // Find the item definition to get its reload time
      const itemDef = itemDefinitions.get(activeEquipment.equippedItemDefId.toString());
      if (itemDef && itemDef.category.tag === 'RangedWeapon' && rangedWeaponStats) {
        const weaponStats = rangedWeaponStats.get(itemDef.name);
        const magazineReloadTimeSecs = (weaponStats as any)?.magazineReloadTimeSecs ?? 0;
        
        // Only show overlay if weapon has a reload time > 0
        if (magazineReloadTimeSecs > 0) {
          const reloadTimeMs = magazineReloadTimeSecs * 1000;
          
          // Find which hotbar slot contains the equipped item
          if (activeEquipment.equippedItemInstanceId) {
            for (let slotIndex = 0; slotIndex < numSlots; slotIndex++) {
              const itemInSlot = findItemForSlot(slotIndex);
              if (itemInSlot && BigInt(itemInSlot.instance.instanceId) === activeEquipment.equippedItemInstanceId) {
                // Use client time for smooth animation
                const clientStartTime = Date.now();
                
                // Calculate how much time has passed since server recorded the reload
                // The server timestamp is in epoch milliseconds
                const serverNowMs = Date.now(); // Approximate server time with client time
                const elapsedSinceReload = serverNowMs - serverReloadTime;
                
                // Only show overlay if reload is still in progress
                if (elapsedSinceReload < reloadTimeMs) {
                  // Clear any existing reload cooldown
                  if (reloadCooldownTimeoutRef.current) {
                    clearTimeout(reloadCooldownTimeoutRef.current);
                  }
                  
                  // Start reload cooldown animation
                  const adjustedStartTime = clientStartTime - elapsedSinceReload;
                  setIsReloadCooldownActive(true);
                  setReloadCooldownStartTime(adjustedStartTime);
                  setReloadCooldownProgress(elapsedSinceReload / reloadTimeMs);
                  setReloadCooldownDuration(reloadTimeMs);
                  setReloadCooldownSlot(slotIndex);
                  
                  // Set timeout to clear reload cooldown when it expires
                  const remainingTime = reloadTimeMs - elapsedSinceReload;
                  reloadCooldownTimeoutRef.current = setTimeout(() => {
                    setIsReloadCooldownActive(false);
                    setReloadCooldownStartTime(null);
                    setReloadCooldownProgress(0);
                    setReloadCooldownSlot(null);
                  }, remainingTime);
                } else {
                  // Reload finished, clear overlay
                  setIsReloadCooldownActive(false);
                  setReloadCooldownStartTime(null);
                  setReloadCooldownProgress(0);
                  setReloadCooldownSlot(null);
                }
                break;
              }
            }
          }
        }
      }
    }
  }, [activeEquipment, findItemForSlot, itemDefinitions, rangedWeaponStats, playerIdentity, numSlots]);

  // Reload cooldown animation loop - similar to weapon cooldown
  useEffect(() => {
    if (isReloadCooldownActive && reloadCooldownStartTime !== null) {
      const animate = () => {
        if (reloadCooldownStartTime === null) { 
          if (reloadCooldownAnimationRef.current) cancelAnimationFrame(reloadCooldownAnimationRef.current);
          setIsReloadCooldownActive(false);
          setReloadCooldownProgress(0);
          return;
        }
        const elapsedTimeMs = Date.now() - reloadCooldownStartTime;
        const currentProgress = Math.min(1, elapsedTimeMs / reloadCooldownDuration); 
        setReloadCooldownProgress(currentProgress);
        
        if (currentProgress < 1) {
          reloadCooldownAnimationRef.current = requestAnimationFrame(animate);
        } else {
          setIsReloadCooldownActive(false);
          setReloadCooldownStartTime(null);
          setReloadCooldownProgress(0);
          setReloadCooldownSlot(null);
        }
      };
      reloadCooldownAnimationRef.current = requestAnimationFrame(animate);
    } else {
      if (reloadCooldownAnimationRef.current) {
        cancelAnimationFrame(reloadCooldownAnimationRef.current);
        reloadCooldownAnimationRef.current = null;
      }
    }

    return () => {
      if (reloadCooldownAnimationRef.current) {
        cancelAnimationFrame(reloadCooldownAnimationRef.current);
        reloadCooldownAnimationRef.current = null;
      }
    };
  }, [isReloadCooldownActive, reloadCooldownStartTime, reloadCooldownDuration]);

  // useEffect for the cooldown animation progress - MOVED AFTER findItemForSlot
  useEffect(() => {
    if (isVisualCooldownActive && visualCooldownStartTime !== null) {
      const animate = () => {
        if (visualCooldownStartTime === null) { 
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            setIsVisualCooldownActive(false);
            setAnimationProgress(0);
            return;
        }
        const elapsedTimeMs = Date.now() - visualCooldownStartTime;
        const currentProgress = Math.min(1, elapsedTimeMs / currentAnimationDuration); 
        setAnimationProgress(currentProgress);
        
        // Debug logging removed for performance

        if (currentProgress < 1) {
          animationFrameRef.current = requestAnimationFrame(animate);
        } else {
          setIsVisualCooldownActive(false);
          setVisualCooldownStartTime(null);
          setAnimationProgress(0);
          setCurrentAnimationDuration(DEFAULT_CLIENT_ANIMATION_DURATION_MS);
          setCooldownSlot(null);
        }
      };
      animationFrameRef.current = requestAnimationFrame(animate);
    } else {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isVisualCooldownActive, visualCooldownStartTime, currentAnimationDuration]); // Use stored duration instead of recalculating

  // Trigger client cooldown animation - simplified to work like other consumables
  const triggerClientCooldownAnimation = useCallback((isBandageEffect: boolean, slotToAnimate: number) => {
    console.log('[Hotbar] triggerClientCooldownAnimation called. IsBandage:', isBandageEffect, 'Animate Slot:', slotToAnimate);

    if (slotToAnimate < 0 || slotToAnimate >= numSlots) {
        console.warn("[Hotbar] Invalid slotToAnimate provided:", slotToAnimate);
        return;
    }

    // Clear existing timeouts and animation frames
    if (visualCooldownTimeoutRef.current) { clearTimeout(visualCooldownTimeoutRef.current); }
    if (animationFrameRef.current) { cancelAnimationFrame(animationFrameRef.current); }

    const itemForAnimation = findItemForSlot(slotToAnimate);
    if (!itemForAnimation) {
        console.log('[Hotbar] No item in animation slot', slotToAnimate, 'Aborting animation.');
        setIsVisualCooldownActive(false); // Ensure cooldown is not stuck if item disappears
        setCooldownSlot(null);
        return;
    }
    
    // Validate item type for the animation type
    if (isBandageEffect && itemForAnimation.definition.name !== "Bandage") {
        console.log('[Hotbar] Attempted to trigger bandage animation for non-bandage item in slot', slotToAnimate, 'Aborting. Item:', itemForAnimation.definition.name);
        return;
    }
    if (!isBandageEffect && itemForAnimation.definition.category.tag !== 'Consumable') {
        console.log('[Hotbar] Attempted to trigger consumable animation for non-consumable/non-bandage item in slot', slotToAnimate, 'Aborting. Item:', itemForAnimation.definition.name);
        return;
    }

    const timeoutDuration = isBandageEffect
                            ? BANDAGE_CLIENT_ANIMATION_DURATION_MS
                            : DEFAULT_CLIENT_ANIMATION_DURATION_MS;

    console.log('[Hotbar] Starting animation on slot:', slotToAnimate, 'Duration:', timeoutDuration, 'ms. Item:', itemForAnimation.definition.name);

    setIsVisualCooldownActive(true);
    setVisualCooldownStartTime(Date.now());
    setAnimationProgress(0);
    setCurrentAnimationDuration(timeoutDuration);
    setCooldownSlot(slotToAnimate);

    visualCooldownTimeoutRef.current = setTimeout(() => {
      console.log('[Hotbar] Animation timeout completed for slot:', slotToAnimate);
      // Only clear if this timeout is for the currently active cooldown slot
      if (cooldownSlot === slotToAnimate) {
        setIsVisualCooldownActive(false);
        setVisualCooldownStartTime(null);
        setAnimationProgress(0);
        setCurrentAnimationDuration(DEFAULT_CLIENT_ANIMATION_DURATION_MS);
        setCooldownSlot(null);
      }
    }, timeoutDuration);
  }, [numSlots, findItemForSlot, cooldownSlot]); // Added cooldownSlot to dependencies

  // Effect to clear selection when the selected slot becomes empty (e.g., after throwing a weapon)
  useEffect(() => {
    if (selectedSlot >= 0 && selectedSlot < numSlots) {
      const itemInSelectedSlot = findItemForSlot(selectedSlot);
      if (!itemInSelectedSlot) {
        // The selected slot is now empty - clear the selection
        console.log('[Hotbar] Selected slot', selectedSlot, 'is now empty, clearing selection');
        setSelectedSlot(-1);
        selectedSlotRef.current = -1;
      }
    }
  }, [selectedSlot, numSlots, findItemForSlot, inventoryItems]); // inventoryItems triggers re-check when items change

  // Effect to auto-unequip weapons when entering water
  useEffect(() => {
    if (!localPlayer || !playerIdentity || !connection?.reducers) return;

    // If player just entered water and has an active weapon equipped, unequip it
    if (localPlayer.isOnWater) {
      // Check if any weapon/ranged weapon/tool is currently selected in hotbar
      if (selectedSlot >= 0 && selectedSlot < numSlots) {
        const currentItem = findItemForSlot(selectedSlot);
        if (currentItem) {
          // Don't auto-unequip allowed items in water
    const allowedInWater = [
      'Reed Water Bottle', 
      'Plastic Water Jug',
      'Reed Harpoon', // Allow reed harpoon melee weapon to stay equipped in water
      'Reed Harpoon Gun', // Allow reed harpoon gun ranged weapon in water
      'Diving Pick', // Allow diving pick for underwater coral harvesting
      'Tidebreaker Blade' // Allow Tidebreaker Blade in water for harvesting jellyfish/shark corpses
    ];
          // Torch is only allowed in water when NOT snorkeling (can't use underwater!)
          if (!localPlayer.isSnorkeling && currentItem.definition.name === 'Torch') {
            return; // Keep torch equipped in water (but not underwater)
          }
          if (allowedInWater.includes(currentItem.definition.name)) {
            return; // Keep allowed items equipped
          }
          
          const categoryTag = currentItem.definition.category.tag;
          const isWeaponType = categoryTag === 'Weapon' || 
                              categoryTag === 'RangedWeapon' || 
                              categoryTag === 'Tool' ||
                              currentItem.definition.isEquippable;
          
          if (isWeaponType) {
            console.log('[Hotbar] Player entered water with weapon equipped. Auto-unequipping:', currentItem.definition.name);
            try {
              connection.reducers.clearActiveItemReducer(playerIdentity);
              setSelectedSlot(-1); // Clear hotbar selection
            } catch (err) {
              console.error("Error auto-unequipping weapon when entering water:", err);
            }
          }
        }
      }
    }
    
    // Also auto-unequip torch when player starts snorkeling (can't use underwater!)
    // This provides a seamless transition - the torch is unequipped and water icon appears instantly
    if (localPlayer.isSnorkeling && selectedSlot >= 0 && selectedSlot < numSlots) {
      const currentItem = findItemForSlot(selectedSlot);
      if (currentItem && currentItem.definition.name === 'Torch') {
        console.log('[Hotbar] Player started snorkeling with torch equipped. Auto-unequipping for seamless transition.');
        try {
          connection.reducers.clearActiveItemReducer(playerIdentity);
          setSelectedSlot(-1); // Clear hotbar selection
          selectedSlotRef.current = -1; // Keep ref in sync for immediate feedback
        } catch (err) {
          console.error("Error auto-unequipping torch when snorkeling:", err);
        }
      }
    }
  }, [localPlayer?.isOnWater, localPlayer?.isSnorkeling, playerIdentity, connection, selectedSlot, findItemForSlot, numSlots]);

  // Effect to watch for new bandage effects and trigger animation DURING usage
  useEffect(() => {
    if (!playerIdentity || !activeConsumableEffects) return;

    const playerHexId = playerIdentity.toHexString();
    const currentEffectIds = new Set<string>();

    // Collect current bandage effect IDs for this player
    activeConsumableEffects.forEach((effect, effectId) => {
      if (
        (effect.effectType.tag === "BandageBurst" || effect.effectType.tag === "RemoteBandageBurst") &&
        effect.playerId.toHexString() === playerHexId
      ) {
        currentEffectIds.add(effectId);
      }
    });

    // Check for new effects that weren't in the previous set
    const prevEffectIds = prevActiveEffectsRef.current;
    const newEffectIds = new Set([...currentEffectIds].filter(id => !prevEffectIds.has(id)));

      if (newEffectIds.size > 0) {
    // Find which hotbar slot contains a bandage to animate
    let bandageSlotFound = false;
    for (let slotIndex = 0; slotIndex < numSlots; slotIndex++) {
      const itemInSlot = findItemForSlot(slotIndex);
      if (itemInSlot && itemInSlot.definition.name === "Bandage") {
        // console.log('[Hotbar] New bandage effect detected! Starting 5-second animation on slot:', slotIndex);
        // Don't trigger the normal overlay for server effects, use a separate system
        setIsVisualCooldownActive(true);
        setVisualCooldownStartTime(Date.now());
        setAnimationProgress(0);
        setCurrentAnimationDuration(BANDAGE_CLIENT_ANIMATION_DURATION_MS);
        setCooldownSlot(slotIndex);
        bandageSlotFound = true;
        break; // Only animate the first bandage found
      }
    }
    if (!bandageSlotFound) {
      // console.log('[Hotbar] New bandage effect detected, but no bandage found in hotbar slots. No animation.');
    }
  }

    // Update the previous effects set
    prevActiveEffectsRef.current = currentEffectIds;
  }, [activeConsumableEffects, playerIdentity, triggerClientCooldownAnimation, findItemForSlot]);

  // Effect to stop animation when switching slots (except for consumable food items)
  useEffect(() => {
    // Stop any active animation when switching slots (but not on initial render)
    if (isVisualCooldownActive && prevSelectedSlotRef.current !== selectedSlot && cooldownSlot !== null) {
      // Check what item is in the cooldown slot to determine if we should stop the animation
      const itemInCooldownSlot = findItemForSlot(cooldownSlot);
      const shouldPersistAnimation = itemInCooldownSlot && 
        itemInCooldownSlot.definition.category.tag === 'Consumable' && 
        itemInCooldownSlot.definition.name !== 'Bandage'; // Food items persist, bandages don't
      
      if (shouldPersistAnimation) {
        // console.log('[Hotbar] Selected slot changed, but keeping consumable food animation active for slot:', cooldownSlot);
      } else {
        // console.log('[Hotbar] Selected slot changed from', prevSelectedSlotRef.current, 'to', selectedSlot, ', stopping visual cooldown animation');
        
        // Clear timeouts and animation frames
        if (visualCooldownTimeoutRef.current) {
          clearTimeout(visualCooldownTimeoutRef.current);
          visualCooldownTimeoutRef.current = null;
        }
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
        
        // Reset animation state
        setIsVisualCooldownActive(false);
        setVisualCooldownStartTime(null);
        setAnimationProgress(0);
        setCurrentAnimationDuration(DEFAULT_CLIENT_ANIMATION_DURATION_MS);
        setCooldownSlot(null);
      }
    }
    
    // Update the previous slot ref
    prevSelectedSlotRef.current = selectedSlot;
  }, [selectedSlot, isVisualCooldownActive, cooldownSlot, findItemForSlot]); // Added cooldownSlot and findItemForSlot to dependencies

  const activateHotbarSlot = useCallback((slotIndex: number, isMouseWheelScroll: boolean = false, currentSelectedSlot?: number) => {
    // Debounce: Prevent duplicate rapid calls for the same slot
    const now = Date.now();
    if (lastActivationRef.current && 
        lastActivationRef.current.slot === slotIndex && 
        now - lastActivationRef.current.timestamp < 100) { // 100ms debounce
      return; // Ignore duplicate rapid activation
    }
    lastActivationRef.current = { slot: slotIndex, timestamp: now };
    
    const itemInSlot = findItemForSlot(slotIndex);
    
    // Helper to update selection state locally
    // Note: Positive selection is handled optimistically by the caller (handleSlotClick/handleKeyDown)
    // We only need to handle Deselection (-1) here to avoid race conditions.
    const updateSelection = (newSlot: number) => {
        if (newSlot === -1) {
            setSelectedSlot(newSlot);
            selectedSlotRef.current = newSlot; // Update ref immediately
        }
    };

    // Use refs for stable values
    const connection = connectionRef.current;
    const playerIdentity = playerIdentityRef.current;
    const localPlayer = localPlayerRef.current;
    const placementInfo = placementInfoRef.current;

    if (!connection?.reducers) {
      if (!itemInSlot && playerIdentity) {
        cancelPlacement();
        try { connection?.reducers.clearActiveItemReducer(playerIdentity); } catch (err) { console.error("Error clearActiveItemReducer:", err); }
        updateSelection(-1);
      }
      return;
    }

    if (!itemInSlot) {
      if (playerIdentity) {
        cancelPlacement();
        try { connection.reducers.clearActiveItemReducer(playerIdentity); } catch (err) { console.error("Error clearActiveItemReducer:", err); }
        updateSelection(-1);
      }
      return;
    }

    const categoryTag = itemInSlot.definition.category.tag;
    const instanceId = BigInt(itemInSlot.instance.instanceId);
    const isEquippable = itemInSlot.definition.isEquippable;

    // Check if player is in water and trying to use a weapon (except allowed items)
    const isWeaponType = categoryTag === 'Weapon' || 
                        categoryTag === 'RangedWeapon' || 
                        categoryTag === 'Tool' ||
                        isEquippable;
    
    const allowedInWater = [
      'Reed Water Bottle', 
      'Plastic Water Jug',
      'Reed Harpoon', // Allow reed harpoon melee weapon to be used in water
      'Reed Harpoon Gun', // Allow reed harpoon gun ranged weapon in water
      'Diving Pick', // Allow diving pick for underwater coral harvesting
      'Tidebreaker Blade' // Allow Tidebreaker Blade in water for harvesting jellyfish/shark corpses
    ];
    
    // Check if torch is allowed (only in water, NOT when snorkeling underwater)
    const isTorchAllowedNow = itemInSlot.definition.name === 'Torch' && !localPlayer?.isSnorkeling;
    
    if (localPlayer?.isOnWater && isWeaponType && !allowedInWater.includes(itemInSlot.definition.name) && !isTorchAllowedNow) {
      console.log('[Hotbar] Cannot use weapons while in water:', itemInSlot.definition.name);
      return; // Prevent weapon activation in water (except allowed items)
    }

    console.log(`[Hotbar] Activating slot ${slotIndex}: "${itemInSlot.definition.name}" (Category: ${categoryTag}, Equippable: ${isEquippable})`);

    // Use the passed currentSelectedSlot (from before state update) to reliably detect double-click
    // Always prefer the passed value over state to avoid stale closures
    const previousSelectedSlot = currentSelectedSlot !== undefined ? currentSelectedSlot : selectedSlotRef.current;
    const isDoubleClick = previousSelectedSlot === slotIndex && !isMouseWheelScroll;
    
    // Handle Consumable category items (food, drinks, etc.)
    if (categoryTag === 'Consumable') {
      cancelPlacement();
      if (playerIdentity) {
        try { connection.reducers.clearActiveItemReducer(playerIdentity); } catch (err) { console.error("Error clearActiveItemReducer when selecting consumable:", err); }
      }
      
      // Always highlight selected consumable
      updateSelection(slotIndex);

      if (isDoubleClick) {
        // Second click/press on already selected consumable - actually consume it
        if (isVisualCooldownActive && cooldownSlot === slotIndex) {
          console.log(`[Hotbar] Consumption blocked - cooldown active for slot ${slotIndex}`);
          return; 
        }
        
        const itemDefId = itemInSlot.definition.id;
        const itemDef = itemDefinitions.get(itemDefId.toString());
        console.log(`[Hotbar] 🍽️ Attempting to consume item:`, {
          instanceId: instanceId.toString(),
          itemName: itemDef?.name || 'Unknown',
          itemDefId: itemDefId.toString(),
          category: categoryTag,
          slotIndex
        });
        
        try {
          connection.reducers.consumeItem(instanceId);
          console.log(`[Hotbar] ✅ Successfully called consumeItem reducer for instance ${instanceId.toString()}`);
          triggerClientCooldownAnimation(false, slotIndex); 
        } catch (err) { 
          console.error(`[Hotbar] ❌ Error consuming item ${instanceId.toString()}:`, err); 
        }
      }
    }
    
    // Handle Placeable items
    else if (categoryTag === 'Placeable') {
      // Special handling for seeds - keep placement active if we have more in the stack
      const isSeed = isPlantableSeed(itemInSlot.definition);
      
      // Check if we are already placing this exact item
      const isAlreadyPlacingThisItem = placementInfo && 
        placementInfo.itemName === itemInSlot.definition.name && 
        previousSelectedSlot === slotIndex;

      if (isAlreadyPlacingThisItem) {
        // Already placing this item - just keep it selected, don't toggle off
        // This prevents the "flicker" where selection alternates between -1 and slotIndex
        return;
      }
      
      // Start placement (first time selecting this placeable)
      const placementInfoData: PlacementItemInfo = {
        itemDefId: BigInt(itemInSlot.definition.id),
        itemName: itemInSlot.definition.name,
        iconAssetName: itemInSlot.definition.iconAssetName,
        instanceId: BigInt(itemInSlot.instance.instanceId)
      };
      startPlacement(placementInfoData);
      // Note: Selection is already set optimistically by the handler, no need to call updateSelection here
      
      try { 
        if (playerIdentity) connection.reducers.clearActiveItemReducer(playerIdentity); 
      } catch (err) { 
        console.error("Error clearActiveItemReducer when selecting placeable:", err); 
      }
    } 
    // Handle Weapons, Tools, and Equippables
    else if (categoryTag === 'RangedWeapon' || categoryTag === 'Tool' || categoryTag === 'Weapon' || isEquippable) {
      cancelPlacement();
      
      // Toggle Logic: Rely on LOCAL selection state for the toggle decision.
      // This prevents "Ghost Equip" bugs where a desynced server state (Server=Equipped, Local=None)
      // would prevent the user from selecting the item (because it would mistakenly trigger unequip).
      const isLocallySelected = previousSelectedSlot === slotIndex;
      const shouldUnequip = isLocallySelected && !isMouseWheelScroll;
      
      if (shouldUnequip) {
        // Unequip / Deselect
        try {
          if (playerIdentity) {
            connection.reducers.clearActiveItemReducer(playerIdentity);
            updateSelection(-1);
          }
        } catch (err) {
          console.error("Error clearActiveItemReducer on second click:", err);
        }
      } else {
        // Equip / Select
        try { 
          connection.reducers.setActiveItemReducer(instanceId); 
          updateSelection(slotIndex);
        } catch (err) { 
          console.error("Error setActiveItemReducer:", err); 
        }
      }
    } 
    // Default / Fallback
    else {
      cancelPlacement();
      try { 
        if (playerIdentity) connection.reducers.clearActiveItemReducer(playerIdentity); 
      } catch (err) { 
        console.error("Error clearActiveItemReducer:", err); 
      }
      updateSelection(-1);
    }
  }, [findItemForSlot, cancelPlacement, startPlacement, triggerClientCooldownAnimation, isVisualCooldownActive, cooldownSlot, activeEquipment]); // Removed frequently changing values - now using refs

  // Stable ref for the keyboard handler to prevent event listener churn
  const handleKeyDownRef = useRef<((event: KeyboardEvent) => void) | null>(null);
  
  handleKeyDownRef.current = (event: KeyboardEvent) => {
    const inventoryPanel = document.querySelector('.inventoryPanel');
    if (inventoryPanel) return;

    // Check if focus is on an input field - don't capture number keys when typing
    const activeElement = document.activeElement;
    const isInputFocused = activeElement && (
      activeElement.tagName === 'INPUT' ||
      activeElement.tagName === 'TEXTAREA' ||
      activeElement.tagName === 'SELECT' ||
      (activeElement as HTMLElement).isContentEditable
    );
    if (isInputFocused) return;

    // Use event.code to reliably detect number keys regardless of Shift state
    let keyNum = -1;
    if (event.code.startsWith('Digit')) {
      keyNum = parseInt(event.code.substring(5)); // "Digit1" -> 1
    } else if (event.code.startsWith('Numpad')) {
      keyNum = parseInt(event.code.substring(6)); // "Numpad1" -> 1
    }

    if (keyNum !== -1 && keyNum >= 1 && keyNum <= numSlots) {
      // Debounce keyboard events - prevent duplicate rapid key events
      const now = Date.now();
      const keyCode = event.code;
      const newSlotIndex = keyNum - 1;
      
      // Allow switching to DIFFERENT slots immediately, only debounce SAME slot
      if (lastKeyPressRef.current && 
          lastKeyPressRef.current.key === keyCode && 
          selectedSlotRef.current === newSlotIndex && // Only debounce if SAME slot
          now - lastKeyPressRef.current.timestamp < 150) { // 150ms debounce for keyboard
        event.preventDefault();
        return; // Ignore duplicate rapid key press
      }
      lastKeyPressRef.current = { key: keyCode, timestamp: now };
      
      event.preventDefault(); // Prevent default browser behavior
      
      const currentSlot = selectedSlotRef.current; // Use ref for immediate value
      
      // Optimistic update for instant feedback - client authoritative
      setSelectedSlot(newSlotIndex);
      selectedSlotRef.current = newSlotIndex; // Update ref immediately for rapid clicks
      activateHotbarSlot(newSlotIndex, false, currentSlot);
    }
  };

  // Stable event listener that never gets removed/re-added
  useEffect(() => {
    const stableHandler = (event: KeyboardEvent) => {
      handleKeyDownRef.current?.(event);
    };
    
    window.addEventListener('keydown', stableHandler);
    return () => {
      window.removeEventListener('keydown', stableHandler);
    };
  }, []); // Empty deps - listener never changes

  const handleSlotClick = (index: number) => {
      // console.log('[Hotbar] Slot clicked:', index);
      const currentSlot = selectedSlotRef.current; // Use ref for immediate value
      
      // Optimistic update for instant feedback - client authoritative
      setSelectedSlot(index);
      selectedSlotRef.current = index; // Update ref immediately for rapid clicks
      
      activateHotbarSlot(index, false, currentSlot); // Pass the current slot
  };

  const handleHotbarItemContextMenu = (event: React.MouseEvent<HTMLDivElement>, itemInfo: PopulatedItem) => {
      event.preventDefault();
      event.stopPropagation();

      if (!connection?.reducers) return;
      const itemInstanceId = BigInt(itemInfo.instance.instanceId);

      // Handle container interactions using correct reducer functions  
      if (interactingWith) {
          const containerId = Number(interactingWith.id);
          
          try {
              switch (interactingWith.type) {
                  case 'player_corpse':
                      connection.reducers.quickMoveToCorpse(containerId, itemInstanceId);
                      break;
                  case 'wooden_storage_box':
                      // Check if this is a compost box and use the appropriate reducer
                      let boxEntity: any = null;
                      try {
                          if (connection?.db) {
                              const boxTable = connection.db.woodenStorageBox;
                              boxEntity = boxTable.id.find(containerId);
                          }
                      } catch (e) {
                          // Entity lookup failed, continue without it
                      }
                      const BOX_TYPE_REFRIGERATOR = 2; // Match server constant
                      const BOX_TYPE_COMPOST = 3; // Match server constant
                      const BOX_TYPE_FISH_TRAP = 10; // Match server constant
                      if (boxEntity?.boxType === BOX_TYPE_COMPOST) {
                          connection.reducers.quickMoveToCompost(containerId, itemInstanceId);
                      } else if (boxEntity?.boxType === BOX_TYPE_REFRIGERATOR) {
                          connection.reducers.quickMoveToRefrigerator(containerId, itemInstanceId);
                      } else if (boxEntity?.boxType === BOX_TYPE_FISH_TRAP) {
                          connection.reducers.quickMoveToFishTrap(containerId, itemInstanceId);
                      } else {
                          connection.reducers.quickMoveToBox(containerId, itemInstanceId);
                      }
                      break;
                  case 'stash':
                      const currentStash = stashes.get(interactingWith.id.toString());
                      if (currentStash && !currentStash.isHidden) {
                          connection.reducers.quickMoveToStash(containerId, itemInstanceId);
                      }
                      break;
                  case 'campfire':
                      // CRITICAL: When broth pot is attached, redirect items to broth pot (not campfire fuel slots)
                      // This prevents accidentally adding ingredients/water containers as fuel
                      const campfireEntity = campfires.get(containerId.toString());
                      if (campfireEntity?.attachedBrothPotId) {
                          const attachedBrothPot = brothPots.get(campfireEntity.attachedBrothPotId.toString());
                          // Type assertion until bindings regenerated
                          const pot = attachedBrothPot as any;
                          if (attachedBrothPot) {
                              // If item is a water container AND water container slot is empty, use water slot
                              if (isWaterContainer(itemInfo.definition.name) && !pot?.waterContainerInstanceId) {
                                  try {
                                      (connection.reducers as any).quickMoveToBrothPotWaterContainer(
                                          campfireEntity.attachedBrothPotId,
                                          itemInstanceId
                                      );
                                      return; // Successfully handled
                                  } catch (e: any) {
                                      console.error(`[Hotbar CtxMenu] Error moving to water container slot:`, e);
                                      return;
                                  }
                              }
                              // Otherwise, send to broth pot ingredient slots (NOT campfire fuel!)
                              try {
                                  connection.reducers.quickMoveToBrothPot(
                                      campfireEntity.attachedBrothPotId,
                                      itemInstanceId
                                  );
                                  return; // Successfully handled
                              } catch (e: any) {
                                  console.error(`[Hotbar CtxMenu] Error moving to broth pot:`, e);
                                  return;
                              }
                          }
                      }
                      // Only send to campfire fuel slots if NO broth pot is attached
                      connection.reducers.quickMoveToCampfire(containerId, itemInstanceId);
                      break;
                  case 'furnace':
                      connection.reducers.quickMoveToFurnace(containerId, itemInstanceId);
                      break;
                  case 'barbecue':
                      connection.reducers.quickMoveToBarbecue(containerId, itemInstanceId);
                      break;
                  case 'lantern':
                      connection.reducers.quickMoveToLantern(containerId, itemInstanceId);
                      break;
                  case 'turret':
                      connection.reducers.quickMoveToTurret(containerId, itemInstanceId);
                      break;
                  case 'homestead_hearth':
                      connection.reducers.quickMoveToHearth(containerId, itemInstanceId);
                      break;
                  case 'rain_collector':
                      // Rain collectors use a different function signature with slot index
                      connection.reducers.moveItemToRainCollector(containerId, itemInstanceId, 0);
                      break;
                 case 'broth_pot':
                     connection.reducers.quickMoveToBrothPot(containerId, itemInstanceId);
                     break;
                 case 'fumarole':
                     // CRITICAL: When broth pot is attached, NEVER send items to fumarole incineration slots
                     // This prevents accidental item destruction when players want to cook
                     const fumaroleEntity = fumaroles.get(containerId.toString());
                     console.log('[Hotbar CtxMenu] Fumarole quick deposit:', {
                         containerId,
                         fumaroleEntity: fumaroleEntity ? {
                             id: fumaroleEntity.id,
                             attachedBrothPotId: fumaroleEntity.attachedBrothPotId
                         } : null,
                         itemName: itemInfo.definition.name
                     });
                     if (fumaroleEntity?.attachedBrothPotId) {
                         const attachedPot = brothPots.get(fumaroleEntity.attachedBrothPotId.toString());
                         // Type assertion until bindings regenerated
                         const pot = attachedPot as any;
                         if (attachedPot) {
                             // If item is a water container AND water container slot is empty, use water slot
                             if (isWaterContainer(itemInfo.definition.name) && !pot?.waterContainerInstanceId) {
                                 try {
                                     (connection.reducers as any).quickMoveToBrothPotWaterContainer(
                                         fumaroleEntity.attachedBrothPotId,
                                         itemInstanceId
                                     );
                                     return; // Successfully handled
                                 } catch (e: any) {
                                     console.error(`[Hotbar CtxMenu] Error moving to water container slot:`, e);
                                     return;
                                 }
                             }
                             // Otherwise, send to broth pot ingredient slots (NOT fumarole incineration!)
                             try {
                                 connection.reducers.quickMoveToBrothPot(
                                     fumaroleEntity.attachedBrothPotId,
                                     itemInstanceId
                                 );
                                 return; // Successfully handled
                             } catch (e: any) {
                                 console.error(`[Hotbar CtxMenu] Error moving to broth pot:`, e);
                                 return;
                             }
                         }
                     }
                     // Only send to fumarole incineration slots if NO broth pot is attached
                     connection.reducers.quickMoveToFumarole(containerId, itemInstanceId);
                     break;
                 default:
                     console.warn(`[Hotbar CtxMenu] Unknown interaction type: ${interactingWith.type}`);
                     break;
              }
              return; // Successfully handled container interaction
          } catch (error: any) {
              console.error(`[Hotbar CtxMenu] Error moving to ${interactingWith.type}:`, error);
              return;
          }
      }
      
      // Default actions when no container is open
      // Check if it's a water container with water content
      const isWaterContainerItem = isWaterContainer(itemInfo.definition.name);
      const hasWater = hasWaterContent(itemInfo.instance);
      
      if (isWaterContainerItem && hasWater) {
          try {
              console.log(`[Hotbar ContextMenu] Consuming water from ${itemInfo.definition.name}`);
              connection.reducers.consumeFilledWaterContainer(itemInstanceId);
          } catch (error: any) {
              console.error("[Hotbar ContextMenu] Failed to consume water container:", error);
          }
          return;
      }

      // Check if it's fertilizer (right-click to consume directly)
      if (itemInfo.definition.name === "Fertilizer" && itemInfo.instance.quantity > 0) {
          try {
              console.log(`[Hotbar ContextMenu] Consuming fertilizer from bag`);
              connection.reducers.consumeItem(itemInstanceId);
          } catch (error: any) {
              console.error("[Hotbar ContextMenu] Failed to consume fertilizer:", error);
          }
          return;
      }

      const isArmor = itemInfo.definition.category.tag === 'Armor';
      const hasEquipSlot = itemInfo.definition.equipmentSlotType !== null && itemInfo.definition.equipmentSlotType !== undefined;
      
      if (isArmor && hasEquipSlot) {
           try {
               connection.reducers.equipArmorFromInventory(itemInstanceId);
           } catch (error: any) {
               console.error("[Hotbar ContextMenu Equip] Failed to call equipArmorFromInventory reducer:", error);
          }
          return;
      }

      // Default action: Move item from hotbar to first available inventory slot
      try {
          console.log(`[Hotbar ContextMenu] Moving item ${itemInfo.definition.name} from hotbar to first available inventory slot`);
          connection.reducers.moveToFirstAvailableInventorySlot(itemInstanceId);
      } catch (error: any) {
          console.error("[Hotbar ContextMenu] Failed to move item to inventory:", error);
      }
  };

  // console.log('[Hotbar] Render: animationProgress state:', animationProgress.toFixed(3)); // Added log

  // Added handleWheel and updated useEffect for listeners
  const handleWheel = useCallback((event: WheelEvent) => {
    const inventoryPanel = document.querySelector('[data-id="inventory-panel"]'); // Use the data-id selector
    const craftingScreen = document.querySelector('[data-id="crafting-screen"]'); // Check for CraftingScreen using data-id
    
    // If inventory is open, or chat input is focused, or other UI elements that might use wheel scroll, or game menu is open, do nothing.
    const chatInputIsFocused = document.activeElement?.matches('[data-is-chat-input="true"]');
    const craftSearchIsFocused = document.activeElement?.id === 'craftSearchInput'; // Example ID
    
    // Check if mouse is over chat container to allow chat scrolling
    const target = event.target as Element;
    const chatContainer = target.closest('[data-chat-container="true"]'); // Check if we're inside a chat container
    const isOverChat = chatContainer !== null;
    
    // Check if mouse is over CraftingScreen to allow scrolling (using data-id for CSS modules compatibility)
    const isOverCraftingScreen = target.closest('[data-id="crafting-screen"]') !== null;
    
    // Check if mouse is over QuestsPanel to allow scrolling
    const isOverQuestsPanel = target.closest('[data-id="quests-panel-scroll"]') !== null;
    
    // Check if mouse is over DebugPanel to allow scrolling
    const isOverDebugPanel = target.closest('[data-id="debug-panel-scroll"]') !== null;
    
    // Check if mouse is over BoneCarvingPanel to allow scrolling
    const isOverBoneCarvingPanel = target.closest('[data-id="bone-carving-panel"]') !== null;

    if (inventoryPanel || craftingScreen || chatInputIsFocused || craftSearchIsFocused || isGameMenuOpen || isOverChat || isOverCraftingScreen || isOverQuestsPanel || isOverDebugPanel || isOverBoneCarvingPanel || event.deltaY === 0) {
      return; // Don't interfere if inventory/crafting screen/chat/search/game menu/quests panel/debug panel/bone carving panel is open, over these elements, or no vertical scroll
    }

    event.preventDefault(); // Prevent page scrolling (only if inventory is NOT open)

    setSelectedSlot(prevSlot => {
      let newSlot;
      if (event.deltaY < 0) { // Scroll up
        newSlot = (prevSlot - 1 + numSlots) % numSlots;
      } else { // Scroll down
        newSlot = (prevSlot + 1) % numSlots;
      }
      activateHotbarSlot(newSlot, true, prevSlot); // Pass true for isMouseWheelScroll and current slot
      return newSlot;
    });
  }, [numSlots, activateHotbarSlot, isGameMenuOpen]); // activateHotbarSlot is a dependency

  // Helper function to update tooltip content for a given slot
  const updateTooltipContent = useCallback((slotIndex: number, position?: { x: number; y: number }, updateRef: boolean = true) => {
    const item = findItemForSlot(slotIndex);
    if (!item) return;

    // Check if item has consumable stats (works for Consumable category AND Placeable seeds)
    let consumableStats: { health: number; thirst: number; hunger: number } | undefined = undefined;
    const health = item.definition.consumableHealthGain ?? 0;
    const thirst = item.definition.consumableThirstQuenched ?? 0;
    const hunger = item.definition.consumableHungerSatiated ?? 0;
    
    // Show stats if at least one value is non-zero (positive OR negative)
    // This includes seeds which are Placeable but have consumable stats
    if (health !== 0 || thirst !== 0 || hunger !== 0) {
      consumableStats = { health, thirst, hunger };
    }

    // Calculate water content for water containers
    let waterContentMl: number | undefined = undefined;
    let waterCapacityMl: number | undefined = undefined;
    let isSaltWaterValue: boolean | undefined = undefined;
    if (isWaterContainer(item.definition.name)) {
      const maxCapacityLiters = getWaterCapacity(item.definition.name);
      const maxCapacityMl = maxCapacityLiters * 1000; // Convert liters to mL
      waterCapacityMl = maxCapacityMl;
      
      if (hasWaterContent(item.instance)) {
        const waterLevelPercentage = getWaterLevelPercentage(item.instance, item.definition.name);
        waterContentMl = Math.round(waterLevelPercentage * maxCapacityMl);
        isSaltWaterValue = isSaltWater(item.instance);
      } else {
        waterContentMl = 0; // Empty container
        isSaltWaterValue = false;
      }
    }

    // Calculate ammo info for magazine-based ranged weapons
    let ammoLoaded: number | undefined = undefined;
    let ammoCapacity: number | undefined = undefined;
    if (item.definition.category.tag === 'RangedWeapon') {
      const weaponStats = rangedWeaponStats.get(item.definition.name);
      const magazineCapacity = weaponStats?.magazineCapacity ?? 0;
      
      if (magazineCapacity > 0) {
        ammoCapacity = magazineCapacity;
        // Check if this weapon is currently equipped
        const isEquipped = activeEquipment?.equippedItemInstanceId === BigInt(item.instance.instanceId);
        if (isEquipped) {
          // Weapon is currently equipped - read from ActiveEquipment
          ammoLoaded = (activeEquipment as any)?.loadedAmmoCount ?? 0;
        } else if (item.instance.itemData) {
          // Weapon is NOT equipped - parse loaded ammo from item_data JSON
          // Server stores: {"loaded_ammo_def_id": 123, "loaded_ammo_count": 5}
          try {
            const itemData = JSON.parse(item.instance.itemData);
            ammoLoaded = itemData.loaded_ammo_count ?? 0;
          } catch {
            // Not valid JSON or no ammo data - weapon is empty
            ammoLoaded = 0;
          }
        } else {
          ammoLoaded = 0;
        }
      }
    }

    // Calculate durability for weapons, tools, torches, food, etc.
    let durability: number | undefined = undefined;
    let maxDurability: number | undefined = undefined;
    let spoilageTimeRemaining: string | undefined = undefined;
    if (hasDurabilitySystem(item.definition)) {
      const currentDurability = getDurability(item.instance);
      const itemMaxDurability = getMaxDurability(item.instance);
      // Show durability as current value (null means full/unused)
      durability = currentDurability !== null ? Math.round(currentDurability) : Math.round(itemMaxDurability);
      maxDurability = Math.round(itemMaxDurability);
      
      // For food items, also show time remaining until spoilage
      if (isFoodItem(item.definition)) {
        spoilageTimeRemaining = formatFoodSpoilageTimeRemaining(item.instance, item.definition, connection);
      }
    }

    // Update tracking ref if requested
    if (updateRef) {
      lastTooltipItemRef.current = {
        instanceId: BigInt(item.instance.instanceId),
        waterContentMl,
        quantity: item.instance.quantity,
        isSaltWater: isSaltWaterValue
      };
    }

    setTooltip(prev => ({
      visible: true,
        content: {
          name: item.definition.name,
          quantity: item.instance.quantity,
          consumableStats,
          waterContentMl,
          waterCapacityMl,
          isSaltWater: isSaltWaterValue,
          ammoLoaded,
          ammoCapacity,
          durability,
          maxDurability,
          spoilageTimeRemaining
        },
      position: position || prev.position
    }));
  }, [findItemForSlot, rangedWeaponStats, activeEquipment, connection]);

  // Effect to update tooltip in real-time when item data changes (water content, quantity, etc.)
  useEffect(() => {
    if (tooltip.visible && hoveredSlotRef.current !== null) {
      const slotIndex = hoveredSlotRef.current;
      const item = findItemForSlot(slotIndex);
      
      if (item) {
        // Calculate current values
        let currentWaterContentMl: number | undefined = undefined;
        let currentIsSaltWater: boolean | undefined = undefined;
        if (isWaterContainer(item.definition.name)) {
          const maxCapacityLiters = getWaterCapacity(item.definition.name);
          const maxCapacityMl = maxCapacityLiters * 1000; // Convert liters to mL
          
          if (hasWaterContent(item.instance)) {
            const waterLevelPercentage = getWaterLevelPercentage(item.instance, item.definition.name);
            currentWaterContentMl = Math.round(waterLevelPercentage * maxCapacityMl);
            currentIsSaltWater = isSaltWater(item.instance);
          } else {
            currentWaterContentMl = 0; // Empty container
            currentIsSaltWater = false;
          }
        }
        
        const currentInstanceId = BigInt(item.instance.instanceId);
        const currentQuantity = item.instance.quantity;
        
        // Check if values have changed
        const lastValues = lastTooltipItemRef.current;
        const hasChanged = !lastValues ||
          lastValues.instanceId !== currentInstanceId ||
          lastValues.waterContentMl !== currentWaterContentMl ||
          lastValues.quantity !== currentQuantity ||
          lastValues.isSaltWater !== currentIsSaltWater;
        
        // Only update if values changed
        if (hasChanged) {
          updateTooltipContent(slotIndex, undefined, true);
        }
      } else {
        // Item was removed from slot, hide tooltip
        hoveredSlotRef.current = null;
        lastTooltipItemRef.current = null;
        setTooltip({
          visible: false,
          content: null,
          position: { x: 0, y: 0 }
        });
      }
    }
  }, [inventoryItems, tooltip.visible, updateTooltipContent, findItemForSlot]);

  // Tooltip handlers
  const handleSlotMouseEnter = useCallback((slotIndex: number, event: React.MouseEvent) => {
    const item = findItemForSlot(slotIndex);
    if (!item) return;

    const slotElement = event.currentTarget as HTMLElement;
    const rect = slotElement.getBoundingClientRect();
    
    // Position tooltip to the left of the slot, similar to status bar panel
    const tooltipX = rect.left - 10; // 10px gap from slot
    const tooltipY = rect.top + (rect.height / 2); // Center vertically with slot

    hoveredSlotRef.current = slotIndex;
    updateTooltipContent(slotIndex, { x: tooltipX, y: tooltipY });
  }, [findItemForSlot, updateTooltipContent]);

  const handleSlotMouseLeave = useCallback(() => {
    hoveredSlotRef.current = null;
    lastTooltipItemRef.current = null;
    setTooltip({
      visible: false,
      content: null,
      position: { x: 0, y: 0 }
    });
  }, []);

  useEffect(() => {
    window.addEventListener('wheel', handleWheel, { passive: false }); // Add wheel listener, not passive
    return () => {
      window.removeEventListener('wheel', handleWheel);
    };
  }, [handleWheel]); // Removed handleKeyDown - now using stable ref pattern above

  // Mobile-aware sizing
  const slotSize = isMobile ? MOBILE_SLOT_SIZE : SLOT_SIZE;
  const slotMargin = isMobile ? MOBILE_SLOT_MARGIN : SLOT_MARGIN;
  const hotbarBottom = isMobile ? 90 : 15; // Mobile: above controls (20px + 56px height + 14px gap), Desktop: 15px

  // Calculate overlay position for server-triggered effects
  const getSlotPosition = (slotIndex: number) => {
    const BORDER_WIDTH = 2; // Each slot has a 2px border
    const hotbarLeft = window.innerWidth / 2 - ((numSlots * (slotSize + slotMargin) - slotMargin) / 2) - slotMargin;
    const slotLeft = hotbarLeft + slotIndex * (slotSize + slotMargin) + slotMargin;
    return {
      left: slotLeft + BORDER_WIDTH, // Offset by border width
      bottom: hotbarBottom + slotMargin + BORDER_WIDTH, // Offset by border width
      width: slotSize - (BORDER_WIDTH * 2), // Reduce by border on both sides
      height: slotSize - (BORDER_WIDTH * 2), // Reduce by border on both sides
    };
  };

  // Calculate hotbar width for XP bar alignment
  const hotbarWidth = numSlots * (slotSize + slotMargin) - slotMargin + (slotMargin * 2) + 4; // slots + padding + border
  
  return (
    <>
      {/* XP Bar - Thin bar above hotbar (WoW style) */}
      {xpProgress && !isMobile && (
        <div
          style={{
            position: 'fixed',
            bottom: `${hotbarBottom + slotSize + slotMargin * 2 + 8}px`, // Position above hotbar
            left: '50%',
            transform: 'translateX(-50%)',
            width: `${hotbarWidth}px`,
            height: '20px',
            background: 'rgba(10, 5, 20, 0.9)',
            borderRadius: '4px',
            border: '1px solid rgba(0, 170, 255, 0.4)',
            boxShadow: '0 0 10px rgba(0, 0, 0, 0.5)',
            zIndex: 99,
            overflow: 'hidden',
            cursor: 'default',
            display: 'flex',
            alignItems: 'center',
          }}
          title={`Level ${xpProgress.level} - ${xpProgress.current} / ${xpProgress.needed} XP (${xpProgress.percent.toFixed(1)}%)`}
        >
          {/* XP Fill */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: `${xpProgress.percent}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #7c3aed, #a855f7)',
              boxShadow: '0 0 8px rgba(168, 85, 247, 0.6)',
              transition: 'width 0.5s ease-out',
              zIndex: 0,
            }}
          />
          {/* Level indicator on left */}
          <div
            style={{
              position: 'relative',
              left: '8px',
              fontSize: '10px',
              fontFamily: UI_FONT_FAMILY,
              color: '#ffffff',
              textShadow: '0 0 4px rgba(0, 0, 0, 0.8), 0 0 8px rgba(124, 58, 237, 0.5)',
              pointerEvents: 'none',
              zIndex: 1,
              fontWeight: 'bold',
            }}
          >
            L{xpProgress.level}
          </div>
          {/* XP text on right */}
          <div
            style={{
              position: 'absolute',
              right: '8px',
              fontSize: '9px',
              fontFamily: UI_FONT_FAMILY,
              color: 'rgba(255, 255, 255, 0.9)',
              textShadow: '0 0 4px rgba(0, 0, 0, 0.8), 0 0 8px rgba(124, 58, 237, 0.5)',
              pointerEvents: 'none',
              zIndex: 1,
            }}
          >
            {xpProgress.current} / {xpProgress.needed}
          </div>
        </div>
      )}
      
      <div style={{
        position: 'fixed',
        bottom: `${hotbarBottom}px`,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        background: UI_BG_COLOR,
        padding: `${slotMargin}px`,
        borderRadius: isMobile ? '6px' : '8px',
        border: `${isMobile ? 1 : 2}px solid ${UI_BORDER_COLOR}`,
        boxShadow: isMobile ? '0 0 15px rgba(0, 170, 255, 0.2)' : UI_SHADOW,
        fontFamily: UI_FONT_FAMILY,
        zIndex: isMobile ? 9997 : 100, // Below mobile controls and status bars
        backdropFilter: 'blur(10px)',
      }}>
      {Array.from({ length: numSlots }).map((_, index) => {
        const populatedItem = findItemForSlot(index);
        const currentSlotInfo: DragSourceSlotInfo = { type: 'hotbar', index: index };
        const isDisabledByWater = isSlotDisabledByWater(index);
        
        // Hot loot indicator for this slot
        const hotLootIndicator = getSlotIndicator?.('hotbar', index);

        return (
          <div
            key={`hotbar-wrapper-${index}`}
            onMouseEnter={isMobile ? undefined : (event) => handleSlotMouseEnter(index, event)}
            onMouseLeave={isMobile ? undefined : handleSlotMouseLeave}
          >
            <DroppableSlot
              key={`hotbar-${index}`}
              slotInfo={currentSlotInfo}
              onItemDrop={onItemDrop}
              className={undefined}
              onClick={() => handleSlotClick(index)}
              style={{
                  position: 'relative',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  width: `${slotSize}px`,
                  height: `${slotSize}px`,
                  border: `${isMobile ? 1 : 2}px solid ${index === selectedSlot ? SELECTED_BORDER_COLOR : 'rgba(0, 170, 255, 0.4)'}`,
                  background: isDisabledByWater 
                    ? 'linear-gradient(135deg, rgba(100, 150, 255, 0.2), rgba(80, 130, 200, 0.3))' 
                    : 'linear-gradient(135deg, rgba(20, 30, 60, 0.8), rgba(15, 25, 50, 0.9))',
                  borderRadius: isMobile ? '3px' : '4px',
                  marginLeft: index > 0 ? `${slotMargin}px` : '0px',
                  transition: 'all 0.2s ease',
                  boxSizing: 'border-box',
                  cursor: isDisabledByWater ? 'not-allowed' : 'pointer',
                  overflow: 'hidden',
                  opacity: isDisabledByWater ? 0.6 : 1.0,
                  boxShadow: index === selectedSlot 
                    ? (isMobile ? '0 0 10px rgba(0, 255, 255, 0.5)' : '0 0 15px rgba(0, 255, 255, 0.6), inset 0 0 20px rgba(0, 255, 255, 0.2)')
                    : 'inset 0 0 10px rgba(0, 170, 255, 0.1)',
              }}
              isDraggingOver={false}
              overlayProgress={
                (isVisualCooldownActive && cooldownSlot === index) ? animationProgress :
                undefined
              }
              overlayColor={
                (isVisualCooldownActive && cooldownSlot === index) ? 'rgba(0, 0, 0, 0.4)' :
                'rgba(0, 0, 0, 0.4)'
              }
              overlayType={
                (isVisualCooldownActive && cooldownSlot === index) ? 'consumable' :
                'consumable'
              }
              isHotLootActive={isHotLootActive && !!interactingWith && !!populatedItem}
              hotLootIndicatorProgress={hotLootIndicator?.progress}
              onHotLootHover={populatedItem && handleHotLootSlotHover ? () => handleHotLootSlotHover(populatedItem, currentSlotInfo, 'player') : undefined}
              onHotLootEnter={setHotLootCurrentHover ? () => setHotLootCurrentHover(populatedItem || null, currentSlotInfo, 'player') : undefined}
              onHotLootLeave={setHotLootCurrentHover ? () => setHotLootCurrentHover(null, null, null) : undefined}
            >
              <span
                  style={{ position: 'absolute', bottom: '2px', right: '4px', fontSize: '10px', color: 'rgba(255, 255, 255, 0.7)', userSelect: 'none', pointerEvents: 'none', zIndex: 3 }}
              >
                {index + 1}
              </span>

              {/* Fire emoji for hot combat ladle */}
              {populatedItem && isCombatLadleHot(populatedItem.instance, populatedItem.definition.name) && (
                <span
                  style={{ position: 'absolute', top: '2px', left: '4px', fontSize: '12px', zIndex: 4, pointerEvents: 'none' }}
                  title="Hot! Use gloves to avoid burn damage"
                >
                  🔥
                </span>
              )}

              {populatedItem && (
                  <DraggableItem
                      key={`draggable-${index}-${isVisualCooldownActive}-${cooldownSlot}`}
                      item={populatedItem}
                      sourceSlot={currentSlotInfo}
                      onItemDragStart={onItemDragStart}
                      onItemDrop={onItemDrop}
                      onContextMenu={(event) => handleHotbarItemContextMenu(event, populatedItem)}
                      onClick={isInventoryOpen && onSelectInventoryItem ? () => onSelectInventoryItem(populatedItem) : undefined}
                   />
              )}
              
              {/* Water level indicator for water containers */}
              {populatedItem && isWaterContainer(populatedItem.definition.name) && (() => {
                const waterLevelPercentage = getWaterLevelPercentage(populatedItem.instance, populatedItem.definition.name);
                const hasWater = waterLevelPercentage > 0;
                
                return (
                  <div
                    style={{
                      position: 'absolute',
                      left: '4px',
                      top: '4px',
                      bottom: '4px',
                      width: '3px',
                      backgroundColor: 'rgba(0, 0, 0, 0.5)',
                      borderRadius: '1px',
                      zIndex: 4,
                      pointerEvents: 'none',
                    }}
                  >
                    {hasWater && (
                      <div
                        style={{
                          position: 'absolute',
                          bottom: '0px',
                          left: '0px',
                          right: '0px',
                          height: `${waterLevelPercentage * 100}%`,
                          backgroundColor: isSaltWater(populatedItem.instance) 
                            ? 'rgba(135, 206, 250, 0.8)' // Lighter blue for salt water
                            : 'rgba(0, 150, 255, 0.8)', // Normal blue for fresh water
                          borderRadius: '1px',
                          transition: 'height 0.3s ease-in-out',
                        }}
                      />
                    )}
                  </div>
                );
              })()}
              
              {/* Ammo bar indicator for magazine-based ranged weapons (pistols, etc.) */}
              {populatedItem && populatedItem.definition.category.tag === 'RangedWeapon' && (() => {
                // Get weapon stats to check for magazine capacity
                const weaponStats = rangedWeaponStats.get(populatedItem.definition.name);
                const magazineCapacity = weaponStats?.magazineCapacity ?? 0;
                
                // Only show ammo bar for magazine-based weapons (capacity > 0)
                if (magazineCapacity === 0) return null;
                
                // Check if this weapon is currently equipped (to show loaded ammo count)
                const isEquipped = activeEquipment?.equippedItemInstanceId === BigInt(populatedItem.instance.instanceId);
                
                // Get loaded ammo count - either from ActiveEquipment (if equipped) or from item_data JSON (if not equipped)
                // This allows players to see loaded bullets on weapons that aren't currently active
                let loadedAmmoCount = 0;
                if (isEquipped) {
                  // Weapon is currently equipped - read from ActiveEquipment
                  loadedAmmoCount = (activeEquipment as any)?.loadedAmmoCount ?? 0;
                } else if (populatedItem.instance.itemData) {
                  // Weapon is NOT equipped - parse loaded ammo from item_data JSON
                  // Server stores: {"loaded_ammo_def_id": 123, "loaded_ammo_count": 5}
                  try {
                    const itemData = JSON.parse(populatedItem.instance.itemData);
                    loadedAmmoCount = itemData.loaded_ammo_count ?? 0;
                  } catch {
                    // Not valid JSON or no ammo data - weapon is empty
                    loadedAmmoCount = 0;
                  }
                }
                
                // Calculate bar dimensions
                const barHeight = SLOT_SIZE - 8; // 4px padding top and bottom
                const notchHeight = barHeight / magazineCapacity;
                
                return (
                  <div
                    style={{
                      position: 'absolute',
                      left: '3px',
                      top: '4px',
                      bottom: '4px',
                      width: '6px',
                      backgroundColor: 'rgba(0, 0, 0, 0.6)',
                      borderRadius: '2px',
                      zIndex: 4,
                      pointerEvents: 'none',
                      display: 'flex',
                      flexDirection: 'column-reverse', // Stack from bottom to top
                      padding: '1px',
                      boxSizing: 'border-box',
                      border: '1px solid rgba(255, 200, 100, 0.4)',
                    }}
                  >
                    {/* Render individual ammo notches */}
                    {Array.from({ length: magazineCapacity }).map((_, bulletIndex) => {
                      const isFilled = bulletIndex < loadedAmmoCount;
                      return (
                        <div
                          key={`ammo-${bulletIndex}`}
                          style={{
                            flex: 1,
                            marginTop: bulletIndex > 0 ? '1px' : '0px',
                            backgroundColor: isFilled 
                              ? 'rgba(255, 200, 80, 0.95)' // Brass/gold color for loaded rounds
                              : 'rgba(60, 60, 60, 0.6)', // Dark gray for empty chambers
                            borderRadius: '1px',
                            boxShadow: isFilled 
                              ? '0 0 3px rgba(255, 180, 50, 0.8)' 
                              : 'none',
                            transition: 'background-color 0.2s ease, box-shadow 0.2s ease',
                          }}
                        />
                      );
                    })}
                  </div>
                );
              })()}
              
              {/* Durability bar indicator for weapons, tools, torches, food, etc. (RIGHT side) */}
              {/* Shows current durability in green/yellow/red and lost max durability (from repairs) in red at top */}
              {/* Positioned to avoid covering the hotbar slot number in bottom-right corner */}
              {populatedItem && hasDurabilitySystem(populatedItem.definition) && (
                <DurabilityBar 
                  item={populatedItem.instance} 
                  itemDef={populatedItem.definition}
                  style={{ bottom: '14px' }} // Raised to avoid hotbar number
                />
              )}
              
              {/* Broken item overlay (weapons/tools) or Spoiled food overlay */}
              {populatedItem && hasDurabilitySystem(populatedItem.definition) && isItemBroken(populatedItem.instance) && (
                <div style={{
                  position: 'absolute',
                  top: '0px',
                  left: '0px',
                  width: '100%',
                  height: '100%',
                  backgroundColor: isFoodItem(populatedItem.definition) 
                    ? 'rgba(139, 69, 19, 0.6)' // Brownish overlay for spoiled food
                    : 'rgba(80, 80, 80, 0.6)', // Gray overlay for broken items
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  borderRadius: '2px',
                  pointerEvents: 'none',
                  zIndex: 5
                }}>
                  <span style={{
                    fontSize: '18px',
                    color: isFoodItem(populatedItem.definition)
                      ? 'rgba(255, 200, 100, 0.9)' // Yellowish for spoiled food
                      : 'rgba(255, 100, 100, 0.9)', // Red for broken items
                    textShadow: '1px 1px 2px rgba(0,0,0,0.8)',
                    userSelect: 'none'
                  }}>
                    {isFoodItem(populatedItem.definition) ? '🦠' : '✖'}
                  </span>
                </div>
              )}
              {/* Debug info for consumable cooldowns */}
              {cooldownSlot === index && (
                <div style={{
                  position: 'absolute',
                  top: '-20px',
                  left: '0px',
                  fontSize: '8px',
                  color: 'yellow',
                  pointerEvents: 'none',
                  zIndex: 10
                }}>
                  {isVisualCooldownActive ? `${Math.round(animationProgress * 100)}%` : 'inactive'}
                </div>
              )}
              {/* Debug info for weapon cooldowns */}
              {weaponCooldownSlot === index && (
                <div style={{
                  position: 'absolute',
                  top: '-35px',
                  left: '0px',
                  fontSize: '8px',
                  color: 'orange',
                  pointerEvents: 'none',
                  zIndex: 10
                }}>
                  Weapon: {isWeaponCooldownActive ? `${Math.round(weaponCooldownProgress * 100)}%` : 'inactive'}
                </div>
              )}
              
              {/* Water disabled overlay */}
              {isDisabledByWater && (
                <div style={{
                  position: 'absolute',
                  top: '0px',
                  left: '0px',
                  width: '100%',
                  height: '100%',
                  backgroundColor: 'rgba(100, 150, 255, 0.4)',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  borderRadius: '2px',
                  pointerEvents: 'none',
                  zIndex: 5
                }}>
                  <span style={{
                    fontSize: '24px',
                    color: 'rgba(255, 255, 255, 0.9)',
                    textShadow: '1px 1px 2px rgba(0,0,0,0.8)',
                    userSelect: 'none'
                  }}>
                    💧
                  </span>
                </div>
              )}
            </DroppableSlot>
          </div>
        );
      })}
      </div>
      
      {/* Separate overlay system for server-triggered effects that renders at body level */}
      {isVisualCooldownActive && cooldownSlot !== null && (() => {
        const slotPos = getSlotPosition(cooldownSlot);
        return (
          <div
            style={{
              position: 'fixed',
              left: `${slotPos.left}px`,
              bottom: `${slotPos.bottom}px`,
              width: `${slotPos.width}px`,
              height: `${slotPos.height}px`,
              zIndex: 10000, // Above everything
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: '0px',
                left: '0px',
                width: '100%',
                height: `${(1 - animationProgress) * 100}%`,
                backgroundColor: 'rgba(0, 0, 0, 0.4)',
                borderRadius: '2px',
              }}
              title={`Server Cooldown: ${Math.round((1 - animationProgress) * 100)}% remaining`}
            />
          </div>
        );
      })()}
      
      {/* Weapon cooldown overlay using the exact same system as consumables */}
      {isWeaponCooldownActive && weaponCooldownSlot !== null && (() => {
        const slotPos = getSlotPosition(weaponCooldownSlot);
        return (
          <div
            style={{
              position: 'fixed',
              left: `${slotPos.left}px`,
              bottom: `${slotPos.bottom}px`,
              width: `${slotPos.width}px`,
              height: `${slotPos.height}px`,
              zIndex: 9999, // Just below consumable cooldowns
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: '0px',
                left: '0px',
                width: '100%',
                height: `${(1 - weaponCooldownProgress) * 100}%`,
                backgroundColor: 'rgba(0, 0, 0, 0.6)',
                borderRadius: '2px',
              }}
              title={`Weapon Cooldown: ${Math.round((1 - weaponCooldownProgress) * 100)}% remaining`}
            />
          </div>
        );
      })()}
      
      {/* Reload cooldown overlay - shows when reloading magazines/nocking crossbow */}
      {isReloadCooldownActive && reloadCooldownSlot !== null && (() => {
        const slotPos = getSlotPosition(reloadCooldownSlot);
        return (
          <div
            style={{
              position: 'fixed',
              left: `${slotPos.left}px`,
              bottom: `${slotPos.bottom}px`,
              width: `${slotPos.width}px`,
              height: `${slotPos.height}px`,
              zIndex: 9998, // Below weapon cooldown so both can stack if needed
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: '0px',
                left: '0px',
                width: '100%',
                height: `${(1 - reloadCooldownProgress) * 100}%`,
                backgroundColor: 'rgba(40, 80, 120, 0.7)', // Bluish tint for reload
                borderRadius: '2px',
              }}
              title={`Reloading: ${Math.round((1 - reloadCooldownProgress) * 100)}% remaining`}
            />
          </div>
        );
      })()}
      
      {/* Tooltip */}
      {tooltip.visible && tooltip.content && createPortal(
        <div
          style={{
            position: 'fixed',
            left: `${tooltip.position.x}px`,
            top: `${tooltip.position.y}px`,
            transform: 'translate(-100%, -50%)',
            background: 'linear-gradient(135deg, rgba(30, 15, 50, 0.98), rgba(20, 10, 40, 0.99))',
            border: `2px solid ${UI_BORDER_COLOR}`,
            borderRadius: '6px',
            padding: '8px 12px',
            fontFamily: UI_FONT_FAMILY,
            fontSize: '12px',
            color: '#ffffff',
            boxShadow: '0 0 20px rgba(0, 170, 255, 0.4), inset 0 0 15px rgba(0, 170, 255, 0.1)',
            zIndex: 10001,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            backdropFilter: 'blur(10px)',
          }}
        >
          <div style={{ fontWeight: 'bold', marginBottom: '2px', color: '#00ffff', textShadow: '0 0 8px rgba(0, 255, 255, 0.6)' }}>
            {tooltip.content.name}
          </div>
          {tooltip.content.consumableStats && (
            <div style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.8)', marginBottom: '2px' }}>
              {tooltip.content.consumableStats.health !== 0 && (
                <span style={{ 
                  marginRight: '8px', 
                  color: tooltip.content.consumableStats.health > 0 ? 'rgba(100, 255, 100, 0.9)' : 'rgba(255, 100, 100, 0.9)' 
                }}>
                  ❤️ {tooltip.content.consumableStats.health > 0 ? '+' : ''}{tooltip.content.consumableStats.health}
                </span>
              )}
              {tooltip.content.consumableStats.thirst !== 0 && (
                <span style={{ 
                  marginRight: '8px', 
                  color: tooltip.content.consumableStats.thirst > 0 ? 'rgba(100, 200, 255, 0.9)' : 'rgba(255, 100, 100, 0.9)' 
                }}>
                  💧 {tooltip.content.consumableStats.thirst > 0 ? '+' : ''}{tooltip.content.consumableStats.thirst}
                </span>
              )}
              {tooltip.content.consumableStats.hunger !== 0 && (
                <span style={{ 
                  color: tooltip.content.consumableStats.hunger > 0 ? 'rgba(255, 200, 100, 0.9)' : 'rgba(255, 100, 100, 0.9)' 
                }}>
                  🍖 {tooltip.content.consumableStats.hunger > 0 ? '+' : ''}{tooltip.content.consumableStats.hunger}
                </span>
              )}
            </div>
          )}
          {tooltip.content.waterContentMl !== undefined && tooltip.content.waterCapacityMl !== undefined && (
            <div style={{ fontSize: '10px', color: 'rgba(100, 200, 255, 0.9)', marginBottom: '2px' }}>
              {tooltip.content.isSaltWater ? '🌊' : '💧'} {tooltip.content.waterContentMl} / {tooltip.content.waterCapacityMl} mL
            </div>
          )}
          {tooltip.content.ammoCapacity !== undefined && (
            <div style={{ fontSize: '10px', color: 'rgba(255, 200, 100, 0.9)', marginBottom: '2px' }}>
              🔫 Ammo: {tooltip.content.ammoLoaded ?? 0} / {tooltip.content.ammoCapacity}
            </div>
          )}
          {tooltip.content.durability !== undefined && tooltip.content.maxDurability !== undefined && (
            <div style={{ 
              fontSize: '10px', 
              color: tooltip.content.durability <= 0 
                ? 'rgba(128, 128, 128, 0.9)'  // Gray for broken/spoiled
                : tooltip.content.durability < 25 
                  ? 'rgba(255, 80, 80, 0.9)'  // Red for low
                  : tooltip.content.durability < 50 
                    ? 'rgba(255, 200, 50, 0.9)'  // Yellow for medium
                    : 'rgba(50, 205, 50, 0.9)',  // Green for good
              marginBottom: '2px' 
            }}>
              {tooltip.content.spoilageTimeRemaining ? '🍖' : '🔧'} Durability: {tooltip.content.durability} / {tooltip.content.maxDurability}
              {tooltip.content.spoilageTimeRemaining && (
                <span style={{ marginLeft: '8px', color: tooltip.content.spoilageTimeRemaining === 'Spoiled' ? 'rgba(255, 100, 100, 0.9)' : 'rgba(255, 200, 100, 0.9)' }}>
                  ({tooltip.content.spoilageTimeRemaining})
                </span>
              )}
            </div>
          )}
          <div style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.7)' }}>
            Quantity: {tooltip.content.quantity}
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default React.memo(Hotbar);