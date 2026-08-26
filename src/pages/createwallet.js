import { SafeWallet } from "../modules/evmwallet";
import { makeQR, pickImage, readQR, startCamera } from "../modules/qrcode";

const safewallet = new SafeWallet(import.meta.env.VITE_DEV_SEED);

let cam = null;

window.scanQr = async () => {
    if (cam) return;
    const videoEl = document.querySelector("#videoQR");
    const logEl = document.querySelector("#log");
    const cancelBtn = document.querySelector("#cancelBtn");

    try {
        cam = await startCamera(videoEl);
        videoEl.classList.remove("hidden");
        cancelBtn.classList.remove("hidden");
        logEl.textContent = "Point the camera at a QR code";

        const text = await cam.scan();
        logEl.textContent = text ?? "Cancelled";
    } catch (err) {
        logEl.textContent = err.name === "NotAllowedError"
            ? "Camera permission denied. Enable it in your site settings."
            : "Could not open the camera: " + err.message;
    } finally {
        cam?.stop();
        cam = null;
        videoEl.classList.add("hidden");
        cancelBtn.classList.add("hidden");
    }
};

window.cancelScan = () => cam?.cancel();

window.uploadQr = async () => {
    const photo = await pickImage();
    if (!photo) return;
    document.querySelector("#log").textContent = (await readQR(photo)) ?? "No QR code found in that image";
};

window.generateQR = async (value) => {
    const qr = await makeQR(value, { logo: "/logo.png" });
    const imgEl = document.querySelector("#genImage");
    if (imgEl.src.startsWith("blob:")) URL.revokeObjectURL(imgEl.src);
    imgEl.src = URL.createObjectURL(qr);
};

export function render(params) {
    cam?.stop();

    const wallet = safewallet.get(0);

    const app = document.querySelector("#app");
    if (app) {
        app.innerHTML = /*html*/`
            <div class="flex flex-col gap-4 break-words">
                <span><strong>Address:</strong> ${wallet.address}</span>
                <span><strong>Publickey:</strong> ${wallet.publicKey}</span>
                <div id="ScanQRBTN" class="flex justify-center gap-4">
                    <button onclick="scanQr()" class="bg-blue-400 p-4 py-2 text-white rounded">Scan QR</button>
                    <button onclick="uploadQr()" class="bg-blue-400 p-4 py-2 text-white rounded">Upload</button>
                    <button onclick="generateQR('${wallet.address}')" class="bg-blue-400 p-4 py-2 text-white rounded">Generate</button>
                </div>
                <div id="log">Please Scan QR</div>
                <video id="videoQR" playsinline muted
                    class="hidden w-full max-w-sm aspect-square object-cover bg-black rounded"></video>
                <button id="cancelBtn" onclick="cancelScan()"
                        class="hidden bg-red-400 p-4 py-2 text-white rounded">Cancel</button>
                <img src="" id="genImage">
            </div>
        `;
    }
}