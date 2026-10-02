import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChatPage } from './chat.page';
import { ChatMessengerType } from './components/chat/chat.component';
import { BlockChainName } from '@app/services/room-manager/classes/room/block-room/block-chain-name.enum';
import { RoomSocketApi } from '@app/services/room-api/room-socket.api';
import { Room } from '@app/services/room-manager/classes/room/room';
import RoomManagerService from '@app/services/room-manager/room-manager.service';
import RoomSetupService from '@app/services/room-setup/room-setup.service';
import { RoomNetworkMock } from '@testing/room-network.mock';
import { TestHelper } from '@testing/test.helper';
import { beforeEach, describe, expect, test, vi } from 'vitest';

describe('ChatPage', () => {
    let fixture: ComponentFixture<ChatPage>;
    let roomManagerService: RoomManagerService;
    let room: Room<object>;

    beforeEach(async () => {
        Element.prototype.scrollTo ??= (): void => undefined;
        // A room without cheat report
        room = Object.assign(new Room<object>(TestHelper.cast<RoomSocketApi>({ close: vi.fn() }), new RoomNetworkMock().roomNetwork), { cheatFlags: signal([]) });
        roomManagerService = TestHelper.cast<RoomManagerService>({ buildBlockRoom: vi.fn().mockResolvedValue(room) });

        await TestBed.configureTestingModule({
            imports: [ChatPage],
        })
            // Provided by the page itself, so override it rather than providing it to the testing module
            .overrideProvider(RoomManagerService, { useValue: roomManagerService })
            .compileComponents();

        fixture = TestBed.createComponent(ChatPage);
        await fixture.whenStable();
    });

    test('should wait for the room setup', () => {
        expect(fixture.nativeElement.querySelector('app-chat')).not.toBeNull();
        expect(fixture.nativeElement.querySelector('app-debug-webrtc')).toBeNull();
        expect(fixture.nativeElement.querySelector('#room-content-overlay')).not.toBeNull();
    });

    test('should build the room once setup', async () => {
        // Given
        const roomSetupService: RoomSetupService = fixture.debugElement.injector.get(RoomSetupService);

        // When
        roomSetupService.setup('create', 'room', 'local');
        await vi.waitFor(() => expect(fixture.componentInstance.room()).toBe(room));
        await fixture.whenStable();

        // Then
        expect(roomManagerService.buildBlockRoom).toHaveBeenCalledWith({ type: 'create', roomName: 'room', playerName: 'local' }, 6, { [ChatMessengerType.CHAT_MESSAGE]: BlockChainName.CHAT });
        expect(fixture.nativeElement.querySelector('app-debug-webrtc')).not.toBeNull();
        expect(fixture.nativeElement.querySelector('#room-content-overlay')).toBeNull();

        // When
        const clearSpy = vi.spyOn(room, 'clear');
        fixture.destroy();

        // Then
        expect(clearSpy).toHaveBeenCalledTimes(1);
    });

    test('should be destroyed without room', () => {
        expect(() => fixture.destroy()).not.toThrow();
    });
});
