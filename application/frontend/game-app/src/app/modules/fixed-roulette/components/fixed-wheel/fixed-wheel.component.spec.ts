import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { form } from '@angular/forms/signals';
import { SeatPair } from '@app/helpers/seat-pair.helper';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { BALL_ROLL, BallKind, FixedWheelComponent, ShownBall, StakeRow } from './fixed-wheel.component';

const NO_STAKES: ReadonlyArray<SeatPair<number>> = [[0, 0], [0, 0], [0, 0], [0, 0]];

/** A table giving the wheel the fields of its local player */
@Component({
    imports: [FixedWheelComponent],
    template: '<app-fixed-wheel [stakes]="stakes" [stakeFields]="betting() ? betsForm.chips : null" [pocketField]="placing() ? betsForm.pocket : null" formId="place-form" />',
})
class HostComponent {
    public readonly stakes: ReadonlyArray<SeatPair<number>> = [[0, 0], [15, 0], [0, 0], [0, 0]];
    public readonly betting = signal<boolean>(true);
    public readonly placing = signal<boolean>(true);
    public readonly bets = signal<{ pocket: string; chips: ReadonlyArray<number | null> }>({ pocket: '', chips: [null, null, null, null] });
    public readonly betsForm = form(this.bets, { name: 'wheel' });
}

