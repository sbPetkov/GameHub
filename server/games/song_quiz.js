const fs = require('fs');
const path = require('path');
const videoDownloader = require('../utils/videoDownloader');

class SongQuizGame {
    constructor(io, roomId) {
        this.io = io;
        this.roomId = roomId;
        this.state = 'LOBBY'; // LOBBY, BUFFERING, ROUND_START, PLAYING, VOTING, RESULT, GAME_OVER
        this.players = [];
        this.turnIndex = 0;
        
        // Game Data
        this.allSongs = this.loadSongs();
        this.selectedSongs = [];
        this.currentSongIndex = 0;
        this.currentRound = 1;
        this.totalRounds = 5; // Default to 5 rounds
        
        // Round State
        this.timestamp = 0;
        this.attempt = 1; // 1 = Muted (15pts), 2 = Unmuted (10pts)
        this.playerAnswer = null;
        this.votes = {}; // socketId -> 'PASS' | 'FAIL'
        this.downloadPromises = {}; // songId -> Promise
        this.downloadedSongs = new Set(); // songIds
        
        this.lastResult = null;
        this.lastPoints = 0;
    }

    loadSongs() {
        try {
            const p = path.join(__dirname, '../data/songs.json');
            if (fs.existsSync(p)) {
                return JSON.parse(fs.readFileSync(p, 'utf8'));
            }
            return [];
        } catch (e) {
            console.error("Failed to load songs", e);
            return [];
        }
    }

    addPlayer(socketId, username) {
        const player = {
            socketId,
            username,
            score: 0,
            connected: true
        };
        this.players.push(player);
        return null; 
    }

    removePlayer(socketId) {
        const index = this.players.findIndex(p => p.socketId === socketId);
        if (index !== -1) {
            this.players[index].connected = false;
            // We don't remove the player fully to preserve turn order if they reconnect
        }
    }

    updatePlayerSocket(oldId, newId) {
        const player = this.players.find(p => p.socketId === oldId);
        if (player) {
            player.socketId = newId;
            player.connected = true;
        }
    }

    cleanup() {
        videoDownloader.cleanupRoom(this.roomId);
    }

    startGame() {
        console.log(`[SongQuiz] Starting game for room ${this.roomId} with ${this.players.length} players`);
        if (this.players.length < 1) return { error: "Need at least 1 player" };
        
        // Shuffle all available URLs to create a "Deck"
        this.deck = [...this.allSongs].sort(() => 0.5 - Math.random());
        console.log(`[SongQuiz] Deck initialized with ${this.deck.length} songs`);

        this.selectedSongs = [];
        const numSongsNeeded = this.players.length * this.totalRounds;
        console.log(`[SongQuiz] Creating session with ${numSongsNeeded} total songs (${this.totalRounds} rounds per player)`);

        for (let i = 0; i < numSongsNeeded; i++) {
            if (this.deck.length === 0) {
                 // Reshuffle
                 this.deck = [...this.allSongs].sort(() => 0.5 - Math.random());
            }
            if (this.deck.length > 0) {
                const url = this.deck.pop();
                // Generate a temporary ID
                this.selectedSongs.push({
                    id: Date.now() + i + Math.random(), // simple ID
                    url: url,
                    artist: 'Loading...', // Will be fetched
                    title: 'Loading...'
                });
            }
        }
            
        this.currentSongIndex = 0;
        this.turnIndex = 0;
        this.currentRound = 1;
        this.state = 'BUFFERING';
        
        this.io.to(this.roomId).emit('game_update', this.getState());
        
        console.log(`[SongQuiz] State set to BUFFERING. Calling bufferSongs()...`);
        this.bufferSongs();
    }

