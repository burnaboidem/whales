class Fish {
    constructor(type = 'regular') {
        this.type = type;
        this.reset();
        this.setInitialSpeed();
        // Different properties based on fish type
        switch(type) {
            case 'whale':
                this.size = 100; // Made whales even bigger
                this.value = -5;
                break;
            case 'rainbow':
                this.size = 40;
                this.value = 5;
                this.zigzagAmplitude = 50; // For zigzag movement
                this.zigzagFrequency = 0.02;
                this.timeOffset = Math.random() * Math.PI * 2; // Random starting phase
                break;
            default: // regular fish
                this.size = 30;
                this.value = 1;
        }
    }

    setInitialSpeed() {
        // Store base speeds that we can multiply later
        switch(this.type) {
            case 'whale':
                this.baseSpeed = 2;
                break;
            case 'rainbow':
                this.baseSpeed = 4;
                break;
            default: // regular fish
                this.baseSpeed = 3;
        }
        this.speed = this.baseSpeed;
    }

    increaseSpeed(multiplier) {
        this.speed = this.baseSpeed * multiplier;
    }

    resetSpeed() {
        this.speed = this.baseSpeed;
    }

    reset() {
        this.x = Math.random() < 0.5 ? -this.size : 850;
        
        // Allow whales to spawn anywhere in the water, just like regular fish
        this.y = Math.random() * 300 + 250; // 250-550 range for all fish types
        
        this.direction = this.x < 0 ? 1 : -1;
        this.active = true;
        this.startTime = Date.now();
    }

    update() {
        if (this.type === 'rainbow') {
            // Zigzag movement for rainbow fish
            const time = (Date.now() - this.startTime) * this.zigzagFrequency;
            this.x += this.speed * this.direction;
            this.y = this.y + Math.sin(time + this.timeOffset) * this.zigzagAmplitude * 0.1;
            
            // Keep within vertical bounds
            this.y = Math.max(250, Math.min(500, this.y));
        } else {
            this.x += this.speed * this.direction;
        }
        
        if (this.x > 850 || this.x < -50) {
            this.reset();
        }
    }

    render(ctx) {
        if (!this.active) return;

        ctx.save();
        
        // Different appearances for different fish types
        switch(this.type) {
            case 'whale':
                ctx.fillStyle = '#4A4A4A';
                break;
            case 'rainbow':
                // Create rainbow gradient
                const gradient = ctx.createLinearGradient(
                    this.x, this.y, 
                    this.x + this.size, this.y
                );
                gradient.addColorStop(0, '#FF0000');
                gradient.addColorStop(0.2, '#FFA500');
                gradient.addColorStop(0.4, '#FFFF00');
                gradient.addColorStop(0.6, '#00FF00');
                gradient.addColorStop(0.8, '#0000FF');
                gradient.addColorStop(1, '#9400D3');
                ctx.fillStyle = gradient;
                break;
            default:
                ctx.fillStyle = '#FFD700';
        }

        ctx.fillRect(this.x, this.y, this.size, this.size / 2);
        
        // Draw eye
        ctx.fillStyle = '#000000';
        const eyeX = this.direction > 0 ? 
            this.x + this.size * 0.8 : 
            this.x + this.size * 0.2;
        ctx.beginPath();
        ctx.arc(eyeX, this.y + this.size * 0.25, 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}

export class FishManager {
    constructor() {
        this.fishes = [];
        this.whales = [];
        this.rainbowFish = null;
        this.rainbowFishSpawned = false;
        this.minSpacing = 80;
        this.baseWhaleCount = 2;
        this.currentSpeedMultiplier = 1;
    }

    addWhale() {
        const whale = new Fish('whale');
        this.ensureNoOverlap(whale);
        this.whales.push(whale);
        console.log('New whale added! Total whales:', this.whales.length);
    }

    increaseWhaleCount() {
        this.addWhale();
    }

    init() {
        // Create regular fish
        for (let i = 0; i < 10; i++) {
            const fish = new Fish('regular');
            this.ensureNoOverlap(fish);
            this.fishes.push(fish);
        }
        
        // Create initial whales
        for (let i = 0; i < this.baseWhaleCount; i++) {
            this.addWhale();
        }

        this.scheduleRainbowFish();
    }

    ensureNoOverlap(newFish) {
        let attempts = 0;
        const maxAttempts = 10;
        let hasOverlap = true;

        while (hasOverlap && attempts < maxAttempts) {
            newFish.reset();
            hasOverlap = false;

            // Check overlap with all existing fish
            const allFish = [...this.fishes, ...this.whales];
            for (const existingFish of allFish) {
                if (this.checkOverlap(newFish, existingFish)) {
                    hasOverlap = true;
                    break;
                }
            }
            attempts++;
        }
    }

    checkOverlap(fish1, fish2) {
        const horizontalSpacing = this.minSpacing + (fish1.size + fish2.size) / 2;
        const verticalSpacing = this.minSpacing * 1.5; // More vertical spacing
        
        return Math.abs(fish1.x - fish2.x) < horizontalSpacing && 
               Math.abs(fish1.y - fish2.y) < verticalSpacing;
    }

    scheduleRainbowFish() {
        // Spawn rainbow fish at a random time between 30-60 seconds
        setTimeout(() => {
            if (!this.rainbowFishSpawned) {
                this.rainbowFish = new Fish('rainbow');
                this.rainbowFishSpawned = true;
            }
        }, Math.random() * 30000 + 30000);
    }

    update() {
        [...this.fishes, ...this.whales].forEach(fish => {
            fish.update();
            if (fish.x > 850 || fish.x < -50) {
                this.ensureNoOverlap(fish);
            }
        });

        if (this.rainbowFish && this.rainbowFish.active) {
            this.rainbowFish.update();
        }
    }

    render(ctx) {
        [...this.fishes, ...this.whales].forEach(fish => fish.render(ctx));
        if (this.rainbowFish && this.rainbowFish.active) {
            this.rainbowFish.render(ctx);
        }
    }

    checkFishingCollision(hookPosition) {
        // Check rainbow fish first
        if (this.rainbowFish && this.rainbowFish.active) {
            if (this.isColliding(hookPosition, this.rainbowFish)) {
                console.log('Rainbow fish caught!');
                this.rainbowFish.active = false;
                return 'rainbow';
            }
        }

        // Check whales
        for (const whale of this.whales) {
            if (this.isColliding(hookPosition, whale)) {
                console.log('Whale hit!');
                return 'whale';
            }
        }

        // Check regular fish
        for (const fish of this.fishes) {
            if (!fish.active) continue;
            
            if (this.isColliding(hookPosition, fish)) {
                console.log('Regular fish caught!');
                fish.active = false;
                setTimeout(() => {
                    fish.reset();
                    fish.active = true;
                }, 1000);
                return 'regular';
            }
        }

        return false;
    }

    isColliding(hookPosition, fish) {
        return (
            hookPosition.x > fish.x && 
            hookPosition.x < fish.x + fish.size &&
            hookPosition.y > fish.y && 
            hookPosition.y < fish.y + fish.size / 2
        );
    }

    // Update speed increase method to use multiplier
    increaseSpeeds() {
        this.currentSpeedMultiplier++;
        console.log(`Increasing all fish speeds to ${this.currentSpeedMultiplier}x!`);
        
        [...this.fishes, ...this.whales].forEach(fish => 
            fish.increaseSpeed(this.currentSpeedMultiplier)
        );
        
        if (this.rainbowFish) {
            this.rainbowFish.increaseSpeed(this.currentSpeedMultiplier);
        }
    }

    resetSpeeds() {
        [...this.fishes, ...this.whales].forEach(fish => fish.resetSpeed());
        if (this.rainbowFish) {
            this.rainbowFish.resetSpeed();
        }
        this.currentSpeedMultiplier = 1;
    }
} 