# AI Brewing smoke test (Gemini/OpenAI/Grok) for local SpacetimeDB
#
# What this script validates:
# 1) ask_sova procedure with selected provider
# 2) generate_brew_recipe procedure
# 3) create_generated_brew reducer
# 4) check_brew_cache reducer (hit and miss paths)
#
# Optional in-game-only step:
# - Broth pot start/processing cannot be forced from terminal unless there is
#   already a valid broth pot with ingredients/water and a player-context action.

param(
  [string]$Database = "broth-bullets-local",
  [ValidateSet("openai", "gemini", "grok")]
  [string]$Provider = "gemini",
  [switch]$SeedConfigFromEnv
)

$ErrorActionPreference = "Stop"

function Convert-ToStdbStringArg {
  param([Parameter(Mandatory = $true)][string]$Value)
  return '"' + $Value.Replace('"', '\u0022') + '"'
}

function Invoke-StdbCallJson {
  param(
    [Parameter(Mandatory = $true)][string]$DbName,
    [Parameter(Mandatory = $true)][string]$FunctionName,
    [Parameter(Mandatory = $true)][string[]]$Args
  )

  $output = spacetime call --no-config $DbName $FunctionName @Args
  $clean = ($output | Where-Object { $_ -and ($_ -notmatch "^WARNING:") }) -join "`n"
  if ([string]::IsNullOrWhiteSpace($clean)) {
    return @(0, "")
  }
  try {
    $parsed = $clean | ConvertFrom-Json
    if ($null -eq $parsed) {
      return @(0, "")
    }
    return $parsed
  } catch {
    throw "Failed to parse JSON output from spacetime call '$FunctionName'. Output: $clean"
  }
}

function Get-EnvMap {
  param([Parameter(Mandatory = $true)][string]$Path)
  $envVars = @{}
  if (-not (Test-Path $Path)) { return $envVars }
  Get-Content $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) { return }
    $eq = $line.IndexOf("=")
    if ($eq -le 0) { return }
    $k = $line.Substring(0, $eq).Trim()
    $v = $line.Substring($eq + 1).Trim()
    if ($v.Length -ge 2 -and $v.StartsWith('"') -and $v.EndsWith('"')) {
      $v = $v.Substring(1, $v.Length - 2)
    }
    $envVars[$k] = $v
  }
  return $envVars
}

Write-Host "[1/7] Verifying DB connectivity..." -ForegroundColor Cyan
spacetime sql --no-config $Database "SELECT id, active_provider FROM ai_http_config"

if ($SeedConfigFromEnv) {
  Write-Host "[2/7] Seeding ai_http_config from root .env..." -ForegroundColor Cyan
  $envMap = Get-EnvMap -Path ".env"
  $openai = if ($envMap.ContainsKey("OPENAI_API_KEY")) { $envMap["OPENAI_API_KEY"] } else { "" }
  $gemini = if ($envMap.ContainsKey("GEMINI_API_KEY")) { $envMap["GEMINI_API_KEY"] } else { "" }
  $grok = if ($envMap.ContainsKey("GROK_API_KEY")) { $envMap["GROK_API_KEY"] } else { "" }
  $providerArg = Convert-ToStdbStringArg -Value $Provider
  $openaiArg = Convert-ToStdbStringArg -Value $openai
  $geminiArg = Convert-ToStdbStringArg -Value $gemini
  $grokArg = Convert-ToStdbStringArg -Value $grok
  spacetime call --no-config $Database configure_sova $providerArg $openaiArg $geminiArg $grokArg | Out-Null
  Write-Host "  Seeded provider = $Provider" -ForegroundColor Green
}

Write-Host "[3/7] Running ask_sova smoke test..." -ForegroundColor Cyan
$askRequest = @{
  provider = $Provider
  model = if ($Provider -eq "openai") { "gpt-4o" } elseif ($Provider -eq "gemini") { "gemini-2.0-flash" } else { "grok-4-1-fast-reasoning" }
  messages = @(
    @{ role = "system"; content = "You are concise and tactical. Reply in one sentence." },
    @{ role = "user"; content = "Give one tactical rainy-night survival tip." }
  )
  max_completion_tokens = 120
  temperature = 0.2
}
$askJson = $askRequest | ConvertTo-Json -Compress -Depth 12
$askArg = Convert-ToStdbStringArg -Value $askJson
$askResult = Invoke-StdbCallJson -DbName $Database -FunctionName "ask_sova" -Args @($askArg)
if ($askResult[0] -ne 0) {
  throw "ask_sova failed: $($askResult[1])"
}
Write-Host "  ask_sova response: $($askResult[1])" -ForegroundColor Green

