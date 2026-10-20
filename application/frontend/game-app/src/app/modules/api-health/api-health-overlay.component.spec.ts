import { signal, WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Navigation, Router } from '@angular/router';
import { LOADER_DELAY } from '@app/helpers/signal.helper';
import { ApiHealthState } from '@app/services/api-health/api-health-state.enum';
import { ApiHealthService } from '@app/services/api-health/api-health.service';
import { TestHelper } from '@testing/test.helper';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ApiHealthOverlayComponent } from './api-health-overlay.component';

describe('ApiHealthOverlayComponent', () => {
    let state: WritableSignal<ApiHealthState>;
    let navigation: WritableSignal<Navigation | null>;
    let fixture: ComponentFixture<ApiHealthOverlayComponent>;

    function overlay(): HTMLElement | null {
        return fixture.nativeElement.querySelector('output');
    }

    // Renders the overlay once the time passed
    async function wait(delay: number = 0): Promise<void> {
        fixture.detectChanges();
        await vi.advanceTimersByTimeAsync(delay);
        fixture.detectChanges();
    }

    beforeEach(async () => {
        vi.useFakeTimers();
        state = signal<ApiHealthState>(ApiHealthState.IDLE);
        navigation = signal<Navigation | null>(null);
        TestBed.configureTestingModule({
            providers: [
                { provide: ApiHealthService, useValue: TestHelper.cast<ApiHealthService>({ state }) },
                { provide: Router, useValue: TestHelper.cast<Router>({ currentNavigation: navigation }) },
            ],
        });
        fixture = TestBed.createComponent(ApiHealthOverlayComponent);
        await wait();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    test('should show nothing while no page waits for the APIs', () => {
        expect(overlay()).toBeNull();
    });

    test('should show nothing while a page waits for the APIs a short time', async () => {
        // When
        state.set(ApiHealthState.CHECKING);
        await wait(LOADER_DELAY - 1);

        // Then
        expect(overlay()).toBeNull();

        // When
        state.set(ApiHealthState.IDLE);
        await wait(LOADER_DELAY);

        // Then
        expect(overlay()).toBeNull();
    });

    test('should tell it connects to the server, then that the server boots once long', async () => {
        // When
        state.set(ApiHealthState.CHECKING);
        await wait(LOADER_DELAY);

        // Then
        expect(overlay()?.querySelector('mat-spinner')).not.toBeNull();
        expect(overlay()?.textContent).toContain('Connecting to the server…');

        // When
        state.set(ApiHealthState.BOOTING);
        await wait();

        // Then
        expect(overlay()?.textContent).toContain('Starting the server…');
        expect(overlay()?.textContent).toContain('The server and its database sleep when nobody plays');
        expect(overlay()?.textContent).not.toContain('Connecting to the server…');
    });

    test('should stay until the page shows once the APIs are up, telling it loads the page', async () => {
        // Given
        navigation.set(TestHelper.cast<Navigation>({}));
        state.set(ApiHealthState.CHECKING);
        await wait();

        // When
        state.set(ApiHealthState.IDLE);
        await wait(LOADER_DELAY);

        // Then
        expect(overlay()?.querySelector('mat-spinner')).not.toBeNull();
        expect(overlay()?.textContent).toContain('Loading the page…');
        expect(overlay()?.textContent).not.toContain('Connecting to the server…');

        // When
        navigation.set(null);
        await wait();

        // Then
        expect(overlay()).toBeNull();
    });

    test('should show nothing while a page loads without waiting for the APIs', async () => {
        // When
        navigation.set(TestHelper.cast<Navigation>({}));
        await wait(LOADER_DELAY);

        // Then
        expect(overlay()).toBeNull();
    });
});
