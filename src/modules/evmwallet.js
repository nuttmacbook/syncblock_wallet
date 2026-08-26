import { ethers } from "ethers";

export class SafeWallet {
    constructor (mnemonic) {
        this.root = ethers.HDNodeWallet.fromPhrase(mnemonic, "", "m/44'/60'/0'/0");
    }

    get(i) { return this.root.deriveChild(i); }
}

export function createRandomSeed() {
    return ethers.Wallet.createRandom().mnemonic.phrase;
}