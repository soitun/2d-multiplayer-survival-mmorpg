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

Write-Host "[BUILD] Building and deploying to local database..." -ForegroundColor Yellow
spacetime publish --no-config -p "$modulePath" broth-bullets-local -y

Write-Host "[SOVA] Seeding local ai_http_config from root .env..." -ForegroundColor Yellow
& "$scriptDir\seed-sova-config.ps1" -Database "broth-bullets-local"

Write-Host "[GEN] Regenerating client bindings..." -ForegroundColor Yellow
spacetime generate --no-config --include-private -p "$modulePath" -l typescript -o "$outDir" -y

Write-Host "[SUCCESS] Local deployment complete! Database: broth-bullets-local" -ForegroundColor Green
Write-Host "[INFO] Run 'npm run dev' in client folder to test" -ForegroundColor Cyan
Write-Host "[INFO] Database was updated (not wiped)" -ForegroundColor Blue