export class GameModal {
    static show(title, onClose, customMessage = null, buttonText = null) {
        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'modal-overlay';
        
        const modalContent = document.createElement('div');
        modalContent.className = 'modal-content';
        
        const titleBar = document.createElement('h2');
        titleBar.textContent = title;
        
        const content = document.createElement('div');
        content.className = 'modal-body';
        
        if (customMessage) {
            // Show custom message
            content.innerHTML = customMessage;
        } else {
            // Show default instructions
            content.innerHTML = `
                <p>Welcome to Solana Fishing Game v1.0!</p>
                <div class="instructions-box">
                    <p>CONTROLS:</p>
                    <ul>
                        <li>← → or A/D - Move boat</li>
                        <li>Mouse - Aim fishing line</li>
                        <li>Click - Cast/Retract line</li>
                    </ul>
                    <p>SCORING:</p>
                    <ul>
                        <li>Fish = +1 point</li>
                        <li>Rainbow Fish = +5 points</li>
                        <li>Whale = -5 points</li>
                    </ul>
                </div>
            `;
        }
        
        const startButton = document.createElement('button');
        startButton.textContent = buttonText || (customMessage ? 'Play Again' : 'START.EXE');
        startButton.className = 'win95-button';
        
        modalContent.appendChild(titleBar);
        modalContent.appendChild(content);
        modalContent.appendChild(startButton);
        modalOverlay.appendChild(modalContent);
        document.body.appendChild(modalOverlay);
        
        modalContent.style.cssText = `
            padding: 2rem;
            max-width: 500px;
            position: relative;
        `;

        // Add a title bar close button
        const closeButton = document.createElement('button');
        closeButton.className = 'stop-button';
        closeButton.style.position = 'absolute';
        closeButton.style.right = '4px';
        closeButton.style.top = '4px';
        titleBar.appendChild(closeButton);

        startButton.onclick = () => {
            modalOverlay.remove();
            if (onClose) onClose();
        };
    }

    static showPaymentModal(title, onClose, transactionInfo = null) {
        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'modal-overlay';
        
        const modalContent = document.createElement('div');
        modalContent.className = 'modal-content payment-modal';
        
        const titleBar = document.createElement('h2');
        titleBar.textContent = title;
        
        const content = document.createElement('div');
        content.className = 'modal-body';

        if (transactionInfo) {
            // Show transaction status
            content.innerHTML = `
                <div class="payment-status">
                    <p>Transaction Status: ${transactionInfo.status}</p>
                    ${transactionInfo.transactionSignature ? 
                        `<p>Transaction ID: <a href="https://solscan.io/tx/${transactionInfo.transactionSignature}" 
                            target="_blank" rel="noopener noreferrer">
                            ${transactionInfo.transactionSignature.slice(0, 8)}...
                        </a></p>` : ''
                    }
                    ${transactionInfo.failureReason ? 
                        `<p class="error-message">Error: ${transactionInfo.failureReason}</p>` : ''
                    }
                </div>
            `;
        } else {
            // Show initial payment request
            content.innerHTML = `
                <div class="payment-request">
                    <p>Match found! Please deposit 0.1 SOL to start the game.</p>
                    <p>Both players must deposit to begin.</p>
                </div>
            `;
        }
        
        const button = document.createElement('button');
        button.className = 'win95-button';
        
        if (transactionInfo && transactionInfo.status === 'failed') {
            button.textContent = 'Try Again';
        } else if (transactionInfo && transactionInfo.status === 'success') {
            button.textContent = 'Waiting for Opponent';
            button.disabled = true;
        } else {
            button.textContent = 'Add 0.1 SOL to pot';
        }
        
        modalContent.appendChild(titleBar);
        modalContent.appendChild(content);
        modalContent.appendChild(button);
        modalOverlay.appendChild(modalContent);
        document.body.appendChild(modalOverlay);

        if (!button.disabled) {
            button.onclick = () => {
                if (onClose) onClose();
            };
        }

        return modalOverlay;
    }
} 