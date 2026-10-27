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
import { rouletteBlockChains } from '../../classes/game-sessions/russian-roulette-session';
import { RussianRoulette } from './russian-roulette';

describe('RussianRoulette', () => {
    let fixture: ComponentFixture<RussianRoulette>;
    let roomManagerService: RoomManagerService;
    let room: Room<object>;
    let games: Array<string | null>;

    beforeEach(async () => {
        Element.prototype.scrollTo ??= (): void => undefined;
        // A room without cheat report
        room = Object.assign(new Room<object>(TestHelper.cast<RoomSocketApi>({ close: vi.fn() }), new RoomNetworkMock().roomNetwork), { cheatFlags: signal([]) });
        roomManagerService = TestHelper.cast<RoomManagerService>({ buildBlockRoom: vi.fn().mockResolvedValue(room) });

        await TestBed.configureTestingModule({
            imports: [RussianRoulette],
            // Provided by the config of the app
            providers: [{ provide: HTTP_API_SERVER, useValue: TEST_HTTP_API_SERVER }, { provide: WEB_SOCKET_SERVER, useValue: 'ws://server' }],
        })
            // Provided by the page itself, so override it rather than providing it to the testing module
            .overrideProvider(RoomManagerService, { useValue: roomManagerService })
            .compileComponents();

        fixture = TestBed.createComponent(RussianRoulette);
        games = answerOpenRooms().map((request: TestRequest) => request.request.params.get('game'));
        await fixture.whenStable();
    });

    test('should list the open rooms of the game only', () => {
        expect(games).toEqual([RoomGame.RUSSIAN_ROULETTE]);
    });

    test('should present the game and its rules until a room is set up', () => {
        expect(fixture.nativeElement.querySelector('app-roulette-presentation')).not.toBeNull();
        expect(fixture.nativeElement.querySelector('app-roulette-rules h2')?.textContent).toEqual('Rules');
        expect(fixture.nativeElement.querySelector('app-chat')).toBeNull();
        expect(fixture.nativeElement.querySelector('app-roulette-table')).toBeNull();
    });

    test('should build a room of the game holding its table and the chat, of 6 participants at most', async () => {
        // Given
        const roomSetupService: RoomSetupService = fixture.debugElement.injector.get(RoomSetupService);

        // When
        roomSetupService.setup({ type: 'create', game: RoomGame.RUSSIAN_ROULETTE, roomName: 'room', playerName: 'local', token: 'token' });
        await vi.waitFor(() => expect(fixture.componentInstance.room()).toBe(room));
        await fixture.whenStable();

        // Then
        expect(roomManagerService.buildBlockRoom).toHaveBeenCalledWith(
            { type: 'create', game: RoomGame.RUSSIAN_ROULETTE, roomName: 'room', playerName: 'local', token: 'token' }, 6,
            { [ChatMessengerType.CHAT_MESSAGE]: BlockChainName.CHAT, ...rouletteBlockChains }, expect.any(AbortSignal),
        );
        // The chat beside the game, out of the page
        expect(fixture.nativeElement.querySelector('#room-chat app-chat')).not.toBeNull();
        expect(fixture.nativeElement.querySelector('#page-content app-chat')).toBeNull();
        // The debug panel of WebRTC out of the page: the room layout offers it
        expect(fixture.nativeElement.querySelector('app-debug-webrtc')).toBeNull();
        expect(fixture.nativeElement.querySelector('app-roulette-presentation')).toBeNull();
        expect(fixture.nativeElement.querySelector('app-roulette-table')).not.toBeNull();
        // The rules are folded below the table, without their own title
        expect(fixture.nativeElement.querySelector('details.rules-details:not([open]) app-roulette-rules')).not.toBeNull();
        expect(fixture.nativeElement.querySelector('app-roulette-rules h2')).toBeNull();
        // The game first, then its rules
        const order: string[] = Array.from(fixture.nativeElement.querySelector('#page-content').children, (child: Element) => child.tagName.toLowerCase());
        expect(order).toEqual(['app-roulette-table', 'details']);
    });
});
