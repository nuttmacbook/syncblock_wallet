import { SiweMessage } from "siwe";
import {
    hasWallet, unlockWallet, createWallet, createRandomSeed, isValidSeed,
    getWallet, lockWallet, isUnlocked, onLock, installLifecycleHooks, markBackedUp, isBackedUp,
} from "../modules/evmwallet";
import { makeQR, pickImage, readQR, startCamera } from "../modules/qrcode";

installLifecycleHooks();
onLock(() => render());

let cam = null;

window.unlockWithPassword = async () => {
    const password = document.querySelector("#password").value;
    const statusEl = document.querySelector("#status");
    statusEl.textContent = "Unlocking...";
    try {
        await unlockWallet(password, (p) => {
            statusEl.textContent = `Unlocking... ${Math.round(p * 100)}%`;
        });
        render();
    } catch (err) {
        statusEl.textContent = err.message;
    }
};

window.createNew = async () => {
    const password = document.querySelector("#newPassword").value;
    const statusEl = document.querySelector("#status");
    const seed = createRandomSeed();
    statusEl.textContent = "Creating...";
    try {
        await createWallet(seed, password, (p) => {
            statusEl.textContent = `Creating... ${Math.round(p * 100)}%`;
        });
        showSeedOnce(seed);
    } catch (err) {
        statusEl.textContent = err.message;
    }
};

window.importSeed = async () => {
    const seed = document.querySelector("#seedInput").value.trim();
    const password = document.querySelector("#newPassword").value;
    const statusEl = document.querySelector("#status");
    if (!isValidSeed(seed)) return (statusEl.textContent = "Invalid recovery phrase");
    try {
        await createWallet(seed, password, (p) => {
            statusEl.textContent = `Importing... ${Math.round(p * 100)}%`;
        });
        await markBackedUp();
        render();
    } catch (err) {
        statusEl.textContent = err.message;
    }
};

window.confirmBackup = async () => {
    await markBackedUp();
    render();
};

window.lock = () => {
    cam?.stop();
    lockWallet();
};

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

        const response = await cam.scan();
        logEl.textContent = response ?? "Cancelled";

        try {
            const { deriveChildWallet, wallet } = getWallet().get(0);

            const siweMessage = new SiweMessage(response);
            const EIP4361 = siweMessage.prepareMessage();
            const loginPath = siweMessage.uri + "/login";
            const signature = await wallet.signMessage(EIP4361);

            logEl.textContent = EIP4361 + "|" + loginPath;
        } catch (error) {
            logEl.textContent = error;
        }
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

const BTN = "bg-blue-400 p-4 py-2 text-white rounded";

function mount(html) {
    const app = document.querySelector("#app");
    if (app) app.innerHTML = html;
}

function showSeedOnce(seed) {
    mount(/*html*/`
        <div class="flex flex-col gap-4">
            <p class="font-bold text-red-500">Write these 12 words down. They are shown only once.</p>
            <div class="p-4 bg-gray-100 rounded font-mono break-words select-all">${seed}</div>
            <button onclick="confirmBackup()" class="${BTN}">I have written them down</button>
        </div>
    `);
}

function renderLocked(exists) {
    mount(exists ? /*html*/`
        <div class="flex flex-col gap-4">
            <input id="password" type="password" autocomplete="current-password"
                   placeholder="Password" class="border p-3 rounded">
            <button onclick="unlockWithPassword()" class="${BTN}">Unlock</button>
            <div id="status" class="text-sm text-gray-500"></div>
        </div>
    ` : /*html*/`
        <div class="flex flex-col gap-4">
            <input id="newPassword" type="password" autocomplete="new-password"
                   placeholder="New password (min 12 characters)" class="border p-3 rounded">
            <button onclick="createNew()" class="${BTN}">Create new wallet</button>
            <textarea id="seedInput" rows="3" placeholder="Or paste an existing recovery phrase"
                      class="border p-3 rounded" spellcheck="false"></textarea>
            <button onclick="importSeed()" class="${BTN}">Import</button>
            <div id="status" class="text-sm text-gray-500"></div>
        </div>
    `);
}

async function renderUnlocked() {
    const { deriveChildWallet, wallet } = getWallet().get(0);
    console.log({ wallet });

    const backedUp = await isBackedUp();

    mount(/*html*/`
        <div class="flex flex-col gap-4 break-words">
            ${backedUp ? "" : `<p class="text-red-500 text-sm">Recovery phrase not backed up yet</p>`}
            <span><strong>Address:</strong> ${wallet.address}</span>
            <span><strong>Publickey:</strong> ${wallet.publicKey}</span>
            <div id="ScanQRBTN" class="flex justify-center gap-4 flex-wrap">
                <button onclick="scanQr()" class="${BTN}">Scan QR</button>
                <button onclick="uploadQr()" class="${BTN}">Upload</button>
                <button onclick="generateQR('${wallet.address}')" class="${BTN}">Generate</button>
                <button onclick="lock()" class="bg-gray-500 p-4 py-2 text-white rounded">Lock</button>
            </div>
            <div id="log">Please Scan QR</div>
            <video id="videoQR" playsinline muted
                class="hidden w-full max-w-sm aspect-square object-cover bg-black rounded"></video>
            <button id="cancelBtn" onclick="cancelScan()"
                    class="hidden bg-red-400 p-4 py-2 text-white rounded">Cancel</button>
            <img src="" id="genImage">
        </div>
    `);
}

export async function render(params) {
    cam?.stop();
    cam = null;

    if (isUnlocked()) return renderUnlocked();
    return renderLocked(await hasWallet());
}