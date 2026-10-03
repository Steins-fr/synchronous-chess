import { isNetworkMessage } from './network-message';
import MessageOriginType from './message-origin.types';
import { BlockChainName } from '@app/services/room-manager/classes/room/block-room/block-chain-name.enum';
import { PlayerMessageType } from './player-message';
import { BlockChainMessageType } from './block-chain-message';
import { BlockRoomParticipantMessageType } from './block-room-participant-message';
import { describe, test, expect } from 'vitest';

describe('isNetworkMessage', () => {
    test('should reject values which are not an envelope', () => {
        expect(isNetworkMessage(null)).toEqual(false);
        expect(isNetworkMessage('message')).toEqual(false);
        expect(isNetworkMessage({ type: 'ping', payload: '' })).toEqual(false);
        expect(isNetworkMessage({ origin: MessageOriginType.PLAYER, payload: '' })).toEqual(false);
        expect(isNetworkMessage({ origin: MessageOriginType.PLAYER, type: PlayerMessageType.PING })).toEqual(false);
    });

    test('should reject envelopes with invalid origin or type', () => {
        expect(isNetworkMessage({ origin: 1, type: PlayerMessageType.PING, payload: '' })).toEqual(false);
        expect(isNetworkMessage({ origin: MessageOriginType.PLAYER, type: 1, payload: '' })).toEqual(false);
        expect(isNetworkMessage({ origin: 'unknown', type: PlayerMessageType.PING, payload: '' })).toEqual(false);
        expect(isNetworkMessage({ origin: 'toString', type: PlayerMessageType.PING, payload: '' })).toEqual(false);
        expect(isNetworkMessage({ origin: MessageOriginType.PLAYER, type: 'unknown', payload: '' })).toEqual(false);
    });

    test('should accept known envelopes and any room service type', () => {
        expect(isNetworkMessage({ origin: MessageOriginType.PLAYER, type: PlayerMessageType.PONG, payload: '' })).toEqual(true);
        expect(isNetworkMessage({ origin: MessageOriginType.BLOCK_ROOM_SERVICE, type: BlockChainMessageType.GET_BLOCKS_REQUEST, payload: null, chain: BlockChainName.CHESS })).toEqual(true);
        expect(isNetworkMessage({ origin: MessageOriginType.ROOM_SERVICE, type: 'anything', payload: null })).toEqual(true);
        expect(isNetworkMessage({ origin: MessageOriginType.BLOCK_ROOM_PARTICIPANT, type: BlockRoomParticipantMessageType.NEGOTIATION_REQUEST, payload: null })).toEqual(true);
    });

    test('should reject block chain envelopes without a known chain name', () => {
        expect(isNetworkMessage({ origin: MessageOriginType.BLOCK_ROOM_SERVICE, type: BlockChainMessageType.GET_BLOCKS_REQUEST, payload: null })).toEqual(false);
        expect(isNetworkMessage({ origin: MessageOriginType.BLOCK_ROOM_SERVICE, type: BlockChainMessageType.GET_BLOCKS_REQUEST, payload: null, chain: 1 })).toEqual(false);
        expect(isNetworkMessage({ origin: MessageOriginType.BLOCK_ROOM_SERVICE, type: BlockChainMessageType.GET_BLOCKS_REQUEST, payload: null, chain: 'unknown' })).toEqual(false);
    });
});
