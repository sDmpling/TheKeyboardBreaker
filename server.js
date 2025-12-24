const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Room management
const rooms = new Map();

// Player colors for visual distinction
const playerColors = [
    '🚂', '🚃', '🚄', '🚅', '🚆', '🚇', '🚈', '🚉',
    '🚊', '🚋', '🚌', '🚍', '🚎', '🚐', '🚑'
];

// Word lists for typing battle mode (4-8 letters, organized by length)
const battleWords = {
    length4: ['fire', 'wave', 'hunt', 'bite', 'claw', 'rage', 'fury', 'slam', 'bash', 'kick', 'fist', 'bolt', 'zap', 'boom', 'rush', 'dash'],
    length5: ['shark', 'storm', 'blade', 'crush', 'blast', 'force', 'power', 'flame', 'spike', 'sword', 'lance', 'fight', 'punch', 'smash', 'chaos', 'blitz'],
    length6: ['battle', 'combat', 'attack', 'strike', 'damage', 'weapon', 'typing', 'hammer', 'rocket', 'cannon', 'charge', 'slayer', 'hunter', 'wizard', 'dragon', 'falcon'],
    length7: ['warrior', 'machine', 'crusher', 'tornado', 'thunder', 'cyclone', 'rampage', 'prowler', 'phantom', 'stealth', 'reaper', 'inferno', 'tempest', 'vortex', 'blaster', 'assault'],
    length8: ['champion', 'defender', 'annihila', 'destroyer', 'predator', 'colossus', 'overlord', 'superior', 'enforcer', 'guardian', 'warlord', 'behemoth', 'assassin', 'gladitor', 'marauder', 'conquer']
};

// Game mode constants
const GAME_MODES = {
    RACE: 'race',
    BATTLE: 'battle'
};

class GameRoom {
    constructor(roomCode, roomName, maxPlayers, ownerId, gameMode = GAME_MODES.RACE) {
        this.roomCode = roomCode;
        this.roomName = roomName;
        this.maxPlayers = maxPlayers;
        this.ownerId = ownerId;
        this.gameMode = gameMode;
        this.players = new Map();
        this.gameActive = false;
        this.winner = null;
        this.chatMessages = [];
        this.createdAt = Date.now();

        // Battle mode specific properties
        if (gameMode === GAME_MODES.BATTLE) {
            this.battleTimer = 180; // 3 minutes
            this.currentWords = new Map(); // Active words in battle
            this.wordId = 0; // For unique word IDs
            this.battleStartTime = null;
            this.timerInterval = null;
        }
    }

    addPlayer(socket, playerName) {
        if (this.players.size >= this.maxPlayers) {
            return { success: false, error: 'Room is full!' };
        }

        const player = new Player(socket.id, playerName);
        player.roomCode = this.roomCode;
        this.players.set(socket.id, player);
        socket.join(this.roomCode);

        return { success: true, player };
    }

    addAIPlayer(difficulty = 'medium') {
        if (this.players.size >= this.maxPlayers) {
            return { success: false, error: 'Room is full!' };
        }

        const aiNames = ['RoboRacer', 'CyberSpeedster', 'TurboBot', 'SpeedDemon', 'RaceAI', 'VelocityBot', 'ThunderBot', 'BlitzBot'];
        const aiName = aiNames[Math.floor(Math.random() * aiNames.length)] + Math.floor(Math.random() * 100);
        const aiId = `ai_${Date.now()}_${Math.random()}`;

        const aiPlayer = new Player(aiId, aiName, this, true, difficulty);
        aiPlayer.roomCode = this.roomCode;
        this.players.set(aiId, aiPlayer);

        return { success: true, player: aiPlayer };
    }

    removeAIPlayer() {
        // Remove the first AI player found
        for (const [playerId, player] of this.players.entries()) {
            if (player.isAI) {
                this.players.delete(playerId);
                return { success: true, playerId };
            }
        }
        return { success: false, error: 'No AI players to remove' };
    }

    removePlayer(playerId) {
        this.players.delete(playerId);

        // If owner leaves, transfer ownership to first remaining player
        if (this.ownerId === playerId && this.players.size > 0) {
            const firstPlayer = this.players.values().next().value;
            this.ownerId = firstPlayer.id;
        }
    }

    canStartGame() {
        return this.players.size >= 1 && !this.gameActive;
    }

