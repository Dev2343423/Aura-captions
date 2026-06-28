// UI Elements
const dropzone = document.getElementById('dropzone');
const videoUpload = document.getElementById('video-upload');
const previewContainer = document.getElementById('preview-container');
const videoPlayer = document.getElementById('video-player');
const captionCanvas = document.getElementById('caption-canvas');
const ctx = captionCanvas.getContext('2d');

const btnPlayPause = document.getElementById('btn-play-pause');
const iconPlay = document.getElementById('icon-play');
const iconPause = document.getElementById('icon-pause');
const timeDisplay = document.getElementById('time-display');

const controlPanel = document.getElementById('control-panel');
const fontSelect = document.getElementById('font-family');
const fontUpload = document.getElementById('font-upload');
const fontUploadName = document.getElementById('font-upload-name');
const fontSizeRange = document.getElementById('font-size');
const fontSizeVal = document.getElementById('font-size-val');
const positionRange = document.getElementById('caption-position');
const positionVal = document.getElementById('caption-position-val');
const swatches = document.querySelectorAll('.color-swatches .swatch');
const styleSelect = document.getElementById('caption-style');
const unspokenOpacityRange = document.getElementById('unspoken-opacity');
const unspokenOpacityVal = document.getElementById('unspoken-opacity-val');
const fadeSpeedSelect = document.getElementById('word-fade-speed');

const textStrokeToggle = document.getElementById('text-stroke-toggle');
const bgTiles = document.querySelectorAll('.bg-tile');
const bgTileCustom = document.getElementById('bg-tile-custom');
const bgCustomColorInput = document.getElementById('bg-custom-color');

const transcriptEditorGroup = document.getElementById('transcript-editor-group');
const transcriptList = document.getElementById('transcript-list');

const btnTranscribe = document.getElementById('btn-transcribe');
const btnExport = document.getElementById('btn-export');
const btnReset = document.getElementById('btn-reset');

const previewModal = document.getElementById('preview-modal');
const previewVideoPlayer = document.getElementById('preview-video-player');
const btnModalDownload = document.getElementById('btn-modal-download');
const btnModalClose = document.getElementById('btn-modal-close');

const statusOverlay = document.getElementById('status-overlay');
const statusTitle = document.getElementById('status-title');
const statusMessage = document.getElementById('status-message');
const statusProgress = document.getElementById('status-progress');
const statusPercent = document.getElementById('status-percent');

// Application State
let videoFile = null;
let videoUrl = null;
let worker = null;
let captions = []; // List of grouped caption segments
let isTranscribed = false;
let isExporting = false;
let highlightColor = '#FFDE4D'; // Default Cyber Yellow
let animationFrameId = null;

// Custom fonts loaded by the user
let customFonts = [];
let currentExportUrl = null;
let currentExportMimeType = '';

// Web Audio API routing state
let audioCtx = null;
let audioSource = null;
let audioDest = null;
let isAudioConnected = false;

// 1. Initialize Web Worker
function initWorker() {
    if (worker) worker.terminate();
    worker = new Worker('worker.js', { type: 'module' });

    worker.onmessage = (event) => {
        const { type, status, file, progress, message, result, error } = event.data;

        if (type === 'progress') {
            statusProgress.classList.remove('indeterminate');
            statusTitle.innerText = 'Downloading AI Model...';
            statusMessage.innerText = `Fetching Whisper weights. Loaded from: ${file.split('/').pop()}`;
            const roundedProgress = Math.round(progress);
            statusProgress.style.width = `${roundedProgress}%`;
            statusPercent.innerText = `${roundedProgress}%`;
        } 
        else if (type === 'status') {
            statusProgress.classList.add('indeterminate');
            statusTitle.innerText = 'Generating captions...';
            statusMessage.innerText = 'Please wait for a few seconds';
            statusPercent.innerText = 'Processing...';
        }
        else if (type === 'ready') {
            statusTitle.innerText = 'Transcribing...';
            statusMessage.innerText = 'Listening to the audio track...';
        }
        else if (type === 'completed') {
            hideStatus();
            
            // Process Whisper chunks into words and group into captions
            if (result && result.chunks) {
                captions = groupWordsIntoSegments(result.chunks);
                isTranscribed = true;
                
                // Render the editable transcripts list
                renderTranscriptEditor();
                transcriptEditorGroup.classList.remove('hidden');
                
                // Update buttons UI
                btnTranscribe.classList.add('hidden');
                btnExport.classList.remove('hidden');
                btnReset.classList.remove('hidden');
                
                // Show captions
                draw();
            } else {
                alert('ASR model completed, but returned empty transcript.');
            }
        }
        else if (type === 'error') {
            hideStatus();
            alert(`Error: ${error}`);
        }
    };
}

