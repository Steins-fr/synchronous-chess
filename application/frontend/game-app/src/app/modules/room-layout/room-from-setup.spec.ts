import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { chatBlockChains, ChatPayloads } from '@app/modules/chat-page/components/chat/chat.component';
import { RoomSocketApi } from '@app/services/room-api/room-socket.api';
import { WEB_SOCKET_SERVER } from '@app/services/room-api/web-socket-server.token';
import RoomManagerService from '@app/services/room-manager/room-manager.service';
import RoomSetupService from '@app/services/room-setup/room-setup.service';
import { beforeEach, describe, expect, test } from 'vitest';
import { provideRooms, roomFromSetup } from './room-from-setup';

@Component({ template: '', providers: [provideRooms()] })
class HostComponent {
    public readonly room = roomFromSetup<ChatPayloads>(2, chatBlockChains);
}

describe('provideRooms', () => {
    beforeEach(() => {
        // Provided by the config of the app
        TestBed.configureTestingModule({ providers: [{ provide: WEB_SOCKET_SERVER, useValue: 'ws://server' }] });
    });

    test('should give a component the services of its room', () => {
        // When
        const fixture = TestBed.createComponent(HostComponent);

        // Then
        expect(fixture.componentInstance.room()).toBeUndefined();
        expect(fixture.debugElement.injector.get(RoomSetupService)).toBeInstanceOf(RoomSetupService);
        expect(fixture.debugElement.injector.get(RoomManagerService)).toBeInstanceOf(RoomManagerService);
        expect(fixture.debugElement.injector.get(RoomSocketApi)).toBeInstanceOf(RoomSocketApi);
    });
});
