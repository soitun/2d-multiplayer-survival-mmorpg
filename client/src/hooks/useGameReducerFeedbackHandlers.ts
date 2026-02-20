/**
 * useGameReducerFeedbackHandlers - Registers SpacetimeDB reducer callbacks for error/success feedback.
 * Handles consumeItem, applyFertilizer, destroy, placement, pickup, doors, cairns, milking, fishing, upgrade.
 */

import { useEffect } from 'react';
import { logReducer, trimErrorForDisplay } from '../utils/gameDebugUtils';

type Connection = { reducers: Record<string, (...args: any[]) => void> } | null;

export interface UseGameReducerFeedbackHandlersParams {
  connection: Connection;
  showError: (msg: string) => void;
  playImmediateSound: (soundType: string, volume?: number) => void;
  isAnySovaAudioPlaying: () => boolean;
}

type ReducerBinding = { on: string; off: string; handler: (...args: any[]) => void };

function registerReducerBindings(connection: NonNullable<Connection>, bindings: ReducerBinding[]) {
  const reducers = connection.reducers;
  for (const binding of bindings) {
    const fn = (reducers as any)[binding.on];
    if (typeof fn === 'function') fn.call(reducers, binding.handler);
  }
}

function unregisterReducerBindings(connection: NonNullable<Connection>, bindings: ReducerBinding[]) {
  const reducers = connection.reducers;
  for (const binding of bindings) {
    const fn = (reducers as any)[binding.off];
    if (typeof fn === 'function') fn.call(reducers, binding.handler);
  }
}