// 2. Drag and Drop events
dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
});

dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
});

dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
        handleFileSelect(e.dataTransfer.files[0]);
    }
});

videoUpload.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFileSelect(e.target.files[0]);
    }
});

function handleFileSelect(file) {
    if (!file.type.startsWith('video/')) {
        alert('Please upload a valid video file.');
        return;
    }

    videoFile = file;
    videoUrl = URL.createObjectURL(file);
    
    // Set video source
    videoPlayer.src = videoUrl;
    videoPlayer.load();

    // Reset state
    captions = [];
    isTranscribed = false;
    
    // UI update
    dropzone.classList.add('hidden');
    previewContainer.classList.remove('hidden');
    controlPanel.classList.remove('locked');
    
    btnTranscribe.classList.remove('hidden');
    btnTranscribe.disabled = false;
    btnExport.classList.add('hidden');
    btnReset.classList.add('hidden');

    initWorker();
}

// Sizing canvas to match native video resolution
videoPlayer.addEventListener('loadedmetadata', () => {
    captionCanvas.width = videoPlayer.videoWidth;
    captionCanvas.height = videoPlayer.videoHeight;
    updateTimeDisplay();
    draw();
});

// 3. Video Player Controls
btnPlayPause.addEventListener('click', togglePlayPause);
videoPlayer.addEventListener('click', togglePlayPause);

function togglePlayPause() {
    if (videoPlayer.paused || videoPlayer.ended) {
        videoPlayer.play();
        iconPlay.classList.add('hidden');
        iconPause.classList.remove('hidden');
    } else {
        videoPlayer.pause();
        iconPlay.classList.remove('hidden');
        iconPause.classList.add('hidden');
    }
}

videoPlayer.addEventListener('play', () => {
    startRenderLoop();
});

videoPlayer.addEventListener('pause', () => {
    cancelAnimationFrame(animationFrameId);
    draw(); // Draw final static state
});

videoPlayer.addEventListener('timeupdate', () => {
    updateTimeDisplay();
    if (videoPlayer.paused) {
        draw(); // Ensure canvas matches exact frame when paused/scrubbed
    }
});

