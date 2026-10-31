import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ReducedMotionService } from './reduced-motion.service';

describe('ReducedMotionService', () => {
    let reducedMotion: EventTarget & { matches: boolean };

    beforeEach(() => {
        reducedMotion = Object.assign(new EventTarget(), { matches: false });
        vi.spyOn(globalThis, 'matchMedia').mockReturnValue(reducedMotion as unknown as MediaQueryList);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    test('should tell whether the user asks for less motion, following the system', () => {
        // When
        const service: ReducedMotionService = TestBed.inject(ReducedMotionService);

        // Then
        expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
        expect(service.reduced()).toBe(false);

        // When
        reducedMotion.matches = true;
        reducedMotion.dispatchEvent(new Event('change'));

        // Then
        expect(service.reduced()).toBe(true);
    });
});
