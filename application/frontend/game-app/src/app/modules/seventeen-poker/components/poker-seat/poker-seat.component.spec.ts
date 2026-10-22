import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { PokerSeatComponent } from './poker-seat.component';

describe('PokerSeatComponent', () => {
    let fixture: ComponentFixture<PokerSeatComponent>;

    const text = (): string => (fixture.nativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ').trim() ?? '';
    const button = (): HTMLButtonElement | null => fixture.nativeElement.querySelector('button');

    beforeEach(async () => {
        fixture = TestBed.createComponent(PokerSeatComponent);
        fixture.componentRef.setInput('name', null);
        fixture.componentRef.setInput('chips', 150);
        await fixture.whenStable();
    });

    test('should show a free seat', () => {
        expect(text()).toEqual('Free seat');
        expect(button()).toBeNull();
    });

    test('should take the seat with its button', async () => {
        // Given
        const take = vi.fn();
        fixture.componentInstance.take.subscribe(take);
        fixture.componentRef.setInput('canTake', true);
        await fixture.whenStable();

        // When
        button()?.click();

        // Then
        expect(button()?.textContent?.trim()).toEqual('Sit here');
        expect(take).toHaveBeenCalledTimes(1);
    });

    test('should show its player, its chips and its bet, a ring while it acts', async () => {
        // Given
        const leave = vi.fn();
        fixture.componentInstance.leave.subscribe(leave);

        // When
        fixture.componentRef.setInput('name', 'alice');
        fixture.componentRef.setInput('chips', 1);
        fixture.componentRef.setInput('bet', 12);
        fixture.componentRef.setInput('acting', true);
        fixture.componentRef.setInput('canLeave', true);
        await fixture.whenStable();
        button()?.click();

        // Then
        expect(text()).toEqual('alice1 chip Bet 12 Leave the seat');
        expect(fixture.nativeElement.querySelector('.seat').classList).toContain('acting');
        expect(leave).toHaveBeenCalledTimes(1);
    });
});
