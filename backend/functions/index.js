const multiplayerFunctions = require('./multiplayer');
const functions = require('firebase-functions');
const cors = require('cors')({ origin: true });
const { admin, db } = require('./admin');
const { paymentManager } = require('./solanaPayments');
const { createMultiplayerGame, endMultiplayerGame, cleanupLobbies } = require('./multiplayer');
require('dotenv').config();

// Set up environment variables for functions
const escrowConfig = {
    privateKey: process.env.ESCROW_PRIVATE_KEY,
    publicKey: process.env.ESCROW_PUBLIC_KEY
};

exports.setFunctionsConfig = functions.https.onRequest(async (req, res) => {
    try {
        await admin.functions().setEnvironmentVariable('ESCROW_PRIVATE_KEY', escrowConfig.privateKey);
        await admin.functions().setEnvironmentVariable('ESCROW_PUBLIC_KEY', escrowConfig.publicKey);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Export multiplayer functions
exports.createMultiplayerGame = createMultiplayerGame;
exports.endMultiplayerGame = endMultiplayerGame;
exports.cleanupLobbies = cleanupLobbies;

// Create a new multiplayer game
exports.createGame = functions.https.onCall(async (data, context) => {
    try {
        // Create a new game entry
        const gameRef = db.ref('games').push();
        
        await gameRef.set({
            status: 'active',
            scores: {},
            players: [],
            createdAt: admin.database.ServerValue.TIMESTAMP
        });

        return { gameId: gameRef.key };
    } catch (error) {
        console.error('Error creating game:', error);
        throw new functions.https.HttpsError('internal', 'Failed to create game');
    }
});

// Create or join a lobby
exports.joinLobby = functions.https.onCall(async (data, context) => {
    try {
        console.log('Join lobby called with data:', data);
        const playerId = data.playerId;
        
        // First check for available lobbies
        const lobbiesRef = db.ref('lobbies');
        const snapshot = await lobbiesRef.once('value');
        const lobbies = snapshot.val() || {};
        
        console.log('Current lobbies:', lobbies);
        
        // Look for an available lobby
        let targetLobbyId = null;
        Object.entries(lobbies).forEach(([id, lobby]) => {
            if (lobby.status === 'waiting' && lobby.players && lobby.players.length < 2) {
                targetLobbyId = id;
            }
        });

        // Create new lobby if none available
        if (!targetLobbyId) {
            console.log('Creating new lobby for player:', playerId);
            const newLobbyRef = lobbiesRef.push();
            const newLobby = {
                status: 'waiting',
                players: [{
                    id: playerId,
                    joinedAt: admin.database.ServerValue.TIMESTAMP,
                    paymentStatus: 'pending'
                }],
                createdAt: admin.database.ServerValue.TIMESTAMP
            };
            
            await newLobbyRef.set(newLobby);
            console.log('New lobby created:', newLobbyRef.key);
            return { lobbyId: newLobbyRef.key };
        }

        // Join existing lobby
        console.log('Joining existing lobby:', targetLobbyId);
        const lobbyRef = db.ref(`lobbies/${targetLobbyId}`);
        const lobbySnapshot = await lobbyRef.once('value');
        const lobby = lobbySnapshot.val();
        
        if (!lobby.players) {
            lobby.players = [];
        }
        
        const updatedPlayers = [...lobby.players, {
            id: playerId,
            joinedAt: admin.database.ServerValue.TIMESTAMP,
            paymentStatus: 'pending'
        }];

        const updates = {
            players: updatedPlayers,
            status: updatedPlayers.length === 2 ? 'matched' : 'waiting'
        };

        await lobbyRef.update(updates);
        console.log('Lobby updated:', targetLobbyId);

        return { lobbyId: targetLobbyId };
    } catch (error) {
        console.error('Error in joinLobby:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

// Update payment status
exports.updatePaymentStatus = functions.https.onCall(async (data, context) => {
    const { lobbyId, playerId, status } = data;
    
    try {
        const lobbyRef = db.ref(`lobbies/${lobbyId}`);
        const snapshot = await lobbyRef.once('value');
        const lobby = snapshot.val();

        if (!lobby) {
            throw new Error('Lobby not found');
        }

        const updatedPlayers = lobby.players.map(player => {
            if (player.id === playerId) {
                return { ...player, paymentStatus: status };
            }
            return player;
        });

        const allPaid = updatedPlayers.every(player => player.paymentStatus === 'paid');
        
        await lobbyRef.update({
            players: updatedPlayers,
            status: allPaid ? 'ready' : 'matched'
        });

        return { success: true };
    } catch (error) {
        console.error('Error updating payment status:', error);
        throw new functions.https.HttpsError('internal', 'Failed to update payment status');
    }
});

exports.requestRefund = functions.https.onCall(async (data, context) => {
    // Ensure user is authenticated
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const { lobbyId, transactionSignature } = data;
    
    try {
        // Get the lobby data
        const lobbyRef = admin.database().ref(`lobbies/${lobbyId}`);
        const lobbySnapshot = await lobbyRef.once('value');
        const lobby = lobbySnapshot.val();

        if (!lobby) {
            throw new functions.https.HttpsError('not-found', 'Lobby not found');
        }

        // Verify the transaction belongs to the user
        const transactionRef = admin.database().ref(`lobbies/${lobbyId}/transactions/${transactionSignature}`);
        const snapshot = await transactionRef.once('value');
        const transaction = snapshot.val();

        if (!transaction) {
            throw new functions.https.HttpsError('not-found', 'Transaction not found');
        }

        if (transaction.walletAddress !== context.auth.uid) {
            throw new functions.https.HttpsError('permission-denied', 'Not authorized to refund this transaction');
        }

        // Process the refund
        const refundResult = await paymentManager.processRefund(
            transaction.walletAddress,
            transactionSignature
        );

        // Update transaction status
        await transactionRef.update({
            status: 'refunded',
            refundSignature: refundResult.signature,
            refundTimestamp: admin.database.ServerValue.TIMESTAMP
        });

        return { success: true, signature: refundResult.signature };
    } catch (error) {
        console.error('Refund error:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

// ... other existing exports 