import { Applied, ContrabandEvent, ContrabandEventKind, ContrabandGameState, ContrabandPhase, WithheldReason } from './contraband-game-state';
import { Call, CallKind, CONTRABAND_RULES, ContrabandVariant, Team } from './contraband-rules';
import { CustomsOutcome, Movement } from './customs';
import { Crossing } from './schedule';
import { ContrabandStanding } from './standings';
import { describe, expect, test } from 'vitest';

const { CLASSIC, GOLD_RUSH } = ContrabandVariant;
const PASS: Call = { kind: CallKind.PASS };
const CHECK: Call = { kind: CallKind.CHECK };
const doubt = (amount: number): Call => ({ kind: CallKind.DOUBT, amount });
const GOLD: number = CONTRABAND_RULES.goldBar;
const IRON = 0;

/** 1 against 1, the players smuggling by turns, the first one first */
const duels = (games: number): Crossing[] =>
    Array.from({ length: games }, (_, crossing: number): Crossing => ({ smuggler: crossing % 2, inspector: (crossing + 1) % 2 }));

function game(variant: ContrabandVariant = CLASSIC, games: number = 4, north: number = 1, schedule: ReadonlyArray<Crossing> = duels(games)): ContrabandGameState {
    return new ContrabandGameState(CONTRABAND_RULES, north, { variant, customsTime: 120, games }, schedule);
}

/** A game of the match played: the smuggler packs, the inspector calls, the smuggler reveals */
function crossed(contraband: ContrabandGameState, contents: unknown, call: Call): void {
    contraband.pack(contraband.smuggler());
    contraband.call(contraband.inspector(), call);
    contraband.reveal(contraband.smuggler(), contents);
}

const lastEvent = (contraband: ContrabandGameState): Readonly<ContrabandEvent> => contraband.events()[contraband.events().length - 1];
const movement = (outcome: CustomsOutcome, moved: Partial<Movement> = {}): Movement =>
    ({ outcome, smuggled: 0, seized: 0, indemnity: 0, fromAtm: (moved.smuggled ?? 0) + (moved.seized ?? 0), ...moved });

