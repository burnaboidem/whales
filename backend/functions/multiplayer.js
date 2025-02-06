const functions = require('firebase-functions');
const { admin, db } = require('./admin');

// Define the functions first
const createMultiplayerGame = functions.https.onCall(async (data, context) => {
    // Verify authentication
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    try {
        const { lobbyId } = data;
        
        // Get lobby data
        const lobbySnapshot = await db.ref(`lobbies/${lobbyId}`).once('value');
        const lobby = lobbySnapshot.val();

        if (!lobby) {
            throw new functions.https.HttpsError('not-found', 'Lobby not found');
        }

        if (lobby.players.length !== 2) {
            throw new functions.https.HttpsError('failed-precondition', 'Lobby must have exactly 2 players');
        }

        // Create new game
        const gameRef = db.ref('games').push();
        const gameId = gameRef.key;

        const gameData = {
            createdAt: admin.database.ServerValue.TIMESTAMP,
            players: lobby.players,
            status: 'active',
            scores: {},
            timeRemaining: 150, // 2:30 in seconds
            entryFee: '0.1', // 0.1 SOL entry fee
            prizePool: '0.2', // 0.2 SOL total (0.1 SOL from each player)
            lobbyId: lobbyId
        };

        // Initialize scores for both players
        lobby.players.forEach(player => {
            gameData.scores[player.id] = 0;
        });

        await gameRef.set(gameData);

        return { gameId };
    } catch (error) {
        console.error('Error creating multiplayer game:', error);
        throw new functions.https.HttpsError('internal', 'Failed to create multiplayer game');
    }
});

const endMultiplayerGame = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    try {
        const { gameId } = data;
        const gameRef = db.ref(`games/${gameId}`);
        
        // Get final game state
        const gameSnapshot = await gameRef.once('value');
        const game = gameSnapshot.val();

        if (!game) {
            throw new functions.https.HttpsError('not-found', 'Game not found');
        }

        if (game.status === 'completed') {
            throw new functions.https.HttpsError('failed-precondition', 'Game already completed');
        }

        // Determine winner
        const scores = game.scores;
        let winner = null;
        let highestScore = -1;

        Object.entries(scores).forEach(([playerId, score]) => {
            if (score > highestScore) {
                highestScore = score;
                winner = playerId;
            }
        });

        // Update game status
        await gameRef.update({
            status: 'completed',
            winner: winner,
            endTime: admin.database.ServerValue.TIMESTAMP
        });

        // Clean up lobby
        if (game.lobbyId) {
            await db.ref(`lobbies/${game.lobbyId}`).remove();
        }

        return { winner, finalScores: scores };
    } catch (error) {
        console.error('Error ending multiplayer game:', error);
        throw new functions.https.HttpsError('internal', 'Failed to end multiplayer game');
    }
});

const cleanupLobbies = functions.pubsub.schedule('every 5 minutes').onRun(async (context) => {
    try {
        const lobbiesRef = db.ref('lobbies');
        const snapshot = await lobbiesRef.once('value');
        const lobbies = snapshot.val();

        if (!lobbies) return null;

        const now = Date.now();
        const TIMEOUT = 5 * 60 * 1000; // 5 minutes in milliseconds

        const cleanupPromises = Object.entries(lobbies).map(async ([lobbyId, lobby]) => {
            // Remove lobbies that are older than 5 minutes and still in 'waiting' status
            if (lobby.status === 'waiting' && (now - lobby.createdAt) > TIMEOUT) {
                await lobbiesRef.child(lobbyId).remove();
            }
        });

        await Promise.all(cleanupPromises);
        return null;
    } catch (error) {
        console.error('Error cleaning up lobbies:', error);
        return null;
    }
});

// Then export them
module.exports = {
    createMultiplayerGame,
    endMultiplayerGame,
    cleanupLobbies
}; 