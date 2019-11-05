import Piece from '../piece/piece';

export default class Cell {

    public dragHover: boolean = false;

    public constructor(public piece: Piece | null = null) { }
}
