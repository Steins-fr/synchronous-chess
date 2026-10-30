import { Signal, signal } from '@angular/core';
import { CryptoHelper } from '@app/helpers/crypto.helper';
import { timeSlices } from '@app/helpers/time-slices.helper';
import { ElGamalCipherText, ExponentialElGamal } from '@app/modules/mental-poker/classes/exponential-elgamal';
import { KeptSecrets } from '@app/modules/mental-poker/classes/kept-secrets';
import { SecretStore } from '@app/modules/mental-poker/classes/secret-store';
import { StepRunner } from '@app/modules/mental-poker/classes/step-runner';
import { BitProof, proveBit, proveEqualLogs } from '@app/modules/mental-poker/classes/zk-proofs';
import { Room } from '@app/services/room-manager/classes/room/room';
import { CylinderMessage, CylinderMessageType, CylinderPayloads } from './cylinder-messages';
import { CylinderApplied, CylinderCheat, CylinderPhase, CylinderState } from './cylinder-state';
import { verifyCylinder } from './cylinder-verification';

export enum CylinderVerification {
    /** The players did not disclose their keys yet */
    PENDING = 'pending',
    CHECKING = 'checking',
    FAIR = 'fair',
    CHEATED = 'cheated',
}

/** What a player keeps secret of a cylinder until the game is over, in hexadecimal */
export interface CylinderSecrets {
    /** x, its share of the key */
    secret: string;
    /** Its random part of the draw of the first shooter */
    nonce: string;
    /** The chambers it loaded */
    bullets: ReadonlyArray<number>;
}

export interface CylinderOptions {
    /**
     * Unique to the cylinder, in the room and across the rooms of the same name: a random part of each player, given in
     * the chain, keeps a player from reusing the secrets of a former cylinder it disclosed
     */
    id: string;
    /** The player of each seat */
    players: readonly [string, string];
    chambers?: number;
    /** The bullets each player loads */
    bullets?: number;
    cipher?: ExponentialElGamal;
    store?: SecretStore<CylinderSecrets>;
}

/** The secrets of the local player, as numbers */
interface Secrets {
    readonly secret: bigint;
    readonly nonce: string;
    readonly bullets: ReadonlyArray<number>;
}

/**
 * The cylinder of a revolver no participant can see, loaded and spun without any dealer: each player loads its bullets
 * encrypted under the key of both players (the exponential ElGamal), each chamber then hiding the count of the bullets of
 * both; then each player turns it by an offset of its own, and re-randomizes its chambers, so no one follows them. A
 * chamber fired is decrypted with the share of each player, which tells its count of bullets only, not whose they are.
 *
 * The game applies the messages of the cylinder in the order of the chain, with its own, and asks for the chambers to
 * fire: the players give their shares by themselves. Once the game is over, the players disclose their keys, and every
 * participant checks the spins.
 */
export class Cylinder {
    public readonly id: string;
    private readonly state: CylinderState;
    private readonly store: SecretStore<CylinderSecrets>;
    /** The secrets of the local player, stored before its key was sent */
    private readonly secrets: KeptSecrets<CylinderSecrets, Secrets>;
    private readonly localName: string;
    private readonly cipher: ExponentialElGamal;

    private readonly _phase = signal<CylinderPhase>(CylinderPhase.KEYS);
    public readonly phase: Signal<CylinderPhase> = this._phase.asReadonly();
    private readonly _waitingFor = signal<ReadonlyArray<string>>([], {
        equal: (previous: ReadonlyArray<string>, next: ReadonlyArray<string>) => previous.join(' ') === next.join(' '),
    });
    /** The players the cylinder waits for: the next step of each one */
    public readonly waitingFor: Signal<ReadonlyArray<string>> = this._waitingFor.asReadonly();
    private readonly _loads = signal<number>(0);
    /** The players who loaded their bullets */
    public readonly loads: Signal<number> = this._loads.asReadonly();
    private readonly _first = signal<number | null>(null);
    /** The seat shooting first, once both players loaded their bullets */
    public readonly first: Signal<number | null> = this._first.asReadonly();
    private readonly _bullets = signal<ReadonlyArray<number>>([]);
    /** The chambers the local player loaded, as it placed them before the spins */
    public readonly bullets: Signal<ReadonlyArray<number>> = this._bullets.asReadonly();
    private readonly _verification = signal<CylinderVerification>(CylinderVerification.PENDING);
    public readonly verification: Signal<CylinderVerification> = this._verification.asReadonly();
    private readonly _cheaters = signal<ReadonlyArray<string>>([]);
    /** The players whose spin was made otherwise than the protocol says: a spin not a cylinder at once, the others once checked */
    public readonly cheaters: Signal<ReadonlyArray<string>> = this._cheaters.asReadonly();
    private readonly _progress = signal<number>(0);
    /** The steps of the players in the chain */
    public readonly progress: Signal<number> = this._progress.asReadonly();
    /** The page lost the secrets of the local player: it can not load nor fire the cylinder anymore */
    public readonly secretsLost: Signal<boolean>;

