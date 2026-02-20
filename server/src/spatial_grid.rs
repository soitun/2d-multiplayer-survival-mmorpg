use spacetimedb::{Identity, Table, Timestamp};

use crate::{PLAYER_RADIUS, WORLD_HEIGHT_PX, WORLD_WIDTH_PX};

use crate::alk::alk_station as AlkStationTableTrait;
use crate::basalt_column::basalt_column as BasaltColumnTableTrait;
use crate::campfire::campfire as CampfireTableTrait;
use crate::cairn::cairn as CairnTableTrait;
use crate::dropped_item::dropped_item as DroppedItemTableTrait;
use crate::furnace::furnace as FurnaceTableTrait;
use crate::harvestable_resource::harvestable_resource as HarvestableResourceTableTrait;
use crate::homestead_hearth::homestead_hearth as HomesteadHearthTableTrait;
use crate::lantern::lantern as LanternTableTrait;
use crate::player as PlayerTableTrait;
use crate::player_corpse::player_corpse as PlayerCorpseTableTrait;
use crate::rain_collector::rain_collector as RainCollectorTableTrait;
use crate::rune_stone::rune_stone as RuneStoneTableTrait;
use crate::sea_stack::sea_stack as SeaStackTableTrait;
use crate::shelter::shelter as ShelterTableTrait;
use crate::stone::stone as StoneTableTrait;
use crate::tree::tree as TreeTableTrait;
use crate::turret::turret as TurretTableTrait;
use crate::wild_animal_npc::wild_animal as WildAnimalTableTrait;
use crate::wooden_storage_box::wooden_storage_box as WoodenStorageBoxTableTrait;

pub const GRID_CELL_SIZE: f32 = PLAYER_RADIUS * 8.0;
const DYNAMIC_REFRESH_INTERVAL_MICROS: i64 = 500_000;

pub fn grid_width() -> usize {
    (WORLD_WIDTH_PX / GRID_CELL_SIZE).ceil() as usize
}

pub fn grid_height() -> usize {
    (WORLD_HEIGHT_PX / GRID_CELL_SIZE).ceil() as usize
}

#[derive(Debug, Clone, Copy)]
pub enum EntityType {
    Player(Identity),
    Tree(u64),
    Stone(u64),
    Campfire(u32),
    WoodenStorageBox(u32),
    HarvestableResource(u64),
    DroppedItem(u64),
    Shelter(u32),
    PlayerCorpse(u32),
    RainCollector(u32),
    Furnace(u32),
    WildAnimal(u64),
    HomesteadHearth(u32),
    RuneStone(u64),
    BasaltColumn(u64),
    AlkStation(u32),
    Cairn(u64),
    SeaStack(u64),
    Lantern(u32),
    Turret(u32),
}

#[derive(Debug, Default, Clone)]
pub struct GridCell {
    pub entities: Vec<EntityType>,
}

#[derive(Debug, Clone)]
pub struct SpatialGrid {
    cells: Vec<GridCell>,
    width: usize,
    height: usize,
}

#[derive(Debug)]
struct CachedGrid {
    grid: SpatialGrid,
    last_refresh: Timestamp,
}

#[derive(Debug)]
struct CachedMergedGrid {
    grid: SpatialGrid,
    static_version: u64,
    dynamic_last_refresh: Timestamp,
}

static mut STATIC_GRID: Option<SpatialGrid> = None;
static mut STATIC_GRID_NEEDS_REBUILD: bool = true;
static mut STATIC_GRID_VERSION: u64 = 0;
static mut DYNAMIC_GRID: Option<CachedGrid> = None;
static mut MERGED_GRID: Option<CachedMergedGrid> = None;

impl SpatialGrid {
    pub fn new() -> Self {
        let width = grid_width();
        let height = grid_height();
        let mut cells = Vec::with_capacity(width * height);
        for _ in 0..(width * height) {
            cells.push(GridCell { entities: Vec::new() });
        }
        Self { cells, width, height }
    }

