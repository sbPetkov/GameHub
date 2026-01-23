const fs = require('fs');
const path = require('path');
const videoDownloader = require('../utils/videoDownloader');

const MUSIC_DATA_DIR = path.join(__dirname, '../data/music_quiz');
const SONGS_FILE = path.join(MUSIC_DATA_DIR, 'songs.json');
const VIDEOS_DIR = path.join(MUSIC_DATA_DIR, 'videos');

// Ensure directories exist
if (!fs.existsSync(VIDEOS_DIR)) {
    fs.mkdirSync(VIDEOS_DIR, { recursive: true });
}

class MusicQuizGame {
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
        this.totalRounds = 5; 
        
        // Configuration
        this.selectedStyles = []; // [] means all
        
        // Round State
        this.timestamp = 0;
        this.attempt = 1; 
        this.playerAnswer = null;
        this.votes = {}; 
        this.downloadPromises = {}; 
        this.downloadedSongs = new Set(); // songIds that are ready (file exists)
        
        this.lastResult = null;
        this.lastPoints = 0;

        // Verify existing files
        this.verifyLibrary();
    }

    loadSongs() {
        try {
            if (fs.existsSync(SONGS_FILE)) {
                return JSON.parse(fs.readFileSync(SONGS_FILE, 'utf8'));
            }
            return [];
        } catch (e) {
            console.error("Failed to load songs", e);
            return [];
        }
    }

    saveSongs() {
        try {
            fs.writeFileSync(SONGS_FILE, JSON.stringify(this.allSongs, null, 2));
        } catch (e) {
            console.error("Failed to save songs", e);
        }
    }

    verifyLibrary() {
        // Check which songs actually have files
        this.downloadedSongs = new Set();
        this.allSongs.forEach(song => {
            const filename = `song_${song.id}.mp4`;
            if (fs.existsSync(path.join(VIDEOS_DIR, filename))) {
                this.downloadedSongs.add(song.id);
            }
        });
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
        // We do NOT delete the videos as they are part of the library now.
        // Just general cleanup if needed.
    }

    async addSong(url, style, addedBy, limit = 20) {
        // Ensure limit is a valid number
        let parsedLimit = parseInt(limit);
        if (isNaN(parsedLimit) || parsedLimit <= 0) parsedLimit = 20;

        console.log(`[MusicQuiz] Adding song: ${url} (${style}) by ${addedBy}. Raw Limit: ${limit}, Parsed: ${parsedLimit}`);
        this.io.to(this.roomId).emit('notification', { message: `Processing ${url} (Limit: ${parsedLimit})...`, type: 'info' });

        try {
            let videos = await videoDownloader.getPlaylistInfo(url);
            console.log(`[MusicQuiz] Fetched ${videos.length} videos from URL.`);
            
            // Apply limit
            if (videos.length > parsedLimit) {
                console.log(`[MusicQuiz] Limiting playlist from ${videos.length} to ${parsedLimit}.`);
                videos = videos.slice(0, parsedLimit);
            } else {
                console.log(`[MusicQuiz] Playlist size ${videos.length} is within limit ${parsedLimit}.`);
            }

            let addedCount = 0;
            let skippedCount = 0;

            for (const video of videos) {
                // Check duplicate by Title (as requested) or ID
                // "verify the name from youtube which should be constant"
                const exists = this.allSongs.find(s => s.title === video.title || s.url === video.url);
                
                if (exists) {
                    console.log(`[MusicQuiz] Skipping duplicate: ${video.title}`);
                    skippedCount++;
                    continue;
                }

                // Generate ID
                const songId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
                const filename = `song_${songId}.mp4`;
                
                // Download
                try {
                    this.io.to(this.roomId).emit('notification', { message: `Downloading: ${video.title}`, type: 'info' });
                    await videoDownloader.downloadVideo(video.url, null, filename, VIDEOS_DIR);
                    
                    const newSong = {
                        id: songId,
                        url: video.url,
                        title: video.title,
                        style: style,
                        addedBy: addedBy,
                        createdAt: Date.now()
                    };

                    this.allSongs.push(newSong);
                    this.downloadedSongs.add(songId);
                    addedCount++;
                    
                    // Save incrementally? Or at end.
                    this.saveSongs();
                    
                    // Notify update
                    this.io.to(this.roomId).emit('library_update', { 
                        song: newSong, 
                        total: this.allSongs.length,
                        styles: this.getStyles() 
                    });

                } catch (err) {
                    console.error(`[MusicQuiz] Failed to download ${video.title}:`, err);
                    this.io.to(this.roomId).emit('notification', { message: `Failed to download: ${video.title}`, type: 'error' });
                }
            }

            this.io.to(this.roomId).emit('notification', { 
                message: `Added ${addedCount} songs. Skipped ${skippedCount} duplicates.`, 
                type: 'success' 
            });

        } catch (err) {
            console.error('[MusicQuiz] Add Song Error:', err);
            this.io.to(this.roomId).emit('notification', { message: `Error adding song: ${err.message}`, type: 'error' });
        }
    }

    getStyles() {
        const styles = {};
        this.allSongs.forEach(s => {
            const st = s.style || 'Uncategorized';
            styles[st] = (styles[st] || 0) + 1;
        });
        return styles;
    }

    startGame(config) {
        this.selectedStyles = config.styles || [];
        this.totalRounds = config.rounds || 5;

        console.log(`[MusicQuiz] Starting game. Styles: ${this.selectedStyles.length > 0 ? this.selectedStyles.join(',') : 'ALL'}`);
        if (this.players.length < 1) return { error: "Need at least 1 player" };

        // Filter Songs
        let availableSongs = this.allSongs;
        if (this.selectedStyles.length > 0) {
            availableSongs = this.allSongs.filter(s => this.selectedStyles.includes(s.style));
        }

        // Only use songs that are downloaded
        availableSongs = availableSongs.filter(s => this.downloadedSongs.has(s.id));

        if (availableSongs.length === 0) {
             this.io.to(this.roomId).emit('notification', { message: "No songs available with selected styles!", type: 'error' });
             return;
        }
        
        // Shuffle
        this.deck = [...availableSongs].sort(() => 0.5 - Math.random());
        
        this.selectedSongs = [];
        const numSongsNeeded = this.players.length * this.totalRounds;
        
        for (let i = 0; i < numSongsNeeded; i++) {
            if (this.deck.length === 0) {
                 // Reshuffle if we run out (allow repeats if deck is small)
                 this.deck = [...availableSongs].sort(() => 0.5 - Math.random());
            }
            if (this.deck.length > 0) {
                const song = this.deck.pop();
                // Create a round instance (clone to avoid mutating the library object)
                this.selectedSongs.push({
                    ...song,
                    roundId: i // Unique ID for this specific round instance
                });
            }
        }
            
        this.currentSongIndex = 0;
        this.turnIndex = 0;
        this.currentRound = 1;
        this.state = 'BUFFERING'; // Keep buffering state to ensure client is ready, though files exist
        
        this.io.to(this.roomId).emit('game_update', this.getState());
        
        // Since files are local, we can proceed quickly
        setTimeout(() => this.startRound(), 1000);
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
            this.attempt = 2;
            this.state = 'ROUND_START'; 
            this.io.to(this.roomId).emit('game_update', this.getState());
        } else {
            this.resolveRound(0);
        }
    }

    vote(voterId, voteType) { 
        if (this.state !== 'VOTING') return;
        const currentPlayer = this.players[this.turnIndex];
        if (voterId === currentPlayer.socketId) return;

        this.votes[voterId] = voteType;

        const otherPlayers = this.players.filter(p => p.socketId !== currentPlayer.socketId && p.connected);
        const totalVoters = otherPlayers.length;
        const votesArray = Object.values(this.votes);
        
        const bothVotes = votesArray.filter(v => v === 'BOTH').length;
        const oneVotes = votesArray.filter(v => v === 'ONE').length;
        const threshold = Math.ceil(totalVoters / 2);

        const basePoints = this.attempt === 1 ? 15 : 10;

        if (bothVotes >= threshold) {
            this.resolveRound(basePoints * 2);
            return;
        }

        if ((bothVotes + oneVotes) >= threshold) {
            const remainingVoters = totalVoters - votesArray.length;
            if (bothVotes + remainingVoters < threshold) {
                 this.resolveRound(basePoints);
                 return;
            }
        }

        const possiblePositiveVotes = (bothVotes + oneVotes) + (totalVoters - votesArray.length);
        if (possiblePositiveVotes < threshold) {
            this.resolveRound(0);
            return;
        }

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
        this.currentSongIndex++;
        if (this.currentSongIndex >= this.selectedSongs.length) {
            this.state = 'GAME_OVER';
        } else {
            this.turnIndex = (this.turnIndex + 1) % this.players.length;
            if (this.turnIndex === 0) {
                this.currentRound++;
            }
            this.startRound();
        }
        this.io.to(this.roomId).emit('game_update', this.getState());
    }

    makeMove(moveData, socketId) {
        switch(moveData.type) {
            case 'START_GAME':
                // config contains { styles: [], rounds: 5 }
                this.startGame(moveData.config || {});
                break;
            case 'ADD_SONG':
                const player = this.players.find(p => p.socketId === socketId);
                this.addSong(moveData.url, moveData.style, player ? player.username : 'Unknown', moveData.limit);
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
        const currentSong = this.selectedSongs[this.currentSongIndex];
        let publicSong = null;
        
        if (currentSong) {
            // Determine video path
            const videoPath = `/music-quiz-data/song_${currentSong.id}.mp4`;
            
            if (this.state === 'RESULT' || this.state === 'GAME_OVER' || this.state === 'VOTING') {
                publicSong = {
                    ...currentSong,
                    src: videoPath // Client uses this to play
                };
            } else {
                publicSong = {
                    id: currentSong.id,
                    src: videoPath, // We need to send source for them to play (muted/hidden)
                    artist: '???',
                    title: '???'
                };
            }
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
            styles: this.getStyles(), // Send available styles for Lobby UI
            librarySize: this.allSongs.length
        };
    }
}

module.exports = MusicQuizGame;
