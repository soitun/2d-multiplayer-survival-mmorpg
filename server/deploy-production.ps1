# Fast production database deployment script
# Updates existing database without deleting

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

Write-Host "[BUILD] Building and deploying to production database..." -ForegroundColor Yellow
spacetime publish --no-config --server maincloud -p . broth-bullets -y
Assert-LastExit "Publish to maincloud"

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
  git commit -m "Deploy: Database update with latest changes"
  Assert-LastExit "git commit"
} else {
  Write-Host "[GIT] No staged changes to commit; skipping commit." -ForegroundColor DarkYellow
}

git push
Assert-LastExit "git push"

Write-Host "[SUCCESS] Production deployment complete!" -ForegroundColor Green
Write-Host "[URL] Railway will rebuild: https://www.brothandbullets.com" -ForegroundColor Cyan
Write-Host "[DB] Database: broth-bullets on maincloud" -ForegroundColor Cyan
Write-Host "[INFO] Database was updated (not wiped)" -ForegroundColor Blue