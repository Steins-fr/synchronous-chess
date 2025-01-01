import Connection from '@models/connection';
import { getConnectionsTableName } from '@helpers/environment.helper';
import BaseRepository, { DocumentAttributes } from './base-repository';

export default class ConnectionRepository extends BaseRepository<Connection> {

    protected readonly tableName: string = getConnectionsTableName();
    protected readonly defaultProjection: string = 'connectionId, roomName';

    protected override getKey(item: Connection): DocumentAttributes {
        return { connectionId: item.connectionId };
    }
}
