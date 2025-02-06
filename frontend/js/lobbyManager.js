import { GameModal } from './modal.js';

export class LobbyManager {
    constructor(gameService, walletManager) {
        this.gameService = gameService;
        this.walletManager = walletManager;
        this.currentLobbyId = null;
        this.playerCount = 0;
        this.maxPlayers = 2;
        this.paymentRequested = false;
    }

    showGameModeSelection(onSinglePlayer, onMultiPlayer) {
        const modeSelectMessage = `
            <div class="mode-selection">
                <p>Select Game Mode:</p>
                <div class="button-container">
                    <button class="win95-button" id="single-player">Single Player</button>
                    <button class="win95-button" id="multi-player">Multiplayer (0.1 SOL Entry)</button>
                </div>
            </div>
        `;

        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'modal-overlay';
        
        const modalContent = document.createElement('div');
        modalContent.className = 'modal-content mode-select-modal';
        
        const titleBar = document.createElement('h2');
        titleBar.textContent = 'Select Game Mode';
        
        const content = document.createElement('div');
        content.className = 'modal-body';
        content.innerHTML = modeSelectMessage;
        
        modalContent.appendChild(titleBar);
        modalContent.appendChild(content);
        modalOverlay.appendChild(modalContent);
        document.body.appendChild(modalOverlay);

        // Handle mode selection
        document.getElementById('single-player').onclick = () => {
            modalOverlay.remove();
            onSinglePlayer();
        };

        document.getElementById('multi-player').onclick = () => {
            modalOverlay.remove();
            this.joinMultiplayerLobby(onMultiPlayer);
        };
    }

    async joinMultiplayerLobby(onMatchFound) {
        try {
            console.log('Starting multiplayer lobby join process...');
            this.showSearchingModal();
            
            // Join or create lobby
            console.log('Joining or creating lobby...');
            const lobbyData = await this.gameService.joinLobby();
            this.currentLobbyId = lobbyData.lobbyId;
            console.log('Joined lobby:', this.currentLobbyId);

            // Listen for lobby updates
            console.log('Setting up lobby listener...');
            this.gameService.subscribeLobbyUpdates(this.currentLobbyId, async (lobbyState) => {
                console.log('Lobby state updated:', lobbyState);
                
                // Update lobby UI
                this.updateLobbyPlayers(lobbyState);
                
                if (lobbyState.status === 'matched' && !this.paymentRequested) {
                    this.paymentRequested = true;
                    
                    // Show payment request modal
                    GameModal.show('Payment Required', async () => {
                        try {
                            // Request payment
                            await this.walletManager.payGameEntry(this.currentLobbyId);
                            console.log('Entry fee payment successful');
                            
                            // Update payment status in lobby
                            await this.gameService.updatePaymentStatus(
                                this.currentLobbyId, 
                                this.walletManager.getPublicKey().toString(),
                                'paid'
                            );
                        } catch (error) {
                            console.error('Payment failed:', error);
                            await this.leaveLobby();
                            GameModal.show('Error', () => {}, 
                                `Failed to process payment. Error: ${error.message || 'Unknown error'}`);
                        }
                    }, `
                        <div class="payment-request">
                            <p>Match found! Please deposit 0.1 SOL to start the game.</p>
                            <p>Both players must deposit to begin.</p>
                        </div>
                    `);
                }
                
                // Start game when all players have paid
                if (lobbyState.status === 'ready') {
                    onMatchFound(lobbyState);
                }
            });
        } catch (error) {
            console.error('Detailed error in joinMultiplayerLobby:', error);
            this.hideSearchingModal();
            GameModal.show('Error', () => {}, 
                `Failed to join multiplayer. Error: ${error.message || 'Unknown error'}`);
        }
    }

    showSearchingModal() {
        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'modal-overlay';
        modalOverlay.id = 'searching-modal';
        
        const modalContent = document.createElement('div');
        modalContent.className = 'modal-content searching-modal';
        
        const lobbyContent = `
            <div class="lobby-container">
                <div class="lobby-header">
                    Multiplayer Lobby
                </div>
                <div class="lobby-players" id="lobby-players">
                    <div class="player-item current-user">
                        <div class="player-info">
                            <div class="player-address">${this.walletManager.getPublicKey().toString()}</div>
                            <div class="player-status">Searching...</div>
                        </div>
                    </div>
                </div>
                <div class="lobby-status" id="lobby-status">
                    Searching for opponent...
                </div>
                <button class="win95-button" id="cancel-search">Leave Lobby</button>
            </div>
        `;
        
        modalContent.innerHTML = `
            <h2>Matchmaking</h2>
            <div class="modal-body">${lobbyContent}</div>
        `;
        
        modalOverlay.appendChild(modalContent);
        document.body.appendChild(modalOverlay);

        // Handle cancel button
        document.getElementById('cancel-search').onclick = () => {
            this.leaveLobby();
            this.hideSearchingModal();
        };
    }

    hideSearchingModal() {
        const modal = document.getElementById('searching-modal');
        if (modal) modal.remove();
    }

    async leaveLobby() {
        if (this.currentLobbyId) {
            await this.gameService.leaveLobby(this.currentLobbyId);
            this.currentLobbyId = null;
        }
    }

    updateLobbyPlayers(lobbyState) {
        console.log('Updating lobby players:', lobbyState);
        const playersContainer = document.getElementById('lobby-players');
        const statusContainer = document.getElementById('lobby-status');
        const currentPlayerId = this.walletManager.getPublicKey().toString();
        
        if (playersContainer && lobbyState.players) {
            console.log('Current players:', lobbyState.players);
            playersContainer.innerHTML = lobbyState.players.map(player => `
                <div class="player-item ${player.id === currentPlayerId ? 'current-user' : ''} 
                                        ${lobbyState.status === 'matched' ? 'matched' : ''}">
                    <div class="player-info">
                        <div class="player-address">${this.formatAddress(player.id)}</div>
                        <div class="player-status">
                            ${this.getPlayerStatus(player, lobbyState.status)}
                        </div>
                    </div>
                </div>
            `).join('');

            if (statusContainer) {
                const status = this.getLobbyStatus(lobbyState);
                console.log('Setting lobby status:', status);
                statusContainer.textContent = status;
            }
        }
    }

    formatAddress(address) {
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    }

    getPlayerStatus(player, lobbyStatus) {
        if (lobbyStatus === 'matched') {
            return player.paymentStatus === 'paid' ? 'Ready to Play' : 'Waiting for Payment';
        }
        return 'Searching...';
    }

    getLobbyStatus(lobbyState) {
        switch (lobbyState.status) {
            case 'waiting':
                return 'Searching for opponent...';
            case 'matched':
                return 'Match found! Waiting for payments...';
            case 'ready':
                return 'Starting game...';
            default:
                return 'Searching...';
        }
    }
} 