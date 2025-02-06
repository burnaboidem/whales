const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { Connection, PublicKey, Transaction, SystemProgram, Keypair } = require('@solana/web3.js');
const { getDatabase } = require('firebase-admin/database');
const config = require('./config');
const { onSchedule } = require('firebase-functions/v2/scheduler');

const NETWORK = 'mainnet-beta';
const ENTRY_FEE = 0.1; // 0.1 SOL
const HOUSE_FEE = 0.0; // 0% fee
const TRANSACTION_TIMEOUT = 5 * 60 * 1000; // 5 minutes

class SolanaPaymentManager {
    constructor() {
        this.connection = new Connection(config.solana.rpcUrl);
        
        try {
            const privateKeyArray = JSON.parse(config.escrow.privateKey);
            this.escrowAccount = Keypair.fromSecretKey(
                Buffer.from(privateKeyArray)
            );
        } catch (error) {
            console.error('Error initializing escrow account:', error);
            throw new Error('Failed to initialize escrow account');
        }
    }

    async verifyEntryFeePayment(playerPublicKey, transactionSignature, lobbyId) {
        try {
            // Get lobby data to verify player is in lobby
            const lobbySnapshot = await admin.database().ref(`lobbies/${lobbyId}`).once('value');
            const lobby = lobbySnapshot.val();
            
            if (!lobby || !lobby.players) {
                throw new Error('Invalid lobby');
            }

            // Verify player is in lobby
            const isPlayerInLobby = lobby.players.some(player => player.id === playerPublicKey);
            if (!isPlayerInLobby) {
                throw new Error('Player not in lobby');
            }

            // Get transaction details
            const transaction = await this.connection.getTransaction(transactionSignature, {
                commitment: 'confirmed',
                maxSupportedTransactionVersion: 0
            });

            if (!transaction) {
                throw new Error('Transaction not found');
            }

            // Verify transaction timestamp
            const currentTime = Date.now();
            if (transaction.blockTime * 1000 < currentTime - TRANSACTION_TIMEOUT) {
                throw new Error('Transaction too old');
            }

            // Verify sender's address
            const sender = transaction.transaction.message.accountKeys[0].toString();
            if (sender !== playerPublicKey) {
                throw new Error('Invalid sender address');
            }

            // Verify recipient is escrow account
            const recipient = transaction.transaction.message.accountKeys[1].toString();
            if (recipient !== this.escrowAccount.publicKey.toString()) {
                throw new Error('Invalid recipient address');
            }

            // Verify transaction amount
            const transferAmount = transaction.meta.postBalances[1] - transaction.meta.preBalances[1];
            const expectedAmount = ENTRY_FEE * 1000000000; // 0.1 SOL in lamports
            if (transferAmount !== expectedAmount) {
                throw new Error('Invalid transfer amount');
            }

            // Verify transaction instructions
            const instruction = transaction.transaction.message.instructions[0];
            if (!this.isValidTransferInstruction(instruction)) {
                throw new Error('Invalid transaction instruction');
            }

            // Record successful verification
            await this.recordVerification(lobbyId, playerPublicKey, transactionSignature, {
                amount: ENTRY_FEE,
                timestamp: transaction.blockTime * 1000,
                sender,
                recipient
            });

            return { success: true };
        } catch (error) {
            console.error('Payment verification failed:', error);
            
            // Record failed verification
            await this.recordVerification(lobbyId, playerPublicKey, transactionSignature, {
                error: error.message,
                timestamp: Date.now()
            });

            return { success: false, error: error.message };
        }
    }

    isValidTransferInstruction(instruction) {
        // Verify it's a System Program transfer instruction
        return instruction.programId.equals(SystemProgram.programId) &&
               instruction.data.length === 8 + 8; // transfer instruction layout
    }

