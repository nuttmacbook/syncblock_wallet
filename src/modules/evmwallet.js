import { ethers } from "ethers";
import { SiweMessage } from "siwe";

const DB_NAME = "wallet";
const STORE = "keystore";
const RECORD_ID = "primary";
const DEFAULT_PATH = "m/44'/60'/0'/0";
const MIN_PASSWORD_LENGTH = 12;

let session = null;
let lockTimer = null;
let autoLockMs = 5 * 60 * 1000;
const lockListeners = new Set();

export class WalletError extends Error {
    constructor(code, message) {
        super(message);
        this.name = "WalletError";
        this.code = code;
    }
}

export class SafeWallet {
    constructor(mnemonic) {
        this.root = ethers.HDNodeWallet.fromPhrase(mnemonic, "", DEFAULT_PATH);
    }

    static fromNode(node) {
        const instance = Object.create(SafeWallet.prototype);
        instance.root = node;
        return instance;
    }

    get(i) {
        if (!this.root) throw new WalletError("locked", "Wallet is locked");
        const deriveChildWallet = this.root.deriveChild(i);
        const privateKey = deriveChildWallet?.signingKey?.privateKey;
        const wallet = new ethers.Wallet(privateKey);
        return { deriveChildWallet, wallet };
    }

    addresses(count, offset = 0) {
        return Array.from({ length: count }, (_, i) => {
            const child = this.get(offset + i);
            return { index: offset + i, path: child.path, address: child.address };
        });
    }

    lock() {
        this.root = null;
    }
}

export function createRandomSeed() {
    return ethers.Wallet.createRandom().mnemonic.phrase;
}

export function isValidSeed(mnemonic) {
    try {
        ethers.Mnemonic.fromPhrase(mnemonic.trim().replace(/\s+/g, " "));
        return true;
    } catch {
        return false;
    }
}

function openDb() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function tx(db, mode, run) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = run(transaction.objectStore(STORE));
        transaction.oncomplete = () => resolve(request?.result);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
    });
}

async function readRecord() {
    const db = await openDb();
    try {
        return (await tx(db, "readonly", (store) => store.get(RECORD_ID))) ?? null;
    } finally {
        db.close();
    }
}

async function writeRecord(record) {
    const db = await openDb();
    try {
        await tx(db, "readwrite", (store) => store.put({ id: RECORD_ID, ...record }));
    } finally {
        db.close();
    }
}

export async function hasWallet() {
    return (await readRecord()) !== null;
}

export async function destroyWallet() {
    lockWallet();
    const db = await openDb();
    try {
        await tx(db, "readwrite", (store) => store.clear());
    } finally {
        db.close();
    }
}

function assertPassword(password) {
    if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
        throw new WalletError("weak_password", `Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }
}

function startSession(wallet) {
    session = wallet;
    touchSession();
    return wallet;
}

export function touchSession() {
    clearTimeout(lockTimer);
    if (session && autoLockMs > 0) lockTimer = setTimeout(lockWallet, autoLockMs);
}

export function setAutoLock(ms) {
    autoLockMs = ms;
    touchSession();
}

export function lockWallet() {
    clearTimeout(lockTimer);
    session?.lock();
    session = null;
    lockListeners.forEach((fn) => fn());
}

export function onLock(fn) {
    lockListeners.add(fn);
    return () => lockListeners.delete(fn);
}

export function getWallet() {
    if (!session) throw new WalletError("locked", "Wallet is locked");
    touchSession();
    return session;
}

export function isUnlocked() {
    return session !== null;
}

export async function createWallet(mnemonic, password, onProgress) {
    if (await hasWallet()) throw new WalletError("exists", "A wallet already exists on this device");
    if (!isValidSeed(mnemonic)) throw new WalletError("invalid_seed", "Invalid recovery phrase");
    assertPassword(password);

    const wallet = new SafeWallet(mnemonic);
    const keystore = await wallet.root.encrypt(password, onProgress);
    await writeRecord({ keystore, createdAt: Date.now(), backedUp: false });
    await requestPersistence();

    return startSession(wallet);
}

export async function unlockWallet(password, onProgress) {
    const record = await readRecord();
    if (!record) throw new WalletError("not_found", "No wallet on this device");

    let node;
    try {
        node = await ethers.Wallet.fromEncryptedJson(record.keystore, password, onProgress);
    } catch {
        throw new WalletError("wrong_password", "Wrong password or corrupted keystore");
    }

    return startSession(SafeWallet.fromNode(node));
}

export async function changePassword(currentPassword, newPassword, onProgress) {
    assertPassword(newPassword);
    if (currentPassword === newPassword) throw new WalletError("same_password", "New password must be different");

    const record = await readRecord();
    if (!record) throw new WalletError("not_found", "No wallet on this device");

    let node;
    try {
        node = await ethers.Wallet.fromEncryptedJson(record.keystore, currentPassword);
    } catch {
        throw new WalletError("wrong_password", "Wrong password");
    }

    const keystore = await node.encrypt(newPassword, onProgress);
    await writeRecord({ ...record, keystore, updatedAt: Date.now() });
    return startSession(SafeWallet.fromNode(node));
}

export async function revealSeed(password) {
    const record = await readRecord();
    if (!record) throw new WalletError("not_found", "No wallet on this device");

    let node;
    try {
        node = await ethers.Wallet.fromEncryptedJson(record.keystore, password);
    } catch {
        throw new WalletError("wrong_password", "Wrong password");
    }
    return node.mnemonic.phrase;
}

export async function markBackedUp() {
    const record = await readRecord();
    if (record) await writeRecord({ ...record, backedUp: true });
}

export async function isBackedUp() {
    return (await readRecord())?.backedUp === true;
}

export async function requestPersistence() {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return navigator.storage.persist();
}

export function installLifecycleHooks() {
    if (typeof window === "undefined") return;
    window.addEventListener("pagehide", lockWallet);
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") touchSession();
    });
    ["pointerdown", "keydown"].forEach((event) => {
        window.addEventListener(event, () => isUnlocked() && touchSession(), { passive: true });
    });
}