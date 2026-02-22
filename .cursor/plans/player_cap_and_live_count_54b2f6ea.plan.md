---
name: Player Cap And Live Count
overview: Add a live connected-player count to the login screen and enforce a hard 50-player server cap for new registrations only. Reconnects for existing players remain allowed even when full.
todos:
  - id: server-cap
    content: Add MAX_PLAYERS check for new registrations in register_player using active human connections.
    status: completed
  - id: app-count-props
    content: Compute online human player count in App.tsx and pass count/max props into LoginScreen.
    status: completed
  - id: login-ui-count
    content: Add login-screen capacity display UI and prop wiring with safe fallback states.
    status: completed
  - id: validate-errors
    content: Verify server-full reducer error appears in current LoginScreen error messaging flow.
    status: completed
  - id: lint-check
    content: Run diagnostics on modified files and resolve any new lint/type errors.
    status: completed
isProject: false
---

# Add Live Player Count + 50 Player Gate

## Goal

Expose a real-time `X / 50 players online` indicator on the login screen and enforce capacity at the server reducer level for **new registrations only**.

## Implementation

- Update server registration flow in [c:/WebProjects/vibe-coding-starter-pack-2d-multiplayer-survival/server/src/lib.rs](c:/WebProjects/vibe-coding-starter-pack-2d-multiplayer-survival/server/src/lib.rs):
  - Add a `MAX_PLAYERS` constant (`50`) near existing registration/connect constants.
  - In `register_player`, keep the current early-return path for existing identities unchanged.
  - In the **new-player branch** (after username uniqueness validation, before spawn generation), compute connected human count from `active_connection` joined to `player` where `is_npc == false`.
  - If count is `>= MAX_PLAYERS`, return reducer error (e.g. `Server is full (50/50 players online). Please try again later.`).
- Thread live count data to login UI in [c:/WebProjects/vibe-coding-starter-pack-2d-multiplayer-survival/client/src/App.tsx](c:/WebProjects/vibe-coding-starter-pack-2d-multiplayer-survival/client/src/App.tsx):
  - Reuse already-subscribed `players` map from `useSpacetimeTables`.
  - Derive `onlineHumanPlayers` via memoized filter (`player.isOnline && !player.isNpc`).
  - Pass `onlinePlayerCount` and `maxPlayerCount={50}` props to both `LoginScreen` render paths.
- Render capacity indicator in [c:/WebProjects/vibe-coding-starter-pack-2d-multiplayer-survival/client/src/components/LoginScreen.tsx](c:/WebProjects/vibe-coding-starter-pack-2d-multiplayer-survival/client/src/components/LoginScreen.tsx):
  - Extend `LoginScreenProps` with `onlinePlayerCount?: number` and `maxPlayerCount?: number`.
  - Show a small status line near the Join CTA/version row (same visual region around the existing early access text):
    - Format: `Players Online: {onlinePlayerCount} / {maxPlayerCount}`.
    - Keep visible regardless of auth state when Spacetime connection is ready; fallback to hidden/placeholder when not ready.
  - Optional visual cue only (no disabling logic): amber near-cap (`>= 45`), red at cap (`>= 50`).
- Ensure server-full message flows to UI cleanly:
  - Existing `App.tsx -> LoginScreen` error propagation already rethrows reducer failures; keep this path.
  - Verify returned full-cap error appears in existing local error block without extra modal logic.

## Validation

- Manual checks:
  - Fresh client load on login screen shows live count and max.
  - Count increments/decrements as clients connect/disconnect.
  - Existing player reconnect works when count is already 50.
  - New identity registration at 50 fails with clear full-server error.
- Run lint/diagnostics on touched client/server files and fix any introduced issues.