    pub fn get_cell_index(&self, x: f32, y: f32) -> Option<usize> {
        if x < 0.0 || y < 0.0 || x >= WORLD_WIDTH_PX || y >= WORLD_HEIGHT_PX {
            return None;
        }
        let cell_x = (x / GRID_CELL_SIZE) as usize;
        let cell_y = (y / GRID_CELL_SIZE) as usize;
        if cell_x >= self.width || cell_y >= self.height {
            return None;
        }
        Some(cell_y * self.width + cell_x)
    }

    pub fn clear(&mut self) {
        for cell in &mut self.cells {
            cell.entities.clear();
        }
    }

    pub fn add_entity(&mut self, entity_type: EntityType, x: f32, y: f32) {
        if let Some(index) = self.get_cell_index(x, y) {
            self.cells[index].entities.push(entity_type);
        }
    }

    pub fn get_entities_at(&self, x: f32, y: f32) -> &[EntityType] {
        if let Some(index) = self.get_cell_index(x, y) {
            &self.cells[index].entities
        } else {
            &[]
        }
    }

    pub fn get_entities_in_range(&self, x: f32, y: f32) -> Vec<EntityType> {
        let mut result = Vec::new();
        let cell_x = (x / GRID_CELL_SIZE) as isize;
        let cell_y = (y / GRID_CELL_SIZE) as isize;
        for dy in -1..=1 {
            for dx in -1..=1 {
                let nx = cell_x + dx;
                let ny = cell_y + dy;
                if nx < 0 || ny < 0 || nx >= self.width as isize || ny >= self.height as isize {
                    continue;
                }
                let index = (ny as usize) * self.width + (nx as usize);
                if index < self.cells.len() {
                    result.extend_from_slice(&self.cells[index].entities);
                }
            }
        }
        result
    }

    fn populate_static_from_world<
        DB: PlayerTableTrait
            + TreeTableTrait
            + StoneTableTrait
            + CampfireTableTrait
            + WoodenStorageBoxTableTrait
            + HarvestableResourceTableTrait
            + DroppedItemTableTrait
            + ShelterTableTrait
            + PlayerCorpseTableTrait
            + RainCollectorTableTrait
            + FurnaceTableTrait
            + WildAnimalTableTrait
            + HomesteadHearthTableTrait
            + RuneStoneTableTrait
            + BasaltColumnTableTrait
            + AlkStationTableTrait
            + CairnTableTrait
            + SeaStackTableTrait
            + LanternTableTrait
            + TurretTableTrait,
    >(
        &mut self,
        db: &DB,
    ) {
        self.clear();

        for tree in db.tree().iter() {
            if tree.health > 0 && tree.respawn_at == Timestamp::UNIX_EPOCH {
                self.add_entity(EntityType::Tree(tree.id), tree.pos_x, tree.pos_y);
            }
        }
        for stone in db.stone().iter() {
            if stone.health > 0 && stone.respawn_at == Timestamp::UNIX_EPOCH {
                self.add_entity(EntityType::Stone(stone.id), stone.pos_x, stone.pos_y);
            }
        }

        for shelter in db.shelter().iter() {
            if shelter.is_destroyed {
                continue;
            }
            use crate::shelter::{
                SHELTER_AABB_CENTER_Y_OFFSET_FROM_POS_Y, SHELTER_AABB_HALF_HEIGHT, SHELTER_AABB_HALF_WIDTH,
            };
            let center_x = shelter.pos_x;
            let center_y = shelter.pos_y - SHELTER_AABB_CENTER_Y_OFFSET_FROM_POS_Y;
            let aabb_left = center_x - SHELTER_AABB_HALF_WIDTH;
            let aabb_right = center_x + SHELTER_AABB_HALF_WIDTH;
            let aabb_top = center_y - SHELTER_AABB_HALF_HEIGHT;
            let aabb_bottom = center_y + SHELTER_AABB_HALF_HEIGHT;
            let start_cell_x = ((aabb_left / GRID_CELL_SIZE).floor() as isize).max(0) as usize;
            let end_cell_x = ((aabb_right / GRID_CELL_SIZE).ceil() as isize).min(self.width as isize - 1) as usize;
            let start_cell_y = ((aabb_top / GRID_CELL_SIZE).floor() as isize).max(0) as usize;
            let end_cell_y = ((aabb_bottom / GRID_CELL_SIZE).ceil() as isize).min(self.height as isize - 1) as usize;
            for cell_y in start_cell_y..=end_cell_y {
                for cell_x in start_cell_x..=end_cell_x {
                    let index = cell_y * self.width + cell_x;
                    if index < self.cells.len() {
                        self.cells[index].entities.push(EntityType::Shelter(shelter.id));
                    }
                }
            }
        }

        for rune_stone in db.rune_stone().iter() {
            self.add_entity(EntityType::RuneStone(rune_stone.id), rune_stone.pos_x, rune_stone.pos_y);
        }
        for cairn in db.cairn().iter() {
            self.add_entity(EntityType::Cairn(cairn.id), cairn.pos_x, cairn.pos_y);
        }
        for sea_stack in db.sea_stack().iter() {
            self.add_entity(EntityType::SeaStack(sea_stack.id), sea_stack.pos_x, sea_stack.pos_y);
        }
        for basalt in db.basalt_column().iter() {
            self.add_entity(EntityType::BasaltColumn(basalt.id), basalt.pos_x, basalt.pos_y);
        }
        for station in db.alk_station().iter() {
            if station.is_active {
                self.add_entity(EntityType::AlkStation(station.station_id), station.world_pos_x, station.world_pos_y);
            }
        }
    }

