import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SeatPair } from '@app/helpers/seat-pair.helper';
import { beforeEach, describe, expect, test } from 'vitest';
import { BallKind, FixedWheelComponent, StakeRow } from './fixed-wheel.component';

describe('FixedWheelComponent', () => {
    let fixture: ComponentFixture<FixedWheelComponent>;

    const NO_STAKES: ReadonlyArray<SeatPair<number>> = [[0, 0], [0, 0], [0, 0], [0, 0]];
    const element = (): HTMLElement => fixture.nativeElement;
    const labels = (): string[] => Array.from(element().querySelectorAll('[role="img"]'), (cell: Element) => cell.getAttribute('aria-label') as string);
    const cell = (pocket: number): HTMLElement => element().querySelector(`#pocket-${ pocket }`) as HTMLElement;
    const caption = (): string => element().querySelector('p')?.textContent.trim() ?? '';
    const ball = (): SVGCircleElement | null => element().querySelector('circle[data-ball]');
    /** What a betting cell shows: the count of the top stake, the number of its pocket, the count of the bottom stake */
    const counts = (pocket: number): string[] => Array.from(cell(pocket).children, (part: Element) => part.textContent.trim());

    async function show(inputs: Record<string, unknown>): Promise<void> {
        Object.entries(inputs).forEach(([name, value]) => fixture.componentRef.setInput(name, value));
        await fixture.whenStable();
    }

    beforeEach(async () => {
        fixture = TestBed.createComponent(FixedWheelComponent);
        await show({ stakes: NO_STAKES });
    });

    test('should show the fixed disk of the pockets, red and black, and a bare betting cell for each pocket, without ball', () => {
        // Then the disk is decorative
        const disk: SVGElement = element().querySelector('svg') as SVGElement;
        expect(disk.getAttribute('aria-hidden')).toEqual('true');
        const numbers: SVGTextElement[] = Array.from(disk.querySelectorAll('text'));
        expect(numbers.map((number: SVGTextElement) => number.textContent.trim())).toEqual(['1', '2', '3', '4']);
        expect(numbers.map((number: SVGTextElement) => number.classList.contains('fill-app-pocket-red'))).toEqual([true, false, true, false]);
        expect(numbers.map((number: SVGTextElement) => number.classList.contains('fill-app-pocket-black'))).toEqual([false, true, false, true]);
        // The first pocket on the right of the top, clockwise
        expect([numbers[0].getAttribute('x'), numbers[0].getAttribute('y')]).toEqual(['64.85', '35.15']);
        expect(disk.querySelectorAll('line')).toHaveLength(4);
        expect(disk.querySelector('line')?.getAttribute('y1')).toEqual('40');
        expect(ball()).toBeNull();
        expect(caption()).toEqual('');

        // Then the cells tell their pockets
        expect(labels()).toEqual(['Pocket 1', 'Pocket 2', 'Pocket 3', 'Pocket 4']);
        expect(cell(1).querySelector('.rounded-full')?.classList).toContain('bg-app-pocket-red');
        expect(cell(2).querySelector('.rounded-full')?.classList).toContain('bg-app-pocket-black');
        expect(counts(1)).toEqual(['', '1', '']);
        expect(cell(1).classList).not.toContain('outline-2');
    });

    test('should show the stakes of the top and the bottom players on each pocket, their chips counted and named', async () => {
        // When
        await show({ stakes: [[0, 0], [15, 35], [50, 0], [0, 1]], names: ['alice', 'bob'] });

        // Then
        expect(counts(2)).toEqual(['15', '2', '35']);
        expect(counts(3)).toEqual(['50', '3', '']);
        expect(counts(4)).toEqual(['', '4', '1']);
        expect(labels()).toEqual(['Pocket 1', 'Pocket 2, alice: 15 chips, bob: 35 chips', 'Pocket 3, alice: 50 chips', 'Pocket 4, bob: 1 chip']);
        expect(cell(2).querySelectorAll('app-chip-stack')).toHaveLength(2);
    });

    test('should show the ball the local player sealed, dashed, on its page', async () => {
        // When
        await show({ stakes: [[0, 0], [15, 0], [0, 0], [0, 0]], names: ['bob', 'alice'], ball: { pocket: 2, kind: BallKind.SEALED } });

        // Then
        expect(ball()?.getAttribute('data-ball')).toEqual('sealed');
        expect(ball()?.getAttribute('stroke-dasharray')).toEqual('2 1.5');
        expect(ball()?.getAttribute('fill-opacity')).toEqual('0.6');
        expect([ball()?.getAttribute('cx'), ball()?.getAttribute('cy')]).toEqual(['74.04', '74.04']);
        expect(caption()).toEqual('Your ball, sealed: pocket 2');
        expect(labels()[1]).toEqual('Pocket 2, your ball, sealed, bob: 15 chips');
        expect(cell(2).classList).toContain('outline-2');
        expect(cell(2).classList).toContain('outline-dashed');
        expect(cell(1).classList).not.toContain('outline-2');
    });

    test('should show the last ball revealed, until another one shows', async () => {
        // When
        await show({ ball: { pocket: 3, kind: BallKind.LAST } });

        // Then
        expect(ball()?.getAttribute('data-ball')).toEqual('last');
        expect(ball()?.hasAttribute('stroke-dasharray')).toBe(false);
        expect(ball()?.hasAttribute('fill-opacity')).toBe(false);
        expect(caption()).toEqual('Last ball: pocket 3');
        expect(labels()[2]).toEqual('Pocket 3, the last ball');
        expect(cell(3).classList).toContain('outline-2');
        expect(cell(3).classList).not.toContain('outline-dashed');

        // When
        await show({ ball: null });

        // Then
        expect(ball()).toBeNull();
        expect(caption()).toEqual('');
        expect(cell(3).classList).not.toContain('outline-2');
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
});
