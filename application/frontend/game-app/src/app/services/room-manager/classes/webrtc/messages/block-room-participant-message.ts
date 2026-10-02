import { EnvelopesOf, Received } from './envelope';
import MessageOriginType from './message-origin.types';

export enum BlockRoomParticipantMessageType {
    NEGOTIATION_REQUEST = 'getPublicKeyRequest',
    NEGOTIATION_RESPONSE = 'getPublicKeyResponse',
}

export interface NegotiationPayload {
    publicKey: JsonWebKey;
    nbParticipants: number;
}

export interface BlockRoomParticipantPayloads {
    [BlockRoomParticipantMessageType.NEGOTIATION_REQUEST]: NegotiationPayload;
    [BlockRoomParticipantMessageType.NEGOTIATION_RESPONSE]: NegotiationPayload;
}

/** The participants of a block room are shared by all its block chains, so they are negotiated once for the room */
export type BlockRoomParticipantMessage<K extends BlockRoomParticipantMessageType = BlockRoomParticipantMessageType> =
    EnvelopesOf<MessageOriginType.BLOCK_ROOM_PARTICIPANT, BlockRoomParticipantPayloads, K>;

export type ReceivedBlockRoomParticipantMessage<K extends BlockRoomParticipantMessageType = BlockRoomParticipantMessageType> =
    Received<BlockRoomParticipantMessage<K>>;
