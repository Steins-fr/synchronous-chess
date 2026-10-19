
import { Component, OnDestroy, computed, input, signal, untracked } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { TranslocoDirective, TranslocoPipe } from '@jsverse/transloco';
import { marker } from '@jsverse/transloco-keys-manager/marker';
import SynchronousChessGameSession from '@app/modules/chess/classes/game-sessions/synchronous-chess-game-session';
import SynchronousChessGameSessionBuilder from '@app/modules/chess/classes/game-sessions/synchronous-chess-game-session-builder';
import SynchronousChessLocalGameSession from '@app/modules/chess/classes/game-sessions/synchronous-chess-local-game-session';
import { ChessPayloads } from '@app/modules/chess/classes/game-sessions/synchronous-chess-online-game-session';
import CoordinateMove from '@app/modules/chess/interfaces/CoordinateMove';
import Move from '@app/modules/chess/interfaces/move';
import { FenPiece } from '@app/modules/chess/enums/fen-piece.enum';
import { PieceColor } from '@app/modules/chess/enums/piece-color.enum';
import MoveTurnAction from '@app/modules/chess/classes/turns/turn-actions/move-turn-action';
import TurnType, { TurnCategory } from '@app/modules/chess/classes/turns/turn.types';
import { Vec2 } from '@app/modules/chess/classes/vector/vec2';
import ChessBoardHelper from '@app/modules/chess/helpers/chess-board-helper';
import { ValidPlayBoard } from '@app/modules/chess/types/valid-play-board';
import { Room } from '@app/services/room-manager/classes/room/room';
import { ChessPromotionComponent } from '../chess/chess-promotion/chess-promotion.component';
import { ChessBoardComponent } from '../chess/chess-board/chess-board.component';
import { ChessPieceComponent } from '../chess/chess-piece/chess-piece.component';
import { switchExhaustivenessGuard } from '@app/helpers/switch-exhaustiveness-guard.helper';
import { GameEndReason, GameResult } from '@app/modules/chess/classes/games/game-result';
import { TranslatableText } from '@app/types/translatable-text.type';

@Component({
    selector: 'app-sync-chess-game',
    templateUrl: './sync-chess-game.component.html',
    styleUrls: ['./sync-chess-game.component.scss'],
    imports: [ChessBoardComponent, ChessPromotionComponent, MatButtonModule, ChessPieceComponent, TranslocoDirective, TranslocoPipe],
})
export class SyncChessGameComponent implements OnDestroy {
    public readonly room = input.required<Room<ChessPayloads> | undefined>();

    protected readonly gameSession = computed<SynchronousChessGameSession>(() => {
        const room = this.room();

        // The session state is made of signals, it must not become a dependency: only a new room recreates the session
        return untracked(() => room ? SynchronousChessGameSessionBuilder.buildOnline(room) : new SynchronousChessLocalGameSession());
    });

    private readonly playedPiece = signal<Vec2>(new Vec2(-1, -1));
    protected readonly validPlayBoard = signal<ValidPlayBoard>(ChessBoardHelper.createFilledBoard(false));
    protected blackPiece: FenPiece = FenPiece.BLACK_KING;
    protected whitePiece: FenPiece = FenPiece.WHITE_KING;
    protected whiteColor: PieceColor = PieceColor.WHITE;
    protected blackColor: PieceColor = PieceColor.BLACK;

    public ngOnDestroy(): void {
        this.gameSession().destroy();
    }

    public piecePicked(cellPos: Vec2): void {
        this.playedPiece.set(cellPos);
        this.pieceClicked(cellPos);
    }

    public pieceClicked(cellPos: Vec2): void {
        const validPlayBoard: ValidPlayBoard = ChessBoardHelper.createFilledBoard(false);
        this.gameSession().game.getPossiblePlays(cellPos).forEach((play: Vec2) => {
            validPlayBoard[play.y][play.x] = true;
        });
        this.validPlayBoard.set(validPlayBoard);
    }

    public pieceDropped(cellPos: Vec2): void {
        const coordinateMove: CoordinateMove = {
            from: this.playedPiece().toArray(),
            to: cellPos.toArray()
        };

        this.gameSession().move(ChessBoardHelper.fromCoordinateMoveToMove(coordinateMove));
        this.resetHighlight();
        this.playedPiece.set(new Vec2(-1, -1));
    }

    /** The key of the name of the turn */
    public turnType(): string {
        const turnType: TurnType = this.gameSession().game.getTurnType();
        switch (turnType) {
            case TurnType.MOVE_SYNC:
                return marker('chess.game.turn.sync');
            case TurnType.MOVE_INTERMEDIATE:
                return marker('chess.game.turn.intermediate');
            case TurnType.CHOICE_PROMOTION:
                return marker('chess.game.turn.promotion');
            default:
                return switchExhaustivenessGuard(turnType);
        }
    }

