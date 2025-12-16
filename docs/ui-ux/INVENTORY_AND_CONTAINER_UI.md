# Inventory and Container UI System

This document describes the inventory, hotbar, and container UI systems used in the client.

## Overview

The player UI system (`PlayerUI.tsx`) manages all inventory-related interfaces:
- **Main Inventory** - Player's personal storage (18 slots)
- **Hotbar** - Quick-access slots (6 slots)
- **Container Panels** - Context-sensitive panels for interacting with world containers

## Core Components

### PlayerUI.tsx

The main orchestrator component (~1500 lines) that:
- Tracks local player state and inventory
- Manages drag-and-drop operations
- Shows/hides container panels based on interaction state
- Handles item notifications (acquisition toasts)
- Coordinates with crafting screens

```typescript
interface PlayerUIProps {
  identity: Identity | null;
  players: Map<string, Player>;
  inventoryItems: Map<string, InventoryItem>;
  itemDefinitions: Map<string, ItemDefinition>;
  connection: DbConnection | null;
  onItemDragStart: (info: DraggedItemInfo) => void;
  onItemDrop: (targetSlotInfo: DragSourceSlotInfo | null) => void;
  draggedItemInfo: DraggedItemInfo | null;
  // ... container maps, interaction state, etc.
}
```

### InventoryUI.tsx

Renders the main inventory grid:
- 18 slots in a 6x3 grid
- Supports drag-and-drop
- Shows item icons, quantities, durability
- Context menu for item actions

### Hotbar.tsx

The quick-access toolbar:
- 6 numbered slots (1-6)
- Visual selection indicator for equipped item
- Keyboard shortcuts (1-6) to select
- Can hold any item (not just tools)

## Drag and Drop System

### Types (`dragDropTypes.ts`)

```typescript
// Identifies where an item is dragged from/to
interface DragSourceSlotInfo {
  location: 'inventory' | 'hotbar' | 'equipment' | 'container';
  slotIndex: number;
  containerType?: string;  // 'campfire', 'storage_box', etc.
  containerId?: number;
}

// Full info about the dragged item
interface DraggedItemInfo {
  sourceSlotInfo: DragSourceSlotInfo;
  itemDefId: number;
  quantity: number;
  instanceId: number;
}
```

### Drag Flow

1. **Start**: User clicks an item slot → `onItemDragStart(info)` called
2. **Visual**: Ghost image follows cursor, original slot shows "dragging" state
3. **Hover**: Valid drop targets highlight, invalid targets show X
4. **Drop**: User releases → `onItemDrop(targetSlotInfo)` called
5. **Server**: Appropriate reducer called (move_item, swap_item, transfer_to_container, etc.)

## Container Interaction System

### Interaction State

The `InteractionTarget` type tracks what container the player is interacting with:

```typescript
type InteractionTarget = {
  type: 'none' | 'campfire' | 'furnace' | 'storage_box' | 'corpse' | 
        'stash' | 'rain_collector' | 'broth_pot' | 'hearth' | ...;
  id?: number;
} | null;
```

### Container Panels

Each container type has a dedicated panel component:

| Container | Panel Component | Features |
|-----------|-----------------|----------|
| Campfire | `CampfirePanel` | Fuel slot, 4 cooking slots, fuel timer |
| Furnace | `FurnacePanel` | Fuel slot, smelting slots, progress bars |
| Barbecue | `BarbecuePanel` | Fuel slot, cooking slots |
| Storage Box | `StorageBoxPanel` | 8 general storage slots |
| Corpse | `CorpsePanel` | Loot dead player's inventory |
| Stash | `StashPanel` | Hidden storage near spawn |
| Rain Collector | `RainCollectorPanel` | Water container slot, collection status |
| Broth Pot | `BrothPotPanel` | Ingredients, water level, cooking state |

### Panel Rendering Logic

```tsx
// In PlayerUI.tsx - conditional panel rendering
{interactingWith?.type === 'campfire' && (
  <CampfirePanel
    campfire={campfires.get(interactingWith.id?.toString())}
    inventoryItems={inventoryItems}
    itemDefinitions={itemDefinitions}
    onItemDragStart={onItemDragStart}
    onItemDrop={handleContainerDrop}
    onClose={() => onSetInteractingWith(null)}
  />
)}
```

