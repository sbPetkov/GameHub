const fs = require('fs');
const path = require('path');

class CloseEnoughGame {
    constructor(io, roomId) {
        this.io = io;
        this.roomId = roomId;
        this.state = 'LOBBY'; // LOBBY, SPIN, REVEAL, ANSWER, VOTE, RESULT, GAME_OVER
        this.players = []; // Array of { socketId, username, score, timeBank, connected }
        
        // Game Data
        this.categories = ['songs', 'movies', 'real_or_fake', 'trivia'];
        this.mapping = this.loadMapping();
        
        // Turn State
        this.turnIndex = 0; // Index of current player in this.players
        this.currentCategory = null;
        this.currentChallenge = null;
        this.playerAnswer = null;
        this.votes = {}; // socketId -> 'PASS' | 'FAIL'
        
        // Timer
        this.timer = null;
        this.startTime = null;
        
        // Settings
        this.initialTimeBank = 180; // 3 minutes in seconds

        // Question Tracking (Prevent Repeats)
        this.askedQuestions = {
            songs: new Set(),
            movies: new Set(),
            real_or_fake: new Set(),
            trivia: new Set()
        };
    }

    loadMapping() {
        const mapping = { songs: [], movies: [], real_or_fake: [], trivia: [] };
        const categories = Object.keys(mapping);
        // Use environment variable if provided, otherwise fallback to local path
        const baseDir = process.env.CLOSE_ENOUGH_DATA_PATH || path.join(__dirname, '../data/close_enough');

        console.log(`[CloseEnough] Loading mapping from: ${baseDir}`);

        categories.forEach(cat => {
            try {
                const catPath = path.join(baseDir, cat, `${cat}.json`);
                console.log(`[CloseEnough] Checking for file: ${catPath}`);
                if (fs.existsSync(catPath)) {
                    const data = JSON.parse(fs.readFileSync(catPath, 'utf8'));
                    mapping[cat] = data;
                    console.log(`[CloseEnough] Loaded ${data.length} items for ${cat}`);
                } else {
                    console.warn(`[CloseEnough] File NOT FOUND: ${catPath}`);
                }
            } catch (err) {
                console.error(`[CloseEnough] Failed to load ${cat}.json`, err);
            }
        });
        return mapping;
    }

    addPlayer(socketId, username) {
        const player = {
            socketId,
            username,
            score: 0,
            timeBank: this.initialTimeBank,
            connected: true
        };
        this.players.push(player);
        return null; // No symbol needed
    }

    removePlayer(socketId) {
        const index = this.players.findIndex(p => p.socketId === socketId);
        if (index !== -1) {
            this.players.splice(index, 1);
            if (this.state !== 'LOBBY' && this.state !== 'GAME_OVER') {
                // If current player left, force end turn
                if (this.turnIndex === index) {
                    // Adjust index back so endTurn() increments to the correct next player
                    this.turnIndex--;
                    this.endTurn();
                } else if (this.turnIndex > index) {
                    this.turnIndex--;
                }
            }
        }
    }

    updatePlayerSocket(oldId, newId) {
        const player = this.players.find(p => p.socketId === oldId);
        if (player) {
            player.socketId = newId;
            player.connected = true;
        }
    }

    startGame() {
        if (this.state !== 'LOBBY' && this.state !== 'GAME_OVER') return;
        if (this.players.length < 2) return { error: "Need at least 2 players" };
        
        // Shuffle turn order
        this.players.sort(() => Math.random() - 0.5);
        this.turnIndex = 0;
        
        // If first player has no time, find next
        if (this.players[this.turnIndex].timeBank <= 0) {
            this.moveToNextValidPlayer();
        } else {
            this.state = 'SPIN';
            this.io.to(this.roomId).emit('game_update', this.getState());
        }
    }

