import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, test } from 'vitest';
import { EdenPresentationComponent } from './eden-presentation.component';

describe('EdenPresentationComponent', () => {
    let fixture: ComponentFixture<EdenPresentationComponent>;

    beforeEach(async () => {
        fixture = TestBed.createComponent(EdenPresentationComponent);
        await fixture.whenStable();
    });

    test('should describe the game', () => {
        expect(fixture.nativeElement.querySelector('h1')?.textContent).toEqual('Garden of Eden');
        expect(fixture.nativeElement.querySelectorAll('ul.list-disc li')).toHaveLength(3);
        expect(fixture.nativeElement.textContent).toContain('no one, not even the server, sees an apple before every player picked one');
    });
});
