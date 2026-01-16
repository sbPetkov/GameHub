import React, { useState, useEffect, useRef } from 'react';

// Components
const Wheel = ({ onSpin, spinning, currentCategory, isMyTurn }) => {
    const categories = ['songs', 'movies', 'real_or_fake', 'trivia'];
    const colors = ['#FF6B6B', '#4ECDC4', '#FFE66D', '#1A535C'];
    
    return (
        <div className="flex flex-col items-center justify-center p-8">
            <div className="relative group">
                {/* Outer Glow */}
                <div className={`absolute -inset-4 bg-indigo-500/20 rounded-full blur-2xl transition-opacity duration-1000 ${spinning ? 'opacity-100' : 'opacity-0'}`}></div>
                
                {/* The Wheel */}
                <div className={`relative w-80 h-80 rounded-full border-[12px] border-gray-800 shadow-[0_20px_50px_rgba(0,0,0,0.3)] transition-transform duration-[4000ms] cubic-bezier(0.15, 0, 0.15, 1) ${spinning ? 'rotate-[1440deg]' : ''}`}
                    style={{
                        background: `conic-gradient(from -45deg, 
                            ${colors[0]} 0% 25%, 
                            ${colors[1]} 25% 50%, 
                            ${colors[2]} 50% 75%, 
                            ${colors[3]} 75% 100%
                        )`
                    }}
                >
                    {/* Inner Shimmer/Glass Effect */}
                    <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-white/10 to-transparent pointer-events-none"></div>

                    {/* Labels */}
                    <div className="absolute top-8 left-1/2 -translate-x-1/2 font-black text-white text-lg drop-shadow-[0_2px_2px_rgba(0,0,0,0.5)] tracking-tighter">SONGS</div>
                    <div className="absolute right-6 top-1/2 -translate-y-1/2 font-black text-white text-lg drop-shadow-[0_2px_2px_rgba(0,0,0,0.5)] rotate-90 tracking-tighter">MOVIES</div>
                    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 font-black text-white text-lg drop-shadow-[0_2px_2px_rgba(0,0,0,0.5)] tracking-tighter">REAL/FAKE</div>
                    <div className="absolute left-6 top-1/2 -translate-y-1/2 font-black text-white text-lg drop-shadow-[0_2px_2px_rgba(0,0,0,0.5)] -rotate-90 tracking-tighter">TRIVIA</div>
                    
                    {/* Center Hub */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 bg-gray-800 rounded-full border-4 border-white/20 flex items-center justify-center shadow-2xl z-10">
                        <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-inner">
                            <div className="w-2 h-2 bg-gray-800 rounded-full"></div>
                        </div>
                    </div>
                </div>

                {/* Fixed Pointer */}
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 z-30 filter drop-shadow-lg">
                    <div className="w-0 h-0 border-l-[15px] border-l-transparent border-r-[15px] border-r-transparent border-t-[30px] border-t-red-600"></div>
                    <div className="w-2 h-2 bg-white rounded-full absolute -top-1 left-1/2 -translate-x-1/2"></div>
                </div>
            </div>

            {currentCategory && !spinning && (
                <div className="mt-12 text-4xl font-black uppercase tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600 animate-bounce">
                    {currentCategory === 'real_or_fake' ? 'REAL OR FAKE?' : currentCategory}
                </div>
            )}
            
            {isMyTurn && (
                <button 
                    onClick={onSpin} 
                    disabled={spinning}
                    className="mt-12 px-12 py-5 bg-indigo-600 text-white text-2xl font-black rounded-2xl shadow-[0_10px_20px_rgba(79,70,229,0.3)] hover:bg-indigo-700 disabled:opacity-50 transition-all transform hover:scale-105 active:scale-95"
                >
                    {spinning ? 'SPINNING...' : 'SPIN THE WHEEL'}
                </button>
            )}
        </div>
    );
};

const QuestionCard = ({ category, challenge, onReveal, revealing }) => {
    if (!challenge) return null;

    const renderContent = () => {
        if (revealing) {
            return (
                <div className="flex flex-col items-center justify-center h-64">
                    <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-indigo-600 mb-4"></div>
                    <h2 className="text-xl font-semibold text-gray-600">Loading Challenge...</h2>
                </div>
            );
        }

        switch (category) {
            case 'songs':
                return (
                    <div className="text-center">
                        <h3 className="text-2xl font-bold mb-4">Guess the Song!</h3>
                        <div className="bg-gray-100 p-6 rounded-lg mb-4">
                            <audio controls src={`/close-enough-data/${challenge.file}`} className="w-full" />
                        </div>
                        <p className="text-sm text-gray-500">Listen to the snippet and guess the title.</p>
                    </div>
                );
            case 'movies':
                return (
                    <div className="text-center">
                        <h3 className="text-2xl font-bold mb-4">Guess the Movie!</h3>
                        <div className="text-6xl mb-6 tracking-widest bg-gray-900 p-8 rounded-xl shadow-inner">
                            {challenge.emojis}
                        </div>
                    </div>
                );
            case 'real_or_fake':
                return (
                    <div className="text-center">
                        <h3 className="text-2xl font-bold mb-4">Real or Fake?</h3>
                        <div className="bg-yellow-50 p-8 rounded-xl text-2xl font-bold text-yellow-900 shadow-sm border-2 border-yellow-200 italic">
                            "{challenge.fact}"
                        </div>
                    </div>
                );
            case 'trivia':
                return (
                    <div className="text-center">
                        <h3 className="text-2xl font-bold mb-4">Trivia Time!</h3>
                        <div className="bg-blue-100 p-8 rounded-xl text-xl font-medium text-blue-900 shadow-sm">
                            {challenge.question}
                        </div>
                    </div>
                );
            default:
                return <div>Unknown Category</div>;
        }
    };

    return (
        <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-2xl border border-gray-100">
            {renderContent()}
            
            {revealing && onReveal && (
                <button 
                    onClick={onReveal}
                    className="w-full mt-6 bg-green-500 hover:bg-green-600 text-white font-bold py-4 rounded-xl text-xl shadow-lg transition transform hover:-translate-y-1"
                >
                    REVEAL CHALLENGE & START TIMER
                </button>
            )}
        </div>
    );
};

const AnswerInput = ({ onSubmit, category }) => {
    const [answer, setAnswer] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (answer.trim()) onSubmit(answer);
    };

    if (category === 'real_or_fake') {
        return (
            <div className="flex gap-6 w-full max-w-lg mt-8">
                <button 
                    onClick={() => onSubmit('false')}
                    className="flex-1 bg-red-500 hover:bg-red-600 text-white font-black py-6 rounded-2xl text-3xl shadow-lg transition transform hover:scale-105"
                >
                    FAKE
                </button>
                <button 
                    onClick={() => onSubmit('true')}
                    className="flex-1 bg-green-500 hover:bg-green-600 text-white font-black py-6 rounded-2xl text-3xl shadow-lg transition transform hover:scale-105"
                >
                    REAL
                </button>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="w-full max-w-lg mt-8">
            <input 
                type="text" 
                autoFocus
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Type your answer here..."
                className="w-full text-center text-2xl p-4 border-2 border-indigo-200 rounded-xl focus:outline-none focus:border-indigo-600 focus:ring-4 focus:ring-indigo-100 transition shadow-sm"
            />
            <button 
                type="submit" 
                className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl text-xl shadow-md transition"
            >
                SUBMIT ANSWER
            </button>
        </form>
    );
};

const VotePanel = ({ playerAnswer, correctAnswer, onVote, myVote, votes, players, canVote, category }) => {
    const passCount = Object.values(votes).filter(v => v === 'PASS').length;
    const partialCount = Object.values(votes).filter(v => v === 'PARTIAL').length;
    const failCount = Object.values(votes).filter(v => v === 'FAIL').length;
    
    return (
        <div className="flex flex-col items-center w-full max-w-3xl">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full mb-8">
                <div className="bg-white p-6 rounded-xl shadow-lg border-l-8 border-indigo-500">
                    <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Player's Answer</h3>
                    <div className="text-3xl font-bold text-gray-900">{playerAnswer || "No Answer"}</div>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-lg border-l-8 border-green-500">
                    <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Correct Answer</h3>
                    <div className="text-3xl font-bold text-gray-900">
                        {typeof correctAnswer === 'object' ? JSON.stringify(correctAnswer) : correctAnswer} 
                    </div>
                </div>
            </div>

            {canVote ? (
                <div className="flex flex-col md:flex-row gap-4 w-full max-w-2xl">
                    <button 
                        onClick={() => onVote('FAIL')}
                        disabled={!!myVote}
                        className={`flex-1 py-6 rounded-xl font-black text-xl transition transform hover:scale-105 shadow-xl ${myVote === 'FAIL' ? 'bg-red-700 ring-4 ring-red-300' : 'bg-red-500 hover:bg-red-600'} text-white`}
                    >
                        ❌ FAIL
                    </button>
                    
                    {category === 'songs' && (
                        <button 
                            onClick={() => onVote('PARTIAL')}
                            disabled={!!myVote}
                            className={`flex-1 py-6 rounded-xl font-black text-xl transition transform hover:scale-105 shadow-xl ${myVote === 'PARTIAL' ? 'bg-orange-700 ring-4 ring-orange-300' : 'bg-orange-500 hover:bg-orange-600'} text-white`}
                        >
                            ⚠️ ONE (10pt)
                        </button>
                    )}

                    <button 
                        onClick={() => onVote('PASS')}
                        disabled={!!myVote}
                        className={`flex-1 py-6 rounded-xl font-black text-xl transition transform hover:scale-105 shadow-xl ${myVote === 'PASS' ? 'bg-green-700 ring-4 ring-green-300' : 'bg-green-500 hover:bg-green-600'} text-white`}
                    >
                        ✅ {category === 'songs' ? 'BOTH (20pt)' : 'PASS (10pt)'}
                    </button>
                </div>
            ) : (
                <div className="bg-indigo-100 text-indigo-800 px-8 py-4 rounded-full font-bold text-xl animate-pulse">
                     Your answer is being judged... Good luck! 🤞
                </div>
            )}
            
            <div className="flex gap-4 mt-6 text-sm font-bold">
                <span className="text-red-600">FAIL: {failCount}</span>
                {category === 'songs' && <span className="text-orange-600">ONE: {partialCount}</span>}
                <span className="text-green-600">{category === 'songs' ? 'BOTH' : 'PASS'}: {passCount}</span>
            </div>
            
            {myVote && <div className="mt-4 text-gray-500 italic">Waiting for others...</div>}
        </div>
    );
};

const CloseEnough = ({ socket, roomId, players, initialGameState, currentUser, onLeave }) => {
    const [gameState, setGameState] = useState(initialGameState);
    const [spinning, setSpinning] = useState(false);
    const [timeLeft, setTimeLeft] = useState(0);

    useEffect(() => {
        if (initialGameState) setGameState(initialGameState);
    }, [initialGameState]);

    useEffect(() => {
        if (!socket) return;
        socket.on('game_update', (newState) => {
            setGameState(newState);
            if (newState.state === 'SPIN') {
                setSpinning(false);
            }
        });
        return () => socket.off('game_update');
    }, [socket]);

    const handleStartGame = () => {
        socket.emit('make_move', { roomId, moveData: { type: 'START_GAME' } });
    };

    const handleSpin = () => {
        setSpinning(true);
        // Simulate spin time then trigger server
        setTimeout(() => {
            socket.emit('make_move', { roomId, moveData: { type: 'SPIN_WHEEL' } });
        }, 2000);
    };

    const handleReveal = () => {
        socket.emit('make_move', { roomId, moveData: { type: 'REVEAL_CHALLENGE' } });
    };

    const handleSubmit = (answer) => {
        socket.emit('make_move', { roomId, moveData: { type: 'SUBMIT_ANSWER', answer } });
    };

    const handleVote = (vote) => {
        socket.emit('make_move', { roomId, moveData: { type: 'VOTE', vote } });
    };

    const handleNextTurn = () => {
        socket.emit('make_move', { roomId, moveData: { type: 'NEXT_TURN' } });
    };

    const handleBuyTime = () => {
        socket.emit('make_move', { roomId, moveData: { type: 'BUY_TIME' } });
    };

    if (!gameState) return <div>Loading...</div>;

    const currentPlayer = gameState.players[gameState.turnIndex];
    const isMyTurn = currentPlayer?.socketId === socket.id;
    const isHost = players[0]?.socketId === socket.id; // Assuming first player is host or pass prop

    // Helper to get correct answer text
    const getCorrectAnswer = () => {
        const c = gameState.currentChallenge;
        if (!c) return "Unknown";
        if (gameState.currentCategory === 'songs') return `${c.song} by ${c.artist}`;
        if (gameState.currentCategory === 'movies') return c.movie;
        if (gameState.currentCategory === 'real_or_fake') return c.isReal ? "REAL" : "FAKE";
        if (gameState.currentCategory === 'trivia') return c.answer;
        return "Unknown";
    };

    return (
        <div className="min-h-screen bg-slate-50 text-gray-800 font-sans">
            {/* Header / StatusBar */}
            <div className="bg-white shadow-sm p-4 flex justify-between items-center sticky top-0 z-50">
                <div className="flex items-center gap-4">
                    <button onClick={onLeave} className="text-red-500 hover:bg-red-50 px-3 py-1 rounded font-semibold transition">
                        ← Leave
                    </button>
                    <div className="font-bold text-xl text-indigo-800 tracking-tight">CLOSE ENOUGH</div>
                </div>
                
                <div className="flex gap-4 overflow-x-auto pb-1">
                    {gameState.players.map((p, i) => (
                        <div key={i} className={`flex flex-col items-center px-4 py-2 rounded-lg min-w-[120px] border-2 transition ${gameState.turnIndex === i ? 'border-indigo-500 bg-indigo-50 shadow-md transform scale-105' : 'border-transparent opacity-70'}`}>
                            <div className="font-bold truncate max-w-[100px]">{p.username}</div>
                            <div className="text-xs font-mono bg-gray-200 px-2 rounded-full mt-1">{p.timeBank}s</div>
                            <div className="text-xs font-bold text-green-600">+{p.score} pts</div>
                            
                            {p.socketId === socket.id && p.score >= 15 && (
                                <button 
                                    onClick={handleBuyTime}
                                    className="mt-1 text-[10px] bg-yellow-400 hover:bg-yellow-500 text-yellow-900 font-bold px-2 py-0.5 rounded shadow-sm"
                                    title="Buy 1 minute for 15 pts"
                                >
                                    +1 MIN (15pt)
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Game Content */}
            <div className="container mx-auto px-4 py-8 flex flex-col items-center min-h-[600px] justify-center">
                
                {gameState.state === 'LOBBY' && (
                    <div className="text-center bg-white p-12 rounded-2xl shadow-xl max-w-lg w-full">
                        <h1 className="text-4xl font-black text-indigo-600 mb-6">Ready to Play?</h1>
                        <p className="mb-8 text-gray-500 text-lg">Waiting for the host to start the game...</p>
                        <div className="grid grid-cols-2 gap-4 mb-8">
                            {gameState.players.map((p,i) => (
                                <div key={i} className="flex items-center gap-2 bg-gray-50 p-3 rounded-lg">
                                    <div className="w-8 h-8 bg-indigo-200 rounded-full flex items-center justify-center font-bold text-indigo-700">
                                        {p.username[0].toUpperCase()}
                                    </div>
                                    <span>{p.username}</span>
                                </div>
                            ))}
                        </div>
                        {/* Start button for everyone for now, usually check host */}
                         <button 
                            onClick={handleStartGame}
                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl text-xl shadow-lg transition transform hover:-translate-y-1"
                        >
                            START GAME
                        </button>
                    </div>
                )}

                {gameState.state === 'SPIN' && (
                    <div className="flex flex-col items-center">
                        <h2 className="text-3xl font-bold mb-8 text-gray-700">
                            {isMyTurn ? "It's your turn to spin!" : `${currentPlayer?.username} is spinning...`}
                        </h2>
                        <Wheel 
                            onSpin={handleSpin} 
                            spinning={spinning} 
                            currentCategory={gameState.currentCategory}
                            isMyTurn={isMyTurn}
                        />
                    </div>
                )}

                {gameState.state === 'REVEAL' && (
                    <div className="flex flex-col items-center w-full">
                        <h2 className="text-2xl font-bold mb-6 text-gray-600">
                            Category: <span className="text-indigo-600 uppercase">{gameState.currentCategory}</span>
                        </h2>
                        <QuestionCard 
                            category={gameState.currentCategory}
                            challenge={gameState.currentChallenge}
                            revealing={true}
                            onReveal={isMyTurn ? handleReveal : undefined}
                        />
                        {!isMyTurn && <div className="mt-8 text-gray-500 animate-pulse">Waiting for {currentPlayer?.username} to reveal...</div>}
                    </div>
                )}

                {gameState.state === 'ANSWER' && (
                    <div className="flex flex-col items-center w-full">
                         <h2 className="text-2xl font-bold mb-6 text-gray-600">
                            Category: <span className="text-indigo-600 uppercase">{gameState.currentCategory}</span>
                        </h2>
                        <QuestionCard 
                            category={gameState.currentCategory}
                            challenge={gameState.currentChallenge}
                            revealing={false}
                        />
                        {isMyTurn ? (
                            <AnswerInput onSubmit={handleSubmit} category={gameState.currentCategory} />
                        ) : (
                            <div className="mt-8 text-xl text-gray-500 font-medium animate-pulse">
                                {currentPlayer?.username} is answering...
                            </div>
                        )}
                    </div>
                )}

                {gameState.state === 'VOTE' && (
                    <VotePanel 
                        playerAnswer={gameState.playerAnswer}
                        correctAnswer={getCorrectAnswer()}
                        onVote={handleVote}
                        myVote={gameState.votes[socket.id]}
                        votes={gameState.votes}
                        players={gameState.players}
                        canVote={!isMyTurn}
                        category={gameState.currentCategory}
                    />
                )}

                {gameState.state === 'RESULT' && (
                    <div className="text-center bg-white p-12 rounded-2xl shadow-xl max-w-lg w-full border-4 border-indigo-100">
                        <div className="text-6xl mb-6">
                            {gameState.lastResult ? '🎉' : '💩'}
                        </div>
                        <h2 className={`text-4xl font-black mb-4 ${gameState.lastResult ? 'text-green-600' : 'text-red-500'}`}>
                            {gameState.lastResult ? (gameState.lastPoints === 20 ? 'PERFECT!' : 'CLOSE ENOUGH!') : 'FAIL!'}
                        </h2>
                        <p className="text-gray-500 text-xl mb-8">
                            {gameState.lastResult 
                                ? `${currentPlayer?.username} gets ${gameState.lastPoints} points!` 
                                : `Better luck next time, ${currentPlayer?.username}.`}
                        </p>
                        
                        <button 
                            onClick={handleNextTurn}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-8 rounded-full shadow-lg transition transform hover:scale-105"
                        >
                            NEXT TURN →
                        </button>
                    </div>
                )}

                {gameState.state === 'GAME_OVER' && (
                    <div className="text-center bg-white p-12 rounded-2xl shadow-xl max-w-lg w-full">
                        <h1 className="text-4xl font-black text-indigo-600 mb-6">Game Over!</h1>
                        <p className="mb-8 text-gray-500 text-lg">Everyone is out of time. Here are the final results:</p>
                        
                        <div className="space-y-4 mb-8">
                            {[...gameState.players]
                                .sort((a, b) => b.score - a.score)
                                .map((p, i) => (
                                    <div key={i} className={`flex justify-between items-center p-4 rounded-xl ${i === 0 ? 'bg-yellow-100 border-2 border-yellow-400' : 'bg-gray-50'}`}>
                                        <div className="flex items-center gap-3">
                                            <span className="text-xl font-bold">{i === 0 ? '👑' : i + 1 + '.'}</span>
                                            <span className="font-bold">{p.username}</span>
                                        </div>
                                        <div className="text-2xl font-black text-indigo-700">{p.score} pts</div>
                                    </div>
                                ))
                            }
                        </div>

                        <button 
                            onClick={onLeave}
                            className="w-full bg-gray-800 hover:bg-black text-white font-bold py-4 rounded-xl text-xl shadow-lg transition"
                        >
                            BACK TO LOBBY
                        </button>
                    </div>
                )}

            </div>
        </div>
    );
};

export default CloseEnough;
