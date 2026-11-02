import { BID_POKER_RULES, BidPokerRules } from './bid-poker-rules';
import { Applied, BidEventKind, BidPokerGame, BidPokerPhase, MissedReason } from './bid-poker-game';
import { describe, expect, test } from 'vitest';

/** One change session: the specs play a game to its end quickly */
const RULES: BidPokerRules = { ...BID_POKER_RULES, changeSessions: 1 };
/** Three lots of the first 15 cards of the deck */
const CATALOGUE: ReadonlyArray<ReadonlyArray<number>> = [[0, 1, 2, 3, 4], [5, 6, 7, 8, 9], [10, 11, 12, 13, 14]];

function game(players: number = 4, catalogue: ReadonlyArray<ReadonlyArray<number>> = CATALOGUE, rules: BidPokerRules = RULES): BidPokerGame {
    return new BidPokerGame(rules, players, catalogue);
}

/** Each player bids its amount on the lot, undefined for no commitment: they commit in their order, then reveal */
function auction(bidPoker: BidPokerGame, amounts: ReadonlyArray<number | undefined>): void {
    amounts.forEach((amount: number | undefined, player: number) => amount === undefined || bidPoker.commitBid(player));
    amounts.forEach((amount: number | undefined, player: number) => amount === undefined || bidPoker.revealBid(player, amount));
}

/** The dealing session: player i buys lot i for 10 coins, the others bidding nothing */
function dealt(players: number = 4): BidPokerGame {
    const bidPoker: BidPokerGame = game(players);
    CATALOGUE.forEach((_, lot: number) => auction(bidPoker, Array.from({ length: players }, (__, player: number) => player === lot ? 10 : 0)));
    return bidPoker;
}

/** Each player discards its cards, in its order: undefined for no commitment */
function discard(bidPoker: BidPokerGame, discards: ReadonlyArray<ReadonlyArray<number> | undefined>): void {
    discards.forEach((cards: ReadonlyArray<number> | undefined, player: number) => cards === undefined || bidPoker.commitDiscard(player));
    discards.forEach((cards: ReadonlyArray<number> | undefined, player: number) => cards === undefined || bidPoker.revealDiscard(player, cards));
}