    addChatMessage(playerId, message) {
        const player = this.players.get(playerId);
        if (player) {
            const chatMessage = {
                playerName: player.name,
                message: message,
                timestamp: Date.now()
            };
            this.chatMessages.push(chatMessage);

            // Keep only last 50 messages
            if (this.chatMessages.length > 50) {
                this.chatMessages = this.chatMessages.slice(-50);
            }

            return chatMessage;
        }
        return null;
    }

    // Battle mode methods
    generateWord() {
        if (this.gameMode !== GAME_MODES.BATTLE) return null;

        const wordLength = this.selectWordLength();
        const wordList = battleWords[`length${wordLength}`];
        const word = wordList[Math.floor(Math.random() * wordList.length)];

        const wordData = {
            id: ++this.wordId,
            text: word,
            length: wordLength,
            damage: this.calculateWordDamage(wordLength),
            targetPlayer: this.getRandomPlayer(),
            createdAt: Date.now(),
            position: {
                x: Math.random() * 80 + 10, // 10-90% of container width
                y: Math.random() * 60 + 20  // 20-80% of container height
            }
        };

        this.currentWords.set(wordData.id, wordData);
        return wordData;
    }

    selectWordLength() {
        const elapsed = Date.now() - this.battleStartTime;
        const progressPercent = Math.min(elapsed / 180000, 1); // 0 to 1 over 3 minutes

        // Calculate probability for longer words (30% to 70%)
        const longWordChance = 0.3 + (progressPercent * 0.4); // 30% to 70%

        if (Math.random() < longWordChance) {
            // 7 or 8 letter words (50/50 split)
            return Math.random() < 0.5 ? 7 : 8;
        } else {
            // 4, 5, or 6 letter words (equal distribution)
            return [4, 5, 6][Math.floor(Math.random() * 3)];
        }
    }

    calculateWordDamage(wordLength) {
        const damageMap = {
            4: 5,   // 4 letters = 5 damage
            5: 7,   // 5 letters = 7 damage
            6: 9,   // 6 letters = 9 damage
            7: 15,  // 7 letters = 15 damage
            8: 20   // 8 letters = 20 damage
        };
        return damageMap[wordLength] || 5; // Default to 5 if something goes wrong
    }

    getRandomPlayer() {
        const playerIds = Array.from(this.players.keys()).filter(id => this.players.get(id).health > 0);
        if (playerIds.length === 0) return null;
        return playerIds[Math.floor(Math.random() * playerIds.length)];
    }

    processWordCompletion(playerId, wordText) {
        // Find the word by text instead of ID
        let foundWord = null;
        for (const [wordId, word] of this.currentWords.entries()) {
            if (word.text.toLowerCase() === wordText.toLowerCase()) {
                foundWord = { ...word, id: wordId };
                break;
            }
        }

        if (!foundWord) return null;

        const player = this.players.get(playerId);
        if (!player) return null;

        // Remove the completed word
        this.currentWords.delete(foundWord.id);

        // Use the damage from the word data (based on length)
        const damage = foundWord.damage;

        // Deal damage to target player
        if (foundWord.targetPlayer && foundWord.targetPlayer !== playerId) {
            const targetPlayer = this.players.get(foundWord.targetPlayer);
            if (targetPlayer && targetPlayer.health > 0) {
                const wasAlive = targetPlayer.health > 0;
                targetPlayer.health = Math.max(0, targetPlayer.health - damage);
                player.hits++;

                // Check if player was just eliminated
                if (wasAlive && targetPlayer.health <= 0) {
                    // Emit elimination event to all players in the room
                    this.emitToRoom('playerEliminated', {
                        playerId: foundWord.targetPlayer,
                        playerName: targetPlayer.name,
                        eliminatedBy: player.name
                    });
                }

                return {
                    type: 'attack',
                    attacker: playerId,
                    target: foundWord.targetPlayer,
                    damage: damage,
                    word: foundWord.text,
                    wordLength: foundWord.length,
                    targetHealth: targetPlayer.health
                };
            }
        }

        return null;
    }

    checkBattleEnd() {
        const alivePlayers = Array.from(this.players.values()).filter(p => p.health > 0);

        if (alivePlayers.length <= 1) {
            this.winner = alivePlayers[0] || null;
            return true;
        }

        if (this.battleTimer <= 0) {
            // Find player with highest health
            this.winner = alivePlayers.reduce((best, current) =>
                current.health > best.health ? current : best
            );
            return true;
        }

        return false;
    }
}

// Generate random room code
function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

