/**
 * attestation.ts
 * Utility to load the ECDSA WASM module and perform client-side verification of PoAP badges without server roundtrips.
 */

export class AttestationWasmLoader {
    private wasmInstance: WebAssembly.Instance | null = null;
    private wasmMemory: WebAssembly.Memory | null = null;
    private isReady: boolean = false;
    private resolveReady: (() => void) | null = null;
    private readyPromise: Promise<void>;

    constructor() {
        this.readyPromise = new Promise((resolve) => {
            this.resolveReady = resolve;
        });
    }

    public async initialize(wasmUrl: string = '/wasm/ecdsa_verify.wasm'): Promise<void> {
        if (typeof WebAssembly === 'undefined') {
            throw new Error('WebAssembly is not supported in this environment.');
        }

        try {
            const response = await fetch(wasmUrl);
            const buffer = await response.arrayBuffer();
            const module = await WebAssembly.compile(buffer);

            const importObject = {
                env: {
                    memory: new WebAssembly.Memory({ initial: 32 }),
                }
            };

            this.wasmInstance = await WebAssembly.instantiate(module, importObject);
            this.wasmMemory = importObject.env.memory as WebAssembly.Memory;
            this.isReady = true;

            if (this.resolveReady) this.resolveReady();
        } catch (error) {
            console.error('Failed to initialize Attestation WASM:', error);
            throw error;
        }
    }

    /**
     * Checks if the S-component of the signature (last 32 bytes) is <= n/2 (BIP-62 low-S).
     */
    public isCanonicalLowS(signatureBytes: Uint8Array): boolean {
        if (signatureBytes.length < 64) return false;
        // secp256k1 half-order: n/2
        const halfOrder = [
            0x7f, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
            0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
            0x5d, 0x57, 0x6e, 0x73, 0x57, 0xa4, 0x50, 0x1d,
            0xdf, 0xe9, 0x2f, 0x46, 0x68, 0x1b, 0x20, 0xa0
        ];
        const sBytes = signatureBytes.slice(32, 64);
        for (let i = 0; i < 32; i++) {
            if (sBytes[i] < halfOrder[i]) return true;
            if (sBytes[i] > halfOrder[i]) return false;
        }
        return true;
    }

    public async verifySignature(
        publicKeyHex: string,
        message: string,
        signatureHex: string
    ): Promise<boolean> {
        const signatureBytes = new Uint8Array(this.hexToBytes(signatureHex));
        if (!this.isCanonicalLowS(signatureBytes)) {
            // Reject malleable high-S signatures in accordance with BIP-62 (#5492)
            return false;
        }

        await this.readyPromise;
        if (!this.wasmInstance || !this.wasmMemory) {
            throw new Error('WASM instance not initialized');
        }

        const publicKey = new Uint8Array(this.hexToBytes(publicKeyHex));
        const messageBytes = new TextEncoder().encode(message);
        const signature = signatureBytes;

        const pkPtr = 0;
        const msgPtr = 32;
        const sigPtr = msgPtr + messageBytes.length;

        const memoryView = new Uint8Array(this.wasmMemory.buffer);
        memoryView.set(publicKey, pkPtr);
        memoryView.set(messageBytes, msgPtr);
        memoryView.set(signature, sigPtr);

        const verifyFn = this.wasmInstance.exports.ecdsa_verify_attestation as CallableFunction;
        const result = verifyFn(pkPtr, msgPtr, messageBytes.length, sigPtr);

        return result === 0;
    }

    private hexToBytes(hex: string): number[] {
        const bytes = [];
        for (let i = 0; i < hex.length; i += 2) {
            bytes.push(parseInt(hex.substr(i, 2), 16));
        }
        return bytes;
    }
}

export const attestationWasm = new AttestationWasmLoader();
