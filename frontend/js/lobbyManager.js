import { GameModal } from './modal.js';
import { TransactionMonitorService } from './services/TransactionMonitorService.js';
import { TransactionMonitorModal } from './modals/TransactionMonitorModal.js';

export class LobbyManager {
    constructor(gameService, walletManager) {
        this.gameService = gameService;
        this.walletManager = walletManager;
        this.currentLobbyId = null;
        this.playerCount = 0;
        this.maxPlayers = 2;
        this.paymentRequested = false;
        this.transactionMonitor = new TransactionMonitorService();
        this.monitorModal = null;
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
                    
                    // Show payment request modal with correct button text
                    await this.handlePayment(this.currentLobbyId);
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

    async handlePayment(lobbyId) {
        let modalOverlay;
        let transactionSignature;
        
        try {
            // Check if user has already paid
            const transactionsSnapshot = await this.gameService.getTransactions(lobbyId);
            const userTransactions = Object.values(transactionsSnapshot.val() || {})
                .filter(tx => tx.walletAddress === this.walletManager.getPublicKey().toString());
            
            const hasPendingOrSuccess = userTransactions.some(
                tx => ['pending', 'success'].includes(tx.status)
            );
            
            if (hasPendingOrSuccess) {
                throw new Error('Payment already submitted');
            }

            // Create lobby display if it doesn't exist
            this.ensureLobbyDisplay();

            // Show initial payment modal
            modalOverlay = GameModal.showPaymentModal('Payment Required', async () => {
                try {
                    // Request payment
                    transactionSignature = await this.walletManager.payGameEntry(lobbyId);
                    
                    // Immediately show transaction monitor modal
                    this.monitorModal = new TransactionMonitorModal().show(
                        transactionSignature,
                        this.gameService.getEscrowAddress()
                    );

                    // Record transaction and get first transaction timestamp
                    await this.gameService.recordTransaction(
                        lobbyId,
                        this.walletManager.getPublicKey().toString(),
                        transactionSignature
                    );

                    // Get the first transaction timestamp for the timer
                    const firstTransactionTimestamp = await this.gameService.getFirstTransactionTimestamp(lobbyId);
                    
                    if (firstTransactionTimestamp) {
                        const elapsedTime = Date.now() - firstTransactionTimestamp;
                        const remainingTime = Math.max(300000 - elapsedTime, 0); // 5 minutes in ms
                        this.monitorModal.startRefundTimer(
                            async () => {
                                try {
                                    await this.gameService.requestRefund(lobbyId, transactionSignature);
                                    this.monitorModal.updateTransactionStatus('refund-requested');
                                } catch (error) {
                                    console.error('Error requesting refund:', error);
                                    this.monitorModal.updateTransactionStatus('refund-failed', { 
                                        error: error.message 
                                    });
                                }
                            },
                            remainingTime
                        );
                    }

                    // Start monitoring
                    this.transactionMonitor.monitorTransaction(
                        transactionSignature,
                        this.gameService.getEscrowAddress(),
                        async (update) => {
                            try {
                                if (update.type === 'balance') {
                                    this.monitorModal.updateEscrowBalance(update.balance);
                                } else {
                                    this.monitorModal.updateTransactionStatus(update.status, update);
                                    
                                    if (update.status === 'confirmed') {
                                        // First update the transaction status
                                        await this.gameService.updateTransactionStatus(
                                            lobbyId,
                                            transactionSignature,
                                            'confirmed'
                                        );

                                        // Then update the player's payment status
                                        await this.gameService.updateLobbyPaymentStatus(
                                            lobbyId,
                                            this.walletManager.getPublicKey().toString(),
                                            'paid'
                                        );
                                    }
                                }
                            } catch (error) {
                                console.error('Error updating status:', error);
                                this.monitorModal.updateTransactionStatus('error', { 
                                    error: 'Failed to update payment status' 
                                });
                            }
                        }
                    );

                } catch (error) {
                    console.error('Payment failed:', error);
                    if (this.monitorModal) {
                        this.monitorModal.updateTransactionStatus('failed', { error: error.message });
                    }
                }
            });

            // Position the payment modal next to the lobby
            this.positionModals();

        } catch (error) {
            console.error('Payment process error:', error);
            if (this.monitorModal) {
                this.monitorModal.updateTransactionStatus('failed', { error: error.message });
            }
        }
    }

    ensureLobbyDisplay() {
        if (!document.getElementById('lobby-container')) {
            const lobbyContainer = document.createElement('div');
            lobbyContainer.id = 'lobby-container';
            lobbyContainer.className = 'lobby-container';
            document.body.appendChild(lobbyContainer);
        }
    }

    positionModals() {
        const lobbyContainer = document.getElementById('lobby-container');
        if (!lobbyContainer) return;

        const lobbyRect = lobbyContainer.getBoundingClientRect();
        
        // Position payment/monitor modal to the right of the lobby
        const modalElements = document.querySelectorAll('.modal-content');
        modalElements.forEach((modal, index) => {
            modal.style.position = 'fixed';
            modal.style.left = `${lobbyRect.right + 20}px`;
            modal.style.top = `${lobbyRect.top + (index * 20)}px`;
            modal.style.transform = 'none';
        });
    }
} 