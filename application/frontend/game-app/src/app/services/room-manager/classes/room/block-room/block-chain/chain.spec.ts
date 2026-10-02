import { Block } from './block';
import { BlockChainName } from '../block-chain-name.enum';
import { BlockToHash, Chain } from './chain';
import { genesisHash, keyPairAlgorithm } from './block-chain.constants';
import { AppMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { TestHelper } from '@testing/test.helper';
import { describe, test, expect } from 'vitest';

const data: AppMessage = { from: 'a', type: 'move', payload: 1 };
const chainName: BlockChainName = BlockChainName.CHESS;


async function createNextBlock(previous: Block, blockData: AppMessage = data, blockChainName: BlockChainName = chainName): Promise<Block> {
    const blockToHash: BlockToHash = { index: previous.index + 1, previousHash: previous.hash, timestamp: '', data: blockData };
    return new Block(blockToHash.index, '', blockData, previous.hash, await Chain.calculateHash(blockChainName, blockToHash), '');
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
        const otherChainBlock: Block = await createNextBlock(chain.getLatestBlock(), data, BlockChainName.CHAT);

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
        expect(await chain.isChainValid()).toEqual(true);
    });

    test('should refuse invalid blocks', async () => {
        // Given
        const chain: Chain = new Chain(chainName);
        const genesis: Block = chain.getLatestBlock();
        const valid: Block = await createNextBlock(genesis);
        const tooFar: Block = new Block(5, '', data, genesis.hash, valid.hash, '');
        const sameIndex: Block = new Block(0, '', data, genesis.hash, valid.hash, '');
        const wrongPrevious: Block = new Block(1, '', data, 'wrong', valid.hash, '');
        const wrongHash: Block = new Block(1, '', data, genesis.hash, 'wrong', '');

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
        const otherBlock: Block = await createNextBlock(chain.getLatestBlock(), { ...data, payload: 2 });
        chain.append(block);

        // When / Then
        expect(chain.contains(chain.getBlock(0))).toEqual(true);
        expect(chain.contains(otherBlock)).toEqual(false);
        expect(chain.contains(new Block(2, '', data, block.hash, 'next', ''))).toEqual(false);
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

    test('isChainValid should detect a tampered hash', async () => {
        // Given
        const chain: Chain = new Chain(chainName);
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
        const chain: Chain = new Chain(chainName);
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
