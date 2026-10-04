import { ApplicationRef, Component, EventEmitter, input, output } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DialogService } from './dialog.service';
import { beforeEach, describe, expect, test } from 'vitest';

@Component({
    selector: 'app-test-dialog',
    template: '<button class="emit" (click)="result.emit(value())">{{ value() }}</button>',
})
class TestDialog {
    public readonly value = input<string>('');
    public readonly result = output<string>();
}

@Component({
    selector: 'app-legacy-dialog',
    template: '<button class="emit" (click)="result.emit(42)">legacy</button>',
})
class LegacyDialog {
    public readonly result = new EventEmitter<number>();
}

@Component({
    selector: 'app-plain-dialog',
    template: '<p class="plain">plain</p>',
})
class PlainDialog {}

describe('DialogService', () => {
    let service: DialogService;

    function overlay(): HTMLElement {
        return document.querySelector('.cdk-overlay-container') as HTMLElement;
    }

    async function render(): Promise<void> {
        await TestBed.inject(ApplicationRef).whenStable();
    }

    function pressKey(key: string): void {
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    }

    beforeEach(() => {
        service = TestBed.inject(DialogService);
    });

    test('open should display the component and resolve with its result', async () => {
        // Given
        const result: Promise<string | void> = service.open(TestDialog, { title: 'My title', inputs: { value: 'chosen' } });
        await render();

        // Then
        expect(overlay().querySelector('h1')?.textContent).toEqual('My title');
        expect(overlay().querySelector('.emit')?.textContent).toEqual('chosen');

        // When
        (overlay().querySelector('.emit') as HTMLButtonElement).click();

        // Then
        await expect(result).resolves.toEqual('chosen');
        expect(overlay().querySelector('app-dialog-wrapper')).toBeNull();
    });

    test('open should propagate the result of an EventEmitter', async () => {
        // Given
        const result: Promise<number | void> = service.open(LegacyDialog);
        await render();

        // When
        (overlay().querySelector('.emit') as HTMLButtonElement).click();

        // Then
        await expect(result).resolves.toEqual(42);
    });

    test('open should resolve without result when closed', async () => {
        // Given
        const result: Promise<void> = service.open(PlainDialog);
        await render();

        // When
        (overlay().querySelector('#dialog-close') as HTMLButtonElement).click();

        // Then
        await expect(result).resolves.toBeUndefined();
        expect(overlay().querySelector('.plain')).toBeNull();
    });

    test('open should resolve without result on backdrop click', async () => {
        // Given
        const result: Promise<void> = service.open(PlainDialog);
        await render();

        // When
        (overlay().querySelector('.cdk-overlay-backdrop') as HTMLElement).click();

        // Then
        await expect(result).resolves.toBeUndefined();
    });

    test('open should resolve without result on escape only', async () => {
        // Given
        const result: Promise<void> = service.open(PlainDialog);
        await render();

        // When
        pressKey('Enter');

        // Then
        expect(overlay().querySelector('.plain')).not.toBeNull();

        // When
        pressKey('Escape');

        // Then
        await expect(result).resolves.toBeUndefined();
    });

    test('open should not be closable when asked', async () => {
        // Given
        const result: Promise<string | void> = service.open(TestDialog, { closable: false, inputs: { value: 'forced' } });
        await render();

        // When
        (overlay().querySelector('.cdk-overlay-backdrop') as HTMLElement).click();
        pressKey('Escape');

        // Then
        expect(overlay().querySelector('h1')).toBeNull();
        expect(overlay().querySelector('#dialog-close')).toBeNull();
        expect(overlay().querySelector('.emit')).not.toBeNull();

        // When
        (overlay().querySelector('.emit') as HTMLButtonElement).click();

        // Then
        await expect(result).resolves.toEqual('forced');
    });

    test('confirm should display the question and resolve false when dismissed', async () => {
        // Given
        const result: Promise<boolean> = service.confirm('Confirm', 'Are you sure?', 'confirm-cancel');
        await render();

        // Then
        expect(overlay().querySelector('h1')?.textContent).toEqual('Confirm');
        expect(overlay().querySelector('app-confirm-dialog p')?.textContent).toEqual('Are you sure?');
        expect(overlay().querySelector('#confirm-no')?.textContent?.trim()).toEqual('Annuler');
        expect(overlay().querySelector('#confirm-yes')?.textContent?.trim()).toEqual('Confirmer');

        // When
        pressKey('Escape');

        // Then
        await expect(result).resolves.toEqual(false);
    });

    test('confirm should resolve true when the user says yes', async () => {
        // Given
        const result: Promise<boolean> = service.confirm('Confirm', 'Are you sure?');
        await render();

        // Then
        expect(overlay().querySelector('#confirm-no')?.textContent?.trim()).toEqual('Non');
        expect(overlay().querySelector('#confirm-yes')?.textContent?.trim()).toEqual('Oui');

        // When
        (overlay().querySelector('#confirm-yes') as HTMLButtonElement).click();

        // Then
        await expect(result).resolves.toEqual(true);
    });

    test('confirm should resolve false when the user says no', async () => {
        // Given
        const result: Promise<boolean> = service.confirm('Confirm', 'Are you sure?');
        await render();

        // When
        (overlay().querySelector('#confirm-no') as HTMLButtonElement).click();

        // Then
        await expect(result).resolves.toEqual(false);
    });
});
