import ChessBoardHelper, { FenBoard } from 'src/app/helpers/chess-board-helper';
import SynchronousChessRules from '../rules/synchronous-chess-rules';
import Vec2 from 'vec2';
import ChessRules, { PieceColor, FenPiece, PieceType } from '../rules/chess-rules';
import Move from '../interfaces/move';
import { Column } from '../interfaces/CoordinateMove';
import Turn from '../turns/turn';
import SynchroneTurn from '../turns/synchrone-turn';
import TurnType from '../turns/turn.types';

export default class SynchronousChessGame {
    private _fenBoard: FenBoard = ChessBoardHelper.createFenBoard();
    public readonly whiteRules: SynchronousChessRules = new SynchronousChessRules(PieceColor.WHITE);
    public readonly blackRules: SynchronousChessRules = new SynchronousChessRules(PieceColor.BLACK);
    protected turn: Turn = new SynchroneTurn();

    protected getRules(color: PieceColor): SynchronousChessRules {
        return color === PieceColor.BLACK ? this.blackRules : this.whiteRules;
    }

    public get fenBoard(): FenBoard {
        return this._fenBoard;
    }

    public load(fenBoard: FenBoard): void {
        this._fenBoard = ChessBoardHelper.cloneBoard(fenBoard);
    }

    private kingPlay(from: Vec2, to: Vec2, rules: ChessRules): void {
        // If this is a king move, check if it is a castling
        if (from.distance(to) === 2) {
            // The king has moved twice, this is a castling
            const castlingRook: Column = ChessBoardHelper.castlingRook(from, to);
            const rookEmplacement: Vec2 = new Vec2([castlingRook, from.y]);
            const rookNewEmplacement: Vec2 = from.add(to.subtract(from, true).divide(2, 2, true), true);

            this._fenBoard = ChessBoardHelper.setFenPiece(this._fenBoard, rookNewEmplacement, ChessBoardHelper.getFenPiece(this._fenBoard, rookEmplacement));
            this._fenBoard = ChessBoardHelper.setFenPiece(this._fenBoard, rookEmplacement, FenPiece.EMPTY);
        }
        rules.isQueenSideCastleAvailable = false;
        rules.isKingSideCastleAvailable = false;
    }

    private rookPlay(from: Vec2, rules: ChessRules): void {
        switch (from.x) {
            case Column.A:
                rules.isQueenSideCastleAvailable = false;
                break;
            case Column.H:
                rules.isKingSideCastleAvailable = false;
                break;
        }
    }

    public isMoveValid(move: Move): boolean {
        const from: Vec2 = new Vec2(ChessBoardHelper.fenCoordinateToPosition(move.from));
        const to: Vec2 = new Vec2(ChessBoardHelper.fenCoordinateToPosition(move.to));

        if (ChessBoardHelper.getFenPiece(this._fenBoard, from) === FenPiece.EMPTY) {
            return false;
        }

        return this.getPossiblePlays(from).some((posPlay: Vec2) => posPlay.equal(to.x, to.y));
    }

    public registerMove(move: Move, color: PieceColor): boolean {
        if (this.isMoveValid(move) === false) {
            return false;
        }

        this.turn.registerMove(move, color);

        return true;
    }

    public colorHasPlayed(color: PieceColor): boolean {
        return this.turn.isFilled(color);
    }

    public runTurn(): boolean {
        if (this.turn.canBeExecuted() === false) {
            return false;
        }

        if (this.turn.type === TurnType.SYNCHRONE) {
            const synchroneTurn: SynchroneTurn = this.turn as SynchroneTurn;
            this.runMove(synchroneTurn.action.whiteMove);
            this.runMove(synchroneTurn.action.blackMove);
        }

        this.turn.isDone = true;
        this.turn = new SynchroneTurn();

        return true;
    }

    protected runMove(move: Move): void {
        if (this.isMoveValid(move) === false) {
            return;
        }

        const from: Vec2 = new Vec2(ChessBoardHelper.fenCoordinateToPosition(move.from));
        const to: Vec2 = new Vec2(ChessBoardHelper.fenCoordinateToPosition(move.to));

        const fromPiece: FenPiece = ChessBoardHelper.getFenPiece(this._fenBoard, from);
        const rules: ChessRules = this.getRules(ChessBoardHelper.pieceColor(fromPiece));

        this._fenBoard = ChessBoardHelper.setFenPiece(this._fenBoard, to, fromPiece);
        this._fenBoard = ChessBoardHelper.setFenPiece(this._fenBoard, from, FenPiece.EMPTY);

        switch (ChessBoardHelper.pieceType(fromPiece)) {
            case PieceType.KING:
                this.kingPlay(from, to, rules);
                break;
            case PieceType.ROOK:
                this.rookPlay(from, rules);
                break;
        }
    }

    public getPossiblePlays(position: Vec2): Array<Vec2> {
        const fenPiece: FenPiece = ChessBoardHelper.getFenPiece(this._fenBoard, position);
        const rules: SynchronousChessRules = this.getRules(ChessBoardHelper.pieceColor(fenPiece));

        return rules.getPossiblePlays(ChessBoardHelper.pieceType(fenPiece), position, ChessBoardHelper.cloneBoard(this._fenBoard));
    }
}
