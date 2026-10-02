import { AppMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { Block, ChainEntry } from './block';
import { genesisHash, signatureAlgorithm } from './block-chain.constants';
import { BlockChainName } from '../block-chain-name.enum';

export type BlockToHash = Omit<Block, 'hash' | 'sequencerSignature'>;

export class Chain {

    private chain: Block[] = [Chain.createGenesisBlock()];
    /** The ids of the entries of the chain, to detect a replayed entry */
    private readonly entryIds: Set<string> = new Set();

    public constructor(public readonly name: BlockChainName) {}

    private static createGenesisBlock(): Block {
        const entry: ChainEntry = { id: '', data: { from: '', type: '', payload: null }, signature: '' };
        return new Block(0, '', entry, '', genesisHash, '');
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

    // The chain name is hashed so that a block of a chain is not valid on another chain of the room
    public static async calculateHash(chainName: BlockChainName, block: BlockToHash): Promise<string> {
        const { entry } = block;
        const data = this.encodeMessage(
            `${ chainName } ${ block.index } ${ block.previousHash } ${ block.sequencer } ${ entry.id } ${ entry.signature } ${ JSON.stringify(entry.data) }`
        );
        const hashBuffer: ArrayBuffer = await crypto.subtle.digest('SHA-256', data);
        return this.arrayToHexString(new Uint8Array(hashBuffer));
    }

    /** What the author of an entry signs: the chain name prevents the entry from being replayed on another chain */
    public static entryContent(chainName: BlockChainName, id: string, data: AppMessage): string {
        return `${ chainName } ${ id } ${ JSON.stringify(data) }`;
    }

    public static async sign(content: string, privateKey: CryptoKey): Promise<string> {
        const signature: ArrayBuffer = await window.crypto.subtle.sign(
            signatureAlgorithm,
            privateKey,
            this.encodeMessage(content)
        );

        return this.arrayToHexString(new Uint8Array(signature));
    }

    public static async verify(signature: string, content: string, publicKey: CryptoKey): Promise<boolean> {
        return await window.crypto.subtle.verify(
            signatureAlgorithm,
            publicKey,
            this.hexStringToArray(signature),
            this.encodeMessage(content)
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
        this.entryIds.add(block.entry.id);
    }

    public contains(block: Block): boolean {
        return this.hasIndex(block.index) && this.chain[block.index].hash === block.hash;
    }

    public hasEntry(id: string): boolean {
        return this.entryIds.has(id);
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

    /** At most `max` blocks from an index, none for an index out of the chain */
    public blocksFrom(index: number, max: number): ReadonlyArray<Block> {
        return this.hasIndex(index) ? this.chain.slice(index, index + max) : [];
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
        this.entryIds.clear();
    }
}