Write-Host "[4/7] Running generate_brew_recipe smoke test..." -ForegroundColor Cyan
$ingredients = @("Mushroom", "Raw Fish", "Salt Water")
$ingredientsJson = $ingredients | ConvertTo-Json -Compress
$ingredientRaritiesJson = "[0.25,0.55,0.8]"
$genResult = Invoke-StdbCallJson -DbName $Database -FunctionName "generate_brew_recipe" -Args @(
  (Convert-ToStdbStringArg -Value $ingredientsJson),
  (Convert-ToStdbStringArg -Value $ingredientRaritiesJson),
  (Convert-ToStdbStringArg -Value $Provider)
)
if ($genResult[0] -ne 0) {
  throw "generate_brew_recipe failed: $($genResult[1])"
}
$recipeJson = [string]$genResult[1]
$recipe = $recipeJson | ConvertFrom-Json
Write-Host "  Recipe name: $($recipe.name)" -ForegroundColor Green
Write-Host "  Category: $($recipe.category)" -ForegroundColor Green

Write-Host "[5/7] Running create_generated_brew smoke test..." -ForegroundColor Cyan
# create_generated_brew expects ingredients in recipe_json; add them if absent.
$recipe | Add-Member -NotePropertyName ingredients -NotePropertyValue $ingredients -Force
$recipeWithIngredientsJson = $recipe | ConvertTo-Json -Compress -Depth 20
$createResult = Invoke-StdbCallJson -DbName $Database -FunctionName "create_generated_brew" -Args @(
  (Convert-ToStdbStringArg -Value $recipeWithIngredientsJson),
  "null"
)
if ($createResult[0] -ne 0) {
  throw "create_generated_brew failed: $($createResult[1])"
}
Write-Host "  create_generated_brew succeeded." -ForegroundColor Green

Write-Host "[6/7] Verifying cache row and check_brew_cache hit..." -ForegroundColor Cyan
$cacheSql = spacetime sql --no-config $Database "SELECT recipe_hash, ingredient_names_json FROM brew_recipe_cache"
$cacheLines = $cacheSql -join "`n"
$rowRegex = [regex]'(?m)^\s*(\d+)\s*\|\s*"(.*)"\s*$'
$recipeHash = $null
foreach ($match in $rowRegex.Matches($cacheLines)) {
  $hash = $match.Groups[1].Value
  $ingredientJsonCell = $match.Groups[2].Value
  if ($ingredientJsonCell.Contains("Mushroom") -and $ingredientJsonCell.Contains("Raw Fish") -and $ingredientJsonCell.Contains("Salt Water")) {
    $recipeHash = $hash
    break
  }
}
if (-not $recipeHash) {
  throw "Could not find brew_recipe_cache row for ingredients [$($ingredients -join ', ')]."
}
$checkHit = Invoke-StdbCallJson -DbName $Database -FunctionName "check_brew_cache" -Args @($recipeHash)
if ($checkHit[0] -ne 0) {
  throw "check_brew_cache hit failed unexpectedly: $($checkHit[1])"
}
Write-Host "  check_brew_cache HIT succeeded for hash $recipeHash." -ForegroundColor Green

Write-Host "[7/7] Verifying check_brew_cache miss behavior..." -ForegroundColor Cyan
$LASTEXITCODE = 0
try {
  spacetime call --no-config $Database check_brew_cache 1 2>&1 | Out-Null
  $missCode = $LASTEXITCODE
} catch {
  $missCode = 1
}
if ($missCode -eq 0) {
  throw "Expected check_brew_cache miss to fail for hash=1, but it succeeded."
}
Write-Host "  Miss path returned non-zero as expected." -ForegroundColor Green

Write-Host ""
Write-Host "AI brewing smoke test PASSED." -ForegroundColor Green
Write-Host "Note: Full broth pot start/processing requires an in-game player-context setup." -ForegroundColor Yellow
