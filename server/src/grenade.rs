//! Grenade fuse system: armed grenades as items (dropped, inventory, container)
//! with fuse metadata. Scheduler checks once per second and detonates expired grenades.

use spacetimedb::{table, reducer, ReducerContext, Identity, Timestamp, ScheduleAt, Table, TimeDuration};
use log;
use serde::Deserialize;

use crate::dropped_item::dropped_item;
use crate::items::{inventory_item, item_definition, clear_item_from_container_by_location};
use crate::models::{ItemLocation, ContainerLocationData, ContainerType};
use crate::player;
use crate::campfire::campfire;
use crate::furnace::furnace;
use crate::fumarole::fumarole;
use crate::wooden_storage_box::wooden_storage_box;
use crate::player_corpse::player_corpse;
use crate::stash::stash;
use crate::rain_collector::rain_collector;
use crate::turret::turret;
use crate::barbecue::barbecue;
use crate::lantern::lantern;
use crate::broth_pot::broth_pot;
use crate::homestead_hearth::homestead_hearth;
use crate::explosive::apply_explosion_damage_at_position;
use crate::sound_events;

// Grenade blast params (similar to Tier 1 explosive)
const GRENADE_BLAST_RADIUS: f32 = 120.0;
const GRENADE_STRUCTURE_DAMAGE: f32 = 250.0;
const GRENADE_PLAYER_DAMAGE: f32 = 60.0;

const GRENADE_FUSE_CHECK_INTERVAL_SECS: u64 = 1;

#[derive(Deserialize)]
struct GrenadeFuseData {
    fuse_detonates_at: f64,
    #[serde(default)]
    fuse_thrower: Option<String>,
}

// --- Schedule Table ---
#[table(name = grenade_fuse_schedule, scheduled(check_grenade_fuses))]
#[derive(Clone, Debug)]
pub struct GrenadeFuseSchedule {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub scheduled_at: ScheduleAt,
}

pub fn init_grenade_system(ctx: &ReducerContext) -> Result<(), String> {
    if ctx.db.grenade_fuse_schedule().iter().next().is_some() {
        log::info!("[GrenadeInit] Fuse schedule already exists, skipping");
        return Ok(());
    }

    let interval = TimeDuration::from_micros(GRENADE_FUSE_CHECK_INTERVAL_SECS as i64 * 1_000_000);
    crate::try_insert_schedule!(
        ctx.db.grenade_fuse_schedule(),
        GrenadeFuseSchedule {
            id: 0,
            scheduled_at: ScheduleAt::Interval(interval),
        },
        "Grenade fuse check"
    );
    log::info!("[GrenadeInit] Grenade fuse system initialized");
    Ok(())
}

#[reducer]
pub fn check_grenade_fuses(ctx: &ReducerContext, _schedule: GrenadeFuseSchedule) -> Result<(), String> {
    if ctx.sender != ctx.identity() {
        return Err("Grenade fuse check may only be invoked by scheduler.".into());
    }

    let now_secs = ctx.timestamp.to_micros_since_unix_epoch() as f64 / 1_000_000.0;
    let grenade_def_id = ctx.db.item_definition().iter()
        .find(|d| d.name == "Grenade")
        .map(|d| d.id);

    let Some(grenade_def_id) = grenade_def_id else {
        return Ok(());
    };

    // 1. Check DroppedItem grenades on ground
    let dropped_to_detonate: Vec<_> = ctx.db.dropped_item().iter()
        .filter(|d| d.item_def_id == grenade_def_id)
        .filter_map(|d| {
            let data = d.item_data.as_ref()?;
            let fuse: GrenadeFuseData = serde_json::from_str(data).ok()?;
            if fuse.fuse_detonates_at <= now_secs {
                Some((d.id, d.pos_x, d.pos_y, fuse.fuse_thrower))
            } else {
                None
            }
        })
        .collect();

    for (dropped_id, pos_x, pos_y, thrower_opt) in dropped_to_detonate {
        let attacker = parse_thrower_identity(thrower_opt.as_deref()).unwrap_or(ctx.identity());
        sound_events::emit_explosion_sound(ctx, pos_x, pos_y, attacker);
        apply_explosion_damage_at_position(
            ctx,
            attacker,
            pos_x,
            pos_y,
            GRENADE_BLAST_RADIUS,
            GRENADE_STRUCTURE_DAMAGE,
            GRENADE_PLAYER_DAMAGE,
        );
        ctx.db.dropped_item().id().delete(&dropped_id);
        log::info!("[GrenadeFuse] Detonated dropped grenade {} at ({:.1}, {:.1})", dropped_id, pos_x, pos_y);
    }

    // 2. Check InventoryItem grenades (inventory, hotbar, equipped, container)
    let inventory_to_detonate: Vec<_> = ctx.db.inventory_item().iter()
        .filter(|i| i.item_def_id == grenade_def_id)
        .filter_map(|i| {
            let data = i.item_data.as_ref()?;
            let fuse: GrenadeFuseData = serde_json::from_str(data).ok()?;
            if fuse.fuse_detonates_at <= now_secs {
                Some((i.instance_id, i.location.clone()))
            } else {
                None
            }
        })
        .collect();

    for (instance_id, location) in inventory_to_detonate {
        let (pos_x, pos_y, attacker) = resolve_detonation_position(ctx, &location);
        let attacker = attacker.unwrap_or(ctx.identity());
        sound_events::emit_explosion_sound(ctx, pos_x, pos_y, attacker);
        apply_explosion_damage_at_position(
            ctx,
            attacker,
            pos_x,
            pos_y,
            GRENADE_BLAST_RADIUS,
            GRENADE_STRUCTURE_DAMAGE,
            GRENADE_PLAYER_DAMAGE,
        );
        consume_grenade_from_location(ctx, instance_id, &location);
        log::info!("[GrenadeFuse] Detonated inventory grenade {} at ({:.1}, {:.1})", instance_id, pos_x, pos_y);
    }

    Ok(())
}

