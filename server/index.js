import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { getMetadata, downloadVideo } from './services/ytdlp.js';
import { cutSegment, mergeSegments, extractThumbnail, addWatermark } from './services/ffmpeg.js';
import { metadataLimiter, processLimiter } from './middleware/rateLimiter.js';
import archiver from 'archiver';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMP_DIR = path.join(__dirname, 'temp');
const MAX_DURATION = 3600; // 1 hour in seconds

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

const app = express();
app.use(cors());
app.use(express.json());

// ============ SSE Progress Store ============
const jobProgress = new Map();

function updateProgress(jobId, step, progress, message, extra = {}) {
    const current = jobProgress.get(jobId) || {};
    const data = { 
        ...current, 
        step, 
        progress, 
        message, 
        ...extra, 
        timestamp: Date.now() 
    };
    jobProgress.set(jobId, data);
}

// ============ ROUTES ============

// Get video metadata
app.post('/api/metadata', metadataLimiter, async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        // Basic YouTube URL validation
        const ytRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)/;
        if (!ytRegex.test(url)) {
            return res.status(400).json({ error: 'Invalid YouTube URL' });
        }

        const metadata = await getMetadata(url);

        if (metadata.duration > MAX_DURATION) {
            return res.status(400).json({
                error: `Video is too long (${Math.round(metadata.duration / 60)} min). Maximum allowed duration is 60 minutes.`,
            });
        }

        res.json(metadata);
    } catch (err) {
        console.error('Metadata error for URL:', req.body.url);
        console.error('Error detail:', err.message);
        res.status(500).json({ 
            error: 'Failed to fetch video metadata.',
            details: err.message
        });
    }
});

// SSE Progress endpoint
app.get('/api/progress/:jobId', (req, res) => {
    const { jobId } = req.params;

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
    });

    const interval = setInterval(() => {
        const data = jobProgress.get(jobId);
        if (data) {
            res.write(`data: ${JSON.stringify(data)}\n\n`);
            if (data.step === 'done' || data.step === 'error') {
                clearInterval(interval);
                setTimeout(() => res.end(), 500);
            }
        }
    }, 300);

    req.on('close', () => {
        clearInterval(interval);
    });
});

