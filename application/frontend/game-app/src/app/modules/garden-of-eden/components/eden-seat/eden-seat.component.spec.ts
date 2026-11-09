import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { Apple } from '../../classes/rules/eden-rules';
import { Sign } from '@app/modules/commit-reveal/helpers/table-texts.helper';
import { EdenSeatComponent } from './eden-seat.component';

describe('EdenSeatComponent', () => {
    let fixture: ComponentFixture<EdenSeatComponent>;

    const host = (): HTMLElement => fixture.nativeElement;
    const textsOf = (elements: Iterable<Element>): string[] => Array.from(elements, (child: Element) => child.textContent?.trim() ?? '');
    /** The texts of the first row, then of the second one, a row of its own */
    const shown = (): string[] => [...textsOf(Array.from(host().children).filter((child: Element) => !child.classList.contains('w-full'))),
        ...textsOf(host().querySelector('.w-full')?.children ?? [])];
    const button = (label: string): HTMLButtonElement | undefined =>
        Array.from(host().querySelectorAll<HTMLButtonElement>('button')).find((candidate: HTMLButtonElement) => candidate.textContent?.trim() === label);

    async function show(inputs: Record<string, unknown>): Promise<void> {
        Object.entries(inputs).forEach(([name, value]) => fixture.componentRef.setInput(name, value));
        await fixture.whenStable();
    }

    beforeEach(async () => {
        fixture = TestBed.createComponent(EdenSeatComponent);
        await show({ seat: 3, name: null });
    });

    test('should show a free seat, taken by a click', async () => {
        // Given
        const take = vi.fn();
        fixture.componentInstance.take.subscribe(take);
        await show({ canTake: true });

        // When
        button('Sit here')?.click();

        // Then
        expect(host().id).toEqual('seat-3');
        expect(shown()).toEqual(['Free seat', 'Sit here']);
        expect(take).toHaveBeenCalledOnce();
    });

    test('should show its player, its apple of the round before, what it won and its balance', async () => {
        // When
        await show({
            name: 'bob', awaited: true, sealed: true, absent: true, apple: Apple.SILVER, gain: { sign: Sign.PLUS, amount: 200 },
            balance: { sign: Sign.MINUS, amount: 300 }, clock: { key: 'rooms.table.clock', params: { minutes: 0, seconds: '04' } }, clockLow: true,
            standing: { key: 'eden.table.result.winner' }, winning: true,
        });

        // Then
        expect(shown()).toEqual(['bob', 'Sealed', 'Late', 'Winner', '0:04', 'Silver', '+200 million', 'Balance: −300 million']);
        expect(host().querySelector('app-eden-apple')?.classList).toContain('text-app-apple-silver');
        expect(host().querySelector('.badge-win')?.textContent?.trim()).toEqual('Winner');
        expect(host().classList).toContain('outline-2');
    });

    test('should fade a player out of paradise, its balance without apple nor gain', async () => {
        // When
        await show({ name: 'carol', out: true, balance: { sign: Sign.ZERO, amount: 0 }, standing: { key: 'eden.table.result.place', params: { place: 3 } } });

        // Then
        expect(shown()).toEqual(['carol', 'Out', 'Place 3', 'Balance: 0 million']);
        expect(host().querySelector('app-eden-apple')).toBeNull();
        expect(host().querySelector('span')?.classList).toContain('opacity-50');
        expect(host().querySelector('.badge-draw')).not.toBeNull();
    });

    test('should let its player leave, and free the seat of a player away', async () => {
        // Given
        const leave = vi.fn();
        const release = vi.fn();
        fixture.componentInstance.leave.subscribe(leave);
        fixture.componentInstance.release.subscribe(release);

        // When
        await show({ name: 'bob', canLeave: true, canRelease: true });
        button('Leave')?.click();
        button('Free the seat')?.click();

        // Then
        expect([leave, release].map((spy) => spy.mock.calls.length)).toEqual([1, 1]);
    });
});
