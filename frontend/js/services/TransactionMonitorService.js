import { Connection, PublicKey } from '@solana/web3.js';
import { SOLANA_RPC_URL, ESCROW_PUBLIC_KEY } from '../constants.js';

export class TransactionMonitorService {
    constructor() {
        this.connection = new Connection(SOLANA_RPC_URL);
        this.monitoringIntervals = new Map();
    }

    async monitorTransaction(signature, escrowAddress, onStatusUpdate) {
        try {
            // Initial status check
            const status = await this.connection.getSignatureStatus(signature);
            onStatusUpdate(this.parseTransactionStatus(status));

            // Set up monitoring interval
            const intervalId = setInterval(async () => {
                try {
                    const currentStatus = await this.connection.getSignatureStatus(signature);
                    const parsedStatus = this.parseTransactionStatus(currentStatus);
                    onStatusUpdate(parsedStatus);

                    if (parsedStatus.status === 'confirmed' || parsedStatus.status === 'failed') {
                        this.stopMonitoring(signature);
                    }
                } catch (error) {
                    console.error('Error monitoring transaction:', error);
                }
            }, 2000); // Check every 2 seconds

            this.monitoringIntervals.set(signature, intervalId);

            // Monitor escrow balance
            this.monitorEscrowBalance(escrowAddress, onStatusUpdate);
        } catch (error) {
            console.error('Error starting transaction monitor:', error);
            onStatusUpdate({ status: 'error', error: error.message });
        }
    }

    async monitorEscrowBalance(escrowAddress, onBalanceUpdate) {
        const escrowPublicKey = new PublicKey(escrowAddress);
        
        const intervalId = setInterval(async () => {
            try {
                const balance = await this.connection.getBalance(escrowPublicKey);
                onBalanceUpdate({
                    type: 'balance',
                    balance: balance / 1000000000 // Convert lamports to SOL
                });
            } catch (error) {
                console.error('Error monitoring escrow balance:', error);
            }
        }, 5000); // Check every 5 seconds

        this.monitoringIntervals.set('escrow-' + escrowAddress, intervalId);
    }

    parseTransactionStatus(status) {
        if (!status || !status.value) {
            return { status: 'pending' };
        }

        if (status.value.err) {
            return { 
                status: 'failed',
                error: status.value.err
            };
        }

        if (status.value.confirmations === null) {
            return { status: 'confirmed' };
        }

        return { 
            status: 'pending',
            confirmations: status.value.confirmations
        };
    }

    stopMonitoring(signature) {
        const transactionInterval = this.monitoringIntervals.get(signature);
        if (transactionInterval) {
            clearInterval(transactionInterval);
            this.monitoringIntervals.delete(signature);
        }

        // Also clear escrow monitoring if it exists
        const escrowInterval = this.monitoringIntervals.get('escrow-' + signature);
        if (escrowInterval) {
            clearInterval(escrowInterval);
            this.monitoringIntervals.delete('escrow-' + signature);
        }
    }

    stopAllMonitoring() {
        for (const interval of this.monitoringIntervals.values()) {
            clearInterval(interval);
        }
        this.monitoringIntervals.clear();
    }
} 