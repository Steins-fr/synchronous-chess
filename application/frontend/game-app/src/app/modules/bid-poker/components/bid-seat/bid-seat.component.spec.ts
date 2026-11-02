import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CardRank, CardSuit } from '@app/modules/playing-cards/types/playing-card';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { BidSeatComponent } from './bid-seat.component';

describe('BidSeatComponent', () => {
    let fixture: ComponentFixture<BidSeatComponent>;

    const host = (): HTMLElement => fixture.nativeElement;
    const text = (): string => host().textContent?.replace(/\s+/g, ' ').trim() ?? '';
    const button = (label: string): HTMLButtonElement | undefined =>
        Array.from(host().querySelectorAll<HTMLButtonElement>('button')).find((candidate: HTMLButtonElement) => candidate.textContent?.trim() === label);

    async function show(inputs: Record<string, unknown>): Promise<void> {
        Object.entries(inputs).forEach(([name, value]) => fixture.componentRef.setInput(name, value));
        await fixture.whenStable();
    }

    beforeEach(async () => {
        fixture = TestBed.createComponent(BidSeatComponent);
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
        expect(host().querySelector('app-card-hand')).toBeNull();
    });

    test('should show its player, its coins, its cards and what the game tells of it', async () => {
        // When
        await show({
            name: 'bob', coins: 290, cards: [{ id: 'card-0', card: { rank: CardRank.TWO, suit: CardSuit.SPADES } }],
            awaited: true, sealed: true, absent: true, timeLeft: 4, standing: { key: 'bid.table.result.pig' },
        });

        // Then
        expect(text()).toContain('bob');
        expect(text()).toContain('290 coins');
        expect(text()).toContain('Sealed');
        expect(text()).toContain('Skipped');
        const pig: Element | undefined = Array.from(host().querySelectorAll('.badge')).find((badge: Element) => badge.textContent?.trim() === 'Pig');
        expect(pig?.classList).toContain('badge-draw');
        expect(host().querySelector('.badge-win')).toBeNull();
        expect(host().querySelector('.tabular-nums')?.classList).toContain('text-app-clock-low');
        expect(host().classList).toContain('outline-2');
        expect(host().querySelectorAll('app-playing-card')).toHaveLength(1);
        expect(host().querySelector('app-chip-stack')).not.toBeNull();
    });

    test('should show the standing of a player winning a prize as a win', async () => {
        // When
        await show({ name: 'bob', coins: 340, standing: { key: 'bid.table.result.place', params: { place: 1 } }, winning: true });

        // Then
        expect(host().querySelector('.badge-win')?.textContent?.trim()).toEqual('Place 1');
        expect(host().querySelector('.badge-draw')).toBeNull();
    });

    test('should show no chips for a player without coins', async () => {
        // When
        await show({ name: 'bob', coins: 0 });

        // Then
        expect(text()).toContain('0 coins');
        expect(host().querySelector('app-chip-stack')).toBeNull();
    });

    test('should let the local player pick its cards, leave its seat, and free the seat of a player away', async () => {
        // Given
        const leave = vi.fn();
        const release = vi.fn();
        fixture.componentInstance.leave.subscribe(leave);
        fixture.componentInstance.release.subscribe(release);
        await show({ name: 'alice', coins: 300, cards: [{ id: 'card-1', card: { rank: CardRank.TEN, suit: CardSuit.HEARTS } }], selectable: true, canLeave: true, canRelease: true });

        // When
        host().querySelector<HTMLButtonElement>('app-card-hand button')?.click();
        button('Leave')?.click();
        button('Free the seat')?.click();

        // Then
        expect(fixture.componentInstance.selected()).toEqual(['card-1']);
        expect([leave, release].map((spy) => spy.mock.calls.length)).toEqual([1, 1]);
    });
});