function updateTimeDisplay() {
    const formatTime = (secs) => {
        const m = Math.floor(secs / 60);
        const s = Math.floor(secs % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };
    const current = formatTime(videoPlayer.currentTime);
    const duration = formatTime(videoPlayer.duration || 0);
    timeDisplay.innerText = `${current} / ${duration}`;
}

// 4. Highlight Swatches Selection
swatches.forEach(swatch => {
    swatch.addEventListener('click', () => {
        swatches.forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');
        highlightColor = swatch.getAttribute('data-color');
        draw();
    });
});

// Redraw when settings change
fontSelect.addEventListener('change', draw);
styleSelect.addEventListener('change', draw);
fadeSpeedSelect.addEventListener('change', draw);
textStrokeToggle.addEventListener('change', draw);

// Background Selection Tiles handlers
bgTiles.forEach(tile => {
    tile.addEventListener('click', () => {
        bgTiles.forEach(t => t.classList.remove('active'));
        tile.classList.add('active');
        
        const bgType = tile.getAttribute('data-bg');
        if (bgType === 'custom') {
            bgCustomColorInput.click(); // trigger native color picker
        }
        draw();
    });
});

bgCustomColorInput.addEventListener('input', () => {
    // Update the custom tile's color swatch color to reflect current value
    const swatch = bgTileCustom.querySelector('.tile-color');
    swatch.classList.remove('rainbow');
    swatch.style.backgroundColor = bgCustomColorInput.value;
    draw();
});

fontSizeRange.addEventListener('input', (e) => {
    fontSizeVal.innerText = `${e.target.value}px`;
    draw();
});

positionRange.addEventListener('input', (e) => {
    positionVal.innerText = `${e.target.value}%`;
    draw();
});

unspokenOpacityRange.addEventListener('input', (e) => {
    unspokenOpacityVal.innerText = `${e.target.value}%`;
    draw();
});

// Custom Font Upload handler
fontUpload.addEventListener('change', async (e) => {
    if (e.target.files.length === 0) return;
    const file = e.target.files[0];
    
    try {
        const fontName = 'CustomFont_' + file.name.split('.')[0].replace(/[^a-zA-Z0-9]/g, '');
        fontUploadName.innerText = 'Loading...';
        
        const arrayBuffer = await file.arrayBuffer();
        const fontFace = new FontFace(fontName, arrayBuffer);
        
        await fontFace.load();
        document.fonts.add(fontFace);
        
        const fontUrl = URL.createObjectURL(file);
        
        // Add a style block to the document head to keep the font registered in the DOM stylesheet context
        const style = document.createElement('style');
        style.id = `style_${fontName}`;
        style.innerHTML = `
            @font-face {
                font-family: "${fontName}";
                src: url("${fontUrl}") format("truetype");
            }
        `;
        document.head.appendChild(style);
        
        customFonts.push({
            name: fontName,
            url: fontUrl,
            styleId: `style_${fontName}`,
            fontFace: fontFace
        });
        
        // Add option to dropdown and select it
        const option = document.createElement('option');
        option.value = fontName;
        option.text = `Custom: ${file.name.split('.')[0]}`;
        fontSelect.appendChild(option);
        fontSelect.value = fontName;
        
        fontUploadName.innerText = file.name;
        fontUpload.value = ''; // Reset file input so they can upload same file if needed
        draw();
    } catch (err) {
        fontUploadName.innerText = 'Error loading font';
        fontUpload.value = '';
        alert(`Failed to load custom font: ${err.message}`);
    }
});

// 5. Speech Audio Extraction & Resampling
btnTranscribe.addEventListener('click', async () => {
    if (!videoFile) return;

    showStatus('Preparing Audio...', 'Extracting the soundtrack from your video. Please wait...', 10);
    
    try {
        const audioData = await extractAndResampleAudio(videoFile);
        
        showStatus('Loading Whisper Model...', 'Preparing speech-to-text algorithm...', 25);
        
        // Post extraction and loading command to worker
        worker.postMessage({
            type: 'transcribe',
            audioData: audioData
        });
    } catch (error) {
        hideStatus();
        alert(`Failed to extract audio track: ${error.message}. Wait, you can still download your styled caption template by inputting manually if required.`);
        console.error(error);
    }
});

async function extractAndResampleAudio(file) {
    const arrayBuffer = await file.arrayBuffer();
    
    // Create offline audio context for decoding
    const tempCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    let audioBuffer;
    try {
        audioBuffer = await tempCtx.decodeAudioData(arrayBuffer);
    } catch (e) {
        tempCtx.close();
        throw new Error('Could not decode audio data. The video file may have no audio track or is in an unsupported audio format.');
    }
    
    tempCtx.close();

    // Resample to 16kHz using OfflineAudioContext
    const targetSampleRate = 16000;
    const offlineCtx = new OfflineAudioContext(
        1, // mono channel is fine for Whisper speech analysis
        Math.round((audioBuffer.length * targetSampleRate) / audioBuffer.sampleRate),
        targetSampleRate
    );

    // Setup source buffer
    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineCtx.destination);
    source.start();

    // Render resampled buffer
    const renderedBuffer = await offlineCtx.startRendering();
    return renderedBuffer.getChannelData(0);
}