    /** The key of the local player in the chain was checked against its secrets */
    private ownKeyChecked: boolean = false;
    /** What the local player sent in this page: once in the chain, it is not sent again */
    private readonly sent = new Set<string>();
    /** The computations yield to the browser once a slice of time is spent */
    private readonly pause: () => Promise<void> = timeSlices();
    private readonly steps = new StepRunner(() => this.actOnce(), () => `The cylinder ${ this.id } failed`);

    public constructor(private readonly room: Room<CylinderPayloads>, options: Readonly<CylinderOptions>) {
        this.id = options.id;
        this.cipher = options.cipher ?? new ExponentialElGamal();
        this.localName = room.localPlayer.name;
        this.store = options.store ?? new SecretStore<CylinderSecrets>('cylinder', room.roomName, this.localName);
        this.secrets = new KeptSecrets<CylinderSecrets, Secrets>({
            store: this.store,
            id: this.id,
            parse: (stored: Readonly<CylinderSecrets>) => this.parseSecrets(stored),
            lostWarning: `The keys of the cylinder ${ this.id } are lost, its chambers can not be fired`,
            onLost: () => this._bullets.set([]),
        });
        this.secretsLost = this.secrets.lost;
        this.state = new CylinderState(options.id, options.players, this.cipher, options.chambers, options.bullets);
        this._bullets.set(this.store.get(this.id)?.bullets ?? []);
        this.changed();
    }

    public get players(): readonly [string, string] {
        return this.state.players;
    }

    private get seat(): number {
        return this.state.seatOf(this.localName);
    }

    /** Whether the local player gave its key, in the chain or sent from this page */
    public get keyGiven(): boolean {
        return this.state.keys.has(this.localName) || this.sent.has(CylinderMessageType.KEY);
    }

    /**
     * The local player loads its bullets in these chambers: it draws its secrets, stores them, then gives its key. The
     * bullets are encrypted once both keys are in the chain
     */
    public async load(chambers: ReadonlyArray<number>): Promise<void> {
        if (this.seat === -1 || this.keyGiven || this.state.phase !== CylinderPhase.KEYS) {
            return;
        }

        const secrets: Secrets = {
            secret: this.cipher.randomScalar(),
            nonce: CryptoHelper.randomHex(16),
            bullets: [...chambers].sort((one: number, other: number) => one - other),
        };
        this.secrets.keep({ secret: secrets.secret.toString(16), nonce: secrets.nonce, bullets: secrets.bullets }, secrets);
        this._bullets.set(secrets.bullets);
        this.sent.add(CylinderMessageType.KEY);

        const key: bigint = this.cipher.power(secrets.secret);
        this.room.transmitMessage(CylinderMessageType.KEY, {
            game: this.id,
            key: key.toString(16),
            proof: await proveEqualLogs(this.cipher, this.state.context('key', this.seat), [this.cipher.generator], [key], secrets.secret),
            commitment: await CylinderState.commitment(this.id, this.seat, secrets.nonce),
        });
    }

    /**
     * A message of the cylinder, from any participant, in the order of the chain: the cheats are reported
     * @returns the bullets of a chamber once both shares of it are in
     */
    public async apply(message: CylinderMessage): Promise<CylinderApplied> {
        const applied: CylinderApplied = await this.state.apply(message);

        if (applied.cheat) {
            this.report(applied.cheat);
        }
        // A spin that is not a cylinder names its player at once, the keys not needed
        if (this.state.malformedSpin === message) {
            this._cheaters.set([message.from]);
        }
        this.changed();
        return applied;
    }

