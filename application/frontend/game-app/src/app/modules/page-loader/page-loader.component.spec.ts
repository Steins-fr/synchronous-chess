import { signal, WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Navigation, Router } from '@angular/router';
import { LOADER_DELAY } from '@app/helpers/signal.helper';
import { TestHelper } from '@testing/test.helper';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { PageLoaderComponent } from './page-loader.component';

describe('PageLoaderComponent', () => {
    let navigation: WritableSignal<Navigation | null>;
    let fixture: ComponentFixture<PageLoaderComponent>;

    /** The status the screen readers read, always in the page */
    function status(): HTMLElement {
        return fixture.nativeElement.querySelector('output');
    }

    function overlay(): HTMLElement | null {
        return status().querySelector('span');
    }

    // Renders the loader once the time passed
    async function wait(delay: number = 0): Promise<void> {
        fixture.detectChanges();
        await vi.advanceTimersByTimeAsync(delay);
        fixture.detectChanges();
    }

    beforeEach(async () => {
        vi.useFakeTimers();
        navigation = signal<Navigation | null>(null);
        TestBed.configureTestingModule({
            providers: [{ provide: Router, useValue: TestHelper.cast<Router>({ currentNavigation: navigation }) }],
        });
        fixture = TestBed.createComponent(PageLoaderComponent);
        await wait();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    test('should show nothing without navigation, its status in the page, empty', () => {
        expect(overlay()).toBeNull();
        expect(status().textContent.trim()).toBe('');
    });

    test('should show nothing while a quick navigation loads its page', async () => {
        // When
        navigation.set(TestHelper.cast<Navigation>({}));
        await wait(LOADER_DELAY - 1);

        // Then
        expect(overlay()).toBeNull();

        // When
        navigation.set(null);
        await wait(LOADER_DELAY);

        // Then
        expect(overlay()).toBeNull();
    });

    test('should tell it loads the page while a navigation lasts, until the page shows', async () => {
        // When
        navigation.set(TestHelper.cast<Navigation>({}));
        await wait(LOADER_DELAY);

        // Then
        expect(overlay()?.querySelector('mat-spinner')).not.toBeNull();
        expect(status().textContent).toContain('Loading the page…');

        // When
        navigation.set(null);
        await wait();

        // Then
        expect(overlay()).toBeNull();
    });
});