class Player {
    constructor(id, name, room = null, isAI = false, difficulty = 'medium') {
        this.id = id;
        this.name = name;
        this.roomCode = room ? room.roomCode : null;
        this.icon = playerColors[Math.floor(Math.random() * playerColors.length)];
        this.isWinner = false;
        this.isAI = isAI;
        this.difficulty = difficulty;

        // Race mode properties
        this.position = 0; // 0 = outer track, 100 = center
        this.speed = 0;
        this.keyCount = 0;
        this.lastKeyTime = Date.now();
        this.sabotageLevel = 0; // How much this player is slowing others
        this.keyBuffer = []; // Buffer to track recent key presses for rate limiting
        this.slowdownEffect = 0; // How much this player is being slowed by others

        // Battle mode properties
        this.health = 100;
        this.maxHealth = 100;
        this.hits = 0;
        this.wordsTyped = 0;
        this.accuracy = 100;
        this.wpm = 0;
        this.totalCharacters = 0;
        this.correctCharacters = 0;
        this.startTime = Date.now();

        // AI-specific properties
        if (isAI) {
            this.aiState = {
                nextActionTime: Date.now() + Math.random() * 1000,
                targetWord: null,
                typingProgress: 0,
                baseKeyRate: this.getAIKeyRate(difficulty),
                baseTypingSpeed: this.getAITypingSpeed(difficulty),
                errorRate: this.getAIErrorRate(difficulty)
            };
        }
    }

    getAIKeyRate(difficulty) {
        switch(difficulty) {
            case 'easy': return 2 + Math.random() * 2; // 2-4 keys per second
            case 'medium': return 4 + Math.random() * 3; // 4-7 keys per second
            case 'hard': return 6 + Math.random() * 4; // 6-10 keys per second
            default: return 4;
        }
    }

    getAITypingSpeed(difficulty) {
        switch(difficulty) {
            case 'easy': return 25 + Math.random() * 15; // 25-40 WPM
            case 'medium': return 40 + Math.random() * 20; // 40-60 WPM
            case 'hard': return 60 + Math.random() * 30; // 60-90 WPM
            default: return 45;
        }
    }

    getAIErrorRate(difficulty) {
        switch(difficulty) {
            case 'easy': return 0.15 + Math.random() * 0.1; // 15-25% error rate
            case 'medium': return 0.08 + Math.random() * 0.07; // 8-15% error rate
            case 'hard': return 0.02 + Math.random() * 0.05; // 2-7% error rate
            default: return 0.1;
        }
    }

    calculateSpeed(currentTime) {
        const timeDiff = currentTime - this.lastKeyTime;

        // Speed decays over time if no keys pressed
        if (timeDiff > 100) {
            this.speed = Math.max(0, this.speed - (timeDiff / 50));
        }

        return this.speed;
    }

    move(currentTime) {
        this.calculateSpeed(currentTime);

        // Apply slowdown effect from other players (reduces speed by sabotage percentage)
        const effectiveSpeed = this.speed * (1 - this.slowdownEffect / 100);

        // Move based on effective speed (max speed moves ~1 position per 100ms)
        const moveAmount = effectiveSpeed / 10;
        this.position = Math.min(100, this.position + moveAmount);

        // Check if reached center (winner)
        if (this.position >= 100 && !this.isWinner) {
            this.isWinner = true;
            return true; // First to reach center
        }

        return false;
    }

    pressKey() {
        const currentTime = Date.now();

        // Rate limiting: only allow 4 keys per 250ms window
        this.keyBuffer = this.keyBuffer.filter(keyTime => currentTime - keyTime < 250);

        if (this.keyBuffer.length >= 4) {
            return false; // Key press rejected due to rate limiting
        }

        this.keyBuffer.push(currentTime);
        const timeDiff = currentTime - this.lastKeyTime;

        this.keyCount++;
        this.lastKeyTime = currentTime;

        // Calculate sabotage level based on key spam rate (0-15%)
        const keyRate = this.keyBuffer.length; // Keys in last 250ms
        this.sabotageLevel = Math.min(15, Math.floor(keyRate * 3.75)); // 4 keys = 15% sabotage

        // Increase speed based on key press frequency
        // Faster key pressing = higher speed boost
        if (timeDiff < 50) {
            this.speed = Math.min(20, this.speed + 2); // Max speed cap
        } else if (timeDiff < 100) {
            this.speed = Math.min(20, this.speed + 1);
        } else {
            this.speed = Math.min(20, this.speed + 0.5);
        }

        return true; // Key press accepted
    }

