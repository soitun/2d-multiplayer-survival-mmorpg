# Fast production database deployment script - CLEAN VERSION
# Deletes database first for completely fresh start

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "[DELETE] Deleting production database first..." -ForegroundColor Red
spacetime delete --server maincloud broth-bullets

Write-Host "[BUILD] Building and deploying to fresh production database..." -ForegroundColor Yellow
spacetime publish --server maincloud -p . broth-bullets

Write-Host "[SOVA] Seeding production ai_http_config from root .env..." -ForegroundColor Yellow
& "$scriptDir\seed-sova-config.ps1" -Database "broth-bullets" -ServerName "maincloud"

Write-Host "[GEN] Regenerating client bindings..." -ForegroundColor Yellow
spacetime generate --lang typescript --out-dir ../client/src/generated -p .

Write-Host "[GIT] Committing and pushing to trigger Railway deployment..." -ForegroundColor Yellow
cd ..
git add .
git commit -m "Deploy: Clean database rebuild with new schema"
git push

Write-Host "[SUCCESS] Clean production deployment complete!" -ForegroundColor Green
Write-Host "[URL] Railway will rebuild: https://www.brothandbullets.com" -ForegroundColor Cyan
Write-Host "[DB] Database: broth-bullets on maincloud" -ForegroundColor Cyan
Write-Host "[CLEAN] Production database was completely wiped and recreated" -ForegroundColor Magenta 