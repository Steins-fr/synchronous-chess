export class CryptoHelper {
    /** Random bytes, as an hexadecimal string */
    public static randomHex(byteLength: number): string {
        return CryptoHelper.toHex(crypto.getRandomValues(new Uint8Array(byteLength)));
    }

    /** The SHA-256 digest of a text, as an hexadecimal string */
    public static async sha256(text: string): Promise<string> {
        return CryptoHelper.toHex(await CryptoHelper.sha256Bytes(text));
    }

    /** The SHA-256 digest of a text, as bytes */
    public static async sha256Bytes(text: string): Promise<Uint8Array> {
        return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
    }

    /** Bytes as an hexadecimal string */
    public static toHex(bytes: Uint8Array): string {
        return Array.from(bytes, (byte: number) => byte.toString(16).padStart(2, '0')).join('');
    }

    /** Bytes in base64 */
    public static toBase64(bytes: Uint8Array): string {
        return btoa(Array.from(bytes, (byte: number) => String.fromCodePoint(byte)).join(''));
    }

    /**
     * The bytes of a text in base64
     * @throws Error when the text is not the base64 of bytes, written as {@link toBase64} writes it
     */
    public static fromBase64(text: string): Uint8Array {
        let bytes: Uint8Array;

        try {
            bytes = Uint8Array.from(atob(text), (character: string) => character.codePointAt(0) as number);
        } catch (error: unknown) {
            throw new Error('Invalid base64', { cause: error });
        }

        // atob accepts spaces, a missing padding and unused bits: a single encoding of each bytes is accepted
        if (CryptoHelper.toBase64(bytes) !== text) {
            throw new Error('Invalid base64');
        }

        return bytes;
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
