import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { Side } from '../../classes/rules/fixed-roulette-rules';
import { FixedSeatComponent } from './fixed-seat.component';

describe('FixedSeatComponent', () => {
    let fixture: ComponentFixture<FixedSeatComponent>;

    const host = (): HTMLElement => fixture.nativeElement;
    /** What the seat shows, each part apart: the parts of its chips too */
    const shown = (): string[] => Array.from(host().children).flatMap((child: Element) => child.querySelector('span') === null ? [child] : Array.from(child.children))
        .map((part: Element) => part.textContent.trim()).filter((part: string) => part !== '');
    const button = (label: string): HTMLButtonElement | undefined =>
        Array.from(host().querySelectorAll<HTMLButtonElement>('button')).find((candidate: HTMLButtonElement) => candidate.textContent.trim() === label);

    async function show(inputs: Record<string, unknown>): Promise<void> {
        Object.entries(inputs).forEach(([name, value]) => fixture.componentRef.setInput(name, value));
        await fixture.whenStable();
    }

    beforeEach(async () => {
        fixture = TestBed.createComponent(FixedSeatComponent);
        await show({ name: null });
    });

    test('should show a free seat, taken by a click, the chips moved flying to the seat itself', async () => {
        // Given
        const take = vi.fn();
        fixture.componentInstance.take.subscribe(take);
        await show({ canTake: true });

        // When
        button('Sit here')?.click();

        // Then
        expect(shown()).toEqual(['Free seat', 'Sit here']);
        expect(take).toHaveBeenCalledOnce();
        expect(host().querySelector('app-chip-stack')).toBeNull();
        expect(fixture.componentInstance.chipsPlace()).toBe(host());
    });

    test('should show its player, its part in the game, its chips and its time', async () => {
        // When
        await show({ name: 'bob', awaited: true, side: Side.CROUPIER, chips: 435, clock: { key: 'rooms.table.clock', params: { minutes: 0, seconds: '04' } }, clockLow: true });

        // Then
        expect(shown()).toEqual(['bob', 'Croupier', '0:04', '435 chips']);
        expect(host().classList).toContain('outline-2');
        expect(host().classList).toContain('action-pulse');
        expect(host().querySelector('.badge')?.classList).toContain('badge-win');
        expect(host().querySelector('.clock-ring')?.classList).toContain('clock-low');
        expect(fixture.componentInstance.chipsPlace().tagName).toEqual('APP-CHIP-STACK');

        // When
        await show({ side: Side.PUNTER, awaited: false, clock: null, clockLow: false, chips: 1 });

        // Then
        expect(shown()).toEqual(['bob', 'Punter', '1 chip']);
        expect(host().classList).not.toContain('outline-2');
        expect(host().classList).not.toContain('action-pulse');
        expect(host().querySelector('.badge')?.classList).toContain('badge-draw');
    });

    test('should empty the ring of its clock with the time left', async () => {
        // When
        await show({ name: 'bob', awaited: true, chips: 435, clock: { key: 'rooms.table.clock', params: { minutes: 0, seconds: '30' } }, timeLeft: 0.5 });

        // Then
        const ring: HTMLElement = host().querySelector('.clock-ring') as HTMLElement;
        expect(ring.style.getPropertyValue('--clock-left')).toEqual('0.5');
        expect(ring.classList).not.toContain('clock-low');
    });

    test('should show what the game settled last gave its player, or took from it, nothing for a game even', async () => {
        // When
        await show({ name: 'bob', chips: 526, gain: 26 });

        // Then
        expect(shown()).toEqual(['bob', '526 chips', '+26']);
        expect(host().querySelector('.gain')?.classList).toContain('badge-win');

        // When
        await show({ chips: 435, gain: -65 });

        // Then
        expect(shown()).toEqual(['bob', '435 chips', '−65']);
        expect(host().querySelector('.gain')?.classList).toContain('badge-loss');

        // When
        await show({ chips: 500, gain: 0 });

        // Then
        expect(shown()).toEqual(['bob', '500 chips']);
    });

    test('should show the chips of a player bankrupt, none on its stack', async () => {
        // When
        await show({ name: 'bob', chips: 0 });

        // Then
        expect(shown()).toEqual(['bob', '0 chips']);
        expect(host().querySelectorAll('app-chip-stack .chip')).toHaveLength(0);
    });

    test('should let its player leave, or another one free it', async () => {
        // Given
        const leave = vi.fn();
        const release = vi.fn();
        fixture.componentInstance.leave.subscribe(leave);
        fixture.componentInstance.release.subscribe(release);
        await show({ name: 'bob', canLeave: true, canRelease: true });

        // When
        button('Leave')?.click();
        button('Free the seat')?.click();

        // Then
        expect(leave).toHaveBeenCalledOnce();
        expect(release).toHaveBeenCalledOnce();
    });
});
