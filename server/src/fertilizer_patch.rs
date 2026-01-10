/******************************************************************************
 *                                                                            *
 * Fertilizer Patch System - Visual feedback when fertilizer is applied to    *
 * crops. Creates temporary brown/organic patches that fade over time.       *
 *                                                                            *
 ******************************************************************************/

use spacetimedb::{table, reducer, ReducerContext, Identity, Timestamp, Table, log, TimeDuration};
use spacetimedb::spacetimedb_lib::ScheduleAt;
use std::time::Duration;

use crate::environment::calculate_chunk_index;

// --- Constants ---

pub const FERTILIZER_PATCH_RADIUS: f32 = 30.0; // Visual radius of fertilizer patch
pub const FERTILIZER_PATCH_COLLISION_RADIUS: f32 = 20.0; // Collision detection radius
pub const FERTILIZER_PATCH_GROWTH_EFFECT_RADIUS: f32 = 60.0; // Growth bonus radius (larger than visual, matches water patches)
pub const FERTILIZER_PATCH_DURATION_SECS: u64 = 2700; // 45 minutes - fertilizer is valuable since it takes time to craft
pub const FERTILIZER_PATCH_CLEANUP_INTERVAL_SECS: u64 = 60; // Check for expired patches every minute
pub const FERTILIZER_GROWTH_BONUS_MULTIPLIER: f32 = 2.0; // 2x growth rate when fertilized (matches water patch bonus)

// --- Fertilizer Patch Table ---

#[spacetimedb::table(name = fertilizer_patch, public)]
#[derive(Clone, Debug)]
pub struct FertilizerPatch {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub pos_x: f32,
    pub pos_y: f32,
    pub chunk_index: u32,
    pub created_at: Timestamp,
    pub expires_at: Timestamp,
    pub created_by: Identity,
    pub current_opacity: f32, // Visual opacity (1.0 = fully visible, 0.0 = invisible)
}

// --- Cleanup Schedule Table ---

#[spacetimedb::table(name = fertilizer_patch_cleanup_schedule, scheduled(cleanup_expired_fertilizer_patches))]
#[derive(Clone)]
pub struct FertilizerPatchCleanupSchedule {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub scheduled_at: ScheduleAt,
}

// --- Initialization ---

/// Initialize the fertilizer patch cleanup system (called from main init)
pub fn init_fertilizer_patch_system(ctx: &ReducerContext) -> Result<(), String> {
    // Only start if no existing schedule
    if ctx.db.fertilizer_patch_cleanup_schedule().count() == 0 {
        let cleanup_interval = TimeDuration::from(Duration::from_secs(FERTILIZER_PATCH_CLEANUP_INTERVAL_SECS));
        
        crate::try_insert_schedule!(
            ctx.db.fertilizer_patch_cleanup_schedule(),
            FertilizerPatchCleanupSchedule {
                id: 0,
                scheduled_at: ScheduleAt::Interval(cleanup_interval),
            },
            "Fertilizer patch cleanup"
        );
    }
    
    Ok(())
}

// --- Helper Functions ---

/// Create a fertilizer patch at the specified location
pub fn create_fertilizer_patch(
    ctx: &ReducerContext,
    pos_x: f32,
    pos_y: f32,
    created_by: Identity,
) -> Result<(), String> {
    let chunk_index = calculate_chunk_index(pos_x, pos_y);
    let now = ctx.timestamp;
    let expires_at = now + TimeDuration::from(Duration::from_secs(FERTILIZER_PATCH_DURATION_SECS));
    
    let patch = FertilizerPatch {
        id: 0, // Auto-increment
        pos_x,
        pos_y,
        chunk_index,
        created_at: now,
        expires_at,
        created_by,
        current_opacity: 1.0, // Start fully visible
    };
    
    match ctx.db.fertilizer_patch().try_insert(patch) {
        Ok(_) => {
            log::info!("Created fertilizer patch at ({:.1}, {:.1})", pos_x, pos_y);
            Ok(())
        }
        Err(e) => {
            log::error!("Failed to create fertilizer patch: {:?}", e);
            Err("Failed to create fertilizer patch".to_string())
        }
    }
}