// Process video segments
app.post('/api/process', processLimiter, async (req, res) => {
    const { url, segments } = req.body;

    if (!url || !segments || !Array.isArray(segments) || segments.length === 0) {
        return res.status(400).json({ error: 'URL and segments array are required' });
    }

    if (segments.length > 20) {
        return res.status(400).json({ error: 'Maximum 20 segments allowed' });
    }

    const jobId = uuidv4();
    const jobDir = path.join(TEMP_DIR, jobId);
    fs.mkdirSync(jobDir, { recursive: true });

    const { filename, asSingleClips, watermarkText } = req.body;

    // Immediately return the job ID
    res.json({ jobId });

    // Process in background
    try {
        const { quality } = req.body;
        const outputPath = asSingleClips 
            ? path.join(jobDir, 'output.zip') 
            : path.join(jobDir, 'output.mp4');
            
        const segmentPaths = [];
        const thumbDataMap = {}; // index -> base64 thumb

        // Step 1: Download each segment partially
        for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];
            const segPath = path.join(jobDir, `segment_${i}.mp4`);
            const thumbPath = path.join(jobDir, `thumb_${i}.jpg`);
            
            updateProgress(jobId, 'downloading', Math.round((i / segments.length) * 100), `Downloading clip ${i + 1} of ${segments.length}...`, { 
                filename: filename || 'clipforge_output' 
            });
            
            await downloadVideo(url, segPath.replace('.mp4', ''), quality, seg, (data) => {
                const subPct = (data.percent / 100) * (100 / segments.length);
                const totalPct = (i / segments.length) * 100 + subPct;
                const msg = `Downloading clip ${i + 1}/${segments.length}: ${Math.round(data.percent)}% ${data.speed ? `(${data.speed})` : ''}`;
                
                updateProgress(jobId, 'downloading', Math.round(totalPct), msg, { 
                    speed: data.speed, 
                    eta: data.eta 
                });
            });

            // Step 1.1: Apply Watermark
            if (watermarkText) {
                updateProgress(jobId, 'downloading', Math.round(((i + 0.5) / segments.length) * 100), `Watermarking clip ${i + 1}...`);
                const wmPath = path.join(jobDir, `wm_segment_${i}.mp4`);
                try {
                    await addWatermark(segPath, wmPath, watermarkText);
                    fs.renameSync(wmPath, segPath);
                } catch (err) {
                    console.warn(`Watermarking failed for clip ${i}:`, err.message);
                }
            }

            segmentPaths.push(segPath);

            // Step 1b: Extract Thumbnail
            try {
                await extractThumbnail(segPath, 0.5, thumbPath);
                const base64 = fs.readFileSync(thumbPath, { encoding: 'base64' });
                thumbDataMap[i] = `data:image/jpeg;base64,${base64}`;
                updateProgress(jobId, 'downloading', Math.round(((i + 1) / segments.length) * 100), `Generated thumbnail for clip ${i + 1}`, {
                    thumbnails: thumbDataMap
                });
            } catch (err) {
                console.warn(`Failed to generate thumbnail for clip ${i}:`, err.message);
            }
        }

        // Step 2: Finalize output (Merge or ZIP)
        if (asSingleClips) {
            updateProgress(jobId, 'merging', 0, 'Creating ZIP archive...');
            const output = fs.createWriteStream(outputPath);
            const archive = archiver('zip', { zlib: { level: 9 } });

            await new Promise((resolve, reject) => {
                output.on('close', resolve);
                archive.on('error', reject);
                archive.pipe(output);

                segmentPaths.forEach((p, idx) => {
                    const name = `${filename || 'clip'}_${idx + 1}.mp4`;
                    archive.file(p, { name });
                });

                archive.finalize();
            });
        } else {
            updateProgress(jobId, 'merging', 0, 'Merging clips together...');
            if (segmentPaths.length === 1) {
                fs.copyFileSync(segmentPaths[0], outputPath);
            } else {
                await mergeSegments(segmentPaths, outputPath);
            }
        }

        updateProgress(jobId, 'done', 100, 'Processing complete! Ready for download.', {
            isZip: asSingleClips
        });
    } catch (err) {
        console.error('Processing error:', err.message);
        updateProgress(jobId, 'error', 0, `Processing failed: ${err.message}`);
    }
});

// Download processed file
app.get('/api/file/:jobId', (req, res) => {
    const { jobId } = req.params;
    const isZip = fs.existsSync(path.join(TEMP_DIR, jobId, 'output.zip'));
    const filePath = isZip 
        ? path.join(TEMP_DIR, jobId, 'output.zip') 
        : path.join(TEMP_DIR, jobId, 'output.mp4');

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found or still processing' });
    }

    const stat = fs.statSync(filePath);
    const data = jobProgress.get(jobId) || {};
    let downloadName = data.filename || 'clipforge_output';
    const ext = isZip ? '.zip' : '.mp4';
    if (!downloadName.endsWith(ext)) downloadName += ext;

    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Type', isZip ? 'application/zip' : 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
});

// ============ TEMP FILE CLEANUP ============
// Delete job directories older than 30 minutes
setInterval(() => {
    try {
        const entries = fs.readdirSync(TEMP_DIR);
        const now = Date.now();
        for (const entry of entries) {
            const dirPath = path.join(TEMP_DIR, entry);
            const stat = fs.statSync(dirPath);
            if (stat.isDirectory() && now - stat.mtimeMs > 30 * 60 * 1000) {
                fs.rmSync(dirPath, { recursive: true, force: true });
                jobProgress.delete(entry);
                console.log(`Cleaned up: ${entry}`);
            }
        }
    } catch { }
}, 5 * 60 * 1000); // Every 5 minutes

// ============ START SERVER ============
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`🚀 ClipForge server running at http://localhost:${PORT}`);
});