    // Battle mode methods
    completeWord(word, timeTaken) {
        this.wordsTyped++;
        this.totalCharacters += word.length;
        this.correctCharacters += word.length; // Assume fully correct for completed words

        // Calculate WPM (Words Per Minute)
        const minutes = (Date.now() - this.startTime) / 60000;
        this.wpm = Math.round(this.wordsTyped / minutes);

        // Update accuracy
        this.accuracy = Math.round((this.correctCharacters / this.totalCharacters) * 100);
    }

    takeDamage(damage) {
        this.health = Math.max(0, this.health - damage);
        return this.health <= 0; // Returns true if eliminated
    }

    resetForBattle() {
        this.health = this.maxHealth;
        this.hits = 0;
        this.wordsTyped = 0;
        this.accuracy = 100;
        this.wpm = 0;
        this.totalCharacters = 0;
        this.correctCharacters = 0;
        this.startTime = Date.now();
        this.isWinner = false;

        if (this.isAI) {
            this.aiState.targetWord = null;
            this.aiState.typingProgress = 0;
            this.aiState.nextActionTime = Date.now() + Math.random() * 2000;
        }
    }

    // AI Race Mode Behavior
    simulateRaceAI(currentTime) {
        if (!this.isAI || currentTime < this.aiState.nextActionTime) return;

        // Simulate realistic key pressing with some randomness
        const timeSinceLastKey = currentTime - this.lastKeyTime;
        const keyInterval = 1000 / this.aiState.baseKeyRate; // Convert keys per second to interval

        if (timeSinceLastKey >= keyInterval * (0.8 + Math.random() * 0.4)) {
            // Add some randomness to make AI behavior more realistic
            const shouldPress = Math.random() < 0.9; // 90% chance to press key

            if (shouldPress) {
                this.pressKey();
            }

            // Set next action time with some variation
            this.aiState.nextActionTime = currentTime + (keyInterval * (0.5 + Math.random()));
        }
    }

    // AI Battle Mode Behavior
    simulateBattleAI(currentTime, availableWords) {
        if (!this.isAI || currentTime < this.aiState.nextActionTime || this.health <= 0) return;

        // If no target word, select one
        if (!this.aiState.targetWord && availableWords.size > 0) {
            this.selectTargetWord(availableWords);
        }

        // If we have a target word, simulate typing it
        if (this.aiState.targetWord) {
            return this.simulateWordTyping(currentTime);
        }
    }

    selectTargetWord(availableWords) {
        const words = Array.from(availableWords.values());
        if (words.length === 0) return;

        // AI strategy: prefer shorter words on easy, longer words on hard
        let targetWord;
        if (this.difficulty === 'easy') {
            // Prefer 4-5 letter words
            const shortWords = words.filter(w => w.length <= 5);
            targetWord = shortWords.length > 0 ? shortWords[Math.floor(Math.random() * shortWords.length)] : words[0];
        } else if (this.difficulty === 'hard') {
            // Prefer 7-8 letter words for max damage
            const longWords = words.filter(w => w.length >= 7);
            targetWord = longWords.length > 0 ? longWords[Math.floor(Math.random() * longWords.length)] : words[0];
        } else {
            // Medium: random selection
            targetWord = words[Math.floor(Math.random() * words.length)];
        }

        this.aiState.targetWord = targetWord;
        this.aiState.typingProgress = 0;
    }

