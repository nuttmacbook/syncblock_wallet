import encodeQR from '@paulmillr/qr';

export async function startCamera(videoEl) {
    const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
        audio: false,
    });

    videoEl.setAttribute('playsinline', '');
    videoEl.muted = true;
    videoEl.srcObject = stream;
    await videoEl.play();

    const stop = () => {
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

    return { capture, stop };
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

    if ('BarcodeDetector' in globalThis) {
        try {
            const codes = await new BarcodeDetector({ formats: ['qr_code'] }).detect(canvas);
            if (codes[0]) return codes[0].rawValue;
        } catch {}
    }

    const { default: decodeQR } = await import('@paulmillr/qr/decode.js');
    const img = ctx.getImageData(0, 0, w, h);
    try {
        return decodeQR({ height: img.height, width: img.width, data: img.data });
    } catch {
        return null;
    }
}

export const MAX_BYTES = { low: 2953, medium: 2331, quartile: 1663, high: 1273 };

export function makeQR(text, { scale = 10, ecc = 'medium' } = {}) {
    const bytes = new TextEncoder().encode(text).length;
    if (bytes > MAX_BYTES[ecc]) {
        throw new RangeError(`ข้อมูล ${bytes} ไบต์ เกินความจุ QR (สูงสุด ${MAX_BYTES[ecc]} ไบต์ที่ ecc="${ecc}")`);
    }

    const border = 4;
    const m = encodeQR(text, 'raw', { ecc, border: 0 });
    const size = (m.length + border * 2) * scale;

    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#000';
    for (let y = 0; y < m.length; y++) {
        for (let x = 0; x < m.length; x++) {
            if (m[y][x]) ctx.fillRect((x + border) * scale, (y + border) * scale, scale, scale);
        }
    }
    return new Promise((r) => canvas.toBlob(r, 'image/png'));
}