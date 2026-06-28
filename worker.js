// Web Worker for speech-to-text transcription using Transformers.js
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.0';

// Configure Environment: Disable local model checks, use Hugging Face CDN
env.allowLocalModels = false;

let transcriber = null;

// Track progress of model downloads
const fileProgressMap = new Map();

const progressCallback = (data) => {
    if (data.status === 'progress') {
        fileProgressMap.set(data.file, data.progress);
        
        // Calculate average progress across all active downloads
        let totalProgress = 0;
        fileProgressMap.forEach((progress) => {
            totalProgress += progress;
        });
        const averageProgress = totalProgress / fileProgressMap.size;

        self.postMessage({
            type: 'progress',
            status: 'downloading',
            file: data.file,
            progress: averageProgress
        });
    } else if (data.status === 'ready') {
        self.postMessage({
            type: 'progress',
            status: 'ready',
            message: 'Model is ready!'
        });
    }
};

// Listen for messages from the main thread
self.onmessage = async (event) => {
    const { type, audioData } = event.data;

    if (type === 'load') {
        try {
            self.postMessage({ type: 'status', message: 'Initializing Whisper model...' });
            
            // Load the model
            transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', {
                revision: 'output_attentions',
                progress_callback: progressCallback,
            });

            self.postMessage({ type: 'ready' });
        } catch (error) {
            self.postMessage({ type: 'error', error: `Failed to load model: ${error.message}` });
        }
    } 
    else if (type === 'transcribe') {
        try {
            if (!transcriber) {
                // Auto-load if not already done
                transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', {
                    revision: 'output_attentions',
                    progress_callback: progressCallback,
                });
            }

            self.postMessage({ type: 'status', message: 'Analyzing speech and generating timestamps...' });

            const start = performance.now();
            const output = await transcriber(audioData, {
                chunk_length_s: 30,
                stride_length_s: 5,
                return_timestamps: 'word',
            });
            const duration = (performance.now() - start) / 1000;

            self.postMessage({
                type: 'completed',
                result: output,
                duration: duration
            });
        } catch (error) {
            self.postMessage({ type: 'error', error: `Transcription failed: ${error.message}` });
        }
    }
};
