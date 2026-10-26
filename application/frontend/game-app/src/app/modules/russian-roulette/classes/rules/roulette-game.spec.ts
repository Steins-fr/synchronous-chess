import { describe, expect, test } from 'vitest';
import { RouletteActionKind, RouletteGame, RUSSIAN_ROULETTE_RULES } from './roulette-game';
import { RouletteSeat } from './roulette-seat';

describe('RouletteGame', () => {
    const { ONE, TWO } = RouletteSeat;

    function started(first: RouletteSeat = ONE): RouletteGame {
        const game = new RouletteGame();
        game.start(first);
        return game;
    }

    /** The player to act shoots, the chamber holding the bullets */
    function shoot(game: RouletteGame, bullets: number): void {
        expect(game.shoot(game.toAct() as RouletteSeat)).toBe(true);
        expect(game.fire(bullets)).toBe(true);
    }

    test('should follow the rules of the manga', () => {
        expect(RUSSIAN_ROULETTE_RULES).toEqual({ chambers: 24, bullets: 3, stack: 150, death: 50, passes: 5, turnTime: 45, awayTime: 30 });
    });

    test('should wait for the draw of the first player', () => {
        // Given
        const game = new RouletteGame();

        // Then
        expect(game.toAct()).toBeNull();
        expect(game.pass(ONE)).toBe(false);
        expect(game.shoot(ONE)).toBe(false);

        // When
        expect(game.start(TWO)).toBe(true);

        // Then
        expect(game.first()).toEqual(TWO);
        expect(game.toAct()).toEqual(TWO);
        expect(game.start(ONE)).toBe(false);
    });

    test('should double the price of each pass in a row, the turn moving on', () => {
        // Given
        const game = started();

        // When
        expect(game.pass(TWO)).toBe(false);
        expect(game.pass(ONE)).toBe(true);
        expect(game.pass(TWO)).toBe(true);
        expect(game.pass(ONE)).toBe(true);

        // Then
        expect(game.table()).toEqual(1 + 2 + 4);
        expect(game.stacks()).toEqual([150 - 1 - 4, 150 - 2]);
        expect(game.passPrice()).toEqual(8);
        expect(game.toAct()).toEqual(TWO);
    });

    test('should give the table to the bank after 5 passes in a row, and reveal the next chamber, killing no one', () => {
        // Given
        const game = started();

        // When
        [ONE, TWO, ONE, TWO, ONE].forEach((seat: RouletteSeat) => expect(game.pass(seat)).toBe(true));

        // Then the game waits for the chamber
        expect(game.bank()).toEqual(31);
        expect(game.table()).toEqual(0);
        expect(game.stacks()).toEqual([150 - 1 - 4 - 16, 150 - 2 - 8]);
        expect(game.passPrice()).toEqual(1);
        expect(game.actions().at(-1)).toEqual({ seat: ONE, kind: RouletteActionKind.PASS, chips: 16, draw: true });
        expect(game.revealing()).toEqual(ONE);
        expect(game.toAct()).toBeNull();
        expect(game.pass(TWO)).toBe(false);

        // When
        expect(game.fire(2)).toBe(true);

        // Then its bullets are spent, without a death
        expect(game.chambers()).toEqual([2]);
        expect(game.firedBullets()).toEqual(2);
        expect(game.deaths()).toEqual([0, 0]);
        expect(game.stacks()).toEqual([150 - 1 - 4 - 16, 150 - 2 - 8]);
        expect(game.revealing()).toBeNull();
        expect(game.toAct()).toEqual(TWO);
        expect(game.actions().at(-1)).toEqual({ seat: ONE, kind: RouletteActionKind.REVEAL, chips: 0, bullets: 2 });
    });

    test('should give the table to the shooter of an empty chamber', () => {
        // Given
        const game = started();
        game.pass(ONE);
        game.pass(TWO);

        // When
        expect(game.shoot(ONE)).toBe(true);

        // Then the game waits for the chamber
        expect(game.toAct()).toBeNull();
        expect(game.shooting()).toEqual(ONE);
        expect(game.pass(ONE)).toBe(false);

        // When
        expect(game.fire(0)).toBe(true);

        // Then
        expect(game.stacks()).toEqual([150 - 1 + 3, 150 - 2]);
        expect(game.table()).toEqual(0);
        expect(game.passPrice()).toEqual(1);
        expect(game.chambers()).toEqual([0]);
        expect(game.toAct()).toEqual(TWO);
        expect(game.actions().at(-1)).toEqual({ seat: ONE, kind: RouletteActionKind.SHOT, chips: 3, bullets: 0 });
    });

    test.each<[number]>([[1], [2]])('should count a chamber of %s bullets one death, the shooter giving 50 chips and the table', (bullets: number) => {
        // Given
        const game = started();
        game.pass(ONE);

        // When
        game.shoot(TWO);
        game.fire(bullets);

        // Then
        expect(game.deaths()).toEqual([0, 1]);
        expect(game.stacks()).toEqual([150 - 1 + 50 + 1, 150 - 50]);
        expect(game.firedBullets()).toEqual(bullets);
        expect(game.actions().at(-1)).toEqual({ seat: TWO, kind: RouletteActionKind.SHOT, chips: 1, bullets });
    });

    test('should refuse a chamber not fired, and bullets a chamber can not hold', () => {
        // Given
        const game = started();

        // Then
        expect(game.fire(0)).toBe(false);
        game.shoot(ONE);
        expect(game.shoot(ONE)).toBe(false);
        expect(game.fire(3)).toBe(false);
        expect(game.fire(-1)).toBe(false);
        expect(game.fire(0.5)).toBe(false);
        expect(game.chambers()).toEqual([]);
    });

    test('should make a player who can not pay the pass shoot, a death taking its stack below 0', () => {
        // Given
        const game = new RouletteGame({ ...RUSSIAN_ROULETTE_RULES, stack: 2 });
        game.start(ONE);
        game.pass(ONE);
        game.pass(TWO);

        // Then the pass costs 4
        expect(game.canPass(ONE)).toBe(false);
        expect(game.pass(ONE)).toBe(false);

        // When
        shoot(game, 1);

        // Then
        expect(game.stacks()).toEqual([1 - 50, 0 + 50 + 3]);
        expect(game.canPass(TWO)).toBe(true);
    });

    test('should end once every bullet fired, the fewest deaths winning', () => {
        // Given
        const game = started();

        // When 6 bullets, 2 in a chamber
        [1, 0, 2, 1, 1].forEach((bullets: number) => shoot(game, bullets));

        // Then
        expect(game.firedBullets()).toEqual(5);
        expect(game.result()).toBeNull();
        shoot(game, 1);
        expect(game.over()).toBe(true);
        expect(game.toAct()).toBeNull();
        expect(game.deaths()).toEqual([3, 2]);
        expect(game.result()).toEqual({ winner: TWO, deaths: [3, 2], stacks: game.stacks() });
        expect(game.pass(TWO)).toBe(false);
    });

    test('should give the game to the most chips when the deaths are even, else a draw', () => {
        // Given
        const game = started();
        game.pass(ONE);

        // When the second player takes the chip of the table, then the deaths are even
        [0, 2, 1, 1, 2].forEach((bullets: number) => shoot(game, bullets));

        // Then
        expect(game.deaths()).toEqual([2, 2]);
        expect(game.result()).toEqual({ winner: TWO, deaths: [2, 2], stacks: [149, 151] });

        // Given even chips
        const even = started();
        [1, 1, 2, 2].forEach((bullets: number) => shoot(even, bullets));

        // Then
        expect(even.result()).toEqual({ winner: null, deaths: [2, 2], stacks: [150, 150] });
    });

    test('should give the game to the first player too, on deaths or on chips', () => {
        // Given the second player shooting first
        const fewerDeaths = started(TWO);
        const moreChips = started(TWO);

        // When
        [1, 1, 2, 0, 2].forEach((bullets: number) => shoot(fewerDeaths, bullets));
        moreChips.pass(TWO);
        [0, 2, 2, 1, 1].forEach((bullets: number) => shoot(moreChips, bullets));

        // Then
        expect(fewerDeaths.result()).toEqual({ winner: ONE, deaths: [1, 3], stacks: [250, 50] });
        expect(moreChips.result()).toEqual({ winner: ONE, deaths: [2, 2], stacks: [151, 149] });
    });

    test('should end once every chamber fired', () => {
        // Given
        const game = started();

        // When
        Array.from({ length: 23 }, () => shoot(game, 0));

        // Then
        expect(game.over()).toBe(false);
        shoot(game, 0);
        expect(game.over()).toBe(true);
        expect(game.result()?.winner).toBeNull();
    });

    test('should give the game to the other player of a player losing on time', () => {
        // Given
        const game = new RouletteGame();

        // When before the draw
        expect(game.forfeit(ONE)).toBe(true);

        // Then
        expect(game.forfeited()).toEqual(ONE);
        expect(game.result()?.winner).toEqual(TWO);
        expect(game.forfeit(TWO)).toBe(false);
        expect(game.start(ONE)).toBe(false);
    });

    test('should fire nothing once the game is lost on time, a share coming late', () => {
        // Given a shot waiting for its chamber
        const game = new RouletteGame();
        game.start(ONE);
        game.shoot(ONE);

        // When
        game.forfeit(ONE);

        // Then
        expect(game.fire(1)).toBe(false);
        expect(game.deaths()).toEqual([0, 0]);
        expect(game.chambers()).toEqual([]);
        expect(game.actions()).toEqual([]);
    });
});