describe('ContrabandGameState', () => {
    test('should await the first smuggler packing, every player with its ATM and its account', () => {
        // When
        const contraband: ContrabandGameState = game();

        // Then
        expect(contraband.phase()).toEqual(ContrabandPhase.PACKING);
        expect(contraband.variant).toEqual(CLASSIC);
        expect(contraband.players).toEqual(2);
        expect([contraband.crossing(), contraband.step()]).toEqual([0, 0]);
        expect([contraband.smuggler(), contraband.inspector()]).toEqual([0, 1]);
        expect(contraband.awaited()).toEqual([0]);
        expect(contraband.phaseTime()).toEqual(CONTRABAND_RULES.packingTime);
        expect(contraband.atms()).toEqual([300, 300]);
        expect(contraband.accounts()).toEqual([100, 100]);
        expect([contraband.inspectorCall(), contraband.result()]).toEqual([null, null]);
        expect([contraband.absent(), contraband.events()]).toEqual([[], []]);
    });

    test('should open the customs once packed, reveal once called, then start the next game, each phase a step', () => {
        // Given
        const contraband: ContrabandGameState = game();

        // When
        expect(contraband.pack(0)).toEqual(Applied.APPLIED);

        // Then
        expect([contraband.phase(), contraband.step(), contraband.awaited(), contraband.phaseTime()]).toEqual([ContrabandPhase.CUSTOMS, 1, [1], 120]);
        expect(lastEvent(contraband)).toEqual({ kind: ContrabandEventKind.PACKED, crossing: 0, smuggler: 0, inspector: 1 });

        // When
        expect(contraband.call(1, doubt(30))).toEqual(Applied.APPLIED);

        // Then
        expect([contraband.phase(), contraband.step(), contraband.awaited()]).toEqual([ContrabandPhase.REVEALING, 2, [0]]);
        expect(contraband.phaseTime()).toEqual(CONTRABAND_RULES.revealTime);
        expect(contraband.inspectorCall()).toEqual(doubt(30));
        expect(lastEvent(contraband)).toEqual({ kind: ContrabandEventKind.CALLED, crossing: 0, smuggler: 0, inspector: 1, call: doubt(30) });

        // When
        expect(contraband.reveal(0, 40)).toEqual(Applied.APPLIED);

        // Then
        expect(lastEvent(contraband)).toEqual({
            kind: ContrabandEventKind.SETTLED, crossing: 0, smuggler: 0, inspector: 1, call: doubt(30), lateCall: false, contents: 40,
            movement: movement(CustomsOutcome.SLIPPED, { smuggled: 40, indemnity: 15 }), reason: null,
        });
        expect([contraband.phase(), contraband.crossing(), contraband.step()]).toEqual([ContrabandPhase.PACKING, 1, 3]);
        expect([contraband.smuggler(), contraband.inspector(), contraband.awaited()]).toEqual([1, 0, [1]]);
        expect(contraband.inspectorCall()).toBeNull();
        expect(contraband.atms()).toEqual([260, 300]);
        expect(contraband.accounts()).toEqual([155, 85]);
    });

    test('should ignore the moves out of their phase, of no player, or sent again, and tell the moves of a player not awaited', () => {
        // Given
        const contraband: ContrabandGameState = game();

        // Then
        expect(contraband.call(1, PASS)).toEqual(Applied.IGNORED);
        expect(contraband.reveal(0, 40)).toEqual(Applied.IGNORED);
        expect(contraband.refuse(0)).toEqual(Applied.IGNORED);
        expect([contraband.pack(2), contraband.pack(-1), contraband.pack(0.5)]).toEqual([Applied.IGNORED, Applied.IGNORED, Applied.IGNORED]);
        expect(contraband.pack(1)).toEqual(Applied.ILLEGAL);

        // When
        contraband.pack(0);

        // Then
        expect(contraband.pack(0)).toEqual(Applied.IGNORED);
        expect(contraband.call(2, PASS)).toEqual(Applied.IGNORED);
        expect(contraband.call(0, PASS)).toEqual(Applied.ILLEGAL);

        // When
        contraband.call(1, PASS);

        // Then
        expect(contraband.call(1, doubt(10))).toEqual(Applied.IGNORED);
        expect(contraband.reveal(1, 40)).toEqual(Applied.IGNORED);
        expect(contraband.refuse(1)).toEqual(Applied.IGNORED);
        expect([contraband.phase(), contraband.step(), contraband.inspectorCall()]).toEqual([ContrabandPhase.REVEALING, 2, PASS]);
    });

    test('should settle each classic call, then end the match after its games, the country of the highest total winning', () => {
        // Given
        const contraband: ContrabandGameState = game();

        // When
        crossed(contraband, 40, PASS);
        crossed(contraband, 0, doubt(30));
        crossed(contraband, 60, doubt(60));
        crossed(contraband, 100, doubt(10));

        // Then
        expect(contraband.events().filter((event: Readonly<ContrabandEvent>) => event.kind === ContrabandEventKind.SETTLED)
            .map((event: Readonly<ContrabandEvent>) => event.kind === ContrabandEventKind.SETTLED && event.movement.outcome))
            .toEqual([CustomsOutcome.PASSED, CustomsOutcome.EMPTY_DOUBT, CustomsOutcome.SEIZED, CustomsOutcome.SLIPPED]);
        expect(contraband.atms()).toEqual([200, 200]);
        expect(contraband.accounts()).toEqual([120, 280]);
        expect([contraband.phase(), contraband.crossing(), contraband.step()]).toEqual([ContrabandPhase.OVER, 3, 12]);
        expect([contraband.awaited(), contraband.inspectorCall()]).toEqual([[], null]);
        expect(contraband.result()?.winner).toEqual(Team.SOUTH);
        expect(contraband.result()?.totals).toEqual({ [Team.NORTH]: -80, [Team.SOUTH]: 80 });
        expect(contraband.result()?.standings.map((standing: Readonly<ContrabandStanding>) => standing.balance)).toEqual([-80, 80]);
        expect(contraband.result()?.standings.map(({ smuggled, seized, indemnities }: Readonly<ContrabandStanding>) => [smuggled, seized, indemnities]))
            .toEqual([[40, 0, -20], [100, 60, 20]]);
        expect(contraband.close()).toEqual(Applied.IGNORED);
        expect(contraband.pack(1)).toEqual(Applied.IGNORED);
    });

    test('should settle each call of the Gold Rush', () => {
        // Given
        const contraband: ContrabandGameState = game(GOLD_RUSH);

        // When
        crossed(contraband, GOLD, PASS);
        crossed(contraband, IRON, CHECK);
        crossed(contraband, GOLD, CHECK);
        crossed(contraband, IRON, PASS);

        // Then
        expect(contraband.events().filter((event: Readonly<ContrabandEvent>) => event.kind === ContrabandEventKind.SETTLED)
            .map((event: Readonly<ContrabandEvent>) => event.kind === ContrabandEventKind.SETTLED && event.movement.outcome))
            .toEqual([CustomsOutcome.PASSED, CustomsOutcome.IRON_CHECKED, CustomsOutcome.SEIZED, CustomsOutcome.PASSED]);
        expect(contraband.atms()).toEqual([100, 300]);
        expect(contraband.accounts()).toEqual([100, 300]);
        expect(contraband.phase()).toEqual(ContrabandPhase.OVER);
    });

    test('should move the money of the smuggler and the inspector only', () => {
        // Given
        const contraband: ContrabandGameState = game(CLASSIC, 4, 2, [
            { smuggler: 0, inspector: 3 }, { smuggler: 3, inspector: 0 }, { smuggler: 1, inspector: 2 }, { smuggler: 2, inspector: 1 },
        ]);

        // When
        crossed(contraband, 50, doubt(80));

        // Then
        expect(contraband.players).toEqual(4);
        expect(contraband.atms()).toEqual([250, 300, 300, 300]);
        expect(contraband.accounts()).toEqual([100, 100, 100, 150]);
        expect([contraband.smuggler(), contraband.inspector()]).toEqual([3, 0]);
    });

    describe('lateness', () => {
        test('should move nothing for a smuggler late to pack, absent, the customs skipped for the next game', () => {
            // Given
            const contraband: ContrabandGameState = game();

            // When
            expect(contraband.close()).toEqual(Applied.APPLIED);

            // Then
            expect(lastEvent(contraband)).toEqual({ kind: ContrabandEventKind.PACK_LATE, crossing: 0, smuggler: 0, inspector: 1 });
            expect([contraband.phase(), contraband.crossing(), contraband.step()]).toEqual([ContrabandPhase.PACKING, 1, 1]);
            expect(contraband.absent()).toEqual([0]);
            expect(contraband.atms()).toEqual([300, 300]);
            expect(contraband.accounts()).toEqual([100, 100]);
        });

        test('should pass the trunk of an inspector late to call, absent', () => {
            // Given
            const contraband: ContrabandGameState = game();
            contraband.pack(0);

            // When
            expect(contraband.close()).toEqual(Applied.APPLIED);

            // Then
            expect(lastEvent(contraband)).toEqual({ kind: ContrabandEventKind.CALLED, crossing: 0, smuggler: 0, inspector: 1, call: PASS });
            expect([contraband.phase(), contraband.step(), contraband.absent()]).toEqual([ContrabandPhase.REVEALING, 2, [1]]);

            // When
            contraband.reveal(0, 40);

            // Then the pass told as late
            expect(lastEvent(contraband)).toMatchObject({ kind: ContrabandEventKind.SETTLED, call: PASS, lateCall: true, movement: { outcome: CustomsOutcome.PASSED } });
            expect(contraband.atms()).toEqual([260, 300]);
            expect(contraband.accounts()).toEqual([140, 100]);

            // When the inspector of the next game passes in time
            crossed(contraband, 10, PASS);

            // Then
            expect(lastEvent(contraband)).toMatchObject({ kind: ContrabandEventKind.SETTLED, call: PASS, lateCall: false });
        });

        test('should seize the most a trunk holds when revealed late, the smuggler absent, the call aside', () => {
            // Given
            const contraband: ContrabandGameState = game();
            contraband.pack(0);
            contraband.call(1, doubt(10));

            // When
            expect(contraband.close()).toEqual(Applied.APPLIED);

            // Then
            expect(lastEvent(contraband)).toEqual({
                kind: ContrabandEventKind.SETTLED, crossing: 0, smuggler: 0, inspector: 1, call: doubt(10), lateCall: false, contents: null,
                movement: movement(CustomsOutcome.WITHHELD, { seized: 100 }), reason: WithheldReason.LATE,
            });
            expect(contraband.absent()).toEqual([0]);
            expect([contraband.phase(), contraband.crossing(), contraband.step()]).toEqual([ContrabandPhase.PACKING, 1, 3]);
            expect(contraband.atms()).toEqual([200, 300]);
            expect(contraband.accounts()).toEqual([100, 200]);
        });

        test('should seize the most a trunk holds when its reveal does not match its commitment', () => {
            // Given
            const contraband: ContrabandGameState = game();
            contraband.pack(0);
            contraband.call(1, PASS);

            // When
            expect(contraband.refuse(0)).toEqual(Applied.APPLIED);

            // Then
            expect(lastEvent(contraband)).toMatchObject({ contents: null, movement: movement(CustomsOutcome.WITHHELD, { seized: 100 }), reason: WithheldReason.INVALID });
            expect(contraband.absent()).toEqual([]);
            expect(contraband.atms()).toEqual([200, 300]);
            expect(contraband.reveal(0, 40)).toEqual(Applied.IGNORED);
        });

        test.each([101, 2.5, -1, '40', undefined])('should seize the most a trunk holds when its reveal of %o is against the rules', (contents: unknown) => {
            // Given
            const contraband: ContrabandGameState = game();
            contraband.pack(0);
            contraband.call(1, PASS);

            // When
            expect(contraband.reveal(0, contents)).toEqual(Applied.ILLEGAL);

            // Then
            expect(lastEvent(contraband)).toMatchObject({ contents: null, movement: movement(CustomsOutcome.WITHHELD, { seized: 100 }), reason: WithheldReason.ILLEGAL });
            expect([contraband.phase(), contraband.crossing()]).toEqual([ContrabandPhase.PACKING, 1]);
            expect(contraband.accounts()).toEqual([100, 200]);
        });

        test('should keep a player late again absent once, until any move of it applies: a pack, a call or a reveal', () => {
            // Given
            const contraband: ContrabandGameState = game(CLASSIC, 6);
            contraband.close();
            contraband.close();
            expect(contraband.absent()).toEqual([0, 1]);

            // When
            contraband.pack(0);

            // Then
            expect(contraband.absent()).toEqual([1]);

            // When
            contraband.call(1, PASS);

            // Then
            expect(contraband.absent()).toEqual([]);

            // When
            contraband.close();
            contraband.close();
            contraband.close();

            // Then
            expect(contraband.absent()).toEqual([0, 1]);
            expect(contraband.crossing()).toEqual(5);

            // When
            contraband.pack(1);
            contraband.call(0, PASS);
            expect(contraband.reveal(1, 10)).toEqual(Applied.APPLIED);

            // Then
            expect(contraband.absent()).toEqual([]);
            expect(contraband.phase()).toEqual(ContrabandPhase.OVER);
        });
    });

    describe('an ATM emptied', () => {
        test('should let a classic smuggler pack an empty trunk only, a trunk withheld seizing nothing', () => {
            // Given
            const contraband: ContrabandGameState = game(CLASSIC, 10);
            for (let crossing = 0; crossing < 3; crossing++) {
                crossed(contraband, 100, PASS);
                crossed(contraband, 0, PASS);
            }
            expect(contraband.atms()).toEqual([0, 300]);

            // When
            crossed(contraband, 1, doubt(10));

            // Then
            expect(lastEvent(contraband)).toMatchObject({ movement: movement(CustomsOutcome.WITHHELD), reason: WithheldReason.ILLEGAL });
            expect(contraband.accounts()).toEqual([400, 100]);

            // When
            crossed(contraband, 0, PASS);
            contraband.pack(0);
            contraband.call(1, doubt(5));
            contraband.reveal(0, 0);

            // Then
            expect(lastEvent(contraband)).toMatchObject({ contents: 0, movement: movement(CustomsOutcome.EMPTY_DOUBT, { indemnity: 2.5 }) });
            expect(contraband.accounts()).toEqual([402.5, 97.5]);
        });

        test('should let a Gold Rush smuggler pack an iron bar only, a trunk withheld seizing nothing', () => {
            // Given
            const contraband: ContrabandGameState = game(GOLD_RUSH, 10);
            for (let crossing = 0; crossing < 3; crossing++) {
                crossed(contraband, GOLD, PASS);
                crossed(contraband, IRON, PASS);
            }

            // When
            crossed(contraband, GOLD, CHECK);

            // Then
            expect(lastEvent(contraband)).toMatchObject({ movement: movement(CustomsOutcome.WITHHELD), reason: WithheldReason.ILLEGAL });
            expect(contraband.atms()).toEqual([0, 300]);
            expect(contraband.accounts()).toEqual([400, 100]);

            // When
            crossed(contraband, IRON, PASS);
            contraband.pack(0);
            contraband.call(1, CHECK);
            contraband.close();

            // Then
            expect(lastEvent(contraband)).toMatchObject({ movement: movement(CustomsOutcome.WITHHELD), reason: WithheldReason.LATE });
            expect(contraband.accounts()).toEqual([400, 100]);
        });
    });
});
