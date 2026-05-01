import React, { useState, useRef, useCallback, useEffect } from 'react';
import Header from './components/Header.jsx';
import VideoInput from './components/VideoInput.jsx';
import VideoPlayer from './components/VideoPlayer.jsx';
import TimelineSlider from './components/TimelineSlider.jsx';
import SegmentList from './components/SegmentList.jsx';
import ProgressBar from './components/ProgressBar.jsx';
import { formatTime, extractVideoId } from './utils/formatTime.js';

let segmentIdCounter = 0;

export default function App() {
    // ===== State =====
    const [videoUrl, setVideoUrl] = useState('');
    const [videoInfo, setVideoInfo] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [theme, setTheme] = useState(() => localStorage.getItem('clipforge_theme') || 'dark');
    const [segments, setSegments] = useState(() => {
        const saved = localStorage.getItem('clipforge_segments');
        return saved ? JSON.parse(saved) : [];
    });
    const [activeSegmentIndex, setActiveSegmentIndex] = useState(-1);
    const [currentRange, setCurrentRange] = useState([0, 30]);
    const [quality, setQuality] = useState('best');
    const [filename, setFilename] = useState('');
    const [watermarkText, setWatermarkText] = useState('');
    const [asSingleClips, setAsSingleClips] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [progress, setProgress] = useState(null);
    const [toast, setToast] = useState(null);
    const [currentTime, setCurrentTime] = useState(0);

    const playerRef = useRef(null);

    // ===== Toast Helper =====
    const showToast = useCallback((message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    }, []);

    // ===== Load Video Metadata =====
    const handleLoadVideo = useCallback(async (url) => {
        setIsLoading(true);
        setVideoInfo(null);
        setSegments([]);
        setProgress(null);

        try {
            const res = await fetch('/api/metadata', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url }),
            });

            const contentType = res.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Failed to load video');
                setVideoUrl(url);
                setVideoInfo(data);
                setCurrentRange([0, Math.min(30, data.duration)]);
                
                // Smart Auto-Naming
                const slugified = (data.title || 'video')
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '_')
                    .replace(/^_+|_+$/g, '');
                setFilename(slugified);

                showToast(`Loaded: ${data.title}`);
            } else {
                const text = await res.text();
                console.error('Non-JSON response:', text);
                throw new Error(`Server returned non-JSON response. Is the backend running? (Status: ${res.status})`);
            }
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setIsLoading(false);
        }
    }, [showToast]);

    // ===== Add Segment =====
    const handleAddSegment = useCallback(() => {
        if (!videoInfo) return;
        const [start, end] = currentRange;
        if (start >= end) {
            showToast('Invalid segment: start must be before end', 'error');
            return;
        }

        const newSegment = {
            id: `seg_${++segmentIdCounter}`,
            start,
            end,
        };

        setSegments((prev) => [...prev, newSegment]);
        showToast(`Segment added: ${formatTime(start)} → ${formatTime(end)}`);
    }, [currentRange, videoInfo, showToast]);

    // ===== Delete Segment =====
    const handleDeleteSegment = useCallback((index) => {
        setSegments((prev) => prev.filter((_, i) => i !== index));
        setActiveSegmentIndex(-1);
    }, []);

    // ===== Edit Segment =====
    const handleEditSegment = useCallback((index, updated) => {
        setSegments((prev) =>
            prev.map((seg, i) => (i === index ? { ...seg, ...updated } : seg))
        );
        showToast('Segment updated');
    }, [showToast]);

    // ===== Reorder Segments =====
    const handleReorder = useCallback((fromIndex, toIndex) => {
        setSegments((prev) => {
            const updated = [...prev];
            const [moved] = updated.splice(fromIndex, 1);
            updated.splice(toIndex, 0, moved);
            return updated;
        });
    }, []);

    // ===== Select / Preview Segment =====
    const handleSelectSegment = useCallback((index) => {
        setActiveSegmentIndex(index);
        const seg = segments[index];
        if (seg && playerRef.current) {
            playerRef.current.seekTo(seg.start);
            playerRef.current.play();
        }
    }, [segments]);

    // ===== Clear All =====
    const handleClearAll = useCallback(() => {
        setSegments([]);
        setActiveSegmentIndex(-1);
        showToast('All segments cleared');
    }, [showToast]);

    // ===== Download / Process =====
    const handleDownload = useCallback(async () => {
        if (segments.length === 0 || !videoUrl) return;

        setProcessing(true);
        setProgress({ step: 'downloading', progress: 0, message: 'Starting...' });

        try {
            // Start processing
            const res = await fetch('/api/process', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: videoUrl,
                    quality: quality,
                    filename: filename,
                    asSingleClips: asSingleClips,
                    watermarkText: watermarkText,
                    segments: segments.map((s) => ({ start: s.start, end: s.end })),
                }),
            });

            const contentType = res.headers.get('content-type');
            let data;
            if (contentType && contentType.includes('application/json')) {
                data = await res.json();
            } else {
                const text = await res.text();
                console.error('Non-JSON response:', text);
                throw new Error(`Server error: received HTML/text instead of JSON. (Status: ${res.status})`);
            }

            if (!res.ok) throw new Error(data.error || 'Processing failed');

            const { jobId } = data;

            // Listen for progress via SSE
            const evtSource = new EventSource(`/api/progress/${jobId}`);

            evtSource.onmessage = (event) => {
                const progressData = JSON.parse(event.data);
                setProgress(progressData);

                if (progressData.step === 'done') {
                    evtSource.close();
                    // Trigger download
                    const link = document.createElement('a');
                    link.href = `/api/file/${jobId}`;
                    const ext = progressData.isZip ? '.zip' : '.mp4';
                    link.download = (filename || 'clipforge_output') + ext;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    showToast('Download started! 🎉');
                    setTimeout(() => {
                        setProcessing(false);
                    }, 2000);
                }

                if (progressData.thumbnails) {
                    setSegments(prev => prev.map((seg, idx) => {
                        if (progressData.thumbnails[idx]) {
                            return { ...seg, thumbnail: progressData.thumbnails[idx] };
                        }
                        return seg;
                    }));
                }

                if (progressData.step === 'error') {
                    evtSource.close();
                    setProcessing(false);
                    showToast(progressData.message, 'error');
                }
            };

            evtSource.onerror = () => {
                evtSource.close();
                // Don't set error immediately — the job might still succeed
                // We'll check progress once more
                setTimeout(async () => {
                    try {
                        const checkRes = await fetch(`/api/file/${jobId}`, { method: 'HEAD' });
                        if (checkRes.ok) {
                            setProgress({ step: 'done', progress: 100, message: 'Processing complete!' });
                            const link = document.createElement('a');
                            link.href = `/api/file/${jobId}`;
                            link.download = 'clipforge_output.mp4';
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                            showToast('Download started! 🎉');
                        } else {
                            setProgress({ step: 'error', progress: 0, message: 'Connection lost during processing' });
                        }
                    } catch {
                        setProgress({ step: 'error', progress: 0, message: 'Connection lost during processing' });
                    }
                    setProcessing(false);
                }, 2000);
            };
        } catch (err) {
            setProgress({ step: 'error', progress: 0, message: err.message });
            setProcessing(false);
        }
    }, [segments, videoUrl, showToast]);

    // ===== Theme Persistence =====
    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('clipforge_theme', theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prev => prev === 'dark' ? 'light' : 'dark');
    };

    // ===== Session Persistence =====
    useEffect(() => {
        if (segments.length > 0) {
            localStorage.setItem('clipforge_segments', JSON.stringify(segments));
        } else {
            localStorage.removeItem('clipforge_segments');
        }
    }, [segments]);

    useEffect(() => {
        if (videoUrl) {
            localStorage.setItem('clipforge_url', videoUrl);
        }
    }, [videoUrl]);

    useEffect(() => {
        const savedUrl = localStorage.getItem('clipforge_url');
        if (savedUrl && !videoUrl) {
            handleLoadVideo(savedUrl);
        }
    }, []);

    // ===== Keyboard Shortcuts =====
    useEffect(() => {
        const handleKey = (e) => {
            // Don't trigger if typing in an input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            if (e.code === 'Space') {
                e.preventDefault();
                playerRef.current?.togglePlay();
            }
            if (e.code === 'KeyA' && !e.metaKey && !e.ctrlKey) {
                e.preventDefault();
                handleAddSegment();
            }
        };

        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [handleAddSegment]);

    // ===== Calculate total duration of segments =====
    const totalSegmentDuration = segments.reduce(
        (sum, seg) => sum + (seg.end - seg.start),
        0
    );

    const videoId = videoInfo ? extractVideoId(videoUrl) : null;

    const handleSliderSlide = useCallback((time) => {
        if (playerRef.current) {
            playerRef.current.seekTo(time);
        }
    }, []);

    const handleSliderSlideEnd = useCallback((time) => {
        if (playerRef.current) {
            playerRef.current.seekTo(time);
            playerRef.current.play();
        }
    }, []);

    const handleTimeUpdate = useCallback((time) => {
        setCurrentTime(time);
        if (activeSegmentIndex !== -1) {
            const seg = segments[activeSegmentIndex];
            if (time >= seg.end) {
                playerRef.current?.seekTo(seg.start);
            }
        }
    }, [activeSegmentIndex, segments]);

    return (
        <div className="app-container">
            <Header 
                theme={theme} 
                onToggleTheme={toggleTheme}
                onLoadVideo={handleLoadVideo}
                isLoading={isLoading}
                quality={quality}
                onQualityChange={setQuality}
            />

            <div className="main-layout">
                <div className="editor-grid">
                    {/* ===== Left Panel: Editing Area ===== */}
                    <div className="editor-main">
                        {videoInfo && (
                            <div className="stage-container fade-in">
                                <div className="video-stage-header">
                                    <div className="video-info-compact">
                                        <h2 className="video-title-small">{videoInfo.title}</h2>
                                        <span className="video-duration-badge">{formatTime(videoInfo.duration)}</span>
                                    </div>
                                </div>

                                <VideoPlayer 
                                    ref={playerRef} 
                                    videoId={videoId} 
                                    onTimeUpdate={handleTimeUpdate}
                                />
                                
                                <div className="editor-controls">
                                    <TimelineSlider
                                        duration={videoInfo.duration}
                                        currentRange={currentRange}
                                        onRangeChange={setCurrentRange}
                                        segments={segments}
                                        onSlide={handleSliderSlide}
                                        onSlideEnd={handleSliderSlideEnd}
                                        currentTime={currentTime}
                                    />

                                    <div className="editor-actions">
                                        <button
                                            id="add-segment-btn"
                                            className="btn btn-primary btn-large"
                                            onClick={handleAddSegment}
                                            disabled={processing}
                                        >
                                            ✂️ Add to Segments
                                        </button>

                                        {activeSegmentIndex !== -1 && (
                                            <button
                                                className="btn btn-danger btn-large"
                                                onClick={() => handleDeleteSegment(activeSegmentIndex)}
                                                disabled={processing}
                                                style={{ minWidth: '140px' }}
                                            >
                                                🗑 Delete Clip
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                        {!videoInfo && !isLoading && (
                            <div className="empty-stage">
                                <div className="empty-icon">📺</div>
                                <p>Enter a YouTube URL to start clipping</p>
                            </div>
                        )}
                    </div>

                    {/* ===== Right Panel: Export & Queue Area ===== */}
                    <div className="editor-sidebar">
                        <SegmentList
                            segments={segments}
                            videoId={videoId}
                            activeIndex={activeSegmentIndex}
                            onSelect={handleSelectSegment}
                            onDelete={handleDeleteSegment}
                            onEdit={handleEditSegment}
                            onReorder={handleReorder}
                            onClearAll={handleClearAll}
                        />

                        {videoInfo && (
                            <div className="export-panel fade-in">
                                <h3 className="panel-title">Export Settings</h3>
                                
                                <div className="input-group">
                                    <label>Output Filename</label>
                                    <div className="filename-input-wrapper">
                                        <input
                                            type="text"
                                            placeholder="video_clip"
                                            value={filename}
                                            onChange={(e) => setFilename(e.target.value)}
                                        />
                                        <span className="extension-badge">.mp4</span>
                                    </div>
                                </div>

                                <div className="input-group">
                                    <label>Watermark Text</label>
                                    <div className="filename-input-wrapper">
                                        <input
                                            type="text"
                                            placeholder="@yourhandle"
                                            value={watermarkText}
                                            onChange={(e) => setWatermarkText(e.target.value)}
                                        />
                                        <span className="extension-badge">🏷️</span>
                                    </div>
                                </div>

                                <div className="input-group">
                                    <label>Export Mode</label>
                                    <div className="export-mode-selector">
                                        <button 
                                            className={`export-mode-btn ${!asSingleClips ? 'active' : ''}`}
                                            onClick={() => setAsSingleClips(false)}
                                        >
                                            🎞️ Merge into One
                                        </button>
                                        <button 
                                            className={`export-mode-btn ${asSingleClips ? 'active' : ''}`}
                                            onClick={() => setAsSingleClips(true)}
                                        >
                                            📦 Separate Clips (ZIP)
                                        </button>
                                    </div>
                                </div>

                                <div className="finalize-actions">
                                    <button
                                        id="download-btn"
                                        className="btn btn-export"
                                        onClick={handleDownload}
                                        disabled={segments.length === 0 || processing}
                                    >
                                        {processing ? 'Processing...' : `Export ${segments.length} Clips`}
                                    </button>
                                    
                                    {segments.length > 0 && (
                                        <div className="total-duration">
                                            Total Length: {formatTime(totalSegmentDuration)}
                                        </div>
                                    )}
                                </div>

                                {progress && <ProgressBar progress={progress} />}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ===== Toast Notification ===== */}
            {toast && (
                <div className={`toast ${toast.type}`}>
                    <span>{toast.type === 'error' ? '❌' : '✅'}</span>
                    {toast.message}
                </div>
            )}
        </div>
    );
}
