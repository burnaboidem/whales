import { Player } from './player.js';
import { FishManager } from './fish.js';
import { AssetLoader } from './assetLoader.js';
import { FirebaseGameService } from './firebaseService.js';
import { GameModal } from './modal.js';
import { AnimationManager } from './animationManager.js';

export class Game {
    constructor() {
        console.log('Game constructor called');
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.canvas.width = 800;
        this.canvas.height = 600;
        
        this.players = [];
        this.fishManager = new FishManager();
        this.timeRemaining = 150; // 2:30 in seconds
        this.isRunning = false;
        this.gameService = new FirebaseGameService();
        
        // Add mouse position tracking
        this.mouseX = 0;
        this.mouseY = 0;
        this.activePlayer = null; // Track which player is currently aiming
        this.player = null; // Single player reference
        this.animationManager = new AnimationManager();
        this.notification = null;
        this.notificationTimeout = null;
        this.setupStopButton();
    }

    async init() {
        console.log('Game initialization started');
        try {
            await AssetLoader.load();
            
            // Initialize single player
            this.player = new Player(400, 200, 'Player 1');
            
            // Initialize fish
            this.fishManager.init();
            console.log('Fish manager initialized');
            
            // Setup input handlers
            this.setupControls();
            console.log('Controls setup');

            try {
                // Create game in Firebase
                await this.gameService.createGame('Player 1', 'Player 2');
                console.log('Firebase game created');

                // Subscribe to game updates
                this.gameService.subscribeToGameUpdates((gameState) => {
                    console.log('Game state update received:', gameState);
                    this.handleGameStateUpdate(gameState);
                });
            } catch (firebaseError) {
                console.error('Firebase initialization failed:', firebaseError);
                // Continue anyway to test game rendering
            }

            // Show game instructions modal
            GameModal.show('Welcome to Solana Fishing!', () => {
                this.start();
            });

            console.log('Game initialization completed');
        } catch (error) {
            console.error('Error during game initialization:', error);
            throw error;
        }

        this.testRender();

        this.updateScoreDisplay(); // Initialize the score display
    }

    handleGameStateUpdate(gameState) {
        try {
            if (gameState.status === 'completed') {
                this.endGame(gameState.winner);
                return;
            }

            // Update player scores
            this.players.forEach((player, index) => {
                const playerId = `Player ${index + 1}`;
                player.score = gameState.scores[playerId] || 0;
            });

            this.updateScoreDisplay();
        } catch (error) {
            console.error('Error in handleGameStateUpdate:', error);
        }
    }

    async updatePlayerScore(player) {
        try {
            const playerId = player.name;
            await this.gameService.updatePlayerScore(playerId, player.score);
        } catch (error) {
            console.error('Error in updatePlayerScore:', error);
            // Continue game even if score update fails
        }
    }

    start() {
        console.log('Game starting');
        this.isRunning = true;
        this.gameLoop();
        this.startTimer();
        console.log('Game started');
    }

    gameLoop() {
        if (!this.isRunning) {
            console.log('Game loop stopped');
            return;
        }

        try {
            this.update();
            this.render();
            requestAnimationFrame(() => this.gameLoop());
        } catch (error) {
            console.error('Error in game loop:', error);
            // Continue the game loop even if there's an error
            requestAnimationFrame(() => this.gameLoop());
        }
    }

    update() {
        try {
            this.player.update();
            this.fishManager.update();
            this.checkCollisions();
            
            // Update animations
            this.animationManager.update(Date.now());
        } catch (error) {
            console.error('Error in update:', error);
        }
    }

    render() {
        if (!this.ctx) {
            console.error('Canvas context is not initialized');
            return;
        }

        // Clear the canvas first
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw sky
        this.ctx.fillStyle = '#87CEEB';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw water
        this.ctx.fillStyle = '#1E90FF';
        this.ctx.fillRect(0, 200, this.canvas.width, this.canvas.height - 200);
        
        // Draw game elements
        this.player.render(this.ctx);
        this.fishManager.render(this.ctx);

        // Render animations last
        this.animationManager.render(this.ctx, Date.now());
    }

