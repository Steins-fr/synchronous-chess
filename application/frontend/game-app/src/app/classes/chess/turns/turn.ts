import TurnType, { TurnCategory } from './turn.types';
import TurnAction from './turn-actions/turn-action';
import { PieceColor } from '../rules/chess-rules';

export default abstract class Turn<T extends TurnAction = TurnAction> {

    public isDone: boolean = false;
    public abstract readonly action: T;

    protected constructor(public readonly type: TurnType, public readonly category: TurnCategory) { }

    public abstract canBeExecuted(): boolean;
    public abstract isFilled(color: PieceColor): boolean;
}
