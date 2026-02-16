/******************************************************************************
 *                                                                            *
 * Shared placeable collision detection. Prevents any placeable from being    *
 * placed on top of another (campfire, furnace, sleeping bag, stash, etc.).   *
 *                                                                            *
 ******************************************************************************/

use spacetimedb::{ReducerContext, Table};

use crate::campfire::campfire as CampfireTableTrait;
use crate::furnace::{furnace as FurnaceTableTrait, get_furnace_collision_radius, get_furnace_collision_y_offset};
use crate::barbecue::barbecue as BarbecueTableTrait;
use crate::lantern::lantern as LanternTableTrait;
use crate::turret::turret as TurretTableTrait;
use crate::stash::stash as StashTableTrait;
use crate::sleeping_bag::sleeping_bag as SleepingBagTableTrait;
use crate::rain_collector::rain_collector as RainCollectorTableTrait;
use crate::homestead_hearth::homestead_hearth as HomesteadHearthTableTrait;
use crate::wooden_storage_box::{wooden_storage_box as WoodenStorageBoxTableTrait, get_box_collision_radius, get_box_collision_y_offset};
use crate::shelter::{shelter as ShelterTableTrait, SHELTER_AABB_HALF_WIDTH, SHELTER_AABB_HALF_HEIGHT, SHELTER_AABB_CENTER_Y_OFFSET_FROM_POS_Y};
use crate::broth_pot::broth_pot as BrothPotTableTrait;

/// Check if placing a new structure at (center_x, center_y) with given half-width and half-height
/// would overlap any existing placeable. Returns Err if blocked.
#[inline]
fn rects_overlap(
    ax: f32, ay: f32, ahw: f32, ahh: f32,
    bx: f32, by: f32, bhw: f32, bhh: f32
) -> bool {
    let a_left = ax - ahw;
    let a_right = ax + ahw;
    let a_top = ay - ahh;
    let a_bottom = ay + ahh;
    let b_left = bx - bhw;
    let b_right = bx + bhw;
    let b_top = by - bhh;
    let b_bottom = by + bhh;
    a_left < b_right && a_right > b_left && a_top < b_bottom && a_bottom > b_top
}

/// Check if the given placement rect overlaps any existing placeable.
/// center_x, center_y = center of new placement (use same coords the client sends).
/// half_width, half_height = half of the placement footprint (e.g. 48, 48 for 96x96).
pub fn check_placeable_overlap(
    ctx: &ReducerContext,
    center_x: f32,
    center_y: f32,
    half_width: f32,
    half_height: f32,
) -> Result<(), String> {
    // Campfires: pos is center-ish (pos_y has offset)
    for e in ctx.db.campfire().iter() {
        if e.is_destroyed { continue; }
        let ex = e.pos_x;
        let ey = e.pos_y - 42.0; // Reverse offset to get center
        if rects_overlap(center_x, center_y, half_width, half_height, ex, ey, 24.0, 24.0) {
            return Err("Blocked by existing structure.".to_string());
        }
    }
    // Furnaces (various sizes)
    for e in ctx.db.furnace().iter() {
        if e.is_destroyed { continue; }
        let ex = e.pos_x;
        let ey = e.pos_y - get_furnace_collision_y_offset(e.furnace_type);
        let r = get_furnace_collision_radius(e.furnace_type);
        if rects_overlap(center_x, center_y, half_width, half_height, ex, ey, r, r) {
            return Err("Blocked by existing structure.".to_string());
        }
    }
    // Barbecues
    for e in ctx.db.barbecue().iter() {
        if e.is_destroyed { continue; }
        let ex = e.pos_x;
        let ey = e.pos_y - 48.0;
        if rects_overlap(center_x, center_y, half_width, half_height, ex, ey, 48.0, 48.0) {
            return Err("Blocked by existing structure.".to_string());
        }
    }
    // Lanterns
    for e in ctx.db.lantern().iter() {
        if e.is_destroyed { continue; }
        let ex = e.pos_x;
        let ey = e.pos_y - 34.0;
        if rects_overlap(center_x, center_y, half_width, half_height, ex, ey, 24.0, 24.0) {
            return Err("Blocked by existing structure.".to_string());
        }
    }
    // Turrets
    for e in ctx.db.turret().iter() {
        if e.is_destroyed { continue; }
        let ex = e.pos_x;
        let ey = e.pos_y - 48.0;
        if rects_overlap(center_x, center_y, half_width, half_height, ex, ey, 48.0, 48.0) {
            return Err("Blocked by existing structure.".to_string());
        }
    }
    // Stashes: pos_y = world_y + 24
    for e in ctx.db.stash().iter() {
        if e.is_destroyed { continue; }
        let ex = e.pos_x;
        let ey = e.pos_y - 24.0;
        if rects_overlap(center_x, center_y, half_width, half_height, ex, ey, 24.0, 24.0) {
            return Err("Blocked by existing structure.".to_string());
        }
    }
    // Sleeping bags: pos_y = world_y + 48, center = pos_y - 48
    for e in ctx.db.sleeping_bag().iter() {
        if e.is_destroyed { continue; }
        let ex = e.pos_x;
        let ey = e.pos_y - 48.0;
        if rects_overlap(center_x, center_y, half_width, half_height, ex, ey, 48.0, 48.0) {
            return Err("Blocked by existing structure.".to_string());
        }
    }
    // Rain collectors
    for e in ctx.db.rain_collector().iter() {
        if e.is_destroyed { continue; }
        let ex = e.pos_x;
        let ey = e.pos_y - 48.0;
        if rects_overlap(center_x, center_y, half_width, half_height, ex, ey, 48.0, 48.0) {
            return Err("Blocked by existing structure.".to_string());
        }
    }
    // Homestead hearths (Matron's Chest)
    for e in ctx.db.homestead_hearth().iter() {
        if e.is_destroyed { continue; }
        let ex = e.pos_x;
        let ey = e.pos_y - 48.0;
        if rects_overlap(center_x, center_y, half_width, half_height, ex, ey, 48.0, 48.0) {
            return Err("Blocked by existing structure.".to_string());
        }
    }
    // Wooden storage boxes (various sizes)
    for e in ctx.db.wooden_storage_box().iter() {
        if e.is_destroyed { continue; }
        let ex = e.pos_x;
        let ey = e.pos_y - get_box_collision_y_offset(e.box_type);
        let r = get_box_collision_radius(e.box_type);
        if rects_overlap(center_x, center_y, half_width, half_height, ex, ey, r, r) {
            return Err("Blocked by existing structure.".to_string());
        }
    }
    // Shelters
    for e in ctx.db.shelter().iter() {
        if e.is_destroyed { continue; }
        let ex = e.pos_x;
        let ey = e.pos_y - SHELTER_AABB_CENTER_Y_OFFSET_FROM_POS_Y;
        if rects_overlap(center_x, center_y, half_width, half_height, ex, ey, SHELTER_AABB_HALF_WIDTH, SHELTER_AABB_HALF_HEIGHT) {
            return Err("Blocked by existing structure.".to_string());
        }
    }
    // Broth pots (on campfires - have position)
    for e in ctx.db.broth_pot().iter() {
        if e.is_destroyed { continue; }
        let ex = e.pos_x;
        let ey = e.pos_y;
        if rects_overlap(center_x, center_y, half_width, half_height, ex, ey, 24.0, 24.0) {
            return Err("Blocked by existing structure.".to_string());
        }
    }

    Ok(())
}
