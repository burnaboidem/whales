const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '.env') });

const config = {
    escrow: {
        privateKey: process.env.ESCROW_PRIVATE_KEY,
        publicKey: process.env.ESCROW_PUBLIC_KEY,
    },
    solana: {
        rpcUrl: process.env.SOLANA_RPC_URL,
    }
};

// Validate required configuration
const requiredConfig = [
    'escrow.privateKey',
    'escrow.publicKey',
    'solana.rpcUrl'
];

for (const path of requiredConfig) {
    const value = path.split('.').reduce((obj, key) => obj && obj[key], config);
    if (!value) {
        throw new Error(`Missing required config: ${path}`);
    }
}

module.exports = config; 