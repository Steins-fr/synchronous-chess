import ChessBoardHelper, { FenBoard } from 'src/app/helpers/chess-board-helper';
import SynchronousChessRules from '../rules/synchronous-chess-rules';
import Vec2 from 'vec2';
import ChessRules, { PieceColor, FenPiece, PieceType } from '../rules/chess-rules';
import Move, { FenCoordinate, FenColumn } from '../interfaces/move';
import { Column } from '../interfaces/CoordinateMove';
import Turn from '../turns/turn';
import SynchroneTurn from '../turns/synchrone-turn';
import TurnType from '../turns/turn.types';
import SynchroneTurnAction from '../turns/turn-actions/synchrone-turn-action';

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

    private kingMoved(move: Move, rules: ChessRules): void {
        const from: Vec2 = ChessBoardHelper.fenCoordinateToVec2(move.from);
        const to: Vec2 = ChessBoardHelper.fenCoordinateToVec2(move.to);
        // If this is a king move, check if it is a castling
        if (from.distance(to) === 2) {
            // The king has moved twice, this is a castling
            const castlingRook: Column = ChessBoardHelper.castlingRook(from, to);
            const rookEmplacement: Vec2 = new Vec2([castlingRook, from.y]);
            const rookNewEmplacement: Vec2 = from.add(to.subtract(from, true).divide(2, 2, true), true);

            this._fenBoard = ChessBoardHelper.setFenPieceByVec(this._fenBoard, rookNewEmplacement, ChessBoardHelper.getFenPieceByVec(this._fenBoard, rookEmplacement));
            this._fenBoard = ChessBoardHelper.setFenPieceByVec(this._fenBoard, rookEmplacement, FenPiece.EMPTY);
        }
        rules.isQueenSideCastleAvailable = false;
        rules.isKingSideCastleAvailable = false;
    }

    private rookMoved(move: Move, rules: ChessRules): void {
        switch (move.from[0]) {
            case FenColumn.A:
                rules.isQueenSideCastleAvailable = false;
                break;
            case FenColumn.H:
                rules.isKingSideCastleAvailable = false;
                break;
        }
    }

    public isMoveValid(move: Move): boolean {
        const from: Vec2 = new Vec2(ChessBoardHelper.fenCoordinateToCoordinate(move.from));
        const to: Vec2 = new Vec2(ChessBoardHelper.fenCoordinateToCoordinate(move.to));

        if (ChessBoardHelper.getFenPieceByVec(this._fenBoard, from) === FenPiece.EMPTY) {
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
            this.runSynchroneTurn();
        }

        this.turn.isDone = true;
        this.turn = new SynchroneTurn();

        return true;
    }

    protected runSynchroneTurn(): void {
        const synchroneTurn: SynchroneTurn = this.turn as SynchroneTurn;
        const { whiteMove, blackMove }: SynchroneTurnAction = synchroneTurn.action;

        if (this.isMoveValid(whiteMove) === false || this.isMoveValid(blackMove) === false) {
            return;
        }

        const whitePiece: FenPiece = ChessBoardHelper.getFenPiece(this._fenBoard, whiteMove.from);
        const blackPiece: FenPiece = ChessBoardHelper.getFenPiece(this._fenBoard, blackMove.from);
        this.updateCastling(whiteMove);
        this.updateCastling(blackMove);
        this._fenBoard = ChessBoardHelper.setFenPiece(this._fenBoard, whiteMove.from, FenPiece.EMPTY);
        this._fenBoard = ChessBoardHelper.setFenPiece(this._fenBoard, blackMove.from, FenPiece.EMPTY);

        if (whiteMove.to.toString() === blackMove.to.toString()) {  // Confrontation. King survive, others double capture
            let destinationPiece: FenPiece = FenPiece.EMPTY;
            if (whitePiece === FenPiece.WHITE_KING) {
                destinationPiece = whitePiece;
            } else if (blackPiece === FenPiece.BLACK_KING) {
                destinationPiece = blackPiece;
            }

            this._fenBoard = ChessBoardHelper.setFenPiece(this._fenBoard, whiteMove.to, destinationPiece);
        } else {
            this._fenBoard = ChessBoardHelper.setFenPiece(this._fenBoard, whiteMove.to, whitePiece);
            this._fenBoard = ChessBoardHelper.setFenPiece(this._fenBoard, blackMove.to, blackPiece);
        }
    }

    protected updateCastling(move: Move): void {

        const fromPiece: FenPiece = ChessBoardHelper.getFenPiece(this._fenBoard, move.from);
        const rules: ChessRules = this.getRules(ChessBoardHelper.pieceColor(fromPiece));

        switch (ChessBoardHelper.pieceType(fromPiece)) {
            case PieceType.KING:
                this.kingMoved(move, rules);
                break;
            case PieceType.ROOK:
                this.rookMoved(move, rules);
                break;
        }
    }

    public getPossiblePlays(position: Vec2): Array<Vec2> {
        const fenPiece: FenPiece = ChessBoardHelper.getFenPieceByVec(this._fenBoard, position);
        const rules: SynchronousChessRules = this.getRules(ChessBoardHelper.pieceColor(fenPiece));

        return rules.getPossiblePlays(ChessBoardHelper.pieceType(fenPiece), position, ChessBoardHelper.cloneBoard(this._fenBoard));
    }
}
