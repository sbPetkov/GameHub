import { useEffect, useState, useContext } from 'react';
import { io } from 'socket.io-client';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

const Home = () => {
  const navigate = useNavigate();
  const { checkActiveGame, user } = useContext(AuthContext);
  const [activeGame, setActiveGame] = useState(null);

  useEffect(() => {
    if (user) {
        checkActiveGame().then(data => {
            if (data && data.active) {
                setActiveGame(data);
            }
        });
    }

    // Just a connection test for now
    const socketUrl = window.location.hostname === 'localhost' 
        ? 'http://localhost:3001' 
        : `http://${window.location.hostname}:3001`;
    const socket = io(socketUrl);
    socket.on('connect', () => {
      console.log('Connected to server');
    });

    return () => socket.disconnect();
  }, []);

  const games = [
    { id: 1, title: 'Associations', description: 'Guess the word based on associations.', status: 'Available', color: 'bg-blue-500', type: 'associations' },
    { id: 2, title: 'Werewolf', description: 'Find the werewolf before it is too late.', status: 'Coming Soon', color: 'bg-red-500' },
    { id: 3, title: 'Tic Tac Toe', description: 'Classic game for two players.', status: 'Available', color: 'bg-green-500', type: 'tictactoe' },
  ];

  return (
    <div className="container mx-auto px-4 py-8">
      {activeGame && (
          <div className="bg-indigo-100 border-l-4 border-indigo-500 text-indigo-700 p-4 mb-6 flex justify-between items-center rounded shadow">
              <div>
                  <p className="font-bold">You are currently in a game!</p>
                  <p className="text-sm">Room: {activeGame.roomId} ({activeGame.gameType})</p>
              </div>
              <button 
                onClick={() => navigate('/lobby', { state: { gameType: activeGame.gameType, autoJoinRoomId: activeGame.roomId } })}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded"
              >
                  Rejoin Now
              </button>
          </div>
      )}

      <h1 className="text-3xl font-bold text-gray-800 mb-8">Available Games</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {games.map((game) => (
          <div key={game.id} className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-xl transition-shadow duration-300">
            <div className={`h-32 ${game.color} flex items-center justify-center`}>
              <span className="text-white text-4xl font-bold">{game.title[0]}</span>
            </div>
            <div className="p-6">
              <h3 className="text-xl font-bold text-gray-800 mb-2">{game.title}</h3>
              <p className="text-gray-600 mb-4">{game.description}</p>
              <div className="flex justify-between items-center">
                <span className={`text-sm font-semibold uppercase tracking-wide ${game.status === 'Available' ? 'text-green-600' : 'text-gray-500'}`}>{game.status}</span>
                <button 
                  onClick={() => game.status === 'Available' && navigate('/lobby', { state: { gameType: game.type } })}
                  disabled={game.status !== 'Available'}
                  className={`font-bold py-2 px-4 rounded ${game.status === 'Available' ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
                >
                  Play
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Home;
