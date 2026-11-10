import { translated } from '@testing/translatable-text.helper';
import { describe, expect, test } from 'vitest';
import {
    CheatKind, FixedRouletteEvent, FixedRouletteEventKind, FixedRoulettePhase, FixedRouletteResult, MatchEnd, SettledEvent,
} from '../classes/rules/fixed-roulette-game-state';
import { Bets, Side } from '../classes/rules/fixed-roulette-rules';
import { settle } from '../classes/rules/settlement';
import { eventText, GameOverEvent, isGameOver, resultText } from './fixed-texts.helper';

const NAMES: ReadonlyArray<string> = ['alice', 'bob'];
const settled = (ball: number, croupierBets: Bets, punterBets: Bets): SettledEvent => {
    const bets = { [Side.CROUPIER]: croupierBets, [Side.PUNTER]: punterBets };
    return { kind: FixedRouletteEventKind.SETTLED, round: 2, croupier: 1, ball, bets, settlement: settle(bets, ball) };
};
const result = (change: Partial<FixedRouletteResult>): FixedRouletteResult => ({ winner: 0, end: MatchEnd.GAMES, cause: null, chips: [620, 380], ...change });

describe('isGameOver', () => {
    test.each<[FixedRouletteEvent, boolean]>([
        [{ kind: FixedRouletteEventKind.PLACED, round: 0, croupier: 0, bets: [1, 0, 0, 0] }, false],
        [{ kind: FixedRouletteEventKind.BET, round: 0, punter: 1, bets: [1, 0, 0, 0] }, false],
        [settled(1, [1, 0, 0, 0], [1, 0, 0, 0]), true],
        [{ kind: FixedRouletteEventKind.LATE, round: 0, player: 1, phase: FixedRoulettePhase.BETTING }, true],
        [{ kind: FixedRouletteEventKind.CHEATED, round: 0, player: 0, reason: CheatKind.INVALID_REVEAL }, true],
    ])('should tell whether %o ends a game', (event: FixedRouletteEvent, over: boolean) => {
        expect(isGameOver(event)).toBe(over);
    });
});

describe('eventText', () => {
    test.each<[GameOverEvent, string]>([
        [settled(2, [0, 15, 50, 0], [0, 35, 0, 30]), 'Game 3: ball in pocket 2, both players on it. bob (croupier) −26 chips, alice (punter) +26 chips'],
        [settled(3, [0, 15, 50, 0], [0, 35, 0, 30]), 'Game 3: ball in pocket 3, the croupier alone on it. bob (croupier) +65 chips, alice (punter) −65 chips'],
        [settled(4, [0, 15, 50, 0], [0, 35, 0, 30]), 'Game 3: ball in pocket 4, the punter alone on it. bob (croupier) −65 chips, alice (punter) +65 chips'],
        [settled(1, [0, 15, 50, 0], [0, 35, 0, 30]), 'Game 3: ball in pocket 1, no one on it. bob (croupier) −65 chips, alice (punter) −65 chips'],
        [settled(2, [0, 1, 0, 0], [0, 1, 0, 0]), 'Game 3: ball in pocket 2, both players on it. bob (croupier) 0 chips, alice (punter) 0 chips'],
        [settled(1, [1, 1, 0, 0], [1, 0, 0, 0]), 'Game 3: ball in pocket 1, both players on it. bob (croupier) −1 chip, alice (punter) +1 chip'],
        [{ kind: FixedRouletteEventKind.LATE, round: 4, player: 1, phase: FixedRoulettePhase.PLACING },
            'Game 5: bob does not place the ball in time and loses the match'],
        [{ kind: FixedRouletteEventKind.LATE, round: 4, player: 0, phase: FixedRoulettePhase.BETTING }, 'Game 5: alice does not bet in time and loses the match'],
        [{ kind: FixedRouletteEventKind.LATE, round: 4, player: 1, phase: FixedRoulettePhase.REVEALING },
            'Game 5: bob does not reveal the ball in time and loses the match'],
        [{ kind: FixedRouletteEventKind.CHEATED, round: 0, player: 1, reason: CheatKind.INVALID_REVEAL },
            'Game 1: bob reveals another ball than the one sealed and loses the match'],
        [{ kind: FixedRouletteEventKind.CHEATED, round: 0, player: 1, reason: CheatKind.ILLEGAL_POCKET }, 'Game 1: bob reveals a ball off the wheel and loses the match'],
    ])('should tell %o', (event: GameOverEvent, text: string) => {
        expect(translated(eventText(event, NAMES))).toEqual(text);
    });
});

describe('resultText', () => {
    test.each<[FixedRouletteResult, string]>([
        [result({}), 'alice wins, 620 chips to 380 chips'],
        [result({ winner: 1, chips: [1, 999] }), 'bob wins, 999 chips to 1 chip'],
        [result({ winner: null, chips: [500, 500] }), 'A draw, 500 chips each'],
        [result({ winner: null, end: MatchEnd.BANKRUPT, chips: [0, 0] }), 'A draw, 0 chips each'],
        [result({ end: MatchEnd.BANKRUPT, chips: [1000, 0] }), 'alice wins: bob has no chip left'],
        [result({ winner: 1, end: MatchEnd.FORFEIT, cause: FixedRoulettePhase.PLACING }), 'bob wins: alice does not place the ball in time'],
        [result({ end: MatchEnd.FORFEIT, cause: FixedRoulettePhase.BETTING }), 'alice wins: bob does not bet in time'],
        [result({ end: MatchEnd.FORFEIT, cause: FixedRoulettePhase.REVEALING }), 'alice wins: bob does not reveal the ball in time'],
        [result({ end: MatchEnd.CHEAT, cause: CheatKind.INVALID_REVEAL }), 'alice wins: bob reveals another ball than the one sealed'],
        [result({ end: MatchEnd.CHEAT, cause: CheatKind.ILLEGAL_POCKET }), 'alice wins: bob reveals a ball off the wheel'],
    ])('should tell %o', (ended: FixedRouletteResult, text: string) => {
        expect(translated(resultText(ended, NAMES))).toEqual(text);
    });
});
