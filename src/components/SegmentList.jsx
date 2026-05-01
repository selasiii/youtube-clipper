import React, { useState } from 'react';
import SegmentItem from './SegmentItem.jsx';

export default function SegmentList({
    segments,
    videoId,
    activeIndex,
    onSelect,
    onDelete,
    onEdit,
    onReorder,
    onClearAll,
}) {
    const [dragIndex, setDragIndex] = useState(null);

    const handleDragStart = (e, index) => {
        setDragIndex(index);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = (e, dropIndex) => {
        e.preventDefault();
        if (dragIndex !== null && dragIndex !== dropIndex) {
            onReorder(dragIndex, dropIndex);
        }
        setDragIndex(null);
    };

    return (
        <div className="right-panel">
            <div className="segment-list-header">
                <div className="card-title">
                    📋 Segments
                    {segments.length > 0 && (
                        <span className="segment-count">{segments.length}</span>
                    )}
                </div>
                {segments.length > 0 && (
                    <button
                        className="btn btn-danger btn-small"
                        onClick={onClearAll}
                        id="clear-all-btn"
                    >
                        Clear All
                    </button>
                )}
            </div>

            <div className="segment-list">
                {segments.length === 0 ? (
                    <div className="segment-empty">
                        <div className="segment-empty-icon">✂️</div>
                        <p>No segments added yet.</p>
                        <p style={{ fontSize: '12px', marginTop: '8px', color: 'var(--text-muted)' }}>
                            Use the timeline slider to select a portion,<br />
                            then click "Add Segment".
                        </p>
                    </div>
                ) : (
                    segments.map((seg, i) => (
                        <SegmentItem
                            key={seg.id}
                            segment={seg}
                            videoId={videoId}
                            index={i}
                            isActive={i === activeIndex}
                            onClick={onSelect}
                            onDelete={onDelete}
                            onEdit={onEdit}
                            onDragStart={handleDragStart}
                            onDragOver={handleDragOver}
                            onDrop={handleDrop}
                        />
                    ))
                )}
            </div>
        </div>
    );
}
