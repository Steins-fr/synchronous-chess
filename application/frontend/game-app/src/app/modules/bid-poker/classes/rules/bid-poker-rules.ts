import { FULL_DECK, SuitedCard } from '@app/modules/playing-cards/types/playing-card';

export interface BidPokerRules {
    /** The seats of the table */
    readonly seats: number;
    /** The players a game needs */
    readonly minPlayers: number;
    /** The cards, a card of the game known by its index here */
    readonly deck: ReadonlyArray<Readonly<SuitedCard>>;
    /** The sizes of the lots of the dealing session, drawn among these: their sum is the deck */
    readonly lotSizes: ReadonlyArray<number>;
    /** The coins of each player at the start */
    readonly coins: number;
    /** The coins each player owes at the end */
    readonly debt: number;
    readonly changeSessions: number;
    /** What each pig pays */
    readonly pigFine: number;
    /** The prizes of the 1st, the 2nd and the 3rd, multiplied by the number of pigs */
    readonly prizes: ReadonlyArray<number>;
    /**
     * The seconds of each phase, a phase closing as soon as every player acted: to commit and reveal the random parts of
     * the draw, to read the catalogue before the first lot, to bid on a lot, to reveal the bids, to discard. They exceed
     * the 10 seconds of the watch of the censorship: a sequencer holding the bids of the others is caught before the end
     */
    readonly drawTime: number;
    readonly catalogueTime: number;
    readonly bidTime: number;
    readonly revealTime: number;
    readonly discardTime: number;
    /** The seconds more a phase waits for a player away, once */
    readonly awayTime: number;
}

/** The Bid Poker of Liar Game: 300 coins each, 100 owed, the 52 cards in lots of 5 or 6, 5 change sessions */
export const BID_POKER_RULES: BidPokerRules = {
    seats: 8,
    minPlayers: 4,
    deck: FULL_DECK,
    lotSizes: [5, 6],
    coins: 300,
    debt: 100,
    changeSessions: 5,
    pigFine: 150,
    prizes: [100, 40, 10],
    drawTime: 20,
    catalogueTime: 60,
    bidTime: 30,
    revealTime: 15,
    discardTime: 45,
    awayTime: 15,
};
