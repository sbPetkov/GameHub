import { useEffect, useState, useContext } from 'react';
import { io } from 'socket.io-client';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

const Home = () => {
  const navigate = useNavigate();
  const { checkActiveGame, user } = useContext(AuthContext);
  const [activeGame, setActiveGame] = useState(null);
  const [apiStatus, setApiStatus] = useState('Checking...');

  useEffect(() => {
    // Health Check
    const apiBase = import.meta.env.VITE_API_URL || (
        import.meta.env.DEV 
            ? `http://${window.location.hostname}:3001/api` 
            : '/api'
    );
    
    fetch(`${apiBase}/health`)
      .then(res => res.json())
      .then(data => setApiStatus(`Connected (${data.status})`))
      .catch(err => setApiStatus('Disconnected (Check Server/Firewall)'));

    if (user) {
        checkActiveGame().then(data => {
            if (data && data.active) {
                setActiveGame(data);
            }
        });
    }

    // Just a connection test for now
    const socketUrl = import.meta.env.VITE_SOCKET_URL || (
        import.meta.env.DEV 
            ? `http://${window.location.hostname}:3001` 
            : window.location.origin
    );
    const socket = io(socketUrl);
    socket.on('connect', () => {
      console.log('Connected to server');
    });

    return () => socket.disconnect();
  }, []);

  const games = [
    { id: 1, title: 'Associations', description: 'Guess the word based on associations.', status: 'Available', color: 'bg-blue-500', type: 'associations' },
    { id: 4, title: 'Imposter', description: 'Find the imposter among the group.', status: 'Available', color: 'bg-purple-500', type: 'imposter' },
    { id: 5, title: 'Imposter Q&A', description: 'Answer questions and find the odd one out.', status: 'Available', color: 'bg-pink-500', type: 'imposter-qa' },
    { id: 6, title: 'AI Balderdash', description: 'Bluff your way with fake definitions.', status: 'Available', color: 'bg-orange-500', type: 'balderdash' },
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

      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-800">Available Games</h1>
        <span className={`text-xs px-2 py-1 rounded ${apiStatus.includes('Connected') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            API: {apiStatus}
        </span>
      </div>
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
