<!-- 50bf3a1a-33bd-4b41-8cb7-2271b92d9d00 131d8f86-657d-4906-b178-7980008b915c -->
# Flashlight Light Beam Implementation

## Summary

The "Flashlight" item already exists in the codebase ([tools.rs](server/src/items_database/tools.rs) line 178-189) and is craftable. This plan adds the functional light beam that activates when the flashlight is equipped and toggled on.

## Server-Side Changes

### 1. Add `is_flashlight_on` field to Player table

In [server/src/player.rs](server/src/player.rs), add a new boolean field alongside existing `is_torch_lit`:

```rust
pub is_flashlight_on: bool,
```

### 2. Create `toggle_flashlight` reducer

Create new file [server/src/flashlight.rs](server/src/flashlight.rs) modeled after [server/src/torch.rs](server/src/torch.rs):

- Check player is not dead/knocked out
- Verify equipped item is "Flashlight"
- Toggle `is_flashlight_on` on player record
- Update icon asset name (flashlight_on.png / flashlight.png)
- Emit toggle sound events

### 3. Update equipment handlers

In [server/src/active_equipment.rs](server/src/active_equipment.rs):

- Turn off flashlight when unequipping (like torch at line 293-307)
- Turn off flashlight when equipping different item (like torch at line 248-254)

### 4. Add sound events

In [server/src/sound_events.rs](server/src/sound_events.rs):

- Add `FlashlightOn` and `FlashlightOff` sound types
- Create emit functions for flashlight toggle sounds

### 5. Register module

In [server/src/lib.rs](server/src/lib.rs):

- Add `mod flashlight;`
- Export the reducer

## Client-Side Changes

### 6. Regenerate TypeScript bindings

After server changes, regenerate bindings to get `isFlashlightOn` on Player type and `toggleFlashlight` reducer.

### 7. Add F key flashlight toggle

In [client/src/hooks/useInputHandler.ts](client/src/hooks/useInputHandler.ts) around line 668-736:

- After the water container check, add flashlight toggle check
- If equipped item name is "Flashlight", call `toggleFlashlight` reducer

### 8. Add flashlight beam cutout rendering

In [client/src/hooks/useDayNightCycle.ts](client/src/hooks/useDayNightCycle.ts):

- Add flashlight state tracking (like `torchLitStatesKey` at line 436)
- Add cone-shaped beam cutout rendering after torch cutouts (line 658+)
- Use player direction to orient the cone
- Apply building cluster clipping for interior containment

### 9. Add flashlight beam light effect rendering

In [client/src/utils/renderers/lightRenderingUtils.ts](client/src/utils/renderers/lightRenderingUtils.ts):

- Add `renderPlayerFlashlightLight` function (similar to `renderPlayerTorchLight` at line 138)
- Render cone-shaped beam with white/pale yellow color
- Apply indoor clipping via `applyIndoorClip`

### 10. Integrate flashlight light in GameCanvas

In [client/src/components/GameCanvas.tsx](client/src/components/GameCanvas.tsx):

- Call new `renderPlayerFlashlightLight` function in the render loop (near torch light at line 2668-2702)

## Beam Design

- **Shape:** Cone/wedge spreading outward (60-70 degree angle)
- **Color:** Cool white/pale yellow (unlike warm torch orange)
- **Length:** ~200-250px reach
- **Orientation:** Based on player's `direction` field (up/down/left/right)
- **Falloff:** Bright center with gradual fade at edges

### To-dos

- [ ] Add is_flashlight_on field to Player table in player.rs
- [ ] Create toggle_flashlight reducer in new flashlight.rs file
- [ ] Update active_equipment.rs to handle flashlight on/off state
- [ ] Add flashlight toggle sound events in sound_events.rs
- [ ] Register flashlight module in lib.rs
- [ ] Regenerate TypeScript client bindings
- [ ] Add flashlight toggle to F key handler in useInputHandler.ts
- [ ] Add cone beam cutout in useDayNightCycle.ts
- [ ] Add flashlight beam rendering in lightRenderingUtils.ts
- [ ] Integrate flashlight light rendering in GameCanvas.tsx