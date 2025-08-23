import { Block } from './block';
import { describe, test, expect } from 'vitest';

describe('Block', () => {
    test('should create an instance', () => {
        expect(new Block(0, '', {
            from: '',
            type: '',
            payload: '',
        }, '', '', '')).toBeTruthy();
    });
});
