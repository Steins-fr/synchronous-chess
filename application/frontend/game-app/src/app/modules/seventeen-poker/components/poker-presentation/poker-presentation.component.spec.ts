import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, test } from 'vitest';
import { PokerPresentationComponent } from './poker-presentation.component';

describe('PokerPresentationComponent', () => {
    let fixture: ComponentFixture<PokerPresentationComponent>;

    beforeEach(async () => {
        fixture = TestBed.createComponent(PokerPresentationComponent);
        await fixture.whenStable();
    });

    test('should describe the game', () => {
        expect(fixture.nativeElement.querySelector('h1')?.textContent).toEqual('Seventeen poker');
        expect(fixture.nativeElement.querySelectorAll('li')).toHaveLength(3);
    });
});