## Slot Rendering

### PopulatedItem Type

```typescript
interface PopulatedItem {
  instanceId: number;
  defId: number;
  name: string;
  iconAssetName: string;
  quantity: number;
  isStackable: boolean;
  itemData?: string;  // JSON for water content, durability, etc.
}
```

### Slot Component Pattern

```tsx
const InventorySlot: React.FC<SlotProps> = ({
  slot,
  index,
  isDragging,
  isDropTarget,
  onDragStart,
  onDrop,
}) => {
  return (
    <div
      className={`slot ${isDragging ? 'dragging' : ''} ${isDropTarget ? 'drop-target' : ''}`}
      draggable={!!slot.item}
      onDragStart={() => slot.item && onDragStart(slot.item, index)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={() => onDrop(index)}
    >
      {slot.item && (
        <>
          <img src={getItemIcon(slot.item.iconAssetName)} alt={slot.item.name} />
          {slot.item.quantity > 1 && (
            <span className="quantity">{slot.item.quantity}</span>
          )}
        </>
      )}
    </div>
  );
};
```

## Hot Loot System

Quick item transfer without drag-and-drop using the H key:

### useHotLoot Hook

```typescript
const { isHotLootActive, handleSlotHover } = useHotLoot({
  connection,
  playerIdentity: identity,
  interactingWith,
  // Container maps for smart routing
  woodenStorageBoxes,
  campfires,
  brothPots,
});
```

### Behavior

- **Hold H + Click**: Instantly moves item to appropriate container
- **Smart Routing**: Items go to logical destinations (fuel to campfire fuel slot, food to cooking slots)
- **Visual Feedback**: Slots highlight when hot loot is active

## Status Effects Panel

Shows active effects (buffs/debuffs) on the player:

```tsx
<StatusEffectsPanel
  activeEffects={activeConsumableEffects}
  playerIdentity={identity}
  itemDefinitions={itemDefinitions}
/>
```

Effect icons show:
- Duration remaining (countdown)
- Effect type (heal, poison, burn, etc.)
- Source item name on hover

## Notifications System

### Item Acquisition Toasts

When items are added to inventory:

```typescript
const [acquisitionNotifications, setAcquisitionNotifications] = useState<NotificationItem[]>([]);

// Tracked via inventory change detection
useEffect(() => {
  const newItems = detectNewItems(prevInventory, inventoryItems);
  if (newItems.length > 0) {
    addNotifications(newItems);
  }
}, [inventoryItems]);
```

### NotificationItem Type

```typescript
interface NotificationItem {
  id: string;
  itemName: string;
  quantity: number;
  iconAssetName: string;
  timestamp: number;
  isFading: boolean;
}
```

## Mobile Responsiveness

The UI adapts for mobile:

```typescript
interface PlayerUIProps {
  isMobile?: boolean;  // Passed from parent
}

// Conditional mobile layouts
{isMobile ? (
  <MobileInventoryLayout ... />
) : (
  <DesktopInventoryLayout ... />
)}
```

Mobile adaptations:
- Larger touch targets
- Tap instead of drag-and-drop
- Simplified container panels
- Collapsed status bars

## Reducers Used

| Action | Reducer |
|--------|---------|
| Move within inventory | `move_inventory_item` |
| Hotbar → Inventory | `move_hotbar_to_inventory` |
| Inventory → Hotbar | `move_inventory_to_hotbar` |
| To Container | `transfer_item_to_container` |
| From Container | `transfer_item_from_container` |
| Drop to World | `drop_item` |
| Use/Consume | `use_item` |
| Equip | `equip_item` |
| Unequip | `unequip_item` |

## Best Practices

### Adding New Container UI

1. Create panel component in `client/src/components/`
2. Add container type to `InteractionTarget`
3. Add conditional render in `PlayerUI.tsx`
4. Handle drag-drop with appropriate reducers
5. Add to `useHotLoot` if smart routing needed

### Performance Considerations

- Use `useMemo` for filtered item lists
- Memoize slot components with `React.memo`
- Batch state updates for notifications
- Avoid re-renders during drag operations

