class GameState {
    constructor(gameId, player1, player2) {
        this.gameId = gameId;
        this.players = {
            [player1]: {
                score: 0,
                position: { x: 100, y: 50 }
            },
            [player2]: {
                score: 0,
                position: { x: 600, y: 50 }
            }
        };
        this.startTime = Date.now();
        this.gameLength = 150000; // 2:30 in milliseconds
    }

    updatePlayerState(publicKey, state) {
        if (this.players[publicKey]) {
            this.players[publicKey] = {
                ...this.players[publicKey],
                ...state
            };
        }
    }

    isGameOver() {
        return Date.now() - this.startTime >= this.gameLength;
    }

    getWinner() {
        const [player1, player2] = Object.entries(this.players);
        return player1[1].score > player2[1].score ? player1[0] : player2[0];
    }
}

module.exports = { GameState }; 