    fn populate_dynamic_from_world<
        DB: PlayerTableTrait
            + TreeTableTrait
            + StoneTableTrait
            + CampfireTableTrait
            + WoodenStorageBoxTableTrait
            + HarvestableResourceTableTrait
            + DroppedItemTableTrait
            + ShelterTableTrait
            + PlayerCorpseTableTrait
            + RainCollectorTableTrait
            + FurnaceTableTrait
            + WildAnimalTableTrait
            + HomesteadHearthTableTrait
            + RuneStoneTableTrait
            + BasaltColumnTableTrait
            + AlkStationTableTrait
            + CairnTableTrait
            + SeaStackTableTrait
            + LanternTableTrait
            + TurretTableTrait,
    >(
        &mut self,
        db: &DB,
        current_time: Timestamp,
    ) {
        self.clear();
        for player in db.player().iter() {
            if !player.is_dead {
                self.add_entity(EntityType::Player(player.identity), player.position_x, player.position_y);
            }
        }
        for campfire in db.campfire().iter() {
            self.add_entity(EntityType::Campfire(campfire.id), campfire.pos_x, campfire.pos_y);
        }
        for box_instance in db.wooden_storage_box().iter() {
            self.add_entity(EntityType::WoodenStorageBox(box_instance.id), box_instance.pos_x, box_instance.pos_y);
        }
        for resource in db.harvestable_resource().iter() {
            if resource.respawn_at == Timestamp::UNIX_EPOCH {
                self.add_entity(EntityType::HarvestableResource(resource.id), resource.pos_x, resource.pos_y);
            }
        }
        for item in db.dropped_item().iter() {
            self.add_entity(EntityType::DroppedItem(item.id), item.pos_x, item.pos_y);
        }
        for corpse in db.player_corpse().iter() {
            self.add_entity(EntityType::PlayerCorpse(corpse.id), corpse.pos_x, corpse.pos_y);
        }
        for rain_collector in db.rain_collector().iter() {
            if !rain_collector.is_destroyed {
                self.add_entity(EntityType::RainCollector(rain_collector.id), rain_collector.pos_x, rain_collector.pos_y);
            }
        }
        for furnace in db.furnace().iter() {
            if !furnace.is_destroyed {
                self.add_entity(EntityType::Furnace(furnace.id), furnace.pos_x, furnace.pos_y);
            }
        }
        for animal in db.wild_animal().iter() {
            if animal.hide_until.is_none() || animal.hide_until.unwrap() <= current_time {
                self.add_entity(EntityType::WildAnimal(animal.id), animal.pos_x, animal.pos_y);
            }
        }
        for hearth in db.homestead_hearth().iter() {
            if !hearth.is_destroyed {
                self.add_entity(EntityType::HomesteadHearth(hearth.id), hearth.pos_x, hearth.pos_y);
            }
        }
        for lantern in db.lantern().iter() {
            if !lantern.is_destroyed && lantern.lantern_type > 0 {
                self.add_entity(EntityType::Lantern(lantern.id), lantern.pos_x, lantern.pos_y);
            }
        }
        for turret in db.turret().iter() {
            if !turret.is_destroyed {
                self.add_entity(EntityType::Turret(turret.id), turret.pos_x, turret.pos_y);
            }
        }
    }
}

