import { computed, Signal, signal } from '@angular/core';
import { PlayingCard } from '@app/modules/playing-cards/types/playing-card';
import { BetAction, BetLimits, BettingRound, RoundEnd } from './betting-round';
import { compareHands, evaluateHand, HAND_SIZE, HandValue } from './hand-evaluator';
import { otherSeat, PokerSeat, SeatPair, withSeat } from './poker-seat';
import { SEVENTEEN_DECK } from './seventeen-deck';

export interface PokerMatchRules {
    /** The hands of the match */
    readonly hands: number;
    /** The chips of each player at the start */
    readonly stack: number;
    readonly ante: number;
    /** The most a player bets in the second round, in antes */
    readonly secondRoundAntes: number;
}

/** The rules of the manga: 10 hands, 150 chips each, an ante of 5 chips, at most 6 antes in the second round */
export const SEVENTEEN_POKER_RULES: PokerMatchRules = { hands: 10, stack: 150, ante: 5, secondRoundAntes: 6 };

/** The cards left once both hands are dealt, the cards the players draw from in the exchange */
export const DRAW_PILE: number = SEVENTEEN_DECK.length - 2 * HAND_SIZE;

export enum HandPhase {
    FIRST_ROUND = 'firstRound',
    /** Each player discards cards and draws as many, the player speaking first first */
    EXCHANGE = 'exchange',
    SECOND_ROUND = 'secondRound',
    /** The hands to show, to settle the pot */
    SHOWDOWN = 'showdown',
    OVER = 'over',
}

export enum HandEnd {
    /** Both players checked in the first round, though they could bet: the antes go to the bank */
    NO_CONTEST = 'noContest',
    /** A player folded: the other takes the pot */
    FOLD = 'fold',
    /** The best hand takes the pot, equal hands split it */
    SHOWDOWN = 'showdown',
}

export interface HandOutcome {
    readonly end: HandEnd;
    /** The player taking the pot: none on a no contest or a split pot */
    readonly winner: PokerSeat | null;
    readonly pot: number;
    /** The chips each player gets from the pot */
    readonly gains: SeatPair<number>;
    /** The hands shown at the showdown */
    readonly hands: SeatPair<HandValue> | null;
}

export interface PokerHand {
    /** The index of the hand in the match, from 0 */
    readonly index: number;
    /** The player speaking first in each round, and exchanging first */
    readonly first: PokerSeat;
    readonly phase: HandPhase;
    /** The antes and the bets of the hand */
    readonly pot: number;
    /** The most chips a player bets in the hand: the stack of the poorer one once the antes are paid */
    readonly cap: number;
    /** The betting round in progress, else the latest */
    readonly round: BettingRound;
    /** The chips each player put in the first round */
    readonly firstRoundBet: number;
    /** The cards each player discarded, null until it exchanged */
    readonly exchanges: SeatPair<number | null>;
    readonly outcome: HandOutcome | null;
}

export interface MatchResult {
    /** The player with the most chips, none when they have as many */
    readonly winner: PokerSeat | null;
    readonly stacks: SeatPair<number>;
}

/**
 * The Seventeen Poker between two players, without the cards: the session deals them, and shows them to the match at
 * the showdown. Each action returns whether it was legal: an illegal one changes nothing.
 */
export class PokerMatch {
    private readonly _stacks = signal<SeatPair<number>>([this.rules.stack, this.rules.stack]);
    public readonly stacks = this._stacks.asReadonly();
    private readonly _hand = signal<PokerHand | null>(null);
    /** The hand in progress, else the latest */
    public readonly hand = this._hand.asReadonly();
    private readonly _outcomes = signal<ReadonlyArray<Readonly<HandOutcome>>>([]);
    /** The outcome of each hand played */
    public readonly outcomes = this._outcomes.asReadonly();

    public readonly result: Signal<MatchResult | null> = computed((): MatchResult | null => {
        const hand: PokerHand | null = this._hand();
        const stacks: SeatPair<number> = this._stacks();

        // A hand in progress, or another one to play: a player who can not pay the ante plays none
        if ((hand !== null && hand.phase !== HandPhase.OVER) || (this._outcomes().length < this.rules.hands && Math.min(...stacks) >= this.rules.ante)) {
            return null;
        }

        return { winner: PokerMatch.leader(stacks), stacks };
    });

    /** The player to exchange, null out of the exchange */
    public readonly exchanging: Signal<PokerSeat | null> = computed((): PokerSeat | null => {
        const hand: PokerHand | null = this._hand();

        if (hand?.phase !== HandPhase.EXCHANGE) {
            return null;
        }

        return hand.exchanges[hand.first] === null ? hand.first : otherSeat(hand.first);
    });

    /** The cards left to draw from in the exchange */
    public readonly drawPile: Signal<number> = computed((): number => {
        const exchanges: SeatPair<number | null> | undefined = this._hand()?.exchanges;

        return DRAW_PILE - (exchanges ?? []).reduce((drawn: number, count: number | null) => drawn + (count ?? 0), 0);
    });

    public constructor(public readonly rules: PokerMatchRules = SEVENTEEN_POKER_RULES) {
    }

    private static leader(stacks: SeatPair<number>): PokerSeat | null {
        if (stacks[0] === stacks[1]) {
            return null;
        }

        return stacks[0] > stacks[1] ? PokerSeat.ONE : PokerSeat.TWO;
    }

