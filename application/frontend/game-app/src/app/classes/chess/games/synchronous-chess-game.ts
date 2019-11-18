import ChessBoardHelper, { CellBoard, Column } from 'src/app/helpers/chess-board-helper';
import Piece, { PieceColor, PieceType } from '../piece/piece';
import SynchronousChessRules from '../rules/synchronous-chess-rules';
import Vec2 from 'vec2';
import Cell from '../board/cell';
import ChessRules from '../rules/chess-rules';

export type Position = Array<number>;

export default class SynchronousChessGame {
    public cells: CellBoard = ChessBoardHelper.createCellBoard();
    private readonly whiteRules: SynchronousChessRules = new SynchronousChessRules(PieceColor.WHITE);
    private readonly blackRules: SynchronousChessRules = new SynchronousChessRules(PieceColor.BLACK);

    private getRules(color: PieceColor): SynchronousChessRules {
        return color === PieceColor.BLACK ? this.blackRules : this.whiteRules;
    }

    private kingPlay(from: Vec2, to: Vec2, rules: ChessRules): void {
        // If this is a king move, check if it is a castling
        if (from.distance(to) === 2) {
            // The king has moved twice, this is a castling
            const castlingRook: Column = ChessBoardHelper.castlingRook(from, to);
            const rookCell: Cell = ChessBoardHelper.getCell(this.cells, new Vec2([castlingRook, from.y]));
            const rookNewCell: Cell = ChessBoardHelper.getCell(this.cells, from.add(to.subtract(from, true).divide(2, 2, true), true));
            rookNewCell.piece = rookCell.piece;
            rookCell.piece = undefined;
        }
        rules.isQueenSideCastleAvailable = false;
        rules.isKingSideCastelAvailable = false;
    }

    private rookPlay(from: Vec2, rules: ChessRules): void {
        switch (from.x) {
            case Column.A:
                rules.isQueenSideCastleAvailable = false;
                break;
            case Column.H:
                rules.isKingSideCastelAvailable = false;
                break;
        }
    }

    public applyPlay(fromPosition: Position, toPosition: Position): boolean {
        const from: Vec2 = new Vec2(fromPosition);
        const to: Vec2 = new Vec2(toPosition);

        const fromCell: Cell = ChessBoardHelper.getCell(this.cells, from);
        const toCell: Cell = ChessBoardHelper.getCell(this.cells, to);

        const rules: ChessRules = this.getRules(fromCell.piece.color);

        const playIsValid: boolean = rules.getPossiblePlays(fromCell.piece.type, from, ChessBoardHelper.toSimpleBoard(this.cells))
            .some((posPlay: Vec2) => posPlay.equal(to.x, to.y));

        if (playIsValid === false) {
            return false;
        }

        toCell.piece = fromCell.piece;
        fromCell.piece = undefined;

        switch (toCell.piece.type) {
            case PieceType.KING:
                this.kingPlay(from, to, rules);
                break;
            case PieceType.ROOK:
                this.rookPlay(from, rules);
                break;
        }

        return playIsValid;
    }

    public highlightValidMoves(cellPos: Vec2): void {
        const cell: Cell = ChessBoardHelper.getCell(this.cells, cellPos);
        const piece: Piece = cell.piece;
        const rules: SynchronousChessRules = this.getRules(piece.color);

        rules.getPossiblePlays(piece.type, cellPos, ChessBoardHelper.toSimpleBoard(this.cells)).forEach((posPlay: Vec2) => {
            ChessBoardHelper.getCell(this.cells, posPlay).validMove = true;
        });
    }

    public resetHighlight(): void {
        this.cells.forEach((row: Array<Cell>) => row.forEach((cell: Cell) => cell.validMove = false));
    }
}
