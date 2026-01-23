import { useState, useEffect } from 'react';
import VideoPlayer from './VideoPlayer';

const MusicQuiz = ({ socket, roomId, players, initialGameState, currentUser }) => {
    const [gameState, setGameState] = useState(initialGameState);
    const [guess, setGuess] = useState('');
    
    // Add Song UI State
    const [addSongUrl, setAddSongUrl] = useState('');
    const [addSongStyle, setAddSongStyle] = useState('');
    const [addSongLimit, setAddSongLimit] = useState('');
    const [isAdding, setIsAdding] = useState(false);
    
    // Config UI State
    const [selectedStyles, setSelectedStyles] = useState([]);
    
    // Notifications
    const [notifications, setNotifications] = useState([]);

    useEffect(() => {
        if (initialGameState) {
            setGameState(initialGameState);
        }
    }, [initialGameState]);

    useEffect(() => {
        if (!socket) return;
        
        socket.on('game_update', (data) => setGameState(data));
        socket.on('library_update', (data) => {
            // Can update styles or counts if needed, usually covered by game_update next time or separate state
            // For now, if we are in Lobby, we might want to refresh the state to see new styles
            // But game_update isn't sent on library_update in server, let's fix that or rely on manual refresh/start.
            // Actually, we can just trigger a reload or wait for next update.
            // Server *should* probably emit game_update or we handle it here.
            // Let's just trust the server to eventually sync or we add a listener for specific updates.
            // For now, the 'notification' handles the user feedback.
        });
        
        socket.on('notification', (msg) => {
            const id = Date.now();
            setNotifications(prev => [...prev, { ...msg, id }]);
            setTimeout(() => {
                setNotifications(prev => prev.filter(n => n.id !== id));
            }, 5000);
        });
        
        return () => {
            socket.off('game_update');
            socket.off('library_update');
            socket.off('notification');
        };
    }, [socket]);

    if (!gameState) return <div className="text-center p-10">Loading Game State...</div>;

    const isHost = players[0]?.username === currentUser.username;
    const isMyTurn = players[gameState.turnIndex]?.username === currentUser.username;
    const currentPlayer = players[gameState.turnIndex];

    const handleStart = () => {
        socket.emit('make_move', { 
            roomId, 
            moveData: { 
                type: 'START_GAME', 
                config: { styles: selectedStyles } 
            } 
        });
    };
    
    const handleTimestamp = (ts) => socket.emit('make_move', { roomId, moveData: { type: 'SELECT_TIMESTAMP', timestamp: ts } });
    const handleSubmit = () => {
        if (guess.trim()) {
            socket.emit('make_move', { roomId, moveData: { type: 'SUBMIT_GUESS', answer: guess } });
            setGuess('');
        }
    };
    const handleGiveUp = () => socket.emit('make_move', { roomId, moveData: { type: 'GIVE_UP' } });
    const handleVote = (vote) => socket.emit('make_move', { roomId, moveData: { type: 'VOTE', vote } });
    const handleNext = () => socket.emit('make_move', { roomId, moveData: { type: 'NEXT_TURN' } });

    const toggleStyle = (style) => {
        setSelectedStyles(prev => prev.includes(style) 
            ? prev.filter(s => s !== style) 
            : [...prev, style]
        );
    };

    // Helper to get video URL
    const getVideoUrl = () => {
        if (!gameState.currentSong?.src) return '';
        
        const isDev = import.meta.env.DEV;
        const baseUrl = isDev ? `http://${window.location.hostname}:3001` : '';
        
        return `${baseUrl}${gameState.currentSong.src}`;
    };

    const styles = gameState.styles || {};
    const totalSongs = gameState.librarySize || 0;

    return (
        <div className="flex flex-col items-center w-full max-w-5xl mx-auto p-4 bg-gray-50 rounded shadow-xl min-h-[700px]">
            {/* Notification Toast */}
            <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
                {notifications.map(n => (
                    <div key={n.id} className={`px-4 py-2 rounded shadow text-white font-bold animate-fade-in-down ${
                        n.type === 'error' ? 'bg-red-500' : 
                        n.type === 'success' ? 'bg-green-500' : 'bg-blue-500'
                    }`}>
                        {n.message}
                    </div>
                ))}
            </div>

            {/* Header */}
            <div className="w-full flex justify-between items-center mb-4 border-b pb-2">
                <div className="text-sm font-semibold text-gray-600">
                    Round: {gameState.currentRound} / {gameState.totalRounds}
                </div>
                <div className="text-2xl font-bold text-teal-600">Music Quiz</div>
                <div className="text-sm text-gray-500">Library: {totalSongs} Songs</div>
            </div>

            {/* Main Content Area */}
            <div className="flex-grow w-full flex flex-col items-center justify-center space-y-6">
                
                {gameState.state === 'LOBBY' && (
                    <div className="text-center w-full max-w-3xl">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {/* Left: Players & Game Start */}
                            <div className="bg-white p-6 rounded shadow">
                                <h2 className="text-xl font-bold mb-4">Players</h2>
                                <ul className="flex flex-wrap gap-2 justify-center mb-6">
                                    {players.map(p => (
                                        <li key={p.username} className="px-3 py-1 bg-gray-100 border rounded shadow-sm">{p.username}</li>
                                    ))}
                                </ul>

                                {isHost && (
                                    <>
                                        <h3 className="font-bold mb-2 text-left">Select Categories:</h3>
                                        <div className="max-h-40 overflow-y-auto border p-2 rounded mb-4 text-left grid grid-cols-2 gap-2">
                                            {Object.keys(styles).map(style => (
                                                <label key={style} className="flex items-center space-x-2 cursor-pointer">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={selectedStyles.includes(style)}
                                                        onChange={() => toggleStyle(style)}
                                                        className="form-checkbox text-teal-600"
                                                    />
                                                    <span className="text-sm">{style} ({styles[style]})</span>
                                                </label>
                                            ))}
                                            {Object.keys(styles).length === 0 && <div className="text-gray-400 text-sm">No songs yet</div>}
                                        </div>
                                        <button onClick={handleStart} className="w-full bg-teal-600 text-white px-8 py-3 rounded-lg text-xl font-bold hover:bg-teal-700 shadow-lg">
                                            Start Game
                                        </button>
                                        <p className="text-xs text-gray-500 mt-2">
                                            {selectedStyles.length === 0 ? "Playing with ALL categories" : `Playing with ${selectedStyles.length} categories`}
                                        </p>
                                    </>
                                )}
                                {!isHost && <div className="text-gray-500 italic mt-4">Waiting for host...</div>}
                            </div>

                            {/* Right: Add Song */}
                            <div className="bg-white p-6 rounded shadow border-l-4 border-teal-400">
                                <h2 className="text-xl font-bold mb-4">Add Music</h2>
                                <div className="flex flex-col gap-3 text-left">
                                    <div>
                                        <label className="text-xs font-bold text-gray-600 uppercase">YouTube URL / Playlist</label>
                                        <input 
                                            type="text" 
                                            value={addSongUrl}
                                            onChange={(e) => setAddSongUrl(e.target.value)}
                                            placeholder="https://youtube.com/..."
                                            className="w-full border rounded px-3 py-2 text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-gray-600 uppercase">Style / Category</label>
                                        <input 
                                            type="text" 
                                            value={addSongStyle}
                                            onChange={(e) => setAddSongStyle(e.target.value)}
                                            placeholder="e.g. 90s Rock, Pop, Movie Themes"
                                            className="w-full border rounded px-3 py-2 text-sm"
                                            list="style-suggestions"
                                        />
                                        <datalist id="style-suggestions">
                                            {Object.keys(styles).map(s => <option key={s} value={s} />)}
                                        </datalist>
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-gray-600 uppercase">Max Songs (Playlist)</label>
                                        <input 
                                            type="number" 
                                            value={addSongLimit}
                                            onChange={(e) => setAddSongLimit(e.target.value)}
                                            placeholder="Default: 20"
                                            className="w-full border rounded px-3 py-2 text-sm"
                                            min="1"
                                            max="100"
                                        />
                                    </div>
                                    <button 
                                        onClick={() => {
                                            if (!addSongUrl || !addSongStyle) return;
                                            setIsAdding(true);
                                            socket.emit('make_move', { 
                                                roomId, 
                                                moveData: { 
                                                    type: 'ADD_SONG', 
                                                    url: addSongUrl, 
                                                    style: addSongStyle,
                                                    limit: addSongLimit ? parseInt(addSongLimit) : 20
                                                } 
                                            });
                                            setAddSongUrl('');
                                            setAddSongLimit('');
                                            setTimeout(() => setIsAdding(false), 1000);
                                        }} 
                                        disabled={isAdding || !addSongUrl || !addSongStyle}
                                        className={`mt-2 py-2 rounded font-bold text-white transition ${isAdding ? 'bg-gray-400' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                                    >
                                        {isAdding ? 'Processing...' : 'Add to Library'}
                                    </button>
                                    <p className="text-xs text-gray-500">
                                        Note: Playlists will be added as a batch. Duplicates are skipped.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {gameState.state === 'BUFFERING' && (
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-teal-600 border-opacity-50 mx-auto mb-4"></div>
                        <h2 className="text-xl font-semibold">Loading Round...</h2>
                    </div>
                )}

                {gameState.state === 'ROUND_START' && (
                    <div className="text-center w-full">
                        <div className="mb-6">
                            <h2 className="text-2xl font-bold text-indigo-700">
                                {isMyTurn ? "It's Your Turn!" : `${currentPlayer?.username}'s Turn`}
                            </h2>
                            <p className="text-gray-600">
                                {gameState.attempt === 1 ? "Round 1: Muted Guess (15 pts)" : "Round 2: Unmuted Guess (10 pts)"}
                            </p>
                        </div>
                        
                        {isMyTurn ? (
                            <div className="bg-white p-6 rounded-lg shadow-md">
                                <h3 className="text-lg font-semibold mb-4">Select a Timestamp to Start:</h3>
                                <div className="flex gap-4 justify-center">
                                    {[0, 30, 60, 90, 120].map(ts => (
                                        <button
                                            key={ts}
                                            onClick={() => handleTimestamp(ts)}
                                            className="bg-teal-100 text-teal-800 px-4 py-2 rounded border border-teal-300 hover:bg-teal-200 font-mono font-bold"
                                        >
                                            {Math.floor(ts / 60)}:{(ts % 60).toString().padStart(2, '0')}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="text-gray-500 italic">Waiting for player to choose a timestamp...</div>
                        )}
                    </div>
                )}

                {(gameState.state === 'PLAYING' || gameState.state === 'VOTING') && (
                    <div className="w-full max-w-2xl">
                        <div className="mb-2 text-center">
                            <span className={`px-3 py-1 rounded text-sm font-bold ${gameState.attempt === 1 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                                {gameState.attempt === 1 ? "MUTED" : "UNMUTED"}
                            </span>
                        </div>
                        
                        <VideoPlayer 
                            src={getVideoUrl()} 
                            timestamp={gameState.timestamp} 
                            muted={gameState.attempt === 1 || !isMyTurn} 
                            allowReplay={isMyTurn}
                        />

                        {gameState.state === 'PLAYING' && isMyTurn && (
                            <div className="mt-6 p-4 bg-white rounded shadow-md">
                                <input 
                                    type="text" 
                                    placeholder="Enter song name / artist..." 
                                    className="w-full px-4 py-2 border rounded mb-3"
                                    value={guess}
                                    onChange={(e) => setGuess(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                                />
                                <div className="flex gap-2">
                                    <button onClick={handleSubmit} className="flex-1 bg-teal-600 text-white py-2 rounded hover:bg-teal-700 font-bold">
                                        Submit Guess
                                    </button>
                                    <button onClick={handleGiveUp} className="flex-1 bg-gray-300 text-gray-700 py-2 rounded hover:bg-gray-400">
                                        {gameState.attempt === 1 ? "Try with Sound (10 pts)" : "Give Up (0 pts)"}
                                    </button>
                                </div>
                            </div>
                        )}

                        {gameState.state === 'VOTING' && (
                            <div className="mt-6 p-6 bg-yellow-50 border border-yellow-200 rounded text-center">
                                <h3 className="text-lg font-bold mb-2">Voting in Progress</h3>
                                <p className="mb-4">
                                    <span className="font-bold">{currentPlayer?.username}</span> guessed:
                                </p>
                                <div className="text-2xl font-mono bg-white p-3 rounded border mb-6 inline-block min-w-[200px]">
                                    {gameState.playerAnswer}
                                </div>
                                
                                <div className="mb-6 p-4 bg-white/50 rounded border border-yellow-300">
                                    <p className="text-sm text-gray-600 mb-1">Correct Answer:</p>
                                    <p className="text-xl font-bold text-indigo-800">{gameState.currentSong?.artist} - {gameState.currentSong?.title}</p>
                                    <p className="text-sm text-gray-500">Style: {gameState.currentSong?.style}</p>
                                </div>
                                
                                {!isMyTurn && !gameState.votes[socket.id] && (
                                    <div className="flex flex-wrap gap-2 justify-center">
                                        <button onClick={() => handleVote('BOTH')} className="bg-green-600 text-white px-4 py-3 rounded shadow hover:bg-green-700 font-bold transition">
                                            ✅ Both Correct
                                        </button>
                                        <button onClick={() => handleVote('ONE')} className="bg-yellow-500 text-white px-4 py-3 rounded shadow hover:bg-yellow-600 font-bold transition">
                                            ⚠️ One Correct
                                        </button>
                                        <button onClick={() => handleVote('FAIL')} className="bg-red-500 text-white px-4 py-3 rounded shadow hover:bg-red-600 font-bold transition">
                                            ❌ Incorrect
                                        </button>
                                    </div>
                                )}
                                <div className="mt-4 text-sm text-gray-500">
                                    Votes: {Object.keys(gameState.votes).length} / {players.length - 1}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {gameState.state === 'RESULT' && (
                    <div className="text-center">
                        <h2 className="text-3xl font-bold mb-2">
                            {gameState.lastResult ? "Success!" : "Round Over"}
                        </h2>
                        <div className="text-xl mb-6">
                            {gameState.lastResult 
                                ? <span className="text-green-600">+{gameState.lastPoints} Points</span> 
                                : <span className="text-red-600">0 Points</span>}
                        </div>
                        
                        <div className="bg-white p-6 rounded shadow-lg max-w-md mx-auto mb-6">
                            <div className="text-gray-500 text-sm mb-1">The song was:</div>
                            <div className="text-2xl font-bold text-indigo-800">{gameState.currentSong?.title}</div>
                            <div className="text-xl text-indigo-600">{gameState.currentSong?.artist}</div>
                        </div>

                        {isHost && (
                            <button onClick={handleNext} className="bg-blue-600 text-white px-8 py-3 rounded shadow hover:bg-blue-700 font-bold">
                                Next Song
                            </button>
                        )}
                    </div>
                )}
                 {gameState.state === 'GAME_OVER' && (
                    <div className="text-center">
                         <h2 className="text-4xl font-bold mb-8 text-teal-700">Game Over!</h2>
                         <div className="bg-white rounded-lg shadow-xl overflow-hidden max-w-md mx-auto">
                            <table className="w-full text-left">
                                <thead className="bg-teal-100">
                                    <tr>
                                        <th className="p-4">Rank</th>
                                        <th className="p-4">Player</th>
                                        <th className="p-4 text-right">Score</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[...gameState.players].sort((a,b) => b.score - a.score).map((p, i) => (
                                        <tr key={p.username} className="border-b last:border-0">
                                            <td className="p-4 text-gray-500">#{i+1}</td>
                                            <td className="p-4 font-bold">{p.username}</td>
                                            <td className="p-4 text-right">{p.score || 0}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                         </div>
                         <button onClick={handleNext} className="mt-8 bg-gray-500 text-white px-6 py-2 rounded hover:bg-gray-600">
                            Back to Lobby (Host)
                         </button>
                    </div>
                 )}
            </div>

            {/* Scoreboard Footer */}
            <div className="w-full mt-6 pt-4 border-t flex overflow-x-auto gap-4 py-2 bg-gray-100 rounded-b-lg">
                {gameState.players.map(p => (
                    <div key={p.username} className={`flex-shrink-0 flex flex-col items-center min-w-[100px] p-2 rounded shadow-sm border ${p.username === currentPlayer?.username ? 'bg-yellow-100 border-yellow-400' : 'bg-white border-gray-200'}`}>
                        <span className="text-sm font-bold truncate max-w-full text-gray-800">{p.username}</span>
                        <div className="flex items-baseline gap-1">
                             <span className="text-xs text-gray-500 uppercase">Score</span>
                             <span className="text-xl font-bold text-teal-700">{p.score || 0}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default MusicQuiz;