import { Game } from './game.js';
import { WalletManager } from './wallet.js';
import { GameModal } from './modal.js';
import { LobbyManager } from './lobbyManager.js';
import { FirebaseGameService } from './firebaseService.js';

document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM Content Loaded');
    
    const gameService = new FirebaseGameService();
    const game = new Game();
    const walletManager = new WalletManager();
    const lobbyManager = new LobbyManager(gameService, walletManager);
    
    // Create a message element for wallet connection prompt
    const messageElement = document.createElement('div');
    messageElement.id = 'wallet-message';
    messageElement.textContent = 'Please connect your wallet to start the game';
    messageElement.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        color: white;
        font-size: 18px;
        text-align: center;
        background-color: rgba(0, 0, 0, 0.8);
        padding: 20px;
        border-radius: 10px;
        z-index: 100;
    `;
    document.getElementById('game-container').appendChild(messageElement);

    // Initialize wallet connection with explicit error handling
    const connectWalletBtn = document.getElementById('connect-wallet');
    if (connectWalletBtn) {
        connectWalletBtn.addEventListener('click', async () => {
            try {
                console.log('Connect wallet button clicked');
                await walletManager.connect();
                // Set wallet in gameService after successful connection
                gameService.setWallet(walletManager);
            } catch (error) {
                console.error('Error connecting wallet:', error);
                alert('Failed to connect wallet. Please try again.');
            }
        });
    } else {
        console.error('Connect wallet button not found in the DOM');
    }
    
    // Update wallet connection callback
    walletManager.onConnect = async () => {
        console.log('Wallet connected');
        // Set wallet in gameService here as well
        gameService.setWallet(walletManager);
        messageElement.remove();
        
        // Show game mode selection
        lobbyManager.showGameModeSelection(
            // Single player callback
            async () => {
                try {
                    await game.init();
                } catch (error) {
                    console.error('Error starting single player game:', error);
                }
            },
            // Multiplayer callback
            async (lobbyState) => {
                try {
                    // Initialize multiplayer game with lobby state
                    await game.initMultiplayer(lobbyState);
                } catch (error) {
                    console.error('Error starting multiplayer game:', error);
                }
            }
        );
    };
}); 