import { Signal, signal } from '@angular/core';
import { offensiveWords } from '@app/services/offensive-words/offensive-word-lists';
import { OffensiveWords } from '@app/services/offensive-words/offensive-words';
import { OffensiveWordsService } from '@app/services/offensive-words/offensive-words.service';

/**
 * The offensive words of the chat, given by the spec: by default the lists of the app, loaded as the translations are
 * (test-providers.ts), so that the chat masks at its first render; none when the spec says so
 */
export class OffensiveWordsMock implements Pick<OffensiveWordsService, 'words' | 'load'> {
    public readonly words: Signal<OffensiveWords | undefined>;

    public constructor(loaded: boolean = true) {
        this.words = signal(loaded ? offensiveWords : undefined).asReadonly();
    }

    public load(): Promise<boolean> {
        return Promise.resolve(true);
    }
}