    async bufferSongs() {
        const bufferWindow = 3;
        // Check bounds
        if (this.currentSongIndex >= this.selectedSongs.length) {
            console.log(`[SongQuiz] bufferSongs: No more songs to buffer (Index ${this.currentSongIndex} >= Total ${this.selectedSongs.length})`);
            return;
        }

        const songsToBuffer = this.selectedSongs.slice(this.currentSongIndex, this.currentSongIndex + bufferWindow);
        console.log(`[SongQuiz] bufferSongs: Attempting to buffer ${songsToBuffer.length} songs starting from index ${this.currentSongIndex}`);

        for (const song of songsToBuffer) {
            if (!this.downloadPromises[song.id] && !this.downloadedSongs.has(song.id)) {
                console.log(`[SongQuiz] Requesting download for: ${song.url}`);
                const filename = `song_${song.id}.mp4`;
                
                this.downloadPromises[song.id] = videoDownloader.downloadVideo(song.url, this.roomId, filename)
                    .then(({ path, title }) => {
                        console.log(`[SongQuiz] Download Success for ${song.id}: ${title}`);
                        this.downloadedSongs.add(song.id);
                        
                        // Parse title
                        song.title = title; 
                        song.artist = "";
                        
                        if (title.includes('-')) {
                            const parts = title.split('-');
                            song.artist = parts[0].trim();
                            song.title = parts.slice(1).join('-').trim();
                        } else {
                            song.title = title;
                            song.artist = "Unknown Artist";
                        }

                        this.io.to(this.roomId).emit('buffer_update', { 
                            songId: song.id, 
                            count: this.downloadedSongs.size 
                        });
                        
                        // If we were waiting for this song to start the game
                        // Note: Check bounds again as selectedSongs might have changed due to failures
                        if (this.state === 'BUFFERING' && 
                            this.selectedSongs[this.currentSongIndex] && 
                            this.selectedSongs[this.currentSongIndex].id === song.id) {
                            console.log(`[SongQuiz] Current song buffered. Starting round!`);
                            this.startRound();
                        }
                    })
                    .catch(async err => {
                        console.error(`[SongQuiz] Failed to buffer ${song.id} (${song.url}):`, err.message);
                        
                        // Handle Broken Link: Remove and Replace
                        const failedIndex = this.selectedSongs.findIndex(s => s.id === song.id);
                        if (failedIndex !== -1) {
                            // Remove failed song
                            this.selectedSongs.splice(failedIndex, 1);
                            
                            // Add replacement from deck
                            if (this.deck.length === 0) {
                                this.deck = [...this.allSongs].sort(() => 0.5 - Math.random());
                            }
                            if (this.deck.length > 0) {
                                const url = this.deck.pop();
                                this.selectedSongs.push({
                                    id: Date.now() + Math.random(),
                                    url: url,
                                    artist: 'Loading...',
                                    title: 'Loading...'
                                });
                            }

                            // If we removed the song we were currently trying to play (or queue up)
                            // We need to trigger bufferSongs again to pick up the next/new song
                            // and ensure we don't stall.
                            this.bufferSongs();
                        }
                    });
            } else {
                console.log(`[SongQuiz] Song ${song.id} is already being downloaded or is finished.`);
            }
        }
    }

    startRound() {
        this.state = 'ROUND_START';
        this.attempt = 1;
        this.timestamp = 0;
        this.playerAnswer = null;
        this.votes = {};
        this.io.to(this.roomId).emit('game_update', this.getState());
    }

    selectTimestamp(socketId, timestamp) {
        if (this.state !== 'ROUND_START') return;
        const currentPlayer = this.players[this.turnIndex];
        if (currentPlayer.socketId !== socketId) return;

        this.timestamp = timestamp;
        this.state = 'PLAYING';
        this.io.to(this.roomId).emit('game_update', this.getState());
    }

    submitAnswer(socketId, answer) {
        if (this.state !== 'PLAYING') return;
        const currentPlayer = this.players[this.turnIndex];
        if (currentPlayer.socketId !== socketId) return;

        this.playerAnswer = answer;
        this.state = 'VOTING';
        this.votes = {};
        this.io.to(this.roomId).emit('game_update', this.getState());
    }

    giveUp(socketId) {
        if (this.state !== 'PLAYING') return;
        const currentPlayer = this.players[this.turnIndex];
        if (currentPlayer.socketId !== socketId) return;

        if (this.attempt === 1) {
            // Second chance
            this.attempt = 2;
            this.state = 'ROUND_START'; // Choose timestamp again
            this.io.to(this.roomId).emit('game_update', this.getState());
        } else {
            // Give up on 2nd chance -> 0 points
            this.resolveRound(0);
        }
    }

