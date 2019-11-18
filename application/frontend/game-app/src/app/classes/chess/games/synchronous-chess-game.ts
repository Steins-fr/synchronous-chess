import ChessBoardHelper, { Column, FenBoard } from 'src/app/helpers/chess-board-helper';
import SynchronousChessRules from '../rules/synchronous-chess-rules';
import Vec2 from 'vec2';
import ChessRules, { PieceColor, FenPiece, PieceType } from '../rules/chess-rules';

export type Position = Array<number>;

export default class SynchronousChessGame {
    public fenBoard: FenBoard = ChessBoardHelper.createFenBoard();
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
            const rookEmplacement: Vec2 = new Vec2([castlingRook, from.y]);
            const rookNewEmplacement: Vec2 = from.add(to.subtract(from, true).divide(2, 2, true), true);

            this.fenBoard[rookNewEmplacement.y][rookNewEmplacement.x] = ChessBoardHelper.getFenPiece(this.fenBoard, rookEmplacement);
            this.fenBoard[rookEmplacement.y][rookEmplacement.x] = FenPiece.EMPTY;
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

        const fromPiece: FenPiece = ChessBoardHelper.getFenPiece(this.fenBoard, from);
        const toPiece: FenPiece = ChessBoardHelper.getFenPiece(this.fenBoard, to);

        const rules: ChessRules = this.getRules(ChessBoardHelper.pieceColor(fromPiece));

        const playIsValid: boolean = rules.getPossiblePlays(ChessBoardHelper.pieceType(fromPiece), from, ChessBoardHelper.clone(this.fenBoard))
            .some((posPlay: Vec2) => posPlay.equal(to.x, to.y));

        if (playIsValid === false) {
            return false;
        }

        this.fenBoard[to.y][to.x] = fromPiece;
        this.fenBoard[from.y][from.x] = FenPiece.EMPTY;

        switch (ChessBoardHelper.pieceType(toPiece)) {
            case PieceType.KING:
                this.kingPlay(from, to, rules);
                break;
            case PieceType.ROOK:
                this.rookPlay(from, rules);
                break;
        }

        return playIsValid;
    }

    public getPossiblePlays(position: Vec2): Array<Vec2> {
        const fenPiece: FenPiece = ChessBoardHelper.getFenPiece(this.fenBoard, position);
        const rules: SynchronousChessRules = this.getRules(ChessBoardHelper.pieceColor(fenPiece));

        return rules.getPossiblePlays(ChessBoardHelper.pieceType(fenPiece), position, ChessBoardHelper.clone(this.fenBoard));
    }
}
