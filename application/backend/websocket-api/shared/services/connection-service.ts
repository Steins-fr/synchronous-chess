import ConnectionRepository from '@repositories/connection-repository';
import Connection from '@models/connection';

export default class ConnectionService {
    private readonly connectionRepository: ConnectionRepository = new ConnectionRepository();

    public async create(connection: Connection): Promise<void> {
        await this.connectionRepository.put(connection);
    }

    public async get(connectionId: string): Promise<Connection | null> {
        return this.connectionRepository.find({ connectionId });
    }

    public async delete(connection: Connection): Promise<void> {
        await this.connectionRepository.delete(connection);
    }
}
