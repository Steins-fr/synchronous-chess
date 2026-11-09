import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, test } from 'vitest';
import { Apple } from '../../classes/rules/eden-rules';
import { EdenAppleComponent } from './eden-apple.component';

describe('EdenAppleComponent', () => {
    let fixture: ComponentFixture<EdenAppleComponent>;

    beforeEach(() => {
        fixture = TestBed.createComponent(EdenAppleComponent);
    });

    test.each([
        [Apple.GOLD, 'text-app-apple-gold'],
        [Apple.SILVER, 'text-app-apple-silver'],
        [Apple.RED, 'text-app-apple-red'],
    ])('should draw the %s apple in its color, hidden from the screen readers', async (apple: Apple, color: string) => {
        // When
        fixture.componentRef.setInput('apple', apple);
        await fixture.whenStable();

        // Then
        const host: HTMLElement = fixture.nativeElement;
        expect(Array.from(host.classList).filter((name: string) => name.startsWith('text-app-apple'))).toEqual([color]);
        expect(host.getAttribute('aria-hidden')).toEqual('true');
        expect(host.querySelector('svg')).not.toBeNull();
    });
});