// 6. Word grouping algorithm
function groupWordsIntoSegments(words) {
    const segments = [];
    if (!words || words.length === 0) return segments;

    let currentSegment = [];
    let currentTextLength = 0;

    for (let i = 0; i < words.length; i++) {
        const wordInfo = words[i];
        
        // Whisper returns [start, end] in timestamp. Sometimes they are null.
        let start = wordInfo.timestamp[0];
        let end = wordInfo.timestamp[1];

        // Gracefully interpolate missing timestamps
        if (start === null || start === undefined) {
            start = i > 0 ? (words[i - 1].timestamp[1] || 0) : 0;
        }
        if (end === null || end === undefined) {
            end = start + 0.6; // default 600ms word estimation
        }

        const cleanWord = {
            text: wordInfo.text.trim(),
            start: start,
            end: end
        };

        const silenceGap = currentSegment.length > 0 ? 
            (cleanWord.start - currentSegment[currentSegment.length - 1].end) : 0;

        // Conditions to chunk segment:
        // 1. A silence gap of > 1.0 seconds
        // 2. Line word limit of 7 words
        // 3. Characters length > 28
        // 4. Previous word ended in sentence punctuation (., !, ?)
        const prevWord = currentSegment.length > 0 ? currentSegment[currentSegment.length - 1].text : '';
        const shouldBreak = currentSegment.length > 0 && (
            silenceGap > 1.0 ||
            currentSegment.length >= 7 ||
            currentTextLength + cleanWord.text.length > 28 ||
            /[.!?]$/.test(prevWord)
        );

        if (shouldBreak) {
            segments.push({
                words: currentSegment,
                start: currentSegment[0].start,
                end: currentSegment[currentSegment.length - 1].end,
                text: currentSegment.map(w => w.text).join(' ')
            });
            currentSegment = [];
            currentTextLength = 0;
        }

        currentSegment.push(cleanWord);
        currentTextLength += cleanWord.text.length + 1;
    }

    // Add remaining segment
    if (currentSegment.length > 0) {
        segments.push({
            words: currentSegment,
            start: currentSegment[0].start,
            end: currentSegment[currentSegment.length - 1].end,
            text: currentSegment.map(w => w.text).join(' ')
        });
    }

    return segments;
}

// 7. Canvas drawing functions
function startRenderLoop() {
    const loop = () => {
        if (!videoPlayer.paused && !videoPlayer.ended) {
            draw();
            animationFrameId = requestAnimationFrame(loop);
        }
    };
    animationFrameId = requestAnimationFrame(loop);
}

