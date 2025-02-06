export class AssetLoader {
    static assets = {
        images: {},
        sounds: {}
    };

    static async load() {
        const imageAssets = {
            'boat': 'assets/sprites/boat.png',
            'fisherman': 'assets/sprites/fisherman.png',
            'fish': 'assets/sprites/fish.png',
            'whale': 'assets/sprites/whale.png',
            'hook': 'assets/sprites/hook.png'
        };

        const soundAssets = {
            'splash': 'assets/sounds/splash.mp3',
            'catch': 'assets/sounds/catch.mp3',
            'whale': 'assets/sounds/whale.mp3'
        };

        const imagePromises = Object.entries(imageAssets).map(([key, src]) => {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => {
                    this.assets.images[key] = img;
                    resolve();
                };
                img.onerror = reject;
                img.src = src;
            });
        });

        const soundPromises = Object.entries(soundAssets).map(([key, src]) => {
            return new Promise((resolve, reject) => {
                const audio = new Audio();
                audio.oncanplaythrough = () => {
                    this.assets.sounds[key] = audio;
                    resolve();
                };
                audio.onerror = reject;
                audio.src = src;
            });
        });

        try {
            await Promise.all([...imagePromises, ...soundPromises]);
            console.log('All assets loaded successfully');
        } catch (error) {
            console.error('Error loading assets:', error);
        }
    }

    static getImage(key) {
        return this.assets.images[key];
    }

    static playSound(key) {
        const sound = this.assets.sounds[key];
        if (sound) {
            sound.currentTime = 0;
            sound.play();
        }
    }
} 