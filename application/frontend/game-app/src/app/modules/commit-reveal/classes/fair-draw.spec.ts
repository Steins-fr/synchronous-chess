import { DrawPhase, DrawStep, FairDraw } from './fair-draw';
import { describe, expect, test } from 'vitest';

const PLAYERS: ReadonlyArray<string> = ['a', 'b', 'c', 'd'];
const PARTS: Readonly<Record<string, string>> = { a: 'p0', b: 'p1', c: 'p2', d: 'p3' };
/** The commitment of each player to its part, in the context `ctx` */
const COMMITMENTS: Readonly<Record<string, string>> = {
    a: '4acd71ace94a84f319320df164c37e3b0e9fe6d4df56cc738b8025af4f3324a0',
    b: '6495bad570219ce49390725de9422191e885ef99a8338155520739430ea13641',
    c: '12a6ca9f2b642e07351bf88d43d0b5aaea4ca9fe96397ad6873d06d9a6bde20f',
    d: '06c6593cbaf32a2b6b668f03a6844bdf6e55594e8ad357fc1c46d8e2b8ca6f97',
};

function committed(): FairDraw {
    const draw = new FairDraw('ctx', PLAYERS);
    PLAYERS.forEach((player: string) => draw.commit(player, COMMITMENTS[player]));
    return draw;
}

describe('FairDraw', () => {
    test.each([[['a', 'b', 'a']], [[]]])('should need distinct players, one at least: %j', (players: string[]) => {
        expect(() => new FairDraw('ctx', players)).toThrow('A fair draw needs distinct players, one at least');
    });

    test('should commit to the context, the index of the player and the part', async () => {
        await expect(FairDraw.commitment('ctx', 0, 'p0')).resolves.toEqual(COMMITMENTS['a']);
        expect(FairDraw.drawPart()).toMatch(/^[0-9a-f]{32}$/);
    });

    test('should draw the hash of the parts in the order of the seats, whatever the order of the reveals', async () => {
        // Given
        const draw = new FairDraw('ctx', PLAYERS);

        // Then
        expect(draw.phase).toEqual(DrawPhase.COMMITTING);
        expect(draw.waitingFor).toEqual(PLAYERS);

        // When
        ['c', 'a', 'd', 'b'].forEach((player: string) => expect(draw.commit(player, COMMITMENTS[player])).toEqual(DrawStep.APPLIED));

        // Then
        expect(draw.phase).toEqual(DrawPhase.REVEALING);
        expect(draw.waitingFor).toEqual(PLAYERS);
        await expect(draw.seed()).resolves.toBeUndefined();

        // When
        for (const player of ['d', 'b', 'a']) {
            expect(await draw.reveal(player, PARTS[player])).toEqual(DrawStep.APPLIED);
        }

        // Then
        expect(draw.waitingFor).toEqual(['c']);

        // When
        await draw.reveal('c', PARTS['c']);

        // Then
        expect(draw.phase).toEqual(DrawPhase.DRAWN);
        expect(draw.waitingFor).toEqual([]);
        await expect(draw.seed()).resolves.toEqual('c6007ee9a9bb613afe9fa3ed7012df7f497b77bb0bfccba05a2aadf459e904e7');
    });

    test('should keep the first commitment of a player, and ignore the ones of a participant not drawing', () => {
        // Given
        const draw = new FairDraw('ctx', PLAYERS);
        draw.commit('a', COMMITMENTS['a']);

        // Then
        expect(draw.commit('a', COMMITMENTS['b'])).toEqual(DrawStep.IGNORED);
        expect(draw.commit('e', COMMITMENTS['b'])).toEqual(DrawStep.IGNORED);
        expect(draw.waitingFor).toEqual(['b', 'c', 'd']);
    });

    test.each([
        { commitment: 'not a commitment' },
        { commitment: 42 },
    ])('should refuse the malformed commitment $commitment', ({ commitment }) => {
        // Given
        const draw = new FairDraw('ctx', PLAYERS);

        // Then
        expect(draw.commit('a', commitment)).toEqual(DrawStep.INVALID);
        expect(draw.waitingFor).toEqual(PLAYERS);
    });

    test('should ignore a commitment once every player committed', () => {
        expect(committed().commit('a', COMMITMENTS['a'])).toEqual(DrawStep.IGNORED);
    });

    test('should ignore a reveal before every player committed, of a participant not drawing, or sent again', async () => {
        // Given
        const draw = new FairDraw('ctx', PLAYERS);
        draw.commit('a', COMMITMENTS['a']);

        // Then
        await expect(draw.reveal('a', PARTS['a'])).resolves.toEqual(DrawStep.IGNORED);

        // When
        const all: FairDraw = committed();
        await all.reveal('a', PARTS['a']);

        // Then
        await expect(all.reveal('a', PARTS['a'])).resolves.toEqual(DrawStep.IGNORED);
        await expect(all.reveal('e', PARTS['a'])).resolves.toEqual(DrawStep.IGNORED);
    });

    test.each([
        { part: 'p1' },
        { part: 42 },
    ])('should refuse the part $part not matching its commitment, then take the one matching', async ({ part }) => {
        // Given
        const draw: FairDraw = committed();

        // Then
        await expect(draw.reveal('a', part)).resolves.toEqual(DrawStep.INVALID);
        expect(draw.waitingFor).toEqual(PLAYERS);
        await expect(draw.reveal('a', PARTS['a'])).resolves.toEqual(DrawStep.APPLIED);
    });
});
