import SynchronousChessOnlinePeerGameSession from './synchronous-chess-online-peer-game-session';
import { RoomService } from 'src/app/services/room/room.service';
import { NotifierFlow } from '../../notifier/notifier';
import { RoomManager } from '../../room-manager/room-manager';
import { TestBed } from '@angular/core/testing';
import { NgZone } from '@angular/core';
import { SessionConfiguration } from './synchronous-chess-game-session';

describe('SynchronousChessOnlinePeerGameSession', () => {

    let roomServiceSpy: jasmine.SpyObj<RoomService>;
    let roomManagerSpy: jasmine.SpyObj<RoomManager>;

    beforeEach(() => {
        roomServiceSpy = jasmine.createSpyObj<RoomService>('RoomService', ['notifier']);
        roomManagerSpy = jasmine.createSpyObj<RoomManager>('RoomManager', ['notifier']);
        Object.defineProperty(roomServiceSpy, 'notifier', {
            value: jasmine.createSpyObj<NotifierFlow<any, any>>('NotifierFlow<any,any>', ['follow']),
            writable: false
        });
        Object.defineProperty(roomManagerSpy, 'notifier', {
            value: jasmine.createSpyObj<NotifierFlow<any, any>>('NotifierFlow<any,any>', ['follow']),
            writable: false
        });
    });

    it('should create an instance', () => {
        expect(new SynchronousChessOnlinePeerGameSession(roomServiceSpy, roomManagerSpy, undefined)).toBeTruthy();
    });

    it('should set the configuration', () => {
        // Given
        const session: SynchronousChessOnlinePeerGameSession = new SynchronousChessOnlinePeerGameSession(roomServiceSpy, roomManagerSpy, TestBed.get(NgZone));
        const configuration: SessionConfiguration = {
            whitePlayer: 'e',
            blackPlayer: 'd',
            spectatorNumber: 3
        };

        // When
        session.onConfiguration(configuration);

        // Then
        expect(session.configuration).toBe(configuration);
    });
});
