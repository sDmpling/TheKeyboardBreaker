class KeyboardBreaker {
    constructor() {
        this.socket = io();
        console.log('Socket created:', this.socket.id);
        this.playerId = null;
        this.currentRoom = null;
        this.isOwner = false;
        this.gameActive = false;
        this.keyCount = 0;
        this.currentSpeed = 0;
        this.sabotageLevel = 0;
        this.slowdownEffect = 0;
        this.selectedGameMode = 'race'; // Default game mode

        // Game screens
        this.heroScreen = document.getElementById('heroScreen');
        this.lobbyScreen = document.getElementById('lobbyScreen');
        this.gameScreen = document.getElementById('gameScreen');
        this.battleScreen = document.getElementById('battleScreen');

        // Modals
        this.createRoomModal = document.getElementById('createRoomModal');
        this.joinRoomModal = document.getElementById('joinRoomModal');

        this.init();
    }

    init() {
        this.setupSocketListeners();
        this.setupUIEventListeners();
        this.setupKeyboardListeners();
        // Initialize the default game mode
        this.selectGameMode('race');
        this.showHeroScreen();
    }

    showHeroScreen() {
        this.hideAllScreens();
        this.heroScreen.classList.remove('hidden');
    }

    showLobbyScreen() {
        this.hideAllScreens();
        this.lobbyScreen.classList.remove('hidden');
    }

    showGameScreen() {
        this.hideAllScreens();
        if (this.currentRoom && this.currentRoom.gameMode === 'battle') {
            this.battleScreen.classList.remove('hidden');
        } else {
            this.gameScreen.classList.remove('hidden');
        }
    }

    hideAllScreens() {
        this.heroScreen.classList.add('hidden');
        this.lobbyScreen.classList.add('hidden');
        this.gameScreen.classList.add('hidden');
        this.battleScreen.classList.add('hidden');
        this.createRoomModal.classList.add('hidden');
        this.joinRoomModal.classList.add('hidden');
    }

    setupUIEventListeners() {
        // Game mode selection
        document.getElementById('raceModeBtn').addEventListener('click', () => {
            this.selectGameMode('race');
        });

        document.getElementById('battleModeBtn').addEventListener('click', () => {
            this.selectGameMode('battle');
        });

        // Hero screen buttons
        document.getElementById('createRoomBtn').addEventListener('click', () => {
            this.createRoomModal.classList.remove('hidden');
        });

        document.getElementById('joinRoomBtn').addEventListener('click', () => {
            this.joinRoomModal.classList.remove('hidden');
        });

        document.getElementById('quickPlayBtn').addEventListener('click', () => {
            console.log('Quick Play button clicked');
            const playerName = this.getPlayerName();
            console.log('Player name:', playerName);
            console.log('Selected game mode:', this.selectedGameMode);
            console.log('Emitting quickPlay event with:', { playerName, gameMode: this.selectedGameMode });
            this.socket.emit('quickPlay', { playerName, gameMode: this.selectedGameMode });
        });

        // Create room modal
        document.getElementById('confirmCreateRoom').addEventListener('click', () => {
            const roomName = document.getElementById('roomName').value.trim() || 'Epic Train Race';
            const playerName = document.getElementById('playerName').value.trim() || this.getPlayerName();
            const maxPlayers = document.getElementById('maxPlayersSelect').value;

            this.socket.emit('createRoom', {
                roomName,
                playerName,
                maxPlayers,
                gameMode: this.selectedGameMode
            });

            this.createRoomModal.classList.add('hidden');
        });

        document.getElementById('cancelCreateRoom').addEventListener('click', () => {
            this.createRoomModal.classList.add('hidden');
        });

        // Join room modal
        document.getElementById('confirmJoinRoom').addEventListener('click', () => {
            const roomCode = document.getElementById('roomCode').value.trim().toUpperCase();
            const playerName = document.getElementById('joinPlayerName').value.trim() || this.getPlayerName();

            if (roomCode.length !== 6) {
                alert('Please enter a valid 6-character room code');
                return;
            }

            this.socket.emit('joinRoom', {
                roomCode,
                playerName
            });

            this.joinRoomModal.classList.add('hidden');
        });

        document.getElementById('cancelJoinRoom').addEventListener('click', () => {
            this.joinRoomModal.classList.add('hidden');
        });

        // Lobby screen buttons
        document.getElementById('startGameBtn').addEventListener('click', () => {
            this.socket.emit('startGame');
        });

        document.getElementById('leaveLobbyBtn').addEventListener('click', () => {
            this.socket.emit('leaveRoom');
        });

        // Game screen buttons
        document.getElementById('leaveGameBtn').addEventListener('click', () => {
            this.socket.emit('leaveRoom');
        });

        // Chat functionality
        document.getElementById('sendChatBtn').addEventListener('click', () => {
            this.sendChatMessage();
        });

        document.getElementById('chatInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendChatMessage();
            }
        });

        // AI Controls functionality
        document.getElementById('addAIBtn').addEventListener('click', () => {
            const difficulty = document.getElementById('aiDifficulty').value;
            this.socket.emit('addAI', difficulty);
        });

        document.getElementById('removeAIBtn').addEventListener('click', () => {
            this.socket.emit('removeAI');
        });

        // Auto-uppercase room code input
        document.getElementById('roomCode').addEventListener('input', (e) => {
            e.target.value = e.target.value.toUpperCase();
        });
    }

    setupSocketListeners() {
        this.socket.on('connect', () => {
            console.log('Socket connected successfully, ID:', this.socket.id);
        });

        this.socket.on('disconnect', () => {
            console.log('Socket disconnected');
        });

        this.socket.on('connect_error', (error) => {
            console.log('Socket connection error:', error);
        });

        this.socket.on('roomCreated', (data) => {
            this.currentRoom = data;
            this.playerId = data.playerId;
            this.isOwner = data.isOwner;
            this.updateLobbyUI();
            this.showLobbyScreen();
        });

        this.socket.on('roomJoined', (data) => {
            this.currentRoom = data;
            this.playerId = data.playerId;
            this.isOwner = data.isOwner;
            this.updateLobbyUI();
            this.showLobbyScreen();
        });

        this.socket.on('lobbyUpdate', (data) => {
            this.currentRoom = { ...this.currentRoom, ...data };
            this.updateLobbyUI();
            this.updateLobbyPlayers(data.players);
            this.updateChat(data.chatMessages);
        });

        this.socket.on('gameStarted', () => {
            this.gameActive = true;
            this.showGameScreen();
            this.updateGameStatus('Race in progress! SPAM KEYS!', '#00FF7F');
        });

        this.socket.on('gameStateUpdate', (gameState) => {
            this.updateGameState(gameState);
        });

        this.socket.on('gameEnded', (data) => {
            this.gameActive = false;
            this.updateGameStatus(`🏆 ${data.winner.name} wins!`, '#FFD700');
            this.celebrateWinner(data.winner.id);

            setTimeout(() => {
                this.updateGameStatus('New race starting...', 'white');
            }, 3000);
        });

        this.socket.on('speedUpdate', (data) => {
            this.currentSpeed = data.speed;
            this.keyCount = data.keyCount;
            this.sabotageLevel = data.sabotageLevel || 0;
            this.slowdownEffect = data.slowdownEffect || 0;
            this.updateLocalUI();

            // Visual feedback for rate limiting
            if (data.keyAccepted === false) {
                this.showRateLimitFeedback();
            }
        });

        this.socket.on('newChatMessage', (message) => {
            this.addChatMessage(message);
        });

        this.socket.on('leftRoom', () => {
            this.currentRoom = null;
            this.isOwner = false;
            this.gameActive = false;
            this.showHeroScreen();
        });

        this.socket.on('error', (message) => {
            alert(message);
        });

        // AI-related socket listeners
        this.socket.on('aiAdded', (data) => {
            console.log('AI player added:', data.aiPlayer.name);
        });

        this.socket.on('aiRemoved', (data) => {
            console.log('AI player removed:', data.playerId);
        });

        // Battle mode socket listeners
        this.socket.on('battleStarted', () => {
            this.gameActive = true;
            this.showGameScreen(); // This will now show battle screen for battle mode
            this.updateBattleStatus('Battle in progress! Type words to attack!', '#00FF7F');
            this.initBattleMode();
        });

        this.socket.on('battleStateUpdate', (battleState) => {
            this.updateBattleState(battleState);
        });

        this.socket.on('battleTimer', (timeLeft) => {
            this.updateBattleTimer(timeLeft);
        });

        this.socket.on('newWord', (wordData) => {
            this.addWordTarget(wordData);
        });

        this.socket.on('wordExpired', (wordId) => {
            this.removeWordTarget(wordId);
        });

        this.socket.on('battleAction', (actionData) => {
            this.handleBattleAction(actionData);
        });

        this.socket.on('battleEnded', (data) => {
            this.gameActive = false;
            this.updateBattleStatus(`🏆 ${data.winner.name} wins the battle!`, '#FFD700');
            this.celebrateWinner(data.winner.id);

            setTimeout(() => {
                this.updateBattleStatus('New battle starting...', 'white');
            }, 3000);
        });
    }

    setupKeyboardListeners() {
        document.addEventListener('keydown', (event) => {
            if (this.gameActive && this.currentRoom && this.currentRoom.gameMode === 'race') {
                // Only capture keys for race mode
                event.preventDefault();
                this.handleKeyPress();
            }
        });

        document.addEventListener('click', () => {
            if (this.gameActive && this.currentRoom && this.currentRoom.gameMode === 'race') {
                // Only handle clicks for race mode
                this.handleKeyPress();
            }
        });

        document.addEventListener('touchstart', (event) => {
            if (this.gameActive && this.currentRoom && this.currentRoom.gameMode === 'race') {
                // Only handle touches for race mode
                event.preventDefault();
                this.handleKeyPress();
            }
        });
    }

    handleKeyPress() {
        if (this.gameActive && this.playerId) {
            this.socket.emit('keyPress');
        }
    }

    getPlayerName() {
        let name = localStorage.getItem('keyboardBreakerName');
        if (!name) {
            name = prompt('Enter your player name:') || `Player${Math.floor(Math.random() * 1000)}`;
            localStorage.setItem('keyboardBreakerName', name);
        }
        return name;
    }

    selectGameMode(mode) {
        this.selectedGameMode = mode;

        // Update UI
        document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
        if (mode === 'race') {
            document.getElementById('raceModeBtn').classList.add('active');
        } else {
            document.getElementById('battleModeBtn').classList.add('active');
        }

        // Update Quick Play button text to reflect selected mode
        const quickPlayBtn = document.getElementById('quickPlayBtn');
        if (mode === 'battle') {
            quickPlayBtn.textContent = '⚡ Quick Battle';
        } else {
            quickPlayBtn.textContent = '⚡ Quick Race';
        }

        // Update instructions and preview based on game mode
        this.updateGameModePreview(mode);
    }

    updateGameModePreview(mode) {
        const instructionsGrid = document.querySelector('.instructions-grid');
        if (mode === 'battle') {
            instructionsGrid.innerHTML = `
                <div class="instruction">
                    <span class="icon">⌨️</span>
                    <p>Type words correctly</p>
                </div>
                <div class="instruction">
                    <span class="icon">⚔️</span>
                    <p>Attack other players</p>
                </div>
                <div class="instruction">
                    <span class="icon">🏆</span>
                    <p>Last player standing wins!</p>
                </div>
            `;
            // Update preview to show battle arena
            const previewTrack = document.querySelector('.preview-track');
            previewTrack.style.background = 'linear-gradient(45deg, #2C3E50 0%, #34495E 100%)';
            previewTrack.style.border = '4px solid rgba(52, 152, 219, 0.5)';

            const previewTrain = document.querySelector('.preview-train');
            previewTrain.textContent = '🦈';

            const previewCenter = document.querySelector('.preview-center');
            previewCenter.textContent = '⚔️';
        } else {
            instructionsGrid.innerHTML = `
                <div class="instruction">
                    <span class="icon">⌨️</span>
                    <p>Spam any keyboard keys</p>
                </div>
                <div class="instruction">
                    <span class="icon">🔥</span>
                    <p>Fast spamming slows others down</p>
                </div>
                <div class="instruction">
                    <span class="icon">🏆</span>
                    <p>First to center wins!</p>
                </div>
            `;
            // Reset to race preview
            const previewTrack = document.querySelector('.preview-track');
            previewTrack.style.background = 'repeating-conic-gradient(from 0deg at center, #654321 0deg 6deg, #8B4513 6deg 12deg)';
            previewTrack.style.border = '4px solid #8B4513';

            const previewTrain = document.querySelector('.preview-train');
            previewTrain.textContent = '🚂';

            const previewCenter = document.querySelector('.preview-center');
            previewCenter.textContent = '🎯';
        }
    }

    updateLobbyUI() {
        if (!this.currentRoom) return;

        document.getElementById('lobbyRoomName').textContent = `Room: ${this.currentRoom.roomName}`;
        document.getElementById('lobbyRoomCode').textContent = this.currentRoom.roomCode;
        document.getElementById('lobbyPlayerCount').textContent = this.currentRoom.playerCount || 0;
        document.getElementById('lobbyMaxPlayers').textContent = this.currentRoom.maxPlayers;

        const startBtn = document.getElementById('startGameBtn');
        const waitingMsg = document.querySelector('.waiting-message');
        const aiControls = document.getElementById('aiControls');

        if (this.isOwner) {
            // Show AI controls for room owner
            aiControls.classList.remove('hidden');

            if (this.currentRoom.canStartGame) {
                startBtn.classList.remove('hidden');
                waitingMsg.style.display = 'none';
            } else {
                startBtn.classList.add('hidden');
                waitingMsg.style.display = 'block';
            }
        } else {
            aiControls.classList.add('hidden');
            startBtn.classList.add('hidden');
            waitingMsg.style.display = 'block';
        }
    }

    updateLobbyPlayers(players) {
        const playersContainer = document.getElementById('lobbyPlayersList');
        playersContainer.innerHTML = '';

        players.forEach(player => {
            const playerEl = document.createElement('div');
            let className = 'lobby-player';
            if (player.isOwner) className += ' owner';
            if (player.isAI) className += ' ai';

            playerEl.className = className;
            playerEl.innerHTML = `
                <div>${player.icon} ${player.name}${player.isAI ? ` (${player.difficulty})` : ''}</div>
            `;
            playersContainer.appendChild(playerEl);
        });
    }

    updateGameState(gameState) {
        if (gameState.roomName) {
            document.getElementById('gameRoomName').textContent = `Room: ${gameState.roomName}`;
        }

        document.getElementById('playerCount').textContent = gameState.playerCount;
        document.getElementById('maxPlayerCount').textContent = gameState.maxPlayers;

        this.updatePlayerPositions(gameState.players);
        this.updateLeaderboard(gameState.leaderboard);
    }

    showRateLimitFeedback() {
        // Flash the speed meter to show rate limiting
        const speedMeter = document.getElementById('speedMeter');
        if (speedMeter) {
            speedMeter.style.color = '#e74c3c';
            speedMeter.style.textShadow = '0 0 10px rgba(231, 76, 60, 0.8)';
            setTimeout(() => {
                speedMeter.style.color = '#00FF7F';
                speedMeter.style.textShadow = '0 0 10px rgba(0, 255, 127, 0.5)';
            }, 100);
        }
    }

    updatePlayerPositions(players) {
        const container = document.getElementById('playersContainer');
        container.innerHTML = '';

        players.forEach(player => {
            const playerEl = this.createPlayerElement(player);
            this.positionPlayerOnTrack(playerEl, player.position, player.id);
            container.appendChild(playerEl);
        });
    }

    createPlayerElement(player) {
        const playerEl = document.createElement('div');
        playerEl.className = 'player-train';
        playerEl.id = `player-${player.id}`;
        playerEl.textContent = player.icon;
        playerEl.setAttribute('data-name', player.name);

        if (player.isWinner) {
            playerEl.classList.add('winner');
        }

        return playerEl;
    }

    positionPlayerOnTrack(playerEl, position, playerId) {
        const maxRadius = 280;
        const minRadius = 40;
        const currentRadius = maxRadius - (position / 100) * (maxRadius - minRadius);

        const playerIndex = Array.from(document.getElementById('playersContainer').children).length;
        const baseAngle = (playerIndex * 24) % 360;
        const angle = baseAngle + (position * 2);

        const radian = (angle * Math.PI) / 180;
        const x = 300 + currentRadius * Math.cos(radian);
        const y = 300 + currentRadius * Math.sin(radian);

        playerEl.style.left = `${x - 12}px`;
        playerEl.style.top = `${y - 12}px`;

        const rotationAngle = angle + 90;
        playerEl.style.transform = `rotate(${rotationAngle}deg)`;

        if (playerId === this.playerId) {
            playerEl.style.filter = 'drop-shadow(0 0 10px #00FF7F)';
            playerEl.style.zIndex = '20';
        }
    }

    updateLeaderboard(leaderboard) {
        const leaderboardEl = document.getElementById('leaderboardList');
        leaderboardEl.innerHTML = '';

        leaderboard.forEach((player) => {
            const listItem = document.createElement('li');
            const sabotageText = player.sabotageLevel > 0 ? ` | 🔥${player.sabotageLevel}%` : '';
            const slowdownText = player.slowdownEffect > 0 ? ` | ❄️${player.slowdownEffect}%` : '';

            listItem.innerHTML = `
                ${player.icon} ${player.name}
                <span style="float: right;">
                    ${Math.round(player.position)}% | ${player.keyCount} keys${sabotageText}${slowdownText}
                </span>
            `;

            if (player.id === this.playerId) {
                listItem.style.background = 'rgba(0, 255, 127, 0.3)';
                listItem.style.fontWeight = 'bold';
            }

            if (player.isWinner) {
                listItem.style.background = 'rgba(255, 215, 0, 0.3)';
                listItem.innerHTML = `🏆 ${listItem.innerHTML}`;
            }

            leaderboardEl.appendChild(listItem);
        });
    }

    updateLocalUI() {
        document.getElementById('keyCount').textContent = this.keyCount;
        document.getElementById('speedMeter').textContent = Math.round(this.currentSpeed * 5);

        // Update sabotage display if elements exist
        const sabotageDisplay = document.getElementById('sabotageLevel');
        if (sabotageDisplay && this.sabotageLevel !== undefined) {
            sabotageDisplay.textContent = this.sabotageLevel;
        }

        const slowdownDisplay = document.getElementById('slowdownEffect');
        if (slowdownDisplay && this.slowdownEffect !== undefined) {
            slowdownDisplay.textContent = this.slowdownEffect;
        }
    }

    updateGameStatus(message, color = 'white') {
        const statusEl = document.getElementById('gameStatus');
        statusEl.textContent = message;
        statusEl.style.color = color;
    }

    celebrateWinner(winnerId) {
        const winnerEl = document.getElementById(`player-${winnerId}`);
        if (winnerEl) {
            winnerEl.style.animation = 'celebrate 0.3s ease-in-out infinite alternate';
            this.createCelebrationEffect(winnerEl);
        }
    }

    createCelebrationEffect(element) {
        const rect = element.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        for (let i = 0; i < 20; i++) {
            setTimeout(() => {
                this.createParticle(centerX, centerY);
            }, i * 50);
        }
    }

    createParticle(x, y) {
        const particle = document.createElement('div');
        particle.textContent = ['🎉', '✨', '🎊', '⭐'][Math.floor(Math.random() * 4)];
        particle.style.position = 'fixed';
        particle.style.left = `${x}px`;
        particle.style.top = `${y}px`;
        particle.style.fontSize = '1.5rem';
        particle.style.pointerEvents = 'none';
        particle.style.zIndex = '1000';

        document.body.appendChild(particle);

        const angle = Math.random() * 360;
        const distance = 50 + Math.random() * 100;
        const endX = x + Math.cos(angle) * distance;
        const endY = y + Math.sin(angle) * distance;

        particle.animate([
            { transform: 'translate(0, 0) scale(1)', opacity: 1 },
            { transform: `translate(${endX - x}px, ${endY - y}px) scale(0)`, opacity: 0 }
        ], {
            duration: 1000,
            easing: 'ease-out'
        }).onfinish = () => {
            particle.remove();
        };
    }

    sendChatMessage() {
        const input = document.getElementById('chatInput');
        const message = input.value.trim();

        if (message) {
            this.socket.emit('chatMessage', message);
            input.value = '';
        }
    }

    updateChat(messages) {
        const chatContainer = document.getElementById('chatMessages');
        chatContainer.innerHTML = '';

        messages.forEach(msg => {
            this.addChatMessage(msg);
        });

        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    addChatMessage(message) {
        const chatContainer = document.getElementById('chatMessages');
        const messageEl = document.createElement('div');
        messageEl.className = 'chat-message';
        messageEl.innerHTML = `<strong>${message.playerName}:</strong> ${message.message}`;
        chatContainer.appendChild(messageEl);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    // Battle Mode Methods
    initBattleMode() {
        this.availableWords = new Map(); // Track all available words
        this.typingStartTime = Date.now();

        // Clear any existing typing input event listeners to prevent duplicates
        const typingInput = document.getElementById('typingInput');
        if (typingInput) {
            // Clone the input to remove all existing event listeners
            const newTypingInput = typingInput.cloneNode(true);
            typingInput.parentNode.replaceChild(newTypingInput, typingInput);

            // Setup fresh typing input listeners
            newTypingInput.focus();
            newTypingInput.addEventListener('input', (e) => {
                this.handleDirectTypingInput(e.target.value);
            });

            newTypingInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.attemptDirectWordCompletion();
                }
                // Allow normal typing behavior for all other keys
            });

            // Clear the input field
            newTypingInput.value = '';
        }

        // Update display
        this.clearDirectTypingDisplay();

        // Setup battle screen leave button (only if not already set up)
        const leaveBattleBtn = document.getElementById('leaveBattleBtn');
        if (leaveBattleBtn && !leaveBattleBtn.hasAttribute('data-listener-added')) {
            leaveBattleBtn.addEventListener('click', () => {
                this.socket.emit('leaveRoom');
            });
            leaveBattleBtn.setAttribute('data-listener-added', 'true');
        }
    }

    updateBattleState(battleState) {
        if (battleState.roomName) {
            document.getElementById('battleRoomName').textContent = `Room: ${battleState.roomName}`;
        }

        document.getElementById('battlePlayerCount').textContent = battleState.playerCount;
        document.getElementById('battleMaxPlayers').textContent = battleState.maxPlayers;

        this.updatePlayerHealthBars(battleState.players);
        this.updateBattleLeaderboard(battleState.players);
    }

    updateBattleTimer(timeLeft) {
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        document.getElementById('battleTimer').textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    updateBattleStatus(message, color = 'white') {
        const statusEl = document.getElementById('battleStatus');
        statusEl.textContent = message;
        statusEl.style.color = color;
    }

    updatePlayerHealthBars(players) {
        const container = document.getElementById('playerHealthBars');
        container.innerHTML = '';

        players.forEach(player => {
            const healthEl = document.createElement('div');
            healthEl.className = `player-health${player.id === this.playerId ? ' current-player' : ''}`;
            healthEl.innerHTML = `
                <div class="name">${player.icon} ${player.name}</div>
                <div class="health-bar">
                    <div class="health-fill" style="width: ${(player.health / player.maxHealth) * 100}%"></div>
                </div>
                <div class="health-text">${player.health}/${player.maxHealth} HP</div>
            `;
            container.appendChild(healthEl);
        });
    }

    addWordTarget(wordData) {
        const container = document.getElementById('wordTargets');
        const wordEl = document.createElement('div');
        wordEl.className = 'word-target';
        wordEl.id = `word-${wordData.id}`;

        // Show word with length-based coloring for damage indication
        const damageColor = this.getWordDamageColor(wordData.length);
        wordEl.style.background = damageColor;
        wordEl.textContent = wordData.text;
        wordEl.style.left = `${wordData.position.x}%`;
        wordEl.style.top = `${wordData.position.y}%`;

        // Store word in available words map
        this.availableWords.set(wordData.text.toLowerCase(), wordData);

        container.appendChild(wordEl);
    }

    getWordDamageColor(wordLength) {
        const colors = {
            4: 'linear-gradient(45deg, #27ae60, #2ecc71)', // Green - 5 damage
            5: 'linear-gradient(45deg, #3498db, #2980b9)', // Blue - 7 damage
            6: 'linear-gradient(45deg, #f39c12, #e67e22)', // Orange - 9 damage
            7: 'linear-gradient(45deg, #e74c3c, #c0392b)', // Red - 15 damage
            8: 'linear-gradient(45deg, #8e44ad, #732d91)'  // Purple - 20 damage
        };
        return colors[wordLength] || colors[4];
    }

    removeWordTarget(wordId) {
        const wordEl = document.getElementById(`word-${wordId}`);
        if (wordEl) {
            // Remove from available words map
            const wordText = wordEl.textContent.toLowerCase();
            this.availableWords.delete(wordText);

            wordEl.classList.add('missed');
            setTimeout(() => {
                wordEl.remove();
            }, 500);
        }
    }

    handleDirectTypingInput(inputValue) {
        const input = inputValue.toLowerCase().trim();
        const typingInput = document.getElementById('typingInput');
        if (!typingInput) return;

        // Check if input matches any available word
        let matchFound = false;
        let exactMatch = false;

        for (const [wordText, wordData] of this.availableWords.entries()) {
            if (wordText === input) {
                // Exact match - ready to complete
                exactMatch = true;
                matchFound = true;
                typingInput.style.borderColor = '#2ecc71';
                document.getElementById('currentWordDisplay').textContent = `Ready: ${wordText.toUpperCase()}`;
                break;
            } else if (wordText.startsWith(input) && input.length > 0) {
                // Partial match
                matchFound = true;
                typingInput.style.borderColor = '#3498db';
                document.getElementById('currentWordDisplay').textContent = `Typing: ${wordText.toUpperCase()}`;
                break;
            }
        }

        if (!matchFound && input.length > 0) {
            // No match found
            typingInput.style.borderColor = '#e74c3c';
            document.getElementById('currentWordDisplay').textContent = 'No matching words';
        } else if (input.length === 0) {
            // Empty input
            this.clearDirectTypingDisplay();
        }
    }

    attemptDirectWordCompletion() {
        const typingInput = document.getElementById('typingInput');
        if (!typingInput) return;

        const inputValue = typingInput.value.trim().toLowerCase();

        if (this.availableWords.has(inputValue)) {
            const wordData = this.availableWords.get(inputValue);

            // Send completion to server
            this.socket.emit('completeWord', {
                typedWord: inputValue,
                timeTaken: Date.now() - this.typingStartTime
            });

            // Mark word as completed visually
            const wordEl = document.getElementById(`word-${wordData.id}`);
            if (wordEl) {
                wordEl.classList.add('completed');
                setTimeout(() => {
                    wordEl.remove();
                }, 500);
            }

            // Remove from available words and clear input
            this.availableWords.delete(inputValue);
            typingInput.value = '';
            this.clearDirectTypingDisplay();
        }
    }

    clearDirectTypingDisplay() {
        document.getElementById('currentWordDisplay').textContent = 'Type any visible word';
        const typingInput = document.getElementById('typingInput');
        if (typingInput) {
            typingInput.style.borderColor = 'rgba(52, 152, 219, 0.3)';
        }
    }

    // Word selection removed - players can now type any visible word directly

    // Old handleTypingInput removed - now using direct word typing system

    // Old attemptWordCompletion removed - now using direct word completion system

    // Old completeCurrentWord and clearCurrentWord removed - now using direct typing system

    handleBattleAction(actionData) {
        if (actionData.type === 'attack') {
            this.showBattleEffect(actionData);
        }
    }

    showBattleEffect(actionData) {
        const effectsContainer = document.getElementById('battleEffects');

        // Create damage effect
        const damageEl = document.createElement('div');
        damageEl.className = 'damage-effect';
        damageEl.textContent = `-${actionData.damage} HP`;
        damageEl.style.left = `${Math.random() * 80 + 10}%`;
        damageEl.style.top = `${Math.random() * 60 + 20}%`;

        effectsContainer.appendChild(damageEl);

        setTimeout(() => {
            damageEl.remove();
        }, 1000);
    }

    updateBattleLeaderboard(players) {
        const leaderboard = document.getElementById('battleLeaderboardList');
        leaderboard.innerHTML = '';

        // Sort players by health descending
        const sortedPlayers = [...players].sort((a, b) => {
            if (a.health !== b.health) return b.health - a.health;
            return b.hits - a.hits;
        });

        sortedPlayers.forEach((player, index) => {
            const statEl = document.createElement('div');
            statEl.className = `battle-player-stat${player.health <= 0 ? ' eliminated' : ''}`;
            statEl.innerHTML = `
                <div class="player-info">
                    <span>${player.icon} ${player.name}</span>
                </div>
                <div class="stats">
                    ${player.health}HP | ${player.hits} hits | ${player.wpm} WPM
                </div>
            `;

            if (player.id === this.playerId) {
                statEl.style.background = 'rgba(0, 255, 127, 0.3)';
                statEl.style.fontWeight = 'bold';
            }

            leaderboard.appendChild(statEl);
        });
    }
}

// Start the game when page loads
document.addEventListener('DOMContentLoaded', () => {
    new KeyboardBreaker();
});