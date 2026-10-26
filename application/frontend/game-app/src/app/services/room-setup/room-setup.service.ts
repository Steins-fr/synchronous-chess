import { Injectable } from '@angular/core';
import { RoomLock, RoomLocks } from '@app/services/room-session/room-lock';
import { RoomGame } from '@protocol/room-game.enum';
import { Subject, BehaviorSubject } from 'rxjs';

/** Resuming is joining again the room of the session of the tab, its host reconnecting a room nobody took over */
export type RoomSetupType = 'create' | 'join' | 'resume';

export interface RoomSetupInterface {
    type: RoomSetupType;
    /** The game of the page: its rooms are listed, created and joined */
    game: RoomGame;
    roomName: string;
    playerName: string;
    /** The password making the created room private, or of the private room joined */
    password?: string;
    /** Proves the player of the tab to the API: kept in its session, it spares the password of the private room resumed */
    token: string;
}

@Injectable()
export default class RoomSetupService {
    private readonly setupSubject = new Subject<RoomSetupInterface>();
    public readonly setup$ = this.setupSubject.asObservable();

    private readonly roomIsSetupSubject = new BehaviorSubject<boolean>(false);
    public readonly roomIsSetup$ = this.roomIsSetupSubject.asObservable();

    private readonly loadingSubject = new BehaviorSubject<boolean>(false);
    public readonly loading$ = this.loadingSubject.asObservable();

    public setup(setup: RoomSetupInterface): void {
        this.loadingSubject.next(true);
        this.setupSubject.next(setup);
    }

    // The lock of the player in the room the page holds, held or asked, and its name: a page holds one room at a time
    private roomLock?: Promise<RoomLock | undefined>;
    private roomLockName?: string;

    public roomIsSetup(roomIsSetup: boolean): void {
        this.roomIsSetupSubject.next(roomIsSetup);
        this.loadingSubject.next(false);
    }

    /**
     * Holds the lock of the player in the room among the tabs of the browser, the one held or asked kept, the former one
     * released
     * @param wait how long to wait for it, held by another tab
     * @returns whether the page holds it: another tab holds the room under that name else
     */
    public async holdLock(roomId: string, playerName: string, wait: number = 0): Promise<boolean> {
        const name: string = JSON.stringify([roomId, playerName]);

        if (this.roomLockName !== name) {
            this.releaseLock();
            this.roomLockName = name;
            this.roomLock = RoomLocks.hold(roomId, playerName, wait).then((lock: RoomLock | undefined) => {
                // Held by another tab: asked again next time, once it may have left
                if (lock === undefined && this.roomLockName === name) {
                    this.roomLockName = undefined;
                }
                return lock;
            });
        }

        const asked: Promise<RoomLock | undefined> | undefined = this.roomLock;
        // Not once released meanwhile, the page gave the room up
        return await asked !== undefined && this.roomLock === asked;
    }

    /** Once the page gave the room up: the lock asked is released once held */
    public releaseLock(): void {
        void this.roomLock?.then((lock: RoomLock | undefined) => lock?.release());
        this.roomLock = undefined;
        this.roomLockName = undefined;
    }
}
