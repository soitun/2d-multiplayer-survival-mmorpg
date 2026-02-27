---
name: Spacetime 2.0 Migration
overview: Upgrade to SpacetimeDB 2.0 end-to-end and reduce api-proxy to Whisper-only during staged cutover.
todos:
  - id: upgrade-core-versions
    content: Upgrade SpacetimeDB crate/SDK/CLI workflow to 2.0 and add spacetime.json
    status: completed
  - id: migrate-client-apis
    content: Apply 2.0 client API changes (database name, callbacks, typed subscriptions)
    status: in_progress
  - id: implement-ai-procedures
    content: Add non-Whisper AI procedures with auth/rate-limit/timeout guardrails
    status: pending
  - id: trim-api-proxy
    content: Remove broth and non-Whisper endpoints from api-proxy; keep Whisper only
    status: pending
  - id: cutover-client-services
    content: Switch chat/brew services to procedures; keep whisperService on proxy
    status: pending
  - id: validate-and-retire
    content: Validate parity, then migrate Whisper and remove api-proxy
    status: pending
isProject: false
---

# SpacetimeDB 2.0 Migration Plan

## Outcome

- Upgrade CLI workflow, Rust crate, and TS SDK to SpacetimeDB 2.0.
- Remove broth/non-Whisper logic from `api-proxy`.
- Move non-audio AI HTTP calls into Spacetime procedures with guardrails.
- Keep Whisper in `api-proxy` until transcription parity is validated.

## Scope

- Server: `server/Cargo.toml`, `server/src/lib.rs`, new AI procedure module.
- Client: `client/src/contexts/GameConnectionContext.tsx`, AI services, subscription/callback updates.
- Proxy: `api-proxy/server.ts` reduced to Whisper path.
- Dev workflow/docs: `README.md`, deploy scripts, add `spacetime.json`.

## Steps

1. **Version upgrades + config**
  - Bump `spacetimedb` crate and TS SDK to latest 2.0-compatible versions.
  - Add `spacetime.json` and align build/publish/generate scripts.
2. **Client 2.0 API migration**
  - Replace `.withModuleName(...)` with `.withDatabaseName(...)`.
  - Migrate reducer callback assumptions to 2.0 patterns (event tables or per-call handling).
  - Prefer typed query subscriptions in active gameplay paths.
3. **Server AI procedures (non-Whisper)**
  - Add procedures for OpenAI/Grok/Gemini chat + brew generation (and icon if retained).
  - Enforce auth, model allowlist, payload limits, timeouts, and DB-backed quotas.
4. **Proxy reduction**
  - Remove broth and non-Whisper routes from `api-proxy/server.ts`.
  - Keep `/api/whisper/transcribe` with existing auth/rate limit.
5. **Client cutover**
  - Point chat/brew client services to procedures.
  - Keep Whisper on proxy temporarily.
6. **Validation + final removal**
  - Run build/publish/generate and regression checks.
  - After Whisper parity testing, migrate Whisper and decommission `api-proxy`.

## Interim Architecture

```mermaid
flowchart LR
  gameClient[GameClient]
  stdb[SpacetimeDBModule]
  whisperProxy[ApiProxyWhisperOnly]
  aiProviders[AIProviders]

  gameClient -->|reducers procedures subscriptions| stdb
  stdb -->|ctx.http.fetch non-audio| aiProviders
  gameClient -->|whisper transcription| whisperProxy
  whisperProxy -->|audio transcription| aiProviders
```



