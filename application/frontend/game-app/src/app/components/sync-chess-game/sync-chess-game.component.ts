
import { Component, OnDestroy, computed, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import SynchronousChessGameSession from '@app/classes/chess/game-sessions/synchronous-chess-game-session';
import SynchronousChessGameSessionBuilder from '@app/classes/chess/game-sessions/synchronous-chess-game-session-builder';
import SynchronousChessLocalGameSession from '@app/classes/chess/game-sessions/synchronous-chess-local-game-session';
import CoordinateMove from '@app/classes/chess/interfaces/CoordinateMove';
import Move from '@app/classes/chess/interfaces/move';
import { FenPiece } from '@app/classes/chess/enums/fen-piece.enum';
import { PieceColor } from '@app/classes/chess/enums/piece-color.enum';
import MoveTurnAction from '@app/classes/chess/turns/turn-actions/move-turn-action';
import TurnType, { TurnCategory } from '@app/classes/chess/turns/turn.types';
import { Vec2 } from '@app/classes/vector/vec2';
import { ChessBoardComponent } from '@app/components/chess/chess-board/chess-board.component';
import { ChessPieceComponent } from '@app/components/chess/chess-piece/chess-piece.component';
import { ChessPromotionComponent } from '@app/components/chess/chess-promotion/chess-promotion.component';
import ChessBoardHelper from '@app/helpers/chess-board-helper';
import { ValidPlayBoard } from '@app/classes/chess/types/valid-play-board';
import { Room } from '@app/services/room-manager/classes/room/room';

@Component({
    selector: 'app-sync-chess-game',
    templateUrl: './sync-chess-game.component.html',
    styleUrls: ['./sync-chess-game.component.scss'],
    imports: [ChessBoardComponent, ChessPromotionComponent, MatButtonModule, ChessPieceComponent],
})
export class SyncChessGameComponent implements OnDestroy {
    public readonly room = input.required<Room<any> | undefined>();

    protected readonly gameSession = computed<SynchronousChessGameSession>(() => {
        const room = this.room();

        if (room) {
            return SynchronousChessGameSessionBuilder.buildOnline(room);
        }

        return new SynchronousChessLocalGameSession();
    });

    private readonly playedPiece = signal<Vec2>(new Vec2(-1, -1));
    protected validPlayBoard: ValidPlayBoard = ChessBoardHelper.createFilledBoard(false);
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
        this.resetHighlight();
        this.gameSession().game.getPossiblePlays(cellPos).forEach((play: Vec2) => {
            this.validPlayBoard[play.y][play.x] = true;
        });
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

    public turnType(): string {
        switch (this.gameSession().game.getTurnType()) {
            case TurnType.MOVE_SYNC:
                return 'Synchronisé';
            case TurnType.MOVE_INTERMEDIATE:
                return 'Intermédiaire';
            case TurnType.CHOICE_PROMOTION:
                return 'Promotion';
            default:
                return '';
        }
    }

    public isMoveTurn(): boolean {
        return this.gameSession().game.getTurnCategory() === TurnCategory.MOVE;
    }

    public moveColor(): PieceColor {
        return this.isMoveTurn() ? this.gameSession().playingColor : PieceColor.NONE;
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

    public whiteLastMove(): string {
        const action: MoveTurnAction | null = this.gameSession().game.lastMoveTurnAction();
        return action === null ? '' : this.formatLastMove(action.whiteMove);
    }

    public blackLastMove(): string {
        const action: MoveTurnAction | null = this.gameSession().game.lastMoveTurnAction();
        return action === null ? '' : this.formatLastMove(action.blackMove);
    }

    public displayBlackInteractions(): boolean {
        return this.gameSession().playingColor === PieceColor.BLACK && !this.gameSession().game.isCheckmate();
    }

    public displayWhiteInteractions(): boolean {
        return this.gameSession().playingColor === PieceColor.WHITE && !this.gameSession().game.isCheckmate();
    }

    public skip(): void {
        this.gameSession().move(null);
    }

    private resetHighlight(): void {
        this.validPlayBoard = ChessBoardHelper.createFilledBoard(false);
    }

    private formatLastMove(move: Move | null): string {
        if (move === null) {
            return 'a passé';
        }
        const from: string = `${ move.from[0].toUpperCase() }${ move.from[1] }`;
        const to: string = `${ move.to[0].toUpperCase() }${ move.to[1] }`;

        return `${ from } -> ${ to }`;
    }
}
