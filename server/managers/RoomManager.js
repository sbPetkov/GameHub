const TicTacToe = require('../games/tictactoe');
const Associations = require('../games/associations');
const ImposterGame = require('../games/imposter');

class RoomManager {
    constructor(io, ai) {
        this.io = io;
        this.ai = ai;
        this.rooms = new Map(); // roomId -> { gameType, gameInstance, players: [] }
        this.disconnectTimeouts = new Map(); // username -> timeout
    }

    createRoom(hostSocketId, gameType) {
        const roomId = this.generateRoomId();
        
        let gameInstance;
        switch(gameType) {
            case 'tictactoe':
                gameInstance = new TicTacToe();
                break;
            case 'associations':
                gameInstance = new Associations(this.io, roomId);
                break;
            case 'imposter':
                gameInstance = new ImposterGame(this.io, roomId, this.ai);
                break;
            default:
                throw new Error("Unknown game type");
        }

        const room = {
            id: roomId,
            gameType,
            game: gameInstance,
            players: [], // List of { socketId, username, symbol }
            host: hostSocketId
        };

        this.rooms.set(roomId, room);
        return roomId;
    }

    joinRoom(socket, roomId, username) {
        const room = this.rooms.get(roomId);
        if (!room) return { error: "Room not found" };

        // Cancel pending disconnect timeout if any
        if (this.disconnectTimeouts.has(username)) {
            clearTimeout(this.disconnectTimeouts.get(username));
            this.disconnectTimeouts.delete(username);
        }

        const publicRoom = {
            id: room.id,
            gameType: room.gameType,
            players: room.players,
            host: room.host
        };

        // Check if player is rejoining (by username)
        const existingPlayerIndex = room.players.findIndex(p => p.username === username);
        
        if (existingPlayerIndex !== -1) {
            const oldSocketId = room.players[existingPlayerIndex].socketId;
            
            // Update room player list
            room.players[existingPlayerIndex].socketId = socket.id;
            room.players[existingPlayerIndex].connected = true; // Mark as connected
            
            // Update Game Logic (Transfer state from old socket to new socket)
            if (room.game.updatePlayerSocket) {
                room.game.updatePlayerSocket(oldSocketId, socket.id);
            }

            // If host rejoined, update host ID
            if (room.host === oldSocketId) {
                room.host = socket.id;
                publicRoom.host = socket.id;
            }
            
            socket.join(roomId);
            
            // Notify room of update
             this.io.to(roomId).emit('room_update', {
                players: room.players,
                gameState: room.game.getState()
            });

             return { success: true, room: publicRoom, gameState: room.game.getState() };
        }

        // New Player
        const existingPlayer = room.players.find(p => p.socketId === socket.id); // Check by socket just in case
        if (existingPlayer) {
             return { success: true, room: publicRoom, gameState: room.game.getState() };
        }

        // Add player to game logic to assign role/symbol
        const symbol = room.game.addPlayer(socket.id);
        
        const player = { socketId: socket.id, username, symbol, connected: true };
        room.players.push(player);
        
        socket.join(roomId);

        // Notify room
        this.io.to(roomId).emit('room_update', {
            players: room.players,
            gameState: room.game.getState()
        });

        return { success: true, room: publicRoom, gameState: room.game.getState() };
    }

    leaveRoom(socketId) {
        // Find which room the player is in
        for (const [roomId, room] of this.rooms.entries()) {
            const playerIndex = room.players.findIndex(p => p.socketId === socketId);
            if (playerIndex !== -1) {
                const player = room.players[playerIndex];
                const username = player.username;

                // Mark as disconnected but keep in room
                player.connected = false;
                
                // Notify room that player is offline (visual update)
                this.io.to(roomId).emit('room_update', {
                    players: room.players,
                    gameState: room.game.getState()
                });

                // Start grace period
                console.log(`Player ${username} disconnected. Starting grace period.`);
                
                if (this.disconnectTimeouts.has(username)) {
                    clearTimeout(this.disconnectTimeouts.get(username));
                }

                const timeout = setTimeout(() => {
                    console.log(`Grace period ended for ${username}. Removing from room.`);
                    this.actuallyRemovePlayer(roomId, username);
                    this.disconnectTimeouts.delete(username);
                }, 3600000); // 1 hour

                this.disconnectTimeouts.set(username, timeout);
                return; 
            }
        }
    }

    actuallyRemovePlayer(roomId, username) {
        const room = this.rooms.get(roomId);
        if (!room) return;

        const playerIndex = room.players.findIndex(p => p.username === username);
        if (playerIndex !== -1) {
            const socketId = room.players[playerIndex].socketId;
            room.players.splice(playerIndex, 1);
            
            // Optional: Handle game-specific leave logic (e.g., auto-loss)
            if (room.game.removePlayer) {
                room.game.removePlayer(socketId);
            }

            // If room empty, delete it
            if (room.players.length === 0) {
                this.rooms.delete(roomId);
            } else {
                // Notify remaining players
                this.io.to(roomId).emit('room_update', {
                    players: room.players,
                    gameState: room.game.getState()
                });
            }
        }
    }

    handleMove(socketId, roomId, moveData) {
        const room = this.rooms.get(roomId);
        if (!room) return;

        // Delegate to specific game logic
        // For TicTacToe: moveData is { index: 0 }
        // For Associations: moveData is { type: 'SUBMIT_WORDS', ... }
        // We let the game class decide how to parse it.
        const result = room.game.makeMove(moveData, socketId);

        if (result.valid) {
            this.io.to(roomId).emit('game_update', room.game.getState());
        } else {
            // Send error only to the player who made the invalid move
            this.io.to(socketId).emit('error', { message: result.message });
        }
    }

    getRoom(roomId) {
        return this.rooms.get(roomId);
    }

    findRoomByUser(username) {
        for (const room of this.rooms.values()) {
            if (room.players.some(p => p.username === username)) {
                return room;
            }
        }
        return null;
    }

    generateRoomId() {
        return Math.random().toString(36).substring(2, 6).toUpperCase();
    }
}

module.exports = RoomManager;