    checkCollisions() {
        if (this.player.isFishing) {
            const caught = this.fishManager.checkFishingCollision(this.player.hookPosition);
            
            if (caught) {
                let points = 0;
                let isRainbow = false;

                switch(caught) {
                    case 'rainbow':
                        points = 5;
                        isRainbow = true;
                        break;
                    case 'whale':
                        points = -5;
                        break;
                    case 'regular':
                        points = 1;
                        break;
                }

                // Create animation using the manager
                this.animationManager.createAnimation(
                    this.player.hookPosition.x,
                    this.player.hookPosition.y,
                    points,
                    isRainbow
                );
                
                // Update score
                const newScore = this.player.updateScore(points);
                this.updateScoreDisplay();
                this.player.toggleFishing();
            }
        }
    }

    startTimer() {
        const timerElement = document.getElementById('timer');
        const timer = setInterval(() => {
            this.timeRemaining--;
            const minutes = Math.floor(this.timeRemaining / 60);
            const seconds = this.timeRemaining % 60;
            timerElement.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            
            // Check for game events based on time
            if (this.timeRemaining % 30 === 0 && this.timeRemaining > 0) {
                // Add new whale
                this.fishManager.increaseWhaleCount();
                this.showNotification('WARNING: New Whale Appeared! 🐋');

                // Increase speed (except at game start)
                if (this.timeRemaining < 150) { // Don't increase speed at 2:30
                    this.fishManager.increaseSpeeds();
                    const multiplier = this.fishManager.currentSpeedMultiplier;
                    this.showNotification(`SPEED INCREASED TO ${multiplier}x! 🐟💨`, 3000);
                }
            }
            
            if (this.timeRemaining <= 0) {
                clearInterval(timer);
                this.endGame();
            }
        }, 1000);
    }

    async endGame() {
        this.isRunning = false;
        this.fishManager.resetSpeeds(); // Reset speeds when game ends
        
        // Create custom end game message
        const endGameMessage = `
            <p class="end-score">Final Score: ${this.player.score} fish</p>
            <div class="score-breakdown">
                <p>Game Over!</p>
                ${this.player.score > 10 ? '<p class="bonus-message">Great job!</p>' : ''}
            </div>
        `;

        try {
            await this.gameService.endGame(this.player.name);
        } catch (error) {
            console.error('Error ending game:', error);
        }

        // Show the modal with end game message
        GameModal.show('Game Over', () => {
            // Reset game state
            this.player.score = 0;
            this.timeRemaining = 150;
            this.updateScoreDisplay();
            // Start new game
            this.start();
        }, endGameMessage); // Pass the custom message to the modal
    }

