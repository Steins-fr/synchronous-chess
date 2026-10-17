import { DatabaseErrorException } from '@aws-sdk/client-rds-data';
import DatabaseException, { DatabaseOperationEnum } from '@exceptions/database-exception';
import { DrizzleQueryError } from 'drizzle-orm';
import { describe, expect, test } from 'vitest';
import BaseRepository from './base-repository';

class TestRepository extends BaseRepository {
    public runStatements<Output>(statements: () => Promise<Output>): Promise<Output> {
        return this.run(DatabaseOperationEnum.UPDATE, statements);
    }

    public static wrote(rows: unknown[]): boolean {
        return TestRepository.written(rows);
    }
}

describe('BaseRepository', () => {
    const repository: TestRepository = new TestRepository();

    test('should give the output of the statements', async () => {
        expect(await repository.runStatements(() => Promise.resolve('output'))).toEqual('output');
    });

    test('should report the failure of a statement with the error of the database, without the statement nor its parameters', async () => {
        // Given
        const cause: Error = new Error('duplicate key value violates unique constraint');
        const failure: DrizzleQueryError = new DrizzleQueryError('insert into "rooms" values ($1)', ['token-hash'], cause);

        // When / Then
        const reported: Promise<unknown> = repository.runStatements(() => Promise.reject(failure));
        await expect(reported).rejects.toBeInstanceOf(DatabaseException);
        await expect(reported).rejects.toEqual(expect.objectContaining({ operation: DatabaseOperationEnum.UPDATE, message: cause.message, cause }));
    });

    test('should report the failure of a statement without cause', async () => {
        await expect(repository.runStatements(() => Promise.reject(new DrizzleQueryError('select 1', [])))).rejects
            .toEqual(expect.objectContaining({ operation: DatabaseOperationEnum.UPDATE, message: 'The statement failed' }));
    });

    test('should report the failure of the Data API starting or ending a transaction', async () => {
        // Given
        const failure: DatabaseErrorException = new DatabaseErrorException({ $metadata: {}, message: 'Transaction not found' });

        // When / Then
        await expect(repository.runStatements(() => Promise.reject(failure))).rejects
            .toEqual(expect.objectContaining({ operation: DatabaseOperationEnum.UPDATE, message: 'Transaction not found', cause: failure }));
    });

    test('should rethrow another failure', async () => {
        // Given
        const failure: Error = new Error('Player not in the room');

        // When / Then
        await expect(repository.runStatements(() => Promise.reject(failure))).rejects.toBe(failure);
    });

    test.each([
        ['wrote', [{ id: 'room' }], true],
        ['did not write', [], false],
    ])('should tell a conditional write %s from the rows it returned', (_case: string, rows: unknown[], written: boolean) => {
        expect(TestRepository.wrote(rows)).toEqual(written);
    });
});
