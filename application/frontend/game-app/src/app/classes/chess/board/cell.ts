import Piece from '../piece/piece';

export default class Cell {

    public validMove: boolean = false;

    public constructor(public piece: Piece | null = null) { }
}
