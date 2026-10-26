import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { RouletteSeatComponent, SeatShot } from './roulette-seat.component';

describe('RouletteSeatComponent', () => {
    let fixture: ComponentFixture<RouletteSeatComponent>;

    const text = (): string => fixture.nativeElement.textContent.replace(/\s+/g, ' ').trim();
    const button = (): HTMLButtonElement => fixture.nativeElement.querySelector('button');

    beforeEach(async () => {
        fixture = TestBed.createComponent(RouletteSeatComponent);
        fixture.componentRef.setInput('name', 'alice');
        fixture.componentRef.setInput('chips', 150);
        fixture.componentRef.setInput('turnTime', 45);
        await fixture.whenStable();
    });

    test('should show the player, its chips and its deaths', async () => {
        // Then
        expect(text()).toEqual('alice150 chips0 deaths');

        // When a debt
        fixture.componentRef.setInput('chips', -31);
        fixture.componentRef.setInput('deaths', 3);
        await fixture.whenStable();

        // Then
        expect(text()).toEqual('alice-31 chips3 deaths');
        expect(fixture.nativeElement.querySelectorAll('.chip')).toHaveLength(0);
        expect(fixture.nativeElement.querySelector('.text-app-death')?.textContent).toEqual('3 deaths');
    });

    test('should show the clock of the player the game waits for', async () => {
        // When
        fixture.componentRef.setInput('acting', true);
        fixture.componentRef.setInput('timeLeft', 4);
        await fixture.whenStable();

        // Then
        expect(fixture.nativeElement.querySelector('.seat').classList).toContain('acting');
        expect(text()).toContain('4 s');
        expect(fixture.nativeElement.querySelector('.text-app-clock-low')).not.toBeNull();
        expect((fixture.nativeElement.querySelector('.turn-clock') as HTMLElement).style.width).toEqual(`${ 4 / 45 * 100 }%`);
    });

    test('should stamp the pass of the player, until its animation ends', async () => {
        // Given
        const stamped = vi.fn();
        fixture.componentInstance.stamped.subscribe(stamped);

        // When
        fixture.componentRef.setInput('passed', 4);
        await fixture.whenStable();

        // Then
        const stamp: HTMLElement = fixture.nativeElement.querySelector('.pass-stamp');
        expect(stamp.textContent?.trim()).toEqual('Pass (4)');
        expect(stamp.getAttribute('aria-hidden')).toEqual('true');

        // When an animation inside it ends, then its own
        stamp.appendChild(document.createElement('span')).dispatchEvent(new Event('animationend', { bubbles: true }));
        expect(stamped).not.toHaveBeenCalled();
        stamp.dispatchEvent(new Event('animationend'));

        // Then
        expect(stamped).toHaveBeenCalledTimes(1);
    });

    test.each<[SeatShot]>([[SeatShot.DEATH], [SeatShot.EMPTY]])('should show the shot of the player: %s', async (shot: SeatShot) => {
        // When
        fixture.componentRef.setInput('shot', shot);
        await fixture.whenStable();

        // Then
        expect(fixture.nativeElement.querySelector('.seat').classList).toContain(`shot-${ shot }`);
    });

    test('should tell where its name and its chips lie, the seat itself while free', async () => {
        // Then
        expect(fixture.componentInstance.namePlace().textContent).toEqual('alice');
        expect(fixture.componentInstance.seatPlace()).toBe(fixture.nativeElement);
        expect(fixture.componentInstance.chipsPlace().tagName).toEqual('APP-CHIP-STACK');

        // When
        fixture.componentRef.setInput('name', null);
        await fixture.whenStable();

        // Then
        expect(fixture.componentInstance.chipsPlace()).toBe(fixture.nativeElement);
    });

    test.each<[string, string, 'take' | 'leave' | 'release']>([
        ['canTake', 'Sit here', 'take'],
        ['canLeave', 'Leave the seat', 'leave'],
        ['canRelease', 'Free the seat', 'release'],
    ])('should offer %s', async (input: string, label: string, output: 'take' | 'leave' | 'release') => {
        // Given
        const emitted = vi.fn();
        fixture.componentInstance[output].subscribe(emitted);
        fixture.componentRef.setInput('name', input === 'canTake' ? null : 'alice');
        fixture.componentRef.setInput(input, true);
        await fixture.whenStable();

        // When
        button().click();

        // Then
        expect(button().textContent?.trim()).toEqual(label);
        expect(emitted).toHaveBeenCalled();
        if (input === 'canTake') {
            expect(text()).toEqual('Free seatSit here');
        }
    });
});
