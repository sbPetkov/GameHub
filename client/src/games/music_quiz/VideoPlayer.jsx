import { useRef, useEffect, useState } from 'react';

const VideoPlayer = ({ src, timestamp, muted, autoPlay = true, duration = 10, allowReplay = false }) => {
    const videoRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(false);

    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.currentTime = timestamp;
            videoRef.current.muted = muted;
            if (autoPlay) {
                videoRef.current.play().catch(e => console.log("Autoplay prevented", e));
            }
        }
    }, [src, timestamp, muted, autoPlay]);

    const handleTimeUpdate = () => {
        if (videoRef.current) {
            const end = timestamp + duration;
            if (videoRef.current.currentTime >= end) {
                videoRef.current.pause();
                // Optional: Snap to end or start? keeping it paused at end is fine.
                setIsPlaying(false);
            } else {
                if (!videoRef.current.paused) setIsPlaying(true);
            }
        }
    };

    const handleReplay = () => {
        if (videoRef.current) {
            videoRef.current.currentTime = timestamp;
            videoRef.current.play();
            setIsPlaying(true);
        }
    };

    return (
        <div className="w-full max-w-2xl mx-auto bg-black rounded-lg overflow-hidden shadow-lg relative group">
            <video
                ref={videoRef}
                className="w-full h-auto"
                src={src}
                controls={false}
                playsInline
                muted={muted}
                onContextMenu={(e) => e.preventDefault()}
                onTimeUpdate={handleTimeUpdate}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
            />
            
            {allowReplay && (
                <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                     <button 
                        onClick={handleReplay}
                        className="bg-white/90 hover:bg-white text-gray-800 font-bold py-2 px-4 rounded-full shadow-lg flex items-center gap-2 text-sm backdrop-blur-sm"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                        </svg>
                        Replay Clip
                    </button>
                </div>
            )}
        </div>
    );
};

export default VideoPlayer;
