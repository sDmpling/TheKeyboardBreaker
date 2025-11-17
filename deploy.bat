@echo off
echo Initializing Git repository...
git init

echo Adding remote repository...
git remote add origin https://github.com/sDmpling/KeyboardBreaker.git

echo Adding files to staging...
git add .

echo Creating commit...
git commit -m "Initial commit: Keyboard Breaker multiplayer game - Dual game modes: Train Race and Typing Shark Battle - Real-time multiplayer with Socket.io (up to 15 players) - Room system with 6-character codes - AI opponents with difficulty levels - Rate limiting and sabotage mechanics - Length-based damage system (4-8 letters = 5-20 damage) - Progressive difficulty scaling - Chat functionality - Quick Play feature - Responsive design - Generated with Claude Code"

echo Setting main branch...
git branch -M main

echo Pushing to GitHub...
git push -u origin main

echo Done! Your game has been pushed to GitHub.
pause