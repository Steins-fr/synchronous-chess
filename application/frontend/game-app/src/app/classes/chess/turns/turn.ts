import TurnType from './turn.types';
import TurnAction from './turn-actions/turn-action';
import { PieceColor } from '../rules/chess-rules';
import Move from '../interfaces/move';

export default abstract class Turn<T extends TurnAction = TurnAction> {

    public isDone: boolean = false;
    public abstract readonly action: T;

    public constructor(public readonly type: TurnType) { }

    public abstract canBeExecuted(): boolean;
    public abstract registerMove(move: Move, color: PieceColor): void;
    public abstract isFilled(color: PieceColor): boolean;
}