    simulateWordTyping(currentTime) {
        if (!this.aiState.targetWord) return null;

        const word = this.aiState.targetWord.text;
        const typingSpeed = this.aiState.baseTypingSpeed;
        const timePerCharacter = (60 / typingSpeed) * 1000 / 5; // Average 5 characters per word for WPM calculation

        // Check if enough time has passed to type next character
        const expectedProgress = Math.min(word.length, this.aiState.typingProgress + (currentTime - this.aiState.nextActionTime) / timePerCharacter);

        if (expectedProgress >= word.length) {
            // Word complete! Check for errors
            const shouldMakeError = Math.random() < this.aiState.errorRate;

            if (!shouldMakeError) {
                // Successfully typed the word
                const completedWord = this.aiState.targetWord;
                this.aiState.targetWord = null;
                this.aiState.typingProgress = 0;
                this.aiState.nextActionTime = currentTime + 200 + Math.random() * 800; // Small delay before next word

                return completedWord;
            } else {
                // Made an error, restart the word
                this.aiState.typingProgress = 0;
                this.aiState.nextActionTime = currentTime + 500 + Math.random() * 1000; // Longer delay after error
            }
        } else {
            this.aiState.typingProgress = expectedProgress;
            this.aiState.nextActionTime = currentTime + timePerCharacter;
        }

        return null;
    }
}

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    // Handle room creation
    socket.on('createRoom', (data) => {
        const { roomName, playerName, maxPlayers, gameMode = GAME_MODES.RACE } = data;
        let roomCode;

        // Generate unique room code
        do {
            roomCode = generateRoomCode();
        } while (rooms.has(roomCode));

        const room = new GameRoom(roomCode, roomName, parseInt(maxPlayers), socket.id, gameMode);
        rooms.set(roomCode, room);

        const result = room.addPlayer(socket, playerName);
        if (result.success) {
            socket.emit('roomCreated', {
                roomCode: roomCode,
                roomName: roomName,
                maxPlayers: room.maxPlayers,
                playerId: socket.id,
                isOwner: true
            });

            broadcastLobbyUpdate(room);
        } else {
            socket.emit('error', result.error);
        }
    });

    // Handle room joining
    socket.on('joinRoom', (data) => {
        const { roomCode, playerName } = data;
        const room = rooms.get(roomCode.toUpperCase());

        if (!room) {
            socket.emit('error', 'Room not found!');
            return;
        }

        const result = room.addPlayer(socket, playerName);
        if (result.success) {
            socket.emit('roomJoined', {
                roomCode: room.roomCode,
                roomName: room.roomName,
                maxPlayers: room.maxPlayers,
                playerId: socket.id,
                isOwner: socket.id === room.ownerId
            });

            broadcastLobbyUpdate(room);
        } else {
            socket.emit('error', result.error);
        }
    });

    // Handle quick play (join random room or create one)
    socket.on('quickPlay', (data) => {
        console.log('Quick Play request received:', data);
        const { playerName, gameMode = GAME_MODES.RACE } = data;

        // Try to find an existing room with space and matching game mode
        let availableRoom = null;
        for (const room of rooms.values()) {
            if (room.players.size < room.maxPlayers &&
                !room.gameActive &&
                room.gameMode === gameMode) {
                availableRoom = room;
                break;
            }
        }
        console.log('Available room found:', availableRoom ? availableRoom.roomCode : 'None');

        if (availableRoom) {
            const result = availableRoom.addPlayer(socket, playerName);
            if (result.success) {
                console.log('Joined existing quick play room:', availableRoom.roomCode, 'for player:', playerName);
                socket.emit('roomJoined', {
                    roomCode: availableRoom.roomCode,
                    roomName: availableRoom.roomName,
                    maxPlayers: availableRoom.maxPlayers,
                    playerId: socket.id,
                    isOwner: socket.id === availableRoom.ownerId
                });

                broadcastLobbyUpdate(availableRoom);
            } else {
                console.log('Failed to join existing room:', result.error);
                socket.emit('error', result.error);
            }
        } else {
            // Create new quick play room
            let roomCode;
            do {
                roomCode = generateRoomCode();
            } while (rooms.has(roomCode));

            const roomNameSuffix = gameMode === GAME_MODES.BATTLE ? 'Battle Arena' : 'Quick Game';
            const room = new GameRoom(roomCode, `${playerName}'s ${roomNameSuffix}`, 15, socket.id, gameMode);
            rooms.set(roomCode, room);

            const result = room.addPlayer(socket, playerName);
            if (result.success) {
                console.log('Created new quick play room:', room.roomCode, 'for player:', playerName);
                socket.emit('roomCreated', {
                    roomCode: roomCode,
                    roomName: room.roomName,
                    maxPlayers: room.maxPlayers,
                    playerId: socket.id,
                    isOwner: true
                });

                broadcastLobbyUpdate(room);
            } else {
                console.log('Failed to add player to new room:', result.error);
                socket.emit('error', result.error);
            }
        }
    });

    // Handle start game
    socket.on('startGame', () => {
        const playerRoom = findPlayerRoom(socket.id);
        if (playerRoom && socket.id === playerRoom.ownerId && playerRoom.canStartGame()) {
            if (playerRoom.gameMode === GAME_MODES.BATTLE) {
                startBattleGame(playerRoom);
            } else {
                startRoomGame(playerRoom);
            }
        }
    });

    // Handle chat message
    socket.on('chatMessage', (message) => {
        const room = findPlayerRoom(socket.id);
        if (room) {
            const chatMessage = room.addChatMessage(socket.id, message);
            if (chatMessage) {
                io.to(room.roomCode).emit('newChatMessage', chatMessage);
            }
        }
    });

    // Handle key press (for race mode)
    socket.on('keyPress', () => {
        const room = findPlayerRoom(socket.id);
        if (room && room.gameMode === GAME_MODES.RACE) {
            const player = room.players.get(socket.id);
            if (player && room.gameActive && !room.winner) {
                const keyAccepted = player.pressKey();

                // Emit immediate feedback to the player
                socket.emit('speedUpdate', {
                    speed: player.speed,
                    keyCount: player.keyCount,
                    sabotageLevel: player.sabotageLevel,
                    slowdownEffect: player.slowdownEffect,
                    keyAccepted: keyAccepted
                });
            }
        }
    });

    // Handle word completion (for battle mode)
    socket.on('completeWord', (data) => {
        const room = findPlayerRoom(socket.id);
        if (room && room.gameMode === GAME_MODES.BATTLE && room.gameActive) {
            const { typedWord, timeTaken } = data;
            const player = room.players.get(socket.id);

            if (player && player.health > 0) {
                // Process successful word completion (finds word by text)
                const attackResult = room.processWordCompletion(socket.id, typedWord);

                if (attackResult) {
                    // Update player stats
                    player.completeWord(attackResult.word, timeTaken);

                    // Broadcast attack to all players in room
                    io.to(room.roomCode).emit('battleAction', attackResult);

                    // Check if battle should end
                    if (room.checkBattleEnd()) {
                        endBattleGame(room);
                    } else {
                        // Broadcast updated battle state
                        broadcastBattleState(room);
                    }
                }
            }
        }
    });

    // Handle leaving room/game
    socket.on('leaveRoom', () => {
        const room = findPlayerRoom(socket.id);
        if (room) {
            room.removePlayer(socket.id);
            socket.leave(room.roomCode);

            if (room.players.size === 0) {
                rooms.delete(room.roomCode);
            } else {
                broadcastLobbyUpdate(room);
                if (room.gameActive) {
                    broadcastGameState(room);
                }
            }

            socket.emit('leftRoom');
        }
    });

    // Handle AI player management
    socket.on('addAI', (difficulty = 'medium') => {
        const room = findPlayerRoom(socket.id);
        if (room && socket.id === room.ownerId) {
            const result = room.addAIPlayer(difficulty);
            if (result.success) {
                broadcastLobbyUpdate(room);
                socket.emit('aiAdded', { aiPlayer: result.player });
            } else {
                socket.emit('error', result.error);
            }
        }
    });

    socket.on('removeAI', () => {
        const room = findPlayerRoom(socket.id);
        if (room && socket.id === room.ownerId) {
            const result = room.removeAIPlayer();
            if (result.success) {
                broadcastLobbyUpdate(room);
                socket.emit('aiRemoved', { playerId: result.playerId });
            } else {
                socket.emit('error', result.error);
            }
        }
    });

    // Handle host restart game
    socket.on('hostRestartGame', () => {
        const playerRoom = findPlayerRoom(socket.id);
        if (playerRoom && socket.id === playerRoom.ownerId) {
            // Cancel any pending auto-restart
            if (playerRoom.restartTimeout) {
                clearTimeout(playerRoom.restartTimeout);
                playerRoom.restartTimeout = null;
            }

            // Start new game immediately
            if (playerRoom.gameMode === GAME_MODES.BATTLE) {
                startBattleGame(playerRoom);
            } else {
                startRoomGame(playerRoom);
            }

            console.log(`Host ${socket.id} restarted game in room ${playerRoom.roomCode}`);
        }
    });

    // Handle host end game
    socket.on('hostEndGame', () => {
        const playerRoom = findPlayerRoom(socket.id);
        if (playerRoom && socket.id === playerRoom.ownerId) {
            // Cancel any pending auto-restart
            if (playerRoom.restartTimeout) {
                clearTimeout(playerRoom.restartTimeout);
                playerRoom.restartTimeout = null;
            }

            // Return all players to lobby
            io.to(playerRoom.roomCode).emit('gameSessionEnded');
            console.log(`Host ${socket.id} ended game session in room ${playerRoom.roomCode}`);
        }
    });

    // Handle player disconnect
    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        const room = findPlayerRoom(socket.id);
        if (room) {
            room.removePlayer(socket.id);

            if (room.players.size === 0) {
                rooms.delete(room.roomCode);
            } else {
                broadcastLobbyUpdate(room);
                if (room.gameActive) {
                    broadcastGameState(room);
                }
            }
        }
    });
});

