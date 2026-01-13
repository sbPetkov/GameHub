class Werewolf {
    constructor(io, roomId) {
        this.io = io;
        this.roomId = roomId;
        this.players = []; 
        this.phase = 'LOBBY'; 

        this.winner = null;
        this.winReason = '';
        this.gameLog = [];

        this.werewolfVotes = {};
        this.seerCheck = null;
        this.healerProtect = null;
        this.witchHeal = false;
        this.witchPoison = null;
        this.witchSkipped = false;
        this.cupidLinks = [];
        
        this.lastProtected = null;
        this.witchPotions = { heal: true, poison: true };
        
        this.dayVotes = {};
        this.lynchVotes = {};
        this.nominee = null;
        this.recentDeaths = []; // For Day Reveal
        this.voteResult = null; // For Day Results
        
        this.rolesConfig = {
            WEREWOLF: 1,
            SEER: true,
            WITCH: true,
            HEALER: true,
            CUPID: true,
            HUNTER: true,
            MAYOR: false
        };

        this.phaseTimer = null;
        this.phaseEndTime = 0;
        this.consensusTimer = null;
    }

    addPlayer(socketId) { return null; }

    updatePlayerSocket(oldSocketId, newSocketId) {
        const player = this.players.find(p => p.socketId === oldSocketId);
        if (player) {
            player.socketId = newSocketId;
            player.connected = true;
            if (this.phase !== 'LOBBY' && this.phase !== 'GAME_OVER') {
                this.sendPrivateRole(player);
                if (player.role === 'WEREWOLF') {
                    this.sendWerewolfUpdate();
                }
                if (player.role === 'WITCH' && this.phase === 'NIGHT_MAIN') {
                     const victimId = this.calculateWerewolfVictim();
                     if (victimId) {
                         const victim = this.players.find(p => p.socketId === victimId);
                         this.io.to(player.socketId).emit('werewolf_witch_info', { victim: victim ? victim.username : null });
                     }
                }
                if (player.role === 'SEER' && this.seerCheck) {
                    const target = this.players.find(p => p.socketId === this.seerCheck);
                    if (target) {
                        this.io.to(player.socketId).emit('werewolf_seer_result', { username: target.username, isWerewolf: target.role === 'WEREWOLF' });
                    }
                }
            }
        }
    }

    removePlayer(socketId) {}

    startGame(roomPlayers, config = {}) {
        if (roomPlayers.length < 4) {
             return { valid: false, message: "Need at least 4 players." };
        }

        if (config) {
            this.rolesConfig = { ...this.rolesConfig, ...config };
        }

        this.players = roomPlayers.map(p => ({
            socketId: p.socketId,
            username: p.username,
            role: 'VILLAGER',
            alive: true,
            connected: true,
            linkedTo: null
        }));

        this.assignRoles();
        this.players.forEach(p => this.sendPrivateRole(p));
        this.startNight();
        return { valid: true };
    }

    assignRoles() {
        const total = this.players.length;
        let wolfCount = parseInt(this.rolesConfig.WEREWOLF) || 1;
        
        const roles = [];
        for (let i = 0; i < wolfCount; i++) roles.push('WEREWOLF');
        
        const specials = [];
        if (this.rolesConfig.SEER) specials.push('SEER');
        if (this.rolesConfig.WITCH) specials.push('WITCH');
        if (this.rolesConfig.HEALER) specials.push('HEALER');
        if (this.rolesConfig.CUPID) specials.push('CUPID');
        if (this.rolesConfig.HUNTER) specials.push('HUNTER');
        if (this.rolesConfig.MAYOR) specials.push('MAYOR');
        
        for (let i = specials.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [specials[i], specials[j]] = [specials[j], specials[i]];
        }
        roles.push(...specials);

        while (roles.length > total) roles.pop(); 
        while (roles.length < total) roles.push('VILLAGER');

        for (let i = roles.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [roles[i], roles[j]] = [roles[j], roles[i]];
        }

        this.players.forEach((p, i) => {
            p.role = roles[i];
        });
    }

    sendPrivateRole(player) {
        const info = {
            role: player.role,
            linkedTo: null
        };
        if (player.linkedTo) {
            const partner = this.players.find(p => p.socketId === player.linkedTo);
            if (partner) info.linkedTo = partner.username;
        }
        if (player.role === 'WEREWOLF') {
            info.otherWolves = this.players.filter(p => p.role === 'WEREWOLF' && p.socketId !== player.socketId).map(p => p.username);
        }
        this.io.to(player.socketId).emit('werewolf_role', info);
    }

    // --- TIMERS ---

    startPhaseTimer(durationSeconds) {
        if (this.phaseTimer) clearTimeout(this.phaseTimer);
        const ms = durationSeconds * 1000;
        this.phaseEndTime = Date.now() + ms;
        
        this.phaseTimer = setTimeout(() => {
            if (this.phase === 'NIGHT_MAIN') this.resolveNight();
            else if (this.phase === 'NIGHT_CUPID') this.nextNightPhase();
            else if (this.phase === 'DAY_REVEAL') {
                this.phase = 'DAY_NOMINATION';
                this.dayVotes = {};
                this.io.to(this.roomId).emit('game_update', this.getState());
            }
            else if (this.phase === 'DAY_RESULTS') {
                this.checkWinCondition();
                if (this.phase !== 'GAME_OVER') this.startNight();
                this.io.to(this.roomId).emit('game_update', this.getState());
            }
            // Force update
            this.io.to(this.roomId).emit('game_update', this.getState());
        }, ms);
    }

    clearTimer() {
        if (this.phaseTimer) { clearTimeout(this.phaseTimer); this.phaseTimer = null; }
        if (this.consensusTimer) { clearTimeout(this.consensusTimer); this.consensusTimer = null; }
        this.phaseEndTime = 0;
    }

    // --- PHASES ---

    startNight() {
        this.clearTimer();
        this.werewolfVotes = {};
        this.seerCheck = null;
        this.healerProtect = null;
        this.witchHeal = false;
        this.witchPoison = null;
        this.witchSkipped = false;
        
        if (this.players.some(p => p.role === 'CUPID' && p.alive) && this.cupidLinks.length === 0) {
            this.phase = 'NIGHT_CUPID';
            this.startPhaseTimer(30);
        } else {
            this.phase = 'NIGHT_MAIN';
            this.startPhaseTimer(60);
        }
    }

    nextNightPhase() {
        this.clearTimer();
        if (this.phase === 'NIGHT_CUPID') {
            this.phase = 'NIGHT_MAIN';
            this.sendWerewolfUpdate();
            this.startPhaseTimer(60);
        }
    }

    checkNightDone() {
        if (this.phase !== 'NIGHT_MAIN') return;

        let done = true;
        const aliveSpecials = this.players.filter(p => p.alive);

        const wolves = aliveSpecials.filter(p => p.role === 'WEREWOLF');
        if (wolves.length > 0) {
            const votes = Object.values(this.werewolfVotes);
            if (votes.length < wolves.length || new Set(votes).size !== 1) done = false;
        }

        if (aliveSpecials.some(p => p.role === 'SEER') && !this.seerCheck) done = false;
        if (aliveSpecials.some(p => p.role === 'HEALER') && !this.healerProtect) done = false;
        if (aliveSpecials.some(p => p.role === 'WITCH') && !this.witchHeal && !this.witchPoison && !this.witchSkipped) done = false;

        if (done) {
            if (!this.consensusTimer) {
                this.consensusTimer = setTimeout(() => this.resolveNight(), 2000);
            }
        } else {
            if (this.consensusTimer) {
                clearTimeout(this.consensusTimer);
                this.consensusTimer = null;
            }
        }
    }

    makeMove(action, socketId) {
        const player = this.players.find(p => p.socketId === socketId);
        if (action.type === 'START_GAME') return this.startGame(action.players, action.config);
        if (!player) return { valid: false, message: "Player not found" };

        switch (action.type) {
            case 'CUPID_LINK': return this.handleCupid(player, action.targets);
            case 'WEREWOLF_VOTE': return this.handleWerewolfVote(player, action.targetId);
            case 'SEER_CHECK': return this.handleSeerCheck(player, action.targetId);
            case 'WITCH_ACTION': return this.handleWitchAction(player, action.heal, action.poisonId);
            case 'HEALER_PROTECT': return this.handleHealerProtect(player, action.targetId);
            case 'SKIP_ACTION': return this.handleSkip(player);
            // ACKNOWLEDGE_DEATHS removed, now auto-timed
            case 'NOMINATE_VOTE': return this.handleNominationVote(player, action.targetId);
            case 'LYNCH_VOTE': return this.handleLynchVote(player, action.vote);
            default: return { valid: false, message: "Unknown action" };
        }
    }

    // ... (Night Action Handlers same as previous, omitted for brevity if no logic change)
    // Actually need to keep them all or file write overwrites.
    
    handleCupid(player, targets) {
        if (this.phase !== 'NIGHT_CUPID' || player.role !== 'CUPID') return { valid: false };
        if (this.cupidLinks.length > 0) return { valid: false };
        const p1 = this.players.find(p => p.socketId === targets[0]);
        const p2 = this.players.find(p => p.socketId === targets[1]);
        if (!p1 || !p2) return { valid: false };
        this.cupidLinks = targets;
        p1.linkedTo = p2.socketId; p2.linkedTo = p1.socketId;
        this.io.to(p1.socketId).emit('werewolf_role', { role: p1.role, linkedTo: p2.username, isLover: true });
        this.io.to(p2.socketId).emit('werewolf_role', { role: p2.role, linkedTo: p1.username, isLover: true });
        this.nextNightPhase();
        return { valid: true };
    }

    handleWerewolfVote(player, targetId) {
        if (this.phase !== 'NIGHT_MAIN' || player.role !== 'WEREWOLF') return { valid: false };
        if (this.werewolfVotes[player.socketId] === targetId) delete this.werewolfVotes[player.socketId];
        else this.werewolfVotes[player.socketId] = targetId;
        this.sendWerewolfUpdate();
        const wolves = this.players.filter(p => p.role === 'WEREWOLF' && p.alive);
        if (Object.keys(this.werewolfVotes).length === wolves.length && new Set(Object.values(this.werewolfVotes)).size === 1) {
            const victimId = Object.values(this.werewolfVotes)[0];
            const witch = this.players.find(p => p.role === 'WITCH' && p.alive);
            if (witch) {
                const victim = this.players.find(p => p.socketId === victimId);
                this.io.to(witch.socketId).emit('werewolf_witch_info', { victim: victim ? victim.username : null });
            }
        }
        this.checkNightDone();
        return { valid: true };
    }

    handleSeerCheck(player, targetId) {
        if (this.phase !== 'NIGHT_MAIN' || player.role !== 'SEER') return { valid: false };
        if (this.seerCheck === targetId) this.seerCheck = null;
        else {
            const target = this.players.find(p => p.socketId === targetId);
            if (!target) return { valid: false };
            this.io.to(player.socketId).emit('werewolf_seer_result', { username: target.username, isWerewolf: target.role === 'WEREWOLF' });
            this.seerCheck = targetId;
        }
        this.checkNightDone();
        return { valid: true };
    }

    handleWitchAction(player, heal, poisonId) {
        if (this.phase !== 'NIGHT_MAIN' || player.role !== 'WITCH') return { valid: false };
        if (heal) this.witchHeal = !this.witchHeal;
        if (poisonId) this.witchPoison = this.witchPoison === poisonId ? null : poisonId;
        this.witchSkipped = false;
        this.checkNightDone();
        return { valid: true };
    }

    handleSkip(player) {
        if (player.role === 'WITCH') { this.witchSkipped = true; this.witchHeal = false; this.witchPoison = null; }
        this.checkNightDone();
        return { valid: true };
    }

    handleHealerProtect(player, targetId) {
        if (this.phase !== 'NIGHT_MAIN' || player.role !== 'HEALER') return { valid: false };
        if (this.lastProtected === targetId) return { valid: false, message: "Cannot protect same player twice in a row" };
        if (this.healerProtect === targetId) this.healerProtect = null;
        else this.healerProtect = targetId;
        this.checkNightDone();
        return { valid: true };
    }

    // Day Handlers
    handleNominationVote(player, targetId) {
        if (this.phase !== 'DAY_NOMINATION') return { valid: false };
        if (!player.alive) return { valid: false };
        if (player.socketId === targetId) return { valid: false, message: "Cannot nominate yourself" };

        if (this.dayVotes[player.socketId] === targetId) delete this.dayVotes[player.socketId];
        else this.dayVotes[player.socketId] = targetId;
        
        const aliveCount = this.players.filter(p => p.alive).length;
        if (Object.keys(this.dayVotes).length === aliveCount) {
            setTimeout(() => this.resolveNomination(), 1500); 
        }
        return { valid: true };
    }

    resolveNomination() {
        if (this.phase !== 'DAY_NOMINATION') return;
        const counts = {};
        let maxVotes = 0;
        let candidates = [];
        Object.values(this.dayVotes).forEach(t => {
            counts[t] = (counts[t] || 0) + 1;
            if (counts[t] > maxVotes) { maxVotes = counts[t]; candidates = [t]; }
            else if (counts[t] === maxVotes) candidates.push(t);
        });
        if (candidates.length === 0) { this.startNight(); return; }
        this.nominee = candidates[0];
        this.phase = 'DAY_VOTE'; // Skipping defense phase for simplicity per request
        this.lynchVotes = {};
        this.io.to(this.roomId).emit('game_update', this.getState());
    }

    handleLynchVote(player, vote) {
        if (this.phase !== 'DAY_VOTE') return { valid: false };
        if (!player.alive) return { valid: false };
        if (player.socketId === this.nominee) return { valid: false, message: "Nominee cannot vote" }; // Nominee exclusion

        if (this.lynchVotes[player.socketId] === vote) delete this.lynchVotes[player.socketId];
        else this.lynchVotes[player.socketId] = vote;
        
        const aliveCount = this.players.filter(p => p.alive).length;
        // Nominee is alive but cannot vote, so we expect (aliveCount - 1) votes
        if (Object.keys(this.lynchVotes).length === aliveCount - 1) {
            setTimeout(() => this.resolveLynch(), 1500);
        }
        return { valid: true };
    }

    resolveLynch() {
        if (this.phase !== 'DAY_VOTE') return;
        const yesVotes = Object.values(this.lynchVotes).filter(v => v === 'YES').length;
        const noVotes = Object.values(this.lynchVotes).filter(v => v === 'NO').length;
        const mayor = this.players.find(p => p.role === 'MAYOR' && p.alive);
        let finalYes = yesVotes, finalNo = noVotes;
        
        // Mayor logic only applies if mayor is NOT the nominee (implied, as nominee can't vote)
        if (mayor && mayor.socketId !== this.nominee) {
            const mv = this.lynchVotes[mayor.socketId];
            if (mv === 'YES') finalYes++; else if (mv === 'NO') finalNo++;
        }
        
        let killed = false;
        if (finalYes > finalNo) {
            const victim = this.players.find(p => p.socketId === this.nominee);
            if (victim) {
                victim.alive = false;
                killed = true;
            }
        }

        // Store result for display
        this.voteResult = {
            nominee: this.players.find(p => p.socketId === this.nominee)?.username,
            killed,
            guilty: finalYes,
            innocent: finalNo,
            votes: { ...this.lynchVotes } // Send raw votes to show who voted what
        };

        this.phase = 'DAY_RESULTS';
        this.startPhaseTimer(8); // Show results for 8s
    }

    // Night Resolution
    calculateWerewolfVictim() {
        const counts = {};
        let maxVotes = 0, victim = null, tie = false;
        Object.values(this.werewolfVotes).forEach(t => {
            counts[t] = (counts[t] || 0) + 1;
            if (counts[t] > maxVotes) { maxVotes = counts[t]; victim = t; tie = false; }
            else if (counts[t] === maxVotes) tie = true;
        });
        return tie ? null : victim;
    }

    resolveNight() {
        this.clearTimer();
        const wolfTargetId = this.calculateWerewolfVictim();
        let finalDead = [];
        let actualWolfKill = wolfTargetId;

        if (this.healerProtect && this.healerProtect === wolfTargetId) { actualWolfKill = null; this.lastProtected = this.healerProtect; }
        else if (this.healerProtect) this.lastProtected = this.healerProtect;

        if (this.witchHeal && actualWolfKill === wolfTargetId) { actualWolfKill = null; this.witchPotions.heal = false; }
        if (this.witchPoison) { finalDead.push(this.witchPoison); this.witchPotions.poison = false; }
        if (actualWolfKill) finalDead.push(actualWolfKill);

        let processed = new Set();
        this.recentDeaths = []; // Clear previous

        while (finalDead.length > 0) {
            const vid = finalDead.pop();
            if (processed.has(vid)) continue;
            processed.add(vid);
            const v = this.players.find(p => p.socketId === vid);
            if (v && v.alive) {
                v.alive = false;
                const team = v.role === 'WEREWOLF' ? 'Werewolf' : 'Villager Side';
                this.recentDeaths.push({ username: v.username, team });
                if (v.linkedTo) {
                    const partner = this.players.find(p => p.socketId === v.linkedTo);
                    if (partner && partner.alive) finalDead.push(partner.socketId);
                }
            }
        }
        
        this.checkWinCondition();
        if (this.phase !== 'GAME_OVER') {
            this.phase = 'DAY_REVEAL';
            this.witchSkipped = false;
            this.startPhaseTimer(10); // Show deaths for 10s then move to Nomination
        }
    }

    checkWinCondition() {
        const wolvesAlive = this.players.filter(p => p.role === 'WEREWOLF' && p.alive).length;
        const othersAlive = this.players.filter(p => p.role !== 'WEREWOLF' && p.alive).length;
        if (wolvesAlive === 0) { this.winner = 'VILLAGERS'; this.winReason = 'All Werewolves eliminated!'; this.phase = 'GAME_OVER'; }
        else if (wolvesAlive >= othersAlive) { this.winner = 'WEREWOLVES'; this.winReason = 'Werewolves outnumber Villagers!'; this.phase = 'GAME_OVER'; }
    }

    getState() {
        return {
            phase: this.phase,
            phaseEndTime: this.phaseEndTime,
            players: this.players.map(p => ({
                username: p.username,
                socketId: p.socketId,
                alive: p.alive,
                connected: p.connected,
                isNominee: this.phase.startsWith('DAY') && this.nominee === p.socketId,
                voted: !!(this.dayVotes[p.socketId] || this.lynchVotes[p.socketId]),
            })),
            nominee: this.nominee ? this.players.find(p => p.socketId === this.nominee)?.username : null,
            recentDeaths: this.recentDeaths,
            voteResult: this.voteResult,
            winner: this.winner,
            winReason: this.winReason
        };
    }
}

module.exports = Werewolf;
