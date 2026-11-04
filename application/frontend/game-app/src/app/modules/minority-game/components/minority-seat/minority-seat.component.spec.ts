import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { Vote } from '../../classes/rules/minority-rules';
import { MinoritySeatComponent } from './minority-seat.component';

describe('MinoritySeatComponent', () => {
    let fixture: ComponentFixture<MinoritySeatComponent>;

    const host = (): HTMLElement => fixture.nativeElement;
    const text = (): string => host().textContent?.replace(/\s+/g, ' ').trim() ?? '';
    const shown = (): string[] => Array.from(host().children, (child: Element) => child.textContent?.trim() ?? '');
    const button = (label: string): HTMLButtonElement | undefined =>
        Array.from(host().querySelectorAll<HTMLButtonElement>('button')).find((candidate: HTMLButtonElement) => candidate.textContent?.trim() === label);

    async function show(inputs: Record<string, unknown>): Promise<void> {
        Object.entries(inputs).forEach(([name, value]) => fixture.componentRef.setInput(name, value));
        await fixture.whenStable();
    }

    beforeEach(async () => {
        fixture = TestBed.createComponent(MinoritySeatComponent);
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
        expect(text()).toContain('Free seat');
        expect(take).toHaveBeenCalledOnce();
    });

    test('should show its player and what the game tells of it', async () => {
        // When
        await show({
            name: 'bob', awaited: true, sealed: true, absent: true, asker: true, vote: Vote.NO, points: 7,
            clock: { key: 'minority.table.clock', params: { minutes: 0, seconds: '04' } }, clockLow: true, standing: { key: 'minority.table.result.winner' }, winning: true,
        });

        // Then
        expect(shown()).toEqual(['bob', 'Asks', 'No', '7 points', 'Sealed', 'Skipped', 'Winner', '0:04']);
        expect(host().querySelector('.badge-win')?.textContent?.trim()).toEqual('Winner');
        expect(host().querySelector('.tabular-nums')?.classList).toContain('text-app-clock-low');
        expect(host().classList).toContain('outline-2');
    });

    test('should fade an eliminated player, its standing in the neutral colors', async () => {
        // When
        await show({ name: 'carol', eliminated: true, standing: { key: 'minority.table.result.place', params: { place: 3 } } });

        // Then
        expect(shown()).toEqual(['carol', 'Eliminated', 'Place 3']);
        expect(host().querySelector('.opacity-50')?.textContent?.trim()).toEqual('carol');
        expect(host().querySelector('.badge-win')).toBeNull();
        expect(host().classList).not.toContain('outline-2');
    });

    test('should let its player leave it, and another player free it', async () => {
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
        expect([leave, release].map((output) => output.mock.calls.length)).toEqual([1, 1]);
    });
});
