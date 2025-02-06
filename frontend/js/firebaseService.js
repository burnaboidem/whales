import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, onValue, update, push, remove, get } from 'firebase/database';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const functions = getFunctions(app);

export class FirebaseGameService {
    constructor() {
        this.gameRef = null;
        this.gameId = null;
        this.lobbyRef = null;
        this.lobbyListener = null;
        this.wallet = null;
    }

    setWallet(walletManager) {
        this.wallet = walletManager.wallet;
    }

    async createGame(player1, player2) {
        const createGameFunction = httpsCallable(functions, 'createGame');
        const result = await createGameFunction({ player1, player2 });
        this.gameId = result.data.gameId;
        this.gameRef = ref(db, `games/${this.gameId}`);
        return this.gameId;
    }

    subscribeToGameUpdates(callback) {
        if (!this.gameRef) throw new Error('No active game');
        return onValue(this.gameRef, (snapshot) => {
            const gameState = snapshot.val();
            callback(gameState);
        });
    }

    async updateGameState(update) {
        if (!this.gameRef) throw new Error('No active game');
        await update(this.gameRef, update);
    }

    async updatePlayerScore(playerId, newScore) {
        if (!this.gameRef) throw new Error('No active game');
        await update(this.gameRef, {
            [`scores/${playerId}`]: newScore
        });
    }

    async endGame(winnerId) {
        if (!this.gameRef) throw new Error('No active game');
        await update(this.gameRef, {
            status: 'completed',
            winner: winnerId,
            endTime: Date.now()
        });
    }

    async joinLobby() {
        if (!this.wallet) {
            throw new Error('Wallet not initialized');
        }

        try {
            console.log('Attempting to join lobby with wallet:', this.wallet.publicKey.toString());
            const joinLobbyFunction = httpsCallable(functions, 'joinLobby');
            const result = await joinLobbyFunction({ 
                playerId: this.wallet.publicKey.toString() 
            });
            
            console.log('Join lobby result:', result.data);
            const lobbyId = result.data.lobbyId;
            
            if (!lobbyId) {
                throw new Error('No lobby ID returned from server');
            }
            
            this.lobbyRef = ref(db, `lobbies/${lobbyId}`);
            
            // Set up real-time listener for this lobby
            onValue(this.lobbyRef, (snapshot) => {
                const lobbyData = snapshot.val();
                console.log('Real-time lobby update:', lobbyData);
            });
            
            return { lobbyId };
        } catch (error) {
            console.error('Detailed error joining lobby:', error);
            throw error;
        }
    }

    subscribeLobbyUpdates(lobbyId, callback) {
        if (this.lobbyListener) {
            off(this.lobbyListener);
        }

        console.log('Setting up lobby listener for:', lobbyId);
        this.lobbyRef = ref(db, `lobbies/${lobbyId}`);
        this.lobbyListener = onValue(this.lobbyRef, (snapshot) => {
            const lobbyData = snapshot.val();
            console.log('Lobby update received:', lobbyData);
            if (lobbyData) {
                callback(lobbyData);
            }
        });
    }

    async leaveLobby(lobbyId) {
        try {
            if (this.lobbyListener) {
                off(this.lobbyListener);
                this.lobbyListener = null;
            }

            if (this.lobbyRef) {
                const snapshot = await get(this.lobbyRef);
                const lobbyData = snapshot.val();

                if (lobbyData) {
                    // Remove player from lobby
                    const updatedPlayers = lobbyData.players.filter(
                        player => player.id !== this.wallet.publicKey.toString()
                    );

                    if (updatedPlayers.length === 0) {
                        // Delete lobby if empty
                        await remove(this.lobbyRef);
                    } else {
                        // Update players list
                        await update(this.lobbyRef, {
                            players: updatedPlayers,
                            status: 'waiting'
                        });
                    }
                }

                this.lobbyRef = null;
            }
        } catch (error) {
            console.error('Error leaving lobby:', error);
            throw error;
        }
    }

    async startMultiplayerGame(lobbyId) {
        try {
            // Create a new multiplayer game
            const createGameFunction = httpsCallable(functions, 'createMultiplayerGame');
            const result = await createGameFunction({ lobbyId });
            this.gameId = result.data.gameId;
            this.gameRef = ref(db, `games/${this.gameId}`);

            // Update lobby status
            await update(this.lobbyRef, {
                status: 'in_game',
                gameId: this.gameId
            });

            return this.gameId;
        } catch (error) {
            console.error('Error starting multiplayer game:', error);
            throw error;
        }
    }

    async updateMultiplayerScore(playerId, score) {
        if (!this.gameRef) throw new Error('No active game');
        await update(this.gameRef, {
            [`scores/${playerId}`]: score,
            lastUpdated: Date.now()
        });
    }

    async updatePaymentStatus(lobbyId, playerId, status) {
        try {
            const updatePaymentFunction = httpsCallable(functions, 'updatePaymentStatus');
            await updatePaymentFunction({ lobbyId, playerId, status });
        } catch (error) {
            console.error('Error updating payment status:', error);
            throw error;
        }
    }
} 