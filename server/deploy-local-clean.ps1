# Fast local database deployment script - CLEAN VERSION
# Clears database and republishes for completely fresh start

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

Write-Host "[BUILD] Clearing database and deploying fresh module..." -ForegroundColor Yellow
spacetime publish -c --no-config -p "$modulePath" broth-bullets-local -y

# Seed SOVA AI config from root .env (required after clean deploy)
& "$scriptDir\seed-sova-config.ps1" -Database "broth-bullets-local"

Write-Host "[GEN] Regenerating client bindings..." -ForegroundColor Yellow
spacetime generate --no-config --include-private -p "$modulePath" -l typescript -o "$outDir" -y

Write-Host "[SUCCESS] Clean local deployment complete! Database: broth-bullets-local" -ForegroundColor Green
Write-Host "[INFO] Run 'npm run dev' in client folder to test" -ForegroundColor Cyan
Write-Host "[CLEAN] Database was cleared and module republished" -ForegroundColor Magenta

