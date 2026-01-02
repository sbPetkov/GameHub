const { GoogleGenAI } = require('@google/genai');

class ImposterGame {
    constructor(io, roomId, ai) {
        this.io = io;
        this.roomId = roomId;
        this.ai = ai;
        this.state = 'LOBBY'; // LOBBY, LOADING, PLAYING, GUESSING, ROUND_OVER, GAME_OVER
        this.players = {}; // map socketId -> { socketId, role: 'civilian'|'imposter', vote: targetSocketId, score: 0 }
        
        // Game Settings
        this.categories = ['Foods', 'Animals', 'Famous movies', 'Sports', 'Professions', 'Music Instruments', 'Countries', 'Famous people'];
        this.selectedCategory = 'Foods';
        
        // Round Data
        this.wordQueue = []; // Store batches of { word, decoys }
        this.secretWord = null;
        this.decoys = [];
        this.imposterId = null;
        this.votes = {}; // socketId -> targetSocketId
        
        this.currentRoundNumber = 0;
    }

    addPlayer(socketId) {
        this.players[socketId] = {
            socketId,
            role: null,
            vote: null,
            score: 0
        };
        return null;
    }

    removePlayer(socketId) {
        delete this.players[socketId];
        delete this.votes[socketId];
        
        if (this.state === 'PLAYING' && socketId === this.imposterId) {
            this.endRound('IMPOSTER_LEFT');
        }
    }

    updatePlayerSocket(oldId, newId) {
        if (oldId === newId) return;
        if (this.players[oldId]) {
            this.players[newId] = { ...this.players[oldId], socketId: newId };
            delete this.players[oldId];
            
            for (const voterId in this.votes) {
                if (this.votes[voterId] === oldId) {
                    this.votes[voterId] = newId;
                }
            }
            if (this.votes[oldId]) {
                this.votes[newId] = this.votes[oldId];
                delete this.votes[oldId];
            }

            if (this.imposterId === oldId) {
                this.imposterId = newId;
            }
        }
    }

    async startGame() {
        if (Object.keys(this.players).length < 3) return { error: "Need at least 3 players" };
        
        // Reset scores if it's a fresh start (round 0 or manual reset)
        // But startGame is called for first round. 
        // Let's reset scores only if currentRoundNumber is 0.
        if (this.currentRoundNumber === 0) {
             Object.values(this.players).forEach(p => p.score = 0);
        }

        this.wordQueue = []; // Clear old queue
        this.currentRoundNumber = 0;
        
        this.state = 'LOADING';
        this.io.to(this.roomId).emit('game_update', this.getState());

        try {
            await this.generateWordBatch(10);
            this.startNextRound();
        } catch (err) {
            console.error("AI Generation failed:", err);
            // Fallback
            this.wordQueue = Array(10).fill({ word: "Apple", decoys: ["Pear", "Banana", "Grape"] });
            this.startNextRound();
        }
    }

