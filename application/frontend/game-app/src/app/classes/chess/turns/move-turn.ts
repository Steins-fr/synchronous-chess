import TurnType, { TurnCategory } from './turn.types';
import { PieceColor } from '../rules/chess-rules';
import Move from '../interfaces/move';
import MoveTurnAction from './turn-actions/move-turn-action';
import Turn from './turn';

export default abstract class MoveTurn<T extends MoveTurnAction = MoveTurnAction> extends Turn<T> {

    public abstract readonly action: T;

    public constructor(public readonly type: TurnType) {
        super(type, TurnCategory.MOVE);
    }

    public abstract registerMove(move: Move, color: PieceColor): void;
}
