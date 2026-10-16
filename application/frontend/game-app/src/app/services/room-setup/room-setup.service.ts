import { Injectable } from '@angular/core';
import { RoomGame } from '@protocol/room-game.enum';
import { Subject, BehaviorSubject } from 'rxjs';

export type RoomSetupType = 'create' | 'join';

export interface RoomSetupInterface {
    type: RoomSetupType;
    /** The game of the page: its rooms are listed, created and joined */
    game: RoomGame;
    roomName: string;
    playerName: string;
    /** The password making the created room private, or of the private room joined */
    password?: string;
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

    public roomIsSetup(roomIsSetup: boolean): void {
        this.roomIsSetupSubject.next(roomIsSetup);
        this.loadingSubject.next(false);
    }
}
