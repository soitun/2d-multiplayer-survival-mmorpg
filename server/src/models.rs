use spacetimedb::{SpacetimeType, Identity, Timestamp};
use serde::{Serialize, Deserialize};

/// Enum to differentiate between various types of world containers.
#[derive(SpacetimeType, Serialize, Deserialize, Copy, Clone, Debug, PartialEq)]
pub enum ContainerType {
    Campfire,
    Furnace,
    Fumarole,
    WoodenStorageBox,
    PlayerCorpse,
    Stash,
    Lantern,
    RainCollector,
    HomesteadHearth,
    BrothPot,
    Barbecue,
    // Other container types can be added here
}

/// Enum to differentiate between various types of equipment slots.
#[derive(SpacetimeType, Serialize, Deserialize, Copy, Clone, Debug, PartialEq)]
pub enum EquipmentSlotType {
    Head,
    Chest,
    Legs,
    Feet,
    Hands,
    Back,
    // Removed MainHand as it's handled by ActiveEquipment.equipped_item_instance_id
}

// --- Data structs for ItemLocation variants ---

#[derive(SpacetimeType, Clone, Debug, PartialEq)] // No Serialize/Deserialize due to Identity
pub struct InventoryLocationData {
    pub owner_id: Identity,
    pub slot_index: u16,
}

#[derive(SpacetimeType, Clone, Debug, PartialEq)] // No Serialize/Deserialize due to Identity
pub struct HotbarLocationData {
    pub owner_id: Identity,
    pub slot_index: u8,
}

#[derive(SpacetimeType, Clone, Debug, PartialEq)] // No Serialize/Deserialize due to Identity
pub struct EquippedLocationData {
    pub owner_id: Identity,
    pub slot_type: EquipmentSlotType, // EquipmentSlotType is SType, S, D
}

#[derive(SpacetimeType, Clone, Debug, PartialEq)] // ContainerType is SType, S, D
pub struct ContainerLocationData {
    pub container_type: ContainerType,
    pub container_id: u64, // Keep as u64, matches WoodenStorageBox and Campfire container_id methods
    pub slot_index: u8,
}

#[derive(SpacetimeType, Clone, Debug, PartialEq)] // Basic types, SType ok
pub struct DroppedLocationData {
    pub pos_x: f32,
    pub pos_y: f32,
}

/// Represents the specific location of an InventoryItem.
#[derive(SpacetimeType, Clone, Debug, PartialEq)] // No Serialize/Deserialize here
pub enum ItemLocation {
    Inventory(InventoryLocationData),
    Hotbar(HotbarLocationData),
    Equipped(EquippedLocationData),
    Container(ContainerLocationData),
    Dropped(DroppedLocationData),
    Unknown, // Represents an undefined or invalid location
}

// Helper methods for ItemLocation (optional, but can be useful)
impl ItemLocation {
    pub fn is_player_bound(&self) -> Option<Identity> {
        match self {
            ItemLocation::Inventory(data) => Some(data.owner_id),
            ItemLocation::Hotbar(data) => Some(data.owner_id),
            ItemLocation::Equipped(data) => Some(data.owner_id),
            _ => None,
        }
    }

    pub fn is_container_bound(&self) -> Option<(ContainerType, u64)> {
        match self {
            ItemLocation::Container(data) => Some((data.container_type.clone(), data.container_id)),
            _ => None,
        }
    }
}

// Add the TargetType enum here
#[derive(Debug, Clone, Copy, PartialEq, SpacetimeType, serde::Serialize, serde::Deserialize)]
pub enum TargetType {
    Tree,
    Stone,
    Player,
    Campfire,
    Furnace,
    Fumarole,
    Lantern,
    WoodenStorageBox,
    Stash,
    SleepingBag,
    Animal, // Added for animal targets
    PlayerCorpse,
    AnimalCorpse, // ADDED: Animal corpse target type
    // REMOVED: Grass - grass collision detection removed for performance
    Shelter, // ADDED Shelter TargetType
    RainCollector, // ADDED RainCollector TargetType
    Barrel, // ADDED Barrel TargetType
    Foundation, // ADDED: Building foundation target type
    Wall, // ADDED: Building wall target type
    Door, // ADDED: Building door target type
    HomesteadHearth, // ADDED: Homestead Hearth target type
    LivingCoral, // ADDED: Living coral underwater resource
}

