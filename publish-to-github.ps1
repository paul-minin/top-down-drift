# Publish project to GitHub
# Usage:
# 1) Create a repo on GitHub and copy the remote URL (HTTPS or SSH), then run:
#    .\publish-to-github.ps1 -RemoteUrl "https://github.com/USER/REPO.git"
# OR
# 2) If you have GitHub CLI installed and authenticated (gh auth login), run without parameters:
#    .\publish-to-github.ps1
param(
  [string] $RemoteUrl
)

# If no .git folder, initialize and commit
if(-not (Test-Path .git)){
  git init
  git add .
  git commit -m "Initial commit — Top-Down Auto (test5)"
  git branch -M main
}

if($RemoteUrl){
  if(-not (git remote get-url origin 2>$null)){
    git remote add origin $RemoteUrl
  } else {
    git remote set-url origin $RemoteUrl
  }
  git push -u origin main
  Write-Host "Pushed to provided RemoteUrl." -ForegroundColor Green
  Write-Host "If you want to enable GitHub Pages: set Branch 'main' and folder '/' in repo Settings -> Pages." -ForegroundColor Cyan
  exit
}

# If no RemoteUrl provided, try to create repo via GitHub CLI if available
if (Get-Command gh -ErrorAction SilentlyContinue){
  Write-Host "No -RemoteUrl provided. Creating repo with 'gh' and pushing..." -ForegroundColor Yellow
  # create public repo from current folder, set remote 'origin' and push
  gh repo create --public --source=. --remote=origin --push --confirm
  Write-Host "Repository created and pushed via gh." -ForegroundColor Green
  Write-Host "Enable GitHub Pages in repo Settings if you want to host the page (Branch: main, /)." -ForegroundColor Cyan
  exit
}

Write-Host 'No RemoteUrl provided and GitHub CLI ("gh") not found.' -ForegroundColor Red
Write-Host 'Either create a repo manually on GitHub and re-run with -RemoteUrl "<URL>" or install gh and login (gh auth login).' -ForegroundColor Yellow
Write-Host 'Manual commands you can run instead:'
Write-Host '  git init'
Write-Host '  git add .'
Write-Host '  git commit -m "Initial commit"'
Write-Host '  git branch -M main'
Write-Host '  git remote add origin <REMOTE_URL>'
Write-Host '  git push -u origin main'