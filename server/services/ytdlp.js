import { spawn } from 'child_process';
import path from 'path';

/**
 * Get video metadata using yt-dlp --dump-json
 */
export function getMetadata(url) {
    return new Promise((resolve, reject) => {
        const proc = spawn('python', [
            '-m', 'yt_dlp',
            '--dump-json',
            '--no-playlist',
            '--no-warnings',
            '--force-ipv4',
            '--no-check-certificates',
            '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            url,
        ]);

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        proc.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        proc.on('close', (code) => {
            if (code !== 0) {
                return reject(new Error(`yt-dlp metadata failed: ${stderr}`));
            }
            try {
                const info = JSON.parse(stdout);
                resolve({
                    videoId: info.id,
                    title: info.title || 'Untitled',
                    duration: info.duration || 0,
                    thumbnail: info.thumbnail || info.thumbnails?.[info.thumbnails.length - 1]?.url || '',
                    uploader: info.uploader || '',
                    description: (info.description || '').substring(0, 200),
                });
            } catch (e) {
                reject(new Error(`Failed to parse yt-dlp output: ${e.message}`));
            }
        });

        proc.on('error', (err) => {
            reject(new Error(`Failed to spawn yt-dlp: ${err.message}`));
        });
    });
}

/**
 * Download video using yt-dlp
 * @param {string} url - YouTube video URL
 * @param {string} outputPath - Output file path (without extension)
 * @param {Function} onProgress - Progress callback (0-100)
 * @returns {Promise<string>} - Path to downloaded file
 */
export function downloadVideo(url, outputPath, quality, range, onProgress) {
    return new Promise((resolve, reject) => {
        let formatStr = 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best';

        if (quality === '1080p') {
            formatStr = 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best';
        } else if (quality === '720p') {
            formatStr = 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best';
        } else if (quality === '480p') {
            formatStr = 'bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480][ext=mp4]/best';
        } else if (quality === '360p') {
            formatStr = 'bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/best[height<=360][ext=mp4]/best';
        }

        const outputTemplate = `${outputPath}.%(ext)s`;
        const args = [
            '-m', 'yt_dlp',
            '-f', formatStr,
            '--merge-output-format', 'mp4',
            '--no-playlist',
            '--no-warnings',
            '--newline',
            '--progress',
            '--force-ipv4',
            '--no-check-certificates',
            '--retries', '10',
            '--fragment-retries', '10',
            '--retry-sleep', '5',
            '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            '--downloader', 'ffmpeg',
            '--downloader-args', 'ffmpeg:-headers "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"',
            ...(process.env.FFMPEG_DIR ? ['--ffmpeg-location', process.env.FFMPEG_DIR] : []),
        ];

        // Add section if provided
        if (range) {
            args.push('--download-sections', `*${range.start}-${range.end}`);
        }

        args.push('-o', outputTemplate, url);

        const proc = spawn('python', args);

        let stderr = '';
        let lastProgress = 0;

        proc.stdout.on('data', (data) => {
            const lines = data.toString().split('\n');
            for (const line of lines) {
                // Regex to capture: [download]  10.0% of ~20.00MiB at  2.50MiB/s ETA 00:04
                const match = line.match(/\[download\]\s+(\d+\.?\d*)%.*at\s+([\w./]+s).*ETA\s+([\d:]+)/);
                if (match) {
                    const pct = parseFloat(match[1]);
                    const speed = match[2];
                    const eta = match[3];
                    
                    if (pct > lastProgress) {
                        lastProgress = pct;
                        onProgress?.({
                            percent: Math.min(pct, 100),
                            speed: speed,
                            eta: eta
                        });
                    }
                } else {
                    // Fallback for simple percentage match
                    const simpleMatch = line.match(/(\d+\.?\d*)%/);
                    if (simpleMatch) {
                        const pct = parseFloat(simpleMatch[1]);
                        if (pct > lastProgress) {
                            lastProgress = pct;
                            onProgress?.({ percent: Math.min(pct, 100) });
                        }
                    }
                }
            }
        });

        proc.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        proc.on('close', (code) => {
            if (code !== 0) {
                return reject(new Error(`yt-dlp download failed: ${stderr}`));
            }
            // Find the actual output file
            const finalPath = `${outputPath}.mp4`;
            resolve(finalPath);
        });

        proc.on('error', (err) => {
            reject(new Error(`Failed to spawn yt-dlp: ${err.message}`));
        });
    });
}
