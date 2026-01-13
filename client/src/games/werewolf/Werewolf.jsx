import { useState, useEffect } from 'react';

// --- SUB COMPONENTS ---

const RoleCard = ({ myRole, showRole, setShowRole }) => (
    <div 
        className="mb-4 p-4 bg-gray-900 text-white rounded select-none touch-none cursor-pointer active:scale-95 transition-transform border-2 border-gray-700 shadow-inner"
        onPointerDown={() => setShowRole(true)}
        onPointerUp={() => setShowRole(false)}
        onPointerLeave={() => setShowRole(false)}
    >
        <h3 className="text-xl font-bold text-center text-red-500">HOLD TO REVEAL ROLE</h3>
        {showRole && myRole && (
            <div className="mt-4 border-t border-gray-700 pt-4 text-center">
                <p className="text-3xl font-black uppercase tracking-wider">{myRole.role}</p>
                {myRole.linkedTo && (
                    <p className="text-pink-400 font-bold mt-2">❤️ Lover: {myRole.linkedTo}</p>
                )}
                {myRole.otherWolves && myRole.otherWolves.length > 0 && (
                    <div className="mt-2 text-red-400">
                        <p className="font-bold">Pack Members:</p>
                        {myRole.otherWolves.join(', ')}
                    </div>
                )}
            </div>
        )}
    </div>
);

const PlayerList = ({ gameState, currentUser, onAction, actionLabel, filter, selectedId, packVotes }) => (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mt-4">
        {gameState.players?.map(p => {
            if (filter && !filter(p)) return null;
            const isMe = p.username === currentUser.username;
            const isDead = !p.alive;
            const isSelected = selectedId === p.socketId;
            const packFollowers = packVotes ? Object.entries(packVotes).filter(([name, tid]) => tid === p.socketId).map(([name]) => name) : [];

            // Disable interaction if dead, or if nominating self (in nomination phase)
            // Healer can self-protect (night), but nomination is strictly other-player
            const isSelfNomination = gameState.phase === 'DAY_NOMINATION' && isMe;
            const canInteract = !isDead && !isSelfNomination;

            return (
                <div key={p.username} className={`p-3 border rounded relative flex flex-col items-center transition-all duration-200
                    ${isDead ? 'bg-gray-800 border-gray-700 opacity-60' : isSelected ? 'bg-indigo-900 border-indigo-400 scale-105 shadow-lg' : 'bg-gray-800 border-gray-600'}
                    ${gameState.nominee === p.username ? 'ring-4 ring-yellow-500' : ''}
                `}>
                    <div className={`font-bold truncate ${isDead ? 'text-red-500 line-through' : isSelected ? 'text-white' : 'text-gray-200'}`}>
                        {p.username} {isMe && "(You)"}
                    </div>
                    
                    {p.isNominee && <span className="bg-yellow-600 text-white text-[10px] font-bold px-2 py-0.5 rounded mt-1">NOMINEE</span>}
                    
                    {onAction && canInteract && (
                        <button
                            onClick={() => onAction(p)}
                            className={`mt-2 w-full text-xs font-bold py-1.5 px-2 rounded transition-colors
                                ${isSelected ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}
                            `}
                        >
                            {isSelected ? 'Cancel' : (actionLabel || 'Select')}
                        </button>
                    )}

                    {packFollowers.length > 0 && (
                        <div className="mt-2 flex flex-wrap justify-center gap-1">
                            {packFollowers.map(name => (
                                <span key={name} title={`${name} voted here`} className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                            ))}
                        </div>
                    )}

                    {gameState.phase === 'DAY_NOMINATION' && p.voted && !isDead && (
                         <div className="absolute top-1 right-1 text-green-400 text-[10px] font-black">VOTED</div>
                    )}
                </div>
            );
        })}
    </div>
);

const Timer = ({ endTime }) => {
    const [timeLeft, setTimeLeft] = useState(0);

    useEffect(() => {
        if (!endTime) return;
        const tick = () => {
            const diff = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
            setTimeLeft(diff);
        };
        tick();
        const interval = setInterval(tick, 1000);
        return () => clearInterval(interval);
    }, [endTime]);

    if (!endTime || timeLeft <= 0) return null;
    return (
        <div className="text-xl font-mono font-bold text-yellow-400 mb-4 bg-gray-900 border border-yellow-900 px-4 py-2 rounded-full inline-flex items-center gap-2 shadow-lg">
            <span className="animate-pulse">⏱️</span> {timeLeft}s
        </div>
    );
};