describe('BidPokerGame', () => {
    test('should open the auction of the first lot, the players reading the catalogue meanwhile', () => {
        // When
        const bidPoker: BidPokerGame = game();

        // Then
        expect(bidPoker.phase()).toEqual(BidPokerPhase.BIDDING);
        expect([bidPoker.session(), bidPoker.lotIndex(), bidPoker.step()]).toEqual([0, 0, 0]);
        expect(bidPoker.lot()).toEqual({ index: 0, cards: CATALOGUE[0], seller: null });
        expect(bidPoker.lots()).toHaveLength(3);
        expect(bidPoker.awaited()).toEqual([0, 1, 2, 3]);
        expect(bidPoker.coins()).toEqual([300, 300, 300, 300]);
        expect(bidPoker.holdings()).toEqual([[], [], [], []]);
        expect(bidPoker.phaseTime()).toEqual(RULES.catalogueTime + RULES.bidTime);
        expect(bidPoker.result()).toBeNull();
    });

    test('should sell a lot to the highest bid, its coins to the bank, once every bid is revealed', () => {
        // Given
        const bidPoker: BidPokerGame = game();

        // When
        [2, 0, 1, 3].forEach((player: number) => expect(bidPoker.commitBid(player)).toEqual(Applied.APPLIED));

        // Then
        expect(bidPoker.phase()).toEqual(BidPokerPhase.REVEALING);
        expect(bidPoker.committed()).toEqual([2, 0, 1, 3]);
        expect(bidPoker.phaseTime()).toEqual(RULES.revealTime);
        expect(bidPoker.step()).toEqual(1);

        // When
        expect(bidPoker.revealBid(0, 12)).toEqual(Applied.APPLIED);
        bidPoker.revealBid(1, 0);
        bidPoker.revealBid(2, 30);

        // Then
        expect(bidPoker.awaited()).toEqual([3]);

        // When
        bidPoker.revealBid(3, 29);

        // Then
        expect(bidPoker.coins()).toEqual([300, 300, 270, 300]);
        expect(bidPoker.bank()).toEqual(30);
        expect(bidPoker.holdings()[2]).toEqual(CATALOGUE[0]);
        expect(bidPoker.events()).toEqual([{
            kind: BidEventKind.SOLD, session: 0, lot: 0, winner: 2, price: 30, tied: [],
            bids: [{ player: 2, amount: 30 }, { player: 0, amount: 12 }, { player: 1, amount: 0 }, { player: 3, amount: 29 }],
        }]);
        expect([bidPoker.phase(), bidPoker.lotIndex(), bidPoker.step()]).toEqual([BidPokerPhase.BIDDING, 1, 2]);
        expect(bidPoker.phaseTime()).toEqual(RULES.bidTime);
    });

    test('should sell a lot to the first committed of the equal highest bids', () => {
        // Given
        const bidPoker: BidPokerGame = game();

        // When
        [3, 1, 0, 2].forEach((player: number) => bidPoker.commitBid(player));
        [0, 1, 2, 3].forEach((player: number) => bidPoker.revealBid(player, player === 0 ? 5 : 20));

        // Then
        expect(bidPoker.events()[0]).toMatchObject({ winner: 3, price: 20, tied: [1, 2] });
    });

    test('should take out of the game a lot of the dealing session nobody bids on', () => {
        // Given
        const bidPoker: BidPokerGame = game();

        // When
        auction(bidPoker, [0, 0, 0, 0]);

        // Then
        expect(bidPoker.out()).toEqual(CATALOGUE[0]);
        expect(bidPoker.events()).toEqual([{ kind: BidEventKind.UNSOLD, session: 0, lot: 0, seller: null }]);
        expect(bidPoker.bank()).toEqual(0);
    });

    test.each([301, -1, 1.5])('should count a bid of %s as none, and tell it illegal', (amount: number) => {
        // Given
        const bidPoker: BidPokerGame = game();
        [0, 1, 2, 3].forEach((player: number) => bidPoker.commitBid(player));

        // When
        const applied: Applied = bidPoker.revealBid(0, amount);
        [1, 2, 3].forEach((player: number) => bidPoker.revealBid(player, player));

        // Then
        expect(applied).toEqual(Applied.ILLEGAL);
        expect(bidPoker.events()).toEqual([
            { kind: BidEventKind.MISSED, session: 0, lot: 0, phase: BidPokerPhase.REVEALING, reason: MissedReason.ILLEGAL, players: [0] },
            expect.objectContaining({ kind: BidEventKind.SOLD, winner: 3, price: 3 }),
        ]);
    });

    test('should count a reveal not matching its commitment as no bid', () => {
        // Given
        const bidPoker: BidPokerGame = game();
        [0, 1, 2, 3].forEach((player: number) => bidPoker.commitBid(player));

        // When
        bidPoker.refuse(0);
        bidPoker.refuse(0);
        [1, 2, 3].forEach((player: number) => bidPoker.revealBid(player, 0));

        // Then
        expect(bidPoker.events()).toEqual([
            { kind: BidEventKind.MISSED, session: 0, lot: 0, phase: BidPokerPhase.REVEALING, reason: MissedReason.INVALID, players: [0] },
            { kind: BidEventKind.UNSOLD, session: 0, lot: 0, seller: null },
        ]);
        expect(bidPoker.withheld()).toEqual([0]);
    });

    test('should make a pig at the end of a player who withheld a sealed value', () => {
        // Given
        const bidPoker: BidPokerGame = game();
        [0, 1, 2, 3].forEach((player: number) => bidPoker.commitBid(player));
        [1, 2, 3].forEach((player: number) => bidPoker.revealBid(player, 0));

        // When player 0 does not reveal its bid, then buys the other lots
        bidPoker.close();
        auction(bidPoker, [10, 0, 0, 0]);
        auction(bidPoker, [10, 0, 0, 0]);
        discard(bidPoker, [[]]);

        // Then
        expect(bidPoker.phase()).toEqual(BidPokerPhase.OVER);
        expect(bidPoker.result()?.standings[0]).toMatchObject({ pig: true, fine: RULES.pigFine });
    });

    test('should ignore the moves out of their phase, of no player, or sent again', () => {
        // Given
        const bidPoker: BidPokerGame = game();
        bidPoker.commitBid(0);

        // Then
        expect([bidPoker.commitBid(0), bidPoker.commitBid(4), bidPoker.commitBid(-1), bidPoker.commitBid(1.5)]).toEqual(Array.from({ length: 4 }, () => Applied.IGNORED));
        expect([bidPoker.revealBid(0, 1), bidPoker.commitDiscard(0), bidPoker.revealDiscard(0, [])]).toEqual(Array.from({ length: 3 }, () => Applied.IGNORED));

        // When
        [1, 2, 3].forEach((player: number) => bidPoker.commitBid(player));
        bidPoker.revealBid(0, 1);

        // Then
        expect([bidPoker.revealBid(0, 2), bidPoker.commitBid(1)]).toEqual([Applied.IGNORED, Applied.IGNORED]);
        bidPoker.refuse(0);
        expect(bidPoker.events()).toEqual([]);
    });

    test('should close the bidding once its time is over: the late players bid nothing and are absent until they bid again', () => {
        // Given
        const bidPoker: BidPokerGame = game();
        bidPoker.commitBid(1);

        // When
        bidPoker.close();

        // Then
        expect(bidPoker.events()).toEqual([
            { kind: BidEventKind.MISSED, session: 0, lot: 0, phase: BidPokerPhase.BIDDING, reason: MissedReason.LATE, players: [0, 2, 3] },
        ]);
        expect(bidPoker.absent()).toEqual([0, 2, 3]);
        expect([bidPoker.phase(), bidPoker.awaited()]).toEqual([BidPokerPhase.REVEALING, [1]]);

        // When
        bidPoker.revealBid(1, 1);

        // Then the next lot waits for the players present only
        expect(bidPoker.holdings()[1]).toEqual(CATALOGUE[0]);
        expect(bidPoker.awaited()).toEqual([1]);

        // When a player absent bids again
        bidPoker.commitBid(2);

        // Then the lot waits for player 1 still
        expect(bidPoker.absent()).toEqual([0, 3]);
        expect([bidPoker.phase(), bidPoker.awaited()]).toEqual([BidPokerPhase.BIDDING, [1]]);

        // When
        bidPoker.commitBid(1);

        // Then
        expect([bidPoker.phase(), bidPoker.awaited()]).toEqual([BidPokerPhase.REVEALING, [2, 1]]);
    });

    test('should close the reveals once their time is over: the bids not revealed count as none', () => {
        // Given
        const bidPoker: BidPokerGame = game();
        [0, 1, 2, 3].forEach((player: number) => bidPoker.commitBid(player));
        bidPoker.revealBid(0, 5);
        bidPoker.revealBid(1, 50);

        // When
        bidPoker.close();

        // Then
        expect(bidPoker.events()).toEqual([
            { kind: BidEventKind.MISSED, session: 0, lot: 0, phase: BidPokerPhase.REVEALING, reason: MissedReason.LATE, players: [2, 3] },
            expect.objectContaining({ kind: BidEventKind.SOLD, winner: 1, price: 50 }),
        ]);
        expect(bidPoker.absent()).toEqual([2, 3]);
        expect(bidPoker.withheld()).toEqual([2, 3]);
    });

    test('should open the change session once every lot is auctioned, the players discarding at the same time', () => {
        // When
        const bidPoker: BidPokerGame = dealt();

        // Then
        expect([bidPoker.phase(), bidPoker.session(), bidPoker.lot()]).toEqual([BidPokerPhase.DISCARDING, 1, null]);
        expect(bidPoker.coins()).toEqual([290, 290, 290, 300]);
        expect(bidPoker.bank()).toEqual(30);
        // The player without a card has nothing to discard
        expect(bidPoker.awaited()).toEqual([0, 1, 2]);
        expect(bidPoker.phaseTime()).toEqual(RULES.discardTime);

        // When
        [0, 1, 2].forEach((player: number) => bidPoker.commitDiscard(player));

        // Then
        expect([bidPoker.phase(), bidPoker.phaseTime()]).toEqual([BidPokerPhase.DISCLOSING, RULES.revealTime]);
    });

    test('should auction the discards of each player, its coins to the seller, a lot unsold going back to it', () => {
        // Given
        const bidPoker: BidPokerGame = dealt();

        // When
        discard(bidPoker, [[4, 0], [], [14], undefined]);

        // Then
        expect(bidPoker.lots()).toEqual([{ index: 0, cards: [4, 0], seller: 0 }, { index: 1, cards: [14], seller: 2 }]);
        expect(bidPoker.holdings()).toEqual([[1, 2, 3], CATALOGUE[1], [10, 11, 12, 13], []]);
        expect(bidPoker.events().slice(-2)).toEqual([
            { kind: BidEventKind.DISCARDS, session: 1, player: 0, count: 2, lot: 0 },
            { kind: BidEventKind.DISCARDS, session: 1, player: 2, count: 1, lot: 1 },
        ]);
        expect([bidPoker.phase(), bidPoker.lot()?.seller, bidPoker.bidders(bidPoker.lot() as never)]).toEqual([BidPokerPhase.BIDDING, 0, [1, 2, 3]]);
        expect(bidPoker.commitBid(0)).toEqual(Applied.ILLEGAL);

        // When
        auction(bidPoker, [undefined, 7, 0, 7]);

        // Then
        expect(bidPoker.coins()).toEqual([297, 283, 290, 300]);
        expect(bidPoker.holdings()[1]).toEqual([...CATALOGUE[1], 4, 0]);

        // When nobody bids on the lot of player 2
        auction(bidPoker, [0, 0, undefined, 0]);

        // Then the game is over
        expect(bidPoker.holdings()[2]).toEqual([10, 11, 12, 13, 14]);
        expect(bidPoker.events().at(-1)).toEqual({ kind: BidEventKind.UNSOLD, session: 1, lot: 1, seller: 2 });
        expect(bidPoker.phase()).toEqual(BidPokerPhase.OVER);
        expect(bidPoker.awaited()).toEqual([]);
        // The bank gets the coins of the dealing session, the debts, and the fines no prize paid
        expect(bidPoker.bank()).toEqual(30 + 4 * RULES.debt + (bidPoker.result()?.unpaid as number));
        expect(bidPoker.result()?.standings.map(({ pig }) => pig)).toEqual([true, false, false, true]);
    });

    test.each([
        { cards: [1, 1], name: 'twice' },
        { cards: [20], name: 'not held' },
    ])('should count a discard of a card $name as no discard, and tell it illegal', ({ cards }) => {
        // Given
        const bidPoker: BidPokerGame = dealt();
        [0, 1, 2].forEach((player: number) => bidPoker.commitDiscard(player));

        // When
        const applied: Applied = bidPoker.revealDiscard(0, cards);
        bidPoker.revealDiscard(1, []);
        bidPoker.refuse(2);

        // Then
        expect(applied).toEqual(Applied.ILLEGAL);
        expect(bidPoker.events().slice(-3)).toEqual([
            { kind: BidEventKind.MISSED, session: 1, lot: null, phase: BidPokerPhase.DISCLOSING, reason: MissedReason.ILLEGAL, players: [0] },
            { kind: BidEventKind.MISSED, session: 1, lot: null, phase: BidPokerPhase.DISCLOSING, reason: MissedReason.INVALID, players: [2] },
            { kind: BidEventKind.NO_DISCARD, session: 1 },
        ]);
        expect(bidPoker.phase()).toEqual(BidPokerPhase.OVER);
    });

    test('should close the discards once their time is over, then their reveals', () => {
        // Given
        const bidPoker: BidPokerGame = dealt();
        bidPoker.commitDiscard(0);
        bidPoker.commitDiscard(1);

        // When
        bidPoker.close();

        // Then
        expect(bidPoker.phase()).toEqual(BidPokerPhase.DISCLOSING);
        expect(bidPoker.absent()).toEqual([2]);

        // When
        bidPoker.revealDiscard(0, [0]);
        bidPoker.close();

        // Then
        expect(bidPoker.withheld()).toEqual([1]);
        expect(bidPoker.events().slice(-2)).toEqual([
            { kind: BidEventKind.MISSED, session: 1, lot: null, phase: BidPokerPhase.DISCLOSING, reason: MissedReason.LATE, players: [1] },
            { kind: BidEventKind.DISCARDS, session: 1, player: 0, count: 1, lot: 0 },
        ]);
        expect(bidPoker.absent()).toEqual([2, 1]);
        expect(bidPoker.awaited()).toEqual([3]);
    });

    test('should skip the reveals of the discards when nobody committed, and close nothing once nothing is awaited', () => {
        // Given
        const bidPoker: BidPokerGame = dealt();

        // When
        bidPoker.close();

        // Then
        expect(bidPoker.events().at(-1)).toEqual({ kind: BidEventKind.NO_DISCARD, session: 1 });
        expect(bidPoker.phase()).toEqual(BidPokerPhase.OVER);

        // When
        bidPoker.close();

        // Then
        expect(bidPoker.events().at(-1)).toEqual({ kind: BidEventKind.NO_DISCARD, session: 1 });
    });

    test('should play every change session, then end', () => {
        // Given
        const bidPoker: BidPokerGame = game(4, CATALOGUE, { ...RULES, changeSessions: 3 });
        CATALOGUE.forEach(() => auction(bidPoker, [1, 0, 0, 0]));

        // When the players keep their cards twice
        discard(bidPoker, [[], [], [], []]);
        expect(bidPoker.session()).toEqual(2);
        discard(bidPoker, [[]]);

        // Then
        expect([bidPoker.session(), bidPoker.phase()]).toEqual([3, BidPokerPhase.DISCARDING]);
        expect(bidPoker.events().filter(({ kind }) => kind === BidEventKind.NO_DISCARD)).toHaveLength(2);
    });

    test('should end at once when every player is absent', () => {
        // Given
        const bidPoker: BidPokerGame = game(4, CATALOGUE, { ...RULES, changeSessions: 2 });

        // When
        bidPoker.close();

        // Then every lot is unsold, and the change sessions have no discard
        expect(bidPoker.phase()).toEqual(BidPokerPhase.OVER);
        expect(bidPoker.out()).toHaveLength(15);
        expect(bidPoker.events().map(({ kind }) => kind)).toEqual([
            BidEventKind.MISSED, BidEventKind.UNSOLD, BidEventKind.UNSOLD, BidEventKind.UNSOLD, BidEventKind.NO_DISCARD, BidEventKind.NO_DISCARD,
        ]);
        expect(bidPoker.result()?.pigs).toEqual(4);
    });
});
