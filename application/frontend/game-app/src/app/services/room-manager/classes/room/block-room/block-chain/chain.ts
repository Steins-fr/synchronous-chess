import { Block } from './block';
import { genesisHash, signatureAlgorithm } from './block-chain.constants';
import { BlockChainName } from '../block-chain-name.enum';

export type BlockToHash = Omit<Block, 'hash' | 'signature'>;

export class Chain {

    private chain: Block[] = [Chain.createGenesisBlock()];

    public constructor(public readonly name: BlockChainName) {}

    private static createGenesisBlock(): Block {
        return new Block(0, '', {
            from: '',
            type: '',
            payload: null
        }, '', genesisHash, '');
    }

    private static encodeMessage(message: string): Uint8Array<ArrayBuffer> {
        const encoder: TextEncoder = new TextEncoder();
        return encoder.encode(message);
    }

    private static arrayToHexString(arrayBuffer: Uint8Array): string {
        const hashArray: number[] = Array.from(new Uint8Array(arrayBuffer)); // convert buffer to byte array

        return hashArray.map((b: number) => b.toString(16).padStart(2, '0')).join(''); // convert bytes to hex string
    }

    private static hexStringToArray(hexString: string): Uint8Array<ArrayBuffer> {

        const buffer: number[] = [];

        hexString.split('').forEach((c: string, index: number) => {
            if (index % 2 === 0) {
                buffer.push(Number.parseInt(c + hexString[index + 1], 16));
            }
        });

        return new Uint8Array(buffer);
    }

    // The chain name is hashed so that a block signed for a chain is not valid on another chain of the room
    public static async calculateHash(chainName: BlockChainName, block: BlockToHash): Promise<string> {
        const data = this.encodeMessage(`${chainName} ${block.index} ${block.previousHash} ${block.timestamp} ${JSON.stringify(block.data)}`);
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
        const latestBlock: Block | undefined = this.chain.at(-1);

        if (latestBlock === undefined) {
            throw new Error('Chain has no genesis block');
        }

        return latestBlock;
    }

    /** The hash depends on the content of the block only, so it is checked once per received block */
    public async hasValidHash(block: Block): Promise<boolean> {
        return block.hash === await Chain.calculateHash(this.name, block);
    }

    /** Whether the block follows the latest one, its hash must have been checked */
    public canAppend(block: Block): boolean {
        const latestBlock: Block = this.getLatestBlock();
        return latestBlock.index === block.index - 1 && latestBlock.hash === block.previousHash;
    }

    public append(block: Block): void {
        if (!this.canAppend(block)) {
            throw new Error('Block not valid');
        }

        this.chain.push(block);
    }

    public contains(block: Block): boolean {
        return this.hasIndex(block.index) && this.chain[block.index].hash === block.hash;
    }

    // The index comes from a peer
    private hasIndex(index: number): boolean {
        return Number.isInteger(index) && index >= 0 && index < this.chain.length;
    }

    public getBlock(index: number): Block {
        if (this.hasIndex(index)) {
            return this.chain[index];
        }

        throw new Error('Unexpected chain index');
    }

    public async isChainValid(): Promise<boolean> {
        for (let i: number = 1; i < this.chain.length; i++) {
            const current: Block = this.chain[i];
            const previous: Block = this.chain[i - 1];

            if (current.hash !== await Chain.calculateHash(this.name, current)) {
                return false;
            }

            if (current.previousHash !== previous.hash) {
                return false;
            }
        }
        return true;
    }

    public reset(): void {
        this.chain = [Chain.createGenesisBlock()];
    }
}
