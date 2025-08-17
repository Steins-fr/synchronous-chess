import { FenCoordinate } from '../../../interfaces/move';
import MoveTurnAction from './move-turn-action';

export default interface IntermediateTurnAction extends MoveTurnAction {
    whiteTarget: FenCoordinate | null;
    blackTarget: FenCoordinate | null;
}
