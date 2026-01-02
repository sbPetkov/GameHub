const { GoogleGenAI } = require('@google/genai');

class BalderdashGame {
    constructor(io, roomId, ai) {
        this.io = io;
        this.roomId = roomId;
        this.ai = ai;
        this.state = 'LOBBY'; // LOBBY, LOADING, INPUT, VOTING, ROUND_OVER, GAME_OVER
        this.players = {}; 
        
        // Game Settings
        this.categories = ['General', 'Archaic', 'Dialect', 'Scientific']; // Maybe just one mode for now
        this.selectedCategory = 'General';
        
        // Round Data
        this.wordQueue = []; 
        this.currentWord = null;
        this.realDefinition = null;
        this.definitions = []; // Array of { id: 'AI' | socketId, text: "..." } shuffled
        this.votes = {}; 
        
        this.currentRoundNumber = 0;
    }

    addPlayer(socketId) {
        this.players[socketId] = {
            socketId,
            score: 0,
            definition: null,
            hasSubmitted: false,
            vote: null
        };
        return null;
    }

    removePlayer(socketId) {
        delete this.players[socketId];
        delete this.votes[socketId];
    }

    updatePlayerSocket(oldId, newId) {
        if (oldId === newId) return;
        if (this.players[oldId]) {
            this.players[newId] = { ...this.players[oldId], socketId: newId };
            delete this.players[oldId];
            
            for (const voterId in this.votes) {
                if (this.votes[voterId] === oldId) this.votes[voterId] = newId;
            }
        }
    }

    normalizeText(text) {
        if (!text) return "";
        let clean = text.trim();
        // Remove punctuation
        clean = clean.replace(/[.,/#!$%^&*;:{}=\-_`~()]/g,"");
        // Remove extra spaces
        clean = clean.replace(/\s{2,}/g," ");
        // Capitalize first letter
        return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
    }

    async startGame() {
        if (Object.keys(this.players).length < 2) return { error: "Need at least 2 players" };
        
        if (this.currentRoundNumber === 0) {
             Object.values(this.players).forEach(p => p.score = 0);
        }

        this.wordQueue = [];
        this.currentRoundNumber = 0;
        
        this.state = 'LOADING';
        this.io.to(this.roomId).emit('game_update', this.getState());

        try {
            await this.generateWordBatch(10);
            this.startNextRound();
        } catch (err) {
            console.error("AI Generation failed:", err);
            this.wordQueue = Array(10).fill({ 
                word: "Аглет", 
                definition: "Пластмасовият или метален накрайник на връзките за обувки" 
            });
            this.startNextRound();
        }
    }

    async generateWordBatch(count) {
        const prompt = `Generate a JSON array of ${count} distinct objects for a Balderdash-style game in Bulgarian.
        Each object must have:
        - "word": An obscure, archaic, or very rare Bulgarian word that most people do NOT know.
        - "definition": A single, simple sentence defining the word. 
        
        Format: [ { "word": "Word1", "definition": "Short definition." }, ... ]
        Do not include markdown formatting like 
        Just the JSON string.`;

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
            this.state = 'GAME_OVER';
            this.io.to(this.roomId).emit('game_update', this.getState());
            return;
        }

        const nextData = this.wordQueue.shift();
        this.currentWord = nextData.word;
        this.realDefinition = this.normalizeText(nextData.definition);
        
        this.state = 'INPUT';
        this.currentRoundNumber++;
        this.votes = {};
        this.definitions = [];
        
        // Reset player round state
        Object.values(this.players).forEach(p => {
            p.definition = null;
            p.hasSubmitted = false;
            p.vote = null;
        });

        this.io.to(this.roomId).emit('game_update', this.getState());
    }

    submitDefinition(socketId, text) {
        if (this.state !== 'INPUT') return;
        if (!this.players[socketId]) return;

        this.players[socketId].definition = this.normalizeText(text);
        this.players[socketId].hasSubmitted = true;

        const allSubmitted = Object.values(this.players).every(p => p.hasSubmitted);
        if (allSubmitted) {
            this.prepareVotingPhase();
        } else {
            this.io.to(this.roomId).emit('game_update', this.getState());
        }
    }

    prepareVotingPhase() {
        this.state = 'VOTING';
        
        // Collect all definitions
        const defs = [];
        // 1. Real AI definition
        defs.push({ id: 'AI', text: this.realDefinition });
        
        // 2. Player definitions
        Object.values(this.players).forEach(p => {
            defs.push({ id: p.socketId, text: p.definition });
        });

        // Shuffle
        this.definitions = defs.sort(() => Math.random() - 0.5);
        
        this.io.to(this.roomId).emit('game_update', this.getState());
    }

    vote(voterId, targetDefIndex) {
        if (this.state !== 'VOTING') return;
        
        // targetDefIndex is index in this.definitions array
        if (targetDefIndex < 0 || targetDefIndex >= this.definitions.length) return;
        
        const targetId = this.definitions[targetDefIndex].id;
        
        // Prevent voting for self (optional, but good rule)
        if (targetId === voterId) return; 

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
        // Scoring Logic:
        // 1. If you voted for AI (Real) -> +2 pts
        // 2. If someone voted for YOUR definition -> +1 pt per vote
        
        Object.entries(this.votes).forEach(([voterId, targetId]) => {
            const voter = this.players[voterId];
            
            if (targetId === 'AI') {
                // Correct guess
                voter.score += 2;
            } else {
                // Voted for a player
                const targetPlayer = this.players[targetId];
                if (targetPlayer) {
                    targetPlayer.score += 1;
                }
            }
        });

        this.endRound();
    }

    endRound() {
        this.state = 'ROUND_OVER';
        this.io.to(this.roomId).emit('game_update', this.getState());
    }

    resetForNextRound() {
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
            case 'SUBMIT_DEFINITION':
                this.submitDefinition(socketId, moveData.definition);
                break;
            case 'VOTE':
                this.vote(socketId, moveData.targetIndex);
                break;
        }
        return { valid: true };
    }

    getState() {
        const playersSafe = {};
        for (const [pid, p] of Object.entries(this.players)) {
            playersSafe[pid] = {
                socketId: p.socketId,
                score: p.score,
                hasSubmitted: p.hasSubmitted,
                vote: (this.state === 'ROUND_OVER' || this.state === 'GAME_OVER') ? p.vote : (p.vote ? 'VOTED' : null),
                // Definition only revealed at end
                definition: (this.state === 'ROUND_OVER' || this.state === 'GAME_OVER') ? p.definition : null
            };
        }

        return {
            state: this.state,
            players: this.players, // Deprecated prop
            allPlayersData: playersSafe,
            
            currentWord: this.currentWord,
            definitions: this.state === 'VOTING' || this.state === 'ROUND_OVER' ? this.definitions : [],
            realDefinition: this.state === 'ROUND_OVER' ? this.realDefinition : null, // Only send ID at end? Actually defs array has IDs
            
            currentRoundNumber: this.currentRoundNumber,
            roundsLeft: this.wordQueue.length
        };
    }
}

module.exports = BalderdashGame;
