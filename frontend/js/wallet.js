import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import * as web3 from '@solana/web3.js';
import * as firebase from 'firebase/app';
import 'firebase/functions';
import { ESCROW_PUBLIC_KEY, SOLANA_RPC_URL } from './constants.js';

export class WalletManager {
    constructor() {
        this.connection = new Connection(SOLANA_RPC_URL);
        
        // Option 2: Use GenesysGo
        // this.connection = new Connection('https://ssc-dao.genesysgo.net');
        
        // Option 3: Use Quicknode (if you have an account)
        // this.connection = new Connection('YOUR_QUICKNODE_URL');

        this.wallet = null;
        this.onConnect = null;
    }

    async connect() {
        try {
            // Check if Phantom is installed
            const isPhantomInstalled = window.solana && window.solana.isPhantom;
            
            if (!isPhantomInstalled) {
                alert('Please install Phantom wallet to play!');
                window.open('https://phantom.app/', '_blank');
                return;
            }

            // Request wallet connection
            const response = await window.solana.connect();
            console.log('Wallet connected:', response.publicKey.toString());
            
            this.wallet = window.solana;
            
            // Update wallet address display
            const addressDisplay = document.getElementById('wallet-address');
            if (addressDisplay) {
                const address = response.publicKey.toString();
                const shortAddress = `${address.slice(0, 4)}...${address.slice(-4)}`;
                addressDisplay.textContent = shortAddress;
            }

            // Update connect button text
            const connectButton = document.getElementById('connect-wallet');
            if (connectButton) {
                connectButton.textContent = 'Connected';
            }
            
            // Call the onConnect callback if it exists
            if (this.onConnect) {
                this.onConnect();
            }
        } catch (error) {
            console.error('Error connecting to wallet:', error);
            throw error;
        }
    }

    disconnect() {
        if (this.wallet) {
            this.wallet.disconnect();
            this.wallet = null;
            
            // Reset UI
            const addressDisplay = document.getElementById('wallet-address');
            if (addressDisplay) {
                addressDisplay.textContent = '';
            }
            
            const connectButton = document.getElementById('connect-wallet');
            if (connectButton) {
                connectButton.textContent = 'Connect Wallet';
            }
        }
    }

    isConnected() {
        return this.wallet !== null;
    }

    getPublicKey() {
        return this.wallet ? this.wallet.publicKey : null;
    }

    async payGameEntry(lobbyId) {
        try {
            if (!this.wallet) {
                throw new Error('Wallet not connected');
            }

            const escrowPublicKey = new web3.PublicKey(ESCROW_PUBLIC_KEY);
            const amount = 0.1 * web3.LAMPORTS_PER_SOL; // 0.1 SOL in lamports

            const transaction = new web3.Transaction().add(
                web3.SystemProgram.transfer({
                    fromPubkey: this.wallet.publicKey,
                    toPubkey: escrowPublicKey,
                    lamports: amount,
                })
            );

            // Get latest blockhash
            const { blockhash } = await this.connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = this.wallet.publicKey;

            // For Phantom wallet, we need to use signAndSendTransaction
            const { signature } = await this.wallet.signAndSendTransaction(transaction);
            
            // Wait for confirmation
            const confirmation = await this.connection.confirmTransaction(signature, 'confirmed');
            
            if (confirmation.value.err) {
                throw new Error('Transaction failed to confirm');
            }

            console.log('Transaction successful:', signature);
            return signature;
        } catch (error) {
            console.error('Error paying entry fee:', error);
            throw error;
        }
    }
} 