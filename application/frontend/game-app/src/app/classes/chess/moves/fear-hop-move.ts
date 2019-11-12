import Move, { MoveType } from './move';
import Vec2 from 'vec2';
import ChessHelper, { FenBoard } from 'src/app/helpers/chess-helper';
import { FenPiece, PieceColor } from '../piece/piece';
import MoveCondition from './move-conditions/move-condition';

export interface FearHopMoveObject {
    vector: Array<number>;
    dontApproche: FenPiece;
}

export default class FearHopMove extends Move {
    private constructor(vector: Vec2, public readonly dontApproche: FenPiece, conditions: Array<MoveCondition>) {
        super(MoveType.FEAR_HOP, vector, conditions);
        super.validVector();
    }

    public static build(...moves: Array<FearHopMoveObject>): Array<FearHopMove> {
        return moves.map((move: FearHopMoveObject) => new FearHopMove(new Vec2(move.vector), move.dontApproche, []));
    }

    private findFearedPieces(board: FenBoard): Array<Vec2> {
        const fearedPieces: Array<Vec2> = [];

        board.forEach((row: Array<FenPiece>, y: number) => row.forEach((piece: FenPiece, x: number) => {
            if (piece === this.dontApproche) {
                fearedPieces.push(new Vec2(x, y));
            }
        }));

        return fearedPieces;
    }

    protected _possiblePlays(position: Vec2, board: FenBoard): Array<Vec2> {
        this.validPosition(position, board);

        const plays: Array<Vec2> = [];
        const fearedPieces: Array<Vec2> = this.findFearedPieces(board);
        const myColor: PieceColor = ChessHelper.pieceColor(ChessHelper.getFenPiece(board, position));
        const newPosition: Vec2 = position.add(this.vector, true);
        const destinationFenPiece: FenPiece = ChessHelper.getFenPiece(board, newPosition);

        // If we stop on the board, we can move if the destination is empty or occupied by an opponent piece
        if (ChessHelper.isOutOfBoard(newPosition) === false
            && (
                destinationFenPiece === FenPiece.EMPTY
                || ChessHelper.pieceColor(destinationFenPiece) !== myColor)
        ) {
            if (fearedPieces.some((fearedPiece: Vec2) => fearedPiece.distance(newPosition) < 2) === false) {
                plays.push(newPosition);
            }
        }

        return plays;
    }
}
