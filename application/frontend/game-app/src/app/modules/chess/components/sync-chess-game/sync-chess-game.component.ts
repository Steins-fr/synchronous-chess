
import { Component, OnDestroy, computed, input, signal, untracked } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
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

@Component({
    selector: 'app-sync-chess-game',
    templateUrl: './sync-chess-game.component.html',
    styleUrls: ['./sync-chess-game.component.scss'],
    imports: [ChessBoardComponent, ChessPromotionComponent, MatButtonModule, ChessPieceComponent],
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

    public turnType(): string {
        const turnType: TurnType = this.gameSession().game.getTurnType();
        switch (turnType) {
            case TurnType.MOVE_SYNC:
                return 'Synchronisé';
            case TurnType.MOVE_INTERMEDIATE:
                return 'Intermédiaire';
            case TurnType.CHOICE_PROMOTION:
                return 'Promotion';
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

    public whiteLastMove(): string {
        const action: MoveTurnAction | null = this.gameSession().game.lastMoveTurnAction();
        return action === null ? '' : this.formatLastMove(action.whiteMove);
    }

    public blackLastMove(): string {
        const action: MoveTurnAction | null = this.gameSession().game.lastMoveTurnAction();
        return action === null ? '' : this.formatLastMove(action.blackMove);
    }

    public displayBlackInteractions(): boolean {
        return this.gameSession().playingColor === PieceColor.BLACK && !this.gameSession().game.isGameOver();
    }

    public displayWhiteInteractions(): boolean {
        return this.gameSession().playingColor === PieceColor.WHITE && !this.gameSession().game.isGameOver();
    }

    public resultText(): string {
        const result: GameResult | null = this.gameSession().game.result();

        if (result === null) {
            return '';
        }

        switch (result.reason) {
            case GameEndReason.CHECKMATE:
                return `Échec et mat : victoire des ${ result.winner === PieceColor.WHITE ? 'blancs' : 'noirs' }`;
            case GameEndReason.KING_CAPTURED:
                return result.winner === PieceColor.NONE
                    ? 'Match nul : les deux rois ont été capturés'
                    : `Roi capturé : victoire des ${ result.winner === PieceColor.WHITE ? 'blancs' : 'noirs' }`;
            case GameEndReason.DOUBLE_CHECKMATE:
                return 'Match nul : échec et mat des deux joueurs';
            case GameEndReason.STALEMATE:
                return 'Match nul : pat, un joueur ne peut plus bouger';
            case GameEndReason.THREEFOLD_REPETITION:
                return 'Match nul : la même position s\'est répétée trois fois';
            case GameEndReason.FIFTY_TURNS:
                return 'Match nul : 50 tours sans mouvement de pion ni prise';
            case GameEndReason.INSUFFICIENT_MATERIAL:
                return 'Match nul : plus assez de pièces pour mater';
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

    private formatLastMove(move: Move | null): string {
        if (move === null) {
            return 'a passé';
        }
        const from: string = `${ move.from[0].toUpperCase() }${ move.from[1] }`;
        const to: string = `${ move.to[0].toUpperCase() }${ move.to[1] }`;

        return `${ from } -> ${ to }`;
    }
}
