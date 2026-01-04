import { useState, useEffect } from 'react';

// --- SUB COMPONENTS ---

const RoleCard = ({ myRole, showRole, setShowRole }) => (
    <div 
        className="mb-4 p-4 bg-gray-800 text-white rounded select-none touch-none cursor-pointer active:scale-95 transition-transform"
        onPointerDown={() => setShowRole(true)}
        onPointerUp={() => setShowRole(false)}
        onPointerLeave={() => setShowRole(false)}
    >
        <h3 className="text-xl font-bold text-center">HOLD TO REVEAL ROLE</h3>
        {showRole && myRole && (
            <div className="mt-4 border-t pt-4 text-center">
                <p className="text-2xl font-black text-yellow-400 uppercase">{myRole.role}</p>
                <p className="text-sm text-gray-400">Party: {myRole.party}</p>
                {myRole.knownFascists.length > 0 && (
                    <div className="mt-2 text-red-400">
                        <p className="font-bold">Fascists:</p>
                        {myRole.knownFascists.join(', ')}
                    </div>
                )}
                {myRole.hitler && (
                    <div className="mt-2 text-red-600 font-bold">
                        HITLER: {myRole.hitler}
                    </div>
                )}
            </div>
        )}
    </div>
);

const GameBoard = ({ gameState }) => (
    <div className="flex flex-col gap-4 w-full max-w-4xl">
        {/* Liberal Track */}
        <div className="bg-blue-100 p-2 rounded flex gap-2 overflow-x-auto">
            {[...Array(5)].map((_, i) => (
                <div key={i} className={`w-16 h-24 flex items-center justify-center border-2 border-blue-300 rounded ${i < gameState.liberalPolicies ? 'bg-blue-600 text-white' : 'bg-white'}`}>
                    {i < gameState.liberalPolicies ? 'LIB' : i+1}
                </div>
            ))}
            <div className="flex items-center text-blue-800 font-bold ml-2">5 wins</div>
        </div>

        {/* Fascist Track */}
        <div className="bg-red-100 p-2 rounded flex gap-2 overflow-x-auto relative">
            {[...Array(6)].map((_, i) => (
                <div key={i} className={`w-16 h-24 flex flex-col items-center justify-center border-2 border-red-300 rounded ${i < gameState.fascistPolicies ? 'bg-red-600 text-white' : 'bg-white'} text-xs text-center p-1 relative`}>
                    {i < gameState.fascistPolicies ? <span className="text-lg font-bold">FAS</span> : (
                        <>
                            {/* Power Icons Placeholder */}
                            {gameState.players.length <= 6 ? (
                                <>
                                    {i === 2 && 'Peek'}
                                    {i === 3 && 'Kill'}
                                    {i === 4 && 'Kill+Veto'}
                                </>
                            ) : gameState.players.length <= 8 ? (
                                <>
                                    {i === 1 && 'Inv'}
                                    {i === 2 && 'Special'}
                                    {i === 3 && 'Kill'}
                                    {i === 4 && 'Kill+Veto'}
                                </>
                            ) : (
                                <>
                                    {i === 0 && 'Inv'}
                                    {i === 1 && 'Inv'}
                                    {i === 2 && 'Special'}
                                    {i === 3 && 'Kill'}
                                    {i === 4 && 'Kill+Veto'}
                                </>
                            )}
                        </>
                    )}
                </div>
            ))}
             <div className="flex items-center text-red-800 font-bold ml-2">6 wins</div>
        </div>

        {/* Election Tracker */}
        <div className="flex justify-center gap-2 mt-2">
            <span className="font-bold">Election Tracker:</span>
            {[0, 1, 2, 3].map(i => (
                <div key={i} className={`w-6 h-6 rounded-full border ${gameState.electionTracker === i ? 'bg-black' : 'bg-gray-300'}`}></div>
            ))}
        </div>
    </div>
);

const PlayerList = ({ gameState }) => (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 mt-4">
        {gameState.players?.map(p => (
            <div key={p.username} className={`p-2 border rounded relative ${!p.alive ? 'bg-gray-400 opacity-50' : 'bg-white'}`}>
                <div className="font-bold truncate">{p.username}</div>
                {p.isPresident && <div className="text-xs bg-blue-500 text-white px-1 rounded inline-block mr-1">PRES</div>}
                {p.isChancellor && <div className="text-xs bg-orange-500 text-white px-1 rounded inline-block">CHAN</div>}
                {!p.alive && <div className="text-xs text-red-800 font-black">DEAD</div>}
                {p.voted && gameState.phase === 'VOTING' && <div className="absolute top-1 right-1 text-green-500">✔</div>}
                {gameState.lastVotes && gameState.lastVotes[p.socketId] && (
                    <div className={`text-xs font-bold ${gameState.lastVotes[p.socketId] === 'JA' ? 'text-green-600' : 'text-red-600'}`}>
                        {gameState.lastVotes[p.socketId]}
                    </div>
                )}
            </div>
        ))}
    </div>
);

