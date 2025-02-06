export class GameModal {
    static show(title, onClose, customMessage = null) {
        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'modal-overlay';
        
        const modalContent = document.createElement('div');
        modalContent.className = 'modal-content';
        
        const titleBar = document.createElement('h2');
        titleBar.textContent = title;
        
        const content = document.createElement('div');
        content.className = 'modal-body';
        
        if (customMessage) {
            // Show custom message (like game over screen)
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
        startButton.textContent = customMessage ? 'Play Again' : 'START.EXE';
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
} 