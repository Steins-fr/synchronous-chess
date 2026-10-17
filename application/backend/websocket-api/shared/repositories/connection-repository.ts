import { connections } from '@database/schema';
import { DatabaseOperationEnum } from '@exceptions/database-exception';
import Connection from '@models/connection';
import { eq } from 'drizzle-orm';
import BaseRepository from './base-repository';

export default class ConnectionRepository extends BaseRepository {
    /** Creates the connection, or moves it to another room */
    public async put(connection: Connection): Promise<void> {
        await this.run(DatabaseOperationEnum.PUT, (): Promise<unknown> => this.db.insert(connections).values(connection)
            .onConflictDoUpdate({ target: connections.connectionId, set: { roomName: connection.roomName } }));
    }

    public async find(connectionId: string): Promise<Connection | null> {
        const [connection = null]: (Connection | null)[] = await this.run(DatabaseOperationEnum.GET, (): Promise<Connection[]> => this.db.select().from(connections)
            .where(eq(connections.connectionId, connectionId)));
        return connection;
    }

    public async delete(connectionId: string): Promise<void> {
        await this.run(DatabaseOperationEnum.DELETE, (): Promise<unknown> => this.db.delete(connections).where(eq(connections.connectionId, connectionId)));
    }
}
