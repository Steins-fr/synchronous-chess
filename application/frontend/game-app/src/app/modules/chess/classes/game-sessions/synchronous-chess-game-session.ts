import { Signal, signal } from '@angular/core';
import { FenBoard } from '@app/modules/chess/types/fen-board';
import SynchronousChessGame from '../games/synchronous-chess-game';
import CoordinateMove from '../../interfaces/CoordinateMove';
import Move from '../../interfaces/move';
import { PieceColor } from '../../enums/piece-color.enum';
import ChessBoardHelper from '@app/modules/chess/helpers/chess-board-helper';
import { PieceType } from '../../enums/piece-type.enum';

/** The players seated at the board */
export interface SessionConfiguration {
    whitePlayer?: string;
    blackPlayer?: string;
}

export default abstract class SynchronousChessGameSession {

    public readonly game: SynchronousChessGame = new SynchronousChessGame();
    public readonly board: Signal<FenBoard> = this.game.fenBoard;
    private readonly _movePreview = signal<Readonly<CoordinateMove> | undefined>(undefined);
    public readonly movePreview = this._movePreview.asReadonly();
    private readonly _configuration = signal<Readonly<SessionConfiguration>>({});
    public readonly configuration = this._configuration.asReadonly();
    public abstract readonly spectatorNumber: Signal<number>;
    /** Whether the participants can still take or leave a seat */
    public abstract readonly seatsOpen: Signal<boolean>;

    /** The number of turns run, the same for every participant applying the same moves */
    protected turnCount: number = 0;

    public abstract myColor: PieceColor;

    public abstract get playingColor(): PieceColor;

    protected setConfiguration(configuration: Readonly<SessionConfiguration>): void {
        this._configuration.set(configuration);
    }

    protected runMove(color: PieceColor, move: Move | null): boolean {
        if (move !== null && ChessBoardHelper.pieceColor(ChessBoardHelper.getFenPiece(this.game.fenBoard(), move.from)) !== color) {
            return false;
        }

        if (!this.game.registerMove(move, color)) {
            return false;
        }

        if (move !== null && color === this.myColor) {
            this._movePreview.set(ChessBoardHelper.fromMoveToCoordinateMove(move));
        }

        if (this.game.runTurn()) {
            this.turnCount++;
            this._movePreview.set(undefined);
        }

        return true;
    }

    protected runPromotion(color: PieceColor, pieceType: PieceType): boolean {

        if (!this.game.promote(pieceType, color)) {
            return false;
        }

        if (this.game.runTurn()) {
            this.turnCount++;
        }

        return true;
    }

    public abstract takeSeat(color: PieceColor): void;
    public abstract leaveSeat(): void;
    public abstract move(move: Move | null): void;
    public abstract promote(pieceType: PieceType): void;
    public abstract destroy(): void;
}