/// Get the growth bonus multiplier for a planted seed based on nearby fertilizer patches
/// Returns a multiplier based on proximity to fertilizer patches (similar to water patches)
pub fn get_fertilizer_patch_growth_multiplier(ctx: &ReducerContext, plant_x: f32, plant_y: f32) -> f32 {
    let mut best_multiplier: f32 = 1.0; // Base multiplier (no effect)
    
    for patch in ctx.db.fertilizer_patch().iter() {
        let dx = patch.pos_x - plant_x;
        let dy = patch.pos_y - plant_y;
        let distance_sq = dx * dx + dy * dy;
        let effect_radius_sq = FERTILIZER_PATCH_GROWTH_EFFECT_RADIUS * FERTILIZER_PATCH_GROWTH_EFFECT_RADIUS;
        
        if distance_sq <= effect_radius_sq {
            // Calculate effect strength based on distance (closer = stronger effect)
            let distance = distance_sq.sqrt();
            let distance_factor = (FERTILIZER_PATCH_GROWTH_EFFECT_RADIUS - distance) / FERTILIZER_PATCH_GROWTH_EFFECT_RADIUS;
            let distance_factor = distance_factor.max(0.0).min(1.0);
            
            // Calculate effect strength based on patch opacity (fresher patches = stronger effect)
            let opacity_factor = patch.current_opacity;
            
            // Fertilizer: positive effect (boosts growth)
            // Maximum bonus: +100% growth (2.0x multiplier) when very close
            // Minimum bonus: +15% growth (1.15x multiplier) at edge of radius
            let fertilizer_bonus = 1.0 + (FERTILIZER_GROWTH_BONUS_MULTIPLIER - 1.0) * distance_factor * opacity_factor;
            best_multiplier = best_multiplier.max(fertilizer_bonus); // Use best (highest) multiplier
        }
    }
    
    best_multiplier
}

// --- Scheduled Reducer ---

/// Scheduled reducer to clean up expired fertilizer patches and update opacity
#[spacetimedb::reducer]
pub fn cleanup_expired_fertilizer_patches(
    ctx: &ReducerContext,
    _schedule: FertilizerPatchCleanupSchedule,
) -> Result<(), String> {
    // Security check - only scheduler can run this
    if ctx.sender != ctx.identity() {
        return Err("Fertilizer patch cleanup can only be run by scheduler".to_string());
    }
    
    // PERFORMANCE: Skip if no fertilizer patches exist
    if ctx.db.fertilizer_patch().iter().next().is_none() {
        return Ok(());
    }
    
    let now = ctx.timestamp;
    let mut expired_count = 0;
    let mut updated_count = 0;
    
    // Process all fertilizer patches
    let patches: Vec<_> = ctx.db.fertilizer_patch().iter().collect();
    
    for mut patch in patches {
        // Check if patch has expired
        if patch.expires_at <= now {
            // Delete expired patch
            ctx.db.fertilizer_patch().id().delete(patch.id);
            expired_count += 1;
        } else {
            // Update opacity based on remaining time
            let elapsed = now.to_micros_since_unix_epoch() - patch.created_at.to_micros_since_unix_epoch();
            let total_duration = patch.expires_at.to_micros_since_unix_epoch() - patch.created_at.to_micros_since_unix_epoch();
            
            if total_duration > 0 {
                let progress = elapsed as f32 / total_duration as f32;
                // Fade from 1.0 to 0.0 over the duration
                patch.current_opacity = (1.0 - progress).max(0.0).min(1.0);
                ctx.db.fertilizer_patch().id().update(patch);
                updated_count += 1;
            }
        }
    }
    
    if expired_count > 0 || updated_count > 0 {
        log::debug!("Fertilizer patch cleanup: {} expired, {} opacity updated", expired_count, updated_count);
    }
    
    Ok(())
}