const LobbyPhase = ({ players, isHost, startGame }) => (
    <div className="text-center">
        <h2 className="text-2xl font-bold mb-4">Lobby</h2>
        <p className="mb-4">Waiting for players... ({players.length}/10)</p>
        {isHost ? (
            <button 
                onClick={startGame}
                disabled={players.length < 5}
                className="bg-green-600 text-white px-6 py-2 rounded font-bold disabled:opacity-50"
            >
                Start Game
            </button>
        ) : (
            <p>Waiting for host to start...</p>
        )}
    </div>
);

const RoleRevealPhase = ({ isHost, sendAction, myRole, showRole, setShowRole }) => (
    <div className="text-center">
        <RoleCard myRole={myRole} showRole={showRole} setShowRole={setShowRole} />
        <p className="mb-4 text-sm text-gray-600">Memorize your role. Keep it secret.</p>
        {isHost && (
            <button 
                onClick={() => sendAction('END_ROLE_REVEAL')}
                className="bg-indigo-600 text-white px-4 py-2 rounded"
            >
                Begin Election
            </button>
        )}
    </div>
);

const NominationPhase = ({ gameState, currentUser, sendAction, amIPresident }) => (
    <div className="text-center">
        <h3 className="text-xl font-bold mb-2">Election: Nomination</h3>
        <p>President <span className="font-bold text-blue-600">{gameState.players?.find(p=>p.isPresident)?.username}</span> must nominate a Chancellor.</p>
        {amIPresident && (
            <div className="mt-4 grid grid-cols-2 gap-2">
                {gameState.players.map(p => {
                    const isMe = p.username === currentUser.username;
                    if (!p.alive || isMe) return null;
                    return (
                        <button
                            key={p.username}
                            onClick={() => sendAction('NOMINATE_CHANCELLOR', { targetId: p.socketId })}
                            className="bg-orange-100 hover:bg-orange-200 border border-orange-400 p-2 rounded"
                        >
                            Nominate {p.username}
                        </button>
                    )
                })}
            </div>
        )}
    </div>
);

const VotingPhase = ({ gameState, currentUser, sendAction, amIAlive }) => (
    <div className="text-center">
        <h3 className="text-xl font-bold mb-2">Vote on Government</h3>
        <p className="mb-4">
            President: <span className="font-bold">{gameState.players?.find(p=>p.isPresident)?.username}</span><br/>
            Chancellor: <span className="font-bold">{gameState.chancellorNominee}</span>
        </p>
        {amIAlive && !gameState.players.find(p => p.username === currentUser.username)?.voted ? (
            <div className="flex justify-center gap-4">
                <button 
                    onClick={() => sendAction('VOTE', { vote: 'JA' })}
                    className="bg-green-600 text-white w-24 h-32 rounded text-2xl font-bold shadow-lg hover:scale-105 transition"
                >
                    JA!
                </button>
                <button 
                    onClick={() => sendAction('VOTE', { vote: 'NEIN' })}
                    className="bg-red-600 text-white w-24 h-32 rounded text-2xl font-bold shadow-lg hover:scale-105 transition"
                >
                    NEIN!
                </button>
            </div>
        ) : (
            <p className="text-gray-500">Waiting for votes...</p>
        )}
    </div>
);

