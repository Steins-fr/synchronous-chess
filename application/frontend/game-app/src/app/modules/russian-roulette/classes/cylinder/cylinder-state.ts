import { CryptoHelper } from '@app/helpers/crypto.helper';
import { ElGamalCipherText, ExponentialElGamal } from '@app/modules/mental-poker/classes/exponential-elgamal';
import { verifyBit, verifyEqualLogs } from '@app/modules/mental-poker/classes/zk-proofs';
import { CheatReason } from '@app/services/room-manager/classes/room/block-room/anti-cheat/cheat-report';
import {
    CylinderDiscloseMessage, CylinderKeyMessage, CylinderLoadMessage, CylinderMessage, CylinderMessageType, CylinderShareMessage, CylinderSpinMessage,
} from './cylinder-messages';

export enum CylinderPhase {
    /** The players give their shares of the key, as they pick their chambers */
    KEYS = 'keys',
    /** The players load their bullets */
    LOADING = 'loading',
    /** The players turn the cylinder, the first seat first */
    SPINNING = 'spinning',
    /** The chambers fire as the game asks */
    READY = 'ready',
    /** A spin that is not a cylinder, or a chamber not giving a count of bullets: the game stops */
    BROKEN = 'broken',
}

export interface CylinderCheat {
    /** The message received, as the chain delivered it: the room reports a cheat by its block */
    readonly message: CylinderMessage;
    readonly reason: CheatReason;
}

/** The chambers of a cylinder, as a player left them */
export interface CylinderStep {
    readonly message: CylinderMessage;
    readonly chambers: ReadonlyArray<ElGamalCipherText>;
}

interface PlayerKey {
    readonly message: CylinderMessage;
    readonly key: bigint;
    readonly commitment: string;
}

/** What applying a message gave: a cheat to report, the bullets of a chamber once both shares are in */
export interface CylinderApplied {
    readonly cheat?: CylinderCheat;
    readonly fired?: { readonly chamber: number; readonly bullets: number };
}

const COMMITMENT: RegExp = /^[0-9a-f]{64}$/;

/**
 * What the chain tells of a cylinder, the same for every participant: the keys, the loads and the spins of the players,
 * the shares of each chamber fired and the disclosures. A message applies once its proofs are checked, before the next
 * one: the first message of a player for a step is final, the ones out of their step are ignored.
 */
export class CylinderState {
    public readonly keys = new Map<string, PlayerKey>();
    public readonly loads = new Map<string, CylinderStep & { readonly nonce: string }>();
    /** The cylinder of both loads, each chamber hiding the bullets of both players */
    public loaded: ReadonlyArray<ElGamalCipherText> = [];
    /** The spins, in the order of the seats */
    public readonly spins: CylinderStep[] = [];
    /** The shares of each chamber asked for, by player */
    public readonly shares = new Map<number, Map<string, { readonly message: CylinderMessage; readonly share: bigint }>>();
    public readonly disclosures = new Map<string, { readonly message: CylinderMessage; readonly secret: bigint }>();
    /** The seat shooting first, drawn from the random parts of both players once they loaded their bullets */
    public first: number | null = null;
    /** The spin that was not a cylinder, breaking it: reported once applied, its player cheated */
    public malformedSpin?: CylinderMessage;
    private broken: boolean = false;

    /**
     * @param id unique to the cylinder: the context of every proof, so a proof of another cylinder proves nothing here
     * @param players the player of each seat, in the order of the seats
     */
    public constructor(
        public readonly id: string,
        public readonly players: readonly [string, string],
        public readonly cipher: ExponentialElGamal,
        public readonly chambers: number = 24,
        public readonly bullets: number = 3,
    ) {
        if (players[0] === players[1]) {
            throw new Error('A cylinder needs 2 players');
        }
    }

    public get phase(): CylinderPhase {
        if (this.broken) {
            return CylinderPhase.BROKEN;
        }
        if (this.keys.size < 2) {
            return CylinderPhase.KEYS;
        }
        if (this.loads.size < 2) {
            return CylinderPhase.LOADING;
        }
        return this.spins.length < 2 ? CylinderPhase.SPINNING : CylinderPhase.READY;
    }

    /** The key of both players */
    public get jointKey(): bigint | undefined {
        return this.keys.size < 2 ? undefined : this.cipher.multiplyValues(this.players.map((player: string) => (this.keys.get(player) as PlayerKey).key));
    }

    /** The cylinder the next spin turns, the chambers fired from once spun */
    public get cylinder(): ReadonlyArray<ElGamalCipherText> {
        return this.spins.at(-1)?.chambers ?? this.loaded;
    }

    /** The player to turn the cylinder */
    public get spinner(): string | undefined {
        return this.phase === CylinderPhase.SPINNING ? this.players[this.spins.length] : undefined;
    }

