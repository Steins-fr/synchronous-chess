import { DestroyRef, DOCUMENT, inject, Injectable, Signal, signal } from '@angular/core';

/**
 * Whether the page is shown (Page Visibility API): hidden in a tab in the background, a window minimized, a screen
 * locked, not once the window only lost the focus
 */
@Injectable({
    providedIn: 'root',
})
export class PageVisibilityService {
    private readonly document = inject(DOCUMENT);
    private readonly isVisible = signal<boolean>(!this.document.hidden);

    public readonly visible: Signal<boolean> = this.isVisible.asReadonly();

    public constructor() {
        const onChange = (): void => this.isVisible.set(!this.document.hidden);

        this.document.addEventListener('visibilitychange', onChange);
        inject(DestroyRef).onDestroy(() => this.document.removeEventListener('visibilitychange', onChange));
    }
}
