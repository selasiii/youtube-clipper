import React from 'react';

const STEPS = [
    { key: 'downloading', label: 'Download & Clip', icon: '⚡' },
    { key: 'merging', label: 'Merge', icon: '🔗' },
    { key: 'done', label: 'Done', icon: '✅' },
];

export default function ProgressBar({ progress }) {
    if (!progress) return null;

    const { step, progress: pct, message, speed, eta } = progress;
    const isError = step === 'error';
    const isDone = step === 'done';

    const currentStepIndex = STEPS.findIndex((s) => s.key === step);

    // Calculate overall progress
    let overallPct = 0;
    if (isDone) {
        overallPct = 100;
    } else if (isError) {
        overallPct = 0;
    } else {
        const stepsWeight = 100 / STEPS.length;
        overallPct = currentStepIndex * stepsWeight + (pct / 100) * stepsWeight;
    }

    const renderStepIcon = (i, status) => {
        if (status === 'completed') return '✓';
        if (status === 'error') return '✕';
        return i + 1;
    };

    return (
        <div className="progress-container fade-in">
            <div className="progress-steps">
                {STEPS.map((s, i) => {
                    let status = '';
                    if (isError && i === currentStepIndex) status = 'error';
                    else if (i < currentStepIndex || isDone) status = 'completed';
                    else if (i === currentStepIndex) status = 'active';

                    return (
                        <div key={s.key} className={`progress-step ${status}`}>
                            <div className="progress-step-dot">
                                {renderStepIcon(i, status)}
                            </div>
                            <span className="progress-step-label">{s.label}</span>
                        </div>
                    );
                })}
            </div>

            <div className="progress-bar-track">
                <div
                    className="progress-bar-fill"
                    style={{ width: `${overallPct}%` }}
                />
            </div>

            <div className="progress-info-row">
                <p className={`progress-message ${isError ? 'progress-error' : ''}`}>
                    {message}
                </p>
                {speed && !isDone && (
                    <div className="progress-stats fade-in">
                        <span className="progress-stat-item">🚀 {speed}</span>
                        <span className="progress-stat-item">⏳ ETA: {eta}</span>
                    </div>
                )}
            </div>

            {isDone && (
                <div className="fade-in" style={{ textAlign: 'center', marginTop: '16px', padding: '12px', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                    <span style={{ fontSize: '13px', color: 'var(--color-success)', fontWeight: '600' }}>
                        Processing complete! Ready for download.
                    </span>
                </div>
            )}
        </div>
    );
}