// Helper function to find which room a player is in
function findPlayerRoom(playerId) {
    for (const room of rooms.values()) {
        if (room.players.has(playerId)) {
            return room;
        }
    }
    return null;
}

function startRoomGame(room) {
    room.gameActive = true;
    room.winner = null;

    // Reset all players
    room.players.forEach(player => {
        player.position = 0;
        player.speed = 0;
        player.keyCount = 0;
        player.isWinner = false;
        player.lastKeyTime = Date.now();
    });

    io.to(room.roomCode).emit('gameStarted');
    console.log(`Game started in room ${room.roomCode} with ${room.players.size} players`);

    // Start game loop for this room
    roomGameLoop(room);
}

function roomGameLoop(room) {
    if (!room.gameActive) return;

    const currentTime = Date.now();
    let gameEnded = false;

    // Calculate sabotage effects between players
    calculateSabotageEffects(room);

    // Update all players
    room.players.forEach(player => {
        // Handle AI behavior for race mode
        if (player.isAI) {
            player.simulateRaceAI(currentTime);
        }

        const won = player.move(currentTime);
        if (won) {
            gameEnded = true;
            room.winner = player;
        }
    });

    // Broadcast updated positions
    broadcastGameState(room);

    // Check if game should end
    if (gameEnded) {
        endRoomGame(room);
    } else {
        // Continue game loop
        setTimeout(() => roomGameLoop(room), 50); // 20 FPS
    }
}

