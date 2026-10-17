import Connection from '@models/connection';
import { readConnections, storeConnection } from '@testing/api-mocks';
import { useTestDatabase } from '@testing/database';
import { beforeEach, describe, expect, test } from 'vitest';
import ConnectionService from './connection-service';

describe('ConnectionService', () => {
    useTestDatabase();
    const connection: Connection = { connectionId: 'connection', roomName: 'room' };
    const other: Connection = { connectionId: 'other', roomName: 'other' };
    let service: ConnectionService;

    beforeEach(() => {
        service = new ConnectionService();
    });

    test('should create, get and delete a connection', async () => {
        // Given
        await storeConnection(other);

        // When
        await service.create(connection);
        const created: Connection[] = await readConnections();
        const found: Connection | null = await service.get('connection');
        await service.delete(connection);

        // Then
        expect(created).toEqual([connection, other]);
        expect(found).toEqual(connection);
        expect(await readConnections()).toEqual([other]);
    });
});
