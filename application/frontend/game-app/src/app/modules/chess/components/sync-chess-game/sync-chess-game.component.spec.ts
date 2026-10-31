import { gameState } from '@testing/chess-state.helper';
import { MatchLeaveWarning } from '@app/modules/room-layout/match-leave-warning';
import { signal } from '@angular/core';
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
import { GameEndReason, GameResult } from '@app/modules/chess/classes/games/game-result';
import { Player } from '@app/services/room-manager/classes/player/player';
import { Room } from '@app/services/room-manager/classes/room/room';
import MessageOriginType from '@app/services/room-manager/classes/webrtc/messages/message-origin.types';
import { RoomNetworkMock } from '@testing/room-network.mock';
import { SoundEffect } from '@app/services/sound/enums/sound-effect.enum';
import { SOUND_GAP } from '@app/services/sound/game-sounds';
import { SoundService } from '@app/services/sound/sound.service';
import { TestHelper } from '@testing/test.helper';
import { translated } from '@testing/translatable-text.helper';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

describe('SyncChessGameComponent', () => {
    let fixture: ComponentFixture<SyncChessGameComponent>;
    let component: SyncChessGameComponent;
    let network: RoomNetworkMock;

    function session(): SynchronousChessGameSession {
        return TestHelper.cast<{ gameSession(): SynchronousChessGameSession }>(component).gameSession();
    }

    // The texts of its children apart: the player of a seat, then its button
    function text(selector: string): string {
        const element: Element | null = fixture.nativeElement.querySelector(selector);
        return [...element?.childNodes ?? []].filter((node: ChildNode) => node.nodeType !== Node.COMMENT_NODE)
            .map((node: ChildNode) => node.textContent).join(' ').replace(/\s+/g, ' ').trim();
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

    function seatButtons(color: 'black' | 'white'): HTMLButtonElement[] {
        return [...fixture.nativeElement.querySelectorAll(`.${ color }-seat .seat-button`)];
    }

    function seatButton(color: 'black' | 'white', label: string): HTMLButtonElement | undefined {
        return seatButtons(color).find((button: HTMLButtonElement) => button.textContent?.trim() === label);
    }

    function remoteSeat(color: PieceColor): void {
        network.onMessage$.next({ type: SCGameSessionType.SEAT, payload: { color }, origin: MessageOriginType.ROOM_SERVICE, from: 'remote' });
    }

    // A room with the local player and a remote one, no one seated yet
    async function joinOnlineRoom(hostName?: string): Promise<void> {
        network = new RoomNetworkMock('local', true, hostName);
        const room: Room<ChessPayloads> = new Room<ChessPayloads>(TestHelper.cast<RoomSocketApi>({}), network.roomNetwork);
        fixture.componentRef.setInput('room', room);
        await fixture.whenStable();
        network.playerAdded$.next(TestHelper.cast<Player>({ name: 'remote', isLocal: false, sendData: vi.fn() }));
        await refresh();
    }

    // The local player takes its seat with its button, the remote one takes the other seat: before it for black, the
    // local player seeing the board from the free seat
    async function createOnlineGame(localColor: PieceColor = PieceColor.WHITE): Promise<void> {
        await joinOnlineRoom();
        if (localColor === PieceColor.WHITE) {
            seatButton('white', 'Play white')?.click();
            remoteSeat(PieceColor.BLACK);
        } else {
            remoteSeat(PieceColor.WHITE);
            await refresh();
            seatButton('black', 'Play black')?.click();
        }
        await refresh();
    }

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [SyncChessGameComponent],
            // Provided by the page
            providers: [MatchLeaveWarning],
        }).compileComponents();

        fixture = TestBed.createComponent(SyncChessGameComponent);
        component = fixture.componentInstance;
    });

    test('should play a local game without room', async () => {
        // When
        fixture.componentRef.setInput('room', undefined);
        await fixture.whenStable();

        // Then
        expect(fixture.nativeElement.textContent).toContain('Black player: Waiting');
        expect(fixture.nativeElement.textContent).toContain('White player: Waiting');
        expect(text('.spectators')).toEqual('Spectators: 0');
        expect(seatButtons('white')).toEqual([]);
        expect(seatButtons('black')).toEqual([]);
        expect(fixture.nativeElement.textContent).toContain('Turn: Synchronous');
        expect(text('.player-information.black-player')).toContain('none waiting');
        expect(skipButton('white')).toBeNull();
        expect(skipButton('black')).toBeNull();
        expect(component.moveColor()).toEqual(PieceColor.NONE);
        expect(component.history()).toEqual([]);
    });

    test('should display the players of an online game', async () => {
        // When
        await createOnlineGame();

        // Then
        expect(text('.black-seat')).toEqual('Black player: remote');
        expect(text('.white-seat')).toEqual('White player: local Leave the seat');
        expect(text('.spectators')).toEqual('Spectators: 0');
        expect(component.moveColor()).toEqual(PieceColor.WHITE);
        expect(component.canSkip()).toEqual(false);
        expect(skipButton('white')).toBeNull();
        expect(skipButton('black')).toBeNull();
    });

    test('should let a participant take the free seat at the bottom of the board, then leave it', async () => {
        // Given
        await joinOnlineRoom();

        // Then: a single seat to take, white at the bottom
        expect(text('#seat-top')).toEqual('Black player: Waiting');
        expect(text('#seat-bottom')).toEqual('White player: Waiting Play white');
        expect(text('.spectators')).toEqual('Spectators: 2');
        expect(component.moveColor()).toEqual(PieceColor.NONE);
        expect(board().flipped()).toBe(false);

        // When
        seatButton('white', 'Play white')?.click();
        await refresh();

        // Then
        expect(text('#seat-bottom')).toEqual('White player: local Leave the seat');
        expect(text('#seat-top')).toEqual('Black player: Waiting');
        expect(text('.spectators')).toEqual('Spectators: 1');

        // When
        seatButton('white', 'Leave the seat')?.click();
        await refresh();

        // Then
        expect(text('#seat-bottom')).toEqual('White player: Waiting Play white');
        expect(text('.spectators')).toEqual('Spectators: 2');
    });

    test('should show the board from the side of black to a participant who may take it, then plays it', async () => {
        // Given
        await joinOnlineRoom();

        // When
        remoteSeat(PieceColor.WHITE);
        await refresh();

        // Then
        expect(text('#seat-top')).toEqual('White player: remote');
        expect(text('#seat-bottom')).toEqual('Black player: Waiting Play black');
        expect(board().flipped()).toBe(true);
        expect(text('.player-information.top-player')).toContain('waiting');

        // When
        seatButton('black', 'Play black')?.click();
        await refresh();

        // Then
        expect(text('#seat-bottom')).toEqual('Black player: local Leave the seat');
        expect(board().flipped()).toBe(true);
        expect(fixture.nativeElement.querySelector('.player-information.bottom-player.black-player')).not.toBeNull();

        // When
        seatButton('black', 'Leave the seat')?.click();
        await refresh();

        // Then: the free seat stays at the bottom
        expect(text('#seat-bottom')).toEqual('Black player: Waiting Play black');
    });

    test('should not offer a seat taken by another participant', async () => {
        // Given
        await joinOnlineRoom();

        // When
        remoteSeat(PieceColor.BLACK);
        await refresh();

        // Then
        expect(text('.black-seat')).toEqual('Black player: remote');
        expect(text('.white-seat')).toEqual('White player: Waiting Play white');
    });

    test.each([PieceColor.WHITE, PieceColor.BLACK])('should let the player of %s free the seat of the other one, away, before the game starts', async (localColor: PieceColor) => {
        // Given
        await createOnlineGame(localColor);
        const away: 'black' | 'white' = localColor === PieceColor.WHITE ? 'black' : 'white';
        expect(seatButton(away, 'Free the seat')).toBeUndefined();

        // When the other player leaves the room
        network.playerRemoved$.next(TestHelper.cast<Player>({ name: 'remote', isLocal: false }));
        await refresh();

        // Then
        expect(text('#seat-top')).toEqual(`${ away === 'black' ? 'Black' : 'White' } player: remote Free the seat`);

        // When
        const transmit = vi.spyOn(component.room() as Room<ChessPayloads>, 'transmitMessage');
        const release: HTMLButtonElement = seatButton(away, 'Free the seat') as HTMLButtonElement;
        release.click();
        release.click();
        await refresh();

        // Then
        expect(text('#seat-top')).toEqual(`${ away === 'black' ? 'Black' : 'White' } player: Waiting`);
        expect(transmit).toHaveBeenCalledExactlyOnceWith(SCGameSessionType.UNSEAT, { color: localColor === PieceColor.WHITE ? PieceColor.BLACK : PieceColor.WHITE, name: 'remote' });
    });

    test('should let the host, a spectator, free the seat of a player away at the bottom of the board, before the game starts', async () => {
        // Given: the local participant hosts the room, two others are seated
        await joinOnlineRoom('local');
        network.playerAdded$.next(TestHelper.cast<Player>({ name: 'other', isLocal: false, sendData: vi.fn() }));
        remoteSeat(PieceColor.WHITE);
        network.onMessage$.next({ type: SCGameSessionType.SEAT, payload: { color: PieceColor.BLACK }, origin: MessageOriginType.ROOM_SERVICE, from: 'other' });
        await refresh();

        // When the player of white leaves the room
        network.playerRemoved$.next(TestHelper.cast<Player>({ name: 'remote', isLocal: false }));
        await refresh();

        // Then
        expect(text('#seat-bottom')).toEqual('White player: remote Free the seat');

        // When
        seatButton('white', 'Free the seat')?.click();
        await refresh();

        // Then: the seat is free, at the bottom of the board
        expect(text('#seat-bottom')).toEqual('White player: Waiting Play white');
    });

    test('should wait for every player away, their names listed in the language of the page', async () => {
        // Given: both seated players away during the game, set before the first render
        network = new RoomNetworkMock('local', true);
        fixture.componentRef.setInput('room', new Room<ChessPayloads>(TestHelper.cast<RoomSocketApi>({}), network.roomNetwork));
        Object.assign(session(), { awayPlayers: signal<ReadonlyArray<string>>(['alice', 'bob']), seatsOpen: signal<boolean>(false) });

        // When
        await refresh();

        // Then
        expect(text('#game-status')).toEqual('Waiting for alice and bob to come back…');
    });

    test('should fix the seats once the game started', async () => {
        // Given
        await createOnlineGame();

        // When
        board().piecePicked.emit(new Vec2(4, 6));
        board().pieceDropped.emit(new Vec2(4, 4));
        await vi.waitFor(() => expect(session().seatsOpen()).toEqual(false));
        await refresh();

        // Then: leaving the page asks to confirm
        expect(seatButtons('white')).toEqual([]);
        expect(seatButtons('black')).toEqual([]);
        expect(text('.white-seat')).toEqual('White player: local');
        expect(TestBed.inject(MatchLeaveWarning).inMatch()).toBe(true);
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
        expect(component.hasPlayed(PieceColor.BLACK)).toEqual(true);
        expect(text('.player-information.black-player')).toContain('played');
    });

    test('should play a synchronous turn', async () => {
        // Given
        await createOnlineGame();

        // When
        board().piecePicked.emit(new Vec2(4, 6));
        board().pieceDropped.emit(new Vec2(4, 4));
        await refresh();

        // Then
        expect(component.hasPlayed(PieceColor.WHITE)).toEqual(true);
        expect(component.hasPlayed(PieceColor.BLACK)).toEqual(false);
        expect(text('.player-information.white-player')).toContain('played');

        // When
        await remotePlay({ from: [FenColumn.E, FenRow._7], to: [FenColumn.E, FenRow._5] });
        await refresh();

        // Then
        expect(component.lastMove(PieceColor.WHITE)).toEqual({ key: 'chess.game.lastMove.move', params: { from: 'E2', to: 'E4' } });
        expect(component.lastMove(PieceColor.BLACK)).toEqual({ key: 'chess.game.lastMove.move', params: { from: 'E7', to: 'E5' } });
        expect(text('.player-information.black-player')).toContain('E7 -> E5');
        // The turn in the history of the game, read by the page
        expect(component.history().map(translated)).toEqual(['Turn 1 · White: E2 → E4', 'Turn 1 · Black: E7 → E5']);
    });

    test('should play the sound of a seat taken, by the local player or another one, not of a seat left', async () => {
        // Given
        await joinOnlineRoom();
        const play = vi.spyOn(TestBed.inject(SoundService), 'play');

        // When
        seatButton('white', 'Play white')?.click();
        await refresh();
        remoteSeat(PieceColor.BLACK);
        await refresh();
        seatButton('white', 'Leave the seat')?.click();
        await refresh();

        // Then
        expect(session().configuration()).toEqual({ whitePlayer: undefined, blackPlayer: 'remote' });
        expect(play.mock.calls).toEqual([[SoundEffect.SEAT_TAKEN, 0], [SoundEffect.SEAT_TAKEN, 0]]);
    });

    test('should play the sound of a turn once run, on every page', async () => {
        // Given
        await createOnlineGame();
        const play = vi.spyOn(TestBed.inject(SoundService), 'play');

        // When the local player moves alone
        board().piecePicked.emit(new Vec2(4, 6));
        board().pieceDropped.emit(new Vec2(4, 4));
        await refresh();

        // Then: no turn run
        expect(play).not.toHaveBeenCalled();

        // When
        await remotePlay({ from: [FenColumn.E, FenRow._7], to: [FenColumn.E, FenRow._5] });
        await refresh();

        // Then
        expect(play).toHaveBeenCalledExactlyOnceWith(SoundEffect.CHESS_MOVE, 0);
    });

    test('should play no sound of the history of the room it catches up with', async () => {
        // Given
        await createOnlineGame();
        const play = vi.spyOn(TestBed.inject(SoundService), 'play');
        const isHistory = vi.spyOn(TestHelper.cast<Room<ChessPayloads>>(component.room()), 'isHistory').mockReturnValue(true);
        board().piecePicked.emit(new Vec2(4, 6));
        board().pieceDropped.emit(new Vec2(4, 4));

        // When the reveals of the turn are in the history
        await remotePlay({ from: [FenColumn.E, FenRow._7], to: [FenColumn.E, FenRow._5] });
        await vi.waitFor(() => expect(session().historySteps()).toEqual(4));
        await refresh();

        // Then
        expect(session().game.playedTurns()).toHaveLength(1);
        expect(play).not.toHaveBeenCalled();

        // When the next turn is live
        isHistory.mockReturnValue(false);
        board().piecePicked.emit(new Vec2(3, 6));
        board().pieceDropped.emit(new Vec2(3, 4));
        await remotePlay({ from: [FenColumn.D, FenRow._7], to: [FenColumn.D, FenRow._6] });
        await refresh();

        // Then: the pawn of E5 may take the one of D4, an intermediate turn starts after the moves
        expect(play.mock.calls).toEqual([[SoundEffect.CHESS_MOVE, 0], [SoundEffect.CHESS_TURN_START, SOUND_GAP]]);
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
        expect(component.turnType()).toEqual('chess.game.turn.sync');
        expect(component.lastMove(PieceColor.WHITE)).toEqual({ key: 'chess.game.lastMove.passed' });
        expect(text('.player-information.white-player')).toContain('passed');
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
        expect(component.lastMove(PieceColor.WHITE)).toEqual({ key: 'chess.game.lastMove.passed' });
        expect(component.lastMove(PieceColor.BLACK)).toEqual({ key: 'chess.game.lastMove.move', params: { from: 'E7', to: 'E5' } });
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
        expect(text('.player-information.black-player .check')).toEqual('Check');
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
        expect(text('.player-information.white-player .check')).toEqual('Check');

        // When the other player is in check, at the top of the board
        gameState(session().game)._isBlackInCheck.set(true);
        await refresh();

        // Then
        expect(text('.player-information.top-player.black-player .check')).toEqual('Check');

        // When
        gameState(session().game)._isWhiteInCheckmate.set(true);
        gameState(session().game)._isBlackInCheck.set(true);
        gameState(session().game)._isBlackInCheckmate.set(true);
        gameState(session().game)._result.set({ winner: PieceColor.NONE, reason: GameEndReason.DOUBLE_CHECKMATE });
        await refresh();

        // Then
        expect(text('.player-information.white-player .check')).toEqual('Checkmate');
        expect(text('.player-information.black-player .check')).toEqual('Checkmate');
        expect(text('.player-information.white-player')).not.toContain('Last move');
        expect(component.displayInteractions(PieceColor.WHITE)).toEqual(false);
        expect(component.displayInteractions(PieceColor.BLACK)).toEqual(false);
    });

    test.each([
        { result: { winner: PieceColor.WHITE, reason: GameEndReason.CHECKMATE }, message: 'Checkmate: White wins' },
        { result: { winner: PieceColor.BLACK, reason: GameEndReason.CHECKMATE }, message: 'Checkmate: Black wins' },
        { result: { winner: PieceColor.WHITE, reason: GameEndReason.KING_CAPTURED }, message: 'King captured: White wins' },
        { result: { winner: PieceColor.BLACK, reason: GameEndReason.KING_CAPTURED }, message: 'King captured: Black wins' },
        { result: { winner: PieceColor.NONE, reason: GameEndReason.KING_CAPTURED }, message: 'Draw: both kings were captured' },
        { result: { winner: PieceColor.NONE, reason: GameEndReason.DOUBLE_CHECKMATE }, message: 'Draw: both players are checkmated' },
        { result: { winner: PieceColor.NONE, reason: GameEndReason.STALEMATE }, message: 'Draw: stalemate, a player can no longer move' },
        { result: { winner: PieceColor.NONE, reason: GameEndReason.THREEFOLD_REPETITION }, message: 'Draw: the same position occurred three times' },
        { result: { winner: PieceColor.NONE, reason: GameEndReason.FIFTY_TURNS }, message: 'Draw: 50 turns without a pawn move or a capture' },
        { result: { winner: PieceColor.NONE, reason: GameEndReason.INSUFFICIENT_MATERIAL }, message: 'Draw: not enough pieces left to checkmate' },
        { result: { winner: PieceColor.WHITE, reason: GameEndReason.AWAY }, message: 'Black was away when the time ran out: White wins' },
        { result: { winner: PieceColor.BLACK, reason: GameEndReason.AWAY }, message: 'White was away when the time ran out: Black wins' },
    ])('should display the end of the game: $message', async ({ result, message }) => {
        // Given
        await createOnlineGame();
        expect(fixture.nativeElement.querySelector('.game-result')).toBeNull();
        expect(component.resultText()).toBeUndefined();

        // When
        gameState(session().game)._result.set(result);
        await refresh();

        // Then
        expect(text('.game-result')).toEqual(message);
        expect(component.displayInteractions(PieceColor.WHITE)).toEqual(false);
        expect(text('.player-information.white-player')).not.toContain('Last move');
    });

    test('should tell first in the history the player away who lost the game', async () => {
        // Given
        await createOnlineGame();

        // When
        gameState(session().game)._result.set({ winner: PieceColor.BLACK, reason: GameEndReason.AWAY });

        // Then
        expect(component.history().map(translated)).toEqual(['White was away when the time ran out']);
    });

    describe('the clock of a player away', () => {
        /** The clock runs on fake timers, the commitments on real ones */
        beforeEach(() => {
            vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        async function elapse(seconds: number): Promise<void> {
            vi.advanceTimersByTime(seconds * 1000);
            await refresh();
        }

        /** The local player, white, plays a turn with the remote one, then its move of the next turn */
        async function playedSecondTurn(): Promise<void> {
            await createOnlineGame();
            board().piecePicked.emit(new Vec2(4, 6));
            board().pieceDropped.emit(new Vec2(4, 4));
            await remotePlay({ from: [FenColumn.E, FenRow._7], to: [FenColumn.E, FenRow._5] });
            board().piecePicked.emit(new Vec2(3, 6));
            board().pieceDropped.emit(new Vec2(3, 4));
            await refresh();
        }

        test('should claim the game of the other player away 30 seconds after the local player played', async () => {
            // Given
            await playedSecondTurn();
            const play = vi.spyOn(TestBed.inject(SoundService), 'play');
            expect(text('#game-status')).toEqual('');

            // When the other player leaves the room
            network.playerRemoved$.next(TestHelper.cast<Player>({ name: 'remote', isLocal: false }));
            await refresh();

            // Then
            expect(text('#game-status')).toEqual('Waiting for remote to come back…');
            expect(text('#away-clock')).toEqual('30 s');

            // When
            await elapse(25);

            // Then: the clock runs out
            expect(fixture.nativeElement.querySelector('#away-clock').classList).toContain('text-app-clock-low');

            // When
            await elapse(5);

            // Then
            await vi.waitFor(() => expect(text('.game-result')).toEqual('Black was away when the time ran out: White wins'));
            await refresh();
            expect(text('#game-status')).toEqual('');
            expect(fixture.nativeElement.querySelector('#away-clock')).toBeNull();
            expect(component.history().map(translated)).toEqual([
                'Black was away when the time ran out',
                'Turn 1 · White: E2 → E4',
                'Turn 1 · Black: E7 → E5',
            ]);
            expect(play).toHaveBeenCalledExactlyOnceWith(SoundEffect.GAME_WON, 0);
        });

        test('should stop the clock when the other player comes back', async () => {
            // Given
            await playedSecondTurn();
            network.playerRemoved$.next(TestHelper.cast<Player>({ name: 'remote', isLocal: false }));
            await refresh();
            await elapse(10);
            expect(text('#away-clock')).toEqual('20 s');

            // When
            network.playerAdded$.next(TestHelper.cast<Player>({ name: 'remote', isLocal: false, sendData: vi.fn() }));
            await refresh();
            await elapse(30);

            // Then
            expect(fixture.nativeElement.querySelector('#away-clock')).toBeNull();
            expect(text('#game-status')).toEqual('');
            expect(component.resultText()).toBeUndefined();
        });
    });

    test('should reject an unknown end of the game', async () => {
        // Given
        await createOnlineGame();

        // When
        gameState(session().game)._result.set(TestHelper.cast<GameResult>({ winner: PieceColor.NONE, reason: 'unknown' }));

        // Then
        expect(() => component.resultText()).toThrow('Unhandled switch case: unknown');
    });

    test('should display the promotion choices of the playing color', async () => {
        // Given
        await createOnlineGame();
        const promoteSpy = vi.spyOn(session(), 'promote').mockImplementation(() => undefined);

        // When
        setTurn(promotionTurn(PieceColor.WHITE));
        await refresh();

        // Then
        expect(fixture.nativeElement.textContent).toContain('Turn: Promotion');
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
        expect(component.turnType()).toEqual('chess.game.turn.intermediate');

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
