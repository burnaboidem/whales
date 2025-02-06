const WebSocket = require('ws');
const { createServer } = require('http');
const Redis = require('ioredis');
const { GameState } = require('./gameState');

const server = createServer();
const wss = new WebSocket.Server({ server });
const redis = new Redis();

const PORT = process.env.PORT || 3000;
const games = new Map();
const waitingPlayers = new Set();

wss.on('connection', async (ws) => {
    ws.isAlive = true;
    
    ws.on('pong', () => {
        ws.isAlive = true;
    });

    ws.on('message', async (message) => {
        const data = JSON.parse(message);
        
        switch (data.type) {
            case 'join':
                handlePlayerJoin(ws, data);
                break;
            case 'gameUpdate':
                handleGameUpdate(ws, data);
                break;
            case 'gameEnd':
                handleGameEnd(ws, data);
                break;
        }
    });

    ws.on('close', () => {
        handlePlayerDisconnect(ws);
    });
});

function handlePlayerJoin(ws, data) {
    const { publicKey } = data;
    ws.publicKey = publicKey;

    if (waitingPlayers.size === 0) {
        waitingPlayers.add(ws);
        ws.send(JSON.stringify({ type: 'waiting' }));
    } else {
        const opponent = waitingPlayers.values().next().value;
        waitingPlayers.delete(opponent);
        
        const gameId = createGame(ws, opponent);
        
        [ws, opponent].forEach(player => {
            player.gameId = gameId;
            player.send(JSON.stringify({
                type: 'gameStart',
                gameId,
                players: [ws.publicKey, opponent.publicKey]
            }));
        });
    }
}

function createGame(player1, player2) {
    const gameId = `game_${Date.now()}`;
    const gameState = new GameState(gameId, player1.publicKey, player2.publicKey);
    games.set(gameId, gameState);
    
    // Store game state in Redis
    redis.set(`game:${gameId}`, JSON.stringify(gameState));
    
    return gameId;
}

function handleGameUpdate(ws, data) {
    const { gameId, playerState } = data;
    const game = games.get(gameId);
    
    if (!game) return;

    game.updatePlayerState(ws.publicKey, playerState);
    
    // Broadcast update to other player
    const players = Array.from(wss.clients)
        .filter(client => client.gameId === gameId && client !== ws);
    
    players.forEach(player => {
        player.send(JSON.stringify({
            type: 'gameUpdate',
            playerState
        }));
    });
}

function handleGameEnd(ws, data) {
    const { gameId, winner } = data;
    const game = games.get(gameId);
    
    if (!game) return;

    // Notify players of game end
    const players = Array.from(wss.clients)
        .filter(client => client.gameId === gameId);
    
    players.forEach(player => {
        player.send(JSON.stringify({
            type: 'gameEnd',
            winner
        }));
    });

    // Clean up game
    games.delete(gameId);
    redis.del(`game:${gameId}`);
}

function handlePlayerDisconnect(ws) {
    waitingPlayers.delete(ws);
    
    if (ws.gameId) {
        const game = games.get(ws.gameId);
        if (game) {
            // Notify other player of disconnect
            const opponent = Array.from(wss.clients)
                .find(client => client.gameId === ws.gameId && client !== ws);
            
            if (opponent) {
                opponent.send(JSON.stringify({
                    type: 'playerDisconnected'
                }));
            }
            
            games.delete(ws.gameId);
            redis.del(`game:${ws.gameId}`);
        }
    }
}

// Heartbeat to keep connections alive
setInterval(() => {
    wss.clients.forEach(ws => {
        if (!ws.isAlive) return ws.terminate();
        
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

server.listen(PORT, () => {
    console.log(`WebSocket server is running on port ${PORT}`);
}); 