    async recordVerification(lobbyId, playerPublicKey, transactionSignature, details) {
        const verificationRef = admin.database().ref(
            `lobbies/${lobbyId}/transactions/${transactionSignature}/verification`
        );
        
        await verificationRef.set({
            timestamp: Date.now(),
            playerPublicKey,
            ...details
        });
    }

    async monitorEscrowBalance() {
        try {
            const balance = await this.connection.getBalance(this.escrowAccount.publicKey);
            const solBalance = balance / 1000000000; // Convert lamports to SOL

            // Record balance for monitoring
            await admin.database().ref('escrowMonitoring').push({
                timestamp: Date.now(),
                balance: solBalance,
                publicKey: this.escrowAccount.publicKey.toString()
            });

            // Alert if balance is low (e.g., less than 5 SOL)
            if (solBalance < 5) {
                console.error(`Low escrow balance alert: ${solBalance} SOL`);
                // Implement your alert mechanism here (e.g., email, Discord webhook)
            }

            return { balance: solBalance };
        } catch (error) {
            console.error('Error monitoring escrow balance:', error);
            throw error;
        }
    }

    async distributePrize(winnerPublicKey) {
        try {
            const prizeAmount = (ENTRY_FEE * 2 - HOUSE_FEE * 2) * 1000000000; // 0.1 SOL in lamports
            
            const transaction = new Transaction().add(
                SystemProgram.transfer({
                    fromPubkey: this.escrowAccount.publicKey,
                    toPubkey: new PublicKey(winnerPublicKey),
                    lamports: prizeAmount,
                })
            );

            // Get latest blockhash
            const { blockhash } = await this.connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = this.escrowAccount.publicKey;

            // Sign and send transaction
            transaction.sign(this.escrowAccount);
            const signature = await this.connection.sendRawTransaction(transaction.serialize());

            // Wait for confirmation
            await this.connection.confirmTransaction(signature);

            return { success: true, signature };
        } catch (error) {
            console.error('Error distributing prize:', error);
            return { success: false, error: error.message };
        }
    }

    async processRefund(walletAddress, transactionSignature) {
        try {
            const userPubkey = new PublicKey(walletAddress);
            const amount = 0.1 * 1000000000; // 0.1 SOL in lamports

            const transaction = new Transaction().add(
                SystemProgram.transfer({
                    fromPubkey: this.escrowAccount.publicKey,
                    toPubkey: userPubkey,
                    lamports: amount,
                })
            );

            // Get latest blockhash
            const { blockhash } = await this.connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = this.escrowAccount.publicKey;

            // Sign and send transaction
            transaction.sign(this.escrowAccount);
            const signature = await this.connection.sendRawTransaction(transaction.serialize());

            // Wait for confirmation
            await this.connection.confirmTransaction(signature);

            return { success: true, signature };
        } catch (error) {
            console.error('Error processing refund:', error);
            throw error;
        }
    }
}

// Create a single instance
const paymentManager = new SolanaPaymentManager();

// Update monitorEscrow to use 1st gen scheduled function
exports.monitorEscrow = functions.pubsub
    .schedule('every 60 minutes')
    .timeZone('America/New_York')
    .onRun(async (context) => {
        try {
            await paymentManager.monitorEscrowBalance();
            return null;
        } catch (error) {
            console.error('Escrow monitoring failed:', error);
            return null;
        }
    });

exports.verifyGameEntry = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const { transactionSignature, lobbyId } = data;
    const playerPublicKey = context.auth.uid;

    try {
        const result = await paymentManager.verifyEntryFeePayment(
            playerPublicKey, 
            transactionSignature,
            lobbyId
        );
        
        if (result.success) {
            // Update lobby with payment status
            await admin.database().ref(`lobbies/${lobbyId}/players`).update({
                [playerPublicKey]: {
                    paymentVerified: true,
                    transactionSignature
                }
            });
            return { success: true };
        }
        
        throw new functions.https.HttpsError('failed-precondition', result.error || 'Invalid payment');
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

// Export the class for testing
exports.SolanaPaymentManager = SolanaPaymentManager; 