    async generateWordBatch(count) {
        const prompt = `Generate a JSON array of ${count} distinct objects, each with a secret word and 3 similar decoy words in Bulgarian for the category "${this.selectedCategory}".
        Format: [ { "word": "SecretWord1", "decoys": ["DecoyA", "DecoyB", "DecoyC"] }, ... ]
        The words should be nouns. Do not include markdown formatting like \`\`\`json. Just the JSON string.`;

        const response = await this.ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
        });

        let text = response.text.trim();
        if (text.startsWith('```json')) text = text.replace('```json', '').replace('```', '');
        if (text.startsWith('```')) text = text.replace('```', '');
        
        const data = JSON.parse(text);
        if (Array.isArray(data)) {
            this.wordQueue = data;
        } else {
            throw new Error("AI response was not an array");
        }
    }

    startNextRound() {
        if (this.wordQueue.length === 0) {
            this.state = 'GAME_OVER'; // Finished all rounds
            this.io.to(this.roomId).emit('game_update', this.getState());
            return;
        }

        const nextData = this.wordQueue.shift();
        this.secretWord = nextData.word;
        this.decoys = nextData.decoys;
        
        this.state = 'PLAYING';
        this.currentRoundNumber++;
        this.votes = {};
        
        // Reset player round state
        Object.values(this.players).forEach(p => {
            p.vote = null;
            p.role = 'civilian';
        });

        // Assign Imposter
        const playerIds = Object.keys(this.players);
        this.imposterId = playerIds[Math.floor(Math.random() * playerIds.length)];
        this.players[this.imposterId].role = 'imposter';

        this.io.to(this.roomId).emit('game_update', this.getState());
    }

    vote(voterId, targetId) {
        if (this.state !== 'PLAYING') return;
        if (voterId === targetId) return;

        this.votes[voterId] = targetId;
        this.players[voterId].vote = targetId;

        const allVoted = Object.keys(this.players).every(pid => this.votes[pid]);
        
        if (allVoted) {
            this.resolveVotes();
        } else {
            this.io.to(this.roomId).emit('game_update', this.getState());
        }
    }

    resolveVotes() {
        const voteCounts = {};
        Object.values(this.votes).forEach(target => {
            voteCounts[target] = (voteCounts[target] || 0) + 1;
        });

        let maxVotes = 0;
        let candidates = [];
        for (const [pid, count] of Object.entries(voteCounts)) {
            if (count > maxVotes) {
                maxVotes = count;
                candidates = [pid];
            } else if (count === maxVotes) {
                candidates.push(pid);
            }
        }
        
        let imposterCaught = false;
        if (candidates.length === 1 && candidates[0] === this.imposterId) {
            imposterCaught = true;
        }

        if (imposterCaught) {
            Object.values(this.players).forEach(p => {
                if (p.role !== 'imposter') p.score += 1;
            });
            this.endRound('IMPOSTER_CAUGHT');
        } else {
            this.state = 'GUESSING';
            this.io.to(this.roomId).emit('game_update', this.getState());
        }
    }

    imposterGuess(socketId, word) {
        if (this.state !== 'GUESSING') return;
        if (socketId !== this.imposterId) return;

        let guessedCorrectly = (word === this.secretWord);
        this.players[this.imposterId].score += 1;
        if (guessedCorrectly) {
            this.players[this.imposterId].score += 1;
        }

        this.endRound(guessedCorrectly ? 'IMPOSTER_WON_BONUS' : 'IMPOSTER_WON_SURVIVED');
    }

    endRound(reason) {
        this.state = 'ROUND_OVER';
        this.lastResult = reason;
        this.io.to(this.roomId).emit('game_update', this.getState());
    }

    resetForNextRound() {
        // Continue from queue
        this.startNextRound();
    }

    makeMove(moveData, socketId) {
        switch(moveData.type) {
            case 'START_GAME':
                this.startGame();
                break;
            case 'NEXT_ROUND':
                this.resetForNextRound();
                break;
            case 'VOTE':
                this.vote(socketId, moveData.targetId);
                break;
            case 'IMPOSTER_GUESS':
                this.imposterGuess(socketId, moveData.word);
                break;
            case 'SET_CATEGORY':
                if (this.categories.includes(moveData.category)) {
                    this.selectedCategory = moveData.category;
                    this.io.to(this.roomId).emit('game_update', this.getState());
                }
                break;
        }
        return { valid: true };
    }

    getState() {
        // Use allPlayersData to send roles, relying on client honesty/hiding logic for simplicity
        return {
            state: this.state,
            players: this.players, // Renamed key to keep consistent with frontend expectation if needed, but existing frontend uses allPlayersData?
            // Wait, existing frontend used `allPlayersData` in getState return object, but `players` prop passed to component is different.
            // Let's match previous format exactly.
            
            allPlayersData: this.players, 
            categories: this.categories,
            selectedCategory: this.selectedCategory,
            secretWord: this.secretWord,
            decoys: this.decoys,
            imposterId: this.imposterId,
            lastResult: this.lastResult,
            currentRoundNumber: this.currentRoundNumber,
            roundsLeft: this.wordQueue.length
        };
    }
}

module.exports = ImposterGame;