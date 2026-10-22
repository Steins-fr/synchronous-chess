import { otherSeat, PokerSeat, SeatPair, withSeat } from './poker-seat';

export enum BetAction {
    CHECK = 'check',
    BET = 'bet',
    RAISE = 'raise',
    CALL = 'call',
    FOLD = 'fold',
}

export enum RoundEnd {
    /** Both players checked */
    CHECKED = 'checked',
    /** A player called the bet of the other */
    CALLED = 'called',
    /** A player folded */
    FOLDED = 'folded',
}

/** The bounds of the chips a player bets in a round, in whole chips */
export interface BetLimits {
    /** The least bet, and the least a raise adds to the bet it raises */
    readonly min: number;
    /** The most chips a player puts in the round, its raises included */
    readonly max: number;
}

/**
 * A betting round, as a value: each action gives the next round. The amount of a bet or a raise is the total the player
 * has put in the round after it.
 */
export class BettingRound {
    private constructor(
        public readonly limits: BetLimits,
        /** The player speaking first */
        public readonly first: PokerSeat,
        /** The chips each player has put in the round */
        public readonly bets: SeatPair<number>,
        /** The player to speak, null once the round is over */
        public readonly toAct: PokerSeat | null,
        public readonly end: RoundEnd | null,
        /** The player who folded, if any */
        public readonly folder: PokerSeat | null = null,
    ) {
    }

    public static open(first: PokerSeat, limits: BetLimits): BettingRound {
        return new BettingRound(limits, first, [0, 0], first, null);
    }

    /** The bet to match */
    public get highest(): number {
        return Math.max(...this.bets);
    }

    /** The bounds of the amount of a bet, or of a raise, of the player to speak: null when it can neither bet nor raise */
    public betRange(): BetLimits | null {
        const highest: number = this.highest;
        const min: number = highest === 0 ? this.limits.min : Math.min(highest + this.limits.min, this.limits.max);

        return this.toAct === null || min > this.limits.max || highest >= this.limits.max ? null : { min, max: this.limits.max };
    }

    /** The actions the player to speak can take */
    public legalActions(): ReadonlyArray<BetAction> {
        if (this.toAct === null) {
            return [];
        }

        const toCall: boolean = this.highest > this.bets[this.toAct];
        const canBet: boolean = this.betRange() !== null;

        return [
            ...toCall ? [BetAction.CALL] : [BetAction.CHECK],
            ...canBet ? [toCall ? BetAction.RAISE : BetAction.BET] : [],
            BetAction.FOLD,
        ];
    }

    /** The round after the action of a player, null when the action is not legal */
    public act(seat: PokerSeat, action: BetAction, amount?: number): BettingRound | null {
        if (seat !== this.toAct || !this.legalActions().includes(action)) {
            return null;
        }

        switch (action) {
            case BetAction.CHECK:
                // Only checks came before: the second check closes the round
                return seat === this.first
                    ? new BettingRound(this.limits, this.first, this.bets, otherSeat(seat), null)
                    : new BettingRound(this.limits, this.first, this.bets, null, RoundEnd.CHECKED);
            case BetAction.CALL:
                return new BettingRound(this.limits, this.first, withSeat(this.bets, seat, this.highest), null, RoundEnd.CALLED);
            case BetAction.FOLD:
                return new BettingRound(this.limits, this.first, this.bets, null, RoundEnd.FOLDED, seat);
            case BetAction.BET:
            case BetAction.RAISE:
                return this.bet(seat, amount);
        }
    }

    private bet(seat: PokerSeat, amount: number | undefined): BettingRound | null {
        const range: BetLimits = this.betRange() as BetLimits;

        if (amount === undefined || !Number.isInteger(amount) || amount < range.min || amount > range.max) {
            return null;
        }

        return new BettingRound(this.limits, this.first, withSeat(this.bets, seat, amount), otherSeat(seat), null);
    }
}
