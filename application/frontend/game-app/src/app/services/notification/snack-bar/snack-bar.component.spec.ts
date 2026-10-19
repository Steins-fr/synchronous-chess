import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_SNACK_BAR_DATA } from '@angular/material/snack-bar';
import { Language } from '@app/services/language/enums/language.enum';
import { TranslocoService } from '@jsverse/transloco';
import { SnackBarComponent } from './snack-bar.component';
import { beforeEach, describe, expect, test } from 'vitest';

describe('SnackBarComponent', () => {
    let fixture: ComponentFixture<SnackBarComponent>;

    function content(): HTMLElement {
        return fixture.nativeElement.querySelector('#custom-snack-bar');
    }

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [SnackBarComponent],
            providers: [{ provide: MAT_SNACK_BAR_DATA, useValue: { content: { key: 'rooms.open.host', params: { host: '<b>bob</b>' } } } }],
        }).compileComponents();

        fixture = TestBed.createComponent(SnackBarComponent);
        await fixture.whenStable();
    });

    test('should show its text translated, with its params as text', () => {
        expect(content().textContent).toEqual('Host: <b>bob</b>');
        expect(content().querySelector('b')).toBeNull();
    });

    test('should translate its text again once the language changes', async () => {
        // When
        TestBed.inject(TranslocoService).setActiveLang(Language.FR);
        await fixture.whenStable();

        // Then
        expect(content().textContent).toEqual('Hôte : <b>bob</b>');
    });
});
