import { SafeWallet } from "../modules/evmwallet";
import { makeQR, pickImage, readQR, startCamera } from "../modules/qrcode";

const safewallet = new SafeWallet(import.meta.env.VITE_DEV_SEED);

window.scanQr = async () => {
    const videoEl = document.querySelector("#videoQR");
    const cam = await startCamera(videoEl);
    const photo = await cam.capture();
    cam.stop();

    const text = await readQR(photo);
    const logEl = document.querySelector("#log");
    logEl.innerHTML = text
}

window.pickImage = async () => {
    const photo = await pickImage();

    const text = await readQR(photo);
    const logEl = document.querySelector("#log");
    logEl.innerHTML = text
}

window.generateQR = async () => {
    const qr = await makeQR('0x112233445566');
    const imgEl = document.querySelector("#genImage");
    imgEl.src = URL.createObjectURL(qr);
}

export function render(params) {
    const wallet = safewallet.get(0);

    const app = document.querySelector("#app");
    if (app) {
        app.innerHTML = /*html*/`
            <div class="flex flex-col gap-4 break-words">
                <span><strong>Address:</strong> ${wallet.address}</span>
                <span><strong>Publickey:</strong> ${wallet.publicKey}</span>
                <div id="ScanQRBTN" class="flex justify-center gap-4">
                    <button onclick="scanQr()" class="bg-blue-400 p-4 py-2 text-white rounded">Scan QR</button>
                    <button onclick="pickImage()" class="bg-blue-400 p-4 py-2 text-white rounded">Upload</button>
                    <button onclick="generateQR()" class="bg-blue-400 p-4 py-2 text-white rounded">Generate</button>
                </div>
                <div id="log">Please Scan QR</div>
                <img src="" id="genImage">
                <video id="videoQR"></video>
            </div>
        `;
    }
}