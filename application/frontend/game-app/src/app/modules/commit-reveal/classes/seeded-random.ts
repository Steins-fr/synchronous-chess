import { CryptoHelper } from '@app/helpers/crypto.helper';

/** The largest bound: a draw reads 4 bytes at most */
const MAX_BOUND: number = 2 ** 32;

/**
 * Random draws every page makes alike from a seed, the one of a fair draw: the shuffle of a deck no player chose.
 *
 * The bytes are the SHA-256 digests of `seed:0`, `seed:1`... one after the other. A draw below a bound reads the bytes
 * holding the bits of the bound minus one, keeps these bits only, and draws again a value beyond the bound: no value is
 * likelier than another. Every page must draw alike: changing the bytes, their order or the shuffle changes the deck.
 */
export class SeededRandom {
    private counter: number = 0;
    private bytes: Uint8Array = new Uint8Array(0);
    private read: number = 0;

    public constructor(private readonly seed: string) {}

    /** An integer from 0 to the bound excluded, the bound an integer from 1 to 2^32 */
    public async below(bound: number): Promise<number> {
        if (!Number.isInteger(bound) || bound < 1 || bound > MAX_BOUND) {
            throw new Error(`No integer from 0 to ${ bound } excluded`);
        }
        if (bound === 1) {
            return 0;
        }

        const bits: number = (bound - 1).toString(2).length;
        const length: number = Math.ceil(bits / 8);
        let value: number;

        do {
            value = 0;
            for (let index = 0; index < length; index++) {
                // eslint-disable-next-line no-await-in-loop -- each byte follows the previous one
                const byte: number = await this.nextByte();
                // The bits above the ones of the bound would make most draws exceed it
                value = value * 256 + (index === 0 ? byte & (0xff >> (length * 8 - bits)) : byte);
            }
        } while (value >= bound);

        return value;
    }

    /** The items in a random order, the Fisher-Yates way from the last item: the items given are not changed */
    public async shuffle<T>(items: ReadonlyArray<T>): Promise<T[]> {
        const shuffled: T[] = [...items];

        for (let index = shuffled.length - 1; index > 0; index--) {
            // eslint-disable-next-line no-await-in-loop -- each draw follows the previous one
            const other: number = await this.below(index + 1);
            [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
        }

        return shuffled;
    }

    private async nextByte(): Promise<number> {
        if (this.read === this.bytes.length) {
            this.bytes = await CryptoHelper.sha256Bytes(`${ this.seed }:${ this.counter++ }`);
            this.read = 0;
        }
        return this.bytes[this.read++];
    }
}
