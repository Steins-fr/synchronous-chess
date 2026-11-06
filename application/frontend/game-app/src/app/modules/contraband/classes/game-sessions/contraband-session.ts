import { computed, Signal } from '@angular/core';
import { Applied } from '@app/modules/commit-reveal/classes/applied';
import { GameRound } from '@app/modules/commit-reveal/classes/commit-reveal-messages';
import { CommitRevealSession } from '@app/modules/commit-reveal/classes/commit-reveal-session';
import { CommitmentPart, drawSalt, isCommitment } from '@app/modules/commit-reveal/classes/commitment';
import { SeatedPlayer } from '@app/modules/game-table/classes/table-seats';
import { PrivateConversation } from '@app/modules/private-conversations/classes/private-conversation';
import { TranslationScope } from '@app/services/language/enums/translation-scope.enum';
import { scopedKey } from '@app/services/language/scoped-key';
import { CheatReason } from '@app/services/room-manager/classes/room/block-room/anti-cheat/cheat-report';
import { Room } from '@app/services/room-manager/classes/room/room';
import { AppMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { marker } from '@jsverse/transloco-keys-manager/marker';
import { ContrabandEvent, ContrabandEventKind, ContrabandGameState, ContrabandPhase } from '../rules/contraband-game-state';
import { Call, CONTRABAND_RULES, ContrabandRules, ContrabandSetup, isCall, isSetup, isTrunk, Team, teamOf } from '../rules/contraband-rules';
import { Crossing, drawSchedule } from '../rules/schedule';
import {
    CBGameSessionType, CONTRABAND_TYPES, ContrabandCallMessage, ContrabandCommitMessage, ContrabandDrawMessage, ContrabandMessage, ContrabandPayloads,
    ContrabandRevealMessage, CrossingKey,
} from './contraband-messages';
import { PlayedContrabandGame } from './played-contraband-game';

export interface ContrabandSessionOptions {
    /** The rules of the game: the ones of the manga by default */
    readonly rules?: ContrabandRules;
}

/** A trunk the local player committed to, kept to reveal it */
interface Seal {
    /** The game of the trunk in the match */
    readonly crossing: number;
    /** The money of the trunk, in millions: 0 for an iron bar */
    readonly amount: number;
    readonly salt: string;
}

/** The keys of the titles of the conversations of a match, in the scope of the game */
const TEAM_TITLE: string = scopedKey(TranslationScope.CONTRABAND, marker('table.conversation.team', undefined, 'contraband'));
const CUSTOMS_TITLE: string = scopedKey(TranslationScope.CONTRABAND, marker('table.conversation.customs', undefined, 'contraband'));

/**
 * The Contraband in a room. The participants take the seats themselves, the seats 0 to 3 of the North, the others of the
 * South; a seated player starts the match once both countries hold as many players, one at least, with the variant, the
 * time of the customs and the games it picked: the seats are final until it is over. The players draw the seed of the
 * match at once, each one committing to a random part then revealing it: the seed draws the pairings of the games, alike
 * on every page. In each game, the smuggler commits to its trunk, the inspector of the other country calls, then the page
 * of the smuggler reveals the trunk by itself. No participant, the sequencer included, reads a trunk before the call.
 *
 * A phase closes as soon as its player acted, else once its time is over: a player claims it, the first claim in the
 * chain counting, and the player it waited for missed it. A claim coming before the time of the phase, on the time of
 * the chain, is void. The players of the match are the North ones first.
 */
export class ContrabandSession extends CommitRevealSession<
    typeof CONTRABAND_TYPES, ContrabandPayloads, ContrabandDrawMessage, ContrabandRules, ContrabandGameState, ContrabandSetup, PlayedContrabandGame, number, Seal
> {
    /** The setup of the match, once a player started it */
    public readonly setup: Signal<Readonly<ContrabandSetup> | null> = computed((): Readonly<ContrabandSetup> | null => this.played().setup());

    /** The players of the North, the first ones: of the match once started, else the ones seated on the seats of the North */
    public readonly north: Signal<number> = computed((): number => this.started()
        ? this.played().north()
        : this.tableSeats.seated().slice(0, this.rules.teamSeats).filter((player: Readonly<SeatedPlayer> | null) => player !== null).length);
    /** The country of the local player, none for a spectator */
    public readonly myTeam: Signal<Team | null> = computed((): Team | null => {
        const me: number | null = this.myIndex();
        return me === null ? null : teamOf(me, this.north());
    });
    /** The local player plays the match in progress: leaving it asks to confirm */
    public readonly inMatch: Signal<boolean> = computed((): boolean => this.myIndex() !== null && this.started() && !this.over());

    /** The players away who give the phase more time, once: every one, but the players absent since the phase they missed */
    public readonly extendingAway: Signal<ReadonlyArray<string>> = computed((): ReadonlyArray<string> => {
        const absent: ReadonlySet<string> = new Set((this.game()?.absent() ?? []).map((player: number) => this.players()[player]));
        return this.awaitedAway().filter((name: string) => !absent.has(name));
    });
    /** The smuggler of the game, once the seed is drawn */
    public readonly smuggler: Signal<string | null> = computed((): string | null => {
        const game: ContrabandGameState | null = this.game();
        return game === null ? null : this.players()[game.smuggler()];
    });
    /** The inspector of the game, once the seed is drawn */
    public readonly inspector: Signal<string | null> = computed((): string | null => {
        const game: ContrabandGameState | null = this.game();
        return game === null ? null : this.players()[game.inspector()];
    });

    /** Whether the local player may pack its trunk: the smuggler of the game, not committed yet */
    public readonly canPack: Signal<boolean> = computed((): boolean => {
        const game: ContrabandGameState | null = this.game();
        return !this._sending() && game?.phase() === ContrabandPhase.PACKING && game.smuggler() === this.myIndex();
    });
    /** Whether the local player may call: the inspector of the game, the customs open */
    public readonly canCall: Signal<boolean> = computed((): boolean => {
        const game: ContrabandGameState | null = this.game();
        return !this._sending() && game?.phase() === ContrabandPhase.CUSTOMS && game.inspector() === this.myIndex();
    });
    /** The money left in the ATM of the local player, none for a spectator or before the seed is drawn */
    public readonly myAtm: Signal<number | null> = computed((): number | null => {
        const me: number | null = this.myIndex();
        return me === null ? null : this.game()?.atms()[me] ?? null;
    });

    /**
     * The money of the trunk of the local player, the smuggler of the game, sealed: once packed, until the game is
     * settled. Only its page knows it until its reveal
     */
    public readonly myTrunk: Signal<number | null> = computed((): number | null => {
        const game: ContrabandGameState | null = this.game();

        if (game === null || game.phase() === ContrabandPhase.OVER || game.smuggler() !== this.myIndex()) {
            return null;
        }
        return this._seals().get(game.crossing())?.amount ?? null;
    });

    /**
     * The private conversations of the match, the same on every page: one for each country of 2 players or more, open
     * until the match is over, and one for the customs of each game packed, between its smuggler and its inspector, open
     * while the inspector calls. A spectator is a member of none
     */
    public readonly conversations: Signal<ReadonlyArray<Readonly<PrivateConversation>>> = computed((): ReadonlyArray<Readonly<PrivateConversation>> => {
        const played: PlayedContrabandGame = this.played();
        const game: ContrabandGameState | null = this.game();
        const players: ReadonlyArray<string> = played.players();
        const prefix: string = `cb-${ played.index }-${ played.attempt }`;
        const countries: ReadonlyArray<Readonly<PrivateConversation>> = [Team.NORTH, Team.SOUTH]
            .map((team: Team): Readonly<PrivateConversation> => ({
                id: `${ prefix }-${ team }`,
                members: players.filter((_, player: number) => teamOf(player, played.north()) === team),
                title: { key: TEAM_TITLE, params: { team } },
                open: !this.over(),
            }))
            .filter((conversation: Readonly<PrivateConversation>) => conversation.members.length >= 2);
        if (game === null) {
            return countries;
        }

        const customs: ReadonlyArray<Readonly<PrivateConversation>> = game.events()
            .filter((event: Readonly<ContrabandEvent>) => event.kind === ContrabandEventKind.PACKED)
            .map(({ crossing, smuggler, inspector }: Readonly<ContrabandEvent>): Readonly<PrivateConversation> => ({
                id: `${ prefix }-customs-${ crossing }`,
                members: [players[smuggler], players[inspector]],
                title: { key: CUSTOMS_TITLE, params: { number: crossing + 1, smuggler: players[smuggler], inspector: players[inspector] } },
                open: game.phase() === ContrabandPhase.CUSTOMS && game.crossing() === crossing,
            }));
        return [...countries, ...customs];
    });

    public constructor(room: Room<ContrabandPayloads>, options: ContrabandSessionOptions = {}) {
        super(room, {
            rules: options.rules ?? CONTRABAND_RULES,
            types: CONTRABAND_TYPES,
            messages: Object.values(CBGameSessionType),
            sealKind: 'trunks',
            played: (index: number, attempt: number): PlayedContrabandGame => new PlayedContrabandGame(index, attempt),
        });
    }

    /** The local player starts the match with the seated players and its setup: then each one commits to its part of the draw */
    public start(setup: Readonly<ContrabandSetup>): void {
        if (this.canStart() && isSetup(this.rules, setup)) {
            this._sending.set(true);
            this.room.transmitMessage(CBGameSessionType.DRAW, {
                ...this.round(), players: this.players(), north: this.north(), variant: setup.variant, customsTime: setup.customsTime, games: setup.games,
            });
        }
    }

    /** The smuggler packs its trunk: sealed until the inspector called */
    public async pack(amount: number): Promise<void> {
        const game: ContrabandGameState | null = this.game();
        if (game === null || !this.canPack() || !isTrunk(this.rules, game.variant, this.myAtm() as number, amount)) {
            return;
        }

        // The game of the trunk, fixed before the hash: a timeout applied meanwhile moves to the next game
        const crossing: number = game.crossing();
        const trunk: Omit<ContrabandCommitMessage, 'commitment'> = { ...this.round(), crossing };
        const salt: string = drawSalt();
        await this.seal(crossing, { crossing, amount, salt }, this.preimage(crossing, amount, salt, this.myIndex() as number),
            (commitment: string) => this.room.transmitMessage(CBGameSessionType.COMMIT, { ...trunk, commitment }));
    }

    /** The inspector calls: a pass, a doubt or a check, as the variant offers */
    public call(call: Call): void {
        const game: ContrabandGameState | null = this.game();

        if (game !== null && this.canCall() && isCall(this.rules, game.variant, call)) {
            this._sending.set(true);
            this.room.transmitMessage(CBGameSessionType.CALL, { ...this.round(), crossing: game.crossing(), call });
        }
    }

    protected override async apply(message: ContrabandMessage): Promise<void> {
        switch (message.type) {
            case CBGameSessionType.SEAT:
                this.tableSeats.onSeat(message);
                break;
            case CBGameSessionType.UNSEAT:
                this.tableSeats.onUnseat(message);
                break;
            case CBGameSessionType.DRAW:
                await this.onDraw(message);
                break;
            case CBGameSessionType.COMMIT:
                this.onCommit(message);
                break;
            case CBGameSessionType.CALL:
                this.onCall(message);
                break;
            case CBGameSessionType.REVEAL:
                await this.onReveal(message);
                break;
            case CBGameSessionType.TIMEOUT:
                this.onTimeout(message);
                break;
            case CBGameSessionType.REMATCH:
                this.onRematch(message.from, message.payload.game);
                break;
        }
    }

    /** Both countries hold as many players, enough */
    protected override enough(): boolean {
        return this.north() >= this.rules.minTeam && this.players().length === 2 * this.north();
    }

    protected override setupOf({ variant, customsTime, games }: Readonly<ContrabandDrawMessage>): Readonly<ContrabandSetup> | undefined {
        const setup: { variant: unknown; customsTime: unknown; games: unknown } = { variant, customsTime, games };
        return isSetup(this.rules, setup) ? { variant: setup.variant, customsTime: setup.customsTime, games: setup.games } : undefined;
    }

    /** The match starts with the countries the start names, the ones seated: a start of other countries is void */
    protected override openPlayed(seated: ReadonlyArray<Readonly<SeatedPlayer>>, setup: Readonly<ContrabandSetup>, { north }: Readonly<ContrabandDrawMessage>): void {
        if (north === this.north()) {
            this.played().openMatch(seated, this.north(), setup);
        }
    }

    /** The match: its seed draws the pairings of its games */
    protected override async drawGame(seed: string): Promise<ContrabandGameState> {
        const setup: Readonly<ContrabandSetup> = this.setup() as ContrabandSetup;
        const schedule: ReadonlyArray<Readonly<Crossing>> = await drawSchedule(seed, this.played().north(), setup.games);
        return new ContrabandGameState(this.rules, this.played().north(), setup, schedule);
    }

    /** The game of the trunk, while it is revealed */
    protected override revealKey(game: ContrabandGameState): number | null {
        return game.phase() === ContrabandPhase.REVEALING ? game.crossing() : null;
    }

    protected override transmitReveal(game: ContrabandGameState, seal: Readonly<Seal>): void {
        this.room.transmitMessage(CBGameSessionType.REVEAL, { ...this.round(), crossing: game.crossing(), amount: seal.amount, salt: seal.salt });
    }

    /** The commitment to a trunk: the match, the player, the game and the money, with a salt */
    private preimage(crossing: number, amount: number | string, salt: string, player: number): ReadonlyArray<CommitmentPart> {
        return [this.played().id(), 'trunk', player, crossing, amount, salt];
    }

    /** Whether a message names the game in progress of the match in progress */
    private isCrossing(game: ContrabandGameState, payload: GameRound & CrossingKey): boolean {
        return this.isRound(payload) && payload.crossing === game.crossing();
    }

    /** The smuggler commits to its trunk: the first commitment counts, the customs open */
    private onCommit(message: AppMessage<CBGameSessionType.COMMIT, ContrabandCommitMessage>): void {
        this.committed(this.applyCommit(message), message.payload.crossing, message.from, message.payload.commitment);
    }

    /** Applies the commitment to the match, which ignores one out of the packing or a second one, and refuses one of another player */
    private applyCommit(message: AppMessage<CBGameSessionType.COMMIT, ContrabandCommitMessage>): Applied {
        const game: ContrabandGameState | null = this.game();
        const player: number | null = this.indexOf(message.from);

        if (game === null || player === null || !this.isCrossing(game, message.payload)) {
            return Applied.IGNORED;
        }
        if (!isCommitment(message.payload.commitment)) {
            this.room.reportCheat(message, CheatReason.INVALID_MESSAGE);
            return Applied.ILLEGAL;
        }

        const applied: Applied = game.pack(player);
        if (applied === Applied.ILLEGAL) {
            this.room.reportCheat(message, CheatReason.ILLEGAL_MOVE);
        }
        return applied;
    }

    /** The inspector calls: a call the variant does not offer is reported, the inspector still awaited */
    private onCall(message: AppMessage<CBGameSessionType.CALL, ContrabandCallMessage>): void {
        const game: ContrabandGameState | null = this.game();
        const player: number | null = this.indexOf(message.from);

        if (game?.phase() !== ContrabandPhase.CUSTOMS || player === null || !this.isCrossing(game, message.payload)) {
            return;
        }
        if (!isCall(this.rules, game.variant, message.payload.call)) {
            this.room.reportCheat(message, CheatReason.INVALID_MESSAGE);
            return;
        }
        if (game.call(player, message.payload.call) === Applied.ILLEGAL) {
            this.room.reportCheat(message, CheatReason.ILLEGAL_MOVE);
        }
    }

    /**
     * The smuggler reveals its trunk: one not matching its commitment is reported, and seized as withheld; one the rules
     * do not allow is reported, and seized as withheld too
     */
    private async onReveal(message: AppMessage<CBGameSessionType.REVEAL, ContrabandRevealMessage>): Promise<void> {
        const game: ContrabandGameState | null = this.game();
        const player: number | null = this.indexOf(message.from);
        const { crossing, amount, salt } = message.payload;

        if (game?.phase() !== ContrabandPhase.REVEALING || player === null || !this.isCrossing(game, message.payload) || !game.awaited().includes(player)) {
            return;
        }

        const matching: boolean = await this.opened(message, game, player, crossing, salt,
            (revealed: string) => this.preimage(crossing, typeof amount === 'number' ? amount : '', revealed, player));
        if (matching && game.reveal(player, amount) === Applied.ILLEGAL) {
            this.room.reportCheat(message, CheatReason.ILLEGAL_MOVE);
        }
    }
}
