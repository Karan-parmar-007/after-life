import multer from "multer";
import sharp from "sharp";
import { Request, Response, NextFunction } from "express";
import stream from "stream";
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from '@ffprobe-installer/ffprobe';
import ffmpeg from 'fluent-ffmpeg';

// Validate FFmpeg paths
if (!ffmpegStatic || !ffprobeStatic.path) {
    throw new Error('FFmpeg binaries not found');
}
ffmpeg.setFfmpegPath(ffmpegStatic);
ffmpeg.setFfprobePath(ffprobeStatic.path);

// Configure multer
const storage = multer.memoryStorage();
const multerUpload = multer({
    storage,
    limits: { fileSize: 100 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const validMimes = [
            'image/jpeg', 
            'image/png', 
            'image/webp',
            'video/mp4',
            'video/webm',
            'video/quicktime',
            'application/octet-stream' // Fallback for some browser recordings
        ];
        
        if (validMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            // Check file extension as fallback
            const fileExt = file.originalname.split('.').pop()?.toLowerCase();
            if (['mp4', 'webm', 'mov'].includes(fileExt || '')) {
                // Override mimetype if extension matches
                file.mimetype = `video/${fileExt}`;
                cb(null, true);
            } else {
                cb(new Error('Invalid file type'));
            }
        }
    }
});

const optimizeMedia = async (req: Request, res: Response, next: NextFunction) => {
    if (!req.file) return next();

    try {
        const { mimetype, buffer, originalname } = req.file;

        if (!buffer || buffer.length === 0) {
            throw new Error('Empty file buffer');
        }

        if (mimetype.startsWith('image/')) {
            req.file.buffer = await sharp(buffer)
                .resize({ width: 1920, fit: 'inside' })
                .jpeg({ quality: 80 })
                .toBuffer();
            return next();
        }

        if (mimetype.startsWith('video/')) {
            return new Promise<void>((resolve, reject) => {
                const inputStream = new stream.PassThrough();
                inputStream.end(buffer);

                const chunks: Buffer[] = [];
                const outputStream = new stream.PassThrough();

                const fileExt = originalname.split('.').pop()?.toLowerCase();
                const isWebM = mimetype === 'video/webm' || fileExt === 'webm';

                const command = ffmpeg(inputStream)
                    .inputFormat(isWebM ? 'webm' : '')
                    .outputFormat('mp4')
                    .videoCodec('libx264')
                    .audioCodec('aac')
                    .outputOptions([
                        '-movflags frag_keyframe+empty_moov', // Changed from +faststart
                        '-preset fast',
                        '-crf 23',
                        '-pix_fmt yuv420p',
                        '-frag_duration 100000', // Helps with streaming
                        '-reset_timestamps 1' // Important for piped input
                    ])
                    .on('start', (cmd) => console.log('Executing:', cmd))
                    .on('progress', (progress) => console.log(`Processing: ${progress.timemark}`))
                    .on('error', (err, stdout, stderr) => {
                        console.error('FFmpeg stderr:', stderr);
                        reject(new Error(`Video processing failed: ${err.message}`));
                    })
                    .on('end', () => {
                        console.log('Video processing completed');
                        resolve();
                    });

                outputStream.on('data', (chunk) => chunks.push(chunk));
                outputStream.on('end', () => {
                    req.file!.buffer = Buffer.concat(chunks);
                    req.file!.mimetype = 'video/mp4';
                    req.file!.originalname = originalname.replace(/\.[^.]+$/, '.mp4');
                    next();
                });

                command.pipe(outputStream, { end: true });
            });
        }

        next();
    } catch (error) {
        console.error('Media processing error:', error);
        next(error);
    }
};

export { multerUpload, optimizeMedia };