// Calculate how much each player slows down others based on their key spam rate
function calculateSabotageEffects(room) {
    const players = Array.from(room.players.values());

    players.forEach(player => {
        // Reset slowdown effect
        player.slowdownEffect = 0;

        // Calculate total sabotage from all other players
        players.forEach(otherPlayer => {
            if (otherPlayer.id !== player.id) {
                player.slowdownEffect += otherPlayer.sabotageLevel;
            }
        });

        // Cap maximum slowdown at 50% (to prevent complete stopping)
        player.slowdownEffect = Math.min(50, player.slowdownEffect);

        // Decay sabotage level over time if not key spamming
        const timeSinceLastKey = Date.now() - player.lastKeyTime;
        if (timeSinceLastKey > 500) {
            player.sabotageLevel = Math.max(0, player.sabotageLevel - 1);
        }
    });
}

function endRoomGame(room) {
    room.gameActive = false;

    if (room.winner) {
        // Determine if host controls should be shown (rooms with 2+ players)
        const hostControls = room.players.size >= 2;

        io.to(room.roomCode).emit('gameEnded', {
            winner: {
                id: room.winner.id,
                name: room.winner.name,
                keyCount: room.winner.keyCount
            },
            hostControls: hostControls
        });

        console.log(`Game ended in room ${room.roomCode}. Winner: ${room.winner.name}`);

        if (hostControls) {
            // Store restart timeout ID for potential cancellation
            room.restartTimeout = setTimeout(() => {
                if (room.players.size > 0 && rooms.has(room.roomCode)) {
                    startRoomGame(room);
                }
            }, 10000); // Extended to 10 seconds for host decision
        } else {
            // Auto-restart after 5 seconds for single player
            setTimeout(() => {
                if (room.players.size > 0 && rooms.has(room.roomCode)) {
                    startRoomGame(room);
                }
            }, 5000);
        }
    }
}

function broadcastGameState(room) {
    const playersData = Array.from(room.players.values()).map(player => ({
        id: player.id,
        name: player.name,
        position: player.position,
        speed: player.speed,
        keyCount: player.keyCount,
        icon: player.icon,
        isWinner: player.isWinner,
        sabotageLevel: player.sabotageLevel,
        slowdownEffect: player.slowdownEffect
    }));

    // Sort by position for leaderboard
    const sortedPlayers = [...playersData].sort((a, b) => b.position - a.position);

    io.to(room.roomCode).emit('gameStateUpdate', {
        players: playersData,
        leaderboard: sortedPlayers,
        playerCount: room.players.size,
        maxPlayers: room.maxPlayers,
        gameActive: room.gameActive,
        roomName: room.roomName,
        winner: room.winner ? {
            id: room.winner.id,
            name: room.winner.name
        } : null
    });
}

function broadcastLobbyUpdate(room) {
    const playersData = Array.from(room.players.values()).map(player => ({
        id: player.id,
        name: player.name,
        icon: player.icon,
        isOwner: player.id === room.ownerId,
        isAI: player.isAI || false,
        difficulty: player.difficulty || null
    }));

    io.to(room.roomCode).emit('lobbyUpdate', {
        roomCode: room.roomCode,
        roomName: room.roomName,
        maxPlayers: room.maxPlayers,
        playerCount: room.players.size,
        players: playersData,
        chatMessages: room.chatMessages,
        canStartGame: room.canStartGame(),
        ownerId: room.ownerId,
        gameMode: room.gameMode
    });
}

