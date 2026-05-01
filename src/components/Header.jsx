import React from 'react';
import VideoInput from './VideoInput.jsx';

export default function Header({ theme, onToggleTheme, onLoadVideo, isLoading, quality, onQualityChange }) {
    return (
        <header className="header">
            <div className="header-brand">
                <div className="header-logo">🎬</div>
                <h1 className="header-title">ClipForge</h1>
            </div>

            <div className="header-center">
                <VideoInput 
                    onLoadVideo={onLoadVideo} 
                    isLoading={isLoading} 
                    quality={quality}
                    onQualityChange={onQualityChange}
                />
            </div>

            <div className="header-right">
                <button 
                    className="theme-toggle" 
                    onClick={onToggleTheme}
                    title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                >
                    {theme === 'dark' ? '☀️' : '🌙'}
                </button>
            </div>
        </header>
    );
}
