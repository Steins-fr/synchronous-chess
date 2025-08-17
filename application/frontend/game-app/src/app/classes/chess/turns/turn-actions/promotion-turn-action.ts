import ChoiceTurnAction from './choice-turn-action';
import { FenCoordinate } from '../../interfaces/move';
import { PieceType } from '../../enums/piece-type.enum';

export default interface PromotionTurnAction extends ChoiceTurnAction {
    whiteFenCoordinate: FenCoordinate | null;
    blackFenCoordinate: FenCoordinate | null;
    whitePiece: PieceType | null;
    blackPiece: PieceType | null;
}
