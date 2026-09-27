import { OverlayRef } from '@angular/cdk/overlay';
import { ApplicationRef, Component, ComponentRef, EventEmitter, input, output } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DialogService } from './dialog.service';
import { DialogWrapperComponent } from './components/dialog-wrapper.component';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

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
    let attachSpy: ReturnType<typeof vi.spyOn>;

    function overlay(): HTMLElement {
        return document.querySelector('.cdk-overlay-container') as HTMLElement;
    }

    function wrapperRef<R = void>(): ComponentRef<DialogWrapperComponent<unknown, R>> {
        return attachSpy.mock.results[0].value as ComponentRef<DialogWrapperComponent<unknown, R>>;
    }

    async function render(): Promise<void> {
        await TestBed.inject(ApplicationRef).whenStable();
    }

    function pressKey(key: string): void {
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    }

    beforeEach(() => {
        attachSpy = vi.spyOn(OverlayRef.prototype, 'attach');
        service = TestBed.inject(DialogService);
    });

    afterEach(() => {
        vi.restoreAllMocks();
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
        wrapperRef().instance.close.emit();

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

        // When
        pressKey('Escape');

        // Then
        await expect(result).resolves.toEqual(false);
    });

    test('confirm should resolve with the result of the dialog', async () => {
        // Given
        const result: Promise<boolean> = service.confirm('Confirm', 'Are you sure?');
        await render();

        // When
        wrapperRef<boolean>().instance.result.emit(true);

        // Then
        await expect(result).resolves.toEqual(true);
    });
});
