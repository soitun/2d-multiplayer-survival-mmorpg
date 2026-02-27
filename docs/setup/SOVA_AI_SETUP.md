# SOVA AI Setup

SOVA runs through SpacetimeDB HTTP procedures. The server module makes outbound LLM calls directly, so API keys stay server-side and never reach the browser.

## Security Model

- API keys live only in the private `ai_http_config` table (`id=1` singleton).
- Client only sends prompts and provider selection (`VITE_AI_PROVIDER`).
- Client never sends `Authorization: Bearer <api-key>` to third-party AI endpoints.
- Whisper transcription is hard-wired to OpenAI on the server (`transcribe_speech`).
- Text generation (`ask_sova`) and brew generation (`generate_brew_recipe`) use selected provider.

## How It Works

1. `configure_sova` seeds/updates `ai_http_config` with provider and keys.
2. `ask_sova` reads that row and calls the selected provider.
3. `transcribe_speech` always uses `openai_api_key` (by design).
4. `generate_brew_recipe` uses provider selected by client (`VITE_AI_PROVIDER`) with fallback to `active_provider`.

## First-Time Setup (after publish)

After first publish (or after delete-data republish), `ai_http_config` is empty. Seed it once.

### Step 1 — Publish server

```powershell
Set-Location server
spacetime build
spacetime publish broth-bullets-local --no-config
```

### Step 2 — Seed AI config

```powershell
spacetime call --no-config broth-bullets-local configure_sova `
  '"grok"' `
  '"<OPENAI_API_KEY>"' `
  '"<GEMINI_API_KEY>"' `
  '"<GROK_API_KEY>"'
```

Argument order:

| Position | Parameter         | Value source |
|----------|-------------------|--------------|
| 1        | `active_provider` | `"openai"` / `"grok"` / `"gemini"` |
| 2        | `openai_api_key`  | `OPENAI_API_KEY` |
| 3        | `gemini_api_key`  | `GEMINI_API_KEY` |
| 4        | `grok_api_key`    | `GROK_API_KEY` |

### Step 3 — Verify

```powershell
spacetime sql --no-config broth-bullets-local "SELECT id, active_provider FROM ai_http_config"
```

Expected:

```text
 id | active_provider
----+-----------------
 1  | "grok"
```

## Provider Selection Rules

- `VITE_AI_PROVIDER` controls client-selected provider for:
  - `ask_sova` (text generation)
  - `generate_brew_recipe` (AI brewing)
- Whisper does **not** follow `VITE_AI_PROVIDER`; it always uses OpenAI.
- If client does not send provider, server falls back to `active_provider`.

## Smoke Test

For repeatable CLI validation of `ask_sova`, `generate_brew_recipe`, `create_generated_brew`, and `check_brew_cache`, see:

- `docs/setup/AI_BREWING_SMOKE_TEST.md`
- `scripts/smoke-test-ai-brewing.ps1`

## Error Reference

| Error | Cause | Fix |
|---|---|---|
| `SOVA backend not configured (missing ai_http_config row id=1)` | Config row missing | Run `configure_sova` |
| `openai_api_key is empty in ai_http_config` | OpenAI key empty | Re-run `configure_sova` with real key |
| `gemini_api_key is empty in ai_http_config` | Gemini selected but key empty | Re-run `configure_sova` with real Gemini key |
| `Failed to deserialize merged config` | Known CLI config merge issue | Add `--no-config` |

