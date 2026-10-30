import { DOCUMENT, inject, Injectable } from '@angular/core';
import { CryptoHelper } from '@app/helpers/crypto.helper';
import { storedText, storeValue } from '@app/helpers/stored-preference.helper';

/**
 * A random id of the browser, kept in its local storage and shared by its tabs: the page sends it to the API with the
 * creation and the joins of the rooms, the API keeping its hash to refuse the joins of a browser removed from a room.
 * Sent to the API only, never to the other players
 */
@Injectable({
    providedIn: 'root',
})
export class BrowserIdStore {
    private static readonly KEY: string = 'synchronous-chess:browser-id';

    // The window of the document, a browser one: its local storage
    private readonly window: Window = inject(DOCUMENT).defaultView as Window;
    /** The id drawn by this page: the one of the page until it leaves, the storage blocked */
    private drawn?: string;

    /** The id of the browser, drawn and stored the first time */
    public id(): string {
        const stored: string | undefined = storedText(this.window, BrowserIdStore.KEY);

        if (stored !== undefined) {
            return stored;
        }

        this.drawn ??= CryptoHelper.randomHex(16);
        storeValue(this.window, BrowserIdStore.KEY, this.drawn);
        return this.drawn;
    }
}