    public isMoveTurn(): boolean {
        return this.gameSession().game.getTurnCategory() === TurnCategory.MOVE;
    }

    public moveColor(): PieceColor {
        return this.isMoveTurn() ? this.gameSession().playingColor : PieceColor.NONE;
    }

    // Only an intermediate turn can be skipped, a synchronous turn requires a move from both players
    public canSkip(): boolean {
        return this.gameSession().game.getTurnType() === TurnType.MOVE_INTERMEDIATE;
    }

    public isPromotion(): boolean {
        return this.gameSession().game.getTurnType() === TurnType.CHOICE_PROMOTION;
    }

    public whiteHasPlayed(): boolean {
        return this.gameSession().game.hasPlayed(PieceColor.WHITE);
    }

    public blackHasPlayed(): boolean {
        return this.gameSession().game.hasPlayed(PieceColor.BLACK);
    }

    public whiteLastMove(): TranslatableText {
        const action: MoveTurnAction | null = this.gameSession().game.lastMoveTurnAction();
        return action === null ? { key: marker('chess.game.lastMove.none') } : this.formatLastMove(action.whiteMove);
    }

    public blackLastMove(): TranslatableText {
        const action: MoveTurnAction | null = this.gameSession().game.lastMoveTurnAction();
        return action === null ? { key: marker('chess.game.lastMove.none') } : this.formatLastMove(action.blackMove);
    }

    public displayBlackInteractions(): boolean {
        return this.gameSession().playingColor === PieceColor.BLACK && !this.gameSession().game.isGameOver();
    }

    public displayWhiteInteractions(): boolean {
        return this.gameSession().playingColor === PieceColor.WHITE && !this.gameSession().game.isGameOver();
    }

    /** The end of the game, once over. A win picks its sentence by the winner (an ICU select): no color word fits in it */
    public resultText(): TranslatableText | undefined {
        const result: GameResult | null = this.gameSession().game.result();
        return result === null ? undefined : { key: SyncChessGameComponent.resultKey(result), params: { winner: result.winner } };
    }

    private static resultKey(result: GameResult): string {
        switch (result.reason) {
            case GameEndReason.CHECKMATE:
                return marker('chess.game.result.checkmate');
            case GameEndReason.KING_CAPTURED:
                return result.winner === PieceColor.NONE ? marker('chess.game.result.kingsCaptured') : marker('chess.game.result.kingCaptured');
            case GameEndReason.DOUBLE_CHECKMATE:
                return marker('chess.game.result.doubleCheckmate');
            case GameEndReason.STALEMATE:
                return marker('chess.game.result.stalemate');
            case GameEndReason.THREEFOLD_REPETITION:
                return marker('chess.game.result.threefoldRepetition');
            case GameEndReason.FIFTY_TURNS:
                return marker('chess.game.result.fiftyTurns');
            case GameEndReason.INSUFFICIENT_MATERIAL:
                return marker('chess.game.result.insufficientMaterial');
            default:
                return switchExhaustivenessGuard(result.reason);
        }
    }

    public skip(): void {
        this.gameSession().move(null);
    }

    /** A free seat, until the game starts: the local player may take it, leaving its other seat */
    public canTakeSeat(color: PieceColor): boolean {
        return this.gameSession().seatsOpen() && this.seatedPlayer(color) === undefined;
    }

    public canLeaveSeat(color: PieceColor): boolean {
        return this.gameSession().seatsOpen() && this.gameSession().myColor === color;
    }

    public takeSeat(color: PieceColor): void {
        this.gameSession().takeSeat(color);
    }

    public leaveSeat(): void {
        this.gameSession().leaveSeat();
    }

    private seatedPlayer(color: PieceColor): string | undefined {
        const { whitePlayer, blackPlayer } = this.gameSession().configuration();
        return color === PieceColor.WHITE ? whitePlayer : blackPlayer;
    }

    private resetHighlight(): void {
        this.validPlayBoard.set(ChessBoardHelper.createFilledBoard(false));
    }

    private formatLastMove(move: Move | null): TranslatableText {
        if (move === null) {
            return { key: marker('chess.game.lastMove.passed') };
        }
        const from: string = `${ move.from[0].toUpperCase() }${ move.from[1] }`;
        const to: string = `${ move.to[0].toUpperCase() }${ move.to[1] }`;

        return { key: marker('chess.game.lastMove.move'), params: { from, to } };
    }
}
