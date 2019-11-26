import SynchroneTurnAction from './turn-actions/synchrone-turn-action';
import TurnType from './turn.types';
import Move from '../interfaces/move';
import { PieceColor } from '../rules/chess-rules';
import MoveTurn from './move-turn';

export default class SynchroneTurn extends MoveTurn<SynchroneTurnAction> {

    public action: SynchroneTurnAction = {};

    public constructor() {
        super(TurnType.MOVE_SYNCHRONE);
    }

    public canBeExecuted(): boolean {
        return this.isFilled(PieceColor.WHITE) && this.isFilled(PieceColor.BLACK);
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

        return true;
    }
}
