import TurnType, { TurnCategory } from './turn.types';
import { PieceColor } from '../rules/chess-rules';
import Turn from './turn';
import ChoiceTurnAction from './turn-actions/choice-turn-action';

export default abstract class ChoiceTurn<T extends ChoiceTurnAction = ChoiceTurnAction> extends Turn<T> {

    public abstract readonly action: T;

    public constructor(public readonly type: TurnType, public readonly nextTurn: Turn) {
        super(type, TurnCategory.CHOICE);
    }

    public abstract registerChoice(choice: unknown, color: PieceColor): void;
}
