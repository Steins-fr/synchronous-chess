import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SoundEffect } from '@app/services/sound/enums/sound-effect.enum';
import { SoundService } from '@app/services/sound/sound.service';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { RouletteCylinderComponent } from './roulette-cylinder.component';

describe('RouletteCylinderComponent', () => {
    let fixture: ComponentFixture<RouletteCylinderComponent>;

    const element = (): HTMLElement => fixture.nativeElement;
    const buttons = (): HTMLButtonElement[] => Array.from(element().querySelectorAll('button'));
    const labels = (): string[] => Array.from(element().querySelectorAll('[role="img"]'), (chamber: Element) => chamber.getAttribute('aria-label') as string);

    beforeEach(async () => {
        fixture = TestBed.createComponent(RouletteCylinderComponent);
        fixture.componentRef.setInput('chambers', 24);
        fixture.componentRef.setInput('bullets', 3);
        await fixture.whenStable();
    });

    test('should show the chambers around the cylinder, hidden', () => {
        expect(element().querySelector('[role="group"]')?.getAttribute('aria-label')).toEqual('Cylinder');
        expect(labels()).toHaveLength(24);
        expect(labels()[0]).toEqual('Chamber 1');
        expect((element().querySelectorAll('.chamber')[6] as HTMLElement).style.getPropertyValue('--angle')).toEqual('90deg');
        expect(buttons()).toEqual([]);
    });

    test('should show larger while the players load it', async () => {
        // When
        fixture.componentRef.setInput('large', true);
        await fixture.whenStable();

        // Then
        expect(element().classList).toContain('large');
    });

    test('should let the player pick the chambers of its bullets, no more than its bullets, a bullet put sounding', async () => {
        // Given
        fixture.componentRef.setInput('selectable', true);
        await fixture.whenStable();
        const play = vi.spyOn(TestBed.inject(SoundService), 'play');

        // When
        [4, 0, 9].forEach((index: number) => buttons()[index].click());
        await fixture.whenStable();

        // Then
        expect(fixture.componentInstance.selected()).toEqual([0, 4, 9]);
        expect(buttons()[4].getAttribute('aria-pressed')).toEqual('true');
        expect(buttons()[4].getAttribute('aria-label')).toEqual('Chamber 5');
        expect(buttons()[1].disabled).toBe(true);
        expect(buttons()[4].disabled).toBe(false);
        expect(play.mock.calls).toEqual([[SoundEffect.ROULETTE_BULLET], [SoundEffect.ROULETTE_BULLET], [SoundEffect.ROULETTE_BULLET]]);

        // When a fourth chamber, then a chamber picked again
        buttons()[1].dispatchEvent(new Event('click'));
        buttons()[4].click();
        await fixture.whenStable();

        // Then: neither the fourth bullet nor the bullet taken out sounds
        expect(fixture.componentInstance.selected()).toEqual([0, 9]);
        expect(buttons()[1].disabled).toBe(false);
        expect(play).toHaveBeenCalledTimes(3);
    });

    test('should show the bullets loaded until the spins, then the chambers fired, the cylinder turned', async () => {
        // Given
        fixture.componentRef.setInput('loaded', [2]);
        fixture.componentRef.setInput('spinning', true);
        await fixture.whenStable();

        // Then
        expect(labels()[2]).toEqual('Chamber 3: your bullet');
        expect(element().querySelector('.cylinder')?.classList).toContain('spinning');

        // When
        fixture.componentRef.setInput('loaded', []);
        fixture.componentRef.setInput('spinning', false);
        fixture.componentRef.setInput('fired', [0, 1, 2]);
        await fixture.whenStable();

        // Then
        expect(labels().slice(0, 4)).toEqual(['Chamber 1: empty', 'Chamber 2: a bullet', 'Chamber 3: two bullets', 'Chamber 4']);
        expect(element().querySelectorAll('.chamber')[2].textContent?.trim()).toEqual('2');
        expect((element().querySelector('.cylinder-body') as HTMLElement).style.getPropertyValue('--turn')).toEqual('-45deg');
    });
});
