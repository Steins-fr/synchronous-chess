import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { PageVisibilityService } from './page-visibility.service';

describe('PageVisibilityService', () => {
    function hide(hidden: boolean): void {
        vi.spyOn(document, 'hidden', 'get').mockReturnValue(hidden);
        document.dispatchEvent(new Event('visibilitychange'));
    }

    afterEach(() => {
        vi.restoreAllMocks();
    });

    test('should tell the page is visible, until hidden, then visible again', () => {
        // Given
        const service: PageVisibilityService = TestBed.inject(PageVisibilityService);

        // Then
        expect(service.visible()).toBe(true);

        // When
        hide(true);

        // Then
        expect(service.visible()).toBe(false);

        // When
        hide(false);

        // Then
        expect(service.visible()).toBe(true);
    });

    test('should tell a page opened hidden is not visible', () => {
        // Given
        vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);

        // When
        const service: PageVisibilityService = TestBed.inject(PageVisibilityService);

        // Then
        expect(service.visible()).toBe(false);
    });

    test('should stop listening to the page once destroyed', () => {
        // Given
        const service: PageVisibilityService = TestBed.inject(PageVisibilityService);

        // When
        TestBed.resetTestingModule();
        hide(true);

        // Then
        expect(service.visible()).toBe(true);
    });
});