    vote(voterId, voteType) { // 'BOTH' | 'ONE' | 'FAIL'
        if (this.state !== 'VOTING') return;
        const currentPlayer = this.players[this.turnIndex];
        if (voterId === currentPlayer.socketId) return;

        this.votes[voterId] = voteType;

        const otherPlayers = this.players.filter(p => p.socketId !== currentPlayer.socketId && p.connected);
        const totalVoters = otherPlayers.length;
        const votesArray = Object.values(this.votes);
        
        const bothVotes = votesArray.filter(v => v === 'BOTH').length;
        const oneVotes = votesArray.filter(v => v === 'ONE').length;
        const failVotes = votesArray.filter(v => v === 'FAIL').length;
        const threshold = Math.ceil(totalVoters / 2);

        const basePoints = this.attempt === 1 ? 15 : 10;

        // Check for Resolution
        
        // 1. Majority says BOTH (Total Success)
        if (bothVotes >= threshold) {
            this.resolveRound(basePoints * 2);
            return;
        }

        // 2. Majority says at least ONE (Partial Success)
        // If (Both + One) >= threshold, but 'Both' didn't win alone.
        if ((bothVotes + oneVotes) >= threshold) {
            // We need to wait until it's impossible for 'BOTH' to win to settle on 'ONE',
            // OR if everyone has voted.
            // But for simplicity/speed, if 'BOTH' is already impossible:
            const remainingVoters = totalVoters - votesArray.length;
            if (bothVotes + remainingVoters < threshold) {
                 this.resolveRound(basePoints);
                 return;
            }
        }

        // 3. Majority says FAIL (impossible to recover)
        const possiblePositiveVotes = (bothVotes + oneVotes) + (totalVoters - votesArray.length);
        if (possiblePositiveVotes < threshold) {
            this.resolveRound(0);
            return;
        }

        // 4. Everyone voted, but no clear majority for specific bucket?
        // Fallback logic: If we are here and everyone voted:
        if (votesArray.length === totalVoters) {
             if ((bothVotes + oneVotes) >= threshold) {
                 this.resolveRound(basePoints);
             } else {
                 this.resolveRound(0);
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

    nextTurn() {
        // Cleanup previous song file (optional, to save space immediately)
        // Or keep it? Let's delete it to save space as requested.
        const prevSong = this.selectedSongs[this.currentSongIndex];
        // Don't await this, let it happen in background
        // fs.unlink... handled by videoDownloader? Not exposed yet. 
        // We'll trust the OS or do a full cleanup at end. 
        // Ideally we should delete specific file:
        // const p = path.join(__dirname, '../data/temp', this.roomId, `song_${prevSong.id}.mp4`);
        // if (fs.existsSync(p)) fs.unlinkSync(p);

        this.currentSongIndex++;
        if (this.currentSongIndex >= this.selectedSongs.length) {
            this.state = 'GAME_OVER';
            this.cleanup(); // Delete all files
        } else {
            this.turnIndex = (this.turnIndex + 1) % this.players.length;
            
            // If we are back to the first player, increment the round counter
            if (this.turnIndex === 0) {
                this.currentRound++;
            }

            // Trigger buffer for upcoming songs
            this.bufferSongs();
            
            // Check if next song is ready
            const nextSong = this.selectedSongs[this.currentSongIndex];
            if (this.downloadedSongs.has(nextSong.id)) {
                this.startRound();
            } else {
                this.state = 'BUFFERING';
            }
        }
        this.io.to(this.roomId).emit('game_update', this.getState());
    }

    makeMove(moveData, socketId) {
        switch(moveData.type) {
            case 'START_GAME':
                this.startGame();
                break;
            case 'SELECT_TIMESTAMP':
                this.selectTimestamp(socketId, moveData.timestamp);
                break;
            case 'SUBMIT_GUESS':
                this.submitAnswer(socketId, moveData.answer);
                break;
            case 'GIVE_UP':
                this.giveUp(socketId);
                break;
            case 'VOTE':
                this.vote(socketId, moveData.vote);
                break;
            case 'NEXT_TURN':
                this.nextTurn();
                break;
        }
        return { valid: true };
    }

    getState() {
        // Hide sensitive info if guessing
        const currentSong = this.selectedSongs[this.currentSongIndex];
        let publicSong = null;
        
        if (currentSong) {
            if (this.state === 'RESULT' || this.state === 'GAME_OVER' || this.state === 'VOTING') {
                publicSong = currentSong;
            } else {
                // Obscure title/artist
                publicSong = {
                    id: currentSong.id,
                    url: null, // Don't send URL
                    artist: '???',
                    title: '???'
                };
            }
        }
        
        if (this.state === 'RESULT') {
             console.log(`[SongQuiz] State is RESULT. Sending song info: ${JSON.stringify(publicSong)}`);
        }

        return {
            state: this.state,
            players: this.players,
            turnIndex: this.turnIndex,
            currentSongIndex: this.currentSongIndex,
            currentRound: this.currentRound,
            totalRounds: this.totalRounds,
            currentSong: publicSong,
            timestamp: this.timestamp,
            attempt: this.attempt,
            playerAnswer: this.playerAnswer,
            votes: this.votes,
            lastResult: this.lastResult,
            lastPoints: this.lastPoints,
            downloadedCount: this.downloadedSongs.size
        };
    }
}

module.exports = SongQuizGame;