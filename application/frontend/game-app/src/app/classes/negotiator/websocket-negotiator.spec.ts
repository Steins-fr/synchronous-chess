import { WebsocketNegotiator } from './websocket-negotiator';
import { Webrtc } from '../webrtc/webrtc';
import { TestBed } from '@angular/core/testing';
import { RoomApiService } from 'src/app/services/room-api/room-api.service';

describe('WebsocketNegotiator', () => {

    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [RoomApiService]
        });
    });

    it('should create an instance', () => {
        expect(new WebsocketNegotiator('', '', new Webrtc(), TestBed.get(RoomApiService))).toBeTruthy();
    });
});
