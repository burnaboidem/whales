export class PointAnimation {
    constructor(x, y, amount, isRainbow = false) {
        this.x = x;
        this.y = y;
        this.amount = amount;
        this.isRainbow = isRainbow;
        this.startTime = Date.now();
        this.yOffset = 0;
    }

    update(currentTime) {
        // Calculate progress (0 to 1)
        const progress = (currentTime - this.startTime) / 1500;
        // Move upward more at the start, slow down at the end
        this.yOffset = -40 * Math.pow(progress, 0.7);
        // Fade out towards the end
        this.opacity = Math.max(0, 1 - progress);
    }

    render(ctx, currentTime) {
        if (!this.opacity) return;

        ctx.save();
        ctx.imageSmoothingEnabled = false;
        
        // Shadow for depth
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
        
        if (this.isRainbow) {
            // Rainbow gradient for special fish
            const gradient = ctx.createLinearGradient(
                this.x - 20, this.y + this.yOffset,
                this.x + 20, this.y + this.yOffset
            );
            gradient.addColorStop(0, `rgba(255, 0, 0, ${this.opacity})`);
            gradient.addColorStop(0.2, `rgba(255, 165, 0, ${this.opacity})`);
            gradient.addColorStop(0.4, `rgba(255, 255, 0, ${this.opacity})`);
            gradient.addColorStop(0.6, `rgba(0, 255, 0, ${this.opacity})`);
            gradient.addColorStop(0.8, `rgba(0, 0, 255, ${this.opacity})`);
            gradient.addColorStop(1, `rgba(148, 0, 211, ${this.opacity})`);
            ctx.fillStyle = gradient;
            ctx.strokeStyle = `rgba(255, 255, 255, ${this.opacity})`;
        } else {
            // Normal colors for regular fish and whales
            if (this.amount > 0) {
                // Bright green for positive points
                ctx.fillStyle = `rgba(0, 255, 0, ${this.opacity})`;
                ctx.strokeStyle = `rgba(0, 128, 0, ${this.opacity})`; // Darker green outline
            } else {
                // Bright red for negative points
                ctx.fillStyle = `rgba(255, 0, 0, ${this.opacity})`;
                ctx.strokeStyle = `rgba(139, 0, 0, ${this.opacity})`; // Darker red outline
            }
        }
        
        ctx.font = "bold 24px 'VT323'";
        ctx.textAlign = 'center';
        
        // Draw text with outline
        const text = this.amount > 0 ? `+${this.amount}` : this.amount;
        
        // Draw outline
        ctx.lineWidth = 3;
        ctx.strokeText(text, this.x, this.y + this.yOffset);
        
        // Draw filled text
        ctx.fillText(text, this.x, this.y + this.yOffset);
        
        ctx.restore();
    }
} 