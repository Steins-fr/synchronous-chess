import { Chain } from './chain';
import { describe, test, expect } from 'vitest';

describe('Chain', () => {
    test('should create an instance', () => {
        expect(new Chain()).toBeTruthy();
    });
});
