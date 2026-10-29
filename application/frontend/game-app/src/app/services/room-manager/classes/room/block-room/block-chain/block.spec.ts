import { Block, ChainEntry } from './block';
import { describe, test, expect } from 'vitest';

describe('Block', () => {
    test('should create an instance', () => {
        const entry: ChainEntry = { id: 'id', data: { from: 'a', type: 'move', payload: 'e4' }, signature: 'signature' };

        expect(new Block(1, 'previous', entry, 'host', 1000, 'hash', 'sequencerSignature')).toEqual({
            index: 1,
            previousHash: 'previous',
            entry,
            sequencer: 'host',
            time: 1000,
            hash: 'hash',
            sequencerSignature: 'sequencerSignature',
        });
    });
});
