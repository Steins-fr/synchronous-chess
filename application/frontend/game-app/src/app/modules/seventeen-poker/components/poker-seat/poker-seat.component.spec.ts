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
        expect(fixture.componentInstance.chipsPlace()).toBe(fixture.nativeElement);
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

    test('should show its player, its chips and what it won, a ring while it acts', async () => {
        // Given
        const leave = vi.fn();
        fixture.componentInstance.leave.subscribe(leave);

        // When
        fixture.componentRef.setInput('name', 'alice');
        fixture.componentRef.setInput('chips', 1);
        fixture.componentRef.setInput('gain', 12);
        fixture.componentRef.setInput('acting', true);
        fixture.componentRef.setInput('canLeave', true);
        await fixture.whenStable();
        button()?.click();

        // Then
        expect(text()).toEqual('alice1 chip +12 Leave the seat');
        expect(fixture.nativeElement.querySelectorAll('app-chip-stack .chip')).toHaveLength(1);
        expect(fixture.componentInstance.chipsPlace()).toBe(fixture.nativeElement.querySelector('app-chip-stack'));
        expect(fixture.nativeElement.querySelector('.seat').classList).toContain('acting');
        expect(leave).toHaveBeenCalledTimes(1);
    });

    test('should show the clock of the move of its player, running out from 5 seconds', async () => {
        // Given
        const clock = (): HTMLElement | null => fixture.nativeElement.querySelector('.turn-clock');
        const seconds = (): HTMLElement => fixture.nativeElement.querySelector('.tabular-nums');
        fixture.componentRef.setInput('name', 'alice');
        fixture.componentRef.setInput('acting', true);
        fixture.componentRef.setInput('turnTime', 10);

        // When
        fixture.componentRef.setInput('timeLeft', 6);
        await fixture.whenStable();

        // Then
        expect(text()).toEqual('alice150 chips6 s');
        expect(clock()?.style.width).toEqual('60%');
        expect(seconds().classList).not.toContain('text-app-clock-low');

        // When
        fixture.componentRef.setInput('timeLeft', 5);
        await fixture.whenStable();

        // Then
        expect(clock()?.style.width).toEqual('50%');
        expect(seconds().classList).toContain('text-app-clock-low');

        // When: a player away gave the move more time
        fixture.componentRef.setInput('timeLeft', 15);
        await fixture.whenStable();

        // Then
        expect(clock()?.style.width).toEqual('100%');

        // When: the turn is over
        fixture.componentRef.setInput('timeLeft', null);
        await fixture.whenStable();

        // Then
        expect(text()).toEqual('alice150 chips');
        expect(clock()).toBeNull();
    });
});
