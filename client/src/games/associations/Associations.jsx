import { useState, useEffect } from 'react';

const Associations = ({ socket, roomId, players, hostId, initialGameState, currentUser, onLeave }) => {
    const [state, setState] = useState(initialGameState);
    const [inputs, setInputs] = useState(['', '', '', '', '']);
    const [timeLeft, setTimeLeft] = useState(initialGameState?.timeLeft || 0);
    const [hint, setHint] = useState('');
    const [hintLoading, setHintLoading] = useState(false);

    const isHost = socket.id === hostId;

    const [roundNotification, setRoundNotification] = useState('');

    useEffect(() => {
        setHint(''); // Clear hint on new word/state
    }, [state.currentWord]);

    const getHint = async () => {
        if (!state.currentWord) return;
        setHintLoading(true);
        try {
            const apiUrl = import.meta.env.VITE_API_URL || '/api';
            
            const res = await fetch(`${apiUrl}/hint`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    word: state.currentWord.text, 
                    category: state.currentWord.category 
                })
            });
            const data = await res.json();
            if (data.hint) {
                setHint(data.hint);
            }
        } catch (err) {
            console.error("Hint error:", err);
        } finally {
            setHintLoading(false);
        }
    };

    useEffect(() => {
        setState(initialGameState);
        
        socket.on('game_update', (newState) => {
            setState(newState);
            if (newState.timeLeft !== undefined) {
                setTimeLeft(newState.timeLeft);
            }
        });

        socket.on('associations:timer_tick', (time) => {
            setTimeLeft(time);
        });

        socket.on('associations:round_change', ({ newRound }) => {
            setRoundNotification(`ROUND ${newRound} STARTED!`);
            setTimeout(() => setRoundNotification(''), 3000);
        });

        return () => {
            socket.off('game_update');
            socket.off('associations:timer_tick');
            socket.off('associations:round_change');
        };
    }, [initialGameState, socket]);

    const sendMove = (type, data = {}) => {
        socket.emit('make_move', {
            roomId,
            moveData: { type, ...data }
        });
    };

    const handleInputChange = (index, value) => {
        const newInputs = [...inputs];
        newInputs[index] = value;
        setInputs(newInputs);
    };

    const handleSubmitWords = (e) => {
        e.preventDefault();
        const words = inputs.filter(w => w.trim().length > 0);
        if (words.length !== 5) return alert("Please fill all 5 words");
        
        const wordsObjects = [
            { text: words[0], category: 'Person', author: currentUser.username },
            { text: words[1], category: 'Animal', author: currentUser.username },
            { text: words[2], category: 'Plant', author: currentUser.username },
            { text: words[3], category: 'Brand', author: currentUser.username },
            { text: words[4], category: 'Object', author: currentUser.username },
        ];
        
        sendMove('SUBMIT_WORDS', { words: wordsObjects });
    };

    // --- Render Logic ---

    // 1. GAME OVER
    if (state.state === 'GAME_OVER') {
        return (
             <div className="text-center mt-10">
                <h1 className="text-4xl font-bold mb-8">Game Over!</h1>
                <div className="text-2xl mb-4">
                     {state.scores.map((score, i) => (
                       <div key={i} className="mb-2">Team {i + 1}: {score} points</div>
                   ))}
                </div>
                <button 
                    onClick={onLeave}
                    className="bg-gray-800 text-white font-bold py-2 px-6 rounded"
                >
                    Back to Lobby
                </button>
             </div>
        );
    }

    // 2. ROUND OVER
    if (state.state === 'ROUND_OVER') {
        return (
             <div className="text-center mt-10">
                <h1 className="text-3xl font-bold mb-4">Round {state.currentRound} Over!</h1>
                <p className="mb-6 text-gray-600">Prepare for the next round.</p>
                {isHost && (
                    <button 
                        onClick={() => sendMove('NEXT_ROUND')}
                        className="bg-indigo-600 text-white font-bold py-2 px-6 rounded"
                    >
                        Start Round {state.currentRound + 1}
                    </button>
                )}
                {!isHost && <p className="text-indigo-500">Waiting for host to start next round...</p>}
             </div>
        );
    }

    // 3. PLAYING
    if (state.state === 'PLAYING') {
        const isMyTurn = state.currentPlayerId === socket.id;
        const currentTeam = state.turnTeamIndex;
        // Safety check for teams
        const myTeamIndex = state.teams?.findIndex(t => t.includes(socket.id)) ?? -1;
        
        // Find current player name safely
        const currentPlayerName = players?.find(p => p.socketId === state.currentPlayerId)?.username || 'Unknown';

        return (
            <div className="max-w-4xl mx-auto text-center relative">
                {roundNotification && (
                    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-yellow-400 text-black font-black text-4xl px-8 py-4 rounded-xl shadow-2xl z-50 animate-bounce">
                        {roundNotification}
                    </div>
                )}

                <div className="flex justify-between items-start mb-6 bg-white p-4 rounded shadow">
                   {state.scores?.map((score, i) => (
                       <div key={i} className={`flex-1 ${currentTeam === i ? 'border-b-4 border-indigo-600 pb-2' : 'opacity-70'}`}>
                           <div className={`text-2xl ${currentTeam === i ? 'font-bold text-indigo-600' : 'text-gray-500'}`}>
                               Team {i + 1}: {score}
                           </div>
                           <div className="text-sm mt-2 text-gray-500">
                               {state.teams && state.teams[i]?.map(sid => {
                                   const p = players?.find(player => player.socketId === sid);
                                   const isDisconnected = p && p.connected === false;
                                   return <div key={sid} className={`${sid === state.currentPlayerId ? 'font-bold text-black' : ''} ${isDisconnected ? 'text-gray-400 italic' : ''}`}>
                                       {p?.username || 'Unknown'} 
                                       {sid === state.currentPlayerId && '🎤'}
                                       {isDisconnected && ' (offline)'}
                                   </div>
                               })}
                           </div>
                       </div>
                   ))}
                   <div className="ml-4 text-3xl font-mono font-bold bg-gray-100 px-6 py-3 rounded-lg border-2 border-gray-300">
                       {timeLeft}s
                   </div>
                </div>

                <div className="bg-indigo-50 p-8 rounded-xl shadow-inner mb-6 min-h-[200px] flex flex-col justify-center">
                    <h3 className="text-gray-500 uppercase tracking-widest text-sm mb-2">Current Round: {state.currentRound}</h3>
                    
                    {/* Status Text Logic */}
                    <h2 className="text-3xl font-bold mb-4 text-gray-800">
                        {state.turnActive 
                            ? (isMyTurn 
                                ? "Your Turn! Describe the word!" 
                                : (currentTeam === myTeamIndex 
                                    ? `Guess the word! ${currentPlayerName} is describing.` 
                                    : `Wait. ${currentPlayerName} is describing to Team ${(currentTeam || 0) + 1}.`)
                              )
                            : "Waiting for start..."}
                    </h2>
                    
                    {state.turnActive && isMyTurn && state.currentWord && (
                        <div className="bg-white border-2 border-indigo-200 p-6 rounded-lg mb-6 shadow-xl transform scale-105">
                            <p className="text-5xl font-black text-gray-900">{state.currentWord.text}</p>
                            <p className="text-lg text-indigo-500 mt-2 font-semibold">{state.currentWord.category}</p>
                        </div>
                    )}
                </div>

                {isMyTurn && (
                    <div className="space-y-4">
                        {!state.turnActive ? (
                            <button 
                                onClick={() => sendMove('START_TURN')}
                                className="w-full bg-green-500 hover:bg-green-600 text-white text-xl font-bold py-4 rounded-lg shadow-lg transition"
                            >
                                Start My Turn
                            </button>
                        ) : (
                            <div className="flex flex-col gap-4">
                                <div className="flex gap-4 justify-center">
                                    <button 
                                        onClick={() => sendMove('GUESS_WORD')}
                                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-lg shadow-lg"
                                    >
                                        Got It! (+1)
                                    </button>
                                    <button 
                                        onClick={() => sendMove('SKIP_WORD')}
                                        className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-4 rounded-lg shadow-lg"
                                    >
                                        Skip
                                    </button>
                                </div>
                                
                                <button 
                                    onClick={getHint}
                                    disabled={hintLoading || hint}
                                    className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg shadow disabled:opacity-50"
                                >
                                    {hintLoading ? 'Generating Hint...' : 'Get AI Hint (Bulgarian)'}
                                </button>
                                {hint && (
                                    <div className="bg-purple-100 border border-purple-300 text-purple-800 p-3 rounded mt-2 text-sm text-left">
                                        <strong>Hint:</strong> {hint}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    }

    // 4. PRE-GAME (INPUTS & TEAM SETUP)
    // Check if we should show Team Phase (when everyone has submitted)
    const allSubmitted = Object.values(state.players).length > 0 && Object.values(state.players).every(p => p.wordsSubmitted);

    if (allSubmitted) {
        // --- TEAM PHASE ---
        return (
            <div className="w-full">
                <h2 className="text-2xl font-bold text-center mb-6">Setup Teams</h2>
                
                {isHost && (
                    <div className="flex justify-center gap-4 mb-6">
                         <button onClick={() => sendMove('SET_TEAMS_COUNT', { count: 2 })} className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded shadow">2 Teams</button>
                         <button onClick={() => sendMove('SET_TEAMS_COUNT', { count: 3 })} className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded shadow">3 Teams</button>
                         <button onClick={() => sendMove('SET_TEAMS_COUNT', { count: 4 })} className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded shadow">4 Teams</button>
                    </div>
                )}

                <div className="flex flex-wrap gap-4 justify-center pb-4">
                    {state.teams.map((team, teamIdx) => (
                        <div key={teamIdx} className="bg-white p-4 rounded shadow w-64">
                            <h3 className="font-bold text-lg mb-2 text-center border-b pb-2">Team {teamIdx + 1}</h3>
                            <ul className="space-y-2">
                                {team.map(socketId => {
                                    // Match against 'players' prop which has username
                                    const player = players.find(p => p.socketId === socketId);
                                    const name = player?.username || 'Unknown';
                                    return (
                                        <li key={socketId} className="flex justify-between items-center bg-gray-50 p-2 rounded text-sm">
                                            <span className="truncate w-20" title={name}>{name}</span>
                                            {isHost && (
                                                <div className="flex gap-1">
                                                    {state.teams.map((_, targetIdx) => (
                                                        targetIdx !== teamIdx && (
                                                            <button 
                                                                key={targetIdx}
                                                                onClick={() => sendMove('MOVE_PLAYER', { socketId, targetTeam: targetIdx })}
                                                                className="text-xs bg-gray-200 hover:bg-gray-300 px-2 py-1 rounded"
                                                            >
                                                                {targetIdx + 1}
                                                            </button>
                                                        )
                                                    ))}
                                                </div>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    ))}
                </div>
                
                {isHost ? (
                    <div className="text-center mt-8">
                        <button 
                            onClick={() => sendMove('START_GAME')}
                            className="bg-green-600 text-white font-bold py-3 px-8 rounded-lg shadow-lg hover:bg-green-700 text-xl"
                        >
                            Start Game
                        </button>
                    </div>
                ) : (
                    <div className="text-center mt-8 text-gray-500">
                        Waiting for host to start game...
                    </div>
                )}
            </div>
        );
    }

    // --- INPUT PHASE ---
    const myPlayer = state.players[socket.id];
    const submitted = myPlayer?.wordsSubmitted;

    if (submitted) {
        const waitingCount = Object.values(state.players).filter(p => !p.wordsSubmitted).length;
        return (
            <div className="text-center mt-20">
                <h2 className="text-3xl font-bold text-green-600 mb-4">Words Submitted!</h2>
                <div className="animate-pulse text-xl text-gray-600">
                    Waiting for {waitingCount} other player(s)...
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-md mx-auto">
            <h2 className="text-2xl font-bold mb-6 text-center">Enter 5 Words</h2>
            <form onSubmit={handleSubmitWords} className="space-y-4">
                <input className="w-full border p-3 rounded shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="Famous Person" value={inputs[0]} onChange={e => handleInputChange(0, e.target.value)} />
                <input className="w-full border p-3 rounded shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="Animal" value={inputs[1]} onChange={e => handleInputChange(1, e.target.value)} />
                <input className="w-full border p-3 rounded shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="Plant" value={inputs[2]} onChange={e => handleInputChange(2, e.target.value)} />
                <input className="w-full border p-3 rounded shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="Brand" value={inputs[3]} onChange={e => handleInputChange(3, e.target.value)} />
                <input className="w-full border p-3 rounded shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="Object" value={inputs[4]} onChange={e => handleInputChange(4, e.target.value)} />
                <button type="submit" className="w-full bg-indigo-600 text-white font-bold py-3 rounded hover:bg-indigo-700 transition shadow-lg">Submit Words</button>
            </form>
        </div>
    );
};

export default Associations;
