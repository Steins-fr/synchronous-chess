import { Crossing, drawSchedule } from './schedule';
import { describe, expect, test } from 'vitest';

const SEED: string = 'a3cd47f2c3e7b1a8ff6cb04b2ed20b25bc7513837b4eb843db3ad76b68f2c430';
const range = (from: number, to: number): number[] => Array.from({ length: to - from }, (_, index: number) => from + index);
const sorted = (players: ReadonlyArray<number>): number[] => [...players].sort((a: number, b: number) => a - b);
const smugglers = (crossings: ReadonlyArray<Readonly<Crossing>>): number[] => crossings.map((crossing: Readonly<Crossing>) => crossing.smuggler);

describe('drawSchedule', () => {
    test.each([1, 2, 3, 4])('should pair each North player with a South player in each rotation of %i against %i, each pair crossing both ways', async (north: number) => {
        // When
        const schedule: ReadonlyArray<Readonly<Crossing>> = await drawSchedule(SEED, north, 2 * north * 3);

        // Then
        expect(schedule).toHaveLength(2 * north * 3);
        for (let rotation = 0; rotation < 3; rotation++) {
            const crossings: ReadonlyArray<Readonly<Crossing>> = schedule.slice(2 * north * rotation, 2 * north * (rotation + 1));
            const firsts: ReadonlyArray<Readonly<Crossing>> = crossings.filter((_, index: number) => index % 2 === 0);
            // The North players smuggle first, in their order, each across the customs of a South player of its own
            expect(smugglers(firsts)).toEqual(range(0, north));
            expect(sorted(firsts.map((crossing: Readonly<Crossing>) => crossing.inspector))).toEqual(range(north, 2 * north));
            // Then the South player of the pair across the customs of the North one
            firsts.forEach((crossing: Readonly<Crossing>, pair: number) =>
                expect(crossings[2 * pair + 1]).toEqual({ smuggler: crossing.inspector, inspector: crossing.smuggler }));
        }
    });

    test('should pair the only players of 1 against 1 by turns', async () => {
        // Then
        expect(await drawSchedule(SEED, 1, 4)).toEqual([
            { smuggler: 0, inspector: 1 },
            { smuggler: 1, inspector: 0 },
            { smuggler: 0, inspector: 1 },
            { smuggler: 1, inspector: 0 },
        ]);
    });

    test('should stop in a rotation after the games of the match: 4 against 4 over 10 games, the first rotation and 2 games', async () => {
        // Given
        const rotations: ReadonlyArray<Readonly<Crossing>> = await drawSchedule(SEED, 4, 16);

        // When
        const schedule: ReadonlyArray<Readonly<Crossing>> = await drawSchedule(SEED, 4, 10);

        // Then
        expect(schedule).toEqual(rotations.slice(0, 10));
        expect(schedule[8].smuggler).toEqual(0);
        expect(schedule[9]).toEqual({ smuggler: schedule[8].inspector, inspector: 0 });
    });

    test('should let each country smuggle half of the games, some players of 3 against 3 once more than others', async () => {
        // When
        const schedule: ReadonlyArray<Readonly<Crossing>> = await drawSchedule(SEED, 3, 10);

        // Then
        const counts: number[] = range(0, 6).map((player: number) => smugglers(schedule).filter((smuggler: number) => smuggler === player).length);
        expect(counts.slice(0, 3)).toEqual([2, 2, 1]);
        expect(sorted(counts.slice(3))).toEqual([1, 2, 2]);
        expect(schedule.filter((crossing: Readonly<Crossing>) => crossing.smuggler < 3)).toHaveLength(5);
    });

    test('should draw alike from the same seed, apart from another one', async () => {
        // When
        const schedule: ReadonlyArray<Readonly<Crossing>> = await drawSchedule(SEED, 4, 30);

        // Then
        expect(await drawSchedule(SEED, 4, 30)).toEqual(schedule);
        expect(await drawSchedule('another seed', 4, 30)).not.toEqual(schedule);
    });
});
