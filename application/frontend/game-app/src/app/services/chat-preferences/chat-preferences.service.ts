import { DestroyRef, DOCUMENT, inject, Injectable, Signal, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { storageChanges, storedValue, storeValue } from '@app/helpers/stored-preference.helper';

/** A setting of the chat, kept in the local storage */
export interface ChatSetting {
    readonly on: Signal<boolean>;
    set(on: boolean): void;
}

enum ChatSettingValue {
    ON = 'on',
    OFF = 'off',
}

/**
 * The settings of the chat the user picked, kept in the local storage, else their defaults. The other tabs of the app
 * follow them, as they follow the theme
 */
@Injectable({
    providedIn: 'root',
})
export class ChatPreferencesService {
    public static readonly panelKey: string = 'chat-panel';
    public static readonly arrivalsKey: string = 'chat-arrivals';
    public static readonly timesKey: string = 'chat-times';
    public static readonly enterSendsKey: string = 'chat-enter-sends';
    public static readonly hideOffensiveWordsKey: string = 'chat-hide-offensive-words';
    public static readonly coarsePointerQuery: string = '(pointer: coarse)';

    private readonly destroyRef = inject(DestroyRef);
    // The window of the document, a browser one: its storage and the events of its storage
    private readonly window: Window = inject(DOCUMENT).defaultView as Window;

    /** The chat open beside the game, on a wide screen: a phone opens it over the game, closed when the page shows */
    public readonly panelOpen: ChatSetting = this.setting(ChatPreferencesService.panelKey, true);
    /** The players arriving in the room and leaving it, among the messages */
    public readonly arrivals: ChatSetting = this.setting(ChatPreferencesService.arrivalsKey, true);
    /** The time of the messages, above each group of messages */
    public readonly times: ChatSetting = this.setting(ChatPreferencesService.timesKey, true);
    /** Enter sends the message, else it starts a new line: not on a touch screen by default, as the messaging apps */
    public readonly enterSends: ChatSetting = this.setting(
        ChatPreferencesService.enterSendsKey,
        !this.window.matchMedia(ChatPreferencesService.coarsePointerQuery).matches,
    );
    /** The offensive words of the messages masked, each one its first letter then stars: the text sent stays as written */
    public readonly hideOffensiveWords: ChatSetting = this.setting(ChatPreferencesService.hideOffensiveWordsKey, true);

    private setting(key: string, byDefault: boolean): ChatSetting {
        const read = (): boolean => {
            const stored: ChatSettingValue | undefined = storedValue(this.window, key, ChatSettingValue);
            return stored === undefined ? byDefault : stored === ChatSettingValue.ON;
        };
        const on = signal<boolean>(read());

        // Another tab of the app changed it, or cleared the storage (an event without key)
        storageChanges(this.window, key).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => on.set(read()));

        return {
            on: on.asReadonly(),
            set: (value: boolean): void => {
                on.set(value);
                storeValue(this.window, key, value ? ChatSettingValue.ON : ChatSettingValue.OFF);
            },
        };
    }
}
