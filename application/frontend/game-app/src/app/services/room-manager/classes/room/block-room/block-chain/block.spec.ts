import { Block, ChainEntry } from './block';
import { describe, test, expect } from 'vitest';

describe('Block', () => {
    test('should create an instance', () => {
        const entry: ChainEntry = { id: 'id', data: { from: 'a', type: 'move', payload: 'e4' }, signature: 'signature' };

        expect(new Block(1, 'previous', entry, 'host', 'hash', 'sequencerSignature')).toEqual({
            index: 1,
            previousHash: 'previous',
            entry,
            sequencer: 'host',
            hash: 'hash',
            sequencerSignature: 'sequencerSignature',
        });
    });
});