fn parse_thrower_identity(s: Option<&str>) -> Option<Identity> {
    let s = s?;
    let s = s.trim();
    let s = s.strip_prefix("0x").unwrap_or(s);
    if s.len() != 64 {
        return None;
    }
    let mut bytes = [0u8; 32];
    for (i, chunk) in s.as_bytes().chunks(2).enumerate() {
        if i >= 32 || chunk.len() != 2 {
            return None;
        }
        let hi = hex_val(chunk[0])?;
        let lo = hex_val(chunk[1])?;
        bytes[i] = (hi << 4) | lo;
    }
    Some(Identity::from_be_byte_array(bytes))
}

fn hex_val(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

fn resolve_detonation_position(ctx: &ReducerContext, loc: &ItemLocation) -> (f32, f32, Option<Identity>) {
    match loc {
        ItemLocation::Inventory(data) => {
            if let Some(p) = ctx.db.player().identity().find(&data.owner_id) {
                (p.position_x, p.position_y, Some(data.owner_id))
            } else {
                (0.0, 0.0, None)
            }
        }
        ItemLocation::Hotbar(data) => {
            if let Some(p) = ctx.db.player().identity().find(&data.owner_id) {
                (p.position_x, p.position_y, Some(data.owner_id))
            } else {
                (0.0, 0.0, None)
            }
        }
        ItemLocation::Equipped(data) => {
            if let Some(p) = ctx.db.player().identity().find(&data.owner_id) {
                (p.position_x, p.position_y, Some(data.owner_id))
            } else {
                (0.0, 0.0, None)
            }
        }
        ItemLocation::Container(data) => {
            let (px, py) = get_container_world_position(ctx, data);
            (px, py, None)
        }
        _ => (0.0, 0.0, None),
    }
}

fn get_container_world_position(ctx: &ReducerContext, loc: &ContainerLocationData) -> (f32, f32) {
    let id = loc.container_id as u32;
    match loc.container_type {
        ContainerType::Campfire => ctx.db.campfire().id().find(id)
            .map(|c| (c.pos_x, c.pos_y)).unwrap_or((0.0, 0.0)),
        ContainerType::Furnace => ctx.db.furnace().id().find(id)
            .map(|f| (f.pos_x, f.pos_y)).unwrap_or((0.0, 0.0)),
        ContainerType::Fumarole => ctx.db.fumarole().id().find(id)
            .map(|f| (f.pos_x, f.pos_y)).unwrap_or((0.0, 0.0)),
        ContainerType::WoodenStorageBox => ctx.db.wooden_storage_box().id().find(id)
            .map(|w| (w.pos_x, w.pos_y)).unwrap_or((0.0, 0.0)),
        ContainerType::PlayerCorpse => ctx.db.player_corpse().id().find(id)
            .map(|p| (p.pos_x, p.pos_y)).unwrap_or((0.0, 0.0)),
        ContainerType::Stash => ctx.db.stash().id().find(id)
            .map(|s| (s.pos_x, s.pos_y)).unwrap_or((0.0, 0.0)),
        ContainerType::RainCollector => ctx.db.rain_collector().id().find(id)
            .map(|r| (r.pos_x, r.pos_y)).unwrap_or((0.0, 0.0)),
        ContainerType::Turret => ctx.db.turret().id().find(id)
            .map(|t| (t.pos_x, t.pos_y)).unwrap_or((0.0, 0.0)),
        ContainerType::Barbecue => ctx.db.barbecue().id().find(id)
            .map(|b| (b.pos_x, b.pos_y)).unwrap_or((0.0, 0.0)),
        ContainerType::Lantern => ctx.db.lantern().id().find(id)
            .map(|l| (l.pos_x, l.pos_y)).unwrap_or((0.0, 0.0)),
        ContainerType::BrothPot => ctx.db.broth_pot().id().find(id)
            .map(|b| (b.pos_x, b.pos_y)).unwrap_or((0.0, 0.0)),
        ContainerType::HomesteadHearth => ctx.db.homestead_hearth().id().find(id)
            .map(|h| (h.pos_x, h.pos_y)).unwrap_or((0.0, 0.0)),
    }
}

fn consume_grenade_from_location(ctx: &ReducerContext, instance_id: u64, loc: &ItemLocation) {
    match loc {
        ItemLocation::Container(data) => {
            clear_item_from_container_by_location(ctx, data, instance_id);
        }
        ItemLocation::Inventory(_) | ItemLocation::Hotbar(_) => {
            // No slot to clear; just delete the InventoryItem
        }
        ItemLocation::Equipped(data) => {
            // Grenade in main hand: clear ActiveEquipment
            let _ = crate::active_equipment::clear_active_item_reducer(ctx, data.owner_id);
            crate::items::clear_specific_item_from_equipment_slots(ctx, data.owner_id, instance_id);
        }
        _ => {
            crate::items::clear_item_from_any_container(ctx, instance_id);
        }
    }
    ctx.db.inventory_item().instance_id().delete(&instance_id);
}
