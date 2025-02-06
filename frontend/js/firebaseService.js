import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, onValue, update, push, remove, get } from 'firebase/database';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseConfig } from './firebase-config.js';
import { ESCROW_PUBLIC_KEY } from './constants.js';

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

    async recordTransaction(lobbyId, walletAddress, transactionSignature) {
        try {
            const transactionRef = ref(db, `lobbies/${lobbyId}/transactions/${transactionSignature}`);
            const lobbyRef = ref(db, `lobbies/${lobbyId}`);
            
            // Check if this transaction signature has been used
            const existingTransaction = await get(ref(db, `lobbies/${lobbyId}/transactions`));
            if (existingTransaction.exists()) {
                const transactions = existingTransaction.val();
                const isDuplicate = Object.values(transactions).some(
                    tx => tx.transactionSignature === transactionSignature
                );
                if (isDuplicate) {
                    throw new Error('Transaction signature already used');
                }
            }

            const timestamp = Date.now();

            // Record new transaction
            await set(transactionRef, {
                timestamp,
                amount: '0.1',
                walletAddress,
                status: 'pending',
                transactionSignature
            });

            // If this is the first transaction, record the timestamp in the lobby
            const lobbySnapshot = await get(lobbyRef);
            const lobbyData = lobbySnapshot.val();
            if (!lobbyData.firstTransactionTimestamp) {
                await update(lobbyRef, {
                    firstTransactionTimestamp: timestamp
                });
            }

            return { transactionRef, timestamp };
        } catch (error) {
            console.error('Error recording transaction:', error);
            throw error;
        }
    }

    async updateTransactionStatus(lobbyId, transactionSignature, status, failureReason = null) {
        try {
            const transactionRef = ref(db, `lobbies/${lobbyId}/transactions/${transactionSignature}`);
            const updates = {
                status,
                ...(failureReason && { failureReason })
            };
            await update(transactionRef, updates);
        } catch (error) {
            console.error('Error updating transaction status:', error);
            throw error;
        }
    }

    async getTransactions(lobbyId) {
        try {
            const transactionsRef = ref(db, `lobbies/${lobbyId}/transactions`);
            const snapshot = await get(transactionsRef);
            return snapshot;
        } catch (error) {
            console.error('Error getting transactions:', error);
            throw error;
        }
    }

    getEscrowAddress() {
        if (!ESCROW_PUBLIC_KEY) {
            throw new Error('Escrow public key not configured');
        }
        return ESCROW_PUBLIC_KEY;
    }

    async requestRefund(lobbyId, transactionSignature) {
        try {
            const requestRefundFunction = httpsCallable(functions, 'requestRefund');
            return await requestRefundFunction({ lobbyId, transactionSignature });
        } catch (error) {
            console.error('Error requesting refund:', error);
            throw error;
        }
    }

    async verifyPayment(lobbyId, transactionSignature) {
        try {
            const verifyPaymentFunction = httpsCallable(functions, 'verifyGameEntry');
            const result = await verifyPaymentFunction({ 
                lobbyId, 
                transactionSignature 
            });
            return result.data;
        } catch (error) {
            console.error('Error verifying payment:', error);
            throw error;
        }
    }

    async updateLobbyPaymentStatus(lobbyId, playerWallet, status) {
        try {
            const lobbyRef = ref(db, `lobbies/${lobbyId}`);
            const snapshot = await get(lobbyRef);
            const lobby = snapshot.val();
            
            if (!lobby || !lobby.players) {
                throw new Error('Lobby not found');
            }

            // Find the player in the array
            const playerIndex = lobby.players.findIndex(p => p.id === playerWallet);
            if (playerIndex === -1) {
                throw new Error('Player not found in lobby');
            }

            // Update the specific player's payment status
            await update(ref(db, `lobbies/${lobbyId}/players/${playerIndex}`), {
                paymentStatus: status
            });

            // Also update the transaction status
            const transactionsRef = ref(db, `lobbies/${lobbyId}/transactions`);
            const txSnapshot = await get(transactionsRef);
            const transactions = txSnapshot.val();

            if (transactions) {
                // Find the latest transaction for this player
                const playerTx = Object.entries(transactions).find(([_, tx]) => 
                    tx.walletAddress === playerWallet && tx.status === 'pending'
                );

                if (playerTx) {
                    const [txId, _] = playerTx;
                    await update(ref(db, `lobbies/${lobbyId}/transactions/${txId}`), {
                        status: 'confirmed'
                    });
                }
            }
        } catch (error) {
            console.error('Error updating lobby payment status:', error);
            throw error;
        }
    }

    async getFirstTransactionTimestamp(lobbyId) {
        try {
            const lobbyRef = ref(db, `lobbies/${lobbyId}`);
            const snapshot = await get(lobbyRef);
            const lobbyData = snapshot.val();
            return lobbyData.firstTransactionTimestamp || null;
        } catch (error) {
            console.error('Error getting first transaction timestamp:', error);
            throw error;
        }
    }
} 