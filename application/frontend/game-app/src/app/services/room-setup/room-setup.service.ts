import { Injectable } from '@angular/core';
import { Subject, BehaviorSubject } from 'rxjs';

type RoomSetupType = 'create' | 'join';

export interface RoomSetupInterface {
    type: RoomSetupType;
    roomName: string;
    playerName: string;
}

@Injectable()
export default class RoomSetupService {
    private readonly setupSubject = new Subject<RoomSetupInterface>();
    public readonly setup$ = this.setupSubject.asObservable();

    private readonly roomIsSetupSubject = new BehaviorSubject<boolean>(false);
    public readonly roomIsSetup$ = this.roomIsSetupSubject.asObservable();

    private readonly loadingSubject = new BehaviorSubject<boolean>(false);
    public readonly loading$ = this.loadingSubject.asObservable();

    public setup(type: RoomSetupType, roomName: string, playerName: string): void {
        this.loadingSubject.next(true);
        this.setupSubject.next({ type, roomName, playerName });
    }

    public roomIsSetup(roomIsSetup: boolean): void {
        this.roomIsSetupSubject.next(roomIsSetup);
        this.loadingSubject.next(false);
    }
}