// Battle mode game functions
function startBattleGame(room) {
    room.gameActive = true;
    room.winner = null;
    room.battleStartTime = Date.now();

    // Reset all players for battle
    room.players.forEach(player => {
        player.resetForBattle();
    });

    io.to(room.roomCode).emit('battleStarted');
    console.log(`Battle started in room ${room.roomCode} with ${room.players.size} players`);

    // Start battle timer
    room.timerInterval = setInterval(() => {
        room.battleTimer--;
        io.to(room.roomCode).emit('battleTimer', room.battleTimer);

        if (room.battleTimer <= 0 || room.checkBattleEnd()) {
            clearInterval(room.timerInterval);
            endBattleGame(room);
        }
    }, 1000);

    // Start word generation and battle loop
    battleGameLoop(room);
}

function battleGameLoop(room) {
    if (!room.gameActive) return;

    const currentTime = Date.now();

    // Generate new words periodically
    if (room.currentWords.size < 3 && Math.random() < 0.3) {
        const newWord = room.generateWord();
        if (newWord) {
            io.to(room.roomCode).emit('newWord', newWord);
        }
    }

    // Handle AI players for battle mode
    room.players.forEach(player => {
        if (player.isAI && player.health > 0) {
            const completedWord = player.simulateBattleAI(currentTime, room.currentWords);
            if (completedWord) {
                // Process AI word completion
                const attackResult = room.processWordCompletion(player.id, completedWord.text);
                if (attackResult) {
                    player.completeWord(attackResult.word, 500); // Assume 500ms typing time for AI
                    io.to(room.roomCode).emit('battleAction', attackResult);

                    if (room.checkBattleEnd()) {
                        endBattleGame(room);
                        return;
                    }
                }
            }
        }
    });

    // Remove old words (timeout after 10 seconds)
    const now = Date.now();
    for (const [wordId, word] of room.currentWords.entries()) {
        if (now - word.createdAt > 10000) {
            room.currentWords.delete(wordId);
            io.to(room.roomCode).emit('wordExpired', wordId);
        }
    }

    // Broadcast battle state
    broadcastBattleState(room);

    // Continue battle loop
    if (room.gameActive) {
        setTimeout(() => battleGameLoop(room), 1000); // 1 FPS for battle updates
    }
}

function endBattleGame(room) {
    room.gameActive = false;

    if (room.timerInterval) {
        clearInterval(room.timerInterval);
        room.timerInterval = null;
    }

    if (room.winner) {
        // Determine if host controls should be shown (rooms with 2+ players)
        const hostControls = room.players.size >= 2;

        io.to(room.roomCode).emit('battleEnded', {
            winner: {
                id: room.winner.id,
                name: room.winner.name,
                hits: room.winner.hits,
                wordsTyped: room.winner.wordsTyped,
                wpm: room.winner.wpm,
                accuracy: room.winner.accuracy
            },
            hostControls: hostControls
        });

        console.log(`Battle ended in room ${room.roomCode}. Winner: ${room.winner.name}`);

        if (hostControls) {
            // Store restart timeout ID for potential cancellation
            room.restartTimeout = setTimeout(() => {
                if (room.players.size > 0 && rooms.has(room.roomCode)) {
                    startBattleGame(room);
                }
            }, 10000); // Extended to 10 seconds for host decision
        } else {
            // Auto-restart after 10 seconds for single player
            setTimeout(() => {
                if (room.players.size > 0 && rooms.has(room.roomCode)) {
                    startBattleGame(room);
                }
            }, 10000);
        }
    }
}

function broadcastBattleState(room) {
    const playersData = Array.from(room.players.values()).map(player => ({
        id: player.id,
        name: player.name,
        health: player.health,
        maxHealth: player.maxHealth,
        hits: player.hits,
        wordsTyped: player.wordsTyped,
        wpm: player.wpm,
        accuracy: player.accuracy,
        icon: player.icon,
        isWinner: player.isWinner
    }));

    const wordsData = Array.from(room.currentWords.values());

    io.to(room.roomCode).emit('battleStateUpdate', {
        players: playersData,
        words: wordsData,
        playerCount: room.players.size,
        maxPlayers: room.maxPlayers,
        gameActive: room.gameActive,
        roomName: room.roomName,
        battleTimer: room.battleTimer,
        winner: room.winner ? {
            id: room.winner.id,
            name: room.winner.name
        } : null
    });
}

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚂 Keyboard Breaker server running on port ${PORT}`);
    console.log(`🌐 Open http://localhost:${PORT} to play!`);
});