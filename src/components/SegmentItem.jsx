import React, { useState } from 'react';
import { formatTime, parseTime } from '../utils/formatTime.js';

export default function SegmentItem({
    segment,
    videoId,
    index,
    isActive,
    onClick,
    onDelete,
    onEdit,
    onDragStart,
    onDragOver,
    onDrop,
}) {
    const [isEditing, setIsEditing] = useState(false);
    const [editStart, setEditStart] = useState('');
    const [editEnd, setEditEnd] = useState('');

    const handleEditStart = (e) => {
        e.stopPropagation();
        setEditStart(formatTime(segment.start));
        setEditEnd(formatTime(segment.end));
        setIsEditing(true);
    };

    const handleEditSave = (e) => {
        e.stopPropagation();
        const newStart = parseTime(editStart);
        const newEnd = parseTime(editEnd);
        if (newStart < newEnd) {
            onEdit(index, { start: newStart, end: newEnd });
        }
        setIsEditing(false);
    };

    const handleEditCancel = (e) => {
        e.stopPropagation();
        setIsEditing(false);
    };

    const segDuration = segment.end - segment.start;
    const thumbnailUrl = segment.thumbnail || (videoId ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg` : null);

    return (
        <div
            className={`segment-item fade-in ${isActive ? 'active' : ''}`}
            onClick={() => onClick(index)}
            draggable
            onDragStart={(e) => onDragStart(e, index)}
            onDragOver={onDragOver}
            onDrop={(e) => onDrop(e, index)}
        >
            <div className="segment-drag-handle" title="Drag to reorder">⠿</div>
            
            <div className="segment-thumbnail-container">
                {thumbnailUrl && <img src={thumbnailUrl} alt="Thumbnail" className="segment-thumbnail-img" />}
                <div className="segment-number-badge">{index + 1}</div>
            </div>

            <div className="segment-times">
                {isEditing ? (
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <input
                            className="segment-edit-input"
                            value={editStart}
                            onChange={(e) => setEditStart(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            placeholder="00:00:00"
                            autoFocus
                        />
                        <span className="time-arrow">→</span>
                        <input
                            className="segment-edit-input"
                            value={editEnd}
                            onChange={(e) => setEditEnd(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            placeholder="00:00:00"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleEditSave(e);
                                if (e.key === 'Escape') handleEditCancel(e);
                            }}
                        />
                        <button
                            className="segment-action-btn"
                            onClick={handleEditSave}
                            title="Save"
                            style={{ color: 'var(--success)' }}
                        >
                            ✓
                        </button>
                        <button
                            className="segment-action-btn"
                            onClick={handleEditCancel}
                            title="Cancel"
                        >
                            ✕
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="segment-time-range">
                            {formatTime(segment.start)} → {formatTime(segment.end)}
                        </div>
                        <div className="segment-duration">
                            Duration: {formatTime(segDuration)}
                        </div>
                    </>
                )}
            </div>

            {!isEditing && (
                <div className="segment-actions">
                    <button
                        className="segment-action-btn"
                        onClick={handleEditStart}
                        title="Edit segment"
                    >
                        ✏️
                    </button>
                    <button
                        className="segment-action-btn delete"
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete(index);
                        }}
                        title="Delete segment"
                    >
                        🗑
                    </button>
                </div>
            )}
        </div>
    );
}
