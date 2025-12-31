import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

const TicTacToe = ({ socket, roomId, players, initialGameState, currentUser, onLeave }) => {
  const [board, setBoard] = useState(Array(9).fill(null));
  const [status, setStatus] = useState('');
  const [mySymbol, setMySymbol] = useState(null);

  useEffect(() => {
    // Initialize state
    if (initialGameState) {
      setBoard(initialGameState.board);
      updateStatus(initialGameState);
    }
    
    // Find my symbol
    const me = players.find(p => p.username === currentUser.username);
    if (me) setMySymbol(me.symbol);

    // Listen for updates
    socket.on('game_update', (gameState) => {
      setBoard(gameState.board);
      updateStatus(gameState);
    });

    return () => {
      socket.off('game_update');
    };
  }, [initialGameState, players, currentUser]);

  const updateStatus = (gameState) => {
    if (gameState.winner) {
      setStatus(`Winner: ${gameState.winner}`);
    } else if (gameState.isDraw) {
      setStatus("It's a Draw!");
    } else {
      setStatus(`Current Turn: ${gameState.currentPlayer}`);
    }
  };

  const handleClick = (index) => {
    if (!mySymbol) return; // Spectator
    socket.emit('make_move', {
      roomId,
      moveData: { index }
    });
  };

  return (
    <div className="flex flex-col items-center mt-8">
      <h2 className="text-2xl font-bold mb-4">Tic Tac Toe</h2>
      <div className="mb-4 text-lg font-semibold text-indigo-700">
        You are: {mySymbol || 'Spectator'}
      </div>
      <div className="mb-6 text-xl text-gray-800 bg-white px-4 py-2 rounded shadow">
        {status}
      </div>

      <div className="grid grid-cols-3 gap-2 bg-gray-300 p-2 rounded-lg">
        {board.map((cell, index) => (
          <button
            key={index}
            className={`w-20 h-20 text-4xl font-bold flex items-center justify-center rounded focus:outline-none transition-colors duration-200
              ${cell === 'X' ? 'text-blue-600 bg-blue-50' : ''}
              ${cell === 'O' ? 'text-red-600 bg-red-50' : ''}
              ${!cell ? 'bg-white hover:bg-gray-100' : ''}
            `}
            onClick={() => handleClick(index)}
          >
            {cell}
          </button>
        ))}
      </div>
      
      <div className="mt-8">
         <h3 className="font-bold text-gray-700">Players:</h3>
         <ul className="list-disc pl-5">
            {players.map((p, i) => (
                <li key={i} className={p.username === currentUser.username ? "font-bold" : ""}>
                    {p.username} ({p.symbol})
                </li>
            ))}
         </ul>
      </div>
    </div>
  );
};

export default TicTacToe;
