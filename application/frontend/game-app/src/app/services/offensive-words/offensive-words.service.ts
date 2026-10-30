import { Injectable, Signal, signal } from '@angular/core';
import type { OffensiveWords } from './offensive-words';

// The chunk of the lists, in an object for a spec to spy on its loading
export const offensiveWordsChunk = {
    load: () => import('./offensive-word-lists'),
};

/** The offensive words of the chat, the same whatever the language of the reader */
@Injectable({
    providedIn: 'root',
})
export class OffensiveWordsService {
    private readonly compiled = signal<OffensiveWords | undefined>(undefined);

    /** The lists compiled: none until loaded */
    public readonly words: Signal<OffensiveWords | undefined> = this.compiled.asReadonly();

    /**
     * Loads the lists, with the chat scope before a page holding the chat shows (translationScopesGuard): its first render
     * masks the history. Failing, the next navigation asks again; Chromium keeps a failed import failed until the page
     * reloads, as it does for the chunk of a page
     */
    public async load(): Promise<boolean> {
        if (this.compiled() !== undefined) {
            return true;
        }

        try {
            this.compiled.set((await offensiveWordsChunk.load()).offensiveWords);
            return true;
        } catch {
            return false;
        }
    }
}
