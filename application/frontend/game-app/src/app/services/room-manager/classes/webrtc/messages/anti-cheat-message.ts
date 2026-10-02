import { CheatReport } from '@app/services/room-manager/classes/room/block-room/anti-cheat/cheat-report';
import { EnvelopesOf, Received } from './envelope';
import MessageOriginType from './message-origin.types';

export enum AntiCheatMessageType {
    CHEAT_REPORT = 'cheatReport',
}

export interface AntiCheatPayloads {
    [AntiCheatMessageType.CHEAT_REPORT]: CheatReport;
}

/** Sent outside the block chains: a report does not need to be ordered, its sender is known by its connection */
export type AntiCheatMessage = EnvelopesOf<MessageOriginType.ANTI_CHEAT, AntiCheatPayloads>;

export type ReceivedAntiCheatMessage = Received<AntiCheatMessage>;
