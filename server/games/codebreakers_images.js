const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');
const path = require('path');

class CodebreakersImagesGame {
    constructor(io, roomId, ai) {
        this.io = io;
        this.roomId = roomId;
        this.ai = ai;
        this.state = 'LOBBY'; // LOBBY, LOADING, PLAYING, GAME_OVER
        this.players = {}; // map socketId -> { socketId, username, team: 'RED'|'BLUE', role: 'OPERATIVE'|'SPYMASTER' }
        
        // Game Data
        this.words = []; // Array of 25: { word: string (image path), type: 'RED'|'BLUE'|'NEUTRAL'|'ASSASSIN', revealed: boolean }
        this.turn = null; // 'RED_SPY', 'RED_GUESS', 'BLUE_SPY', 'BLUE_GUESS'
        this.scores = { RED: 9, BLUE: 8 }; // Words left to guess (Starting team has 9)
        this.winner = null;
        this.winReason = '';
        
        // Turn State
        this.currentClue = { word: '', count: 0 };
        this.guessesMade = 0;
        this.proposedGuess = null; // { index: number, proposer: username } - Highlighting logic
        
        this.category = 'All Images'; // Not really used for generation, but maybe for display
    }

    addPlayer(socketId, username) {
        // Auto-assign team to balance
        const redCount = Object.values(this.players).filter(p => p.team === 'RED').length;
        const blueCount = Object.values(this.players).filter(p => p.team === 'BLUE').length;
        const team = redCount <= blueCount ? 'RED' : 'BLUE';

        this.players[socketId] = {
            socketId,
            username: username || 'Player', 
            team,
            role: 'OPERATIVE'
        };
        return null;
    }

    removePlayer(socketId) {
        delete this.players[socketId];
        if (this.proposedGuess && this.players[this.proposedGuess.proposer]?.socketId === socketId) {
            this.proposedGuess = null;
        }
    }

    updatePlayerSocket(oldId, newId) {
        if (oldId === newId) return;
        if (this.players[oldId]) {
            this.players[newId] = { ...this.players[oldId], socketId: newId };
            delete this.players[oldId];
        }
    }

    // --- SETUP ---

    switchTeam(socketId) {
        const p = this.players[socketId];
        if (!p) return;
        p.team = p.team === 'RED' ? 'BLUE' : 'RED';
        p.role = 'OPERATIVE'; // Reset role on swap
        this.io.to(this.roomId).emit('game_update', this.getState());
    }

    becomeSpymaster(socketId) {
        const p = this.players[socketId];
        if (!p) return;
        
        // Remove existing spymaster for that team
        Object.values(this.players).forEach(other => {
            if (other.team === p.team && other.role === 'SPYMASTER') {
                other.role = 'OPERATIVE';
            }
        });
        
        p.role = 'SPYMASTER';
        this.io.to(this.roomId).emit('game_update', this.getState());
    }

    async startGame(config) {
        const redSpy = Object.values(this.players).find(p => p.team === 'RED' && p.role === 'SPYMASTER');
        const blueSpy = Object.values(this.players).find(p => p.team === 'BLUE' && p.role === 'SPYMASTER');
        
        if (!redSpy || !blueSpy) return { valid: false, message: "Both teams need a Spymaster!" };
        
        this.state = 'LOADING';
        this.io.to(this.roomId).emit('game_update', this.getState());

        try {
            await this.generateImages();
            this.setupBoard();
            this.state = 'PLAYING';
            // Red always starts with 9 cards, Blue with 8
            this.turn = 'RED_SPY'; 
            this.scores = { RED: 9, BLUE: 8 }; 
            this.io.to(this.roomId).emit('game_update', this.getState());
        } catch (err) {
            console.error("Image Gen failed", err);
            this.state = 'LOBBY';
            return { valid: false, message: "Failed to load images" };
        }
        return { valid: true };
    }

    async generateImages() {
        const imagesDir = path.join(__dirname, '../Images');
        const allImages = [];

        // Recursive function to walk directories
        const walk = (dir, rootDir) => {
            const files = fs.readdirSync(dir);
            for (const file of files) {
                const filePath = path.join(dir, file);
                const stat = fs.statSync(filePath);
                if (stat.isDirectory()) {
                    walk(filePath, rootDir);
                } else if (file.toLowerCase().endsWith('.png') || file.toLowerCase().endsWith('.jpg')) {
                    // Store relative path from Images folder
                    const relativePath = path.relative(rootDir, filePath);
                    allImages.push(relativePath); // e.g., "andymeneely/police-badge.png"
                }
            }
        };

        try {
            walk(imagesDir, imagesDir);
        } catch (err) {
            console.error("Error reading images directory:", err);
            throw err;
        }

        if (allImages.length < 25) {
            throw new Error("Not enough images found in server/Images");
        }

        // Pick 25 random images
        const selected = [];
        const copy = [...allImages];
        for (let i = 0; i < 25; i++) {
            const idx = Math.floor(Math.random() * copy.length);
            selected.push(copy[idx]);
            copy.splice(idx, 1);
        }

        this.words = selected.map(img => ({ word: img, type: 'NEUTRAL', revealed: false }));
    }

    setupBoard() {
        // Shuffle Types
        // 9 Starting Team (RED), 8 Other (BLUE), 7 Neutral, 1 Assassin
        const types = [
            ...Array(9).fill('RED'),
            ...Array(8).fill('BLUE'),
            ...Array(7).fill('NEUTRAL'),
            'ASSASSIN'
        ];
        
        // Fisher-Yates shuffle
        for (let i = types.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [types[i], types[j]] = [types[j], types[i]];
        }

        // Apply to words
        this.words.forEach((w, i) => w.type = types[i]);
    }

