import { Block } from './block';
import { BlockToHash, Chain } from './chain';
import { genesisHash, keyPairAlgorithm } from './block-chain.constants';
import { AppMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { TestHelper } from '@testing/test.helper';
import { describe, test, expect } from 'vitest';

const data: AppMessage = { from: 'a', type: 'move', payload: 1 };


async function createNextBlock(previous: Block, blockData: AppMessage = data): Promise<Block> {
    const blockToHash: BlockToHash = { index: previous.index + 1, previousHash: previous.hash, timestamp: '', data: blockData };
    return new Block(blockToHash.index, '', blockData, previous.hash, await Chain.calculateHash(blockToHash), '');
}

describe('Chain', () => {
    test('should create an instance', () => {
        expect(new Chain()).toBeTruthy();
    });

    test('should start with the genesis block', async () => {
        // Given
        const chain: Chain = new Chain();

        // When
        const genesis: Block = chain.getLatestBlock();

        // Then
        expect(genesis.index).toEqual(0);
        expect(genesis.hash).toEqual(genesisHash);
        expect(await Chain.calculateHash(genesis)).toEqual(genesisHash);
        expect(chain.getBlock(0)).toBe(genesis);
    });

    test('reset should only keep the genesis block', async () => {
        // Given
        const chain: Chain = new Chain();
        await chain.addBlock(await createNextBlock(chain.getLatestBlock()));

        // When
        chain.reset();

        // Then
        expect(chain.getLatestBlock().index).toEqual(0);
        expect(chain.getLatestBlock().hash).toEqual(genesisHash);
    });

    test('should add a valid block', async () => {
        // Given
        const chain: Chain = new Chain();
        const block: Block = await createNextBlock(chain.getLatestBlock());

        // When
        const canAdd: boolean = await chain.canAddBlockAsync(block);
        await chain.addBlock(block);

        // Then
        expect(canAdd).toEqual(true);
        expect(chain.getLatestBlock()).toBe(block);
        expect(await chain.isChainValid()).toEqual(true);
    });

    test('should refuse invalid blocks', async () => {
        // Given
        const chain: Chain = new Chain();
        const genesis: Block = chain.getLatestBlock();
        const valid: Block = await createNextBlock(genesis);
        const tooFar: Block = new Block(5, '', data, genesis.hash, valid.hash, '');
        const sameIndex: Block = new Block(0, '', data, genesis.hash, valid.hash, '');
        const wrongPrevious: Block = new Block(1, '', data, 'wrong', valid.hash, '');
        const wrongHash: Block = new Block(1, '', data, genesis.hash, 'wrong', '');

        // When / Then
        expect(await chain.canAddBlockAsync(tooFar)).toEqual(false);
        expect(await chain.canAddBlockAsync(sameIndex)).toEqual(false);
        expect(await chain.canAddBlockAsync(wrongPrevious)).toEqual(false);
        expect(await chain.canAddBlockAsync(wrongHash)).toEqual(false);
        await expect(chain.addBlock(wrongHash)).rejects.toThrow('Block not valid');
    });

    test('getBlock should throw for an unknown index', () => {
        // Given
        const chain: Chain = new Chain();

        // When
        const call = (): Block => chain.getBlock(1);

        // Then
        expect(call).toThrow('Unexpected chain index');
    });

    test('getLatestBlock should throw when the genesis block is missing', () => {
        // Given
        const chain: Chain = new Chain();
        TestHelper.cast<{ chain: Block[] }>(chain).chain = [];

        // When
        const call = (): Block => chain.getLatestBlock();

        // Then
        expect(call).toThrow('Chain has no genesis block');
    });

    test('isChainValid should detect a tampered hash', async () => {
        // Given
        const chain: Chain = new Chain();
        const block: Block = await createNextBlock(chain.getLatestBlock());
        const tampered: Block = new Block(block.index, block.timestamp, { ...data, payload: 2 }, block.previousHash, block.hash, '');
        (chain as unknown as { chain: Block[] }).chain.push(tampered);

        // When
        const isValid: boolean = await chain.isChainValid();

        // Then
        expect(isValid).toEqual(false);
    });

    test('isChainValid should detect a broken link', async () => {
        // Given
        const chain: Chain = new Chain();
        const orphanPrevious: Block = new Block(0, '', data, '', 'orphan', '');
        const orphan: Block = await createNextBlock(orphanPrevious);
        (chain as unknown as { chain: Block[] }).chain.push(orphan);

        // When
        const isValid: boolean = await chain.isChainValid();

        // Then
        expect(isValid).toEqual(false);
    });

    test('should sign and verify a hash', async () => {
        // Given
        const keyPair: CryptoKeyPair = await window.crypto.subtle.generateKey(keyPairAlgorithm, true, ['sign', 'verify']);
        const otherKeyPair: CryptoKeyPair = await window.crypto.subtle.generateKey(keyPairAlgorithm, true, ['sign', 'verify']);

        // When
        const signature: string = await Chain.signHash('hash', keyPair.privateKey);

        // Then
        expect(signature).toMatch(/^[0-9a-f]+$/);
        expect(await Chain.verifyMessage(signature, 'hash', keyPair.publicKey)).toEqual(true);
        expect(await Chain.verifyMessage(signature, 'other', keyPair.publicKey)).toEqual(false);
        expect(await Chain.verifyMessage(signature, 'hash', otherKeyPair.publicKey)).toEqual(false);
    });
});
