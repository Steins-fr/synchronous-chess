import TurnType, { TurnCategory } from './turn.types';
import Move from '../../interfaces/move';
import MoveTurnAction from './turn-actions/move-turn-action';
import Turn from './turn';
import { PieceColor } from '../../enums/piece-color.enum';

export default abstract class MoveTurn<T extends MoveTurnAction = MoveTurnAction> extends Turn<T> {

    public abstract override readonly action: T;

    protected constructor(type: TurnType) {
        super(type, TurnCategory.MOVE);
    }

    public abstract registerMove(move: Move | null, color: PieceColor): void;
}
