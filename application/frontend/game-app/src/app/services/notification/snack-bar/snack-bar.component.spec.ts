import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_SNACK_BAR_DATA } from '@angular/material/snack-bar';
import { SnackBarComponent } from './snack-bar.component';
import { beforeEach, describe, expect, test } from 'vitest';

describe('SnackBarComponent', () => {
    let fixture: ComponentFixture<SnackBarComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [SnackBarComponent],
            providers: [{ provide: MAT_SNACK_BAR_DATA, useValue: { content: '<b>Hello</b>' } }],
        }).compileComponents();

        fixture = TestBed.createComponent(SnackBarComponent);
        await fixture.whenStable();
    });

    test('should render the content as html', () => {
        const content: HTMLElement = fixture.nativeElement.querySelector('#custom-snack-bar');

        expect(content.querySelector('b')?.textContent).toEqual('Hello');
    });
});
