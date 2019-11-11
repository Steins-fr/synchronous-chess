import Vec2 from 'vec2';
import { FenBoard } from 'src/app/helpers/chess-helper';
import Move, { MoveType } from './move';
import MoveCondition from './move-conditions/move-condition';

export interface ConditionalMoveConfiguration {
    move: Move;
    conditions: Array<MoveCondition>;
}

export default class ConditionalMove extends Move {
    private constructor(public readonly move: Move, public readonly conditions: Array<MoveCondition>) {
        super(MoveType.CONDITIONAL);
    }

    public static build(...moves: Array<ConditionalMoveConfiguration>): Array<ConditionalMove> {
        return moves.map((conditionalMove: ConditionalMoveConfiguration) => ConditionalMove.buildOne(conditionalMove));
    }

    public static buildOne(conditionalMove: ConditionalMoveConfiguration): ConditionalMove {
        return new ConditionalMove(conditionalMove.move, conditionalMove.conditions);
    }

    public possiblePlays(position: Vec2, board: FenBoard): Array<Vec2> {
        return this.move.possiblePlays(position, board).filter((newPosition: Vec2) =>
            this.conditions.every((condition: MoveCondition) => condition.canMove(position, newPosition, board))
        );
    }
}
