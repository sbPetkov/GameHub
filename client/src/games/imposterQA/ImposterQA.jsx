import { useState, useEffect } from 'react';

const ImposterQA = ({ socket, roomId, players, initialGameState, currentUser }) => {
    const [gameState, setGameState] = useState(initialGameState);
    const [isRevealing, setIsRevealing] = useState(false);
    const [myAnswer, setMyAnswer] = useState('');

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
    const voteFor = (targetId) => socket.emit('make_move', { roomId, moveData: { type: 'VOTE', targetId } });
    const submitGuess = (question) => socket.emit('make_move', { roomId, moveData: { type: 'IMPOSTER_GUESS', question } });
    const setCategory = (category) => socket.emit('make_move', { roomId, moveData: { type: 'SET_CATEGORY', category } });
    
    const submitAnswer = () => {
        if (!myAnswer.trim()) return;
        socket.emit('make_move', { roomId, moveData: { type: 'SUBMIT_ANSWER', answer: myAnswer } });
        setMyAnswer(''); // Clear input after submit (though UI will switch to 'Waiting')
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

            {isHost && (
                <div className="mb-6 w-full max-w-md">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Select Category</label>
                    <div className="grid grid-cols-2 gap-2">
                        {gameState.categories.map(cat => (
                            <button
                                key={cat}
                                onClick={() => setCategory(cat)}
                                className={`py-2 px-4 rounded border text-sm ${gameState.selectedCategory === cat ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {isHost ? (
                <button
                    onClick={startGame}
                    disabled={players.length < 3}
                    className={`w-full max-w-xs font-bold py-3 px-6 rounded text-white transition ${players.length < 3 ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}`}
                >
                    {players.length < 3 ? 'Need 3 Players to Start' : 'Start Game'}
                </button>
            ) : (
                <p className="text-gray-500 italic">Waiting for host to start...</p>
            )}
        </div>
    );

    const renderLoading = () => (
        <div className="flex flex-col items-center justify-center h-64">
            <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-indigo-600 mb-4"></div>
            <h2 className="text-2xl font-bold text-gray-700">AI is thinking...</h2>
            <p className="text-gray-500">Generating spicy questions...</p>
        </div>
    );

    const renderRevealButton = () => {
        const myRole = myPlayerData?.role;
        const isImposter = myRole === 'imposter';
        const myQuestion = isImposter ? gameState.oddQuestion : gameState.mainQuestion;

        return (
            <div 
                className="my-4 w-full max-w-sm select-none touch-none"
                onMouseDown={() => setIsRevealing(true)}
                onMouseUp={() => setIsRevealing(false)}
                onMouseLeave={() => setIsRevealing(false)}
                onTouchStart={() => setIsRevealing(true)}
                onTouchEnd={() => setIsRevealing(false)}
            >
                <div 
                    className={`min-h-32 rounded-xl shadow-lg flex items-center justify-center text-center p-6 transition-all transform active:scale-95 cursor-pointer border-4 ${
                        isRevealing 
                            ? (isImposter ? 'bg-red-600 border-red-800' : 'bg-indigo-600 border-indigo-800') 
                            : 'bg-gray-800 border-gray-900'
                    }`}
                >
                    {isRevealing ? (
                        <div className="text-white">
                            <p className="text-xs font-light uppercase tracking-widest mb-2">
                                {isImposter ? 'Your Question (Imposter)' : 'Your Question'}
                            </p>
                            <h2 className="text-lg font-bold leading-tight">
                                {myQuestion}
                            </h2>
                        </div>
                    ) : (
                        <div className="text-gray-400 font-bold tracking-widest uppercase">
                            Hold to See Question
                        </div>
                    )}
                </div>
            </div>
        );
    };

    const renderInputPhase = () => {
        if (myPlayerData?.hasSubmitted) {
            return (
                <div className="text-center p-8 bg-gray-50 rounded-lg w-full max-w-md">
                    <h2 className="text-xl font-bold mb-4 text-green-600">Answer Submitted!</h2>
                    <p className="text-gray-600 animate-pulse">Waiting for others to answer...</p>
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
                <h3 className="text-lg font-bold mb-4 text-center">Enter your Answer</h3>
                <textarea
                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 mb-4"
                    rows="3"
                    placeholder="Type your answer here..."
                    value={myAnswer}
                    onChange={(e) => setMyAnswer(e.target.value)}
                ></textarea>
                <button
                    onClick={submitAnswer}
                    className="w-full bg-indigo-600 text-white font-bold py-3 rounded hover:bg-indigo-700 transition"
                >
                    Submit Answer
                </button>
            </div>
        );
    };

    const renderVotingBoard = () => {
        const voteCounts = {};
        Object.values(gameState.allPlayersData).forEach(p => {
            if (p.vote) voteCounts[p.vote] = (voteCounts[p.vote] || 0) + 1;
        });
        const totalVotes = Object.values(gameState.allPlayersData).filter(p => p.vote).length;

        return (
            <div className="w-full max-w-md">
                <h3 className="text-xl font-bold mb-4 text-center">Read Answers & Vote!</h3>
                <div className="space-y-4">
                    {players.map(p => {
                        const isMe = p.socketId === myPlayerId;
                        const pData = gameState.allPlayersData[p.socketId];
                        const voteCount = voteCounts[p.socketId] || 0;
                        const percentage = totalVotes > 0 ? (voteCount / players.length) * 100 : 0;
                        const iVotedForThis = myPlayerData?.vote === p.socketId;

                        return (
                            <div key={p.socketId} className="relative">
                                {/* Voting Card */}
                                <button
                                    onClick={() => !isMe && voteFor(p.socketId)}
                                    disabled={isMe}
                                    className={`relative w-full text-left rounded-lg border-2 transition-all overflow-hidden ${
                                        iVotedForThis ? 'border-red-500 bg-red-50' : 'border-gray-200 bg-white hover:border-gray-400'
                                    } ${isMe ? 'opacity-90 cursor-default' : ''}`}
                                >
                                    {/* Progress Bar */}
                                    <div 
                                        className="absolute bottom-0 left-0 h-1.5 bg-red-500 transition-all duration-500"
                                        style={{ width: `${percentage}%` }}
                                    ></div>

                                    <div className="p-3">
                                        <div className="flex justify-between items-start mb-1">
                                            <span className="font-bold text-gray-600 text-xs uppercase">{p.username} {isMe && "(You)"}</span>
                                            {voteCount > 0 && (
                                                <span className="bg-red-100 text-red-800 text-xs font-bold px-2 py-0.5 rounded-full">
                                                    {voteCount}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-gray-900 font-medium text-lg italic">
                                            "{pData?.answer || '...'}"
                                        </p>
                                    </div>
                                    
                                    {iVotedForThis && (
                                        <div className="absolute right-2 top-2 text-red-500">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                            </svg>
                                        </div>
                                    )}
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    const renderImposterGuessing = () => {
        const isImposter = myPlayerData?.role === 'imposter';

        if (!isImposter) {
            return (
                <div className="text-center p-8 bg-gray-50 rounded-lg">
                    <h2 className="text-xl font-bold mb-2">Imposter Survived!</h2>
                    <p className="text-gray-600 animate-pulse">Waiting for them to find the Main Question...</p>
                </div>
            );
        }

        const options = [gameState.mainQuestion, ...gameState.decoys].sort(() => Math.random() - 0.5);

        return (
            <div className="w-full max-w-md">
                <h2 className="text-xl font-bold mb-4 text-center text-red-600">You Survived! Which was the Main Question?</h2>
                <div className="space-y-3">
                    {options.map((q, idx) => (
                        <button
                            key={idx}
                            onClick={() => submitGuess(q)}
                            className="w-full text-left bg-white border-2 border-indigo-200 hover:border-indigo-500 hover:bg-indigo-50 text-indigo-900 font-medium py-3 px-4 rounded-lg transition shadow-sm"
                        >
                            {q}
                        </button>
                    ))}
                </div>
            </div>
        );
    };

    const renderRoundOver = () => {
        const imposterName = players.find(p => p.socketId === gameState.imposterId)?.username || 'Unknown';
        
        let title = "";
        let color = "";
        
        switch(gameState.lastResult) {
            case 'IMPOSTER_CAUGHT':
                title = "Imposter Caught!";
                color = "text-green-600";
                break;
            case 'IMPOSTER_WON_BONUS':
                title = "Imposter Won & Found Question!";
                color = "text-red-600";
                break;
            case 'IMPOSTER_WON_SURVIVED':
                title = "Imposter Survived (Missed Question)!";
                color = "text-orange-600";
                break;
            default:
                title = "Round Over";
                color = "text-gray-800";
        }

        return (
            <div className="text-center w-full max-w-md bg-white p-6 rounded-lg shadow-lg">
                <h2 className={`text-3xl font-black mb-2 ${color}`}>{title}</h2>
                <div className="mb-6">
                    <p className="text-gray-600">The Imposter was:</p>
                    <p className="text-xl font-bold text-gray-800">{imposterName}</p>
                </div>
                
                <div className="grid grid-cols-1 gap-4 text-left mb-6 bg-gray-50 p-4 rounded-lg">
                    <div>
                        <span className="text-xs text-gray-500 uppercase font-bold">Main Question</span>
                        <p className="font-bold text-indigo-700">{gameState.mainQuestion}</p>
                    </div>
                    <div>
                        <span className="text-xs text-gray-500 uppercase font-bold">Odd Question</span>
                        <p className="font-bold text-red-700">{gameState.oddQuestion}</p>
                    </div>
                </div>

                <div className="border-t pt-4">
                    <h3 className="font-bold mb-2">Scores</h3>
                    <div className="flex justify-center flex-wrap gap-4">
                        {players.map(p => {
                            const pData = gameState.allPlayersData[p.socketId];
                            return (
                                <div key={p.socketId} className="flex flex-col items-center">
                                    <span className="text-sm text-gray-500">{p.username}</span>
                                    <span className="font-bold text-lg">{pData?.score || 0}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {isHost && (
                    <button
                        onClick={nextRound}
                        className="mt-6 w-full bg-indigo-600 text-white font-bold py-3 px-6 rounded hover:bg-indigo-700 transition"
                    >
                        Next Round
                    </button>
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
            
            {/* During INPUT, only show Reveal Button and Input Form */}
            {gameState.state === 'INPUT' && (
                <>
                    {renderRevealButton()}
                    {renderInputPhase()}
                </>
            )}

            {/* During PLAYING, show Voting Board (which has answers) + Reveal Button */}
            {gameState.state === 'PLAYING' && (
                <>
                    {renderRevealButton()}
                    {renderVotingBoard()}
                </>
            )}

            {gameState.state === 'GUESSING' && renderImposterGuessing()}
            {gameState.state === 'ROUND_OVER' && renderRoundOver()}
            {gameState.state === 'GAME_OVER' && renderGameOver()}
        </div>
    );
};

export default ImposterQA;