const CupidAction = ({ gameState, sendAction }) => {
    const [selected, setSelected] = useState([]);
    const toggle = (p) => {
        if (selected.includes(p.socketId)) setSelected(selected.filter(id => id !== p.socketId));
        else if (selected.length < 2) setSelected([...selected, p.socketId]);
    };
    
    return (
        <div className="text-center">
            <h2 className="text-2xl text-pink-400 font-bold mb-2">Cupid's Choice</h2>
            <p className="mb-4 text-gray-300">Select 2 players to fall in love.</p>
            <div className="grid grid-cols-2 gap-2">
                {gameState.players.filter(p => p.alive).map(p => (
                    <button
                        key={p.socketId}
                        onClick={() => toggle(p)}
                        className={`p-2 border rounded font-bold transition-all ${selected.includes(p.socketId) ? 'bg-pink-600 border-pink-400 scale-105 shadow-md' : 'bg-gray-700 border-gray-600 hover:bg-gray-600'}`}
                    >
                        {p.username}
                    </button>
                ))}
            </div>
            <button 
                disabled={selected.length !== 2}
                onClick={() => sendAction('CUPID_LINK', { targets: selected })}
                className="mt-6 bg-pink-500 hover:bg-pink-400 text-white px-8 py-3 rounded-full font-black uppercase tracking-widest shadow-xl disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
                Connect Souls
            </button>
        </div>
    );
};

const NightPhase = ({ gameState, myRole, sendAction, currentUser, witchInfo, wolfVotes }) => {
    const role = myRole?.role;
    
    // Track local selections for UI feedback (will be overwritten by server state on next update)
    const [localSel, setLocalSel] = useState(null);

    useEffect(() => {
        setLocalSel(null); // Reset when phase changes
    }, [gameState.phase]);

    if (gameState.phase === 'NIGHT_CUPID' && role === 'CUPID') {
        return <CupidAction gameState={gameState} sendAction={sendAction} />;
    }

    if (gameState.phase === 'NIGHT_MAIN') {
        if (role === 'WEREWOLF') {
            const myVote = wolfVotes[currentUser.username];
            return (
                <div className="text-center">
                    <h2 className="text-2xl text-red-600 font-bold mb-2">Werewolf Hunt</h2>
                    <p className="text-sm text-gray-400 mb-4 italic">Reach a unanimous decision to feed.</p>
                    <PlayerList 
                        gameState={gameState} 
                        currentUser={currentUser}
                        filter={p => p.alive}
                        onAction={(p) => sendAction('WEREWOLF_VOTE', { targetId: p.socketId })}
                        actionLabel="Eat"
                        selectedId={myVote}
                        packVotes={wolfVotes}
                    />
                </div>
            );
        }
        if (role === 'SEER') {
            return (
                <div className="text-center">
                    <h2 className="text-2xl text-blue-400 font-bold mb-2">Seer's Vision</h2>
                    <PlayerList 
                        gameState={gameState} 
                        currentUser={currentUser}
                        filter={p => p.alive}
                        onAction={(p) => { setLocalSel(p.socketId); sendAction('SEER_CHECK', { targetId: p.socketId }); }}
                        actionLabel="Inspect"
                        selectedId={localSel}
                    />
                </div>
            );
        }
        if (role === 'HEALER') {
            return (
                <div className="text-center">
                    <h2 className="text-2xl text-green-400 font-bold mb-2">Healer's Protection</h2>
                    <PlayerList 
                        gameState={gameState} 
                        currentUser={currentUser}
                        filter={p => p.alive}
                        onAction={(p) => { setLocalSel(p.socketId); sendAction('HEALER_PROTECT', { targetId: p.socketId }); }}
                        actionLabel="Protect"
                        selectedId={localSel}
                    />
                </div>
            );
        }
        if (role === 'WITCH') {
            return (
                <div className="text-center">
                    <h2 className="text-2xl text-purple-500 font-bold mb-2">Witch's Hut</h2>
                    
                    {witchInfo ? (
                        <div className="mb-4 p-3 bg-purple-900/50 border border-purple-500 rounded-lg">
                            Target: <span className="font-black text-red-400 text-xl">{witchInfo.victim || 'No one'}</span>
                        </div>
                    ) : (
                        <p className="text-gray-400 italic mb-4">Waiting for the wolves to settle...</p>
                    )}

                    <div className="flex justify-center gap-4 mt-4">
                         <button onClick={() => sendAction('WITCH_ACTION', { heal: true })} className="bg-green-600 hover:bg-green-500 px-6 py-2 rounded-full font-bold shadow-lg">Heal Target</button>
                         <button onClick={() => sendAction('SKIP_ACTION')} className="bg-gray-600 hover:bg-gray-500 px-6 py-2 rounded-full font-bold shadow-lg">Skip Turn</button>
                    </div>
                    <p className="mt-6 mb-2 font-bold text-gray-300">Or use Poison:</p>
                    <PlayerList 
                        gameState={gameState} 
                        currentUser={currentUser}
                        filter={p => p.alive}
                        onAction={(p) => { setLocalSel(p.socketId); sendAction('WITCH_ACTION', { poisonId: p.socketId }); }}
                        actionLabel="Poison"
                        selectedId={localSel}
                    />
                </div>
            );
        }
    }

    return (
        <div className="text-center text-gray-400 italic mt-10">
            <h2 className="text-2xl font-bold mb-4">Night Phase</h2>
            <p className="text-xl animate-pulse">The village sleeps...</p>
        </div>
    );
};

