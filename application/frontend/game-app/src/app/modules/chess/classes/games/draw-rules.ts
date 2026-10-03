import ChessBoardHelper from '../../helpers/chess-board-helper';
import { FenPiece } from '../../enums/fen-piece.enum';
import { PieceType } from '../../enums/piece-type.enum';
import { FenBoard } from '@app/modules/chess/types/fen-board';
import Move from '../../interfaces/move';
import { GameEndReason } from './game-result';

/**
 * The draws the history of the game decides, kept from the positions starting the synchronous turns. A synchronous turn
 * and the intermediate turns following it are a pair of moves of the conventional rules.
 */
export class DrawRules {
    private static readonly REPETITIONS: number = 3;
    private static readonly QUIET_TURNS: number = 50;

    /** The positions starting a synchronous turn since the latest pawn move or capture, with their count */
    private readonly positions = new Map<string, number>();
    private quietTurns: number = 0;
    private irreversible: boolean = false;

    /** A pawn move or a capture can not be undone: no former position can come back */
    public recordMoves(previousBoard: FenBoard, board: FenBoard, moves: ReadonlyArray<Move>): void {
        // A pawn which left its square: a move refused by the game changes nothing
        const isPawnMove: boolean = moves.some((move: Move) => {
            const piece: FenPiece = ChessBoardHelper.getFenPiece(previousBoard, move.from);
            return ChessBoardHelper.pieceType(piece) === PieceType.PAWN && ChessBoardHelper.getFenPiece(board, move.from) !== piece;
        });

        if (isPawnMove || DrawRules.pieceCount(board) < DrawRules.pieceCount(previousBoard)) {
            this.irreversible = true;
        }
    }

    /**
     * Records the position starting a synchronous turn
     *
     * @param castling the castling rights of both players, part of the position
     */
    public recordPosition(board: FenBoard, castling: string): void {
        if (this.irreversible) {
            this.positions.clear();
            this.quietTurns = 0;
            this.irreversible = false;
        } else if (this.positions.size > 0) {
            this.quietTurns++;
        }

        const key: string = `${ board.map((row: ReadonlyArray<FenPiece>) => row.map((piece: FenPiece) => piece || '.').join('')).join('/') } ${ castling }`;
        this.positions.set(key, (this.positions.get(key) ?? 0) + 1);
    }

    /** The draw of the position recorded last, if any */
    public draw(board: FenBoard): GameEndReason | null {
        if (DrawRules.isInsufficientMaterial(board)) {
            return GameEndReason.INSUFFICIENT_MATERIAL;
        }

        if ([...this.positions.values()].some((count: number) => count >= DrawRules.REPETITIONS)) {
            return GameEndReason.THREEFOLD_REPETITION;
        }

        if (this.quietTurns >= DrawRules.QUIET_TURNS) {
            return GameEndReason.FIFTY_TURNS;
        }

        return null;
    }

    /**
     * No checkmate is possible with the kings alone, with a single knight or bishop, or with bishops all on squares of
     * the same color
     */
    public static isInsufficientMaterial(board: FenBoard): boolean {
        const pieces: Array<{ type: PieceType; squareColor: number }> = board.flatMap((row: ReadonlyArray<FenPiece>, y: number) => row
            .map((piece: FenPiece, x: number) => ({ type: ChessBoardHelper.pieceType(piece), squareColor: (x + y) % 2 }))
            .filter(({ type }) => type !== PieceType.NONE && type !== PieceType.KING));

        if (pieces.length === 1 && pieces[0].type === PieceType.KNIGHT) {
            return true;
        }

        return pieces.every(({ type, squareColor }) => type === PieceType.BISHOP && squareColor === pieces[0].squareColor);
    }

    private static pieceCount(board: FenBoard): number {
        return board.flat().filter((piece: FenPiece) => piece !== FenPiece.EMPTY).length;
    }
}
