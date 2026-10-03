import { Block, ChainEntry } from './block';
import { BlockChainName } from '../block-chain-name.enum';
import { BlockToHash, Chain } from './chain';
import { genesisHash, keyPairAlgorithm } from './block-chain.constants';
import { AppMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { TestHelper } from '@testing/test.helper';
import { describe, test, expect } from 'vitest';

const data: AppMessage = { from: 'a', type: 'move', payload: 1 };
const chainName: BlockChainName = BlockChainName.CHESS;

function createEntry(blockData: AppMessage = data, id: string = 'entry'): ChainEntry {
    return { id, data: blockData, signature: 'signature' };
}

async function createNextBlock(previous: Block, entry: ChainEntry = createEntry(), blockChainName: BlockChainName = chainName): Promise<Block> {
    const blockToHash: BlockToHash = { index: previous.index + 1, previousHash: previous.hash, entry, sequencer: 'host' };
    return new Block(blockToHash.index, previous.hash, entry, 'host', await Chain.calculateHash(blockChainName, blockToHash), '');
}

describe('Chain', () => {
    test('should create an instance', () => {
        expect(new Chain(chainName)).toBeTruthy();
    });

    test('should start with the genesis block', async () => {
        // Given
        const chain: Chain = new Chain(chainName);

        // When
        const genesis: Block = chain.getLatestBlock();

        // Then
        expect(genesis.index).toEqual(0);
        expect(genesis.hash).toEqual(genesisHash);
        expect(chain.getBlock(0)).toBe(genesis);
    });

    test('should refuse the hash of a block hashed for another chain', async () => {
        // Given
        const chain: Chain = new Chain(chainName);
        const otherChainBlock: Block = await createNextBlock(chain.getLatestBlock(), createEntry(), BlockChainName.CHAT);

        // When / Then
        expect(await chain.hasValidHash(otherChainBlock)).toEqual(false);
    });

    test('reset should only keep the genesis block', async () => {
        // Given
        const chain: Chain = new Chain(chainName);
        chain.append(await createNextBlock(chain.getLatestBlock()));

        // When
        chain.reset();

        // Then
        expect(chain.getLatestBlock().index).toEqual(0);
        expect(chain.getLatestBlock().hash).toEqual(genesisHash);
    });

    test('should append a valid block', async () => {
        // Given
        const chain: Chain = new Chain(chainName);
        const block: Block = await createNextBlock(chain.getLatestBlock());

        // When
        const hasValidHash: boolean = await chain.hasValidHash(block);
        const canAppend: boolean = chain.canAppend(block);
        chain.append(block);

        // Then
        expect(hasValidHash).toEqual(true);
        expect(canAppend).toEqual(true);
        expect(chain.getLatestBlock()).toBe(block);
        expect(chain.contains(block)).toEqual(true);
    });

    test('should refuse invalid blocks', async () => {
        // Given
        const chain: Chain = new Chain(chainName);
        const genesis: Block = chain.getLatestBlock();
        const valid: Block = await createNextBlock(genesis);
        const tooFar: Block = { ...valid, index: 5 };
        const sameIndex: Block = { ...valid, index: 0 };
        const wrongPrevious: Block = { ...valid, previousHash: 'wrong' };
        const wrongHash: Block = { ...valid, hash: 'wrong' };

        // When / Then
        expect(chain.canAppend(tooFar)).toEqual(false);
        expect(chain.canAppend(sameIndex)).toEqual(false);
        expect(chain.canAppend(wrongPrevious)).toEqual(false);
        expect(await chain.hasValidHash(wrongHash)).toEqual(false);
        expect(() => chain.append(wrongPrevious)).toThrow('Block not valid');
        expect(chain.getLatestBlock()).toBe(genesis);
    });

    test('contains should only find the blocks of the chain', async () => {
        // Given
        const chain: Chain = new Chain(chainName);
        const block: Block = await createNextBlock(chain.getLatestBlock());
        const otherBlock: Block = await createNextBlock(chain.getLatestBlock(), createEntry({ ...data, payload: 2 }, 'other'));
        chain.append(block);

        // When / Then
        expect(chain.contains(chain.getBlock(0))).toEqual(true);
        expect(chain.contains(otherBlock)).toEqual(false);
        expect(chain.contains({ ...block, index: 2 })).toEqual(false);
        expect(chain.contains({ ...block, index: -1 })).toEqual(false);
        expect(chain.contains({ ...block, index: 0.5 })).toEqual(false);
    });

    test('getBlock should throw for an unknown index', () => {
        // Given
        const chain: Chain = new Chain(chainName);

        // When
        const call = (): Block => chain.getBlock(1);

        // Then
        expect(call).toThrow('Unexpected chain index');
    });

    test('getLatestBlock should throw when the genesis block is missing', () => {
        // Given
        const chain: Chain = new Chain(chainName);
        TestHelper.cast<{ chain: Block[] }>(chain).chain = [];

        // When
        const call = (): Block => chain.getLatestBlock();

        // Then
        expect(call).toThrow('Chain has no genesis block');
    });

    test('should sign and verify a content', async () => {
        // Given
        const keyPair: CryptoKeyPair = await window.crypto.subtle.generateKey(keyPairAlgorithm, true, ['sign', 'verify']);
        const otherKeyPair: CryptoKeyPair = await window.crypto.subtle.generateKey(keyPairAlgorithm, true, ['sign', 'verify']);

        // When
        const signature: string = await Chain.sign('hash', keyPair.privateKey);

        // Then
        expect(signature).toMatch(/^[0-9a-f]+$/);
        expect(await Chain.verify(signature, 'hash', keyPair.publicKey)).toEqual(true);
        expect(await Chain.verify(signature, 'other', keyPair.publicKey)).toEqual(false);
        expect(await Chain.verify(signature, 'hash', otherKeyPair.publicKey)).toEqual(false);
    });

    test('entryContent should bind an entry to its chain', () => {
        expect(Chain.entryContent(BlockChainName.CHESS, 'id', data)).not.toEqual(Chain.entryContent(BlockChainName.CHAT, 'id', data));
        expect(Chain.entryContent(BlockChainName.CHESS, 'id', data)).toEqual(`chess id ${ JSON.stringify(data) }`);
    });

    test('should keep the entries of its blocks, until reset', async () => {
        // Given
        const chain: Chain = new Chain(chainName);
        chain.append(await createNextBlock(chain.getLatestBlock()));

        // When
        const hasEntry: boolean = chain.hasEntry('entry');
        chain.reset();

        // Then
        expect(hasEntry).toEqual(true);
        expect(chain.hasEntry('entry')).toEqual(false);
    });

    test('blocksFrom should give at most a number of blocks from an index', async () => {
        // Given
        const chain: Chain = new Chain(chainName);
        const block1: Block = await createNextBlock(chain.getLatestBlock(), createEntry(data, '1'));
        chain.append(block1);
        const block2: Block = await createNextBlock(block1, createEntry(data, '2'));
        chain.append(block2);

        // When / Then
        expect(chain.blocksFrom(1, 50)).toEqual([block1, block2]);
        expect(chain.blocksFrom(0, 2)).toEqual([chain.getBlock(0), block1]);
        expect(chain.blocksFrom(3, 50)).toEqual([]);
        expect(chain.blocksFrom(-1, 50)).toEqual([]);
    });
});
