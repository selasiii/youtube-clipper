import React, { useEffect, useRef, useCallback, useState } from 'react';
import noUiSlider from 'nouislider';
import 'nouislider/dist/nouislider.css';
import { formatTime } from '../utils/formatTime.js';

export default function TimelineSlider({
    duration,
    currentRange,
    onRangeChange,
    segments,
    onSlide,
    onSlideEnd,
    currentTime = 0,
}) {
    const sliderRef = useRef(null);
    const sliderInstance = useRef(null);
    const [isZoomed, setIsZoomed] = useState(false);

    // Initialize / recreate slider when duration or zoom changes
    useEffect(() => {
        if (!duration || !sliderRef.current) return;

        // Destroy existing
        if (sliderInstance.current) {
            sliderInstance.current.destroy();
        }

        let min = 0;
        let max = duration;

        if (isZoomed) {
            // Focus on current selection +/- 30s
            min = Math.max(0, currentRange[0] - 30);
            max = Math.min(duration, currentRange[1] + 30);
        }

        const slider = noUiSlider.create(sliderRef.current, {
            start: [currentRange[0], currentRange[1]],
            connect: true,
            range: {
                min: min,
                max: max,
            },
            step: 0.1,
            tooltips: [
                { to: (v) => formatTime(v) },
                { to: (v) => formatTime(v) },
            ],
            behaviour: 'drag-tap',
        });

        slider.on('update', (values) => {
            onRangeChange([parseFloat(values[0]), parseFloat(values[1])]);
        });

        slider.on('slide', (values, handle) => {
            if (onSlide) {
                onSlide(parseFloat(values[handle]));
            }
        });

        slider.on('change', (values, handle) => {
            if (onSlideEnd) {
                onSlideEnd(parseFloat(values[handle]));
            }
        });

        sliderInstance.current = slider;

        return () => {
            if (sliderInstance.current) {
                sliderInstance.current.destroy();
                sliderInstance.current = null;
            }
        };
    }, [duration, isZoomed]);

    const handleNudge = (handleIdx, amount) => {
        if (!sliderInstance.current) return;
        const newValues = [...currentRange];
        newValues[handleIdx] = Math.max(0, Math.min(duration, newValues[handleIdx] + amount));
        sliderInstance.current.set(newValues);
        if (onSlide) onSlide(newValues[handleIdx]);
        if (onSlideEnd) onSlideEnd(newValues[handleIdx]);
    };

    const toggleZoom = () => {
        setIsZoomed(!isZoomed);
    };

    // Calculate positions based on current slider range
    const sliderMin = isZoomed ? Math.max(0, currentRange[0] - 30) : 0;
    const sliderMax = isZoomed ? Math.min(duration, currentRange[1] + 30) : duration;
    const sliderSpan = sliderMax - sliderMin;

    const getPos = (time) => ((time - sliderMin) / sliderSpan) * 100;

    // Render segment markers
    const markers = segments.map((seg, i) => {
        const left = getPos(seg.start);
        const width = ((seg.end - seg.start) / sliderSpan) * 100;
        
        // Don't render if completely outside zoom
        if (left + width < 0 || left > 100) return null;

        return (
            <div
                key={i}
                className="timeline-marker"
                style={{ 
                    left: `${Math.max(0, left)}%`, 
                    width: `${Math.min(100 - Math.max(0, left), width)}%` 
                }}
                title={`Clip ${i + 1}`}
            />
        );
    });

    const playheadPos = getPos(currentTime);
    const showPlayhead = playheadPos >= 0 && playheadPos <= 100;

    return (
        <div className="timeline-section advanced-timeline">
            <div className="slider-wrapper">
                <div ref={sliderRef} id="timeline-slider" />
                {duration > 0 && (
                    <div className="timeline-markers-container">
                        {markers}
                        {showPlayhead && (
                            <div 
                                className="timeline-playhead" 
                                style={{ left: `${playheadPos}%` }}
                            />
                        )}
                    </div>
                )}
            </div>

            <div className="nudge-controls">
                {/* Start Handle Controls */}
                <div className="nudge-group">
                    <div className="nudge-header">
                        <label>Start</label>
                        <button className="btn-icon" onClick={() => playerRef.current?.seekTo(currentRange[0])} title="Jump to start">🎯</button>
                    </div>
                    <div className="nudge-btns">
                        <button onClick={() => handleNudge(0, -1)} title="-1s">«</button>
                        <button onClick={() => handleNudge(0, -0.1)} title="-0.1s">‹</button>
                        <span className="nudge-value">{formatTime(currentRange[0])}</span>
                        <button onClick={() => handleNudge(0, 0.1)} title="+0.1s">›</button>
                        <button onClick={() => handleNudge(0, 1)} title="+1s">»</button>
                    </div>
                </div>

                <div className="selection-info-group">
                    <div className="selection-info">
                        <span className="selection-label">Selection</span>
                        <span className="selection-value">{formatTime(currentRange[1] - currentRange[0])}</span>
                    </div>
                    <button 
                        className={`btn-zoom ${isZoomed ? 'active' : ''}`} 
                        onClick={toggleZoom}
                        title={isZoomed ? "Show full timeline" : "Zoom into selection"}
                    >
                        {isZoomed ? '🔍 Zoom Out' : '🔍 Zoom In'}
                    </button>
                </div>

                {/* End Handle Controls */}
                <div className="nudge-group end-group">
                    <div className="nudge-header">
                        <button className="btn-icon" onClick={() => playerRef.current?.seekTo(currentRange[1])} title="Jump to end">🎯</button>
                        <label>End</label>
                    </div>
                    <div className="nudge-btns">
                        <button onClick={() => handleNudge(1, -1)} title="-1s">«</button>
                        <button onClick={() => handleNudge(1, -0.1)} title="-0.1s">‹</button>
                        <span className="nudge-value">{formatTime(currentRange[1])}</span>
                        <button onClick={() => handleNudge(1, 0.1)} title="+0.1s">›</button>
                        <button onClick={() => handleNudge(1, 1)} title="+1s">»</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
