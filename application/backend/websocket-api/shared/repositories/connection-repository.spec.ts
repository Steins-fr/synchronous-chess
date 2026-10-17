import { readConnections, storeConnection } from '@testing/api-mocks';
import { useTestDatabase } from '@testing/database';
import { beforeEach, describe, expect, test } from 'vitest';
import ConnectionRepository from './connection-repository';

describe('ConnectionRepository', () => {
    useTestDatabase();
    let repository: ConnectionRepository;

    beforeEach(() => {
        repository = new ConnectionRepository();
    });

    test('should create a connection', async () => {
        // When
        await repository.put({ connectionId: 'connection', roomName: 'room' });

        // Then
        expect(await readConnections()).toEqual([{ connectionId: 'connection', roomName: 'room' }]);
    });

    test('should move a connection to another room', async () => {
        // Given
        await storeConnection({ connectionId: 'connection', roomName: 'refused' });

        // When
        await repository.put({ connectionId: 'connection', roomName: 'room' });

        // Then
        expect(await readConnections()).toEqual([{ connectionId: 'connection', roomName: 'room' }]);
    });

    test('should find a connection by its id', async () => {
        // Given
        await storeConnection({ connectionId: 'connection', roomName: 'room' });
        await storeConnection({ connectionId: 'other', roomName: 'other' });

        // When / Then
        expect(await repository.find('connection')).toEqual({ connectionId: 'connection', roomName: 'room' });
        expect(await repository.find('unknown')).toBeNull();
    });

    test('should delete a connection', async () => {
        // Given
        await storeConnection({ connectionId: 'connection', roomName: 'room' });
        await storeConnection({ connectionId: 'other', roomName: 'other' });

        // When
        await repository.delete('connection');

        // Then
        expect(await readConnections()).toEqual([{ connectionId: 'other', roomName: 'other' }]);
    });
});
