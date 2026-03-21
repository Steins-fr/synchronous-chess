import { WaitingQueue } from './waiting-queue';
import { describe, test, expect } from 'vitest';

describe('WaitingQueue', () => {
    test('should create an instance', () => {
        expect(new WaitingQueue()).toBeTruthy();
    });
});