    /** The game fires a chamber: both players give their shares of it */
    public requestShot(chamber: number): void {
        this.state.requestShot(chamber);
        this.changed();
    }

    /**
     * The game is over, or stopped: both players give their keys, and every participant checks the cylinder once they
     * are in the chain
     */
    public requestDisclosure(): void {
        this.state.requestDisclosure();
        this.changed();
    }

    public destroy(): void {
        this.steps.stop();
    }

    private report(cheat: CylinderCheat): void {
        this.room.reportCheat(cheat.message, cheat.reason);
    }

    /** Tells the state of the chain */
    private changed(): void {
        this._phase.set(this.state.phase);
        this._waitingFor.set(this.state.waitingFor);
        this._loads.set(this.state.loads.size);
        this._first.set(this.state.first);
        this._progress.set(this.state.progress);
    }

    /**
     * What the cylinder waits for from the local player, one thing at a time, again when the chain changed meanwhile: the
     * game calls it once the messages received are applied, so a reloaded page does not make the steps of its former page
     * again while the chain replays them
     */
    public act(): Promise<void> {
        return this.steps.run();
    }

    private async actOnce(): Promise<void> {
        if (this.steps.stopped) {
            return;
        }

        this.checkOwnKey();
        await this.loadBullets();
        await this.spin();
        await this.giveShares();
        this.giveDisclosure();
        await this.verify();
    }

    /** Encrypts the bullets of the local player once both keys are in, with the proofs of its load */
    private async loadBullets(): Promise<void> {
        const key: bigint | undefined = this.state.jointKey;

        if (this.state.phase !== CylinderPhase.LOADING || this.state.loads.has(this.localName) || this.sent.has(CylinderMessageType.LOAD)
            || !this.state.keys.has(this.localName)) {
            return;
        }

        const secrets: Secrets | undefined = this.secrets.load();
        if (!secrets || key === undefined) {
            return;
        }

        const chambers: ElGamalCipherText[] = [];
        const proofs: BitProof[] = [];
        let total: bigint = 0n;
        for (let index = 0; index < this.state.chambers; index++) {
            const bit: 0 | 1 = secrets.bullets.includes(index) ? 1 : 0;
            const randomness: bigint = this.cipher.randomScalar();
            const chamber: ElGamalCipherText = this.cipher.encrypt(bit, key, randomness);
            chambers.push(chamber);
            // eslint-disable-next-line no-await-in-loop -- one proof at a time, for the page to stay fluid
            proofs.push(await proveBit(this.cipher, this.state.context('load', this.seat, index), key, chamber, bit, randomness));
            total = (total + randomness) % this.cipher.group.order;
            // eslint-disable-next-line no-await-in-loop -- one chamber at a time, for the page to stay fluid
            await this.pause();
        }

        const product: ElGamalCipherText = this.cipher.multiply(...chambers);
        const masked: bigint = product.c2 * this.cipher.power(this.cipher.group.order - BigInt(this.state.bullets)) % this.cipher.group.prime;
        // A load of a former page reaching the chain meanwhile is the first one: this one is ignored by everyone
        this.sent.add(CylinderMessageType.LOAD);
        this.room.transmitMessage(CylinderMessageType.LOAD, {
            game: this.id,
            chambers: chambers.map((chamber: ElGamalCipherText) => ExponentialElGamal.toHex(chamber)),
            proofs,
            bullets: await proveEqualLogs(this.cipher, this.state.context('bullets', this.seat), [this.cipher.generator, key], [product.c1, masked], total),
            nonce: secrets.nonce,
        });
    }

    /** Turns the cylinder by an offset of its own, and re-randomizes its chambers, when it is the turn of the local player */
    private async spin(): Promise<void> {
        const key: bigint | undefined = this.state.jointKey;

        if (this.state.spinner !== this.localName || this.sent.has(CylinderMessageType.SPIN) || key === undefined) {
            return;
        }

        const input: ReadonlyArray<ElGamalCipherText> = this.state.cylinder;
        const offset: number = Number(CryptoHelper.randomBigInt(BigInt(input.length)));
        const chambers: ElGamalCipherText[] = [];
        for (let index = 0; index < input.length; index++) {
            chambers.push(this.cipher.reRandomize(input[(index + offset) % input.length], key, this.cipher.randomScalar()));
            // eslint-disable-next-line no-await-in-loop -- one chamber at a time, for the page to stay fluid
            await this.pause();
        }

        this.sent.add(CylinderMessageType.SPIN);
        this.room.transmitMessage(CylinderMessageType.SPIN, {
            game: this.id,
            chambers: chambers.map((chamber: ElGamalCipherText) => ExponentialElGamal.toHex(chamber)),
        });
    }

