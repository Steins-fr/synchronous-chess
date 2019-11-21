import TurnAction from './turn-action';
import Move from '../../interfaces/move';

export default interface SynchroneTurnAction extends TurnAction {
    whiteMove?: Move;
    blackMove?: Move;
}
