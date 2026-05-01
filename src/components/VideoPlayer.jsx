import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';

const VideoPlayer = forwardRef(function VideoPlayer({ videoId, onTimeUpdate }, ref) {
    const playerRef = useRef(null);
    const iframeRef = useRef(null);
    const apiReadyRef = useRef(false);

    // Load YouTube IFrame API
    useEffect(() => {
        if (!videoId) return;

        let interval;

        const loadAPI = () => {
            return new Promise((resolve) => {
                if (window.YT && window.YT.Player) {
                    resolve();
                    return;
                }
                const tag = document.createElement('script');
                tag.src = 'https://www.youtube.com/iframe_api';
                const firstScriptTag = document.getElementsByTagName('script')[0];
                firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
                window.onYouTubeIframeAPIReady = () => resolve();
            });
        };

        loadAPI().then(() => {
            if (playerRef.current) {
                playerRef.current.destroy();
            }
            playerRef.current = new window.YT.Player('yt-player', {
                videoId: videoId,
                width: '100%',
                height: '100%',
                playerVars: {
                    autoplay: 0,
                    modestbranding: 1,
                    rel: 0,
                    fs: 1,
                    playsinline: 1,
                },
                events: {
                    onReady: () => {
                        apiReadyRef.current = true;
                        interval = setInterval(() => {
                            if (playerRef.current && playerRef.current.getCurrentTime) {
                                onTimeUpdate?.(playerRef.current.getCurrentTime());
                            }
                        }, 100);
                    },
                },
            });
        });

        return () => {
            if (interval) clearInterval(interval);
            if (playerRef.current) {
                try { playerRef.current.destroy(); } catch { }
                playerRef.current = null;
                apiReadyRef.current = false;
            }
        };
    }, [videoId, onTimeUpdate]);

    // Expose seek and play methods to parent
    useImperativeHandle(ref, () => ({
        seekTo: (seconds) => {
            if (playerRef.current && apiReadyRef.current) {
                playerRef.current.seekTo(seconds, true);
            }
        },
        play: () => {
            if (playerRef.current && apiReadyRef.current) {
                playerRef.current.playVideo();
            }
        },
        pause: () => {
            if (playerRef.current && apiReadyRef.current) {
                playerRef.current.pauseVideo();
            }
        },
        togglePlay: () => {
            if (playerRef.current && apiReadyRef.current) {
                const state = playerRef.current.getPlayerState();
                if (state === 1) {
                    playerRef.current.pauseVideo();
                } else {
                    playerRef.current.playVideo();
                }
            }
        },
    }));

    if (!videoId) {
        return (
            <div className="video-player-container">
                <div className="video-placeholder">
                    <div className="video-placeholder-icon">🎬</div>
                    <div className="video-placeholder-text">Paste a YouTube URL to get started</div>
                </div>
            </div>
        );
    }

    return (
        <div className="video-player-container">
            <div id="yt-player" ref={iframeRef} />
        </div>
    );
});

export default VideoPlayer;
