import { afterNextRender, DestroyRef, Directive, ElementRef, inject, Renderer2 } from '@angular/core';

/**
 * Keeps a part of a game page from shrinking: its content comes and goes (buttons, a line of text, another layout of the
 * table), the part keeps the tallest height it had, and the page below it does not move. Another width, the window
 * resized or turned, lays its content out again: the part takes its own height then
 */
@Directive({ selector: '[appSteadyHeight]' })
export class SteadyHeightDirective {
    private readonly element: HTMLElement = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    private readonly renderer: Renderer2 = inject(Renderer2);
    private width: number | null = null;
    private height: number = 0;

    public constructor() {
        const destroyRef: DestroyRef = inject(DestroyRef);

        afterNextRender(() => {
            const observer = new ResizeObserver(([entry]: ResizeObserverEntry[]) => this.resized(entry.borderBoxSize[0]));
            observer.observe(this.element);
            destroyRef.onDestroy(() => observer.disconnect());
        });
    }

    /** The size of the part as laid out, an animation moving it (a table shaking) aside */
    private resized({ inlineSize: width, blockSize: height }: ResizeObserverSize): void {
        if (width !== this.width) {
            this.width = width;
            // Out of the observer, a height set in it would resize the part again in the same frame
            requestAnimationFrame(() => this.measure());
        } else if (height > this.height) {
            this.keep(height);
        }
    }

    /** The height of the content at the new width */
    private measure(): void {
        this.renderer.removeStyle(this.element, 'min-height');
        this.keep(this.element.getBoundingClientRect().height);
    }

    private keep(height: number): void {
        this.height = height;
        this.renderer.setStyle(this.element, 'min-height', `${ height }px`);
    }
}
