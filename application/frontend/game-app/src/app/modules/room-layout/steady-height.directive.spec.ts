import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { SteadyHeightDirective } from './steady-height.directive';

@Component({
    template: '<div appSteadyHeight></div>',
    imports: [SteadyHeightDirective],
})
class SteadyHostComponent {}

describe('SteadyHeightDirective', () => {
    let fixture: ComponentFixture<SteadyHostComponent>;
    let resize: () => void;
    let disconnect: ReturnType<typeof vi.fn>;
    /** The box of the part, its height the one of its content unless its min-height is larger */
    let box: { width: number; content: number };

    const part = (): HTMLElement => fixture.nativeElement.querySelector('div');
    const minHeight = (): string => part().style.minHeight;

    /** The content of the part changes, at a width */
    function laidOut(width: number, content: number): void {
        box = { width, content };
        resize();
    }

    beforeEach(async () => {
        disconnect = vi.fn();
        vi.stubGlobal('ResizeObserver', class {
            public readonly disconnect = disconnect;

            public constructor(callback: () => void) {
                resize = callback;
            }

            public observe(): void {
                // The spec resizes the part itself
            }
        });
        // The frame comes at once
        vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => callback(0));
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement): DOMRect {
            const kept: number = Number.parseFloat(this.style.minHeight) || 0;
            return new DOMRect(0, 0, box.width, Math.max(kept, box.content));
        });
        fixture = TestBed.createComponent(SteadyHostComponent);
        await fixture.whenStable();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    test('should keep the tallest height of the part, its content coming and going', () => {
        // When
        laidOut(400, 100);

        // Then
        expect(minHeight()).toEqual('100px');

        // When its content grows, then shrinks
        laidOut(400, 140);
        laidOut(400, 60);

        // Then
        expect(minHeight()).toEqual('140px');
    });

    test('should measure the part again at another width', () => {
        // Given
        laidOut(400, 140);

        // When the window is turned: the content takes less height
        laidOut(700, 80);

        // Then
        expect(minHeight()).toEqual('80px');
    });

    test('should stop observing the part once destroyed', () => {
        // When
        fixture.destroy();

        // Then
        expect(disconnect).toHaveBeenCalledOnce();
    });
});
