import MovementCondition from '@app/classes/chess/movements/movement-conditions/movement-condition';
import { Vec2 } from '@app/classes/vector/vec2';
import { FenBoard } from '@app/classes/chess/types/fen-board';
import { FenPiece } from '../../enums/fen-piece.enum';

export class DoNotApproachMovementCondition extends MovementCondition {
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
        return !fearedPieces.some((fearedPiece: Vec2) => fearedPiece.distanceVec(newPosition) < this.distance);
    }
}