export function useGameReducerFeedbackHandlers({
  connection,
  showError,
  playImmediateSound,
  isAnySovaAudioPlaying,
}: UseGameReducerFeedbackHandlersParams) {
  useEffect(() => {
    if (!connection) return;

    const handleConsumeItemResult = (ctx: any, itemInstanceId: bigint) => {
      logReducer('GameCanvas', 'consumeItem callback', itemInstanceId.toString(), ctx.event?.status);
      if (ctx.event?.status?.tag === 'Failed') {
        const errorMsg = ctx.event.status.value || 'Unknown error';
        if (errorMsg === 'BREW_COOLDOWN') {
          if (isAnySovaAudioPlaying()) {
            showError('Brew cooldown active.');
          } else {
            const brewCooldownSounds = [
              '/sounds/sova_brew_cooldown.mp3',
              '/sounds/sova_brew_cooldown1.mp3',
              '/sounds/sova_brew_cooldown2.mp3',
              '/sounds/sova_brew_cooldown3.mp3',
            ];
            const randomSound = brewCooldownSounds[Math.floor(Math.random() * brewCooldownSounds.length)];
            try {
              const audio = new Audio(randomSound);
              audio.volume = 0.7;
              audio.play().catch(() => {});
            } catch {
              // Ignore
            }
          }
        } else {
          showError(trimErrorForDisplay(errorMsg));
        }
      }
    };

    const handleApplyFertilizerResult = (ctx: any, fertilizerInstanceId: bigint) => {
      logReducer('GameCanvas', 'applyFertilizer callback', fertilizerInstanceId.toString(), ctx.event?.status);
      if (ctx.event?.status?.tag === 'Failed') {
        showError(trimErrorForDisplay(ctx.event.status.value || 'Unknown error'));
      }
    };

    const handleDestroyFoundationResult = (ctx: any, foundationId: bigint) => {
      logReducer('GameCanvas', 'destroyFoundation', ctx.event?.status);
      if (ctx.event?.status?.tag === 'Failed') {
        showError(trimErrorForDisplay(ctx.event.status.value || 'Failed to destroy foundation'));
      }
    };

    const handleDestroyWallResult = (ctx: any, wallId: bigint) => {
      logReducer('GameCanvas', 'destroyWall', ctx.event?.status);
      if (ctx.event?.status?.tag === 'Failed') {
        showError(trimErrorForDisplay(ctx.event.status.value || 'Failed to destroy wall'));
      }
    };

    const handleFireProjectileResult = () => {
      // Sync issue - suppress sound, no user-facing error
    };

    const handleLoadRangedWeaponResult = (ctx: any) => {
      if (ctx.event?.status?.tag === 'Failed') {
        const errorMsg = ctx.event.status.value || '';
        if (errorMsg.includes('need at least 1 arrow')) {
          playImmediateSound('error_arrows', 1.0);
        }
        showError(errorMsg || 'Failed to load weapon');
      }
    };

    const handleUpgradeFoundationResult = (ctx: any, _foundationId: bigint, _newTier: number) => {
      if (ctx.event?.status?.tag === 'Failed') {
        const errorMsg = ctx.event.status.value || '';
        if (errorMsg.includes('Building privilege') || errorMsg.includes('building privilege')) {
          playImmediateSound('error_building_privilege', 1.0);
        } else if (errorMsg.includes('Cannot downgrade') || errorMsg.includes('Current tier') || errorMsg.includes('Target tier')) {
          playImmediateSound('error_tier_upgrade', 1.0);
        } else if (errorMsg.includes('Not enough') || errorMsg.includes('wood') || errorMsg.includes('stone') || errorMsg.includes('metal fragments') || errorMsg.includes('Required:')) {
          playImmediateSound('error_resources', 1.0);
        }
        showError(trimErrorForDisplay(errorMsg));
      }
    };

    const handlePlacementError = (ctx: any, itemName: string) => {
      const status = ctx.event?.status;
      const isFailed = status?.tag === 'Failed' || (status && typeof status === 'object' && 'Failed' in status);
      if (isFailed) {
        let errorMsg =
          (status?.tag === 'Failed' && status?.value) ||
          status?.Failed ||
          ctx.event?.message ||
          `${itemName} placement failed`;
        if (typeof errorMsg !== 'string') errorMsg = String(errorMsg);
        playImmediateSound('error_placement_failed', 1.0);
        showError(trimErrorForDisplay(errorMsg));
      }
    };

    const createPlacementHandler = (itemName: string) =>
      (_ctx: any, _itemInstanceId: bigint, _worldX: number, _worldY: number) =>
        handlePlacementError(_ctx, itemName);

    const PLACEMENT_BINDINGS: { on: string; off: string; label: string }[] = [
      { on: 'onPlaceCampfire', off: 'removeOnPlaceCampfire', label: 'Campfire' },
      { on: 'onPlaceFurnace', off: 'removeOnPlaceFurnace', label: 'Furnace' },
      { on: 'onPlaceLantern', off: 'removeOnPlaceLantern', label: 'Lantern' },
      { on: 'onPlaceWoodenStorageBox', off: 'removeOnPlaceWoodenStorageBox', label: 'Wooden Storage Box' },
      { on: 'onPlaceSleepingBag', off: 'removeOnPlaceSleepingBag', label: 'Sleeping Bag' },
      { on: 'onPlaceStash', off: 'removeOnPlaceStash', label: 'Stash' },
      { on: 'onPlaceShelter', off: 'removeOnPlaceShelter', label: 'Shelter' },
      { on: 'onPlaceRainCollector', off: 'removeOnPlaceRainCollector', label: 'Rain Collector' },
      { on: 'onPlaceHomesteadHearth', off: 'removeOnPlaceHomesteadHearth', label: "Matron's Chest" },
      { on: 'onPlaceBarbecue', off: 'removeOnPlaceBarbecue', label: 'Barbecue' },
      { on: 'onPlaceTurret', off: 'removeOnPlaceTurret', label: 'Turret' },
      { on: 'onPlaceExplosive', off: 'removeOnPlaceExplosive', label: 'Explosive' },
    ];

    const handleUpgradeWallResult = (ctx: any, _wallId: bigint, _newTier: number) => {
      logReducer('GameCanvas', 'upgradeWall', ctx.event?.status);
      if (ctx.event?.status?.tag === 'Failed') {
        const errorMsg = ctx.event.status.value || 'Failed to upgrade wall';
        if (errorMsg.includes('Building privilege') || errorMsg.includes('building privilege')) {
          playImmediateSound('error_building_privilege', 1.0);
        } else if (errorMsg.includes('Cannot downgrade') || errorMsg.includes('Current tier') || errorMsg.includes('Target tier')) {
          playImmediateSound('error_tier_upgrade', 1.0);
        } else if (errorMsg.includes('Not enough') || errorMsg.includes('wood') || errorMsg.includes('stone') || errorMsg.includes('metal fragments') || errorMsg.includes('Required:')) {
          playImmediateSound('error_resources', 1.0);
        }
        showError(trimErrorForDisplay(errorMsg));
      }
    };

    const requiredBindings: ReducerBinding[] = [
      { on: 'onConsumeItem', off: 'removeOnConsumeItem', handler: handleConsumeItemResult },
      { on: 'onApplyFertilizer', off: 'removeOnApplyFertilizer', handler: handleApplyFertilizerResult },
      { on: 'onDestroyFoundation', off: 'removeOnDestroyFoundation', handler: handleDestroyFoundationResult },
      { on: 'onDestroyWall', off: 'removeOnDestroyWall', handler: handleDestroyWallResult },
      { on: 'onFireProjectile', off: 'removeOnFireProjectile', handler: handleFireProjectileResult },
      { on: 'onLoadRangedWeapon', off: 'removeOnLoadRangedWeapon', handler: handleLoadRangedWeaponResult },
      { on: 'onUpgradeFoundation', off: 'removeOnUpgradeFoundation', handler: handleUpgradeFoundationResult },
      { on: 'onUpgradeWall', off: 'removeOnUpgradeWall', handler: handleUpgradeWallResult },
      ...PLACEMENT_BINDINGS.map(({ on, off, label }) => ({ on, off, handler: createPlacementHandler(label) })),
    ];
    registerReducerBindings(connection, requiredBindings);

    const handlePickupDroppedItemResult = (ctx: any) => {
      if (ctx.event?.status?.tag === 'Failed') {
        const errorMsg = ctx.event.status.value || 'Cannot pick up item';
        if (errorMsg.toLowerCase().includes('too far') || errorMsg.toLowerCase().includes('not found')) return;
        showError(trimErrorForDisplay(errorMsg));
      }
    };
    const handleInteractDoorResult = (ctx: any) => {
      if (ctx.event?.status?.tag === 'Failed') {
        const errorMsg = ctx.event.status.value || 'Cannot interact with door';
        if (errorMsg.toLowerCase().includes('too far')) return;
        showError(trimErrorForDisplay(errorMsg));
      }
    };
    const handleInteractWithCairnResult = (ctx: any) => {
      if (ctx.event?.status?.tag === 'Failed') {
        const errorMsg = ctx.event.status.value || 'Cannot interact with cairn';
        if (errorMsg.toLowerCase().includes('too far')) return;
        showError(trimErrorForDisplay(errorMsg));
      }
    };
    const handleMilkAnimalResult = (ctx: any) => {
      if (ctx.event?.status?.tag === 'Failed') {
        const errorMsg = ctx.event.status.value || 'Cannot milk animal';
        if (errorMsg.toLowerCase().includes('too far')) return;
        showError(trimErrorForDisplay(errorMsg));
      }
    };
    const handleCastFishingLineResult = (ctx: any) => {
      if (ctx.event?.status?.tag === 'Failed') {
        const errorMsg = ctx.event.status.value || 'Cannot cast fishing line';
        if (errorMsg.toLowerCase().includes('too far')) return;
        showError(trimErrorForDisplay(errorMsg));
      }
    };
    const handleFinishFishingResult = (ctx: any) => {
      if (ctx.event?.status?.tag === 'Failed') {
        const errorMsg = ctx.event.status.value || 'Fishing failed';
        if (errorMsg.toLowerCase().includes('no active') || errorMsg.toLowerCase().includes('session is not active')) return;
        showError(trimErrorForDisplay(errorMsg));
      }
    };

    const handleRespawnRandomlyResult = (ctx: any) => {
      if (ctx.event?.status?.tag === 'Failed') {
        showError(trimErrorForDisplay(ctx.event.status.value || 'Respawn failed'));
      }
    };

    const handleRespawnAtBagResult = (ctx: any, _bagId: number) => {
      if (ctx.event?.status?.tag === 'Failed') {
        showError(trimErrorForDisplay(ctx.event.status.value || 'Respawn at sleeping bag failed'));
      }
    };

    const optionalBindings: ReducerBinding[] = [
      { on: 'onPickupDroppedItem', off: 'removeOnPickupDroppedItem', handler: handlePickupDroppedItemResult },
      { on: 'onInteractDoor', off: 'removeOnInteractDoor', handler: handleInteractDoorResult },
      { on: 'onInteractWithCairn', off: 'removeOnInteractWithCairn', handler: handleInteractWithCairnResult },
      { on: 'onMilkAnimal', off: 'removeOnMilkAnimal', handler: handleMilkAnimalResult },
      { on: 'onCastFishingLine', off: 'removeOnCastFishingLine', handler: handleCastFishingLineResult },
      { on: 'onFinishFishing', off: 'removeOnFinishFishing', handler: handleFinishFishingResult },
      { on: 'onRespawnRandomly', off: 'removeOnRespawnRandomly', handler: handleRespawnRandomlyResult },
      { on: 'onRespawnAtSleepingBag', off: 'removeOnRespawnAtSleepingBag', handler: handleRespawnAtBagResult },
    ];
    for (const binding of optionalBindings) {
      const onFn = (connection.reducers as any)[binding.on];
      if (typeof onFn === 'function') onFn.call(connection.reducers, binding.handler);
    }

    return () => {
      unregisterReducerBindings(connection, requiredBindings);
      for (const binding of optionalBindings) {
        const offFn = (connection.reducers as any)[binding.off];
        if (typeof offFn === 'function') offFn.call(connection.reducers, binding.handler);
      }
    };
  }, [connection, showError, playImmediateSound, isAnySovaAudioPlaying]);
}
