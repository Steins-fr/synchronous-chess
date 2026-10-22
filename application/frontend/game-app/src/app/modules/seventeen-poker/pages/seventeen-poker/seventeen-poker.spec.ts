import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChatMessengerType } from '@app/modules/chat-page/components/chat/chat.component';
import { BlockChainName } from '@app/services/room-manager/classes/room/block-room/block-chain-name.enum';
import { HTTP_API_SERVER } from '@app/services/room-api/http-api-server.token';
import { RoomSocketApi } from '@app/services/room-api/room-socket.api';
import { WEB_SOCKET_SERVER } from '@app/services/room-api/web-socket-server.token';
import { Room } from '@app/services/room-manager/classes/room/room';
import RoomManagerService from '@app/services/room-manager/room-manager.service';
import RoomSetupService from '@app/services/room-setup/room-setup.service';
import { RoomNetworkMock } from '@testing/room-network.mock';
import { answerOpenRooms, TEST_HTTP_API_SERVER } from '@testing/open-rooms.http';
import { TestRequest } from '@angular/common/http/testing';
import { TestHelper } from '@testing/test.helper';
import { RoomGame } from '@protocol/room-game.enum';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { pokerBlockChains } from '../../classes/game-sessions/seventeen-poker-session';
import { SeventeenPoker } from './seventeen-poker';

describe('SeventeenPoker', () => {
    let fixture: ComponentFixture<SeventeenPoker>;
    let roomManagerService: RoomManagerService;
    let room: Room<object>;
    let games: Array<string | null>;

    beforeEach(async () => {
        Element.prototype.scrollTo ??= (): void => undefined;
        // A room without cheat report
        room = Object.assign(new Room<object>(TestHelper.cast<RoomSocketApi>({ close: vi.fn() }), new RoomNetworkMock().roomNetwork), { cheatFlags: signal([]) });
        roomManagerService = TestHelper.cast<RoomManagerService>({ buildBlockRoom: vi.fn().mockResolvedValue(room) });

        await TestBed.configureTestingModule({
            imports: [SeventeenPoker],
            // Provided by the config of the app
            providers: [{ provide: HTTP_API_SERVER, useValue: TEST_HTTP_API_SERVER }, { provide: WEB_SOCKET_SERVER, useValue: 'ws://server' }],
        })
            // Provided by the page itself, so override it rather than providing it to the testing module
            .overrideProvider(RoomManagerService, { useValue: roomManagerService })
            .compileComponents();

        fixture = TestBed.createComponent(SeventeenPoker);
        games = answerOpenRooms().map((request: TestRequest) => request.request.params.get('game'));
        await fixture.whenStable();
    });

    test('should list the open rooms of the game only', () => {
        expect(games).toEqual([RoomGame.SEVENTEEN_POKER]);
    });

    test('should present the game and its rules until a room is set up', () => {
        expect(fixture.nativeElement.querySelector('app-poker-presentation')).not.toBeNull();
        expect(fixture.nativeElement.querySelector('app-poker-rules h2')?.textContent).toEqual('Rules');
        expect(fixture.nativeElement.querySelector('app-chat')).toBeNull();
        expect(fixture.nativeElement.querySelector('app-poker-table')).toBeNull();
    });

    test('should build a room of the game holding its table and the chat, of 6 participants at most', async () => {
        // Given
        const roomSetupService: RoomSetupService = fixture.debugElement.injector.get(RoomSetupService);

        // When
        roomSetupService.setup({ type: 'create', game: RoomGame.SEVENTEEN_POKER, roomName: 'room', playerName: 'local' });
        await vi.waitFor(() => expect(fixture.componentInstance.room()).toBe(room));
        await fixture.whenStable();

        // Then
        expect(roomManagerService.buildBlockRoom).toHaveBeenCalledWith(
            { type: 'create', game: RoomGame.SEVENTEEN_POKER, roomName: 'room', playerName: 'local' }, 6,
            { [ChatMessengerType.CHAT_MESSAGE]: BlockChainName.CHAT, ...pokerBlockChains }, expect.any(AbortSignal),
        );
        expect(fixture.nativeElement.querySelector('app-chat')).not.toBeNull();
        expect(fixture.nativeElement.querySelector('app-debug-webrtc')).not.toBeNull();
        expect(fixture.nativeElement.querySelector('app-poker-presentation')).toBeNull();
        expect(fixture.nativeElement.querySelector('app-poker-table')).not.toBeNull();
        // The rules are folded below the table, without their own title
        expect(fixture.nativeElement.querySelector('details.rules-details:not([open]) app-poker-rules')).not.toBeNull();
        expect(fixture.nativeElement.querySelector('app-poker-rules h2')).toBeNull();
    });
});