    /** The players the cylinder waits for, whatever the game asks: the next step of each one */
    public get waitingFor(): ReadonlyArray<string> {
        switch (this.phase) {
            case CylinderPhase.KEYS:
                return this.players.filter((player: string) => !this.keys.has(player));
            case CylinderPhase.LOADING:
                return this.players.filter((player: string) => !this.loads.has(player));
            case CylinderPhase.SPINNING:
                return [this.spinner as string];
            case CylinderPhase.READY:
                return this.players.filter((player: string) => this.missingShares(player).length > 0
                    || (this.isDisclosureRequested && !this.disclosures.has(player)));
            default:
                return this.players.filter((player: string) => this.isDisclosureRequested && !this.disclosures.has(player));
        }
    }

    public isDisclosureRequested: boolean = false;

    /** The steps of the players in the chain: a timeout naming fewer is void, a step was made meanwhile */
    public get progress(): number {
        const shares: number = [...this.shares.values()].reduce((sum: number, given: ReadonlyMap<string, unknown>) => sum + given.size, 0);
        return this.keys.size + this.loads.size + this.spins.length + shares + this.disclosures.size;
    }

    public get isDisclosed(): boolean {
        return this.players.every((player: string) => this.disclosures.has(player));
    }

    public seatOf(player: string): number {
        return this.players.indexOf(player);
    }

    /** The game fires a chamber: the players give their shares of it */
    public requestShot(chamber: number): void {
        if (Number.isInteger(chamber) && chamber >= 0 && chamber < this.chambers && !this.shares.has(chamber)) {
            this.shares.set(chamber, new Map());
        }
    }

    /** The chambers fired whose share of the player is not in the chain */
    public missingShares(player: string): ReadonlyArray<number> {
        if (this.phase !== CylinderPhase.READY) {
            return [];
        }
        return [...this.shares].filter(([, shares]) => !shares.has(player)).map(([chamber]) => chamber);
    }

    /** The game is over, or stopped: the players give their shares of the key */
    public requestDisclosure(): void {
        this.isDisclosureRequested = true;
    }

    public async apply(message: CylinderMessage): Promise<CylinderApplied> {
        const seat: number = this.seatOf(message.from);

        if (seat === -1 || (this.broken && message.type !== CylinderMessageType.DISCLOSE)) {
            return {};
        }

        switch (message.type) {
            case CylinderMessageType.KEY:
                return this.applyKey(message, message.payload, seat);
            case CylinderMessageType.LOAD:
                return this.applyLoad(message, message.payload, seat);
            case CylinderMessageType.SPIN:
                return this.applySpin(message, message.payload);
            case CylinderMessageType.SHARE:
                return this.applyShare(message, message.payload, seat);
            case CylinderMessageType.DISCLOSE:
                return this.applyDisclosure(message, message.payload);
        }
    }

    /** The context of a proof: the cylinder, the step, the seat and what else it binds */
    public context(step: string, seat: number, ...parts: ReadonlyArray<number>): string {
        return [this.id, step, seat, ...parts].join(':');
    }

    private async applyKey(message: CylinderMessage, payload: CylinderKeyMessage, seat: number): Promise<CylinderApplied> {
        if (this.phase !== CylinderPhase.KEYS || this.keys.has(message.from)) {
            return {};
        }

        const key: bigint | undefined = this.cipher.parseValue(payload.key);
        if (key === undefined || typeof payload.commitment !== 'string' || !COMMITMENT.test(payload.commitment)
            || !await verifyEqualLogs(this.cipher, this.context('key', seat), [this.cipher.generator], [key], payload.proof)) {
            return { cheat: { message, reason: CheatReason.INVALID_LOAD } };
        }

        this.keys.set(message.from, { message, key, commitment: payload.commitment });
        return {};
    }

    private async applyLoad(message: CylinderMessage, payload: CylinderLoadMessage, seat: number): Promise<CylinderApplied> {
        if (this.phase !== CylinderPhase.LOADING || this.loads.has(message.from)) {
            return {};
        }

        const chambers: ReadonlyArray<ElGamalCipherText> | undefined = this.parseChambers(payload.chambers);
        if (chambers === undefined || !Array.isArray(payload.proofs) || !await this.verifyLoad(seat, chambers, payload)) {
            return { cheat: { message, reason: CheatReason.INVALID_LOAD } };
        }

        const commitment: string = (this.keys.get(message.from) as PlayerKey).commitment;
        if (typeof payload.nonce !== 'string' || await CylinderState.commitment(this.id, seat, payload.nonce) !== commitment) {
            return { cheat: { message, reason: CheatReason.INVALID_REVEAL } };
        }

        this.loads.set(message.from, { message, chambers, nonce: payload.nonce });

        if (this.loads.size === 2) {
            const [one, two] = this.players.map((player: string) => this.loads.get(player) as CylinderStep & { readonly nonce: string });
            this.loaded = one.chambers.map((chamber: ElGamalCipherText, index: number) => this.cipher.multiply(chamber, two.chambers[index]));
            // The last digit of the hash of both random parts: neither player chose it, each committed to its part first
            this.first = Number.parseInt((await CryptoHelper.sha256(`${ one.nonce }:${ two.nonce }`)).slice(-1), 16) % 2;
        }

        return {};
    }

