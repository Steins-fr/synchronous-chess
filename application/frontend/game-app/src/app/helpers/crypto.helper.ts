export class CryptoHelper {
    /** Random bytes, as an hexadecimal string */
    public static randomHex(byteLength: number): string {
        return CryptoHelper.toHex(crypto.getRandomValues(new Uint8Array(byteLength)));
    }

    /** The SHA-256 digest of a text, as an hexadecimal string */
    public static async sha256(text: string): Promise<string> {
        return CryptoHelper.toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))));
    }

    /** Bytes as an hexadecimal string */
    public static toHex(bytes: Uint8Array): string {
        return Array.from(bytes, (byte: number) => byte.toString(16).padStart(2, '0')).join('');
    }

    /**
     * A random integer from 0 to an excluded bound, with no bias: the draws beyond the bound are drawn again
     * @param bound greater than 0
     */
    public static randomBigInt(bound: bigint): bigint {
        if (bound <= 0n) {
            throw new Error(`No integer from 0 to ${ bound } excluded`);
        }

        const bits: number = bound.toString(2).length;
        const bytes = new Uint8Array(Math.ceil(bits / 8));
        let value: bigint;

        do {
            crypto.getRandomValues(bytes);
            // The bits above the ones of the bound would make most draws exceed it
            bytes[0] &= 0xff >> (bytes.length * 8 - bits);
            value = BigInt(`0x${ CryptoHelper.toHex(bytes) }`);
        } while (value >= bound);

        return value;
    }
}
