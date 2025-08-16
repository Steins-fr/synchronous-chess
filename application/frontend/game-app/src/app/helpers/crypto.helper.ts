export class CryptoHelper {
    public static randomNumber(min: number, max: number): number {
        // Use cryptographically secure random number generator
        const array = new Uint32Array(1);
        crypto.getRandomValues(array);
        const randomValue = array[0] / (0xffffffff + 1); // Convert to 0-1 range
        return Math.floor(randomValue * (max - min + 1)) + min;
    }
}
