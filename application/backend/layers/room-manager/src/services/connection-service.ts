import ConnectionRepository from '../repositories/connection-repository';
import Connection from '../entities/connection';

export default class ConnectionService {

    private readonly connectionRepository: ConnectionRepository = new ConnectionRepository();

    public async create(connection: Connection): Promise<void> {
        await this.connectionRepository.create(connection);
    }

    public get(connectionId: string): Promise<Connection> {
        return this.connectionRepository.get({ connectionId });
    }

    public async delete(connection: Connection): Promise<void> {
        await this.connectionRepository.delete(connection);
    }
}
