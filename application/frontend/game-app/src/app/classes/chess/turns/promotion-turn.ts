import ChoiceTurn from './choice-turn';
import PromotionTurnAction from './turn-actions/promotion-turn-action';
import TurnType from './turn.types';
import { PieceColor, PieceType } from '../rules/chess-rules';
import Turn from './turn';

export default class PromotionTurn extends ChoiceTurn<PromotionTurnAction> {

    public constructor(public action: PromotionTurnAction, nextTurn: Turn) {
        super(TurnType.CHOICE_PROMOTION, nextTurn);
        if (this.action.blackFenCoordinate === null) {
            this.action.blackPiece = null;
        }
        if (this.action.whiteFenCoordinate === null) {
            this.action.whitePiece = null;
        }
    }

    public canBeExecuted(): boolean {
        return this.isFilled(PieceColor.WHITE) && this.isFilled(PieceColor.BLACK);
    }

    public registerChoice(piece: PieceType, color: PieceColor): void {
        if (color === PieceColor.WHITE && this.action.whiteFenCoordinate !== null) {
            this.action.whitePiece = piece;
        } else if (color === PieceColor.BLACK && this.action.blackFenCoordinate !== null) {
            this.action.blackPiece = piece;
        }
    }

    public isFilled(color: PieceColor): boolean {
        if (color === PieceColor.WHITE) {
            return !this.action.whiteFenCoordinate || this.action.whitePiece !== null;
        } else if (color === PieceColor.BLACK) {
            return !this.action.blackFenCoordinate || this.action.blackPiece !== null;
        }

        return true;
    }
}
