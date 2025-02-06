const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

// Remove WebSocket server setup as it's not supported directly in Cloud Functions
// Instead, we'll use Firebase Realtime Database for real-time updates

exports.api = functions.https.onRequest((req, res) => {
  res.json({message: "Hello from Firebase!"});
});

// Game state management through HTTPS callable functions
exports.createGame = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const gameId = `game_${Date.now()}`;
    const gameState = {
        id: gameId,
        player1: data.player1,
        player2: data.player2,
        status: 'active',
        scores: {
            [data.player1]: 0,
            [data.player2]: 0
        },
        timestamp: admin.database.ServerValue.TIMESTAMP
    };

    await admin.database().ref(`games/${gameId}`).set(gameState);
    return { gameId };
});

exports.updateGameState = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { gameId, update } = data;
    await admin.database().ref(`games/${gameId}`).update(update);
    return { success: true };
});

exports.getGameStatus = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const snapshot = await admin.database().ref(`games/${data.gameId}`).once('value');
    const gameState = snapshot.val();
    
    if (!gameState) {
        throw new functions.https.HttpsError('not-found', 'Game not found');
    }

    return gameState;
});

// Add Firebase Realtime Database for game state persistence
async function saveGameState(gameId, state) {
    await admin.database().ref(`games/${gameId}`).set(state);
}

async function getGameState(gameId) {
    const snapshot = await admin.database().ref(`games/${gameId}`).once('value');
    return snapshot.val();
}

// Add REST API endpoints for game management
exports.createGame = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const gameId = `game_${Date.now()}`;
    const gameState = new GameState(gameId, data.player1, data.player2);
    await saveGameState(gameId, gameState);
    
    return { gameId };
});

exports.getGameStatus = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const gameState = await getGameState(data.gameId);
    if (!gameState) {
        throw new functions.https.HttpsError('not-found', 'Game not found');
    }

    return gameState;
});

// Add your other cloud functions here 