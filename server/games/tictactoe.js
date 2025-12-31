class TicTacToe {
    constructor() {
        this.board = Array(9).fill(null); // 3x3 grid
        this.currentPlayer = 'X';
        this.winner = null;
        this.isDraw = false;
        // Map socket IDs to 'X' or 'O'
        this.players = {}; 
        this.playerCount = 0;
    }

    addPlayer(socketId) {
        if (this.playerCount === 0) {
            this.players[socketId] = 'X';
            this.playerCount++;
            return 'X';
        } else if (this.playerCount === 1) {
            this.players[socketId] = 'O';
            this.playerCount++;
            return 'O';
        }
        return null; // Spectator
    }

    removePlayer(socketId) {
        // Handle player disconnect logic (e.g., auto-forfeit) if needed
        // For now, we just decrement or reset
        this.playerCount--;
    }

    makeMove(moveData, socketId) {
        const index = moveData.index;
        // Validate turn
        if (this.players[socketId] !== this.currentPlayer) return { valid: false, message: "Not your turn" };
        if (this.winner || this.isDraw) return { valid: false, message: "Game over" };
        if (this.board[index] !== null) return { valid: false, message: "Cell occupied" };

        // Execute move
        this.board[index] = this.currentPlayer;
        
        // Check win/draw
        if (this.checkWin()) {
            this.winner = this.currentPlayer;
        } else if (this.board.every(cell => cell !== null)) {
            this.isDraw = true;
        } else {
            // Switch turn
            this.currentPlayer = this.currentPlayer === 'X' ? 'O' : 'X';
        }

        return { valid: true };
    }

    checkWin() {
        const winningCombos = [
            [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
            [0, 3, 6], [1, 4, 7], [2, 5, 8], // Cols
            [0, 4, 8], [2, 4, 6]             // Diagonals
        ];

        return winningCombos.some(combo => {
            const [a, b, c] = combo;
            return this.board[a] && this.board[a] === this.board[b] && this.board[a] === this.board[c];
        });
    }

    getState() {
        return {
            board: this.board,
            currentPlayer: this.currentPlayer,
            winner: this.winner,
            isDraw: this.isDraw
        };
    }
}

module.exports = TicTacToe;
