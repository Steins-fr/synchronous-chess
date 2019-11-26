import IntermediateTurnAction from './turn-actions/intermediate-turn-action';
import Turn from './turn';
import TurnType from './turn.types';
import Move from '../interfaces/move';
import { PieceColor } from '../rules/chess-rules';

export class IntermediateTurn extends Turn<IntermediateTurnAction> {

    public constructor(public action: IntermediateTurnAction,
        public readonly lastWhiteMove: Move | null = null,
        public readonly lastBlackMove: Move | null = null) {
        super(TurnType.INTERMEDIATE);
        if (this.action.blackTarget === null) {
            this.action.blackMove = null;
        }
        if (this.action.whiteTarget === null) {
            this.action.whiteMove = null;
        }
    }

    public canBeExecuted(): boolean {
        return this.isFilled(PieceColor.WHITE) && this.isFilled(PieceColor.BLACK);
    }

    public registerMove(move: Move, color: PieceColor): void {
        if (color === PieceColor.WHITE && this.action.whiteTarget !== null) {
            this.action.whiteMove = move;
        } else if (color === PieceColor.BLACK && this.action.blackTarget !== null) {
            this.action.blackMove = move;
        }
    }

    public isFilled(color: PieceColor): boolean {
        if (color === PieceColor.WHITE) {
            return this.action.whiteTarget === null || this.action.whiteMove !== undefined;
        } else if (color === PieceColor.BLACK) {
            return this.action.blackTarget === null || this.action.blackMove !== undefined;
        }

        return true;
    }
}