    moveToNextValidPlayer() {
        let attempts = 0;
        const totalPlayers = this.players.length;
        
        while (attempts < totalPlayers) {
            this.turnIndex = (this.turnIndex + 1) % totalPlayers;
            if (this.players[this.turnIndex].timeBank > 0) {
                this.state = 'SPIN';
                this.io.to(this.roomId).emit('game_update', this.getState());
                return true;
            }
            attempts++;
        }
        
        // If we looped through everyone and nobody has time
        this.state = 'GAME_OVER';
        this.io.to(this.roomId).emit('game_update', this.getState());
        return false;
    }

    buyTime(socketId) {
        const player = this.players.find(p => p.socketId === socketId);
        if (!player) return;
        
        const cost = 15;
        const extraTime = 60; // 1 minute

        if (player.score >= cost) {
            player.score -= cost;
            player.timeBank += extraTime;
            
            // If it was their turn and they were skipped, or if the game was over,
            // we might need more complex logic, but for now just update and emit.
            this.io.to(this.roomId).emit('game_update', this.getState());
            return { success: true };
        }
        return { success: false, message: "Not enough points" };
    }

    spinWheel() {
        if (this.state !== 'SPIN') return;
        
        // Final safety check for time before spinning
        if (this.players[this.turnIndex].timeBank <= 0) {
            this.endTurn();
            return;
        }

        // Pick random category
        const randomCat = this.categories[Math.floor(Math.random() * this.categories.length)];
        this.currentCategory = randomCat;
        
        // Pick random challenge from category (prevent repeats)
        let items = this.mapping[randomCat] || [];
        console.log(`[CloseEnough] Spinning for ${randomCat}. Items in mapping: ${items.length}`);
        
        let availableItems = items.filter(item => !this.askedQuestions[randomCat].has(item.id));

        // If no items left in this category, reset the tracking for this category
        if (availableItems.length === 0 && items.length > 0) {
            this.askedQuestions[randomCat].clear();
            availableItems = items;
        }

        if (availableItems.length === 0) {
            console.error(`[CloseEnough] No items for category ${randomCat}`);
            this.currentChallenge = null;
        } else {
            const selected = availableItems[Math.floor(Math.random() * availableItems.length)];
            this.currentChallenge = selected;
            this.askedQuestions[randomCat].add(selected.id);
            console.log(`[CloseEnough] Selected challenge: ${selected.id}`);
        }

        // Delay for spin animation (simulated on client, but we confirm state here)
        this.state = 'REVEAL';
        this.io.to(this.roomId).emit('game_update', this.getState());
    }

    startAnswering() {
        if (this.state !== 'REVEAL') return;
        
        this.state = 'ANSWER';
        this.playerAnswer = null;
        this.startTime = Date.now();
        
        // Start Timer Logic handled on server tick or request? 
        // We'll trust start time and calc difference on submit for simplicity,
        // but need a timeout to force stop.
        
        const currentPlayer = this.players[this.turnIndex];
        if (!currentPlayer) return; // Should not happen

        // Set timeout to auto-fail if time runs out
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => {
            if (this.state === 'ANSWER') {
                this.submitAnswer(currentPlayer.socketId, "[TIME EXPIRED]");
            }
        }, (currentPlayer.timeBank + 2) * 1000); // +2s buffer

