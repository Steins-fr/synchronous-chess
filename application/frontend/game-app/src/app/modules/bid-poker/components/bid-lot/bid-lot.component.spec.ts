import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CardRank, CardSuit } from '@app/modules/playing-cards/types/playing-card';
import { beforeEach, describe, expect, test } from 'vitest';
import { BidLotComponent } from './bid-lot.component';

describe('BidLotComponent', () => {
    let fixture: ComponentFixture<BidLotComponent>;

    const text = (): string => fixture.nativeElement.textContent.replace(/\s+/g, ' ').trim();

    beforeEach(async () => {
        fixture = TestBed.createComponent(BidLotComponent);
        fixture.componentRef.setInput('name', { key: 'bid.table.lot.name', params: { letter: 'B' } });
        fixture.componentRef.setInput('seller', { key: 'bid.table.lot.seller', params: { name: 'bob' } });
        fixture.componentRef.setInput('cards', [{ id: 'card-0', card: { rank: CardRank.ACE, suit: CardSuit.CLUBS } }]);
        await fixture.whenStable();
    });

    test('should show its name, its seller and its cards, outlined while auctioned', async () => {
        // Then
        expect(text()).toContain('Lot B · from bob');
        expect(fixture.nativeElement.querySelectorAll('app-playing-card')).toHaveLength(1);
        expect(fixture.nativeElement.classList).not.toContain('outline-2');

        // When
        fixture.componentRef.setInput('current', true);
        fixture.componentRef.setInput('outcome', { key: 'bid.table.lot.sold', params: { name: 'carol', price: 12 } });
        await fixture.whenStable();

        // Then
        expect(fixture.nativeElement.classList).toContain('outline-2');
        expect(text()).toContain('To carol for 12 coins');
    });
});
