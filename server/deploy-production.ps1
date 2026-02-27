# Fast production database deployment script
# Updates existing database without deleting

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "[BUILD] Building and deploying to production database..." -ForegroundColor Yellow
spacetime publish --server maincloud -p . broth-bullets

Write-Host "[SOVA] Seeding production ai_http_config from root .env..." -ForegroundColor Yellow
& "$scriptDir\seed-sova-config.ps1" -Database "broth-bullets" -ServerName "maincloud"

Write-Host "[GEN] Regenerating client bindings..." -ForegroundColor Yellow
spacetime generate --lang typescript --out-dir ../client/src/generated -p .

Write-Host "[GIT] Committing and pushing to trigger Railway deployment..." -ForegroundColor Yellow
cd ..
git add .
git commit -m "Deploy: Database update with latest changes"
git push

Write-Host "[SUCCESS] Production deployment complete!" -ForegroundColor Green
Write-Host "[URL] Railway will rebuild: https://www.brothandbullets.com" -ForegroundColor Cyan
Write-Host "[DB] Database: broth-bullets on maincloud" -ForegroundColor Cyan
Write-Host "[INFO] Database was updated (not wiped)" -ForegroundColor Blue 