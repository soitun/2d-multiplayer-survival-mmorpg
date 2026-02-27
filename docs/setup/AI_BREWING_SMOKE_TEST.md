# AI Brewing Smoke Test

This smoke test validates the AI brewing pipeline in a local SpacetimeDB environment.

## What It Covers

- `ask_sova` request/response path for selected provider (`openai`/`gemini`/`grok`)
- `generate_brew_recipe` procedure
- `create_generated_brew` reducer
- `check_brew_cache` reducer
  - cache hit path
  - cache miss path

## Script

Run from repo root:

```powershell
.\scripts\smoke-test-ai-brewing.ps1 -Provider gemini -SeedConfigFromEnv
```

Other providers:

```powershell
.\scripts\smoke-test-ai-brewing.ps1 -Provider openai -SeedConfigFromEnv
.\scripts\smoke-test-ai-brewing.ps1 -Provider grok -SeedConfigFromEnv
```

If your `ai_http_config` is already seeded and you do not want to overwrite it:

```powershell
.\scripts\smoke-test-ai-brewing.ps1 -Provider gemini
```

## Preconditions

- Local DB module is published (`broth-bullets-local`)
- `spacetime` CLI is available in terminal
- API keys exist in root `.env` if using `-SeedConfigFromEnv`:
  - `OPENAI_API_KEY`
  - `GEMINI_API_KEY`
  - `GROK_API_KEY`

## Notes About Full In-Game Broth Pot Start

Terminal-only automation cannot always force the final "broth pot starts cooking" step, because it depends on live in-game state:

- A real broth pot must exist in `broth_pot`
- It must have valid ingredients/water/container context
- Player-context reducers (distance/ownership checks) must pass

When no active broth pot state exists, this script still gives a strong backend smoke signal for AI generation + cache pipeline.
