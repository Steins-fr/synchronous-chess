import { ChangeDetectorRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { SyncChessGameComponent } from './sync-chess-game.component';
import { ChessBoardComponent } from '../chess/chess-board/chess-board.component';
import SynchronousChessGameSession from '@app/modules/chess/classes/game-sessions/synchronous-chess-game-session';
import { ChessPayloads, SCGameSessionType } from '@app/modules/chess/classes/game-sessions/synchronous-chess-online-game-session';
import TurnType, { TurnCategory } from '@app/modules/chess/classes/turns/turn.types';
import { Vec2 } from '@app/modules/chess/classes/vector/vec2';
import { PieceColor } from '@app/modules/chess/enums/piece-color.enum';
import { PieceType } from '@app/modules/chess/enums/piece-type.enum';
import Move, { FenColumn, FenRow } from '@app/modules/chess/interfaces/move';
import { RoomSocketApi } from '@app/services/room-api/room-socket.api';
import { Player } from '@app/services/room-manager/classes/player/player';
import { Room } from '@app/services/room-manager/classes/room/room';
import MessageOriginType from '@app/services/room-manager/classes/webrtc/messages/message-origin.types';
import { RoomNetworkMock } from '@testing/room-network.mock';
import { TestHelper } from '@testing/test.helper';
import { beforeEach, describe, expect, test, vi } from 'vitest';

describe('SyncChessGameComponent', () => {
    let fixture: ComponentFixture<SyncChessGameComponent>;
    let component: SyncChessGameComponent;
    let network: RoomNetworkMock;

    function session(): SynchronousChessGameSession {
        return TestHelper.cast<{ gameSession(): SynchronousChessGameSession }>(component).gameSession();
    }

    function text(selector: string): string {
        return (fixture.nativeElement.querySelector(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();
    }

    function skipButton(color: 'black' | 'white'): HTMLButtonElement | null {
        return fixture.nativeElement.querySelector(`.player-information.${ color }-player .skip-button`);
    }

    // The game state is not made of signals, the view has to be marked for check explicitly
    async function refresh(): Promise<void> {
        fixture.componentRef.injector.get(ChangeDetectorRef).markForCheck();
        await fixture.whenStable();
    }

    function board(): ChessBoardComponent {
        return fixture.debugElement.query(By.directive(ChessBoardComponent)).componentInstance;
    }

    function remotePlay(move: Move | null): void {
        network.onMessage$.next({ type: SCGameSessionType.PLAY, payload: { move }, origin: MessageOriginType.ROOM_SERVICE, from: 'remote' });
    }

    async function createOnlineGame(): Promise<void> {
        network = new RoomNetworkMock('local', true);
        const room: Room<ChessPayloads> = new Room<ChessPayloads>(TestHelper.cast<RoomSocketApi>({}), network.roomNetwork);
        fixture.componentRef.setInput('room', room);
        await fixture.whenStable();
        network.playerAdded$.next(network.localPlayer);
        network.playerAdded$.next(TestHelper.cast<Player>({ name: 'remote', isLocal: false, sendData: vi.fn() }));
        await refresh();
    }

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [SyncChessGameComponent],
        }).compileComponents();

        fixture = TestBed.createComponent(SyncChessGameComponent);
        component = fixture.componentInstance;
    });

    test('should play a local game without room', async () => {
        // When
        fixture.componentRef.setInput('room', undefined);
        await fixture.whenStable();

        // Then
        expect(fixture.nativeElement.textContent).toContain('Joueur Noir : En attente');
        expect(fixture.nativeElement.textContent).toContain('Joueur Blanc : En attente');
        expect(text('.spectators')).toEqual('Spectateurs : 0');
        expect(fixture.nativeElement.textContent).toContain('Tour : Synchronisé');
        expect(text('.player-information.black-player')).toContain('aucunen attente');
        expect(skipButton('white')).toBeNull();
        expect(skipButton('black')).toBeNull();
        expect(component.moveColor()).toEqual(PieceColor.NONE);
    });

    test('should display the players of an online game', async () => {
        // When
        await createOnlineGame();

        // Then
        expect(fixture.nativeElement.textContent).toContain('Joueur Noir : remote');
        expect(fixture.nativeElement.textContent).toContain('Joueur Blanc : local');
        expect(component.moveColor()).toEqual(PieceColor.WHITE);
        expect(skipButton('white')).not.toBeNull();
        expect(skipButton('black')).toBeNull();
    });

    test('should highlight the possible plays of a clicked piece', async () => {
        // Given
        await createOnlineGame();

        // When
        board().pieceClicked.emit(new Vec2(4, 6));
        await refresh();

        // Then
        expect(fixture.nativeElement.querySelectorAll('.valid-move')).toHaveLength(2);
    });

    test('should display that the opponent has played', async () => {
        // Given
        await createOnlineGame();

        // When
        remotePlay({ from: [FenColumn.E, FenRow._7], to: [FenColumn.E, FenRow._5] });
        await refresh();

        // Then
        expect(component.blackHasPlayed()).toEqual(true);
        expect(text('.player-information.black-player')).toContain('a joué');
    });

    test('should play a synchronous turn', async () => {
        // Given
        await createOnlineGame();

        // When
        board().piecePicked.emit(new Vec2(4, 6));
        board().pieceDropped.emit(new Vec2(4, 4));
        await refresh();

        // Then
        expect(component.whiteHasPlayed()).toEqual(true);
        expect(component.blackHasPlayed()).toEqual(false);
        expect(text('.player-information.white-player')).toContain('a joué');
        expect(skipButton('white')).toBeNull();

        // When
        remotePlay({ from: [FenColumn.E, FenRow._7], to: [FenColumn.E, FenRow._5] });
        await refresh();

        // Then
        expect(component.whiteLastMove()).toEqual('E2 -> E4');
        expect(component.blackLastMove()).toEqual('E7 -> E5');
        expect(text('.player-information.black-player')).toContain('E7 -> E5');
    });

    test('should skip a turn', async () => {
        // Given
        await createOnlineGame();
        const moveSpy = vi.spyOn(session(), 'move');

        // When
        skipButton('white')?.click();

        // Then
        expect(moveSpy).toHaveBeenCalledWith(null);
    });

    test('should display the skipped moves', async () => {
        // Given
        await createOnlineGame();
        const blackMove: Move = { from: [FenColumn.E, FenRow._7], to: [FenColumn.E, FenRow._5] };

        // When
        vi.spyOn(session().game, 'lastMoveTurnAction').mockReturnValue({ whiteMove: null, blackMove });

        // Then
        expect(component.whiteLastMove()).toEqual('a passé');
        expect(component.blackLastMove()).toEqual('E7 -> E5');
    });

    test('should display the black interactions when black is playing', async () => {
        // Given
        await createOnlineGame();
        vi.spyOn(session(), 'playingColor', 'get').mockReturnValue(PieceColor.BLACK);

        // When
        await refresh();

        // Then
        expect(skipButton('black')).not.toBeNull();
        expect(skipButton('white')).toBeNull();

        // When
        const moveSpy = vi.spyOn(session(), 'move').mockImplementation(() => undefined);
        skipButton('black')?.click();

        // Then
        expect(moveSpy).toHaveBeenCalledWith(null);

        // When
        session().game.isBlackInCheck = true;
        await refresh();

        // Then
        expect(skipButton('black')).toBeNull();
        expect(text('.player-information.black-player .check')).toEqual('Échec');
    });

    test('should display the check and checkmate states', async () => {
        // Given
        await createOnlineGame();

        // When
        session().game.isWhiteInCheck = true;
        await refresh();

        // Then
        expect(skipButton('white')).toBeNull();
        expect(text('.player-information.white-player .check')).toEqual('Échec');

        // When
        session().game.isWhiteInCheckmate = true;
        session().game.isBlackInCheck = true;
        session().game.isBlackInCheckmate = true;
        await refresh();

        // Then
        expect(text('.player-information.white-player .check')).toEqual('Échec et mat');
        expect(text('.player-information.black-player .check')).toEqual('Échec et mat');
        expect(text('.player-information.white-player')).not.toContain('Dernier coup');
        expect(component.displayWhiteInteractions()).toEqual(false);
        expect(component.displayBlackInteractions()).toEqual(false);
    });

    test('should display the promotion choices of the playing color', async () => {
        // Given
        await createOnlineGame();
        vi.spyOn(session().game, 'getTurnType').mockReturnValue(TurnType.CHOICE_PROMOTION);
        vi.spyOn(session().game, 'getTurnCategory').mockReturnValue(TurnCategory.CHOICE);
        const promoteSpy = vi.spyOn(session(), 'promote').mockImplementation(() => undefined);

        // When
        await refresh();

        // Then
        expect(fixture.nativeElement.textContent).toContain('Tour : Promotion');
        expect(fixture.nativeElement.querySelector('#promotion-title')).not.toBeNull();
        expect(fixture.nativeElement.querySelector('.promotion-list.white-player')).not.toBeNull();
        expect(fixture.nativeElement.querySelector('.promotion-list.black-player')).toBeNull();
        expect(component.moveColor()).toEqual(PieceColor.NONE);

        // When
        (fixture.nativeElement.querySelector('.promotion-list.white-player app-chess-piece') as HTMLElement).click();

        // Then
        expect(promoteSpy).toHaveBeenCalledWith(PieceType.ROOK);

        // When
        vi.spyOn(session(), 'playingColor', 'get').mockReturnValue(PieceColor.BLACK);
        await refresh();
        (fixture.nativeElement.querySelector('.promotion-list.black-player app-chess-piece') as HTMLElement).click();

        // Then
        expect(fixture.nativeElement.querySelector('.promotion-list.white-player')).toBeNull();
        expect(promoteSpy).toHaveBeenCalledTimes(2);
    });

    test('should name the intermediate turn and reject unknown turns', async () => {
        // Given
        await createOnlineGame();
        const getTurnTypeSpy = vi.spyOn(session().game, 'getTurnType');

        // When
        getTurnTypeSpy.mockReturnValue(TurnType.MOVE_INTERMEDIATE);

        // Then
        expect(component.turnType()).toEqual('Intermédiaire');

        // When
        getTurnTypeSpy.mockReturnValue('unknown' as TurnType);

        // Then
        expect(() => component.turnType()).toThrow('Unhandled switch case: unknown');
    });

    test('should destroy the game session', async () => {
        // Given
        await createOnlineGame();
        const destroySpy = vi.spyOn(session(), 'destroy');

        // When
        fixture.destroy();

        // Then
        expect(destroySpy).toHaveBeenCalledTimes(1);
    });
});
