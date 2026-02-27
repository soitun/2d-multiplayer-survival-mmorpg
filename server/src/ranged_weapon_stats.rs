use spacetimedb::{table, SpacetimeType, Timestamp};

// #[derive(SpacetimeType, Clone, Debug)] // Remove this if #[table] is used, or ensure SpacetimeType is not re-derived
#[table(accessor = ranged_weapon_stats, public)] // Use identifier, not string
#[derive(Clone, Debug)] // Keep Clone and Debug, SpacetimeType is handled by #[table]
pub struct RangedWeaponStats {
    #[primary_key]
    pub item_name: String,          // e.g., "Hunting Bow"
    pub weapon_range: f32,          // Max range in world units
    pub projectile_speed: f32,      // Speed in world units per second
    pub accuracy: f32,              // Value between 0.0 (wildly inaccurate) and 1.0 (perfectly accurate)
    pub reload_time_secs: f32,      // Time between shots (per shot fire rate)
    pub magazine_capacity: u8,      // How many rounds can be loaded at once (0 = single-shot like bow)
    pub is_automatic: bool,         // If true, weapon fires continuously when holding mouse button (e.g., SMGs)
    pub magazine_reload_time_secs: f32, // Time to reload/nock (0 = instant like bow)
    // pub ammo_item_def_id: Option<u64>, // Future: if different ammo types are used
}