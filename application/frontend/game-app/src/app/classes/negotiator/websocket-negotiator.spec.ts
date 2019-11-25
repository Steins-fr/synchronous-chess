import { WebsocketNegotiator } from './websocket-negotiator';
import { Webrtc } from '../webrtc/webrtc';
import { TestBed } from '@angular/core/testing';
import { PlayerType } from '../player/player';
import { RoomApiService } from '../../services/room-api/room-api.service';

describe('WebsocketNegotiator', () => {

    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [RoomApiService]
        });
    });

    it('should create an instance', () => {
        expect(new WebsocketNegotiator('', '', PlayerType.HOST, new Webrtc(), TestBed.get(RoomApiService))).toBeTruthy();
    });
});
