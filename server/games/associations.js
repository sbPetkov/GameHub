class Associations {
    constructor(io, roomId) {
        this.io = io;
        this.roomId = roomId;
        this.state = 'INPUTS'; // INPUTS, TEAMS, PLAYING, ROUND_OVER, GAME_OVER
        this.players = {}; // map socketId -> player data
        this.words = []; // All words submitted
        this.roundWords = []; // Words remaining in current round
        this.teams = [[], []]; // Array of arrays of socketIds. Default 2 teams.
        this.scores = [0, 0]; // Score per team
        this.currentRound = 1;
        this.maxRounds = 3;
        
        // Turn State
        this.currentTeamIndex = 0;
        this.turnPlayerIndices = [0, 0, 0, 0]; // Track which player is next for each team
        this.currentWord = null;
        this.timer = null;
        this.timeLeft = 0;
        this.turnActive = false;
    }

    addPlayer(socketId) {
        this.players[socketId] = {
            wordsSubmitted: false,
            socketId
        };
        // Auto assign to team with fewest players initially
        const smallestTeam = this.teams.reduce((minIndex, team, index, arr) => 
            team.length < arr[minIndex].length ? index : minIndex, 0);
        this.teams[smallestTeam].push(socketId);
    }

    updatePlayerSocket(oldId, newId) {
        if (oldId === newId) return;

        if (this.players[oldId]) {
            this.players[newId] = { ...this.players[oldId], socketId: newId };
            delete this.players[oldId];
        }

        // Update Teams
        this.teams = this.teams.map(team => 
            team.map(id => id === oldId ? newId : id)
        );
    }

    removePlayer(socketId) {
        delete this.players[socketId];
        this.teams = this.teams.map(team => team.filter(id => id !== socketId));
    }

    submitWords(socketId, newWords) {
        if (this.state !== 'INPUTS') return;
        
        this.players[socketId].wordsSubmitted = true;
        this.words.push(...newWords);

        // Check if everyone submitted
        const allSubmitted = Object.values(this.players).every(p => p.wordsSubmitted);
        
        // If everyone submitted, host can move to Team setup, 
        // but we'll just expose the state and let host trigger the transition
        // or auto-transition if you prefer. For now, let's wait for host command.
    }

    setTeamsCount(count) {
        if (count < 2 || count > 4) return;
        
        // Flatten current players and redistribute
        const allPlayers = this.teams.flat();
        this.teams = Array.from({ length: count }, () => []);
        this.scores = Array(count).fill(0);
        this.turnPlayerIndices = Array(count).fill(0);

        // Distribute round-robin
        allPlayers.forEach((pid, i) => {
            this.teams[i % count].push(pid);
        });
    }

    movePlayer(socketId, targetTeamIndex) {
        // Remove from current team
        this.teams = this.teams.map(team => team.filter(id => id !== socketId));
        // Add to new
        if (this.teams[targetTeamIndex]) {
            this.teams[targetTeamIndex].push(socketId);
        }
    }

    startGame() {
        if (this.words.length === 0) return { error: "No words submitted" };
        this.state = 'PLAYING';
        this.currentRound = 1;
        this.resetRoundPile();
        this.currentTeamIndex = 0;
    }

    resetRoundPile() {
        // Shuffle words
        this.roundWords = [...this.words].sort(() => Math.random() - 0.5);
    }

    startTurn() {
        if (this.turnActive) return;
        if (this.roundWords.length === 0) return;

        this.turnActive = true;
        this.timeLeft = 60;
        this.nextWord();

        // Start Timer
        clearInterval(this.timer);
        this.timer = setInterval(() => {
            this.timeLeft--;
            if (this.timeLeft <= 0) {
                this.endTurn('TIME_UP');
            } else {
                // Optimize: Don't emit every second if not needed, 
                // but for simple sync, emitting every second is fine for 1 room.
                // Better: Emit "timer_sync" every 5s and let client count down.
                // For this MVP, we emit ticks.
                this.io.to(this.roomId).emit('associations:timer_tick', this.timeLeft);
            }
        }, 1000);
    }

    nextWord() {
        if (this.roundWords.length === 0) {
            // Round Over logic
            if (this.currentRound >= this.maxRounds) {
                this.endTurn('GAME_OVER');
                this.state = 'GAME_OVER';
                this.io.to(this.roomId).emit('game_update', this.getState());
                return;
            }

            // Start next round immediately
            this.currentRound++;
            this.resetRoundPile();
            
            // Notify clients of round change (optional: flash message)
            this.io.to(this.roomId).emit('associations:round_change', { newRound: this.currentRound });
        }
        
        // Pick next word
        this.currentWord = this.roundWords.pop();
        this.io.to(this.roomId).emit('game_update', this.getState());
    }

    guessWord() {
        if (!this.turnActive) return;
        
        // Add score
        this.scores[this.currentTeamIndex]++;
        this.nextWord();
    }

    skipWord() {
        // Optional: Put word back at bottom of pile?
        if (!this.turnActive || !this.currentWord) return;
        this.roundWords.unshift(this.currentWord); // Put back
        this.nextWord();
    }

    endTurn(reason) {
        clearInterval(this.timer);
        this.turnActive = false;

        if (reason === 'TIME_UP' && this.currentWord) {
            this.roundWords.unshift(this.currentWord); // Put back the word if time ran out
        }
        
        this.currentWord = null;

        if (reason === 'ROUND_OVER') {
            this.state = 'ROUND_OVER';
        } else {
            // Move to next team
            this.currentTeamIndex = (this.currentTeamIndex + 1) % this.teams.length;
            
            // Move to next player in that team
            const teamSize = this.teams[this.currentTeamIndex].length;
            if (teamSize > 0) {
                this.turnPlayerIndices[this.currentTeamIndex] = 
                    (this.turnPlayerIndices[this.currentTeamIndex] + 1) % teamSize;
            }
        }

        this.io.to(this.roomId).emit('game_update', this.getState());
    }

    startNextRound() {
        if (this.currentRound >= this.maxRounds) {
            this.state = 'GAME_OVER';
        } else {
            this.currentRound++;
            this.state = 'PLAYING';
            this.resetRoundPile();
            // Optional: Reset team turn order? Usually we keep going.
        }
    }

    getCurrentPlayerId() {
        const team = this.teams[this.currentTeamIndex];
        const playerIndex = this.turnPlayerIndices[this.currentTeamIndex];
        return team[playerIndex];
    }

    // Generic move handler from RoomManager
    makeMove(moveData, socketId) {
        const type = moveData.type;
        const data = moveData; // Pass whole object as data
        switch(type) {
            case 'SUBMIT_WORDS':
                this.submitWords(socketId, data.words);
                break;
            case 'SET_TEAMS_COUNT':
                this.setTeamsCount(data.count);
                break;
            case 'MOVE_PLAYER':
                this.movePlayer(data.socketId, data.targetTeam);
                break;
            case 'START_GAME':
                this.startGame();
                break;
            case 'START_TURN':
                // Only current player can start? Or anyone?
                // Usually current player clicks "Ready"
                if (socketId === this.getCurrentPlayerId()) {
                    this.startTurn();
                }
                break;
            case 'GUESS_WORD':
                 if (socketId === this.getCurrentPlayerId()) {
                    this.guessWord();
                 }
                 break;
            case 'SKIP_WORD':
                 if (socketId === this.getCurrentPlayerId()) {
                    this.skipWord();
                 }
                 break;
            case 'NEXT_ROUND':
                 this.startNextRound();
                 break;
        }
        return { valid: true };
    }

    getState() {
        return {
            state: this.state,
            players: this.players,
            teams: this.teams,
            scores: this.scores,
            currentRound: this.currentRound,
            turnActive: this.turnActive,
            currentPlayerId: this.getCurrentPlayerId(),
            currentWord: this.turnActive ? this.currentWord : null,
            timeLeft: this.timeLeft,
            wordsCount: this.words.length,
            roundWordsLeft: this.roundWords.length,
            turnTeamIndex: this.currentTeamIndex
        };
    }
}

module.exports = Associations;
