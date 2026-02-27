param(
  [Parameter(Mandatory = $true)]
  [string]$Database,
  [string]$ServerName = ""
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$envPath = Join-Path $repoRoot ".env"

if (-not (Test-Path $envPath)) {
  Write-Host "[SOVA] Skipped: .env not found at project root" -ForegroundColor DarkYellow
  return
}

$envVars = @{}
Get-Content $envPath | ForEach-Object {
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

$provider = if ($envVars["VITE_AI_PROVIDER"]) { $envVars["VITE_AI_PROVIDER"] } else { "grok" }
$openai = if ($envVars["OPENAI_API_KEY"]) { $envVars["OPENAI_API_KEY"] } else { "" }
$gemini = if ($envVars["GEMINI_API_KEY"]) { $envVars["GEMINI_API_KEY"] } else { "" }
$grok = if ($envVars["GROK_API_KEY"]) { $envVars["GROK_API_KEY"] } else { "" }

if (-not ($openai -or $gemini -or $grok)) {
  Write-Host "[SOVA] Skipped: no OPENAI_API_KEY, GEMINI_API_KEY, or GROK_API_KEY in .env" -ForegroundColor DarkYellow
  return
}

Write-Host "[SOVA] Seeding ai_http_config from .env (provider: $provider)..." -ForegroundColor Yellow
$p = $provider | ConvertTo-Json -Compress
$o = $openai | ConvertTo-Json -Compress
$g = $gemini | ConvertTo-Json -Compress
$x = $grok | ConvertTo-Json -Compress

if ([string]::IsNullOrWhiteSpace($ServerName)) {
  spacetime call --no-config $Database configure_sova $p $o $g $x
  spacetime sql --no-config $Database "SELECT id, active_provider FROM ai_http_config"
} else {
  spacetime call --no-config --server $ServerName $Database configure_sova $p $o $g $x
  spacetime sql --no-config --server $ServerName $Database "SELECT id, active_provider FROM ai_http_config"
}

if ($LASTEXITCODE -ne 0) {
  throw "[SOVA] Failed to seed ai_http_config."
}

Write-Host "[SOVA] ai_http_config seeded and verified" -ForegroundColor Green
