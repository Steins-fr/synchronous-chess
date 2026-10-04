import { CheatReport } from '@app/services/room-manager/classes/room/block-room/anti-cheat/cheat-report';
import { EnvelopesOf, Received } from './envelope';
import MessageOriginType from './message-origin.types';

export enum AntiCheatMessageType {
    CHEAT_REPORT = 'cheatReport',
    /** The sequencer a participant follows, sent to each new participant: a player joining missed the handovers */
    SEQUENCER_STATE = 'sequencerState',
    /**
     * The participants a participant is connected to, sent to all whenever it changes: a participant has left the room
     * once all the others lost it, not when only one lost its connection to it
     */
    CONNECTED_PARTICIPANTS = 'connectedParticipants',
}

export interface SequencerState {
    sequencer: string;
    /** The number of handovers the participant made, a joining player made none */
    handovers: number;
    distrusted: ReadonlyArray<string>;
}

export interface ConnectedParticipants {
    /** Their names, the sender excluded */
    participants: ReadonlyArray<string>;
}

export interface AntiCheatPayloads {
    [AntiCheatMessageType.CHEAT_REPORT]: CheatReport;
    [AntiCheatMessageType.SEQUENCER_STATE]: SequencerState;
    [AntiCheatMessageType.CONNECTED_PARTICIPANTS]: ConnectedParticipants;
}

/** Sent outside the block chains: a report does not need to be ordered, its sender is known by its connection */
export type AntiCheatMessage<K extends AntiCheatMessageType = AntiCheatMessageType> = EnvelopesOf<MessageOriginType.ANTI_CHEAT, AntiCheatPayloads, K>;

export type ReceivedAntiCheatMessage<K extends AntiCheatMessageType = AntiCheatMessageType> = Received<AntiCheatMessage<K>>;