describe('FixedWheelComponent', () => {
    let fixture: ComponentFixture<FixedWheelComponent>;

    const element = (): HTMLElement => fixture.nativeElement;
    const labels = (root: HTMLElement = element()): string[] => Array.from(root.querySelectorAll('[id^="pocket-"]'), (cell: Element) => cell.getAttribute('aria-label') as string);
    const cell = (pocket: number, root: HTMLElement = element()): HTMLElement => root.querySelector(`#pocket-${ pocket }`) as HTMLElement;
    const caption = (): string => element().querySelector('p')?.textContent.trim() ?? '';
    const ball = (root: HTMLElement = element()): HTMLElement | null => root.querySelector('[data-ball]');
    const orbit = (shown: HTMLElement | null): HTMLElement => shown?.parentElement as HTMLElement;
    /** What a pocket shows: its number, the count of the top stake, the count of the bottom stake */
    const counts = (pocket: number): string[] => [
        cell(pocket).querySelector('.pocket-number')?.textContent.trim() ?? '',
        ...Array.from(cell(pocket).querySelectorAll('[data-stake]'), (part: Element) => part.textContent.trim()),
    ];

    async function show(inputs: Record<string, unknown>): Promise<void> {
        Object.entries(inputs).forEach(([name, value]) => fixture.componentRef.setInput(name, value));
        await fixture.whenStable();
    }

    beforeEach(async () => {
        TestBed.configureTestingModule({ providers: [{ provide: BALL_ROLL, useValue: 40 }] });
        fixture = TestBed.createComponent(FixedWheelComponent);
        await show({ stakes: NO_STAKES });
    });

    test('should show the pockets in reading order, red and black by turns around the hub, without ball nor field', () => {
        // Then the same colors face each other
        const pockets: HTMLElement[] = [1, 2, 3, 4].map((pocket: number) => cell(pocket));
        expect(pockets.map((pocket: HTMLElement) => pocket.classList.contains('bg-app-pocket-red-felt'))).toEqual([true, false, false, true]);
        expect(pockets.map((pocket: HTMLElement) => pocket.classList.contains('bg-app-pocket-black-felt'))).toEqual([false, true, true, false]);
        // Then the numbers lie on the side of the rim: above the stakes in the first row, below in the second one
        expect(pockets.map((pocket: HTMLElement) => pocket.querySelector('.order-first') !== null)).toEqual([true, true, false, false]);
        expect(pockets.map((pocket: HTMLElement) => pocket.querySelector('.order-last') !== null)).toEqual([false, false, true, true]);
        expect(pockets.map((pocket: HTMLElement) => pocket.getAttribute('role'))).toEqual(['img', 'img', 'img', 'img']);
        expect(labels()).toEqual(['Pocket 1', 'Pocket 2', 'Pocket 3', 'Pocket 4']);
        expect(counts(1)).toEqual(['1', '', '']);
        expect(element().querySelector('.wheel-disk')?.hasAttribute('role')).toBe(false);
        expect(element().querySelector('input')).toBeNull();
        expect(ball()).toBeNull();
        expect(element().querySelector('[data-ghost]')).toBeNull();
        expect(caption()).toEqual('');
        expect(cell(1).classList).not.toContain('pocket-hit');
        // The time of the roll of the ball, for its animation
        expect(element().style.getPropertyValue('--ball-roll')).toEqual('40ms');
    });

    test('should show the stakes of the top and the bottom players on each pocket, their chips counted and named', async () => {
        // When
        await show({ stakes: [[0, 0], [15, 35], [50, 0], [0, 1]], names: ['alice', 'bob'] });

        // Then
        expect(counts(2)).toEqual(['2', '15', '35']);
        expect(counts(3)).toEqual(['3', '50', '']);
        expect(counts(4)).toEqual(['4', '', '1']);
        expect(labels()).toEqual(['Pocket 1', 'Pocket 2, alice: 15 chips, bob: 35 chips', 'Pocket 3, alice: 50 chips', 'Pocket 4, bob: 1 chip']);
        expect(cell(2).querySelectorAll('app-chip-stack')).toHaveLength(2);
    });

    test('should show the ball the local player sealed, dashed, on the rim of its pocket', async () => {
        // When
        await show({ stakes: [[0, 0], [15, 0], [0, 0], [0, 0]], names: ['bob', 'alice'], ball: { pocket: 2, kind: BallKind.SEALED } });

        // Then
        expect(ball()?.getAttribute('data-ball')).toEqual('sealed');
        expect(ball()?.classList).toContain('ball-sealed');
        // The second pocket, on the right of the top
        expect(orbit(ball()).style.getPropertyValue('--ball-angle')).toEqual('45deg');
        expect(orbit(ball()).classList).not.toContain('rolling');
        expect(caption()).toEqual('Your ball, sealed: pocket 2');
        expect(labels()[1]).toEqual('Pocket 2, your ball, sealed, bob: 15 chips');
        expect(cell(2).classList).toContain('pocket-sealed');
        expect(cell(2).classList).not.toContain('pocket-hit');
        expect(cell(1).classList).not.toContain('pocket-sealed');
    });

    test('should show the last ball revealed, until another one shows', async () => {
        // When
        await show({ ball: { pocket: 3, kind: BallKind.LAST } });

        // Then
        expect(ball()?.getAttribute('data-ball')).toEqual('last');
        expect(ball()?.classList).not.toContain('ball-sealed');
        expect(orbit(ball()).style.getPropertyValue('--ball-angle')).toEqual('225deg');
        expect(caption()).toEqual('Last ball: pocket 3');
        expect(labels()[2]).toEqual('Pocket 3, the last ball');
        expect(cell(3).classList).toContain('pocket-hit');
        expect(cell(3).classList).not.toContain('pocket-sealed');

        // When
        await show({ ball: null });

        // Then
        expect(caption()).toEqual('');
        expect(cell(3).classList).not.toContain('pocket-hit');
    });

    test('should roll the ball revealed to its pocket, telling its pocket once there only', async () => {
        // Given
        const rolled = vi.fn();
        fixture.componentInstance.rolled.subscribe(rolled);
        const last: ShownBall = { pocket: 4, kind: BallKind.LAST };

        // When
        await show({ ball: last, rolling: true });

        // Then the ball rolls, its pocket not told yet
        expect(orbit(ball()).classList).toContain('rolling');
        expect(orbit(ball()).style.getPropertyValue('--ball-angle')).toEqual('135deg');
        expect(caption()).toEqual('');
        expect(labels()[3]).toEqual('Pocket 4');
        expect(cell(4).classList).not.toContain('pocket-hit');

        // When an animation of its ring ends, then the one of the ball
        orbit(ball()).dispatchEvent(new Event('animationend', { bubbles: true }));
        expect(rolled).not.toHaveBeenCalled();
        ball()?.dispatchEvent(new Event('animationend', { bubbles: true }));

        // Then
        expect(rolled).toHaveBeenCalledOnce();

        // When the table shows the game settled
        await show({ rolling: false });

        // Then
        expect(orbit(ball()).classList).not.toContain('rolling');
        expect(caption()).toEqual('Last ball: pocket 4');
        expect(labels()[3]).toEqual('Pocket 4, the last ball');
        expect(cell(4).classList).toContain('pocket-hit');

        // When an animation of the ball at rest ends
        ball()?.dispatchEvent(new Event('animationend', { bubbles: true }));

        // Then
        expect(rolled).toHaveBeenCalledOnce();
    });

    test('should give the place of each stake, for the chips flying to it and from it', () => {
        // When
        const top: HTMLElement = fixture.componentInstance.stackOf(3, StakeRow.TOP);
        const bottom: HTMLElement = fixture.componentInstance.stackOf(3, StakeRow.BOTTOM);

        // Then
        expect(top.getAttribute('data-stake')).toEqual('3-top');
        expect(bottom.getAttribute('data-stake')).toEqual('3-bottom');
        expect(cell(3).contains(top)).toBe(true);
        expect(cell(3).contains(bottom)).toBe(true);
    });

    describe('with the fields of the local player', () => {
        let table: ComponentFixture<HostComponent>;

        const root = (): HTMLElement => table.nativeElement;
        const radios = (): HTMLInputElement[] => Array.from(root().querySelectorAll('input[type="radio"]'));
        const stakes = (): HTMLInputElement[] => Array.from(root().querySelectorAll('input[type="number"]'));
        const ghost = (): HTMLElement | null => root().querySelector('[data-ghost]');

        beforeEach(async () => {
            table = TestBed.createComponent(HostComponent);
            await table.whenStable();
        });

        test('should hold a stake field in each pocket, in place of the stake of the bottom player, in the form of the table', async () => {
            // Then
            expect(stakes().map((stake: HTMLInputElement) => [stake.getAttribute('aria-label'), stake.getAttribute('form')]))
                .toEqual([['Chips on 1', 'place-form'], ['Chips on 2', 'place-form'], ['Chips on 3', 'place-form'], ['Chips on 4', 'place-form']]);
            expect(stakes().map((stake: HTMLInputElement) => stake.closest('[data-stake]')?.getAttribute('data-stake'))).toEqual(['1-bottom', '2-bottom', '3-bottom', '4-bottom']);
            expect(cell(2, root()).getAttribute('role')).toEqual('group');
            expect(labels(root())[1]).toEqual('Pocket 2, : 15 chips');

            // When
            stakes()[2].value = '30';
            stakes()[2].dispatchEvent(new Event('input'));
            await table.whenStable();

            // Then
            expect(table.componentInstance.bets().chips).toEqual([null, null, 30, null]);

            // When the local player bet
            table.componentInstance.betting.set(false);
            table.componentInstance.placing.set(false);
            await table.whenStable();

            // Then
            expect(stakes()).toEqual([]);
            expect(radios()).toEqual([]);
            expect(cell(2, root()).getAttribute('role')).toEqual('img');
        });

        test('should let the croupier place its ball by clicking the number of a pocket, the ball to place shown on its rim', async () => {
            // Then the numbers are radio buttons, in a group
            const disk: HTMLElement = root().querySelector('.wheel-disk') as HTMLElement;
            expect(disk.getAttribute('role')).toEqual('radiogroup');
            expect(disk.getAttribute('aria-label')).toEqual('Pocket of the ball');
            expect(radios().map((radio: HTMLInputElement) => [radio.value, radio.closest('label')?.textContent.trim(), radio.getAttribute('form')]))
                .toEqual([['1', '1', 'place-form'], ['2', '2', 'place-form'], ['3', '3', 'place-form'], ['4', '4', 'place-form']]);
            expect(ghost()).toBeNull();

            // When the pointer comes over the number of a pocket
            const areas: HTMLElement[] = Array.from(root().querySelectorAll('app-choice-area'));
            areas[1].dispatchEvent(new Event('pointerenter'));
            await table.whenStable();

            // Then a pale ball shows on its rim, no ball of the game
            expect(ghost()?.getAttribute('data-ghost')).toEqual('2');
            expect(ghost()?.classList).toContain('ball-ghost');
            expect(orbit(ghost()).style.getPropertyValue('--ball-angle')).toEqual('45deg');
            expect(ball(root())).toBeNull();

            // When it leaves
            areas[1].dispatchEvent(new Event('pointerleave'));
            await table.whenStable();

            // Then
            expect(ghost()).toBeNull();

            // When the croupier clicks the number of a pocket
            radios()[2].click();
            await table.whenStable();

            // Then the ball to seal shows there
            expect(table.componentInstance.bets().pocket).toEqual('3');
            expect(ghost()?.getAttribute('data-ghost')).toEqual('3');
            expect(ghost()?.classList).toContain('ball-sealed');
            expect(ghost()?.classList).not.toContain('ball-ghost');

            // When the pointer comes over another one
            areas[0].dispatchEvent(new Event('pointerenter'));
            await table.whenStable();

            // Then
            expect(ghost()?.getAttribute('data-ghost')).toEqual('1');
            expect(ghost()?.classList).toContain('ball-ghost');
        });
    });
});
