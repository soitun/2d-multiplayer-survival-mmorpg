# GameCanvas Refactor Verification Checklist

Use this checklist after each refactor phase to ensure behavior parity.

## Interaction Indicators (hold-progress circles)
- [ ] Campfire, furnace, barbecue: circles appear during hold E
- [ ] Lantern, box, stash, door: circles appear when hold target matches
- [ ] Homestead hearth: circle at posY - 15, height 125
- [ ] Knocked-out player: circle during revive hold
- [ ] Water: circle at water position during drink hold

## Reducer Feedback (errors/sounds)
- [ ] consumeItem: BREW_COOLDOWN shows message or plays SOVA sound
- [ ] applyFertilizer, destroyFoundation, destroyWall: error in red box
- [ ] fireProjectile: sync errors suppressed (no sound)
- [ ] loadRangedWeapon: "need at least 1 arrow" plays error_arrows
- [ ] upgradeFoundation, upgradeWall: privilege/tier/resources play correct sounds
- [ ] Placement failures: error_placement_failed + red box
- [ ] Pickup, door, cairn, milk, fishing: "too far" / "not found" suppressed

## Visual Parity
- [ ] Day/night lighting: campfire, lantern, furnace, barbecue, lamppost, buoy, rune stone
- [ ] Shipwreck night lights + compound eerie lights
- [ ] Underwater shadows for swimming/snorkeling (local + remote)
- [ ] Minimap: entities, weather overlay, grid, zoom

## Performance
- [ ] No new callback churn (renderGame deps stable where intended)
- [ ] FPS profiler and lag diagnostics still functional when enabled
