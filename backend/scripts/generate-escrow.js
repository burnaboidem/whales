const web3 = require('@solana/web3.js');
const fs = require('fs');

async function generateEscrowAccount() {
    // Generate new keypair for escrow
    const escrowAccount = web3.Keypair.generate();
    
    // Save private key securely
    const privateKeyData = JSON.stringify(Array.from(escrowAccount.secretKey));
    
    // Create .env content
    const envContent = `
# Solana Escrow Account Keys
ESCROW_PRIVATE_KEY='${privateKeyData}'
ESCROW_PUBLIC_KEY='${escrowAccount.publicKey.toString()}'
    `.trim();

    // Save to .env file
    fs.writeFileSync('.env', envContent);
    
    // Save public key to frontend constants
    const frontendContent = `
export const ESCROW_PUBLIC_KEY = '${escrowAccount.publicKey.toString()}';
    `.trim();
    
    fs.writeFileSync('../frontend/js/constants.js', frontendContent);

    console.log('Generated new escrow account:');
    console.log('Public Key:', escrowAccount.publicKey.toString());
    console.log('Private key saved to .env');
    console.log('Public key saved to frontend/js/constants.js');
    
    // Connect to mainnet-beta instead of devnet
    const connection = new web3.Connection(web3.clusterApiUrl('mainnet-beta'));
    
    // Remove devnet airdrop since it won't work on mainnet
    // You'll need to fund this account manually on mainnet
}

generateEscrowAccount().catch(console.error); 