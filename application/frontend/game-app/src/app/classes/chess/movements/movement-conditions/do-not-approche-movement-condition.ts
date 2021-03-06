import { FenPiece } from '../../rules/chess-rules';
import Vec2 from 'vec2';
import { FenBoard } from '../../../../helpers/chess-board-helper';
import MovementCondition from './movement-condition';

export class DoNotApprocheMovementCondition extends MovementCondition {
    public constructor(public readonly fenPiece: FenPiece, public readonly distance: number) {
        super();
    }

    private findFearedPieces(board: FenBoard): Array<Vec2> {
        const fearedPieces: Array<Vec2> = [];

        board.forEach((row: Array<FenPiece>, y: number) => row.forEach((piece: FenPiece, x: number) => {
            if (piece === this.fenPiece) {
                fearedPieces.push(new Vec2(x, y));
            }
        }));

        return fearedPieces;
    }

    public canMove(_oldPosition: Vec2, newPosition: Vec2, board: FenBoard): boolean {
        const fearedPieces: Array<Vec2> = this.findFearedPieces(board);
        return fearedPieces.some((fearedPiece: Vec2) => fearedPiece.distance(newPosition) < this.distance) === false;
    }
}
