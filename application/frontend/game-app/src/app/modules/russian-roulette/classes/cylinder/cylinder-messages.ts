import { ElGamalCipherTextHex } from '@app/modules/mental-poker/classes/exponential-elgamal';
import { BitProof, EqualLogsProof } from '@app/modules/mental-poker/classes/zk-proofs';
import { AppMessagesOf } from '@app/services/room-manager/classes/webrtc/messages/room-message';

export enum CylinderMessageType {
    /** A player picked its chambers: its share of the key, and its commitment to the draw of the first shooter */
    KEY = 'RR_key',
    /** A player loads its bullets, each chamber encrypted, and reveals its part of the draw */
    LOAD = 'RR_load',
    /** A player turned the cylinder by an offset of its own, and re-randomized every chamber */
    SPIN = 'RR_spin',
    /** A player gives its share of the decryption of a chamber fired */
    SHARE = 'RR_share',
    /** A player gives its share of the key, once the game is over, for every participant to check the cylinder */
    DISCLOSE = 'RR_disclose',
}

export interface CylinderKeyMessage {
    /** The id of the cylinder */
    game: string;
    /** h = g^x, in hexadecimal */
    key: string;
    /** The proof the player knows x: a key made from the key of the other player would decrypt alone */
    proof: EqualLogsProof;
    /** The SHA-256 of the id of the cylinder, the seat of the player and its random part of the draw */
    commitment: string;
}

export interface CylinderLoadMessage {
    game: string;
    /** A cipher text of 0 or 1 bullet for each chamber, under the key of both players */
    chambers: ReadonlyArray<ElGamalCipherTextHex>;
    /** The proof each chamber holds 0 or 1 bullet */
    proofs: ReadonlyArray<BitProof>;
    /** The proof the chambers hold the bullets of a player, no more no less */
    bullets: EqualLogsProof;
    /** The random part of the draw the player committed to */
    nonce: string;
}

export interface CylinderSpinMessage {
    game: string;
    chambers: ReadonlyArray<ElGamalCipherTextHex>;
}

export interface CylinderShareMessage {
    game: string;
    /** The index of the chamber fired */
    chamber: number;
    /** c1^x, in hexadecimal */
    share: string;
    /** The proof the share is made with the share of the key of the player */
    proof: EqualLogsProof;
}

export interface CylinderDiscloseMessage {
    game: string;
    /** x, in hexadecimal */
    secret: string;
}

export interface CylinderPayloads {
    [CylinderMessageType.KEY]: CylinderKeyMessage;
    [CylinderMessageType.LOAD]: CylinderLoadMessage;
    [CylinderMessageType.SPIN]: CylinderSpinMessage;
    [CylinderMessageType.SHARE]: CylinderShareMessage;
    [CylinderMessageType.DISCLOSE]: CylinderDiscloseMessage;
}

export type CylinderMessage = AppMessagesOf<CylinderPayloads>;
