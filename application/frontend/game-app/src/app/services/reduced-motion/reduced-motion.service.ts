import { DestroyRef, DOCUMENT, inject, Injectable, Signal, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { fromEvent } from 'rxjs';

/**
 * Whether the user asks for less motion (prefers-reduced-motion), followed as the system changes it: the animations of
 * the games stop (styles.scss), and the sounds waiting for an animation (the chips landing, the cards dealt one after
 * the other) do not wait for it either
 */
@Injectable({
    providedIn: 'root',
})
export class ReducedMotionService {
    public static readonly query: string = '(prefers-reduced-motion: reduce)';

    private readonly window: Window = inject(DOCUMENT).defaultView as Window;
    private readonly reducedMotion: MediaQueryList = this.window.matchMedia(ReducedMotionService.query);
    private readonly isReduced = signal<boolean>(this.reducedMotion.matches);

    public readonly reduced: Signal<boolean> = this.isReduced.asReadonly();

    public constructor() {
        fromEvent(this.reducedMotion, 'change').pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe(() => this.isReduced.set(this.reducedMotion.matches));
    }
}
