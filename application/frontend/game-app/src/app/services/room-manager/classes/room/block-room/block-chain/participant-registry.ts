import { logHandlingFailure } from '@app/helpers/received-message-failure.helper';
import { switchExhaustivenessGuard } from '@app/helpers/switch-exhaustiveness-guard.helper';
import { AntiCheatMessage } from '@app/services/room-manager/classes/webrtc/messages/anti-cheat-message';
import { BlockChainMessage } from '@app/services/room-manager/classes/webrtc/messages/block-chain-message';
import {
    BlockRoomParticipantMessage,
    BlockRoomParticipantMessageType,
    NegotiationPayload,
    ReceivedBlockRoomParticipantMessage
} from '@app/services/room-manager/classes/webrtc/messages/block-room-participant-message';
import MessageOriginType from '@app/services/room-manager/classes/webrtc/messages/message-origin.types';
import { Subject } from 'rxjs';
import { Player } from '../../../player/player';
import { keyPairAlgorithm } from './block-chain.constants';
import { Participant } from './participant';
import { ParticipantKeyStore } from './participant-key-store';

/** The key pair of the local participant, with its public key exported once to be sent to each player */
export interface ParticipantKeys {
    readonly keyPair: CryptoKeyPair;
    readonly publicJwk: JsonWebKey;
}

/**
 * Participants of a block room, with their public key.
 * They are shared by all the block chains of the room, so each player is negotiated once whatever the number of chains.
 */
export class ParticipantRegistry {
    /** The blocks a participant wrote before leaving reach the other participants within this delay */
    private static readonly DEPARTED_RETENTION_MS: number = 60_000;

    /** @param keyPair the stored key pair of the player, a new one otherwise */
    public static async createKeys(keyPair?: CryptoKeyPair): Promise<ParticipantKeys> {
        const pair: CryptoKeyPair = keyPair ?? await ParticipantKeyStore.generateKeyPair();
        return { keyPair: pair, publicJwk: await crypto.subtle.exportKey('jwk', pair.publicKey) };
    }

    /** The connected participants */
    private readonly participants: Map<string, Participant> = new Map();
    /** The participants who left, kept to verify the blocks they wrote which are still being sequenced */
    private readonly departed: Map<string, Participant> = new Map();
    private readonly departedTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
    /** The participants whose key is being imported */
    private readonly importing: Set<Participant> = new Set();
    public readonly local: Participant;

    /** The names of the participants whose key has just been received */
    private readonly readySubject = new Subject<string>();
    public readonly ready$ = this.readySubject.asObservable();
    private readonly leftSubject = new Subject<string>();
    public readonly left$ = this.leftSubject.asObservable();

    public constructor(localPlayer: Player, public readonly keys: ParticipantKeys) {
        this.local = new Participant(localPlayer);
        this.local.receiveKey(keys.keyPair.publicKey);
        this.participants.set(this.local.name, this.local);
    }

    /** A connected participant */
    public get(name: string): Participant | undefined {
        return this.participants.get(name);
    }

    /** The author of a block, who may have left since */
    public author(name: string): Participant | undefined {
        return this.participants.get(name) ?? this.departed.get(name);
    }

    public values(): IterableIterator<Participant> {
        return this.participants.values();
    }

    /**
     * A reconnecting player gets a participant waiting for its current key: it may have lost its stored key pair
     * (cleared site data, private browsing). Its previous keys are kept to verify the blocks it signed before.
     */
    public onNewPlayer(player: Player): void {
        const previous: Participant | undefined = this.author(player.name);
        this.participants.set(player.name, new Participant(player, previous?.knownKeys));
        this.forgetDeparted(player.name);
        this.send(player.name, {
            type: BlockRoomParticipantMessageType.NEGOTIATION_REQUEST,
            payload: this.negotiationPayload(),
            origin: MessageOriginType.BLOCK_ROOM_PARTICIPANT,
        });
    }

    public onPlayerLeft(player: Player): void {
        const participant: Participant | undefined = this.participants.get(player.name);

        if (participant === undefined || participant === this.local) {
            return;
        }

        this.participants.delete(player.name);
        // Without any key, the blocks of the participant could never be verified
        if (participant.knownKeys.length > 0) {
            this.departed.set(player.name, participant);
            this.departedTimers.set(player.name, setTimeout(() => this.forgetDeparted(player.name), ParticipantRegistry.DEPARTED_RETENTION_MS));
        }
        this.leftSubject.next(player.name);
    }

    private forgetDeparted(name: string): void {
        clearTimeout(this.departedTimers.get(name));
        this.departedTimers.delete(name);
        this.departed.delete(name);
    }

    public handle(message: ReceivedBlockRoomParticipantMessage): void {
        void logHandlingFailure(message, this.onMessage(message));
    }

    private async onMessage(message: ReceivedBlockRoomParticipantMessage): Promise<void> {
        switch (message.type) {
            case BlockRoomParticipantMessageType.NEGOTIATION_REQUEST:
                await this.onNegotiationRequest(message);
                break;
            case BlockRoomParticipantMessageType.NEGOTIATION_RESPONSE:
                await this.onNegotiationResponse(message);
                break;
            default:
                switchExhaustivenessGuard(message);
        }
    }

    private negotiationPayload(): NegotiationPayload {
        return { publicKey: this.keys.publicJwk };
    }

    /**
     * The request carries the key of the requester too: if the request of this participant was lost,
     * sent before the peer knew it, the request of the peer still exchanges both keys.
     */
    private async onNegotiationRequest(message: ReceivedBlockRoomParticipantMessage<BlockRoomParticipantMessageType.NEGOTIATION_REQUEST>): Promise<void> {
        this.send(message.from, {
            type: BlockRoomParticipantMessageType.NEGOTIATION_RESPONSE,
            payload: this.negotiationPayload(),
            origin: MessageOriginType.BLOCK_ROOM_PARTICIPANT,
        });
        await this.registerKey(message.from, message.payload);
    }

    private async onNegotiationResponse(message: ReceivedBlockRoomParticipantMessage<BlockRoomParticipantMessageType.NEGOTIATION_RESPONSE>): Promise<void> {
        await this.registerKey(message.from, message.payload);
    }

    /** A connection has a single key, carried by both the request and the response of the peer: it is registered once */
    private async registerKey(name: string, payload: NegotiationPayload): Promise<void> {
        const participant: Participant | undefined = this.participants.get(name);

        if (!participant || participant.isReady() || this.importing.has(participant)) {
            return;
        }

        this.importing.add(participant);
        const publicKey: CryptoKey = await crypto.subtle.importKey('jwk', payload.publicKey, keyPairAlgorithm, true, ['verify'])
            .finally(() => this.importing.delete(participant));

        // The player may have reconnected or left meanwhile: its new connection is negotiated on its own
        if (this.participants.get(name) !== participant) {
            return;
        }

        participant.receiveKey(publicKey);
        this.readySubject.next(name);
    }

    public send(name: string, message: BlockChainMessage | BlockRoomParticipantMessage): void {
        this.participants.get(name)?.sendMessage(message);
    }

    public broadcast(message: BlockChainMessage | AntiCheatMessage): void {
        this.participants.forEach((participant: Participant) => participant.sendMessage(message));
    }

    /** Forgets the remote participants and completes the events */
    public clear(): void {
        this.participants.clear();
        this.participants.set(this.local.name, this.local);
        this.departedTimers.forEach((timer: ReturnType<typeof setTimeout>) => clearTimeout(timer));
        this.departedTimers.clear();
        this.departed.clear();
        this.importing.clear();
        this.readySubject.complete();
        this.leftSubject.complete();
    }
}
