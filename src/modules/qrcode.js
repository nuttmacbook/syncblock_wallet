import encodeQR from '@paulmillr/qr';

let _detector;
let _decodeQR;

async function initDecoder() {
    if (_detector || _decodeQR) return;
    if ('BarcodeDetector' in globalThis) {
        try {
            const formats = await BarcodeDetector.getSupportedFormats();
            if (formats.includes('qr_code')) {
                _detector = new BarcodeDetector({ formats: ['qr_code'] });
                return;
            }
        } catch {}
    }
    _decodeQR = (await import('@paulmillr/qr/decode.js')).default;
}

async function decodeCanvas(canvas, ctx) {
    if (_detector) {
        try {
            const codes = await _detector.detect(canvas);
            if (codes[0]) return codes[0].rawValue;
        } catch {}
        return null;
    }
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    try {
        return _decodeQR({ height: img.height, width: img.width, data: img.data });
    } catch {
        return null;
    }
}

function videoReady(videoEl) {
    if (videoEl.readyState >= 2 && videoEl.videoWidth > 0) return Promise.resolve();
    return new Promise((r) => videoEl.addEventListener('loadeddata', r, { once: true }));
}

export async function startCamera(videoEl) {
    const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
        audio: false,
    });

    videoEl.setAttribute('playsinline', '');
    videoEl.muted = true;
    videoEl.srcObject = stream;
    await videoEl.play();
    await videoReady(videoEl);

    let stopped = false;
    let cancelScan = null;

    const stop = () => {
        stopped = true;
        cancelScan?.();
        stream.getTracks().forEach((t) => t.stop());
        videoEl.srcObject = null;
    };

    const capture = () => {
        const canvas = document.createElement('canvas');
        canvas.width = videoEl.videoWidth;
        canvas.height = videoEl.videoHeight;
        canvas.getContext('2d').drawImage(videoEl, 0, 0);
        return new Promise((r) => canvas.toBlob(r, 'image/png'));
    };

    const scan = async ({ timeout = 0 } = {}) => {
        await initDecoder();

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        canvas.width = canvas.height = 480;

        return new Promise((resolve) => {
            let done = false;
            let handle = null;

            const finish = (value) => {
                if (done) return;
                done = true;
                clearTimeout(timer);
                if (handle != null) {
                    if (videoEl.cancelVideoFrameCallback) videoEl.cancelVideoFrameCallback(handle);
                    else cancelAnimationFrame(handle);
                }
                cancelScan = null;
                resolve(value);
            };

            cancelScan = () => finish(null);
            const timer = timeout ? setTimeout(() => finish(null), timeout) : null;

            const tick = async () => {
                if (done || stopped) return finish(null);

                let text = null;
                if (_detector) {
                    try { text = (await _detector.detect(videoEl))[0]?.rawValue ?? null; } catch {}
                } else {
                    const s = Math.min(videoEl.videoWidth, videoEl.videoHeight) * 0.7;
                    ctx.drawImage(videoEl,
                        (videoEl.videoWidth - s) / 2, (videoEl.videoHeight - s) / 2, s, s,
                        0, 0, 480, 480);
                    text = await decodeCanvas(canvas, ctx);
                }

                if (text) {
                    navigator.vibrate?.(40);
                    return finish(text);
                }

                handle = videoEl.requestVideoFrameCallback
                    ? videoEl.requestVideoFrameCallback(tick)
                    : requestAnimationFrame(tick);
            };

            tick();
        });
    };

    return { capture, scan, stop, cancel: () => cancelScan?.() };
}

export function pickImage({ camera = false } = {}) {
    return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        if (camera) input.capture = 'environment';
        input.onchange = () => resolve(input.files[0] ?? null);
        input.oncancel = () => resolve(null);
        input.click();
    });
}

export async function readQR(blob) {
    await initDecoder();

    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    return decodeCanvas(canvas, ctx);
}

export const MAX_BYTES = { low: 2953, medium: 2331, quartile: 1663, high: 1273 };

async function loadImage(source) {
    if (source instanceof Blob) return createImageBitmap(source);
    if (typeof source === 'string') {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = source;
        await img.decode();
        return img;
    }
    return source;
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

export async function makeQR(text, options = {}) {
    const {
        scale = 10,
        logo = null,
        logoRatio = 0.2,
        logoPadding = 0,
        logoRadius = 0,
        verify = true,
    } = options;
    const ecc = options.ecc ?? (logo ? 'high' : 'medium');

    const bytes = new TextEncoder().encode(text).length;
    if (bytes > MAX_BYTES[ecc]) {
        throw new RangeError(`Payload is ${bytes} bytes, exceeds QR capacity (max ${MAX_BYTES[ecc]} bytes at ecc="${ecc}")`);
    }
    if (logo && logoRatio > 0.25) {
        throw new RangeError(`logoRatio ${logoRatio} is too large, use 0.25 or less`);
    }

    const border = 4;
    const m = encodeQR(text, 'raw', { ecc, border: 0 });
    const size = (m.length + border * 2) * scale;

    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#000';
    for (let y = 0; y < m.length; y++) {
        for (let x = 0; x < m.length; x++) {
            if (m[y][x]) ctx.fillRect((x + border) * scale, (y + border) * scale, scale, scale);
        }
    }

    if (logo) {
        const image = await loadImage(logo);
        const box = Math.round(size * logoRatio);
        const left = Math.round((size - box) / 2);

        ctx.fillStyle = '#fff';
        roundRect(ctx, left - logoPadding, left - logoPadding, box + logoPadding * 2, box + logoPadding * 2, logoRadius);
        ctx.fill();

        const iw = image.width || image.naturalWidth;
        const ih = image.height || image.naturalHeight;
        const fit = Math.min(box / iw, box / ih);
        const dw = iw * fit;
        const dh = ih * fit;
        ctx.drawImage(image, left + (box - dw) / 2, left + (box - dh) / 2, dw, dh);
        if (image.close) image.close();

        if (verify) {
            await initDecoder();
            if (await decodeCanvas(canvas, ctx) !== text) {
                throw new Error('QR is unreadable with this logo, reduce logoRatio or shorten the payload');
            }
        }
    }

    return new Promise((r) => canvas.toBlob(r, 'image/png'));
}