        this.io.to(this.roomId).emit('game_update', this.getState());
    }

    submitAnswer(socketId, answer) {
        if (this.state !== 'ANSWER') return;
        
        const currentPlayer = this.players[this.turnIndex];
        if (currentPlayer.socketId !== socketId) return;

        // Calculate time used
        const now = Date.now();
        const timeUsed = Math.ceil((now - this.startTime) / 1000);
        currentPlayer.timeBank = Math.max(0, currentPlayer.timeBank - timeUsed);
        
        if (this.timer) clearTimeout(this.timer);

        this.playerAnswer = answer;

        // Automatic Validation for Real or Fake?
        if (this.currentCategory === 'real_or_fake') {
            const isCorrect = (String(answer).toLowerCase() === String(this.currentChallenge.isReal).toLowerCase());
            this.resolveRound(isCorrect ? 10 : 0);
            return;
        }

        this.state = 'VOTE';
        this.votes = {};
        
        this.io.to(this.roomId).emit('game_update', this.getState());
    }

    vote(voterId, voteType) { // voteType: 'PASS' | 'FAIL' | 'PARTIAL'
        if (this.state !== 'VOTE') return;
        
        const currentPlayer = this.players[this.turnIndex];
        if (voterId === currentPlayer.socketId) return; // Cannot vote for self

        this.votes[voterId] = voteType;

        // Check for Resolution
        const otherPlayers = this.players.filter(p => p.socketId !== currentPlayer.socketId && p.connected);
        const totalVoters = otherPlayers.length;
        const votesArray = Object.values(this.votes);
        
        const passVotes = votesArray.filter(v => v === 'PASS').length;
        const partialVotes = votesArray.filter(v => v === 'PARTIAL').length;
        const failVotes = votesArray.filter(v => v === 'FAIL').length;

        const threshold = Math.ceil(totalVoters / 2);

        if (this.currentCategory === 'songs') {
            // Rule for Songs: 
            // 1. If 50% vote PASS -> 20 pts
            if (passVotes >= threshold) {
                this.resolveRound(20);
                return;
            }
            // 2. If 50% vote (PASS + PARTIAL) -> 10 pts
            if ((passVotes + partialVotes) >= threshold) {
                // We only resolve 10pts early if we are SURE it can't reach 20pts 
                // OR if it's impossible to reach the PASS threshold anymore.
                // To keep it simple and responsive: 
                // If everyone voted, or if (PASS + PARTIAL) hit threshold and PASS can't hit threshold:
                const remainingVoters = totalVoters - votesArray.length;
                if ((passVotes + remainingVoters) < threshold) {
                    this.resolveRound(10);
                    return;
                }
            }
        } else {
            // Normal 50% PASS rule for other categories -> 10 pts
            if (passVotes >= threshold) {
                this.resolveRound(10);
                return;
            }
        }

        // If everyone voted and no threshold was met
        if (votesArray.length === totalVoters) {
            if (this.currentCategory === 'songs') {
                if (passVotes >= threshold) this.resolveRound(20);
                else if ((passVotes + partialVotes) >= threshold) this.resolveRound(10);
                else this.resolveRound(0);
            } else {
                this.resolveRound(passVotes >= threshold ? 10 : 0);
            }
            return;
        }

        this.io.to(this.roomId).emit('game_update', this.getState());
    }

    resolveRound(points) {
        this.state = 'RESULT';
        this.lastPoints = points;
        this.lastResult = points > 0;
        
        if (points > 0) {
            this.players[this.turnIndex].score += points;
        }

        this.io.to(this.roomId).emit('game_update', this.getState());
    }

    endTurn() {
        this.currentCategory = null;
        this.currentChallenge = null;
        this.playerAnswer = null;
        this.votes = {};

        this.moveToNextValidPlayer();
    }

    makeMove(moveData, socketId) {
        switch(moveData.type) {
            case 'START_GAME':
                this.startGame();
                break;
            case 'SPIN_WHEEL':
                // Can be triggered by host or current player
                if (this.state === 'SPIN') this.spinWheel();
                break;
            case 'REVEAL_CHALLENGE':
                // Triggered by current player to start answering
                if (this.players[this.turnIndex].socketId === socketId) {
                    this.startAnswering();
                }
                break;
            case 'SUBMIT_ANSWER':
                this.submitAnswer(socketId, moveData.answer);
                break;
            case 'VOTE':
                this.vote(socketId, moveData.vote);
                break;
            case 'BUY_TIME':
                this.buyTime(socketId);
                break;
            case 'NEXT_TURN':
                 // Host or current player can proceed
                 this.endTurn();
                 break;
        }
        return { valid: true };
    }

    getState() {
        return {
            state: this.state,
            players: this.players,
            turnIndex: this.turnIndex,
            currentCategory: this.currentCategory,
            currentChallenge: this.currentChallenge,
            playerAnswer: this.playerAnswer,
            votes: this.votes,
            lastResult: this.lastResult,
            lastPoints: this.lastPoints
        };
    }
}

module.exports = CloseEnoughGame;
