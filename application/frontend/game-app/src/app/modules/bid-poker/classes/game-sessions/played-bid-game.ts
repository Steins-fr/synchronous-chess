import { computed, Signal, signal } from '@angular/core';
import { DrawPhase, FairDraw } from '@app/modules/commit-reveal/classes/fair-draw';
import { SeatedPlayer } from '@app/modules/game-table/classes/table-seats';
import { BidPokerGame } from '../rules/bid-poker-game';
import { BidPokerResult } from '../rules/standings';

/**
 * A game of the room, from its start: its players, the draw of its deck, then the game itself. Its id holds the salt of
 * each player, drawn when it took its seat, the index of the game in the room and its attempt: no commitment of a game
 * in another room of the same name, nor of a former game of the room, is a commitment of this one.
 */
export class PlayedBidGame {
    private readonly _players = signal<ReadonlyArray<Readonly<SeatedPlayer>>>([]);
    /** The players of the game, in the order of their seats: none until it starts */
    public readonly players: Signal<ReadonlyArray<string>> = computed((): ReadonlyArray<string> =>
        this._players().map((player: Readonly<SeatedPlayer>) => player.name));
    public readonly id: Signal<string> = computed((): string =>
        [...this._players().map((player: Readonly<SeatedPlayer>) => player.salt), this.index, this.attempt].join(':'));
    private readonly _draw = signal<FairDraw | null>(null);
    // A draw is not reactive: it changes with each of its messages applied
    private readonly drawVersion = signal<number>(0);
    /** The phase of the draw of the deck, none before the game starts */
    public readonly drawPhase: Signal<DrawPhase | null> = computed((): DrawPhase | null => {
        this.drawVersion();
        return this._draw()?.phase ?? null;
    });
    /** The players the draw waits for */
    public readonly drawWaitingFor: Signal<ReadonlyArray<string>> = computed((): ReadonlyArray<string> => {
        this.drawVersion();
        return this._draw()?.waitingFor ?? [];
    });
    private readonly _game = signal<BidPokerGame | null>(null);
    /** The game, once its deck is drawn */
    public readonly game: Signal<BidPokerGame | null> = this._game.asReadonly();
    public readonly result: Signal<BidPokerResult | null> = computed((): BidPokerResult | null => this._game()?.result() ?? null);

    /**
     * @param index the index of the game in the room
     * @param attempt the draws of the game: one timing out starts the game again
     */
    public constructor(public readonly index: number, public readonly attempt: number) {}

    public get draw(): FairDraw | null {
        return this._draw();
    }

    /** The context of the draw of the deck */
    public get drawContext(): string {
        return `${ this.id() }:draw`;
    }

    /** The game starts: its players are final, they draw its deck */
    public open(players: ReadonlyArray<Readonly<SeatedPlayer>>): void {
        this._players.set(players);
        this._draw.set(new FairDraw(this.drawContext, this.players()));
    }

    /** A message of the draw applied */
    public drew(): void {
        this.drawVersion.update((version: number) => version + 1);
    }

    public start(game: BidPokerGame): void {
        this._game.set(game);
    }
}
