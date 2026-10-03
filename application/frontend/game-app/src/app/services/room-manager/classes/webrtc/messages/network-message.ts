import { BlockChainName } from '@app/services/room-manager/classes/room/block-room/block-chain-name.enum';
import { BlockChainMessage, BlockChainMessageType } from './block-chain-message';
import { AntiCheatMessage, AntiCheatMessageType } from './anti-cheat-message';
import { BlockRoomParticipantMessage, BlockRoomParticipantMessageType } from './block-room-participant-message';
import { Received } from './envelope';
import { HostRoomMessage, HostRoomMessageType } from './host-room-message';
import MessageOriginType from './message-origin.types';
import { NegotiatorMessage, NegotiatorMessageType } from './negotiator-message';
import { PlayerMessage, PlayerMessageType } from './player-message';
import { RoomServiceMessage } from './room-message';

export type NetworkMessage = PlayerMessage | NegotiatorMessage | HostRoomMessage | BlockChainMessage | BlockRoomParticipantMessage | AntiCheatMessage
    | RoomServiceMessage;

export type ReceivedMessage = Received<NetworkMessage>;

// Room service messages carry application types, they are not known here
const knownTypes: Readonly<Record<Exclude<MessageOriginType, MessageOriginType.ROOM_SERVICE>, ReadonlyArray<string>>> = {
    [MessageOriginType.PLAYER]: Object.values(PlayerMessageType),
    [MessageOriginType.NEGOTIATOR]: Object.values(NegotiatorMessageType),
    [MessageOriginType.HOST_ROOM]: Object.values(HostRoomMessageType),
    [MessageOriginType.BLOCK_ROOM_SERVICE]: Object.values(BlockChainMessageType),
    [MessageOriginType.BLOCK_ROOM_PARTICIPANT]: Object.values(BlockRoomParticipantMessageType),
    [MessageOriginType.ANTI_CHEAT]: Object.values(AntiCheatMessageType),
};

const blockChainNames: ReadonlyArray<unknown> = Object.values(BlockChainName);

function isBlockChainName(chain: unknown): chain is BlockChainName {
    return blockChainNames.includes(chain);
}

function isKnownOrigin(origin: string): origin is keyof typeof knownTypes {
    return Object.hasOwn(knownTypes, origin);
}

/** Validates the envelope of data received from a peer. The payload is trusted. */
export function isNetworkMessage(data: unknown): data is NetworkMessage {
    if (typeof data !== 'object' || data === null || !('origin' in data) || !('type' in data) || !('payload' in data)) {
        return false;
    }

    const { origin, type } = data;
    if (typeof origin !== 'string' || typeof type !== 'string') {
        return false;
    }

    if (origin === MessageOriginType.BLOCK_ROOM_SERVICE && !('chain' in data && isBlockChainName(data.chain))) {
        return false;
    }

    return origin === MessageOriginType.ROOM_SERVICE || (isKnownOrigin(origin) && knownTypes[origin].includes(type));
}
