import { CONTRABAND_RULES, Team } from './contraband-rules';
import { ContrabandResult, ContrabandStanding, Ledger, settleContraband } from './standings';
import { describe, expect, test } from 'vitest';

const ledger = (moved: Partial<Ledger> = {}): Ledger => ({ atm: 300, smuggled: 0, seized: 0, indemnities: 0, ...moved });
/** The country, the share of the ATMs of the other one, the balance */
const summary = (standing: Readonly<ContrabandStanding>): [Team, number, number] => [standing.team, standing.share, standing.balance];

describe('settleContraband', () => {
    test('should owe nothing to anybody when no money moved, a tie', () => {
        // When
        const result: ContrabandResult = settleContraband(CONTRABAND_RULES, 1, [ledger(), ledger()]);

        // Then
        expect(result.winner).toBeNull();
        expect(result.totals).toEqual({ [Team.NORTH]: 0, [Team.SOUTH]: 0 });
        expect(result.standings).toEqual([
            { player: 0, team: Team.NORTH, atm: 300, smuggled: 0, seized: 0, indemnities: 0, share: 300, balance: 0 },
            { player: 1, team: Team.SOUTH, atm: 300, smuggled: 0, seized: 0, indemnities: 0, share: 300, balance: 0 },
        ]);
    });

    test('should tie the countries whose money moved alike', () => {
        // When
        const result: ContrabandResult = settleContraband(CONTRABAND_RULES, 1, [ledger({ atm: 250, smuggled: 50 }), ledger({ atm: 250, smuggled: 50 })]);

        // Then
        expect(result.winner).toBeNull();
        expect(result.standings.map(summary)).toEqual([[Team.NORTH, 250, 0], [Team.SOUTH, 250, 0]]);
    });

    test('should share the ATMs of the other country in thirds among 3 players, rounded, the totals exact and summing to 0', () => {
        // When
        const result: ContrabandResult = settleContraband(CONTRABAND_RULES, 3, [
            ledger(),
            ledger({ atm: 200, smuggled: 100 }),
            ledger({ seized: 30 }),
            ledger({ atm: 270 }),
            ledger(),
            ledger(),
        ]);

        // Then
        expect(result.standings.map(summary)).toEqual([
            [Team.NORTH, 290, -10],
            [Team.NORTH, 290, 90],
            [Team.NORTH, 290, 20],
            [Team.SOUTH, 266.67, -33.33],
            [Team.SOUTH, 266.67, -33.33],
            [Team.SOUTH, 266.67, -33.33],
        ]);
        expect(result.totals).toEqual({ [Team.NORTH]: 100, [Team.SOUTH]: -100 });
        expect(result.winner).toEqual(Team.NORTH);
    });

    test('should count the indemnities, halves too: the North wins 75 million when its trunks of 20 pass and its doubts of 10 find empty ones', () => {
        // When
        const result: ContrabandResult = settleContraband(CONTRABAND_RULES, 2, [
            ledger({ atm: 240, smuggled: 60, indemnities: -15 }),
            ledger({ atm: 260, smuggled: 40, indemnities: -10 }),
            ledger({ indemnities: 15 }),
            ledger({ indemnities: 10 }),
        ]);

        // Then
        expect(result.standings.map(summary)).toEqual([[Team.NORTH, 300, 45], [Team.NORTH, 300, 30], [Team.SOUTH, 250, -35], [Team.SOUTH, 250, -40]]);
        expect(result.totals).toEqual({ [Team.NORTH]: 75, [Team.SOUTH]: -75 });
        expect(result.winner).toEqual(Team.NORTH);
    });

    test('should let the South win by half a million', () => {
        // When
        const result: ContrabandResult = settleContraband(CONTRABAND_RULES, 1, [ledger({ indemnities: -0.5 }), ledger({ indemnities: 0.5 })]);

        // Then
        expect(result.totals).toEqual({ [Team.NORTH]: -0.5, [Team.SOUTH]: 0.5 });
        expect(result.standings.map(summary)).toEqual([[Team.NORTH, 300, -0.5], [Team.SOUTH, 300, 0.5]]);
        expect(result.winner).toEqual(Team.SOUTH);
    });
});
