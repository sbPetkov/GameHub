
const { io } = require('socket.io-client');

const SOCKET_URL = 'http://localhost:3001';

const socket1 = io(SOCKET_URL);
const socket2 = io(SOCKET_URL);

let roomId = '';

socket1.on('connect', () => {
    console.log('Socket 1 connected:', socket1.id);
    // Create Room
    socket1.emit('create_room', { gameType: 'associations', username: 'HostUser' }, (res) => {
        if (res.error) {
            console.error('Create Room Error:', res.error);
            return;
        }
        roomId = res.roomId;
        console.log('Room Created:', roomId);
        
        // Join with Socket 2
        socket2.emit('join_room', { roomId, username: 'PlayerUser' }, (res2) => {
            if (res2.error) {
                console.error('Join Room Error:', res2.error);
                return;
            }
            console.log('Socket 2 Joined:', res2.room);
            
            // Both Submit Words
            submitWords(socket1, roomId, ['H1', 'H2', 'H3', 'H4', 'H5']);
            submitWords(socket2, roomId, ['P1', 'P2', 'P3', 'P4', 'P5']);
        });
    });
});

function submitWords(socket, roomId, words) {
    const wordsObjs = words.map(w => ({ text: w, category: 'Test', author: 'Test' }));
    socket.emit('make_move', {
        roomId,
        moveData: { type: 'SUBMIT_WORDS', words: wordsObjs }
    });
}

// Listen for game updates
let wordsSubmittedCount = 0;

function checkStart() {
    wordsSubmittedCount++;
    if (wordsSubmittedCount === 2) {
        console.log('Both submitted. Starting game...');
        // Host starts game
        socket1.emit('make_move', {
            roomId,
            moveData: { type: 'START_GAME' }
        });
    }
}

// We need to listen to updates to know when to start (in real app, user clicks, here we simulate)
// But we don't get "submitted" events back other than generic update?
// Actually `Associations.js` doesn't emit on submit unless it's an error?
// Wait, `submitWords` in `Associations.js` does NOT emit update!
// It says: "but we'll just expose the state and let host trigger the transition".
// But `makeMove` emits `game_update` if result is valid.
// `submitWords` returns nothing, so `makeMove` returns undefined?
// Let's check `Associations.js` `makeMove` again.

/*
    makeMove(moveData, socketId) {
        // ...
        switch(type) {
            case 'SUBMIT_WORDS':
                this.submitWords(socketId, data.words);
                break;
            // ...
        }
        return { valid: true };
    }
*/
// It returns `{ valid: true }` at the end. So it emits update.

socket1.on('game_update', (state) => {
    console.log('S1 Update:', state.state, 'Players:', Object.keys(state.players).length);
    // console.log('S1 State Full:', JSON.stringify(state, null, 2));
});

socket2.on('game_update', (state) => {
    console.log('S2 Update:', state.state);
    if (state.state === 'PLAYING') {
        console.log('S2 Received PLAYING state.');
        console.log('S2 Teams:', JSON.stringify(state.teams));
        console.log('S2 Scores:', JSON.stringify(state.scores));
        console.log('S2 CurrentPlayerId:', state.currentPlayerId);
        
        // Verify Teams
        if (!state.teams || !Array.isArray(state.teams)) {
            console.error('CRITICAL: Teams is not an array!');
        }
        
        // Verify socket2 ID is in a team
        const inTeam = state.teams.some(t => t.includes(socket2.id));
        console.log(`Socket 2 (${socket2.id}) in team?`, inTeam);

        process.exit(0);
    }
    
    // Check if we can start
    const allSubmitted = Object.values(state.players).every(p => p.wordsSubmitted);
    if (allSubmitted && state.state === 'INPUTS') {
        // Only host starts
        if (socket1.connected) { // Just a check
             console.log('All submitted. Sending START_GAME...');
             socket1.emit('make_move', { roomId, moveData: { type: 'START_GAME' } });
        }
    }
});

