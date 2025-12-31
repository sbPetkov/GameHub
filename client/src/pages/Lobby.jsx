import { useState, useEffect, useContext } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { AuthContext } from '../context/AuthContext';
import TicTacToe from '../games/tictactoe/TicTacToe';
import Associations from '../games/associations/Associations';

const Lobby = () => {
  const { state } = useLocation(); // Passed from Home { gameType: 'tictactoe' } or join logic
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  
  const [socket, setSocket] = useState(null);
  const [roomId, setRoomId] = useState('');
  const [inputRoomId, setInputRoomId] = useState('');
  const [isInRoom, setIsInRoom] = useState(false);
  const [players, setPlayers] = useState([]);
  const [hostId, setHostId] = useState('');
  const [gameState, setGameState] = useState(null);
  const [gameType, setGameType] = useState(state?.gameType || 'tictactoe');
  const [error, setError] = useState('');

  // Auto-join effect
  useEffect(() => {
    if (state?.autoJoinRoomId && socket && user && !isInRoom) {
        setInputRoomId(state.autoJoinRoomId);
        // We need to trigger join, but joinRoom uses 'inputRoomId' state which might not be set yet due to closure.
        // So we emit directly here.
        socket.emit('join_room', { roomId: state.autoJoinRoomId, username: user.username }, (response) => {
            if (response.error) {
              setError(response.error);
            } else {
              setRoomId(response.room.id);
              setGameType(response.room.gameType);
              setPlayers(response.room.players);
              setHostId(response.room.host);
              setGameState(response.gameState);
              setIsInRoom(true);
              setError('');
            }
        });
    }
  }, [socket, user, state, isInRoom]);

  useEffect(() => {
    // In production (docker), Nginx proxies /socket.io to the backend, so we connect to the current origin.
    // In dev (localhost), we connect directly to port 3001.
    const socketUrl = window.location.hostname === 'localhost' 
        ? 'http://localhost:3001' 
        : window.location.origin;

    const newSocket = io(socketUrl);
    setSocket(newSocket);

    newSocket.on('connect', () => {
        const savedRoomId = localStorage.getItem('activeRoomId');
        if (savedRoomId && user) {
            console.log("Attempting to rejoin room:", savedRoomId);
            newSocket.emit('join_room', { roomId: savedRoomId, username: user.username }, (response) => {
                if (response.error) {
                    console.error("Rejoin failed:", response.error);
                    localStorage.removeItem('activeRoomId');
                } else {
                    console.log("Rejoined room:", response.room.id);
                    setRoomId(response.room.id);
                    setGameType(response.room.gameType);
                    setPlayers(response.room.players);
                    setHostId(response.room.host);
                    setGameState(response.gameState);
                    setIsInRoom(true);
                    setError('');
                }
            });
        }
    });

    newSocket.on('room_update', (data) => {
      setPlayers(data.players);
      setGameState(data.gameState);
    });

    newSocket.on('error', (err) => {
        setError(err.message || 'An error occurred');
    });

    return () => newSocket.disconnect();
  }, [user]); // Re-run if user changes, to ensure we have username for rejoin

  const createRoom = () => {
    if (!socket || !user) return;
    socket.emit('create_room', { gameType, username: user.username }, (response) => {
      if (response.error) {
        setError(response.error);
      } else {
        setRoomId(response.roomId);
        setHostId(socket.id); // Creator is host
        setIsInRoom(true);
        localStorage.setItem('activeRoomId', response.roomId);
        setError('');
      }
    });
  };

  const joinRoom = () => {
    if (!socket || !user || !inputRoomId) return;
    socket.emit('join_room', { roomId: inputRoomId.toUpperCase(), username: user.username }, (response) => {
      if (response.error) {
        setError(response.error);
      } else {
        setRoomId(response.room.id);
        setGameType(response.room.gameType);
        setPlayers(response.room.players); // Initial load
        setHostId(response.room.host);
        setGameState(response.gameState); // Initial load
        setIsInRoom(true);
        localStorage.setItem('activeRoomId', response.room.id);
        setError('');
      }
    });
  };

  const leaveRoom = () => {
      localStorage.removeItem('activeRoomId');
      window.location.reload();
  };

  if (!user) {
      return <div className="text-center mt-10">Please login to play.</div>;
  }

  if (isInRoom) {
    // Render the specific game board based on type
    if (gameType === 'tictactoe') {
        return (
            <div className="container mx-auto px-4 py-8">
                 <div className="flex justify-between items-center mb-4">
                    <h1 className="text-xl font-bold">Room: {roomId}</h1>
                    <button onClick={leaveRoom} className="text-red-500 hover:text-red-700">Leave Room</button>
                 </div>
                 <TicTacToe 
                    socket={socket} 
                    roomId={roomId} 
                    players={players} 
                    initialGameState={gameState}
                    currentUser={user}
                    onLeave={leaveRoom}
                 />
            </div>
        );
    }
    if (gameType === 'associations') {
         return (
            <div className="container mx-auto px-4 py-8">
                 <div className="flex justify-between items-center mb-4">
                    <h1 className="text-xl font-bold">Room: {roomId}</h1>
                    <button onClick={leaveRoom} className="text-red-500 hover:text-red-700">Leave Room</button>
                 </div>
                 <Associations
                    socket={socket} 
                    roomId={roomId} 
                    players={players} 
                    hostId={hostId}
                    initialGameState={gameState}
                    currentUser={user}
                    onLeave={leaveRoom}
                 />
            </div>
        );
    }
    return <div>Unknown Game Type</div>;
  }

  return (
    <div className="flex flex-col items-center justify-center h-[calc(100vh-64px)]">
      <div className="bg-white p-8 rounded-lg shadow-lg w-full max-w-md">
        <h1 className="text-3xl font-bold text-center mb-8 text-indigo-700">Game Lobby</h1>
        
        {error && <div className="bg-red-100 text-red-700 p-3 rounded mb-4 text-center">{error}</div>}

        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-2 text-gray-700">Create New Game</h2>
          <p className="text-sm text-gray-500 mb-4">Start a new {gameType} match and invite friends.</p>
          <button 
            onClick={createRoom}
            className="w-full bg-indigo-600 text-white font-bold py-3 px-4 rounded hover:bg-indigo-700 transition flex items-center justify-center"
          >
            Create Room
          </button>
        </div>

        <div className="relative flex py-5 items-center">
            <div className="flex-grow border-t border-gray-300"></div>
            <span className="flex-shrink-0 mx-4 text-gray-400">OR</span>
            <div className="flex-grow border-t border-gray-300"></div>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2 text-gray-700">Join Existing Game</h2>
          <div className="flex gap-2">
            <input 
              type="text" 
              placeholder="Enter Room Code"
              className="flex-1 px-4 py-3 border rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 uppercase"
              value={inputRoomId}
              onChange={(e) => setInputRoomId(e.target.value)}
            />
            <button 
              onClick={joinRoom}
              className="bg-green-600 text-white font-bold py-3 px-6 rounded hover:bg-green-700 transition"
            >
              Join
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Lobby;