const LegislativePhase = ({ gameState, myHand, sendAction, amIPresident, amIChancellor }) => (
    <div className="text-center">
        <h3 className="text-xl font-bold mb-2">Legislative Session</h3>
        {(amIPresident && gameState.phase === 'LEGISLATIVE_PRESIDENT') || (amIChancellor && gameState.phase === 'LEGISLATIVE_CHANCELLOR') ? (
            <div>
                <p className="mb-4 text-yellow-700 font-bold bg-yellow-100 p-2 rounded">
                    Choose 1 Policy to DISCARD. <br/>(The rest pass on or get enacted)
                </p>
                <div className="flex justify-center gap-4">
                    {myHand.map((card, i) => (
                        <button
                            key={i}
                            onClick={() => sendAction('DISCARD_POLICY', { index: i })}
                            className={`w-24 h-36 rounded shadow-lg border-4 flex items-center justify-center font-bold text-xl
                                ${card === 'LIBERAL' ? 'bg-blue-100 border-blue-600 text-blue-800' : 'bg-red-100 border-red-600 text-red-800'}
                            `}
                        >
                            {card}
                        </button>
                    ))}
                </div>
                {/* Veto Button for Chancellor */}
                {amIChancellor && gameState.phase === 'LEGISLATIVE_CHANCELLOR' && gameState.fascistPolicies === 5 && !gameState.vetoRequested && (
                     <button 
                        onClick={() => sendAction('DISCARD_POLICY', { index: 'VETO' })}
                        className="mt-6 bg-gray-800 text-white px-4 py-2 rounded uppercase font-bold"
                    >
                        Propose Veto
                    </button>
                )}
            </div>
        ) : (
            <p>Government is enacting a policy...</p>
        )}
        
        {/* Veto Response UI */}
        {gameState.phase === 'LEGISLATIVE_PRESIDENT_VETO' && (
            <div className="mt-4 p-4 bg-red-50 border border-red-500 rounded">
                <p className="font-bold mb-2">Chancellor requested Veto!</p>
                {amIPresident ? (
                    <div className="flex justify-center gap-4">
                        <button onClick={() => sendAction('VETO_RESPONSE', { approved: true })} className="bg-green-600 text-white px-4 py-2 rounded">Agree (Discard All)</button>
                        <button onClick={() => sendAction('VETO_RESPONSE', { approved: false })} className="bg-red-600 text-white px-4 py-2 rounded">Refuse (Must Enact)</button>
                    </div>
                ) : (
                    <p>Waiting for President...</p>
                )}
            </div>
        )}
    </div>
);

const ExecutivePhase = ({ gameState, currentUser, sendAction, amIPresident, peekData, investigationData, setInvestigationData }) => (
    <div className="text-center">
        <h3 className="text-xl font-bold mb-2 text-purple-700">Executive Action</h3>
        <p className="font-bold mb-4">{gameState.pendingPower}</p>

        {amIPresident ? (
            <div>
                {gameState.pendingPower === 'PEEK' && (
                    <div>
                         <button onClick={() => sendAction('EXECUTIVE_ACTION', { powerType: 'PEEK' })} className="bg-purple-600 text-white px-4 py-2 rounded">Peek Top 3</button>
                         {peekData.length > 0 && (
                            <div className="mt-4 flex justify-center gap-2">
                                {peekData.map((c, i) => (
                                    <div key={i} className={`p-2 border rounded ${c==='LIBERAL'?'bg-blue-100':'bg-red-100'}`}>{c}</div>
                                ))}
                            </div>
                         )}
                    </div>
                )}
                
                {['INVESTIGATE', 'SPECIAL_ELECTION', 'EXECUTION'].includes(gameState.pendingPower) && !investigationData && (
                    <div className="grid grid-cols-2 gap-2 mt-4">
                         {gameState.players.map(p => {
                            if (p.username === currentUser.username) return null;
                            if (!p.alive) return null;
                            if (gameState.pendingPower === 'INVESTIGATE' && p.hasBeenInvestigated) return null;
                            
                            return (
                                <button
                                    key={p.username}
                                    onClick={() => {
                                        if (confirm(`Are you sure you want to target ${p.username}?`)) {
                                            sendAction('EXECUTIVE_ACTION', { powerType: gameState.pendingPower, targetId: p.socketId })
                                        }
                                    }}
                                    className="bg-purple-100 hover:bg-purple-200 border border-purple-400 p-2 rounded"
                                >
                                    Target {p.username}
                                </button>
                            )
                        })}
                    </div>
                )}

                {investigationData && (
                    <div className="mt-4 p-4 bg-white shadow rounded">
                        <p>Result for <span className="font-bold">{investigationData.username}</span>:</p>
                        <p className="text-2xl font-bold">{investigationData.party}</p>
                        <button onClick={() => setInvestigationData(null)} className="mt-2 text-sm underline">Close</button>
                    </div>
                )}
            </div>
        ) : (
            <p>President is taking action...</p>
        )}
    </div>
);

const GameOverPhase = ({ gameState, onLeave }) => (
    <div className="text-center p-8 bg-white rounded shadow-xl">
        <h1 className="text-4xl font-black mb-4">
            {gameState.winner === 'LIBERALS' ? <span className="text-blue-600">LIBERALS WIN</span> : <span className="text-red-600">FASCISTS WIN</span>}
        </h1>
        <p className="text-xl mb-6">{gameState.winReason}</p>
        <button onClick={onLeave} className="bg-gray-600 text-white px-6 py-2 rounded">Back to Menu</button>
    </div>
);

// --- MAIN COMPONENT ---

