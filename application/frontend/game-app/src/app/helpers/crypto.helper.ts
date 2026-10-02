export class CryptoHelper {
    /** Random bytes, as an hexadecimal string */
    public static randomHex(byteLength: number): string {
        return CryptoHelper.toHex(crypto.getRandomValues(new Uint8Array(byteLength)));
    }

    /** The SHA-256 digest of a text, as an hexadecimal string */
    public static async sha256(text: string): Promise<string> {
        return CryptoHelper.toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))));
    }

    private static toHex(bytes: Uint8Array): string {
        return Array.from(bytes, (byte: number) => byte.toString(16).padStart(2, '0')).join('');
    }

    public static randomNumber(min: number, max: number): number {
        // Use cryptographically secure random number generator
        const array = new Uint32Array(1);
        crypto.getRandomValues(array);
        const randomValue = array[0] / (0xffffffff + 1); // Convert to 0-1 range
        return Math.floor(randomValue * (max - min + 1)) + min;
    }
}