// Building system enums
#[derive(SpacetimeType, Clone, Copy, Debug, PartialEq)]
#[repr(u8)]
pub enum FoundationShape {
    Empty = 0,
    Full = 1,
    TriNW = 2,  // Triangle pointing NW
    TriNE = 3,  // Triangle pointing NE
    TriSE = 4,  // Triangle pointing SE
    TriSW = 5,  // Triangle pointing SW
}

#[derive(SpacetimeType, Clone, Copy, Debug, PartialEq, Eq, Hash)]
#[repr(u8)]
pub enum BuildingEdge {
    N = 0,      // North (top)
    E = 1,      // East (right)
    S = 2,      // South (bottom)
    W = 3,      // West (left)
    DiagNE_SW = 4,  // Diagonal NE-SW (only for triangles)
    DiagNW_SE = 5,  // Diagonal NW-SE (only for triangles)
}

#[derive(SpacetimeType, Clone, Copy, Debug, PartialEq)]
#[repr(u8)]
pub enum BuildingFacing {
    Interior = 0,
    Exterior = 1,
}

#[derive(SpacetimeType, Clone, Copy, Debug, PartialEq)]
#[repr(u8)]
pub enum BuildingTier {
    Twig = 0,
    Wood = 1,
    Stone = 2,
    Metal = 3,
}

/// Enum to represent different types of damage for combat calculations
#[derive(SpacetimeType, Serialize, Deserialize, Copy, Clone, Debug, PartialEq)]
pub enum DamageType {
    Melee,        // General melee damage
    Projectile,   // Arrows, thrown weapons
    Fire,         // Fire-based damage
    Blunt,        // Clubs, hammers
    Slash,        // Swords, axes
    Pierce,       // Spears, arrows
    Environmental, // Cold, poison, etc.
}

/// Enum to represent different types of armor immunities
#[derive(SpacetimeType, Serialize, Deserialize, Copy, Clone, Debug, PartialEq)]
pub enum ImmunityType {
    Burn,      // Immunity to fire/burn damage
    Cold,      // Immunity to cold damage
    Wetness,   // Immunity to rain/water effects
    Knockback, // Immunity to knockback effects
    Bleed,     // Immunity to bleed effects
}

/// Enum to differentiate between ammunition types for weapon compatibility
#[derive(SpacetimeType, Serialize, Deserialize, Copy, Clone, Debug, PartialEq)]
pub enum AmmoType {
    Arrow,     // Arrows for bows and crossbows
    Bullet,    // Bullets for pistols and firearms
}

/// Struct containing all armor resistance values for different damage types
#[derive(SpacetimeType, Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct ArmorResistances {
    pub melee_resistance: f32,      // 0.0 to 1.0 (0% to 100%)
    pub projectile_resistance: f32,
    pub fire_resistance: f32,       // Can be negative for vulnerability
    pub blunt_resistance: f32,
    pub slash_resistance: f32,
    pub pierce_resistance: f32,
    pub cold_resistance: f32,
}

impl ArmorResistances {
    /// Creates a new ArmorResistances with all values set to zero
    pub fn zero() -> Self {
        Self {
            melee_resistance: 0.0,
            projectile_resistance: 0.0,
            fire_resistance: 0.0,
            blunt_resistance: 0.0,
            slash_resistance: 0.0,
            pierce_resistance: 0.0,
            cold_resistance: 0.0,
        }
    }
    
    /// Creates a new ArmorResistances with uniform values across all types
    pub fn uniform(value: f32) -> Self {
        Self {
            melee_resistance: value,
            projectile_resistance: value,
            fire_resistance: value,
            blunt_resistance: value,
            slash_resistance: value,
            pierce_resistance: value,
            cold_resistance: value,
        }
    }
}

// Enum to represent the type of an active consumable effect
// ... existing code ...