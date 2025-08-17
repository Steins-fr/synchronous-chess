import TurnAction from './turn-action';
import Move from '../../../interfaces/move';

export default interface MoveTurnAction extends TurnAction {
    whiteMove: Move | null;
    blackMove: Move | null;
}