    setupControls() {
        // Keyboard controls for movement
        window.addEventListener('keydown', (e) => {
            if ((e.key === 'a' || e.key === 'ArrowLeft')) this.player.moveLeft();
            if ((e.key === 'd' || e.key === 'ArrowRight')) this.player.moveRight();
        });

        // Mouse controls for aiming and fishing
        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.mouseX = e.clientX - rect.left;
            this.mouseY = e.clientY - rect.top;
            
            if (!this.player.isFishing) {
                this.player.updateTargetAngle(this.mouseX, this.mouseY);
            }
        });

        // Modified click handler to toggle fishing state
        this.canvas.addEventListener('click', () => {
            // Toggle fishing state on every click
            this.player.toggleFishing();
        });
    }

    updateScoreDisplay() {
        const scoreElement = document.getElementById('player1-score');
        if (scoreElement) {
            scoreElement.textContent = `Score: ${this.player.score} fish`;
        }
    }

    testRender() {
        console.log('Testing canvas render');
        if (!this.ctx) {
            console.error('Canvas context is not initialized');
            return;
        }

        // Draw a test pattern
        this.ctx.fillStyle = 'red';
        this.ctx.fillRect(0, 0, 100, 100);
        this.ctx.fillStyle = 'blue';
        this.ctx.fillRect(100, 100, 100, 100);
        console.log('Test render completed');
    }

    setupStopButton() {
        const stopButton = document.getElementById('stop-game');
        if (stopButton) {
            stopButton.addEventListener('click', () => {
                // Show confirmation modal instead of alert
                const confirmMessage = `
                    <p class="confirm-message">Are you sure you want to stop the game?</p>
                    <div class="button-container">
                        <button class="win95-button" id="confirm-stop">Yes</button>
                        <button class="win95-button" id="cancel-stop">No</button>
                    </div>
                `;

                const modalOverlay = document.createElement('div');
                modalOverlay.className = 'modal-overlay';
                
                const modalContent = document.createElement('div');
                modalContent.className = 'modal-content confirm-modal';
                
                const titleBar = document.createElement('h2');
                titleBar.textContent = 'Confirm Stop';
                
                const content = document.createElement('div');
                content.className = 'modal-body';
                content.innerHTML = confirmMessage;
                
                modalContent.appendChild(titleBar);
                modalContent.appendChild(content);
                modalOverlay.appendChild(modalContent);
                document.body.appendChild(modalOverlay);

                // Handle confirmation buttons
                document.getElementById('confirm-stop').onclick = () => {
                    modalOverlay.remove();
                    this.stopGame();
                };

                document.getElementById('cancel-stop').onclick = () => {
                    modalOverlay.remove();
                };
            });
        }
    }

    stopGame() {
        this.isRunning = false;
        this.fishManager.resetSpeeds(); // Reset speeds when game stops
        
        const stopGameMessage = `
            <p class="end-score">Final Score: ${this.player.score} fish</p>
            <p>Game stopped</p>
        `;

        GameModal.show('Game Stopped', () => {
            // Reset game state
            this.player.score = 0;
            this.timeRemaining = 150;
            this.updateScoreDisplay();
            // Start new game
            this.start();
        }, stopGameMessage);
    }

    showNotification(message, duration = 2000) {
        // Clear any existing notification
        if (this.notificationTimeout) {
            clearTimeout(this.notificationTimeout);
        }
        
        // Create or update notification element
        if (!this.notification) {
            this.notification = document.createElement('div');
            this.notification.className = 'game-notification';
            document.getElementById('game-container').appendChild(this.notification);
        }
        
        // Show new message
        this.notification.textContent = message;
        this.notification.classList.add('show');
        
        // Hide after duration
        this.notificationTimeout = setTimeout(() => {
            this.notification.classList.remove('show');
        }, duration);
    }

    async initMultiplayer() {
        this.isMatchmaking = true;
        this.showNotification('Waiting in lobby...', 10000);
        
        try {
            // Add self to lobby
            await this.gameService.joinLobby({
                wallet: this.playerWallet,
                timestamp: Date.now(),
                status: 'waiting'
            });

            // Listen for other players in lobby
            this.gameService.onLobbyUpdate((players) => {
                this.updateLobbyPlayers(players);
            });

            // Wait for match
            const matchResult = await this.gameService.findMatch(this.playerWallet);
            
            // Clean up lobby listeners
            this.gameService.leaveLobby(this.playerWallet);
            
            // ... rest of existing multiplayer init code ...
        } catch (error) {
            console.error('Lobby error:', error);
            this.showNotification('Failed to join lobby. Please try again.', 3000);
            throw error;
        }
    }

    updateLobbyPlayers(players) {
        // Clear existing lobby players
        this.players = [];
        
        // Position players in a circle or grid in the lobby
        players.forEach((player, index) => {
            const angle = (2 * Math.PI * index) / players.length;
            const radius = 150; // Adjust based on your canvas size
            const centerX = this.canvas.width / 2;
            const centerY = this.canvas.height / 2;
            
            const x = centerX + radius * Math.cos(angle);
            const y = centerY + radius * Math.sin(angle);
            
            const newPlayer = new Player(x, y, player.wallet);
            newPlayer.isLocal = player.wallet === this.playerWallet;
            this.players.push(newPlayer);
            
            if (newPlayer.isLocal) {
                this.localPlayer = newPlayer;
            }
        });
    }
} 