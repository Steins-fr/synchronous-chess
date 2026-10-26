import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, test } from 'vitest';
import { RoulettePresentationComponent } from './roulette-presentation.component';

describe('RoulettePresentationComponent', () => {
    let fixture: ComponentFixture<RoulettePresentationComponent>;

    beforeEach(async () => {
        fixture = TestBed.createComponent(RoulettePresentationComponent);
        await fixture.whenStable();
    });

    test('should describe the game', () => {
        expect(fixture.nativeElement.querySelector('h1')?.textContent).toEqual('Russian roulette');
        expect(fixture.nativeElement.querySelectorAll('ul.list-disc li')).toHaveLength(3);
    });
});
