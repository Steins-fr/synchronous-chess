import { DOCUMENT, inject, Injectable } from '@angular/core';
import { TimedLogger } from '@app/helpers/timed-logger.helper';

/** What the tab keeps of a room it is in: the name of the player, and the token of its join */
export interface RoomSession {
    playerName: string;
    /** Spares the password of a private room, and proves the host reconnecting its room */
    token: string;
}

/**
 * Keeps in the tab the session of each room it is in, by room id: a reloaded page joins its room again under the same
 * name, the key pair, the seat and the secrets of the player following it. Apart in each tab, so two tabs play two rooms
 */
@Injectable({
    providedIn: 'root',
})
export class RoomSessionStore {
    private static readonly PREFIX: string = 'synchronous-chess:room-session';

    // The window of the document, a browser one: its session storage, read on use, throws when blocked
    private readonly window: Window = inject(DOCUMENT).defaultView as Window;

    public get(roomId: string): Readonly<RoomSession> | undefined {
        try {
            const stored: string | null = this.window.sessionStorage.getItem(RoomSessionStore.key(roomId));
            const session: unknown = stored === null ? undefined : JSON.parse(stored);
            return RoomSessionStore.isSession(session) ? session : undefined;
        } catch (error: unknown) {
            TimedLogger.warn('The session of the room can not be read', error);
            return undefined;
        }
    }

    public save(roomId: string, session: Readonly<RoomSession>): void {
        try {
            this.window.sessionStorage.setItem(RoomSessionStore.key(roomId), JSON.stringify({ playerName: session.playerName, token: session.token }));
        } catch (error: unknown) {
            // Private browsing or blocked site data: a reload shows the join dialog of the room
            TimedLogger.warn('The session of the room can not be stored', error);
        }
    }

    public remove(roomId: string): void {
        try {
            this.window.sessionStorage.removeItem(RoomSessionStore.key(roomId));
        } catch (error: unknown) {
            TimedLogger.warn('The session of the room can not be removed', error);
        }
    }

    private static key(roomId: string): string {
        return `${ RoomSessionStore.PREFIX }:${ roomId }`;
    }

    private static isSession(value: unknown): value is RoomSession {
        const session = value as Partial<Record<keyof RoomSession, unknown>> | null | undefined;
        return typeof session?.playerName === 'string' && session.playerName !== '' && typeof session.token === 'string' && session.token !== '';
    }
}
