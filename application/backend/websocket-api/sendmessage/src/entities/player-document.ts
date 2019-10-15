import { AttributeString } from './types';

export default interface PlayerDocument {
    playerName: AttributeString;
    connectionId?: AttributeString;
}
