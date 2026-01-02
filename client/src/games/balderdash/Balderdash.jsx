import { useState, useEffect } from 'react';

const Balderdash = ({ socket, roomId, players, initialGameState, currentUser }) => {
    const [gameState, setGameState] = useState(initialGameState);
    const [myDefinition, setMyDefinition] = useState('');

    useEffect(() => {
        setGameState(initialGameState);
    }, [initialGameState]);

    useEffect(() => {
        socket.on('game_update', (newState) => {
            setGameState(newState);
        });
        return () => socket.off('game_update');
    }, [socket]);

    const startGame = () => socket.emit('make_move', { roomId, moveData: { type: 'START_GAME' } });
    const nextRound = () => socket.emit('make_move', { roomId, moveData: { type: 'NEXT_ROUND' } });
    
    const submitDefinition = () => {
        if (!myDefinition.trim()) return;
        socket.emit('make_move', { roomId, moveData: { type: 'SUBMIT_DEFINITION', definition: myDefinition } });
        setMyDefinition('');
    };

    const voteFor = (index) => {
        socket.emit('make_move', { roomId, moveData: { type: 'VOTE', targetIndex: index } });
    };

    const myPlayerId = players.find(p => p.username === currentUser.username)?.socketId;
    const myPlayerData = gameState?.allPlayersData?.[myPlayerId];
    const isHost = players[0]?.username === currentUser.username;

    if (!gameState) return <div>Loading...</div>;

    // --- RENDER HELPERS ---

    const renderLobby = () => (
        <div className="flex flex-col items-center">
            <h2 className="text-2xl font-bold mb-4">Waiting for players...</h2>
            <div className="mb-6">
                <h3 className="text-lg font-semibold mb-2">Players ({players.length}):</h3>
                <div className="flex flex-wrap gap-2 justify-center">
                    {players.map(p => (
                        <span key={p.socketId} className="bg-gray-200 px-3 py-1 rounded-full text-sm">
                            {p.username}
                        </span>
                    ))}
                </div>
            </div>

            {isHost ? (
                <button
                    onClick={startGame}
                    disabled={players.length < 2}
                    className={`w-full max-w-xs font-bold py-3 px-6 rounded text-white transition ${players.length < 2 ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}`}
                >
                    {players.length < 2 ? 'Need 2 Players' : 'Start Game'}
                </button>
            ) : (
                <p className="text-gray-500 italic">Waiting for host to start...</p>
            )}
        </div>
    );

    const renderLoading = () => (
        <div className="flex flex-col items-center justify-center h-64">
            <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-orange-600 mb-4"></div>
            <h2 className="text-2xl font-bold text-gray-700">Consulting the Dictionary...</h2>
            <p className="text-gray-500">Finding obscure words.</p>
        </div>
    );

    const renderInputPhase = () => {
        if (myPlayerData?.hasSubmitted) {
            return (
                <div className="text-center p-8 bg-gray-50 rounded-lg w-full max-w-md">
                    <h2 className="text-xl font-bold mb-4 text-green-600">Definition Submitted!</h2>
                    <p className="text-gray-600 animate-pulse">Waiting for others...</p>
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                         {players.map(p => {
                             const pData = gameState.allPlayersData[p.socketId];
                             return (
                                 <div key={p.socketId} className={`w-3 h-3 rounded-full ${pData?.hasSubmitted ? 'bg-green-500' : 'bg-gray-300'}`} title={p.username}></div>
                             );
                         })}
                    </div>
                </div>
            );
        }

        return (
            <div className="w-full max-w-md bg-white p-6 rounded-lg shadow-md">
                <div className="mb-6 text-center">
                    <span className="text-gray-500 uppercase text-xs font-bold tracking-widest">Define this word</span>
                    <h2 className="text-4xl font-black text-indigo-900 mt-2">{gameState.currentWord}</h2>
                </div>
                
                <textarea
                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-orange-500 mb-4"
                    rows="3"
                    placeholder="Write a fake definition..."
                    value={myDefinition}
                    onChange={(e) => setMyDefinition(e.target.value)}
                ></textarea>
                <button
                    onClick={submitDefinition}
                    className="w-full bg-orange-600 text-white font-bold py-3 rounded hover:bg-orange-700 transition"
                >
                    Submit Definition
                </button>
            </div>
        );
    };

    const renderVotingPhase = () => {
        const hasVoted = myPlayerData?.vote === 'VOTED';

        if (hasVoted) {
             return (
                <div className="text-center p-8 bg-gray-50 rounded-lg w-full max-w-md">
                    <h2 className="text-xl font-bold mb-4 text-green-600">Vote Cast!</h2>
                    <p className="text-gray-600">Waiting for results...</p>
                </div>
            );
        }

        return (
            <div className="w-full max-w-md">
                <div className="text-center mb-6">
                     <h2 className="text-3xl font-bold text-indigo-900">{gameState.currentWord}</h2>
                     <p className="text-gray-600">Which is the REAL definition?</p>
                </div>
                
                <div className="space-y-3">
                    {gameState.definitions.map((def, idx) => {
                        const isMine = def.id === myPlayerId;
                        return (
                            <button
                                key={idx}
                                onClick={() => !isMine && voteFor(idx)}
                                disabled={isMine}
                                className={`w-full text-left p-4 rounded-lg border-2 transition-all shadow-sm ${
                                    isMine 
                                    ? 'bg-gray-100 border-gray-300 opacity-70 cursor-default' 
                                    : 'bg-white border-gray-200 hover:border-orange-500 hover:shadow-md'
                                }`}
                            >
                                <span className="text-lg text-gray-800">{def.text}</span>
                                {isMine && <span className="block text-xs text-gray-500 font-bold mt-1 uppercase">(Your Definition)</span>}
                            </button>
                        );
                    })}
                </div>
            </div>
        );
    };

    const renderRoundOver = () => {
        const definitions = gameState.definitions;
        
        return (
            <div className="w-full max-w-2xl bg-white p-6 rounded-lg shadow-lg">
                <div className="text-center mb-8">
                    <h2 className="text-4xl font-black text-indigo-900 mb-2">{gameState.currentWord}</h2>
                    <div className="inline-block bg-green-100 text-green-800 px-4 py-2 rounded-full font-bold text-lg border border-green-200">
                        {gameState.realDefinition}
                    </div>
                </div>

                <div className="space-y-4">
                    {definitions.map((def, idx) => {
                        const isReal = def.id === 'AI';
                        const authorName = isReal ? "REAL DEFINITION" : players.find(p => p.socketId === def.id)?.username || "Unknown";
                        
                        // Who voted for this?
                        const voters = players.filter(p => gameState.allPlayersData[p.socketId]?.vote === def.id);

                        return (
                            <div key={idx} className={`p-4 rounded-lg border-2 ${isReal ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-100'}`}>
                                <div className="flex justify-between items-start mb-2">
                                    <span className={`text-xs font-bold uppercase tracking-wide ${isReal ? 'text-green-700' : 'text-gray-500'}`}>
                                        {authorName}
                                    </span>
                                </div>
                                <p className="text-lg font-medium text-gray-800 mb-3">"{def.text}"</p>
                                
                                {voters.length > 0 && (
                                    <div className="flex gap-2 flex-wrap">
                                        {voters.map(v => (
                                            <span key={v.socketId} className="bg-indigo-100 text-indigo-800 text-xs px-2 py-1 rounded-full flex items-center">
                                                <span className="mr-1">🗳️</span> {v.username}
                                                {isReal ? <span className="ml-1 font-bold text-green-600">+2</span> : <span className="ml-1 font-bold text-orange-600">+0</span>}
                                            </span>
                                        ))}
                                        {!isReal && (
                                            <span className="bg-orange-100 text-orange-800 text-xs px-2 py-1 rounded-full font-bold">
                                                Author +{voters.length}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {isHost && (
                    <div className="mt-8 text-center">
                        <button
                            onClick={nextRound}
                            className="bg-indigo-600 text-white font-bold py-3 px-8 rounded hover:bg-indigo-700 transition shadow-lg"
                        >
                            Next Round
                        </button>
                    </div>
                )}
            </div>
        );
    };

    const renderGameOver = () => {
         const sortedPlayers = [...players].sort((a, b) => {
            const scoreA = gameState.allPlayersData[a.socketId]?.score || 0;
            const scoreB = gameState.allPlayersData[b.socketId]?.score || 0;
            return scoreB - scoreA;
        });

        return (
            <div className="text-center w-full max-w-md bg-white p-8 rounded-lg shadow-lg">
                <h1 className="text-4xl font-black text-indigo-700 mb-6">Game Over!</h1>
                <div className="space-y-4 mb-8">
                    {sortedPlayers.map((p, index) => {
                        const score = gameState.allPlayersData[p.socketId]?.score || 0;
                        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '';
                        
                        return (
                            <div key={p.socketId} className={`flex justify-between items-center p-3 rounded-lg ${index === 0 ? 'bg-indigo-100 border-2 border-indigo-200' : 'bg-gray-50'}`}>
                                <div className="flex items-center">
                                    <span className="text-2xl mr-3">{medal}</span>
                                    <span className={`font-bold text-lg ${index === 0 ? 'text-indigo-900' : 'text-gray-700'}`}>
                                        {p.username}
                                    </span>
                                </div>
                                <span className="font-bold text-xl text-gray-800">{score} pts</span>
                            </div>
                        );
                    })}
                </div>
                {isHost && (
                    <button
                        onClick={startGame}
                        className="w-full bg-green-600 text-white font-bold py-3 px-6 rounded hover:bg-green-700 transition"
                    >
                        Play Again
                    </button>
                )}
            </div>
        );
    };

    return (
        <div className="flex flex-col items-center w-full max-w-2xl mx-auto">
             {/* Header / Scoreboard Mini */}
            {gameState.state !== 'GAME_OVER' && (
                <div className="flex justify-between w-full mb-4 px-2">
                   <div className="text-sm font-bold text-gray-500">
                        Round {gameState.currentRoundNumber || 0}
                   </div>
                   <div className="flex gap-2 flex-wrap justify-end">
                       {players.map(p => (
                           <div key={p.socketId} className="flex items-center gap-1 bg-white px-2 py-1 rounded shadow-sm border border-gray-100">
                               <span className="text-xs text-gray-600 font-medium truncate max-w-[60px]">{p.username}</span>
                               <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-800">
                                   {gameState.allPlayersData?.[p.socketId]?.score || 0}
                               </div>
                           </div>
                       ))}
                   </div>
                </div>
            )}

            {gameState.state === 'LOBBY' && renderLobby()}
            {gameState.state === 'LOADING' && renderLoading()}
            {gameState.state === 'INPUT' && renderInputPhase()}
            {gameState.state === 'VOTING' && renderVotingPhase()}
            {gameState.state === 'ROUND_OVER' && renderRoundOver()}
            {gameState.state === 'GAME_OVER' && renderGameOver()}
        </div>
    );
};

export default Balderdash;
