import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, test } from 'vitest';
import { FixedPresentationComponent } from './fixed-presentation.component';

describe('FixedPresentationComponent', () => {
    let fixture: ComponentFixture<FixedPresentationComponent>;

    beforeEach(async () => {
        fixture = TestBed.createComponent(FixedPresentationComponent);
        await fixture.whenStable();
    });

    test('should describe the game', () => {
        expect(fixture.nativeElement.querySelector('h1')?.textContent).toEqual('Fixed roulette');
        expect(fixture.nativeElement.querySelectorAll('ul.list-disc li')).toHaveLength(3);
        expect(fixture.nativeElement.textContent).toContain('no one, not even the server, sees the pocket of the ball before the punter bet');
    });
});
