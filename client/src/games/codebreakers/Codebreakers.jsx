import { useState, useEffect } from 'react';

// --- SUB COMPONENTS ---

const Lobby = ({ gameState, currentUser, isHost, sendAction, config, setConfig }) => (
    <div className="text-center py-8">
        <h2 className="text-3xl font-bold mb-6 text-indigo-700">Mission Briefing</h2>
        
        <div className="flex flex-col md:flex-row gap-8 justify-center mb-8">
            {/* Red Team */}
            <div className="flex-1 bg-red-100 p-4 rounded-lg border-2 border-red-300">
                <h3 className="text-xl font-bold text-red-700 mb-4">RED TEAM</h3>
                <button onClick={() => sendAction('SWITCH_TEAM')} className="mb-4 text-sm bg-white border border-red-300 px-3 py-1 rounded hover:bg-red-50">Join Team</button>
                <div className="space-y-2">
                    {Object.values(gameState.players).filter(p => p.team === 'RED').map(p => (
                        <div key={p.username} className="flex justify-between items-center bg-white p-2 rounded shadow-sm">
                            <span>{p.username}</span>
                            {p.role === 'SPYMASTER' ? (
                                <span className="text-xs font-bold bg-black text-white px-2 py-1 rounded">SPYMASTER</span>
                            ) : (
                                isHost || p.username === currentUser.username ? (
                                    <button onClick={() => sendAction('BECOME_SPY')} className="text-xs text-blue-600 underline">Become Spy</button>
                                ) : <span className="text-xs text-gray-500">Operative</span>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Blue Team */}
            <div className="flex-1 bg-blue-100 p-4 rounded-lg border-2 border-blue-300">
                <h3 className="text-xl font-bold text-blue-700 mb-4">BLUE TEAM</h3>
                <button onClick={() => sendAction('SWITCH_TEAM')} className="mb-4 text-sm bg-white border border-blue-300 px-3 py-1 rounded hover:bg-blue-50">Join Team</button>
                <div className="space-y-2">
                    {Object.values(gameState.players).filter(p => p.team === 'BLUE').map(p => (
                        <div key={p.username} className="flex justify-between items-center bg-white p-2 rounded shadow-sm">
                            <span>{p.username}</span>
                            {p.role === 'SPYMASTER' ? (
                                <span className="text-xs font-bold bg-black text-white px-2 py-1 rounded">SPYMASTER</span>
                            ) : (
                                isHost || p.username === currentUser.username ? (
                                    <button onClick={() => sendAction('BECOME_SPY')} className="text-xs text-blue-600 underline">Become Spy</button>
                                ) : <span className="text-xs text-gray-500">Operative</span>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>

        {isHost ? (
            <div className="max-w-md mx-auto bg-gray-50 p-4 rounded shadow">
                <label className="block text-sm font-bold mb-2">Secret Word Category</label>
                <input 
                    type="text" 
                    value={config.category} 
                    onChange={(e) => setConfig({ category: e.target.value })}
                    className="w-full p-2 border rounded mb-4"
                    placeholder="e.g. Movies, Nature, Random"
                />
                <button 
                    onClick={() => sendAction('START_GAME', { config })}
                    className="w-full bg-green-600 text-white font-bold py-3 rounded hover:bg-green-700 transition"
                >
                    START MISSION
                </button>
            </div>
        ) : (
            <p className="animate-pulse text-gray-500">Waiting for Host to deploy...</p>
        )}
    </div>
);

const GameBoard = ({ gameState, myRole, canAct, sendAction }) => {
    if (!gameState.words || gameState.words.length === 0) return <div className="text-center p-4">Loading Grid...</div>;

    return (
        <div className="grid grid-cols-5 gap-2 md:gap-4 mb-8">
            {gameState.words.map((card, i) => {
                let bgColor = 'bg-yellow-100'; 
                let textColor = 'text-gray-800';
                let borderColor = 'border-gray-300';
                
                const isRevealed = card.revealed;
                const isSpy = myRole === 'SPYMASTER';
                
                if (isRevealed || isSpy) {
                    if (card.type === 'RED') { bgColor = 'bg-red-500'; textColor = 'text-white'; borderColor = 'border-red-700'; }
                    else if (card.type === 'BLUE') { bgColor = 'bg-blue-500'; textColor = 'text-white'; borderColor = 'border-blue-700'; }
                    else if (card.type === 'ASSASSIN') { bgColor = 'bg-gray-900'; textColor = 'text-white'; borderColor = 'border-black'; }
                    else { bgColor = 'bg-orange-200'; textColor = 'text-gray-700'; borderColor = 'border-orange-300'; } 
                }

                const opacity = isRevealed ? 'opacity-40 grayscale' : 'opacity-100';
                const isProposed = gameState.proposedGuess && gameState.proposedGuess.index === i;
                
                return (
                    <div 
                        key={i}
                        onClick={() => !isSpy && canAct && !isRevealed ? sendAction('PROPOSE_GUESS', { index: i }) : null}
                        className={`
                            relative aspect-square md:aspect-video flex items-center justify-center p-1 md:p-2 rounded shadow-md border-b-4 
                            cursor-pointer select-none transition-all duration-150
                            ${bgColor} ${borderColor} ${opacity}
                            ${!isSpy && canAct && !isRevealed ? 'hover:-translate-y-1 hover:shadow-lg' : ''}
                            ${isProposed ? 'ring-4 ring-yellow-400 scale-105 z-10' : ''}
                        `}
                    >
                        <span className={`font-bold text-xs md:text-sm lg:text-lg uppercase text-center break-words leading-tight ${textColor}`}>
                            {card.word}
                        </span>
                        
                        {isProposed && (
                            <div className="absolute -top-3 -right-3 bg-yellow-400 text-black text-[10px] font-bold px-2 py-1 rounded-full shadow border border-yellow-600 animate-bounce">
                                {gameState.proposedGuess.proposer}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

const StatusPanel = ({ gameState }) => {
    const turnColor = gameState.turn.startsWith('RED') ? 'text-red-600' : 'text-blue-600';
    const turnText = gameState.turn.includes('SPY') ? "Spymaster is thinking..." : "Operatives are guessing...";
    
    return (
        <div className="bg-white p-4 rounded-lg shadow-lg border-t-4 border-indigo-500 mb-6 flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-6 text-2xl font-black">
                <div className="text-red-600 flex flex-col items-center">
                    <span className="text-sm text-gray-500 font-normal">RED</span>
                    {gameState.scores.RED}
                </div>
                <div className="text-gray-300 text-4xl font-thin">vs</div>
                <div className="text-blue-600 flex flex-col items-center">
                    <span className="text-sm text-gray-500 font-normal">BLUE</span>
                    {gameState.scores.BLUE}
                </div>
            </div>

            <div className="text-center">
                <h3 className={`text-xl font-bold ${turnColor} uppercase tracking-widest`}>
                    {gameState.turn.replace('_', ' ')}
                </h3>
                <p className="text-sm text-gray-500">{turnText}</p>
            </div>

            {gameState.currentClue && gameState.currentClue.word ? (
                <div className="bg-gray-100 px-6 py-2 rounded-lg border border-gray-200 text-center min-w-[150px]">
                    <span className="block text-xs text-gray-500 uppercase font-bold">Current Clue</span>
                    <span className="text-2xl font-black text-gray-800">
                        {gameState.currentClue.word} <span className="text-indigo-500 text-3xl ml-1">{gameState.currentClue.count}</span>
                    </span>
                </div>
            ) : (
                <div className="bg-gray-50 px-6 py-2 rounded text-gray-400 italic text-sm">
                    Waiting for clue...
                </div>
            )}
        </div>
    );
};

const ActionPanel = ({ canAct, isSpyTurn, isGuessTurn, myRole, sendAction, proposedGuess }) => {
    const [clueInput, setClueInput] = useState('');
    const [countInput, setCountInput] = useState(1);

    if (!canAct) return null;

    if (isSpyTurn && myRole === 'SPYMASTER') {
        return (
            <div className="fixed bottom-0 left-0 w-full bg-white border-t p-4 shadow-xl z-50 flex justify-center gap-2">
                <input 
                    type="text" 
                    placeholder="Clue Word" 
                    className="border p-2 rounded w-40 text-lg font-bold"
                    value={clueInput}
                    onChange={(e) => setClueInput(e.target.value.trim())}
                />
                <input 
                    type="number" 
                    min="0" 
                    max="9" 
                    className="border p-2 rounded w-16 text-lg font-bold text-center"
                    value={countInput}
                    onChange={(e) => setCountInput(e.target.value)}
                />
                <button 
                    onClick={() => {
                        if(clueInput) {
                            sendAction('GIVE_CLUE', { clue: clueInput, count: countInput });
                            setClueInput('');
                        }
                    }}
                    className="bg-black text-white font-bold px-6 py-2 rounded hover:bg-gray-800"
                >
                    TRANSMIT
                </button>
            </div>
        );
    }

    if (isGuessTurn && myRole === 'OPERATIVE') {
        return (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-sm border p-2 rounded-full shadow-2xl z-50 flex gap-4">
                <button 
                    onClick={() => sendAction('CONFIRM_GUESS')}
                    disabled={!proposedGuess}
                    className="bg-green-600 hover:bg-green-700 text-white font-black px-8 py-3 rounded-full shadow disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
                >
                    LOCK IN GUESS
                </button>
                <button 
                    onClick={() => sendAction('END_TURN')}
                    className="bg-gray-500 hover:bg-gray-600 text-white font-bold px-6 py-3 rounded-full shadow transition-all active:scale-95"
                >
                    END TURN
                </button>
            </div>
        );
    }

    return null;
};

const TeamRoster = ({ players, currentTurn }) => {
    const redPlayers = Object.values(players).filter(p => p.team === 'RED');
    const bluePlayers = Object.values(players).filter(p => p.team === 'BLUE');
    
    const activeTeam = currentTurn.startsWith('RED') ? 'RED' : 'BLUE';

    return (
        <div className="grid grid-cols-2 gap-4 mb-6 text-xs md:text-sm">
            <div className={`p-2 rounded border ${activeTeam === 'RED' ? 'bg-red-50 border-red-300 ring-2 ring-red-400' : 'bg-gray-50 border-gray-200'}`}>
                <h4 className="font-bold text-red-700 border-b border-red-200 mb-1 pb-1">RED TEAM</h4>
                {redPlayers.map(p => (
                    <div key={p.username} className="flex justify-between">
                        <span>{p.username}</span>
                        <span className="font-bold text-gray-500">{p.role === 'SPYMASTER' ? '🕵️' : '👤'}</span>
                    </div>
                ))}
            </div>
            <div className={`p-2 rounded border ${activeTeam === 'BLUE' ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-400' : 'bg-gray-50 border-gray-200'}`}>
                <h4 className="font-bold text-blue-700 border-b border-blue-200 mb-1 pb-1">BLUE TEAM</h4>
                {bluePlayers.map(p => (
                    <div key={p.username} className="flex justify-between">
                        <span>{p.username}</span>
                        <span className="font-bold text-gray-500">{p.role === 'SPYMASTER' ? '🕵️' : '👤'}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

// --- MAIN COMPONENT ---

const Codebreakers = ({ socket, roomId, players, initialGameState, currentUser, onLeave }) => {
    const [gameState, setGameState] = useState(() => initialGameState || {});
    const [config, setConfig] = useState({ category: 'Random' });
    const [error, setError] = useState('');

    const isHost = players[0]?.username === currentUser.username;
    
    // Derived state
    const myPlayer = gameState.players ? Object.values(gameState.players).find(p => p.username === currentUser.username) : null;
    const myTeam = myPlayer?.team;
    const myRole = myPlayer?.role;
    
    const isMyTurn = gameState.turn && myTeam && gameState.turn.startsWith(myTeam);
    const isSpyTurn = gameState.turn && gameState.turn.includes('SPY');
    const isGuessTurn = gameState.turn && gameState.turn.includes('GUESS');
    
    const canAct = isMyTurn && ((isSpyTurn && myRole === 'SPYMASTER') || (isGuessTurn && myRole === 'OPERATIVE'));

    // Sync with parent updates
    useEffect(() => {
        if (initialGameState) {
            setGameState(prev => ({ ...prev, ...initialGameState }));
        }
    }, [initialGameState]);

    useEffect(() => {
        socket.on('game_update', (state) => {
            setGameState(state);
            setError('');
        });

        socket.on('error', (err) => {
            setError(err.message);
        });

        return () => {
            socket.off('game_update');
            socket.off('error');
        };
    }, [socket]);

    const sendAction = (type, payload = {}) => {
        socket.emit('make_move', {
            roomId,
            moveData: { type, ...payload }
        });
    };

    if (!gameState.state) return <div className="p-10 text-center">Connecting to HQ...</div>;

    if (gameState.state === 'LOBBY') return <Lobby gameState={gameState} currentUser={currentUser} isHost={isHost} sendAction={sendAction} config={config} setConfig={setConfig} />;

    if (gameState.state === 'LOADING') {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4 font-mono">
                <div className="w-16 h-16 border-4 border-t-indigo-500 border-gray-700 rounded-full animate-spin mb-6"></div>
                <h2 className="text-3xl font-black text-indigo-500 mb-2 animate-pulse">INTERCEPTING SIGNAL</h2>
                <p className="text-gray-400 tracking-widest text-sm">DECRYPTING ENEMY CODES...</p>
                <div className="mt-8 flex gap-2">
                    <span className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></span>
                    <span className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
                    <span className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></span>
                </div>
            </div>
        );
    }

    if (gameState.state === 'GAME_OVER') {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4">
                <h1 className={`text-6xl font-black mb-4 ${gameState.winner === 'RED' ? 'text-red-500' : 'text-blue-500'}`}>
                    {gameState.winner} WINS!
                </h1>
                <p className="text-2xl text-gray-300 mb-8">{gameState.winReason}</p>
                <div className="w-full max-w-4xl opacity-50 pointer-events-none mb-8">
                    <GameBoard gameState={gameState} myRole={myRole} canAct={false} sendAction={sendAction} />
                </div>
                <button onClick={onLeave} className="bg-white text-black font-bold px-8 py-3 rounded-full hover:bg-gray-200">Back to Base</button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 pb-32">
            <div className="max-w-6xl mx-auto p-2 md:p-4">
                <div className="flex justify-between items-center mb-4">
                    <h1 className="text-xl md:text-2xl font-black text-gray-800 italic">CODE<span className="text-indigo-600">BREAKERS</span></h1>
                    <div className="text-xs md:text-sm font-bold bg-white px-3 py-1 rounded border">
                        You are: <span className={myRole === 'SPYMASTER' ? 'text-purple-600' : 'text-gray-600'}>{myRole}</span>
                        <span className={`ml-2 px-2 rounded text-white ${myTeam === 'RED' ? 'bg-red-500' : 'bg-blue-500'}`}>{myTeam}</span>
                    </div>
                </div>

                <StatusPanel gameState={gameState} />
                <TeamRoster players={gameState.players} currentTurn={gameState.turn} />
                
                {error && <div className="bg-red-100 text-red-700 p-2 rounded mb-4 text-center">{error}</div>}
                
                <GameBoard gameState={gameState} myRole={myRole} canAct={canAct} sendAction={sendAction} />
                
                <ActionPanel 
                    canAct={canAct} 
                    isSpyTurn={isSpyTurn} 
                    isGuessTurn={isGuessTurn} 
                    myRole={myRole} 
                    sendAction={sendAction} 
                    proposedGuess={gameState.proposedGuess} 
                />
            </div>
        </div>
    );
};

export default Codebreakers;