import { AttributeString, AttributeNumber, AttributeList, AttributeMap } from './types';
import PlayerDocument from './player-document';

export default interface RoomDocument {
    ID: AttributeString;
    connectionId: AttributeString;
    hostPlayer: AttributeString;
    maxPlayer: AttributeNumber;
    players: AttributeList<AttributeMap<PlayerDocument>>;
    queue: AttributeList<AttributeMap<PlayerDocument>>;
}
