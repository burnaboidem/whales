export class TransactionMonitorModal {
    constructor() {
        this.modalOverlay = null;
        this.content = null;
        this.statusElement = null;
        this.escrowBalanceElement = null;
        this.refundTimer = null;
        this.refundTimeout = 5 * 60 * 1000; // 5 minutes
    }

    show(transactionSignature, escrowAddress) {
        // Remove any existing modal
        if (this.modalOverlay) {
            this.modalOverlay.remove();
        }

        this.modalOverlay = document.createElement('div');
        this.modalOverlay.className = 'modal-overlay';
        
        const modalContent = document.createElement('div');
        modalContent.className = 'modal-content transaction-monitor-modal';
        
        const titleBar = document.createElement('h2');
        titleBar.textContent = 'Transaction Details';
        
        this.content = document.createElement('div');
        this.content.className = 'modal-body';

        // Transaction Link Section (Always at the top)
        const transactionLink = document.createElement('div');
        transactionLink.className = 'transaction-link';
        transactionLink.innerHTML = `
            <div class="link-container">
                <h3>Transaction Sent!</h3>
                <p>View your transaction on Solscan:</p>
                <a href="https://solscan.io/tx/${transactionSignature}" 
                   target="_blank" 
                   class="solscan-link win95-button">
                    ${transactionSignature.slice(0, 8)}...${transactionSignature.slice(-8)}
                </a>
                <div class="transaction-copy">
                    <input type="text" readonly value="${transactionSignature}" class="tx-signature-input" />
                    <button class="win95-button copy-button">Copy</button>
                </div>
            </div>
        `;

        // Add copy functionality
        const copyButton = transactionLink.querySelector('.copy-button');
        const signatureInput = transactionLink.querySelector('.tx-signature-input');
        copyButton.onclick = () => {
            signatureInput.select();
            document.execCommand('copy');
            copyButton.textContent = 'Copied!';
            setTimeout(() => copyButton.textContent = 'Copy', 2000);
        };
        
        // Status Section
        this.statusElement = document.createElement('div');
        this.statusElement.className = 'transaction-status';
        this.statusElement.innerHTML = `
            <div class="status-item">
                <span>Status:</span>
                <span class="status pending">Pending Confirmation</span>
            </div>
            <div class="loading-spinner"></div>
        `;

        // Escrow Section
        this.escrowBalanceElement = document.createElement('div');
        this.escrowBalanceElement.className = 'escrow-balance';
        this.escrowBalanceElement.innerHTML = `
            <div class="balance-item">
                <span>Escrow Address:</span>
                <a href="https://solscan.io/account/${escrowAddress}" 
                   target="_blank" 
                   class="solscan-link">
                    ${escrowAddress.slice(0, 8)}...${escrowAddress.slice(-8)}
                </a>
            </div>
            <div class="balance-item">
                <span>Current Balance:</span>
                <span class="balance">Loading...</span>
            </div>
        `;

        // Timer Section
        this.timerElement = document.createElement('div');
        this.timerElement.className = 'refund-timer';
        
        // Assemble the modal
        this.content.appendChild(transactionLink);
        this.content.appendChild(this.statusElement);
        this.content.appendChild(this.escrowBalanceElement);
        this.content.appendChild(this.timerElement);
        
        modalContent.appendChild(titleBar);
        modalContent.appendChild(this.content);
        this.modalOverlay.appendChild(modalContent);
        document.body.appendChild(this.modalOverlay);

        return this;
    }

    startRefundTimer(onRefundRequest, remainingTime) {
        if (this.refundTimer) {
            clearInterval(this.refundTimer);
        }

        const endTime = Date.now() + remainingTime;
        
        const updateTimer = () => {
            const now = Date.now();
            const timeLeft = Math.max(0, endTime - now);
            
            if (timeLeft === 0) {
                clearInterval(this.refundTimer);
                this.showRefundButton(onRefundRequest);
            } else {
                const minutes = Math.floor(timeLeft / 60000);
                const seconds = Math.floor((timeLeft % 60000) / 1000);
                this.timerElement.textContent = `Time until refund available: ${minutes}:${seconds.toString().padStart(2, '0')}`;
            }
        };

        updateTimer(); // Initial update
        this.refundTimer = setInterval(updateTimer, 1000);
    }

    showRefundButton(onRefundRequest) {
        const refundButton = document.createElement('button');
        refundButton.className = 'win95-button refund-button';
        refundButton.textContent = 'Request Refund';
        refundButton.onclick = onRefundRequest;
        
        this.timerElement.innerHTML = '';
        this.timerElement.appendChild(refundButton);
    }

    updateTransactionStatus(status, details = {}) {
        const statusSpan = this.statusElement.querySelector('.status');
        statusSpan.className = `status ${status}`;
        statusSpan.textContent = status.charAt(0).toUpperCase() + status.slice(1);

        if (status === 'confirmed') {
            this.statusElement.querySelector('.loading-spinner').style.display = 'none';
            // Update payment status in database
            this.onConfirmed && this.onConfirmed();
        }

        if (details.error) {
            const errorDiv = document.createElement('div');
            errorDiv.className = 'error-message';
            errorDiv.textContent = details.error;
            this.statusElement.appendChild(errorDiv);
        }
    }

    updateEscrowBalance(balance) {
        const balanceSpan = this.escrowBalanceElement.querySelector('.balance');
        balanceSpan.textContent = `${balance.toFixed(2)} SOL`;
    }

    close() {
        if (this.refundTimer) {
            clearInterval(this.refundTimer);
        }
        if (this.modalOverlay) {
            this.modalOverlay.remove();
        }
    }
} 