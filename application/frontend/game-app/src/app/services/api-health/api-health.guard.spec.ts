import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { TestHelper } from '@testing/test.helper';
import { Observable, of } from 'rxjs';
import { describe, expect, test } from 'vitest';
import { apiHealthGuard } from './api-health.guard';
import { ApiHealthService } from './api-health.service';

describe('apiHealthGuard', () => {
    test('should let the page show once the APIs are up', () => {
        // Given
        const up$: Observable<true> = of(true);
        TestBed.configureTestingModule({ providers: [{ provide: ApiHealthService, useValue: TestHelper.cast<ApiHealthService>({ ensureUp: () => up$ }) }] });

        // When
        const guarded: unknown = TestBed.runInInjectionContext(() => apiHealthGuard(
            TestHelper.cast<ActivatedRouteSnapshot>({}),
            TestHelper.cast<RouterStateSnapshot>({}),
        ));

        // Then
        expect(guarded).toBe(up$);
    });
});
