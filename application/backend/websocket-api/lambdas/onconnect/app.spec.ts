import { anEvent } from '@testing/api-mocks';
import { describe, expect, test, vi } from 'vitest';
import { handler } from './app';

describe('onconnect lambda', () => {
    test('should accept the connection', async () => {
        // Given
        const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

        // When
        const response = await handler(anEvent('connection'));

        // Then
        expect(response).toEqual({ statusCode: 200, body: 'Connected' });
        expect(log).toHaveBeenCalledWith('New connection: connection');
    });
});
