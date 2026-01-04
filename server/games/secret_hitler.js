class SecretHitler {
    constructor(io, roomId) {
        this.io = io;
        this.roomId = roomId;
        this.players = []; // { socketId, username, role, party, alive, isPresident, isChancellor, hasBeenInvestigated }
        this.phase = 'LOBBY'; 
        // LOBBY, ROLE_REVEAL, ELECTION_NOMINATION, VOTING, LEGISLATIVE_PRESIDENT, LEGISLATIVE_CHANCELLOR, EXECUTIVE_ACTION, GAME_OVER
        
        this.policyDeck = [];
        this.discardPile = [];
        this.liberalPolicies = 0;
        this.fascistPolicies = 0;
        this.electionTracker = 0;
        
        this.presidentIndex = 0;
        this.chancellorNominee = null;
        this.lastPresident = null;
        this.lastChancellor = null;
        
        this.votes = {}; // socketId -> 'JA' | 'NEIN'
        this.hand = []; // current cards in play (3 for pres, 2 for chanc)
        
        this.pendingPower = null; // 'INVESTIGATE', 'SPECIAL_ELECTION', 'PEEK', 'EXECUTION', 'VETO'
        this.vetoRequested = false;
        
        this.winner = null; // 'LIBERALS' | 'FASCISTS'
        this.winReason = '';
    }

    addPlayer(socketId) {
        // We rely on RoomManager to handle player list in the room object, 
        // but we need to track game-specific player state here.
        // However, RoomManager calls this when a player *joins the room*.
        // We will sync with RoomManager's player list when starting the game.
        return null; 
    }

    updatePlayerSocket(oldSocketId, newSocketId) {
        const player = this.players.find(p => p.socketId === oldSocketId);
        if (player) {
            player.socketId = newSocketId;
            // Resend private info if game is in progress
            if (this.phase !== 'LOBBY' && this.phase !== 'GAME_OVER') {
                this.sendPrivateRole(player);
                // Resend hand if applicable
                if ((player.isPresident && this.phase === 'LEGISLATIVE_PRESIDENT') ||
                    (player.isChancellor && this.phase === 'LEGISLATIVE_CHANCELLOR')) {
                     this.io.to(newSocketId).emit('secret_hitler_hand', this.hand);
                }
            }
        }
    }

    removePlayer(socketId) {
        // If game is running, we might need to handle this (e.g. pause or auto-kill)
        // For now, we assume reconnection logic handles temporary drops.
    }

    // --- SETUP ---

    startGame(roomPlayers) {
        if (roomPlayers.length < 5 || roomPlayers.length > 10) {
            return { valid: false, message: "Need 5-10 players to start." };
        }

        this.players = roomPlayers.map(p => ({
            socketId: p.socketId,
            username: p.username,
            role: null,
            party: null,
            alive: true,
            isPresident: false,
            isChancellor: false,
            hasBeenInvestigated: false,
            termLimited: false
        }));

        this.assignRoles();
        this.createDeck();
        this.phase = 'ROLE_REVEAL';
        this.presidentIndex = Math.floor(Math.random() * this.players.length);
        this.players[this.presidentIndex].isPresident = true;

        // Notify all players of their roles
        this.players.forEach(p => this.sendPrivateRole(p));

        return { valid: true };
    }

    assignRoles() {
        const count = this.players.length;
        let fascists = 0;
        // 5: 2F (1H), 3L
        // 6: 2F (1H), 4L
        // 7: 3F (1H), 4L
        // 8: 3F (1H), 5L
        // 9: 4F (1H), 5L
        // 10: 4F (1H), 6L
        if (count === 5 || count === 6) fascists = 2;
        else if (count === 7 || count === 8) fascists = 3;
        else fascists = 4;

        const roles = ['HITLER'];
        for (let i = 0; i < fascists - 1; i++) roles.push('FASCIST');
        while (roles.length < count) roles.push('LIBERAL');

        // Shuffle
        for (let i = roles.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [roles[i], roles[j]] = [roles[j], roles[i]];
        }

        this.players.forEach((p, i) => {
            p.role = roles[i];
            p.party = p.role === 'LIBERAL' ? 'LIBERAL' : 'FASCIST';
        });
    }

    createDeck() {
        this.policyDeck = [];
        for (let i = 0; i < 6; i++) this.policyDeck.push('LIBERAL');
        for (let i = 0; i < 11; i++) this.policyDeck.push('FASCIST');
        this.shuffleDeck();
        this.discardPile = [];
    }

    shuffleDeck() {
        for (let i = this.policyDeck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.policyDeck[i], this.policyDeck[j]] = [this.policyDeck[j], this.policyDeck[i]];
        }
    }

    sendPrivateRole(player) {
        // Construct known info
        // Fascists know other fascists (except in 5-6 player games? Rules say Fascists know each other. 
        // Rules: 5-6 players: Hitler knows Fascist? No, Hitler doesn't know Fascists usually.
        // Wait, standard rules:
        // 5-6: Hitler and Fascist know each other.
        // 7-10: Fascists know each other and know Hitler. Hitler doesn't know Fascists.
        
        const info = {
            role: player.role,
            party: player.party,
            knownFascists: [], // usernames
            hitler: null // username
        };

        const isSmallGame = this.players.length <= 6;
        const allFascists = this.players.filter(p => p.party === 'FASCIST' && p.role !== 'HITLER');
        const hitler = this.players.find(p => p.role === 'HITLER');

        if (player.role === 'FASCIST') {
            info.knownFascists = allFascists.map(p => p.username).filter(n => n !== player.username);
            info.hitler = hitler.username;
        } else if (player.role === 'HITLER') {
            if (isSmallGame) {
                // In 5-6 player game, Hitler knows the Fascist
                info.knownFascists = allFascists.map(p => p.username);
            }
        } else {
            // Liberals know nothing
        }

        this.io.to(player.socketId).emit('secret_hitler_role', info);
    }

    // --- GAME LOOP ---

    makeMove(action, socketId) {
        const player = this.players.find(p => p.socketId === socketId);
        
        // Allow START_GAME to proceed even if player not found (first run)
        if (action.type === 'START_GAME') {
             if (this.phase !== 'LOBBY' && this.phase !== 'GAME_OVER') return { valid: false, message: "Game already started" };
             if (!action.players) return { valid: false, message: "Player list required to start" };
             return this.startGame(action.players);
        }

        if (!player) return { valid: false, message: "Player not found" };

        if (!player.alive) {
             return { valid: false, message: "You are dead." };
        }

        switch (action.type) {
            case 'ACKNOWLEDGE_ROLE':
                // Client confirms they saw role, maybe we track this to auto-start first round?
                // For simplicity, let's just allow the Host to click "Start Round 1" or auto-start after 10s.
                // Let's make a "NEXT_PHASE" action for Host to proceed from Role Reveal.
                return { valid: true };

            case 'END_ROLE_REVEAL':
                if (this.phase !== 'ROLE_REVEAL') return { valid: false };
                this.phase = 'ELECTION_NOMINATION';
                return { valid: true };

            case 'NOMINATE_CHANCELLOR':
                return this.handleNomination(player, action.targetId);

            case 'VOTE':
                return this.handleVote(player, action.vote);

            case 'DISCARD_POLICY':
                return this.handleDiscard(player, action.index);

            case 'VETO_RESPONSE':
                return this.handleVetoResponse(player, action.approved);

            case 'EXECUTIVE_ACTION':
                return this.handleExecutiveAction(player, action);

            default:
                return { valid: false, message: "Unknown action" };
        }
    }

    handleNomination(president, targetId) {
        if (this.phase !== 'ELECTION_NOMINATION') return { valid: false, message: "Not nomination phase" };
        if (!president.isPresident) return { valid: false, message: "Not President" };

        const target = this.players.find(p => p.socketId === targetId);
        if (!target) return { valid: false, message: "Target not found" };
        if (!target.alive) return { valid: false, message: "Target is dead" };
        if (target.isPresident) return { valid: false, message: "Cannot nominate self (if President)" }; 
        // Logic check: President nominates Chancellor. Can't be self.
        if (target.socketId === president.socketId) return { valid: false, message: "Cannot nominate self" };

        // Term limits
        if (this.lastChancellor && target.socketId === this.lastChancellor.socketId) {
            return { valid: false, message: "Player is term limited (Last Chancellor)" };
        }
        if (this.players.filter(p => p.alive).length > 5 && this.lastPresident && target.socketId === this.lastPresident.socketId) {
            return { valid: false, message: "Player is term limited (Last President)" };
        }

        this.chancellorNominee = target;
        this.phase = 'VOTING';
        this.votes = {};
        return { valid: true };
    }

    handleVote(player, vote) { // 'JA' or 'NEIN'
        if (this.phase !== 'VOTING') return { valid: false, message: "Not voting phase" };
        if (this.votes[player.socketId]) return { valid: false, message: "Already voted" };

        this.votes[player.socketId] = vote;

        // Check if everyone alive has voted
        const aliveCount = this.players.filter(p => p.alive).length;
        if (Object.keys(this.votes).length === aliveCount) {
            this.processVotes();
        }

        return { valid: true };
    }

    processVotes() {
        const jaVotes = Object.values(this.votes).filter(v => v === 'JA').length;
        const neinVotes = Object.values(this.votes).filter(v => v === 'NEIN').length;

        // Broadcast votes is implicitly done by returning state with votes
        // But we usually want to show who voted what. 
        // We'll update phase to 'VOTE_RESULT' momentarily or just handle it.

        if (jaVotes > neinVotes) {
            // Passed
            this.electionTracker = 0;
            this.players.forEach(p => p.isChancellor = false);
            this.chancellorNominee.isChancellor = true;
            
            // Check Fascist Win via Hitler Chancellor
            if (this.fascistPolicies >= 3 && this.chancellorNominee.role === 'HITLER') {
                this.winner = 'FASCISTS';
                this.winReason = 'Hitler elected Chancellor after 3 Fascist policies.';
                this.phase = 'GAME_OVER';
                return;
            }

            this.phase = 'LEGISLATIVE_PRESIDENT';
            this.drawPoliciesForPresident();
        } else {
            // Failed
            this.electionTracker++;
            if (this.electionTracker === 3) {
                this.chaosEnact();
            } else {
                this.advancePresident();
            }
        }
    }

    advancePresident() {
        this.players.forEach(p => {
            p.isPresident = false;
            p.isChancellor = false; // Reset chancellor roles
        });
        
        this.chancellorNominee = null;
        this.votes = {};
        
        // Find next alive player
        let nextIndex = (this.presidentIndex + 1) % this.players.length;
        while (!this.players[nextIndex].alive) {
            nextIndex = (nextIndex + 1) % this.players.length;
        }
        this.presidentIndex = nextIndex;
        this.players[this.presidentIndex].isPresident = true;

        this.phase = 'ELECTION_NOMINATION';
    }

    chaosEnact() {
        if (this.policyDeck.length < 1) this.reshuffle();
        const policy = this.policyDeck.pop();
        this.enactPolicy(policy, true); // true = chaos
        this.electionTracker = 0;
        this.advancePresident();
    }

    drawPoliciesForPresident() {
        if (this.policyDeck.length < 3) this.reshuffle();
        this.hand = [this.policyDeck.pop(), this.policyDeck.pop(), this.policyDeck.pop()];
        // Send hand to President
        const president = this.players.find(p => p.isPresident);
        this.io.to(president.socketId).emit('secret_hitler_hand', this.hand);
    }

    handleDiscard(player, index) {
        if (this.phase === 'LEGISLATIVE_PRESIDENT') {
            if (!player.isPresident) return { valid: false };
            if (index < 0 || index >= this.hand.length) return { valid: false };

            const discarded = this.hand.splice(index, 1)[0];
            this.discardPile.push(discarded);
            
            this.phase = 'LEGISLATIVE_CHANCELLOR';
            const chancellor = this.players.find(p => p.isChancellor);
            this.io.to(chancellor.socketId).emit('secret_hitler_hand', this.hand);
            return { valid: true };

        } else if (this.phase === 'LEGISLATIVE_CHANCELLOR') {
            if (!player.isChancellor) return { valid: false };
            
            // Handle Veto request logic if implemented
            if (this.fascistPolicies === 5 && !this.vetoRequested && index === 'VETO') {
                 // Request Veto
                 this.vetoRequested = true;
                 this.phase = 'LEGISLATIVE_PRESIDENT_VETO';
                 return { valid: true };
            }

            if (index < 0 || index >= this.hand.length) return { valid: false };

            const discarded = this.hand.splice(index, 1)[0];
            this.discardPile.push(discarded);
            
            this.enactPolicy(this.hand[0]);
            return { valid: true };
        }
        return { valid: false };
    }

    handleVetoResponse(president, approved) {
        if (this.phase !== 'LEGISLATIVE_PRESIDENT_VETO' || !president.isPresident) return { valid: false };
        
        if (approved) {
            // Veto accepted: Discard both
            this.discardPile.push(...this.hand);
            this.hand = [];
            this.electionTracker++;
             if (this.electionTracker === 3) {
                this.chaosEnact();
            } else {
                this.advancePresident();
            }
        } else {
            // Veto rejected: Chancellor must play
            this.vetoRequested = false;
            this.phase = 'LEGISLATIVE_CHANCELLOR';
            // Resend hand just in case
            const chancellor = this.players.find(p => p.isChancellor);
            this.io.to(chancellor.socketId).emit('secret_hitler_hand', this.hand);
        }
        return { valid: true };
    }

    enactPolicy(policy, isChaos = false) {
        if (policy === 'LIBERAL') {
            this.liberalPolicies++;
            if (this.liberalPolicies === 5) {
                this.winner = 'LIBERALS';
                this.winReason = '5 Liberal Policies enacted.';
                this.phase = 'GAME_OVER';
                return;
            }
        } else {
            this.fascistPolicies++;
            if (this.fascistPolicies === 6) {
                this.winner = 'FASCISTS';
                this.winReason = '6 Fascist Policies enacted.';
                this.phase = 'GAME_OVER';
                return;
            }
        }

        // Handle Powers (only if not chaos)
        if (!isChaos && policy === 'FASCIST') {
            const power = this.getExecutivePower();
            if (power) {
                this.pendingPower = power;
                this.phase = 'EXECUTIVE_ACTION';
                return; // Stop here, wait for executive action
            }
        }

        // Prepare next round
        this.recordTermLimits();
        this.advancePresident();
    }

    getExecutivePower() {
        const count = this.players.length; // Total players (start of game) -> Wait, power track depends on TOTAL players, not alive.
        // We stored initial count? No, but players array keeps dead players.
        const totalPlayers = this.players.length;
        const track = this.fascistPolicies;

        // Powers based on track (1-6)
        // 5-6 players: 3: Peek, 4: Kill, 5: Kill+Veto
        // 7-8 players: 2: Investigate, 3: Special, 4: Kill, 5: Kill+Veto
        // 9-10 players: 1: Investigate, 2: Investigate, 3: Special, 4: Kill, 5: Kill+Veto
        
        if (track === 1) {
            if (totalPlayers >= 9) return 'INVESTIGATE';
        } else if (track === 2) {
            if (totalPlayers >= 7) return 'INVESTIGATE';
        } else if (track === 3) {
            if (totalPlayers <= 6) return 'PEEK';
            return 'SPECIAL_ELECTION';
        } else if (track === 4) {
            return 'EXECUTION';
        } else if (track === 5) {
            return 'EXECUTION'; // Also enables Veto passively
        }
        return null;
    }

    handleExecutiveAction(president, action) {
        if (this.phase !== 'EXECUTIVE_ACTION' || !president.isPresident) return { valid: false };
        if (action.powerType !== this.pendingPower) return { valid: false, message: "Wrong power" };

        const target = this.players.find(p => p.socketId === action.targetId);

        switch (this.pendingPower) {
            case 'INVESTIGATE':
                if (!target || target.hasBeenInvestigated) return { valid: false, message: "Invalid target" };
                target.hasBeenInvestigated = true;
                // Send info privately
                this.io.to(president.socketId).emit('secret_hitler_investigation', { 
                    party: target.party, 
                    username: target.username 
                });
                break;
            
            case 'SPECIAL_ELECTION':
                if (!target || !target.alive || target.socketId === president.socketId) return { valid: false };
                // Set this player as next president, DO NOT increment election tracker, do not change term limits yet?
                // "The President placard moves to that player... After the Special Election, the placard returns to the left of the President who enacted it."
                // This means we interrupt rotation.
                // Simplified: We set presidentIndex to this target, verify they are alive.
                this.recordTermLimits(); // Last government is still valid for term limits
                
                // We need to store who called it to return later? 
                // "The placard returns to the left of the President who enacted it"
                // This implies the normal rotation continues from the *current* president's position.
                // So if P1 calls special on P3. P3 is Pres. Next round, it goes to P2.
                // So we do NOT change `presidentIndex` to `target` in the rotation sense, just for this turn.
                // But `advancePresident` uses `presidentIndex`.
                // Let's hack: We leave `presidentIndex` where it is (P1), but set `isPresident` to P3.
                // Wait, `advancePresident` calculates next based on `presidentIndex`.
                // So if we don't change `presidentIndex`, `advancePresident` will pick P2 next time. Correct.
                
                this.players.forEach(p => { p.isPresident = false; p.isChancellor = false; });
                target.isPresident = true;
                this.phase = 'ELECTION_NOMINATION';
                this.pendingPower = null;
                return { valid: true }; // Return immediately, don't do standard cleanup

            case 'PEEK':
                if (action.confirm) {
                    // President is done looking
                    this.pendingPower = null;
                    this.recordTermLimits();
                    this.advancePresident();
                    return { valid: true };
                }
                
                if (this.policyDeck.length < 3) this.reshuffle();
                const top3 = [this.policyDeck[this.policyDeck.length-1], this.policyDeck[this.policyDeck.length-2], this.policyDeck[this.policyDeck.length-3]];
                this.io.to(president.socketId).emit('secret_hitler_peek', top3);
                // Do NOT advance yet. Wait for user to click "Done".
                return { valid: true }; // Return valid so client knows request worked, but phase doesn't change yet.

            case 'EXECUTION':
                if (!target || !target.alive) return { valid: false };
                target.alive = false;
                if (target.role === 'HITLER') {
                    this.winner = 'LIBERALS';
                    this.winReason = 'Hitler Assassinated.';
                    this.phase = 'GAME_OVER';
                }
                break;
        }

        this.pendingPower = null;
        this.recordTermLimits();
        this.advancePresident();
        return { valid: true };
    }

    recordTermLimits() {
        this.lastPresident = this.players.find(p => p.isPresident);
        this.lastChancellor = this.players.find(p => p.isChancellor);
    }

    reshuffle() {
        this.policyDeck = [...this.policyDeck, ...this.discardPile];
        this.discardPile = [];
        this.shuffleDeck();
    }

    getState() {
        // Public State
        return {
            phase: this.phase,
            players: this.players.map(p => ({
                username: p.username,
                socketId: p.socketId,
                alive: p.alive,
                isPresident: p.isPresident,
                isChancellor: p.isChancellor,
                hasBeenInvestigated: p.hasBeenInvestigated,
                // Do NOT send role/party
                voted: !!this.votes[p.socketId], // Show if they voted
                vote: this.phase === 'VOTING' ? null : this.votes[p.socketId] // Show vote only after voting done (handled by processVotes moving phase)
                // Actually, if phase moved to LEGISLATIVE, we can show votes from previous election.
                // We might need a 'ELECTION_RESULTS' transient phase or just let client show last votes.
            })),
            liberalPolicies: this.liberalPolicies,
            fascistPolicies: this.fascistPolicies,
            electionTracker: this.electionTracker,
            deckCount: this.policyDeck.length,
            discardCount: this.discardPile.length,
            chancellorNominee: this.chancellorNominee ? this.chancellorNominee.username : null,
            lastVotes: this.votes, // We can send votes here if phase is not voting
            winner: this.winner,
            winReason: this.winReason,
            pendingPower: this.pendingPower
        };
    }
}

module.exports = SecretHitler;
