export class Player {
    constructor(x, y, name) {
        this.x = x;
        this.y = 200; // Fixed Y position at water surface
        this.name = name;
        this.score = 0;
        this.speed = 5;
        this.isFishing = false;
        this.hookPosition = { x: 0, y: 0 };
        this.lineLength = 0;
        this.maxLineLength = 600; // Increased to reach bottom
        this.fishingSpeed = 2;
        this.retractionSpeed = 4; // Speed for pulling the line back in
        this.isRetracting = false; // New property to track retraction state
        
        // Add new properties for angle targeting
        this.targetAngle = Math.PI / 2; // Default straight down
        this.isAiming = false; // Whether player is currently aiming
        this.aimLineLength = 100; // Length of the aim line
    }

    update() {
        if (this.isFishing) {
            if (this.isRetracting) {
                // Retract the line
                this.lineLength = Math.max(0, this.lineLength - this.retractionSpeed);
                if (this.lineLength === 0) {
                    // Reset fishing state when line is fully retracted
                    this.isFishing = false;
                    this.isRetracting = false;
                }
            } else {
                // Extend the line
                if (this.lineLength < this.maxLineLength) {
                    this.lineLength += this.fishingSpeed;
                }
            }
            this.updateHookPosition();
        } else {
            this.lineLength = 0;
            this.isRetracting = false;
        }
    }

    render(ctx) {
        // Draw boat
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(this.x - 25, this.y, 50, 20);

        // Draw fisherman
        ctx.fillStyle = '#000000';
        ctx.fillRect(this.x - 10, this.y - 20, 20, 20);

        // Draw fishing rod
        ctx.strokeStyle = '#000000';
        ctx.beginPath();
        ctx.moveTo(this.x, this.y - 10);
        ctx.lineTo(this.x + 30, this.y - 30);
        ctx.stroke();

        // Draw fishing line and hook
        if (this.isFishing) {
            ctx.beginPath();
            ctx.moveTo(this.x + 30, this.y - 30);
            ctx.lineTo(this.hookPosition.x, this.hookPosition.y);
            ctx.stroke();

            // Draw hook
            ctx.beginPath();
            ctx.arc(this.hookPosition.x, this.hookPosition.y, 5, 0, Math.PI * 2);
            ctx.stroke();
        }
        
        // Always show aiming line
        if (!this.isFishing) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(this.x + 30, this.y - 30);
            const endX = this.x + 30 + Math.cos(this.targetAngle) * this.aimLineLength;
            const endY = (this.y - 30) + Math.sin(this.targetAngle) * this.aimLineLength;
            ctx.lineTo(endX, endY);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }

    moveLeft() {
        if (!this.isFishing) {
            this.x = Math.max(50, this.x - this.speed);
        }
    }

    moveRight() {
        if (!this.isFishing) {
            this.x = Math.min(750, this.x + this.speed);
        }
    }

    toggleFishing() {
        if (!this.isFishing) {
            // Start fishing
            this.isFishing = true;
            this.isRetracting = false;
            this.lineLength = 0;
        } else {
            // Start retracting if we're not already
            this.isRetracting = true;
        }
    }

    updateHookPosition() {
        this.hookPosition.x = this.x + 30 + Math.cos(this.targetAngle) * this.lineLength;
        this.hookPosition.y = (this.y - 30) + Math.sin(this.targetAngle) * this.lineLength;
    }

    updateTargetAngle(mouseX, mouseY) {
        if (!this.isFishing) {
            const dx = mouseX - (this.x + 30);
            const dy = mouseY - (this.y - 30);
            this.targetAngle = Math.atan2(dy, dx);
            
            // Restrict angle to reasonable fishing angles (45° left to 45° right from vertical)
            const minAngle = Math.PI / 4; // 45° from vertical
            const maxAngle = Math.PI * 3/4; // 135° from vertical
            this.targetAngle = Math.max(minAngle, Math.min(maxAngle, this.targetAngle));
        }
    }

    updateScore(points) {
        this.score = Math.max(0, this.score + points);
        console.log(`Score updated: ${this.score} (${points > 0 ? '+' : ''}${points})`);
        return this.score;
    }
} 