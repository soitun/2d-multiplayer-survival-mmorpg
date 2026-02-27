# Fast production database deployment script - CLEAN VERSION
# Deletes database first for completely fresh start

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$outDir = [System.IO.Path]::GetFullPath((Join-Path $scriptDir "..\client\src\generated"))

function Assert-LastExit([string]$stepName) {
  if ($LASTEXITCODE -ne 0) {
    throw "[ERROR] $stepName failed with exit code $LASTEXITCODE."
  }
}

# Run from server directory so -p . resolves correctly
Set-Location $scriptDir

Write-Host "[DELETE] Deleting production database first..." -ForegroundColor Red
$deleteProc = Start-Process -FilePath "spacetime" -ArgumentList "delete","--no-config","--server","maincloud","broth-bullets","-y" -Wait -NoNewWindow -PassThru
if ($deleteProc.ExitCode -ne 0) {
  Write-Host "[DELETE] Database not found (404) or already gone - continuing with fresh publish." -ForegroundColor DarkYellow
}

Write-Host "[BUILD] Building and deploying to fresh production database..." -ForegroundColor Yellow
spacetime publish --no-config --server maincloud -p . broth-bullets -y
if ($LASTEXITCODE -ne 0) {
  Write-Host "[ERROR] Publish failed. Ensure you are logged in: spacetime login" -ForegroundColor Red
  Write-Host "[ERROR] If this DB does not exist in your account, create it once in the SpacetimeDB dashboard." -ForegroundColor Red
  exit 1
}

Write-Host "[SOVA] Seeding production ai_http_config from root .env..." -ForegroundColor Yellow
& "$scriptDir\seed-sova-config.ps1" -Database "broth-bullets" -ServerName "maincloud"
Assert-LastExit "Seed ai_http_config"

Write-Host "[GEN] Regenerating client bindings..." -ForegroundColor Yellow
spacetime generate --no-config --include-private -p . -l typescript -o "$outDir" -y
Assert-LastExit "Generate TypeScript bindings"

Write-Host "[GIT] Committing and pushing to trigger Railway deployment..." -ForegroundColor Yellow
Set-Location $repoRoot
git add .
Assert-LastExit "git add"

git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
  git commit -m "Deploy: Clean database rebuild with new schema"
  Assert-LastExit "git commit"
} else {
  Write-Host "[GIT] No staged changes to commit; skipping commit." -ForegroundColor DarkYellow
}

git push
Assert-LastExit "git push"

Write-Host "[SUCCESS] Clean production deployment complete!" -ForegroundColor Green
Write-Host "[URL] Railway will rebuild: https://www.brothandbullets.com" -ForegroundColor Cyan
Write-Host "[DB] Database: broth-bullets on maincloud" -ForegroundColor Cyan
Write-Host "[CLEAN] Production database was completely wiped and recreated" -ForegroundColor Magenta