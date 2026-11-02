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
import { bidPokerBlockChains } from '../../classes/game-sessions/bid-poker-messages';
import { BidPoker } from './bid-poker';

describe('BidPoker', () => {
    let fixture: ComponentFixture<BidPoker>;
    let roomManagerService: RoomManagerService;
    let room: Room<object>;
    let games: Array<string | null>;

    beforeEach(async () => {
        Element.prototype.scrollTo ??= (): void => undefined;
        // A room without cheat report
        room = Object.assign(new Room<object>(TestHelper.cast<RoomSocketApi>({ close: vi.fn() }), new RoomNetworkMock().roomNetwork), { cheatFlags: signal([]) });
        roomManagerService = TestHelper.cast<RoomManagerService>({ buildBlockRoom: vi.fn().mockResolvedValue(room) });

        await TestBed.configureTestingModule({
            imports: [BidPoker],
            // Provided by the config of the app
            providers: [{ provide: HTTP_API_SERVER, useValue: TEST_HTTP_API_SERVER }, { provide: WEB_SOCKET_SERVER, useValue: 'ws://server' }],
        })
            // Provided by the page itself, so override it rather than providing it to the testing module
            .overrideProvider(RoomManagerService, { useValue: roomManagerService })
            .compileComponents();

        fixture = TestBed.createComponent(BidPoker);
        games = answerOpenRooms().map((request: TestRequest) => request.request.params.get('game'));
        await fixture.whenStable();
    });

    test('should list the open rooms of the game only', () => {
        expect(games).toEqual([RoomGame.BID_POKER]);
    });

    test('should present the game and its rules until a room is set up', () => {
        expect(fixture.nativeElement.querySelector('app-bid-presentation')).not.toBeNull();
        expect(fixture.nativeElement.querySelector('app-bid-rules h2')?.textContent).toEqual('Rules');
        expect(fixture.nativeElement.querySelector('app-chat')).toBeNull();
    });

    test('should build a room of the game holding the chat, of 8 participants at most', async () => {
        // Given
        const roomSetupService: RoomSetupService = fixture.debugElement.injector.get(RoomSetupService);

        // When
        roomSetupService.setup({ type: 'create', game: RoomGame.BID_POKER, roomName: 'room', playerName: 'local', token: 'token' });
        await vi.waitFor(() => expect(fixture.componentInstance.room()).toBe(room));
        await fixture.whenStable();

        // Then
        expect(roomManagerService.buildBlockRoom).toHaveBeenCalledWith(
            { type: 'create', game: RoomGame.BID_POKER, roomName: 'room', playerName: 'local', token: 'token' }, 8,
            { [ChatMessengerType.CHAT_MESSAGE]: BlockChainName.CHAT, [ChatMessengerType.MODERATION]: BlockChainName.CHAT, ...bidPokerBlockChains }, expect.any(AbortSignal),
        );
        expect(fixture.nativeElement.querySelector('#room-chat app-chat')).not.toBeNull();
        expect(fixture.nativeElement.querySelector('app-bid-presentation')).toBeNull();
        // The rules are folded, without their own title
        expect(fixture.nativeElement.querySelector('details.rules-details:not([open]) app-bid-rules')).not.toBeNull();
        expect(fixture.nativeElement.querySelector('app-bid-rules h2')).toBeNull();
    });
});
