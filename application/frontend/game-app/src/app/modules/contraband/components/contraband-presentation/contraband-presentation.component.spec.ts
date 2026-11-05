import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, test } from 'vitest';
import { ContrabandPresentationComponent } from './contraband-presentation.component';

describe('ContrabandPresentationComponent', () => {
    let fixture: ComponentFixture<ContrabandPresentationComponent>;

    beforeEach(async () => {
        fixture = TestBed.createComponent(ContrabandPresentationComponent);
        await fixture.whenStable();
    });

    test('should describe the game', () => {
        expect(fixture.nativeElement.querySelector('h1')?.textContent).toEqual('Contraband');
        expect(fixture.nativeElement.querySelectorAll('ul.list-disc li')).toHaveLength(3);
        expect(fixture.nativeElement.textContent).toContain('no one, not even the server, reads a trunk before the inspector calls');
    });
});