    /** The shares of the local player of the chambers fired */
    private async giveShares(): Promise<void> {
        if (this.seat === -1) {
            return;
        }

        for (const chamber of this.state.missingShares(this.localName)) {
            const sentKey: string = `${ CylinderMessageType.SHARE }:${ chamber }`;
            const secrets: Secrets | undefined = this.sent.has(sentKey) ? undefined : this.secrets.load();

            if (secrets) {
                const cipherText: ElGamalCipherText = this.state.cylinder[chamber];
                const share: bigint = this.cipher.share(cipherText, secrets.secret);
                const key: bigint = this.state.keys.get(this.localName)?.key as bigint;
                this.sent.add(sentKey);
                this.room.transmitMessage(CylinderMessageType.SHARE, {
                    game: this.id,
                    chamber,
                    share: share.toString(16),
                    // eslint-disable-next-line no-await-in-loop -- one share at a time
                    proof: await proveEqualLogs(this.cipher, this.state.context('share', this.seat, chamber), [this.cipher.generator, cipherText.c1], [key, share], secrets.secret),
                });
            }
        }
    }

    private giveDisclosure(): void {
        if (!this.state.isDisclosureRequested || this.state.disclosures.has(this.localName) || this.sent.has(CylinderMessageType.DISCLOSE)
            || !this.state.keys.has(this.localName)) {
            return;
        }

        const secrets: Secrets | undefined = this.secrets.load();
        if (secrets) {
            this.sent.add(CylinderMessageType.DISCLOSE);
            this.room.transmitMessage(CylinderMessageType.DISCLOSE, { game: this.id, secret: secrets.secret.toString(16) });
        }
    }

    /** Once both players disclosed their keys: the spins are checked */
    private async verify(): Promise<void> {
        if (!this.state.isDisclosed || this._verification() !== CylinderVerification.PENDING) {
            return;
        }

        this._verification.set(CylinderVerification.CHECKING);
        const cheats: ReadonlyArray<CylinderCheat> = await verifyCylinder(this.state, this.pause);
        cheats.forEach((cheat: CylinderCheat) => this.report(cheat));
        // A spin that was not a cylinder, reported once applied, cheated too
        const malformed: ReadonlyArray<CylinderMessage> = this.state.malformedSpin ? [this.state.malformedSpin] : [];
        const cheaters: ReadonlyArray<string> = [...malformed, ...cheats.map((cheat: CylinderCheat) => cheat.message)].map((message: CylinderMessage) => message.from);
        this._cheaters.set(cheaters);
        // Disclosed, the secrets are not secret anymore
        this.store.remove(this.id);
        this._verification.set(cheaters.length === 0 ? CylinderVerification.FAIR : CylinderVerification.CHEATED);
    }

    /** The secrets stored, as numbers, none for a storage that is not the one of this cylinder */
    private parseSecrets(stored: Readonly<CylinderSecrets>): Secrets | undefined {
        const secret: bigint | undefined = this.cipher.parseScalar(stored.secret);

        if (secret === undefined || typeof stored.nonce !== 'string' || !Array.isArray(stored.bullets)) {
            return undefined;
        }
        return { secret, nonce: stored.nonce, bullets: stored.bullets };
    }

    /**
     * The key of the local player in the chain is the one of its secrets: else its secrets are not the ones of the page
     * that gave it, which a page without storage drew again, and would give wrong shares. Checked once, before any step
     * made with them; not once disclosed: the check of the cylinder removed them from the storage
     */
    private checkOwnKey(): void {
        const key: bigint | undefined = this.state.keys.get(this.localName)?.key;

        if (key === undefined || this.ownKeyChecked || this.state.disclosures.has(this.localName)) {
            return;
        }

        this.ownKeyChecked = true;
        const secrets: Secrets | undefined = this.secrets.load();
        if (secrets && this.cipher.power(secrets.secret) !== key) {
            this.secrets.drop();
        }
    }
}
