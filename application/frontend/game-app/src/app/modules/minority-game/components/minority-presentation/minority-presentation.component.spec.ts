import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, test } from 'vitest';
import { MinorityPresentationComponent } from './minority-presentation.component';

describe('MinorityPresentationComponent', () => {
    let fixture: ComponentFixture<MinorityPresentationComponent>;

    beforeEach(async () => {
        fixture = TestBed.createComponent(MinorityPresentationComponent);
        await fixture.whenStable();
    });

    test('should describe the game', () => {
        expect(fixture.nativeElement.querySelector('h1')?.textContent).toEqual('Minority game');
        expect(fixture.nativeElement.querySelectorAll('ul.list-disc li')).toHaveLength(3);
        expect(fixture.nativeElement.textContent).toContain('no one, not even the server, sees a vote before every player voted');
    });
});
