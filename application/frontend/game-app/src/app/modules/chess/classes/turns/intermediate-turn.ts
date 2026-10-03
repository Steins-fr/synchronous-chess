import IntermediateTurnAction from './turn-actions/intermediate-turn-action';
import TurnType from './turn.types';
import Move, { FenCoordinate } from '../../interfaces/move';
import MoveTurn from './move-turn';
import { PieceColor } from '../../enums/piece-color.enum';

export class IntermediateTurn extends MoveTurn<IntermediateTurnAction> {

    // A null move is a pass, which has to be distinguished from a move not played yet
    private readonly passedColors = new Set<PieceColor>();

    /**
     * @param movedPieces the cells of the pieces which already moved during this intermediate phase, which can not move
     * again (rule A); a piece moved in the synchronous turn before the phase may move once
     */
    public constructor(public action: IntermediateTurnAction,
        public readonly movedPieces: ReadonlyArray<FenCoordinate> = []) {
        super(TurnType.MOVE_INTERMEDIATE);
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

    public override registerMove(move: Move | null, color: PieceColor): void {
        if (color === PieceColor.WHITE && this.action.whiteTarget !== null) {
            this.action.whiteMove = move;
        } else if (color === PieceColor.BLACK && this.action.blackTarget !== null) {
            this.action.blackMove = move;
        } else {
            return;
        }

        if (move === null) {
            this.passedColors.add(color);
        } else {
            this.passedColors.delete(color);
        }
    }

    public isFilled(color: PieceColor): boolean {
        if (color === PieceColor.WHITE) {
            return this.action.whiteTarget === null || this.action.whiteMove !== null || this.passedColors.has(color);
        } else if (color === PieceColor.BLACK) {
            return this.action.blackTarget === null || this.action.blackMove !== null || this.passedColors.has(color);
        }

        return true;
    }
}
