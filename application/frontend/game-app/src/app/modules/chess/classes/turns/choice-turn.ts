import TurnType, { TurnCategory } from './turn.types';
import Turn from './turn';
import ChoiceTurnAction from './turn-actions/choice-turn-action';
import { PieceColor } from '../../enums/piece-color.enum';

export default abstract class ChoiceTurn<T extends ChoiceTurnAction = ChoiceTurnAction> extends Turn<T> {

    protected constructor(type: TurnType, public readonly nextTurn: Turn) {
        super(type, TurnCategory.CHOICE);
    }

    public abstract registerChoice(choice: unknown, color: PieceColor): void;
}