    /** Each chamber holds 0 or 1 bullet, and all of them the bullets of a player: their product hides that count */
    private async verifyLoad(seat: number, chambers: ReadonlyArray<ElGamalCipherText>, payload: CylinderLoadMessage): Promise<boolean> {
        const key: bigint = this.jointKey as bigint;

        for (const [index, chamber] of chambers.entries()) {
            // eslint-disable-next-line no-await-in-loop -- the proofs of a load are checked one after the other, the page staying fluid
            if (!await verifyBit(this.cipher, this.context('load', seat, index), key, chamber, payload.proofs[index])) {
                return false;
            }
        }

        const product: ElGamalCipherText = this.cipher.multiply(...chambers);
        const masked: bigint = product.c2 * this.cipher.power(this.cipher.group.order - BigInt(this.bullets)) % this.cipher.group.prime;
        return verifyEqualLogs(this.cipher, this.context('bullets', seat), [this.cipher.generator, key], [product.c1, masked], payload.bullets);
    }

    private applySpin(message: CylinderMessage, payload: CylinderSpinMessage): CylinderApplied {
        if (this.spinner !== message.from) {
            return {};
        }

        const chambers: ReadonlyArray<ElGamalCipherText> | undefined = this.parseChambers(payload.chambers);
        if (chambers === undefined) {
            // Not a cylinder: no chamber can be fired
            this.broken = true;
            this.malformedSpin = message;
            return { cheat: { message, reason: CheatReason.INVALID_SPIN } };
        }

        this.spins.push({ message, chambers });
        return {};
    }

    private async applyShare(message: CylinderMessage, payload: CylinderShareMessage, seat: number): Promise<CylinderApplied> {
        const shares = this.shares.get(payload.chamber);

        if (this.phase !== CylinderPhase.READY || !shares || shares.has(message.from)) {
            return {};
        }

        const chamber: ElGamalCipherText = this.cylinder[payload.chamber];
        const share: bigint | undefined = this.cipher.parseValue(payload.share);
        const key: bigint = (this.keys.get(message.from) as PlayerKey).key;
        if (share === undefined || !await verifyEqualLogs(this.cipher, this.context('share', seat, payload.chamber), [this.cipher.generator, chamber.c1], [key, share], payload.proof)) {
            return { cheat: { message, reason: CheatReason.INVALID_SHARE } };
        }

        shares.set(message.from, { message, share });
        if (shares.size < 2) {
            return {};
        }

        const bullets: number | undefined = this.cipher.decrypt(chamber, [...shares.values()].map(({ share: value }) => value), 2);
        if (bullets === undefined) {
            // A cylinder made otherwise than the protocol says: the check of the disclosures tells which spin
            this.broken = true;
            return {};
        }
        return { fired: { chamber: payload.chamber, bullets } };
    }

    private applyDisclosure(message: CylinderMessage, payload: CylinderDiscloseMessage): CylinderApplied {
        const key: PlayerKey | undefined = this.keys.get(message.from);

        if (!this.isDisclosureRequested || this.disclosures.has(message.from) || !key) {
            return {};
        }

        const secret: bigint | undefined = this.cipher.parseScalar(payload.secret);
        if (secret === undefined || this.cipher.power(secret) !== key.key) {
            return { cheat: { message, reason: CheatReason.INVALID_SHARE } };
        }

        this.disclosures.set(message.from, { message, secret });
        return {};
    }

    private parseChambers(chambers: unknown): ReadonlyArray<ElGamalCipherText> | undefined {
        if (!Array.isArray(chambers) || chambers.length !== this.chambers) {
            return undefined;
        }
        const parsed: Array<ElGamalCipherText | undefined> = chambers.map((chamber: unknown) => this.cipher.parseCipherText(chamber));
        return parsed.includes(undefined) ? undefined : parsed as ReadonlyArray<ElGamalCipherText>;
    }

    /** The commitment of a player to its random part of the draw */
    public static commitment(id: string, seat: number, nonce: string): Promise<string> {
        return CryptoHelper.sha256(`${ id }:${ seat }:${ nonce }`);
    }
}
