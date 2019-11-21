import Turn from './turn';
import SynchroneTurnAction from './turn-actions/synchrone-turn-action';
import TurnType from './turn.types';
import Move from '../interfaces/move';
import { PieceColor } from '../rules/chess-rules';

export default class SynchroneTurn extends Turn<SynchroneTurnAction> {

    public action: SynchroneTurnAction = {};

    public constructor() {
        super(TurnType.SYNCHRONE);
    }

    public canBeExecuted(): boolean {
        return this.action.blackMove !== undefined && this.action.whiteMove !== undefined;
    }

    public registerMove(move: Move, color: PieceColor): void {
        if (color === PieceColor.WHITE) {
            this.action.whiteMove = move;
        } else if (color === PieceColor.BLACK) {
            this.action.blackMove = move;
        }
    }

    public isFilled(color: PieceColor): boolean {
        if (color === PieceColor.WHITE) {
            return this.action.whiteMove !== undefined;
        } else if (color === PieceColor.BLACK) {
            return this.action.blackMove !== undefined;
        }

        return false;
    }
}
