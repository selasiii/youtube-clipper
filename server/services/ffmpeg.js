import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * Cut a segment from a video file using FFmpeg
 * @param {string} inputPath - Input video file path
 * @param {number} start - Start time in seconds
 * @param {number} end - End time in seconds
 * @param {string} outputPath - Output segment file path
 * @returns {Promise<void>}
 */
export function cutSegment(inputPath, start, end, outputPath) {
    return new Promise((resolve, reject) => {
        const proc = spawn(process.env.FFMPEG_PATH || 'ffmpeg', [
            '-y',
            '-ss', String(start),
            '-to', String(end),
            '-i', inputPath,
            '-c', 'copy',
            '-avoid_negative_ts', '1',
            outputPath,
        ]);

        let stderr = '';

        proc.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        proc.on('close', (code) => {
            if (code !== 0) {
                return reject(new Error(`FFmpeg cut failed: ${stderr.slice(-500)}`));
            }
            resolve();
        });

        proc.on('error', (err) => {
            reject(new Error(`Failed to spawn FFmpeg: ${err.message}`));
        });
    });
}

/**
 * Merge multiple video segments into a single file using FFmpeg concat
 * @param {string[]} segmentPaths - Array of segment file paths
 * @param {string} outputPath - Output merged file path
 * @returns {Promise<void>}
 */
export function mergeSegments(segmentPaths, outputPath) {
    return new Promise((resolve, reject) => {
        // Create the concat list file
        const listPath = outputPath.replace('.mp4', '_list.txt');
        const listContent = segmentPaths
            .map((p) => `file '${p}'`)
            .join('\n');

        fs.writeFileSync(listPath, listContent);

        const proc = spawn(process.env.FFMPEG_PATH || 'ffmpeg', [
            '-y',
            '-f', 'concat',
            '-safe', '0',
            '-i', listPath,
            '-c', 'copy',
            outputPath,
        ]);

        let stderr = '';

        proc.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        proc.on('close', (code) => {
            // Clean up list file
            try { fs.unlinkSync(listPath); } catch { }

            if (code !== 0) {
                return reject(new Error(`FFmpeg merge failed: ${stderr.slice(-500)}`));
            }
            resolve();
        });

        proc.on('error', (err) => {
            reject(new Error(`Failed to spawn FFmpeg: ${err.message}`));
        });
    });
}
/**
 * Extract a thumbnail from a video file at a specific time
 * @param {string} inputPath - Video file path
 * @param {number} time - Time in seconds to grab frame
 * @param {string} outputPath - Output image file path
 * @returns {Promise<void>}
 */
export function extractThumbnail(inputPath, time, outputPath) {
    return new Promise((resolve, reject) => {
        const proc = spawn(process.env.FFMPEG_PATH || 'ffmpeg', [
            '-y',
            '-ss', String(time),
            '-i', inputPath,
            '-vframes', '1',
            '-q:v', '2',
            outputPath,
        ]);

        proc.on('close', (code) => {
            if (code !== 0) return reject(new Error('FFmpeg thumbnail failed'));
            resolve();
        });

        proc.on('error', (err) => {
            reject(new Error(`Failed to spawn FFmpeg: ${err.message}`));
        });
    });
}

/**
 * Add a text watermark to a video file
 * @param {string} inputPath - Input video file path
 * @param {string} outputPath - Output video file path
 * @param {string} text - Watermark text
 * @returns {Promise<void>}
 */
export function addWatermark(inputPath, outputPath, text) {
    return new Promise((resolve, reject) => {
        // Position: Bottom Right (x=w-tw-20:y=h-th-20)
        const proc = spawn(process.env.FFMPEG_PATH || 'ffmpeg', [
            '-y',
            '-i', inputPath,
            '-vf', `drawtext=text='${text}':x=w-tw-20:y=h-th-20:fontsize=28:fontcolor=white:box=1:boxcolor=black@0.4:boxborderw=5`,
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-crf', '23',
            '-c:a', 'copy',
            outputPath,
        ]);

        proc.on('close', (code) => {
            if (code !== 0) return reject(new Error('FFmpeg watermarking failed'));
            resolve();
        });

        proc.on('error', (err) => {
            reject(new Error(`Failed to spawn FFmpeg: ${err.message}`));
        });
    });
}
