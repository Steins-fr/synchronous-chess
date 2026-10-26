import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { REVOLVER_HOLD, RevolverShot, RouletteRevolverComponent } from './roulette-revolver.component';

describe('RouletteRevolverComponent', () => {
    let fixture: ComponentFixture<RouletteRevolverComponent>;
    let blasts: ReturnType<typeof vi.fn<() => void>>;
    let ends: ReturnType<typeof vi.fn<() => void>>;

    const host = (): HTMLElement => fixture.nativeElement;
    const body = (): Element => host().querySelector('.revolver-body') as Element;

    async function set(name: 'aiming' | 'shot', value: unknown): Promise<void> {
        fixture.componentRef.setInput(name, value);
        await fixture.whenStable();
    }

    async function elapse(ms: number): Promise<void> {
        vi.advanceTimersByTime(ms);
        await fixture.whenStable();
    }

    beforeEach(async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
        fixture = TestBed.createComponent(RouletteRevolverComponent);
        blasts = vi.fn<() => void>();
        ends = vi.fn<() => void>();
        fixture.componentInstance.blast.subscribe(blasts);
        fixture.componentInstance.fired.subscribe(ends);
        await fixture.whenStable();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    test('should lie still, hidden from screen readers, 3.5 seconds of hold by default', () => {
        expect(host().getAttribute('aria-hidden')).toEqual('true');
        expect(Array.from(host().classList)).toEqual([]);
        expect(TestBed.inject(REVOLVER_HOLD)).toEqual(3500);
    });

    test.each<[RevolverShot, string]>([[RevolverShot.EMPTY, 'fire-empty'], [RevolverShot.BULLET, 'fire-bullet']])('should aim, hold still whatever the chamber, then fire %s', async (shot: RevolverShot, fired: string) => {
        // Given
        await set('aiming', true);
        await elapse(1000);

        // When the chamber is known
        await set('shot', { kind: shot });

        // Then the revolver holds 3.5 seconds from when it started aiming, looking the same
        expect(Array.from(host().classList)).toEqual(['aiming']);
        await elapse(2499);
        expect(Array.from(host().classList)).toEqual(['aiming']);
        expect(blasts).not.toHaveBeenCalled();

        // When
        await elapse(1);

        // Then
        expect(host().classList).toContain(fired);
        expect(blasts).toHaveBeenCalledTimes(1);

        // When the animations of its parts end, then the one of its body
        host().querySelector('.hammer')?.dispatchEvent(new Event('animationend', { bubbles: true }));
        expect(ends).not.toHaveBeenCalled();
        body().dispatchEvent(new Event('animationend'));

        // Then
        expect(ends).toHaveBeenCalledTimes(1);

        // When the table takes the revolver back
        await set('shot', null);
        await set('aiming', false);

        // Then
        expect(Array.from(host().classList)).toEqual([]);
    });

    test('should hold from when the chamber is known, the revolver not aiming before', async () => {
        // When
        await set('shot', { kind: RevolverShot.EMPTY });
        await elapse(3499);

        // Then
        expect(blasts).not.toHaveBeenCalled();
        await elapse(1);
        expect(blasts).toHaveBeenCalledTimes(1);
    });

    test('should hold again, then fire again, a shot replacing the one fired, of the same chamber', async () => {
        // Given a shot fired
        await set('aiming', true);
        await set('shot', { kind: RevolverShot.EMPTY });
        await elapse(3500);
        body().dispatchEvent(new Event('animationend'));
        expect(ends).toHaveBeenCalledTimes(1);

        // When another empty chamber comes, the revolver aiming all along
        await set('shot', { kind: RevolverShot.EMPTY });

        // Then it holds 3.5 seconds again, looking as before it fired
        expect(Array.from(host().classList)).toEqual(['aiming']);
        await elapse(3499);
        expect(blasts).toHaveBeenCalledTimes(1);
        await elapse(1);
        expect(blasts).toHaveBeenCalledTimes(2);
        expect(host().classList).toContain('fire-empty');

        // When
        body().dispatchEvent(new Event('animationend'));

        // Then
        expect(ends).toHaveBeenCalledTimes(2);
    });

    test('should hold again once a shot ended, the revolver aiming at the next player shooting meanwhile', async () => {
        // Given a shot fired, then ended
        await set('aiming', true);
        await set('shot', { kind: RevolverShot.BULLET });
        await elapse(3500);
        body().dispatchEvent(new Event('animationend'));
        await elapse(1000);

        // When the revolver aims at the next player, without going back to the cloth
        await set('shot', null);
        await elapse(1000);
        await set('shot', { kind: RevolverShot.EMPTY });

        // Then it holds 3.5 seconds from when it aimed at the next player
        await elapse(2499);
        expect(blasts).toHaveBeenCalledTimes(1);
        await elapse(1);
        expect(blasts).toHaveBeenCalledTimes(2);
    });

    test('should end no shot while it only trembles, nor a shot dropped before it fired', async () => {
        // Given
        await set('aiming', true);
        await set('shot', { kind: RevolverShot.BULLET });

        // When
        body().dispatchEvent(new Event('animationend'));
        await set('shot', null);
        await elapse(5000);

        // Then
        expect(ends).not.toHaveBeenCalled();
        expect(blasts).not.toHaveBeenCalled();
    });
});
