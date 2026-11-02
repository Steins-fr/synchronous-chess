import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, test } from 'vitest';
import { BidPresentationComponent } from './bid-presentation.component';

describe('BidPresentationComponent', () => {
    let fixture: ComponentFixture<BidPresentationComponent>;

    beforeEach(async () => {
        fixture = TestBed.createComponent(BidPresentationComponent);
        await fixture.whenStable();
    });

    test('should describe the game', () => {
        expect(fixture.nativeElement.querySelector('h1')?.textContent).toEqual('Bid poker');
        expect(fixture.nativeElement.querySelectorAll('ul.list-disc li')).toHaveLength(3);
        expect(fixture.nativeElement.textContent).toContain('no one, not even the server, sees a bid before the auction of its lot closes');
    });
});
