import { Block } from './block';
import { signatureAlgorithm } from './block-chain.constants';

export type BlockToHash = Omit<Block, 'hash' | 'signature'>;

export class Chain {

    public constructor() {
        this.reset().then();
    }

    private chain: Block[];

    private static async createGenesisBlock(): Promise<Block> {
        const hash: string = await Chain.calculateHash({
            index: 0,
            timestamp: '',
            data: null,
            previousHash: ''
        });
        return new Block(0, '', null, '', hash, '');
    }

    private static encodeMessage(message: string): Uint8Array {
        const encoder: TextEncoder = new TextEncoder();
        return encoder.encode(message);
    }

    private static arrayToHexString(arrayBuffer: Uint8Array): string {
        const hashArray: number[] = Array.from(new Uint8Array(arrayBuffer)); // convert buffer to byte array

        return hashArray.map((b: number) => b.toString(16).padStart(2, '0')).join(''); // convert bytes to hex string
    }

    private static hexStringToArray(hexString: string): Uint8Array {

        const buffer: number[] = [];

        hexString.split('').forEach((c: string, index: number) => {
            if (index % 2 === 0) {
                buffer.push(parseInt(c + hexString[index + 1], 16));
            }
        });

        return new Uint8Array(buffer);
    }

    public static async calculateHash(block: BlockToHash): Promise<string> {
        const data: Uint8Array = this.encodeMessage(`${block.index} ${block.previousHash} ${block.timestamp} ${JSON.stringify(block.data)}`);
        const hashBuffer: ArrayBuffer = await crypto.subtle.digest('SHA-256', data);
        return this.arrayToHexString(new Uint8Array(hashBuffer));
    }

    public static async signHash(hash: string, privateKey: CryptoKey): Promise<string> {
        const signature: ArrayBuffer = await window.crypto.subtle.sign(
            signatureAlgorithm,
            privateKey,
            this.encodeMessage(hash)
        );

        return this.arrayToHexString(new Uint8Array(signature));
    }

    public static async verifyMessage(signature: string, hash: string, publicKey: CryptoKey): Promise<boolean> {
        return await window.crypto.subtle.verify(
            signatureAlgorithm,
            publicKey,
            this.hexStringToArray(signature),
            this.encodeMessage(hash)
        );
    }

    public getLatestBlock(): Block {
        return this.chain[this.chain.length - 1];
    }

    public async addBlock(newBlock: Block): Promise<void> {
        const hash: string = await Chain.calculateHash(newBlock);

        if (this.canAddBlock(newBlock, hash) === false) {
            throw new Error('Block not valid');
        }

        this.chain.push(newBlock);
    }

    private canAddBlock(newBlock: Block, hash: string): boolean {
        return newBlock.index <= this.chain.length
            && this.getLatestBlock().index === newBlock.index - 1
            && this.getLatestBlock().hash === newBlock.previousHash
            && newBlock.hash === hash;
    }

    public async canAddBlockAsync(newBlock: Block): Promise<boolean> {
        return this.canAddBlock(newBlock, await Chain.calculateHash(newBlock));
    }

    public getBlock(index: number): Block {
        if (index < this.chain.length) {
            return this.chain[index];
        }

        throw new Error('Unexpected chain index');
    }

    public async isChainValid(): Promise<boolean> {
        for (let i: number = 1; i < this.chain.length; i++) {
            const current: Block = this.chain[i];
            const previous: Block = this.chain[i - 1];

            if (current.hash !== await Chain.calculateHash(current)) {
                return false;
            }

            if (current.previousHash !== previous.hash) {
                return false;
            }
        }
        return true;
    }

    public async reset(): Promise<void> {
        this.chain = [await Chain.createGenesisBlock()];
    }
}
