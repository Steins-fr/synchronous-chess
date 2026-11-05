import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ContrabandSeatComponent, CustomsRole } from './contraband-seat.component';

describe('ContrabandSeatComponent', () => {
    let fixture: ComponentFixture<ContrabandSeatComponent>;

    const host = (): HTMLElement => fixture.nativeElement;
    /** What the seat shows, each part apart: the parts of its money too */
    const shown = (): string[] => Array.from(host().children).flatMap((child: Element) => child.querySelector('span') === null ? [child] : Array.from(child.children))
        .map((part: Element) => part.textContent?.trim() ?? '').filter((part: string) => part !== '');
    const button = (label: string): HTMLButtonElement | undefined =>
        Array.from(host().querySelectorAll<HTMLButtonElement>('button')).find((candidate: HTMLButtonElement) => candidate.textContent?.trim() === label);

    async function show(inputs: Record<string, unknown>): Promise<void> {
        Object.entries(inputs).forEach(([name, value]) => fixture.componentRef.setInput(name, value));
        await fixture.whenStable();
    }

    beforeEach(async () => {
        fixture = TestBed.createComponent(ContrabandSeatComponent);
        await show({ seat: 5, name: null });
    });

    test('should show a free seat, taken by a click, the chips moved flying to the seat itself', async () => {
        // Given
        const take = vi.fn();
        fixture.componentInstance.take.subscribe(take);
        await show({ canTake: true });

        // When
        button('Sit here')?.click();

        // Then
        expect(host().id).toEqual('seat-5');
        expect(shown()).toEqual(['Free seat', 'Sit here']);
        expect(take).toHaveBeenCalledOnce();
        expect(fixture.componentInstance.accountPlace()).toBe(host());
    });

    test('should show its player, its part in the game, its money and its time', async () => {
        // When
        await show({
            name: 'bob', awaited: true, absent: true, role: CustomsRole.SMUGGLER, atm: 260, account: 112.5,
            clock: { key: 'contraband.table.clock', params: { minutes: 0, seconds: '04' } }, clockLow: true,
        });

        // Then
        expect(shown()).toEqual(['bob', 'Smuggler', 'Late', '0:04', 'ATM: 260 million', 'Account: 112.5 million']);
        expect(host().classList).toContain('outline-2');
        expect(host().querySelector('.tabular-nums')?.classList).toContain('text-app-clock-low');
        expect(host().querySelector('app-chip-stack')).not.toBeNull();
        expect(fixture.componentInstance.accountPlace().textContent?.trim()).toEqual('Account: 112.5 million');

        // When
        await show({ role: CustomsRole.INSPECTOR, absent: false, awaited: false, clock: null });

        // Then
        expect(shown()).toEqual(['bob', 'Inspector', 'ATM: 260 million', 'Account: 112.5 million']);
        expect(host().classList).not.toContain('outline-2');
    });

    test('should show the balance of its player at the end, won by its country or not', async () => {
        // When
        await show({ name: 'bob', atm: 0, account: 300, balance: { key: 'contraband.table.seat.balance', params: { sign: 'plus', amount: 75 } }, winning: true });

        // Then
        expect(host().querySelector('.badge-win')?.textContent?.trim()).toEqual('+75 million');

        // When
        await show({ balance: { key: 'contraband.table.seat.balance', params: { sign: 'minus', amount: 12.5 } }, winning: false });

        // Then
        expect(host().querySelector('.badge-draw')?.textContent?.trim()).toEqual('−12.5 million');

        // When
        await show({ balance: { key: 'contraband.table.seat.balance', params: { sign: 'zero', amount: 0 } } });

        // Then
        expect(host().querySelector('.badge-draw')?.textContent?.trim()).toEqual('0 million');
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
