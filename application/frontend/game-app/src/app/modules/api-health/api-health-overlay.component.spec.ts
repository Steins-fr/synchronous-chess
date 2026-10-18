import { signal, WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ApiHealthState } from '@app/services/api-health/api-health-state.enum';
import { ApiHealthService } from '@app/services/api-health/api-health.service';
import { TestHelper } from '@testing/test.helper';
import { beforeEach, describe, expect, test } from 'vitest';
import { ApiHealthOverlayComponent } from './api-health-overlay.component';

describe('ApiHealthOverlayComponent', () => {
    let state: WritableSignal<ApiHealthState>;
    let fixture: ComponentFixture<ApiHealthOverlayComponent>;

    function overlay(): HTMLElement | null {
        return fixture.nativeElement.querySelector('[role="status"]');
    }

    beforeEach(async () => {
        state = signal<ApiHealthState>(ApiHealthState.IDLE);
        TestBed.configureTestingModule({ providers: [{ provide: ApiHealthService, useValue: TestHelper.cast<ApiHealthService>({ state }) }] });
        fixture = TestBed.createComponent(ApiHealthOverlayComponent);
        await fixture.whenStable();
    });

    test('should show nothing while no page waits for the APIs', () => {
        expect(overlay()).toBeNull();
    });

    test('should tell it connects to the server, then that the server boots once long', async () => {
        // When
        state.set(ApiHealthState.CHECKING);
        await fixture.whenStable();

        // Then
        expect(overlay()?.querySelector('mat-spinner')).not.toBeNull();
        expect(overlay()?.textContent).toContain('Connexion au serveur…');

        // When
        state.set(ApiHealthState.BOOTING);
        await fixture.whenStable();

        // Then
        expect(overlay()?.textContent).toContain('Démarrage du serveur…');
        expect(overlay()?.textContent).toContain('Le serveur et sa base de données se mettent en veille quand personne ne joue');
        expect(overlay()?.textContent).not.toContain('Connexion au serveur…');
    });
});
