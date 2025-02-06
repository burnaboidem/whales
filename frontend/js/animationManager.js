import { PointAnimation } from './pointAnimation.js';

export class AnimationManager {
    constructor() {
        this.animations = new Set();
    }

    createAnimation(x, y, amount, isRainbow) {
        const animation = new PointAnimation(x, y, amount, isRainbow);
        this.animations.add(animation);
        
        // Automatically remove animation after 1.5 seconds
        setTimeout(() => {
            this.animations.delete(animation);
        }, 1500);

        // Debug log
        console.log('Created animation:', amount, 'at', x, y);
    }

    update(currentTime) {
        for (const animation of this.animations) {
            animation.update(currentTime);
        }
    }

    render(ctx, currentTime) {
        for (const animation of this.animations) {
            animation.render(ctx, currentTime);
        }
    }
} 