    // --- GAMEPLAY ---

    giveClue(socketId, clue, count) {
        if (!this.players[socketId]) return;
        const p = this.players[socketId];
        
        if (p.role !== 'SPYMASTER') return;
        if (this.turn === 'RED_SPY' && p.team !== 'RED') return;
        if (this.turn === 'BLUE_SPY' && p.team !== 'BLUE') return;

        this.currentClue = { word: clue, count: parseInt(count) };
        this.guessesMade = 0;
        this.turn = p.team === 'RED' ? 'RED_GUESS' : 'BLUE_GUESS';
        this.proposedGuess = null; // Clear prev selections
        
        this.io.to(this.roomId).emit('game_update', this.getState());
    }

    proposeGuess(socketId, index) {
        if (!this.players[socketId]) return;
        const p = this.players[socketId];
        
        // Must be operative of current turn's team
        if (p.role !== 'OPERATIVE') return;
        if (this.turn === 'RED_GUESS' && p.team !== 'RED') return;
        if (this.turn === 'BLUE_GUESS' && p.team !== 'BLUE') return;
        
        if (this.words[index].revealed) return;

        // Toggle logic
        if (this.proposedGuess && this.proposedGuess.index === index) {
            this.proposedGuess = null;
        } else {
            this.proposedGuess = { index, proposer: p.username };
        }
        
        this.io.to(this.roomId).emit('game_update', this.getState());
    }

    confirmGuess(socketId) {
        if (!this.players[socketId]) return;
        const p = this.players[socketId];
        
        // Same checks
        if (p.role !== 'OPERATIVE') return;
        const activeTeam = this.turn.split('_')[0]; // 'RED' or 'BLUE'
        if (p.team !== activeTeam) return;
        
        if (!this.proposedGuess) return;

        const index = this.proposedGuess.index;
        const card = this.words[index];
        
        card.revealed = true;
        this.proposedGuess = null;
        this.guessesMade++;

        // Result Logic
        if (card.type === 'ASSASSIN') {
            this.winner = activeTeam === 'RED' ? 'BLUE' : 'RED';
            this.winReason = `${activeTeam} team contacted the Assassin!`;
            this.state = 'GAME_OVER';
        } else if (card.type === 'NEUTRAL') {
            this.endTurn();
        } else if (card.type !== activeTeam) {
            // Guessed opponent's card
            this.scores[card.type]--; // Decrement opponent score (words left)
            this.checkWin();
            if (this.state !== 'GAME_OVER') this.endTurn();
        } else {
            // Correct guess!
            this.scores[activeTeam]--;
            this.checkWin();
            
            // Can continue?
            // Max guesses = count + 1
            if (this.state !== 'GAME_OVER') {
                if (this.guessesMade >= this.currentClue.count + 1) {
                    this.endTurn();
                } else {
                    // Turn continues
                    this.io.to(this.roomId).emit('game_update', this.getState());
                }
            }
        }
        
        if (this.state !== 'GAME_OVER' && this.state !== 'PLAYING') {
             this.io.to(this.roomId).emit('game_update', this.getState());
        }
    }

    endTurn() {
        this.proposedGuess = null;
        this.currentClue = { word: '', count: 0 };
        this.guessesMade = 0;
        
        if (this.turn.startsWith('RED')) {
            this.turn = 'BLUE_SPY';
        } else {
            this.turn = 'RED_SPY';
        }
        this.io.to(this.roomId).emit('game_update', this.getState());
    }

    checkWin() {
        if (this.scores.RED === 0) {
            this.winner = 'RED';
            this.winReason = "Red Team found all their agents!";
            this.state = 'GAME_OVER';
        } else if (this.scores.BLUE === 0) {
            this.winner = 'BLUE';
            this.winReason = "Blue Team found all their agents!";
            this.state = 'GAME_OVER';
        }
    }

    makeMove(moveData, socketId) {
        const type = moveData.type;
        switch(type) {
            case 'START_GAME':
                return this.startGame(moveData.config); // Return result
            case 'SWITCH_TEAM':
                this.switchTeam(socketId);
                break;
            case 'BECOME_SPY':
                this.becomeSpymaster(socketId);
                break;
            case 'GIVE_CLUE':
                this.giveClue(socketId, moveData.clue, moveData.count);
                break;
            case 'PROPOSE_GUESS':
                this.proposeGuess(socketId, moveData.index);
                break;
            case 'CONFIRM_GUESS':
                this.confirmGuess(socketId);
                break;
            case 'END_TURN':
                // Operatives can end guessing early
                if (this.turn.includes('GUESS')) {
                    const p = this.players[socketId];
                    const activeTeam = this.turn.split('_')[0];
                    if (p && p.team === activeTeam && p.role === 'OPERATIVE') {
                        this.endTurn();
                    }
                }
                break;
        }
        return { valid: true };
    }

    getState() {
        return {
            state: this.state,
            players: this.players,
            words: this.words,
            turn: this.turn,
            scores: this.scores,
            currentClue: this.currentClue,
            proposedGuess: this.proposedGuess,
            winner: this.winner,
            winReason: this.winReason,
            category: this.category
        };
    }
}

module.exports = CodebreakersImagesGame;