const DayPhase = ({ gameState, currentUser, sendAction }) => {
    const [myVote, setMyVote] = useState(null);

    useEffect(() => { setMyVote(null); }, [gameState.phase]);

    if (gameState.phase === 'DAY_REVEAL') {
        const deaths = gameState.recentDeaths || [];
        return (
            <div className="text-center py-8">
                <h2 className="text-3xl font-black text-red-600 mb-6 uppercase tracking-widest">Night Report</h2>
                {deaths.length === 0 ? (
                    <p className="text-2xl text-green-400 font-bold">Peaceful Night. No one died.</p>
                ) : (
                    <div className="space-y-4">
                        {deaths.map((d, i) => (
                            <div key={i} className="bg-gray-800 p-4 rounded-xl border border-gray-600">
                                <span className="text-2xl font-black text-white block">{d.username}</span>
                                <span className="text-lg text-gray-400 font-bold uppercase">{d.team}</span>
                            </div>
                        ))}
                    </div>
                )}
                <div className="mt-8 text-yellow-500 animate-pulse font-bold">Discussion starts soon...</div>
            </div>
        );
    }

    if (gameState.phase === 'DAY_NOMINATION') {
        return (
            <div className="text-center">
                <h2 className="text-2xl font-bold text-gray-200 mb-2">Nomination</h2>
                <p className="text-gray-400 mb-4">Point your finger at a suspect.</p>
                <PlayerList 
                    gameState={gameState} 
                    currentUser={currentUser}
                    filter={p => p.alive}
                    onAction={(p) => { setMyVote(p.socketId); sendAction('NOMINATE_VOTE', { targetId: p.socketId }); }}
                    actionLabel="Nominate"
                    selectedId={myVote}
                />
            </div>
        );
    }

    if (gameState.phase === 'DAY_VOTE') {
        // Nominee cannot vote logic handles by server, but let's hide UI too
        const isNominee = gameState.nominee === currentUser.username;
        
        return (
            <div className="text-center">
                <h2 className="text-2xl font-bold text-red-500 mb-2 uppercase tracking-tighter">Judgement Day</h2>
                <p className="text-xl mb-6">
                    Should <span className="font-black text-white px-2 bg-red-900 rounded">{gameState.nominee}</span> be lynched?
                </p>
                
                {isNominee ? (
                    <div className="p-4 bg-gray-800 text-yellow-500 font-bold rounded">You are on trial. You cannot vote.</div>
                ) : (
                    <div className="flex justify-center gap-8">
                        <button 
                            onClick={() => { setMyVote('YES'); sendAction('LYNCH_VOTE', { vote: 'YES' }); }}
                            className={`w-28 h-28 rounded-full font-black text-xl shadow-2xl transition-all border-4 ${myVote === 'YES' ? 'bg-red-600 border-white scale-110' : 'bg-red-900 border-red-700 hover:bg-red-800'}`}
                        >
                            GUILTY
                        </button>
                        <button 
                            onClick={() => { setMyVote('NO'); sendAction('LYNCH_VOTE', { vote: 'NO' }); }}
                            className={`w-28 h-28 rounded-full font-black text-xl shadow-2xl transition-all border-4 ${myVote === 'NO' ? 'bg-green-600 border-white scale-110' : 'bg-green-900 border-green-700 hover:bg-green-800'}`}
                        >
                            INNOCENT
                        </button>
                    </div>
                )}
                {/* Show status of who voted */}
                <div className="mt-8 grid grid-cols-4 gap-2 text-xs text-gray-500">
                    {gameState.players.filter(p => p.alive && p.username !== gameState.nominee).map(p => (
                        <div key={p.username} className={`p-1 rounded ${p.voted ? 'bg-green-900/50 text-green-400' : 'bg-gray-800'}`}>
                            {p.username}: {p.voted ? 'Done' : '...'}
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (gameState.phase === 'DAY_RESULTS') {
        const res = gameState.voteResult;
        if (!res) return <div>Loading results...</div>;
        
        // Secret Hitler style bars
        const guiltyCount = res.guilty;
        const innocentCount = res.innocent;
        const total = guiltyCount + innocentCount || 1;
        
        return (
            <div className="text-center">
                <h2 className="text-3xl font-black mb-6 uppercase">Vote Results</h2>
                
                <div className="flex h-16 w-full rounded-full overflow-hidden border-4 border-gray-700 mb-4">
                    <div style={{ width: `${(guiltyCount / total) * 100}%` }} className="bg-red-600 flex items-center justify-center font-black text-white text-xl transition-all duration-1000">
                        {guiltyCount > 0 && guiltyCount}
                    </div>
                    <div style={{ width: `${(innocentCount / total) * 100}%` }} className="bg-green-600 flex items-center justify-center font-black text-white text-xl transition-all duration-1000">
                        {innocentCount > 0 && innocentCount}
                    </div>
                </div>
                
                <div className="flex justify-between text-lg font-bold mb-8">
                    <span className="text-red-500">GUILTY</span>
                    <span className="text-green-500">INNOCENT</span>
                </div>

                <div className="text-2xl font-bold text-white mb-4">
                    {res.killed ? (
                        <span><span className="text-red-600">{res.nominee}</span> was executed.</span>
                    ) : (
                        <span><span className="text-green-400">{res.nominee}</span> was spared.</span>
                    )}
                </div>

                <div className="grid grid-cols-2 gap-4 mt-6 text-sm">
                    {Object.entries(res.votes || {}).map(([sid, vote]) => {
                        const pname = gameState.players.find(p=>p.socketId===sid)?.username;
                        return (
                            <div key={sid} className={`p-2 rounded flex justify-between ${vote==='YES'?'bg-red-900/30 text-red-300':'bg-green-900/30 text-green-300'}`}>
                                <span>{pname}</span>
                                <span className="font-bold">{vote==='YES'?'GUILTY':'INNOCENT'}</span>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }
    
    return null;
};

const LobbyPhase = ({ players, isHost, startGame }) => {
    const [config, setConfig] = useState({
        WEREWOLF: 1,
        SEER: true,
        WITCH: true,
        HEALER: true,
        CUPID: true,
        HUNTER: true
    });

    const toggle = (role) => setConfig({ ...config, [role]: !config[role] });
    const setWolves = (n) => setConfig({ ...config, WEREWOLF: Math.max(1, parseInt(n) || 1) });

    return (
        <div className="text-center py-6">
            <div className="inline-block bg-gray-800 px-6 py-2 rounded-full border border-gray-700 mb-8">
                <span className="text-gray-400 font-bold">VILLAGERS:</span> <span className="text-white text-xl font-black">{players.length}</span>
            </div>
            
            {isHost ? (
                <div className="mb-8 p-6 bg-gray-800 rounded-2xl max-w-md mx-auto border-2 border-gray-700 shadow-2xl">
                    <h3 className="text-2xl font-black mb-6 text-gray-100 uppercase tracking-tighter">Village Setup</h3>
                    
                    <div className="mb-6 text-left">
                        <label className="block text-xs font-black text-gray-500 uppercase mb-2 tracking-widest ml-1">Number of Werewolves</label>
                        <input 
                            type="number" 
                            min="1" 
                            max="5" 
                            value={config.WEREWOLF} 
                            onChange={(e) => setWolves(e.target.value)}
                            className="w-full p-3 rounded-xl bg-gray-900 text-white border-2 border-gray-700 focus:outline-none focus:border-red-600 transition-colors font-bold text-lg"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-left">
                        {['SEER', 'WITCH', 'HEALER', 'CUPID', 'HUNTER'].map(role => (
                            <label key={role} className={`flex items-center space-x-3 cursor-pointer p-3 rounded-xl border-2 transition-all ${config[role] ? 'bg-indigo-900/30 border-indigo-500' : 'bg-gray-900/50 border-gray-700 opacity-50 hover:opacity-100'}`}>
                                <input 
                                    type="checkbox" 
                                    checked={config[role]} 
                                    onChange={() => toggle(role)}
                                    className="hidden"
                                />
                                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${config[role] ? 'bg-indigo-500 border-indigo-400' : 'border-gray-600'}`}>
                                    {config[role] && <span className="text-white text-[10px]">✔</span>}
                                </div>
                                <span className="font-bold text-sm tracking-tight capitalize">{role.toLowerCase()}</span>
                            </label>
                        ))}
                    </div>

                    <button 
                        onClick={() => startGame(config)}
                        disabled={players.length < 4}
                        className="mt-8 w-full bg-red-700 hover:bg-red-600 text-white text-xl font-black py-4 rounded-xl shadow-2xl disabled:opacity-20 disabled:cursor-not-allowed transition-all transform active:scale-95 uppercase tracking-widest"
                    >
                        Start the Night
                    </button>
                    {players.length < 4 && <p className="text-xs text-red-500 mt-3 font-bold">Waiting for {4 - players.length} more players...</p>}
                </div>
            ) : (
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-t-red-600 border-gray-800 rounded-full animate-spin"></div>
                    <p className="text-gray-400 font-bold uppercase tracking-widest text-sm">Host is deciding the fate of the village...</p>
                </div>
            )}
        </div>
    );
};

// --- MAIN COMPONENT ---

const Werewolf = ({ socket, roomId, players, initialGameState, currentUser, onLeave }) => {
    const [gameState, setGameState] = useState(() => initialGameState || {});
    const [myRole, setMyRole] = useState(null); 
    const [showRole, setShowRole] = useState(false);
    const [wolfVotes, setWolfVotes] = useState({});
    const [witchInfo, setWitchInfo] = useState(null);
    const [error, setError] = useState('');

    const isHost = players[0]?.username === currentUser.username;

    useEffect(() => {
        socket.on('game_update', (state) => {
            setGameState(state);
            setError('');
        });

        socket.on('werewolf_role', (roleData) => {
            setMyRole(roleData);
        });

        socket.on('werewolf_night_update', (data) => {
            if (data.votes) setWolfVotes(data.votes);
        });

        socket.on('werewolf_seer_result', (res) => {
            alert(`Seer Vision: ${res.username} is ${res.isWerewolf ? 'A WEREWOLF!' : 'Clean.'}`);
        });

        socket.on('werewolf_witch_info', (info) => {
            setWitchInfo(info);
        });

        socket.on('error', (err) => {
            setError(err.message);
        });

        return () => {
            socket.off('game_update');
            socket.off('werewolf_role');
            socket.off('werewolf_night_update');
            socket.off('werewolf_seer_result');
            socket.off('werewolf_witch_info');
            socket.off('error');
        };
    }, [socket]);

    const sendAction = (type, payload = {}) => {
        socket.emit('make_move', {
            roomId,
            moveData: { type, ...payload }
        });
    };

    const startGame = (config) => {
        sendAction('START_GAME', { players, config });
    };

    const amIAlive = gameState.players?.find(p => p.username === currentUser.username)?.alive;

    if (!gameState.phase) return <div className="p-10 text-center text-white font-black animate-pulse uppercase tracking-widest">Entering the Forest...</div>;

    return (
        <div className="min-h-screen bg-black text-gray-100 p-4 font-sans selection:bg-red-900">
             {error && <div className="bg-red-900/80 text-white p-3 mb-4 w-full text-center rounded-xl border-2 border-red-600 font-bold shadow-2xl animate-bounce">{error}</div>}

             <div className="max-w-4xl mx-auto">
                <div className="flex justify-between items-center mb-8 border-b-2 border-gray-900 pb-4">
                    <h1 className="text-4xl font-black text-white tracking-tighter italic">WIRE<span className="text-red-600">WOLF</span></h1>
                    <RoleCard myRole={myRole} showRole={showRole} setShowRole={setShowRole} />
                </div>

                {gameState.phase === 'LOBBY' && (
                    <LobbyPhase players={players} isHost={isHost} startGame={startGame} />
                )}

                {(gameState.phase.startsWith('NIGHT') || gameState.phase.startsWith('DAY')) && gameState.phase !== 'GAME_OVER' && (
                    <div className="bg-gray-900/50 p-6 rounded-3xl shadow-2xl border-2 border-gray-800 backdrop-blur-sm mb-8">
                        <div className="flex justify-center mb-2">
                            <Timer endTime={gameState.phaseEndTime} />
                        </div>
                        
                        {gameState.phase.startsWith('NIGHT') ? (
                            amIAlive ? (
                                <NightPhase 
                                    gameState={gameState} 
                                    myRole={myRole} 
                                    sendAction={sendAction} 
                                    currentUser={currentUser}
                                    witchInfo={witchInfo}
                                    wolfVotes={wolfVotes}
                                />
                            ) : (
                                <div className="text-center py-10">
                                    <div className="text-red-600 font-black text-4xl mb-2 uppercase tracking-widest animate-pulse">Ethereal Silence</div>
                                    <p className="text-gray-500 italic">The dead do not speak during the hunt.</p>
                                </div>
                            )
                        ) : (
                            amIAlive ? (
                                <DayPhase gameState={gameState} currentUser={currentUser} sendAction={sendAction} />
                            ) : (
                                gameState.phase === 'DAY_RESULTS' ? (
                                    <DayPhase gameState={gameState} currentUser={currentUser} sendAction={sendAction} />
                                ) : (
                                    <div className="text-center py-10">
                                        <div className="text-red-600 font-black text-4xl mb-4 uppercase">DECEASED</div>
                                        <p className="text-gray-400 max-w-xs mx-auto">Your ghost watches as the remaining villagers struggle to survive.</p>
                                    </div>
                                )
                            )
                        )}
                    </div>
                )}

                {gameState.phase === 'GAME_OVER' && (
                    <div className="text-center py-20 bg-gray-900 rounded-3xl shadow-2xl border-4 border-yellow-600 relative overflow-hidden">
                        <div className="absolute inset-0 bg-yellow-600/10 animate-pulse"></div>
                        <h1 className="text-6xl font-black mb-4 text-yellow-500 uppercase tracking-tighter relative z-10">{gameState.winner} WIN!</h1>
                        <p className="text-2xl text-white mb-10 font-bold relative z-10">{gameState.winReason}</p>
                        <button onClick={onLeave} className="bg-white text-black hover:bg-gray-200 px-10 py-4 rounded-full font-black uppercase tracking-widest shadow-xl transition-all relative z-10 transform hover:scale-110 active:scale-95">Back to Menu</button>
                    </div>
                )}

                {/* Player List (Always Visible) */}
                <div className="mt-12">
                    <h3 className="text-gray-600 font-black uppercase text-xs tracking-[0.3em] mb-4 ml-1 border-l-4 border-gray-800 pl-3">Village Inhabitants</h3>
                    <PlayerList gameState={gameState} currentUser={currentUser} />
                </div>
             </div>
        </div>
    );
};

export default Werewolf;