    /** Starts the next hand, both players paying the ante */
    public startHand(): boolean {
        const previous: PokerHand | null = this._hand();

        if ((previous !== null && previous.phase !== HandPhase.OVER) || this.result() !== null) {
            return false;
        }

        const index: number = previous === null ? 0 : previous.index + 1;
        const first: PokerSeat = index % 2 === 0 ? PokerSeat.ONE : PokerSeat.TWO;
        const stacks: SeatPair<number> = [this._stacks()[0] - this.rules.ante, this._stacks()[1] - this.rules.ante];
        const cap: number = Math.min(...stacks);

        this._stacks.set(stacks);
        this._hand.set({
            index,
            first,
            phase: HandPhase.FIRST_ROUND,
            pot: 2 * this.rules.ante,
            cap,
            round: BettingRound.open(first, { min: 1, max: cap }),
            firstRoundBet: 0,
            exchanges: [null, null],
            outcome: null,
        });

        return true;
    }

    /** An action of a player in the betting round in progress */
    public bet(seat: PokerSeat, action: BetAction, amount?: number): boolean {
        const hand: PokerHand | null = this._hand();

        if (hand?.phase !== HandPhase.FIRST_ROUND && hand?.phase !== HandPhase.SECOND_ROUND) {
            return false;
        }

        const round: BettingRound | null = hand.round.act(seat, action, amount);

        if (round === null) {
            return false;
        }

        const added: number = round.bets[seat] - hand.round.bets[seat];
        this._stacks.update((stacks: SeatPair<number>) => withSeat(stacks, seat, stacks[seat] - added));
        this.endRound({ ...hand, pot: hand.pot + added, round });

        return true;
    }

    /** A player discards cards, and draws as many from the draw pile */
    public exchange(seat: PokerSeat, count: number): boolean {
        const hand: PokerHand | null = this._hand();

        if (hand === null || seat !== this.exchanging() || !Number.isInteger(count) || count < 0 || count > Math.min(HAND_SIZE, this.drawPile())) {
            return false;
        }

        const exchanges: SeatPair<number | null> = withSeat(hand.exchanges, seat, count);
        const exchanged: boolean = exchanges.every((exchange: number | null) => exchange !== null);

        this._hand.set({
            ...hand,
            exchanges,
            ...exchanged ? { phase: HandPhase.SECOND_ROUND, round: BettingRound.open(hand.first, this.secondRoundLimits(hand)) } : {},
        });

        return true;
    }

    /** Settles the pot with the cards of each player */
    public showdown(cards: SeatPair<ReadonlyArray<PlayingCard>>): boolean {
        const hand: PokerHand | null = this._hand();

        if (hand?.phase !== HandPhase.SHOWDOWN) {
            return false;
        }

        const hands: SeatPair<HandValue> = [evaluateHand(cards[0]), evaluateHand(cards[1])];
        const comparison: number = compareHands(hands[0], hands[1]);

        if (comparison === 0) {
            this.settle(hand, { end: HandEnd.SHOWDOWN, winner: null, pot: hand.pot, gains: [hand.pot / 2, hand.pot / 2], hands });
        } else {
            const winner: PokerSeat = comparison > 0 ? PokerSeat.ONE : PokerSeat.TWO;
            this.settle(hand, { end: HandEnd.SHOWDOWN, winner, pot: hand.pot, gains: withSeat([0, 0], winner, hand.pot), hands });
        }

        return true;
    }

    /**
     * The second round bets at least what the first one did, at most the most of the rules, or the first bet when it is
     * above it, all within the cap of the hand
     */
    private secondRoundLimits(hand: PokerHand): BetLimits {
        const max: number = Math.min(Math.max(this.rules.secondRoundAntes * this.rules.ante, hand.firstRoundBet), hand.cap - hand.firstRoundBet);

        return { min: Math.max(1, Math.min(hand.firstRoundBet, max)), max };
    }

    private endRound(hand: PokerHand): void {
        const { round } = hand;

        if (round.end === null) {
            this._hand.set(hand);
        } else if (round.folder !== null) {
            const winner: PokerSeat = otherSeat(round.folder);
            this.settle(hand, { end: HandEnd.FOLD, winner, pot: hand.pot, gains: withSeat([0, 0], winner, hand.pot), hands: null });
        } else if (hand.phase === HandPhase.SECOND_ROUND) {
            this._hand.set({ ...hand, phase: HandPhase.SHOWDOWN });
        } else if (round.end === RoundEnd.CHECKED && hand.cap > 0) {
            // A player who paid the ante with its last chips plays the hand to the showdown, without a bet
            this.settle(hand, { end: HandEnd.NO_CONTEST, winner: null, pot: hand.pot, gains: [0, 0], hands: null });
        } else {
            this._hand.set({ ...hand, phase: HandPhase.EXCHANGE, firstRoundBet: round.bets[hand.first] });
        }
    }

    private settle(hand: PokerHand, outcome: HandOutcome): void {
        this._stacks.update((stacks: SeatPair<number>) => [stacks[0] + outcome.gains[0], stacks[1] + outcome.gains[1]]);
        this._outcomes.update((outcomes: ReadonlyArray<Readonly<HandOutcome>>) => [...outcomes, outcome]);
        this._hand.set({ ...hand, phase: HandPhase.OVER, outcome });
    }
}
