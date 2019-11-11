import ChessRules from './chess-rules';
import Move from '../moves/move';
import LinearMove from '../moves/linear-move';
import HopMove from '../moves/hop-move';
import Piece, { PieceType } from '../piece/piece';

export default abstract class SynchronousChessRules extends ChessRules {

    public readonly queenMove: Array<Move> = LinearMove.build(
        [0, 1], [0, -1], [1, 0], [-1, 0],
        [1, 1], [-1, -1], [1, -1], [-1, 1]
    );

    public readonly bishopMove: Array<Move> = LinearMove.build(
        [1, 1], [-1, -1], [1, -1], [-1, 1]
    );

    public readonly knightMove: Array<Move> = HopMove.build(
        [1, 2], [2, 1],
        [-1, 2], [2, -1],
        [1, -2], [-2, 1],
        [-1, -2], [-2, -1]
    );

    public readonly rookMove: Array<Move> = LinearMove.build(
        [0, 1], [0, -1], [1, 0], [-1, 0]
    );
}
