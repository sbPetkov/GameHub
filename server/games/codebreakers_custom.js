const CodebreakersImagesGame = require('./codebreakers_images');
const fs = require('fs');
const path = require('path');

class CodebreakersCustomGame extends CodebreakersImagesGame {
    constructor(io, roomId, ai) {
        super(io, roomId, ai);
        this.uploadedImages = []; // Array of relative paths "roomId/filename.jpg"
        this.uploadsByPlayer = {}; // username -> count
        this.minImages = 25;
        this.category = 'Custom Uploads';
    }

    handleImageUpload(username, newFiles) {
        // Add new files
        this.uploadedImages.push(...newFiles);
        
        // Update player count
        if (!this.uploadsByPlayer[username]) {
            this.uploadsByPlayer[username] = 0;
        }
        this.uploadsByPlayer[username] += newFiles.length;

        // Notify room
        this.io.to(this.roomId).emit('game_update', this.getState());
    }

    async startGame(config) {
        if (this.uploadedImages.length < this.minImages) {
            return { valid: false, message: `Need ${this.minImages - this.uploadedImages.length} more images!` };
        }

        const redSpy = Object.values(this.players).find(p => p.team === 'RED' && p.role === 'SPYMASTER');
        const blueSpy = Object.values(this.players).find(p => p.team === 'BLUE' && p.role === 'SPYMASTER');
        
        if (!redSpy || !blueSpy) return { valid: false, message: "Both teams need a Spymaster!" };
        
        this.state = 'LOADING';
        this.io.to(this.roomId).emit('game_update', this.getState());

        try {
            // Pick 25 random images from uploads
            const selected = [];
            const copy = [...this.uploadedImages];
            for (let i = 0; i < 25; i++) {
                const idx = Math.floor(Math.random() * copy.length);
                selected.push(copy[idx]);
                copy.splice(idx, 1);
            }

            this.words = selected.map(img => ({ word: img, type: 'NEUTRAL', revealed: false }));
            
            this.setupBoard();
            this.state = 'PLAYING';
            this.turn = 'RED_SPY'; 
            this.scores = { RED: 9, BLUE: 8 }; 
            this.io.to(this.roomId).emit('game_update', this.getState());
        } catch (err) {
            console.error("Custom Game Start Error", err);
            this.state = 'LOBBY';
            return { valid: false, message: "Failed to start game" };
        }
        return { valid: true };
    }

    // Override generateImages to do nothing (we use uploads)
    async generateImages() {
        return;
    }

    getState() {
        return {
            ...super.getState(),
            uploadedCount: this.uploadedImages.length,
            uploadsByPlayer: this.uploadsByPlayer,
            minImages: this.minImages
        };
    }
}

module.exports = CodebreakersCustomGame;