const SecretHitler = ({ socket, roomId, players, initialGameState, currentUser, onLeave }) => {
    // Initialize state from prop if available
    const [gameState, setGameState] = useState(() => initialGameState || {});
    const [myRole, setMyRole] = useState(null); // { role, party, knownFascists, hitler }
    const [myHand, setMyHand] = useState([]);
    const [peekData, setPeekData] = useState([]);
    const [investigationData, setInvestigationData] = useState(null);
    const [showRole, setShowRole] = useState(false);
    const [error, setError] = useState('');

    const isHost = players[0]?.username === currentUser.username;
    const amIPresident = gameState.players?.find(p => p.username === currentUser.username)?.isPresident;
    const amIChancellor = gameState.players?.find(p => p.username === currentUser.username)?.isChancellor;
    const amIAlive = gameState.players?.find(p => p.username === currentUser.username)?.alive;

    useEffect(() => {
        // We only use initialGameState for initial hydration in useState, not syncing continuously here 
        // unless we want to support prop updates driving state which is tricky with socket updates.
        // But the linter warning was about calling setState in effect synchronously.
        // We removed that.
        
        socket.on('game_update', (state) => {
            setGameState(state);
            setError('');
            // Clear transient states if phase changed
            if (state.phase !== 'LEGISLATIVE_PRESIDENT' && state.phase !== 'LEGISLATIVE_CHANCELLOR') {
                setMyHand([]);
            }
            if (state.phase !== 'EXECUTIVE_ACTION') {
                setPeekData([]);
                setInvestigationData(null);
            }
        });

        socket.on('secret_hitler_role', (roleData) => {
            console.log("Received Role:", roleData);
            setMyRole(roleData);
        });

        socket.on('secret_hitler_hand', (hand) => {
            setMyHand(hand);
        });

        socket.on('secret_hitler_peek', (cards) => {
            setPeekData(cards);
        });

        socket.on('secret_hitler_investigation', (data) => {
            setInvestigationData(data);
        });

        socket.on('error', (err) => {
            setError(err.message);
        });

        return () => {
            socket.off('game_update');
            socket.off('secret_hitler_role');
            socket.off('secret_hitler_hand');
            socket.off('secret_hitler_peek');
            socket.off('secret_hitler_investigation');
            socket.off('error');
        };
    }, [socket]); // Removed initialGameState dependency to avoid re-runs

    const sendAction = (type, payload = {}) => {
        socket.emit('make_move', {
            roomId,
            moveData: { type, ...payload }
        });
    };

    const startGame = () => {
        sendAction('START_GAME', { players });
    };

    if (!gameState.phase) return <div className="p-4">Loading...</div>;

    return (
        <div className="flex flex-col items-center p-2 pb-20 max-w-lg mx-auto w-full">
            {error && <div className="bg-red-100 text-red-700 p-2 mb-4 w-full text-center rounded">{error}</div>}
            
            <div className="flex justify-between w-full items-center mb-4">
                 <h2 className="text-lg font-bold">Secret Hitler</h2>
                 <RoleCard myRole={myRole} showRole={showRole} setShowRole={setShowRole} />
            </div>

            {gameState.phase === 'GAME_OVER' ? (
                <GameOverPhase gameState={gameState} onLeave={onLeave} />
            ) : (
                <>
                    <GameBoard gameState={gameState} />
                    <div className="my-6 w-full">
                        {gameState.phase === 'LOBBY' && (
                            <LobbyPhase players={players} isHost={isHost} startGame={startGame} />
                        )}
                        {gameState.phase === 'ROLE_REVEAL' && (
                            <RoleRevealPhase isHost={isHost} sendAction={sendAction} myRole={myRole} showRole={showRole} setShowRole={setShowRole} />
                        )}
                        {gameState.phase === 'ELECTION_NOMINATION' && (
                            <NominationPhase gameState={gameState} currentUser={currentUser} sendAction={sendAction} amIPresident={amIPresident} />
                        )}
                        {gameState.phase === 'VOTING' && (
                            <VotingPhase gameState={gameState} currentUser={currentUser} sendAction={sendAction} amIAlive={amIAlive} />
                        )}
                        {(gameState.phase.startsWith('LEGISLATIVE')) && (
                            <LegislativePhase gameState={gameState} myHand={myHand} sendAction={sendAction} amIPresident={amIPresident} amIChancellor={amIChancellor} />
                        )}
                        {gameState.phase === 'EXECUTIVE_ACTION' && (
                            <ExecutivePhase gameState={gameState} currentUser={currentUser} sendAction={sendAction} amIPresident={amIPresident} peekData={peekData} investigationData={investigationData} setInvestigationData={setInvestigationData} />
                        )}
                    </div>
                    <PlayerList gameState={gameState} />
                </>
            )}
        </div>
    );
};

export default SecretHitler;