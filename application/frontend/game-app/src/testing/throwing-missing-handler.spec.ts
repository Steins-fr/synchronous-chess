import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { describe, expect, test } from 'vitest';

describe('ThrowingMissingHandler', () => {
    test('should fail on a key missing from the translation, and translate the others', () => {
        // Given
        const transloco: TranslocoService = TestBed.inject(TranslocoService);
        const missingKey = 'app.missing';

        // When, Then
        expect(transloco.translate('app.title')).toBe('Synchronous Chess');
        expect(() => transloco.translate(missingKey)).toThrow('The key \'app.missing\' is missing from the translation \'en\'');
    });
});
