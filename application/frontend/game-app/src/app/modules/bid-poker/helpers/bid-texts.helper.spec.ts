import { translated } from '@testing/translatable-text.helper';
import { describe, expect, test } from 'vitest';
import { BidEvent, BidEventKind, BidPokerPhase, MissedReason } from '../classes/rules/bid-poker-game';
import { eventText } from './bid-texts.helper';

const NAMES: ReadonlyArray<string> = ['alice', 'bob', 'carol', 'dave'];

describe('eventText', () => {
    test.each<{ event: BidEvent; line: string }>([
        {
            event: { kind: BidEventKind.SOLD, session: 0, lot: 0, winner: 1, price: 30, tied: [], bids: [{ player: 1, amount: 30 }, { player: 0, amount: 1 }] },
            line: 'Lot A: bob wins for 30 coins (bids: bob 30, alice 1)',
        },
        {
            event: { kind: BidEventKind.SOLD, session: 1, lot: 1, winner: 2, price: 1, tied: [0, 3], bids: [{ player: 2, amount: 1 }, { player: 0, amount: 1 }, { player: 3, amount: 1 }] },
            line: 'Lot B: carol wins for 1 coin, bid before alice, dave (bids: carol 1, alice 1, dave 1)',
        },
        { event: { kind: BidEventKind.UNSOLD, session: 0, lot: 2, seller: null }, line: 'Lot C: no bid, out of the game' },
        { event: { kind: BidEventKind.UNSOLD, session: 2, lot: 0, seller: 3 }, line: 'Lot A: no bid, back to dave' },
        { event: { kind: BidEventKind.DISCARDS, session: 2, player: 0, count: 1, lot: 0 }, line: 'Change session 2: alice discards 1 card, lot A' },
        { event: { kind: BidEventKind.NO_DISCARD, session: 5 }, line: 'Change session 5: no card discarded' },
        {
            event: { kind: BidEventKind.MISSED, session: 0, lot: 0, phase: BidPokerPhase.BIDDING, reason: MissedReason.LATE, players: [1, 2] },
            line: 'bob, carol: no bid in time',
        },
        {
            event: { kind: BidEventKind.MISSED, session: 0, lot: 0, phase: BidPokerPhase.REVEALING, reason: MissedReason.LATE, players: [1] },
            line: 'bob: bid not revealed in time, a pig at the end',
        },
        {
            event: { kind: BidEventKind.MISSED, session: 1, lot: null, phase: BidPokerPhase.DISCLOSING, reason: MissedReason.INVALID, players: [3] },
            line: 'dave: revealed otherwise than sealed, no value, a pig at the end',
        },
        {
            event: { kind: BidEventKind.MISSED, session: 0, lot: 0, phase: BidPokerPhase.REVEALING, reason: MissedReason.ILLEGAL, players: [0] },
            line: 'alice: a bid above the coins, no bid',
        },
        {
            event: { kind: BidEventKind.MISSED, session: 1, lot: null, phase: BidPokerPhase.DISCLOSING, reason: MissedReason.ILLEGAL, players: [0] },
            line: 'alice: a discard of a card not held, no discard',
        },
    ])('should tell $line', ({ event, line }) => {
        expect(translated(eventText(event, NAMES))).toEqual(line);
    });
});
