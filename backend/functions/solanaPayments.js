const functions = require('firebase-functions');
const admin = require('firebase-admin');
const web3 = require('@solana/web3.js');

const NETWORK = 'mainnet-beta';
const ENTRY_FEE = 0.1; // 0.1 SOL
const HOUSE_FEE = 0.0; // 0% fee


class SolanaPaymentManager {
    constructor() {
        this.connection = new web3.Connection(web3.clusterApiUrl('mainnet-beta'));
        // Initialize your program's keypair here
        this.escrowAccount = web3.Keypair.fromSecretKey(
            Buffer.from(JSON.parse(process.env.ESCROW_PRIVATE_KEY))
        );
    }

    async verifyEntryFeePayment(playerPublicKey, transactionSignature) {
        try {
            // Confirm transaction
            const confirmation = await this.connection.confirmTransaction(transactionSignature);
            if (!confirmation.value.err) {
                // Get transaction details
                const transaction = await this.connection.getTransaction(transactionSignature);
                
                // Verify amount and recipient
                const transferAmount = transaction.meta.postBalances[1] - transaction.meta.preBalances[1];
                const expectedAmount = ENTRY_FEE * web3.LAMPORTS_PER_SOL;
                
                if (transferAmount === expectedAmount && 
                    transaction.transaction.message.accountKeys[1].equals(this.escrowAccount.publicKey)) {
                    return true;
                }
            }
            return false;
        } catch (error) {
            console.error('Error verifying payment:', error);
            return false;
        }
    }

    async distributePrize(winnerPublicKey) {
        try {
            const prizeAmount = (ENTRY_FEE * 2 - HOUSE_FEE * 2) * web3.LAMPORTS_PER_SOL;
            
            const transaction = new web3.Transaction().add(
                web3.SystemProgram.transfer({
                    fromPubkey: this.escrowAccount.publicKey,
                    toPubkey: new web3.PublicKey(winnerPublicKey),
                    lamports: prizeAmount,
                })
            );

            // Sign and send transaction
            const signature = await web3.sendAndConfirmTransaction(
                this.connection,
                transaction,
                [this.escrowAccount]
            );

            return { success: true, signature };
        } catch (error) {
            console.error('Error distributing prize:', error);
            return { success: false, error: error.message };
        }
    }
}

const paymentManager = new SolanaPaymentManager();

exports.verifyGameEntry = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const { transactionSignature, lobbyId } = data;
    const playerPublicKey = context.auth.uid;

    try {
        const isValid = await paymentManager.verifyEntryFeePayment(playerPublicKey, transactionSignature);
        
        if (isValid) {
            // Update lobby with payment status
            await admin.database().ref(`lobbies/${lobbyId}/players`).update({
                [playerPublicKey]: {
                    paymentVerified: true,
                    transactionSignature
                }
            });
            return { success: true };
        }
        
        throw new functions.https.HttpsError('failed-precondition', 'Invalid payment');
    } catch (error) {
        throw new functions.https.HttpsError('internal', error.message);
    }
});

exports.distributePrize = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const { gameId } = data;

    try {
        // Get game data
        const gameSnapshot = await admin.database().ref(`games/${gameId}`).once('value');
        const game = gameSnapshot.val();

        if (!game || game.status !== 'completed') {
            throw new functions.https.HttpsError('failed-precondition', 'Game not completed');
        }

        if (game.prizeDistributed) {
            throw new functions.https.HttpsError('failed-precondition', 'Prize already distributed');
        }

        // Distribute prize to winner
        const result = await paymentManager.distributePrize(game.winner);
        
        if (result.success) {
            // Update game with prize distribution status
            await admin.database().ref(`games/${gameId}`).update({
                prizeDistributed: true,
                prizeTransaction: result.signature
            });
            return { success: true, signature: result.signature };
        }

        throw new functions.https.HttpsError('internal', 'Failed to distribute prize');
    } catch (error) {
        throw new functions.https.HttpsError('internal', error.message);
    }
}); 