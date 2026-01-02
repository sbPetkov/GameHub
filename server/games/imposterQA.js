const { GoogleGenAI } = require('@google/genai');

class ImposterQAGame {
    constructor(io, roomId, ai) {
        this.io = io;
        this.roomId = roomId;
        this.ai = ai;
        this.state = 'LOBBY'; // LOBBY, LOADING, INPUT, PLAYING, GUESSING, ROUND_OVER, GAME_OVER
        this.players = {}; // map socketId -> { socketId, role, vote, score, answer }
        
        // Game Settings
        this.categories = ['Adult (18+)', 'Childhood', 'Daily Life', 'Philosophy', 'Hypothetical'];
        this.selectedCategory = 'Daily Life';
        
        // Round Data
        this.questionQueue = []; // Batch of { mainQ, oddQ, decoys: [] }
        this.mainQuestion = null;
        this.oddQuestion = null;
        this.decoys = []; // For imposter to guess main question
        this.imposterId = null;
        this.votes = {}; 
        
        this.currentRoundNumber = 0;
    }

    addPlayer(socketId) {
        this.players[socketId] = {
            socketId,
            role: null,
            vote: null,
            score: 0,
            answer: null,
            hasSubmitted: false
        };
        return null;
    }

    removePlayer(socketId) {
        delete this.players[socketId];
        delete this.votes[socketId];
        // If playing, might need to end round or auto-submit empty answer
    }

    updatePlayerSocket(oldId, newId) {
        if (oldId === newId) return;
        if (this.players[oldId]) {
            this.players[newId] = { ...this.players[oldId], socketId: newId };
            delete this.players[oldId];
            
            // Migrate votes
            for (const voterId in this.votes) {
                if (this.votes[voterId] === oldId) this.votes[voterId] = newId;
            }
            if (this.votes[oldId]) {
                this.votes[newId] = this.votes[oldId];
                delete this.votes[oldId];
            }
            if (this.imposterId === oldId) this.imposterId = newId;
        }
    }

    async startGame() {
        if (Object.keys(this.players).length < 3) return { error: "Need at least 3 players" };
        
        if (this.currentRoundNumber === 0) {
             Object.values(this.players).forEach(p => p.score = 0);
        }

        this.questionQueue = [];
        this.currentRoundNumber = 0;
        
        this.state = 'LOADING';
        this.io.to(this.roomId).emit('game_update', this.getState());

        try {
            await this.generateQuestionBatch(10);
            this.startNextRound();
        } catch (err) {
            console.error("AI Generation failed:", err);
            // Fallback
            this.questionQueue = Array(10).fill({
                mainQ: "How many legs does a dog have?",
                oddQ: "How many legs does a table have?",
                decoys: ["How many legs does a spider have?", "How many legs does a human have?"]
            });
            this.startNextRound();
        }
    }

    async generateQuestionBatch(count) {
        // Mapping friendly names to prompt context
        let categoryContext = this.selectedCategory;
        if (this.selectedCategory === 'Adult (18+)') categoryContext = 'Spicy, funny, adult-themed party questions (but safe for work/AI)';
        
        const prompt = `Generate a JSON array of ${count} round objects for a game called 'Imposter Q&A' in Bulgarian.
        Category: "${categoryContext}".
        
        Each object must have:
        - "mainQ": The question for the majority.
        - "oddQ": A different question for the imposter.
        - "decoys": An array of 2 other questions similar to mainQ (used for a guessing game later).

        CRITICAL RULE: "mainQ" and "oddQ" must be about different subjects but the expected answers should be very similar in format (e.g. both are numbers, or colors, or places) so that when players answer, it is not immediately obvious who answered which question.
        
        Example: 
        { 
          "mainQ": "How tall is a standard vodka bottle (cm)?", 
          "oddQ": "How long is a newborn kitten (cm)?",
          "decoys": ["How tall is a beer can?", "How long is a remote?"]
        }
        
        Do not include markdown formatting like \`\`\`json. Just the JSON string.`;

        const response = await this.ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
        });

        let text = response.text.trim();
        if (text.startsWith('```json')) text = text.replace('```json', '').replace('```', '');
        if (text.startsWith('```')) text = text.replace('```', '');
        
        const data = JSON.parse(text);
        if (Array.isArray(data)) {
            this.questionQueue = data;
        } else {
            throw new Error("AI response was not an array");
        }
    }

    startNextRound() {
        if (this.questionQueue.length === 0) {
            this.state = 'GAME_OVER';
            this.io.to(this.roomId).emit('game_update', this.getState());
            return;
        }

        const nextData = this.questionQueue.shift();
        this.mainQuestion = nextData.mainQ;
        this.oddQuestion = nextData.oddQ;
        this.decoys = nextData.decoys;
        
        this.state = 'INPUT'; // New state: waiting for answers
        this.currentRoundNumber++;
        this.votes = {};
        
        // Reset player round state
        Object.values(this.players).forEach(p => {
            p.vote = null;
            p.role = 'civilian';
            p.answer = null;
            p.hasSubmitted = false;
        });

        // Assign Imposter
        const playerIds = Object.keys(this.players);
        this.imposterId = playerIds[Math.floor(Math.random() * playerIds.length)];
        this.players[this.imposterId].role = 'imposter';

        this.io.to(this.roomId).emit('game_update', this.getState());
    }

    submitAnswer(socketId, answer) {
        if (this.state !== 'INPUT') return;
        if (!this.players[socketId]) return;

        this.players[socketId].answer = answer;
        this.players[socketId].hasSubmitted = true;

        // Check if all submitted
        const allSubmitted = Object.values(this.players).every(p => p.hasSubmitted);
        if (allSubmitted) {
            this.state = 'PLAYING'; // Move to voting
        }
        
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

    imposterGuess(socketId, chosenQuestion) {
        if (this.state !== 'GUESSING') return;
        if (socketId !== this.imposterId) return;

        let guessedCorrectly = (chosenQuestion === this.mainQuestion);
        
        // Imposter survived -> 1 pt
        this.players[this.imposterId].score += 1;
        
        if (guessedCorrectly) {
            // Bonus -> 1 pt
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
            case 'SUBMIT_ANSWER':
                this.submitAnswer(socketId, moveData.answer);
                break;
            case 'VOTE':
                this.vote(socketId, moveData.targetId);
                break;
            case 'IMPOSTER_GUESS':
                this.imposterGuess(socketId, moveData.question);
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
        // Security: In INPUT phase, do NOT send other players' answers
        const playersSafe = {};
        for (const [pid, p] of Object.entries(this.players)) {
            playersSafe[pid] = {
                socketId: p.socketId,
                role: p.role,
                vote: p.vote,
                score: p.score,
                hasSubmitted: p.hasSubmitted,
                // Only reveal answer if in PLAYING, GUESSING, or ROUND_OVER states
                answer: (this.state === 'PLAYING' || this.state === 'GUESSING' || this.state === 'ROUND_OVER') ? p.answer : null
            };
        }

        return {
            state: this.state,
            players: this.players, // Deprecated, use allPlayersData
            allPlayersData: playersSafe, 
            categories: this.categories,
            selectedCategory: this.selectedCategory,
            
            // Sensitive Data
            mainQuestion: this.mainQuestion, // Client will hide if imposter
            oddQuestion: this.oddQuestion,   // Client will hide if civilian
            decoys: this.decoys,
            imposterId: this.imposterId,
            
            lastResult: this.lastResult,
            currentRoundNumber: this.currentRoundNumber,
            roundsLeft: this.questionQueue.length
        };
    }
}

module.exports = ImposterQAGame;
