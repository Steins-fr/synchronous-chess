import BaseRepository, { TableKey } from './base-repository';
import Connection from '../entities/connection';
import ConnectionDocument from '../schemas/connection-document';

export default class ConnectionRepository extends BaseRepository<Connection, ConnectionDocument> {

    protected readonly tableName: string = process.env.TABLE_NAME_CONNECTIONS as string;
    protected readonly defaultProjection: string = 'connectionId, roomName';

    protected getKey(item: Connection): TableKey {
        return this.marshall({ connectionId: item.connectionId });
    }
}
