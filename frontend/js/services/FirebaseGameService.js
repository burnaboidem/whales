export class FirebaseGameService {
    constructor() {
        this.db = firebase.firestore();
        this.lobbyRef = this.db.collection('lobby');
        this.unsubscribeLobby = null;
    }

    async joinLobby(playerData) {
        try {
            await this.lobbyRef.doc(playerData.wallet).set(playerData);
        } catch (error) {
            console.error('Error joining lobby:', error);
            throw error;
        }
    }

    async leaveLobby(wallet) {
        try {
            await this.lobbyRef.doc(wallet).delete();
            if (this.unsubscribeLobby) {
                this.unsubscribeLobby();
                this.unsubscribeLobby = null;
            }
        } catch (error) {
            console.error('Error leaving lobby:', error);
        }
    }

    onLobbyUpdate(callback) {
        // Unsubscribe from previous listener if exists
        if (this.unsubscribeLobby) {
            this.unsubscribeLobby();
        }

        // Listen for lobby changes
        this.unsubscribeLobby = this.lobbyRef
            .orderBy('timestamp')
            .onSnapshot((snapshot) => {
                const players = [];
                snapshot.forEach((doc) => {
                    players.push(doc.data());
                });
                callback(players);
            }, (error) => {
                console.error('Lobby listener error:', error);
            });
    }

    async findMatch(playerWallet) {
        try {
            // Find oldest player that isn't current player
            const snapshot = await this.lobbyRef
                .where('status', '==', 'waiting')
                .orderBy('timestamp')
                .limit(2)
                .get();

            const players = [];
            snapshot.forEach(doc => players.push(doc.data()));

            // If we have 2 players, create a match
            if (players.length === 2) {
                const opponent = players.find(p => p.wallet !== playerWallet);
                if (opponent) {
                    // Create match and update player statuses
                    const matchId = `match_${Date.now()}`;
                    await this.createMatch(matchId, playerWallet, opponent.wallet);
                    
                    return {
                        opponentWallet: opponent.wallet,
                        isPlayerOne: players[0].wallet === playerWallet,
                        matchId
                    };
                }
            }

            // If no match found, wait and try again
            await new Promise(resolve => setTimeout(resolve, 1000));
            return this.findMatch(playerWallet);
        } catch (error) {
            console.error('Error finding match:', error);
            throw error;
        }
    }

    async createMatch(matchId, player1Wallet, player2Wallet) {
        const batch = this.db.batch();
        
        // Update player statuses
        batch.update(this.lobbyRef.doc(player1Wallet), { status: 'matched', matchId });
        batch.update(this.lobbyRef.doc(player2Wallet), { status: 'matched', matchId });
        
        // Create match document
        const matchRef = this.db.collection('matches').doc(matchId);
        batch.set(matchRef, {
            player1: player1Wallet,
            player2: player2Wallet,
            status: 'active',
            createdAt: Date.now()
        });

        await batch.commit();
    }

    async requestRefund(lobbyId, transactionSignature) {
        try {
            // Get the current user's ID token
            const user = auth.currentUser;
            if (!user) {
                throw new Error('Must be logged in to request refund');
            }

            const idToken = await user.getIdToken();
            
            const requestRefundFunction = httpsCallable(functions, 'requestRefund');
            const result = await requestRefundFunction({ 
                lobbyId, 
                transactionSignature,
                idToken 
            });
            
            return result.data;
        } catch (error) {
            console.error('Error requesting refund:', error);
            throw error;
        }
    }

    async updateLobbyPaymentStatus(lobbyId, playerWallet, status) {
        try {
            // Get the current user's ID token
            const user = auth.currentUser;
            if (!user) {
                throw new Error('Must be logged in to update payment status');
            }

            const updatePaymentFunction = httpsCallable(functions, 'updatePaymentStatus');
            await updatePaymentFunction({ 
                lobbyId, 
                playerId: playerWallet, 
                status,
                idToken: await user.getIdToken()
            });
        } catch (error) {
            console.error('Error updating lobby payment status:', error);
            throw error;
        }
    }
} 