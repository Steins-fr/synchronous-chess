import { gameState } from '@testing/chess-state.helper';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { SyncChessGameComponent } from './sync-chess-game.component';
import { ChessBoardComponent } from '../chess/chess-board/chess-board.component';
import SynchronousChessGameSession from '@app/modules/chess/classes/game-sessions/synchronous-chess-game-session';
import SynchronousChessOnlineGameSession, {
    ChessPayloads,
    SCGameSessionType,
    SealedAction,
    SealedActionKind
} from '@app/modules/chess/classes/game-sessions/synchronous-chess-online-game-session';
import { IntermediateTurn } from '@app/modules/chess/classes/turns/intermediate-turn';
import PromotionTurn from '@app/modules/chess/classes/turns/promotion-turn';
import SyncTurn from '@app/modules/chess/classes/turns/sync-turn';
import Turn from '@app/modules/chess/classes/turns/turn';
import TurnType from '@app/modules/chess/classes/turns/turn.types';
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

    // The game state is made of signals, its changes are rendered without explicit check
    async function refresh(): Promise<void> {
        await fixture.whenStable();
    }

    function setTurn(turn: Turn): void {
        gameState(session().game)._turn.set(turn);
    }

    function intermediateTurn(): IntermediateTurn {
        return new IntermediateTurn({ whiteTarget: [FenColumn.E, FenRow._4], blackTarget: [FenColumn.E, FenRow._5], whiteMove: null, blackMove: null });
    }

    function promotionTurn(color: PieceColor): PromotionTurn {
        return new PromotionTurn({
            whiteFenCoordinate: color === PieceColor.WHITE ? [FenColumn.A, FenRow._8] : null,
            blackFenCoordinate: color === PieceColor.BLACK ? [FenColumn.A, FenRow._1] : null,
            whitePiece: null,
            blackPiece: null,
        }, new SyncTurn());
    }

    function board(): ChessBoardComponent {
        return fixture.debugElement.query(By.directive(ChessBoardComponent)).componentInstance;
    }

    // The remote player commits to its move, then reveals it
    async function remotePlay(move: Move | null, color: PieceColor = PieceColor.BLACK): Promise<void> {
        const turn: number = TestHelper.cast<{ turnCount: number }>(session()).turnCount;
        const action: SealedAction = { kind: SealedActionKind.MOVE, move };
        const commitment: string = await SynchronousChessOnlineGameSession.commitment(turn, color, action, 'salt');
        network.onMessage$.next({ type: SCGameSessionType.COMMIT, payload: { turn, commitment }, origin: MessageOriginType.ROOM_SERVICE, from: 'remote' });
        network.onMessage$.next({ type: SCGameSessionType.REVEAL, payload: { turn, action, salt: 'salt' }, origin: MessageOriginType.ROOM_SERVICE, from: 'remote' });
        await vi.waitFor(() => expect(session().game.colorHasPlayed(color) || TestHelper.cast<{ turnCount: number }>(session()).turnCount > turn).toEqual(true));
    }

    // The first added player is white, the second one is black
    async function createOnlineGame(localColor: PieceColor = PieceColor.WHITE): Promise<void> {
        network = new RoomNetworkMock('local', true);
        const room: Room<ChessPayloads> = new Room<ChessPayloads>(TestHelper.cast<RoomSocketApi>({}), network.roomNetwork);
        fixture.componentRef.setInput('room', room);
        await fixture.whenStable();
        const remotePlayer = TestHelper.cast<Player>({ name: 'remote', isLocal: false, sendData: vi.fn() });
        const players: Player[] = localColor === PieceColor.WHITE ? [network.localPlayer, remotePlayer] : [remotePlayer, network.localPlayer];
        players.forEach((player: Player) => network.playerAdded$.next(player));
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
        expect(component.canSkip()).toEqual(false);
        expect(skipButton('white')).toBeNull();
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
        await remotePlay({ from: [FenColumn.E, FenRow._7], to: [FenColumn.E, FenRow._5] });
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

        // When
        await remotePlay({ from: [FenColumn.E, FenRow._7], to: [FenColumn.E, FenRow._5] });
        await refresh();

        // Then
        expect(component.whiteLastMove()).toEqual('E2 -> E4');
        expect(component.blackLastMove()).toEqual('E7 -> E5');
        expect(text('.player-information.black-player')).toContain('E7 -> E5');
    });

    test('should skip an intermediate turn', async () => {
        // Given
        await createOnlineGame();
        setTurn(new IntermediateTurn({ whiteTarget: [FenColumn.E, FenRow._4], blackTarget: null, whiteMove: null, blackMove: null }));
        await refresh();

        // When
        skipButton('white')?.click();
        await refresh();

        // Then
        expect(skipButton('black')).toBeNull();
        expect(component.turnType()).toEqual('Synchronisé');
        expect(component.whiteLastMove()).toEqual('a passé');
        expect(text('.player-information.white-player')).toContain('a passé');
        expect(component.canSkip()).toEqual(false);
    });

    test('should not be able to skip a synchronous turn', async () => {
        // Given
        await createOnlineGame();

        // When
        const call = (): void => component.skip();

        // Then
        expect(call).toThrow('A synchronous turn can not be skipped');
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
        await createOnlineGame(PieceColor.BLACK);

        // When
        setTurn(intermediateTurn());
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
        gameState(session().game)._isBlackInCheck.set(true);
        await refresh();

        // Then
        expect(skipButton('black')).toBeNull();
        expect(text('.player-information.black-player .check')).toEqual('Échec');
    });

    test('should display the check and checkmate states', async () => {
        // Given
        await createOnlineGame();
        setTurn(intermediateTurn());

        // When
        gameState(session().game)._isWhiteInCheck.set(true);
        await refresh();

        // Then
        expect(skipButton('white')).toBeNull();
        expect(text('.player-information.white-player .check')).toEqual('Échec');

        // When
        gameState(session().game)._isWhiteInCheckmate.set(true);
        gameState(session().game)._isBlackInCheck.set(true);
        gameState(session().game)._isBlackInCheckmate.set(true);
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
        const promoteSpy = vi.spyOn(session(), 'promote').mockImplementation(() => undefined);

        // When
        setTurn(promotionTurn(PieceColor.WHITE));
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
        setTurn(promotionTurn(PieceColor.BLACK));
        await refresh();

        // Then
        expect(fixture.nativeElement.querySelector('.promotion-list.white-player')).toBeNull();
        expect(fixture.nativeElement.querySelector('.promotion-list.black-player')).toBeNull();
    });

    test('should display the black promotion choices when black is playing', async () => {
        // Given
        await createOnlineGame(PieceColor.BLACK);
        const promoteSpy = vi.spyOn(session(), 'promote').mockImplementation(() => undefined);

        // When
        setTurn(promotionTurn(PieceColor.BLACK));
        await refresh();
        (fixture.nativeElement.querySelector('.promotion-list.black-player app-chess-piece') as HTMLElement).click();

        // Then
        expect(fixture.nativeElement.querySelector('.promotion-list.white-player')).toBeNull();
        expect(promoteSpy).toHaveBeenCalledWith(PieceType.ROOK);
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
