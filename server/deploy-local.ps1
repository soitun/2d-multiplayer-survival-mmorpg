# Fast local database deployment script
# Updates existing database without deleting

# Ensure wasm-opt is on PATH for SpacetimeDB WASM optimisation
$binaryenBin = "$env:LOCALAPPDATA\Programs\Binaryen\binaryen-version_126\bin"
if (Test-Path (Join-Path $binaryenBin "wasm-opt.exe")) {
  $env:Path = $binaryenBin + ";" + $env:Path
}

# Set target directory outside OneDrive to avoid file locking issues
$env:CARGO_TARGET_DIR = "C:\RustBuild\broth-bullets-target"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$modulePath = $scriptDir
$outDir = [System.IO.Path]::GetFullPath((Join-Path $scriptDir "..\client\src\generated"))

function Assert-LastExit([string]$stepName) {
  if ($LASTEXITCODE -ne 0) {
    throw "[ERROR] $stepName failed with exit code $LASTEXITCODE."
  }
}

# Run from server directory so -p . resolves correctly
Set-Location $scriptDir

Write-Host "[BUILD] Building and deploying to local database..." -ForegroundColor Yellow
spacetime publish --no-config -p "$modulePath" broth-bullets-local -y
Assert-LastExit "Publish to local database"

Write-Host "[SOVA] Seeding local ai_http_config from root .env..." -ForegroundColor Yellow
& "$scriptDir\seed-sova-config.ps1" -Database "broth-bullets-local"
Assert-LastExit "Seed ai_http_config"

Write-Host "[GEN] Regenerating client bindings..." -ForegroundColor Yellow
spacetime generate --no-config --include-private -p "$modulePath" -l typescript -o "$outDir" -y
Assert-LastExit "Generate TypeScript bindings"

Write-Host "[SUCCESS] Local deployment complete! Database: broth-bullets-local" -ForegroundColor Green
Write-Host "[INFO] Run 'npm run dev' in client folder to test" -ForegroundColor Cyan
Write-Host "[INFO] Database was updated (not wiped)" -ForegroundColor Blue