function draw() {
    // Clear canvas
    ctx.clearRect(0, 0, captionCanvas.width, captionCanvas.height);
    
    const activeBgTile = document.querySelector('.bg-tile.active');
    const bgType = activeBgTile ? activeBgTile.getAttribute('data-bg') : 'original';
    const getBgColorValue = () => {
        if (bgType === 'green') return '#00FF00';
        if (bgType === 'blue') return '#0000FF';
        if (bgType === 'black') return '#000000';
        if (bgType === 'white') return '#FFFFFF';
        if (bgType === 'custom') return bgCustomColorInput.value;
        return 'transparent';
    };

    // Draw solid color background in preview mode if not original video
    if (bgType !== 'original') {
        ctx.fillStyle = getBgColorValue();
        ctx.fillRect(0, 0, captionCanvas.width, captionCanvas.height);
    }

    // Draw the video frame on top if we are exporting (since offscreen canvas records what is drawn)
    if (isExporting) {
        if (bgType === 'original') {
            ctx.drawImage(videoPlayer, 0, 0, captionCanvas.width, captionCanvas.height);
        } else {
            // Draw background screen on exported canvas
            ctx.fillStyle = getBgColorValue();
            ctx.fillRect(0, 0, captionCanvas.width, captionCanvas.height);
        }
    }

    if (!isTranscribed || captions.length === 0) return;

    const t = videoPlayer.currentTime;
    
    // Find active caption segment
    const activeSegment = captions.find(seg => t >= seg.start && t <= seg.end);
    if (!activeSegment) return;

    // Sizing typography relative to the canvas resolution
    const baseWidth = 640;
    const scale = captionCanvas.width / baseWidth;
    const fontSize = parseFloat(fontSizeRange.value) * scale;
    const positionRatio = parseFloat(positionRange.value) / 100;
    const unspokenOpacity = parseFloat(unspokenOpacityRange.value);
    const fadeSpeed = parseInt(fadeSpeedSelect.value);
    const style = styleSelect.value;
    const fontFamily = fontSelect.value;

    ctx.font = `900 ${fontSize}px "${fontFamily}", sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    const spaceWidth = ctx.measureText(' ').width;
    const safetyMargin = captionCanvas.width * 0.12; // 12% margins on sides
    const maxWidth = captionCanvas.width - safetyMargin * 2;

    // Word Wrap & Layout
    const lines = [];
    let currentLine = [];
    let currentLineWidth = 0;

    activeSegment.words.forEach(word => {
        const wordWidth = ctx.measureText(word.text).width;
        if (currentLine.length > 0 && currentLineWidth + spaceWidth + wordWidth > maxWidth) {
            lines.push({
                words: currentLine,
                width: currentLineWidth
            });
            currentLine = [word];
            currentLineWidth = wordWidth;
        } else {
            if (currentLine.length > 0) {
                currentLineWidth += spaceWidth;
            }
            currentLine.push(word);
            currentLineWidth += wordWidth;
        }
    });

    if (currentLine.length > 0) {
        lines.push({
            words: currentLine,
            width: currentLineWidth
        });
    }

    // Line heights and spacing
    const lineSpacing = fontSize * 0.25;
    const lineHeight = fontSize;
    const totalHeight = lines.length * lineHeight + (lines.length - 1) * lineSpacing;
    const centerY = captionCanvas.height * positionRatio;
    let startY = centerY - totalHeight / 2;

    // Render Box background
    if (style === 'box') {
        lines.forEach((line, idx) => {
            const lineY = startY + idx * (lineHeight + lineSpacing);
            const lineX = (captionCanvas.width - line.width) / 2;
            const px = fontSize * 0.4;
            const py = fontSize * 0.15;
            
            ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
            ctx.beginPath();
            const bx = lineX - px;
            const by = lineY - py;
            const bw = line.width + px * 2;
            const bh = lineHeight + py * 2;
            const br = fontSize * 0.2; // border-radius

            if (ctx.roundRect) {
                ctx.roundRect(bx, by, bw, bh, br);
            } else {
                ctx.rect(bx, by, bw, bh);
            }
            ctx.fill();
        });
    }

    // Render Words
    lines.forEach((line, lineIdx) => {
        const lineY = startY + lineIdx * (lineHeight + lineSpacing);
        let currentX = (captionCanvas.width - line.width) / 2;

        line.words.forEach(word => {
            const wordWidth = ctx.measureText(word.text).width;
            
            let opacity = 1.0;
            let color = '#FFFFFF';

            if (t < word.start) {
                // Word not spoken yet
                opacity = unspokenOpacity / 100;
                color = '#FFFFFF';
            } else if (t >= word.start && t <= word.end) {
                // Word is active! Apply fade-in animation
                if (fadeSpeed > 0) {
                    const progress = Math.min((t - word.start) * 1000 / fadeSpeed, 1);
                    opacity = (unspokenOpacity / 100) + (1 - (unspokenOpacity / 100)) * progress;
                } else {
                    opacity = 1.0;
                }
                color = highlightColor;
            } else {
                // Word has already been spoken
                opacity = 1.0;
                color = '#FFFFFF';
            }

            ctx.save();
            ctx.globalAlpha = opacity;
            ctx.fillStyle = color;

            const applyStroke = textStrokeToggle ? textStrokeToggle.checked : true;

            if (applyStroke) {
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = fontSize * 0.12;
                ctx.lineJoin = 'round';
                ctx.miterLimit = 2;
                ctx.strokeText(word.text, currentX, lineY);
            }
            
            if (style === 'shadow') {
                ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
                ctx.shadowBlur = fontSize * 0.15;
                ctx.shadowOffsetX = fontSize * 0.04;
                ctx.shadowOffsetY = fontSize * 0.04;
            }

            ctx.fillText(word.text, currentX, lineY);
            ctx.restore();

            currentX += wordWidth + spaceWidth;
        });
    });
}

// Redraw once fonts are loaded
document.fonts.ready.then(() => {
    draw();
});

// 8. Media Routing for Muted / Export Audio Capture
function routeAudio(muteSpeaker) {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        audioSource = audioCtx.createMediaElementSource(videoPlayer);
        audioDest = audioCtx.createMediaStreamDestination();
    }
    
    try {
        audioSource.disconnect();
    } catch (e) {}

    if (muteSpeaker) {
        // Only route to destination (mutes speakers)
        audioSource.connect(audioDest);
    } else {
        // Route to both speaker output and destination stream
        audioSource.connect(audioDest);
        audioSource.connect(audioCtx.destination);
    }
    
    isAudioConnected = true;
    return audioDest.stream.getAudioTracks()[0];
}

// 9. Video Exporting Process
btnExport.addEventListener('click', async () => {
    if (!isTranscribed || isExporting) return;
    
    isExporting = true;
    videoPlayer.pause();
    
    showStatus('Preparing Export...', 'Configuring canvas frames and audio capture...', 0);
    
    // Set player to start
    videoPlayer.currentTime = 0;
    
    // Resume audio context
    if (audioCtx && audioCtx.state === 'suspended') {
        await audioCtx.resume();
    }
    
    // Wait for seek to complete
    videoPlayer.addEventListener('seeked', startRecordingPipeline, { once: true });
});

function startRecordingPipeline() {
    // 1. Mute speakers, route audio to recorders
    let audioTrack = null;
    try {
        audioTrack = routeAudio(true); // true = mute speakers
    } catch (e) {
        console.warn('Audio routing failed. Recording video stream without audio.', e);
    }

    // 2. Create stream from canvas (30 fps)
    const canvasStream = captionCanvas.captureStream(30);
    const canvasTrack = canvasStream.getVideoTracks()[0];

    // 3. Assemble combined stream
    const tracks = [canvasTrack];
    if (audioTrack) {
        tracks.push(audioTrack);
    }
    const combinedStream = new MediaStream(tracks);

    // 4. Feature detect best MIME type
    let mimeType = 'video/webm;codecs=vp9,opus';
    if (MediaRecorder.isTypeSupported('video/mp4')) {
        mimeType = 'video/mp4';
    } else if (MediaRecorder.isTypeSupported('video/webm;codecs=h264,opus')) {
        mimeType = 'video/webm;codecs=h264,opus';
    }

    const recordedChunks = [];
    const mediaRecorder = new MediaRecorder(combinedStream, {
        mimeType: mimeType,
        videoBitsPerSecond: 10000000 // 10 Mbps for native resolution preservation
    });

    mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
            recordedChunks.push(e.data);
        }
    };

    mediaRecorder.onstop = () => {
        // Re-enable speakers
        try {
            routeAudio(false); // false = unmute speakers
        } catch (e) {}

        const finalBlob = new Blob(recordedChunks, { type: mimeType });
        currentExportMimeType = mimeType;
        
        // Revoke previous URL if exists
        if (currentExportUrl) {
            URL.revokeObjectURL(currentExportUrl);
        }
        
        // Save URL for preview and download
        currentExportUrl = URL.createObjectURL(finalBlob);
        
        // Load into preview player and display modal
        previewVideoPlayer.src = currentExportUrl;
        previewModal.classList.remove('hidden');

        isExporting = false;
        hideStatus();
        videoPlayer.currentTime = 0;
        draw();
    };

    // 5. Start Recording
    mediaRecorder.start();
    
    // Play video to capture frames
    videoPlayer.play();
    
    // Progress tracking loop
    const trackProgress = () => {
        if (isExporting) {
            const current = videoPlayer.currentTime;
            const duration = videoPlayer.duration || 1;
            const pct = Math.min(Math.round((current / duration) * 100), 99);
            
            showStatus('Exporting Video...', 'Processing high-quality render frame by frame. Do not close this tab.', pct);
            
            if (videoPlayer.ended || current >= duration) {
                mediaRecorder.stop();
                videoPlayer.pause();
            } else {
                requestAnimationFrame(trackProgress);
            }
        }
    };
    
    requestAnimationFrame(trackProgress);
}

// 10. Reset & Clear Workspace
btnReset.addEventListener('click', () => {
    // Terminate worker
    if (worker) worker.terminate();
    
    // Revoke blob
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    if (currentExportUrl) {
        URL.revokeObjectURL(currentExportUrl);
        currentExportUrl = null;
    }
    
    // Restore state
    videoFile = null;
    videoUrl = null;
    captions = [];
    isTranscribed = false;
    isExporting = false;
    
    // Remove custom fonts
    customFonts.forEach(font => {
        const style = document.getElementById(font.styleId);
        if (style) style.remove();
        URL.revokeObjectURL(font.url);
        try {
            document.fonts.delete(font.fontFace);
        } catch (e) {}
    });
    customFonts = [];
    // Reset font options to default list
    while (fontSelect.options.length > 5) {
        fontSelect.remove(5);
    }
    fontSelect.value = 'Montserrat';
    fontUpload.value = '';
    fontUploadName.innerText = 'No custom font uploaded';

    // Reset outline toggle and backgrounds
    if (textStrokeToggle) textStrokeToggle.checked = true;
    bgTiles.forEach(tile => tile.classList.remove('active'));
    const originalTile = document.querySelector('.bg-tile[data-bg="original"]');
    if (originalTile) originalTile.classList.add('active');
    
    if (bgCustomColorInput) {
        bgCustomColorInput.value = '#00FF00';
    }
    if (bgTileCustom) {
        const swatch = bgTileCustom.querySelector('.tile-color');
        swatch.classList.add('rainbow');
        swatch.style.backgroundColor = '';
    }

    // Reset components
    videoPlayer.src = '';
    ctx.clearRect(0, 0, captionCanvas.width, captionCanvas.height);
    
    // Reset UI
    dropzone.classList.remove('hidden');
    previewContainer.classList.add('hidden');
    controlPanel.classList.add('locked');
    videoUpload.value = '';
    
    transcriptEditorGroup.classList.add('hidden');
    transcriptList.innerHTML = '';
});

// 11. Render editable transcripts list
function renderTranscriptEditor() {
    transcriptList.innerHTML = '';
    
    const formatTime = (secs) => {
        const m = Math.floor(secs / 60);
        const s = Math.floor(secs % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    captions.forEach((seg, idx) => {
        const item = document.createElement('div');
        item.className = 'transcript-item';
        
        const badge = document.createElement('span');
        badge.className = 'transcript-time';
        badge.innerText = `${formatTime(seg.start)} - ${formatTime(seg.end)}`;
        
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'transcript-input';
        input.value = seg.text;
        input.setAttribute('data-index', idx);
        
        input.addEventListener('input', (e) => {
            const index = parseInt(e.target.getAttribute('data-index'));
            const newText = e.target.value;
            
            // Update segment text
            captions[index].text = newText;
            
            // Align timestamps
            const newWords = newText.split(/\s+/).filter(w => w !== '');
            const duration = captions[index].end - captions[index].start;
            
            if (newWords.length === 0) {
                captions[index].words = [];
            } else if (newWords.length === captions[index].words.length) {
                // Number of words is unchanged: keep original timestamps, just change text
                newWords.forEach((wordText, wordIdx) => {
                    captions[index].words[wordIdx].text = wordText;
                });
            } else {
                // Word count changed: re-distribute segment duration equally
                const wordDur = duration / newWords.length;
                captions[index].words = newWords.map((wordText, wordIdx) => ({
                    text: wordText,
                    start: captions[index].start + wordIdx * wordDur,
                    end: captions[index].start + (wordIdx + 1) * wordDur
                }));
            }
            
            draw(); // Redraw canvas frame instantly
        });

        item.appendChild(badge);
        item.appendChild(input);
        transcriptList.appendChild(item);
    });
}

// 12. Preview Modal Event Listeners
btnModalDownload.addEventListener('click', () => {
    if (!currentExportUrl) return;
    const ext = currentExportMimeType.includes('mp4') ? 'mp4' : 'webm';
    
    const a = document.createElement('a');
    a.href = currentExportUrl;
    a.download = `captioned-video.${ext}`;
    document.body.appendChild(a);
    a.click();
    
    setTimeout(() => {
        document.body.removeChild(a);
    }, 100);
});

btnModalClose.addEventListener('click', () => {
    previewModal.classList.add('hidden');
    previewVideoPlayer.pause();
    previewVideoPlayer.src = '';
    
    // Revoke URL to save memory
    if (currentExportUrl) {
        URL.revokeObjectURL(currentExportUrl);
        currentExportUrl = null;
    }
});

// Helper: Show status panel
function showStatus(title, msg, pct) {
    statusOverlay.classList.remove('hidden');
    if (statusProgress) statusProgress.classList.remove('indeterminate');
    statusTitle.innerText = title;
    statusMessage.innerText = msg;
    statusProgress.style.width = `${pct}%`;
    statusPercent.innerText = `${pct}%`;
}

// Helper: Hide status panel
function hideStatus() {
    statusOverlay.classList.add('hidden');
}