fn merge_static_and_dynamic(static_grid: &SpatialGrid, dynamic_grid: &SpatialGrid) -> SpatialGrid {
    let mut merged = static_grid.clone();
    for i in 0..merged.cells.len() {
        merged.cells[i].entities.extend_from_slice(&dynamic_grid.cells[i].entities);
    }
    merged
}

pub fn get_cached_spatial_grid<
    DB: PlayerTableTrait
        + TreeTableTrait
        + StoneTableTrait
        + CampfireTableTrait
        + WoodenStorageBoxTableTrait
        + HarvestableResourceTableTrait
        + DroppedItemTableTrait
        + ShelterTableTrait
        + PlayerCorpseTableTrait
        + RainCollectorTableTrait
        + FurnaceTableTrait
        + WildAnimalTableTrait
        + HomesteadHearthTableTrait
        + RuneStoneTableTrait
        + BasaltColumnTableTrait
        + AlkStationTableTrait
        + CairnTableTrait
        + SeaStackTableTrait
        + LanternTableTrait
        + TurretTableTrait,
>(
    db: &DB,
    current_time: Timestamp,
) -> &'static SpatialGrid {
    unsafe {
        if STATIC_GRID.is_none() || STATIC_GRID_NEEDS_REBUILD {
            let mut new_static_grid = SpatialGrid::new();
            new_static_grid.populate_static_from_world(db);
            STATIC_GRID = Some(new_static_grid);
            STATIC_GRID_NEEDS_REBUILD = false;
            STATIC_GRID_VERSION = STATIC_GRID_VERSION.wrapping_add(1);
            MERGED_GRID = None;
        }

        let dynamic_needs_refresh = match &DYNAMIC_GRID {
            None => true,
            Some(cached) => {
                let elapsed_micros = current_time.to_micros_since_unix_epoch() - cached.last_refresh.to_micros_since_unix_epoch();
                elapsed_micros >= DYNAMIC_REFRESH_INTERVAL_MICROS
            }
        };
        if dynamic_needs_refresh {
            let mut new_dynamic_grid = SpatialGrid::new();
            new_dynamic_grid.populate_dynamic_from_world(db, current_time);
            DYNAMIC_GRID = Some(CachedGrid {
                grid: new_dynamic_grid,
                last_refresh: current_time,
            });
            MERGED_GRID = None;
        }

        let static_ref = STATIC_GRID.as_ref().unwrap();
        let dynamic_ref = DYNAMIC_GRID.as_ref().unwrap();
        let merged_needs_rebuild = match &MERGED_GRID {
            None => true,
            Some(cached) => cached.static_version != STATIC_GRID_VERSION || cached.dynamic_last_refresh != dynamic_ref.last_refresh,
        };
        if merged_needs_rebuild {
            MERGED_GRID = Some(CachedMergedGrid {
                grid: merge_static_and_dynamic(static_ref, &dynamic_ref.grid),
                static_version: STATIC_GRID_VERSION,
                dynamic_last_refresh: dynamic_ref.last_refresh,
            });
        }

        &MERGED_GRID.as_ref().unwrap().grid
    }
}

pub fn invalidate_static_grid() {
    unsafe {
        STATIC_GRID_NEEDS_REBUILD = true;
        MERGED_GRID = None;
    }
}

pub fn invalidate_spatial_grid_cache() {
    unsafe {
        STATIC_GRID = None;
        STATIC_GRID_NEEDS_REBUILD = true;
        STATIC_GRID_VERSION = 0;
        DYNAMIC_GRID = None;
        MERGED_GRID = None;
    }
}

impl Default for SpatialGrid {
    fn default() -> Self {
        Self::new()
    }
}
