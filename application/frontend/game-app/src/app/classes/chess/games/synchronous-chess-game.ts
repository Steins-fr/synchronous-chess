import ChessBoardHelper, { FenBoard, SafeBoard } from '../../../helpers/chess-board-helper';
import SynchronousChessRules from '../rules/synchronous-chess-rules';
import Vec2 from 'vec2';
import ChessRules, { PieceColor, FenPiece, PieceType } from '../rules/chess-rules';
import Move, { FenColumn, FenCoordinate } from '../interfaces/move';
import { Column } from '../interfaces/CoordinateMove';
import Turn from '../turns/turn';
import SynchroneTurn from '../turns/synchrone-turn';
import TurnType from '../turns/turn.types';
import MoveTurnAction from '../turns/turn-actions/move-turn-action';
import IntermediateTurnAction from '../turns/turn-actions/intermediate-turn-action';
import { IntermediateTurn } from '../turns/intermediate-turn';

export default class SynchronousChessGame {
    private _fenBoard: FenBoard = ChessBoardHelper.createFenBoard();
    public readonly whiteRules: SynchronousChessRules = new SynchronousChessRules(PieceColor.WHITE);
    public readonly blackRules: SynchronousChessRules = new SynchronousChessRules(PieceColor.BLACK);
    protected turn: Turn = new SynchroneTurn();
    protected oldTurn?: Turn;

    protected getRules(color: PieceColor): SynchronousChessRules {
        return color === PieceColor.BLACK ? this.blackRules : this.whiteRules;
    }

    public get fenBoard(): FenBoard {
        return this._fenBoard;
    }

    public load(fenBoard: FenBoard): void {
        this._fenBoard = ChessBoardHelper.cloneBoard(fenBoard);
    }

    public getTurnType(): TurnType {
        return this.turn.type;
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

        switch (this.turn.type) {
            case TurnType.INTERMEDIATE:
                this.runIntermediateTurn();
                break;
            case TurnType.SYNCHRONE:
                this.runSynchroneTurn();
                break;
        }

        this.turn.isDone = true;
        this.nextTurn();

        return true;
    }

    protected getNextTurnTarget(move: Move | undefined | null, safeBoard: SafeBoard): FenCoordinate | null {
        if (move
            && ChessBoardHelper.getFenPiece(this._fenBoard, move.to) !== FenPiece.EMPTY // No double capture
            && ChessBoardHelper.isSafe(safeBoard, move.to) === false) {
            return move.to;
        }

        return null;
    }

    protected nextTurn(): void {
        const turnType: TurnType = this.turn.type;

        this.oldTurn = this.turn;

        if (turnType === TurnType.SYNCHRONE || turnType === TurnType.INTERMEDIATE) {
            const { whiteMove, blackMove }: MoveTurnAction = this.turn.action;
            const whiteSafeBoard: SafeBoard = this.whiteRules.getSafeBoard(this._fenBoard, blackMove ? blackMove.to : undefined);
            const blackSafeBoard: SafeBoard = this.blackRules.getSafeBoard(this._fenBoard, whiteMove ? whiteMove.to : undefined);

            const intermediateAction: IntermediateTurnAction = {
                whiteTarget: this.getNextTurnTarget(blackMove, blackSafeBoard),
                blackTarget: this.getNextTurnTarget(whiteMove, whiteSafeBoard)
            };

            if (intermediateAction.whiteTarget !== null || intermediateAction.blackTarget !== null) {
                this.turn = new IntermediateTurn(intermediateAction);
            }
        }

        // If the turn was not changed, change it
        if (this.turn.isDone) {
            this.turn = new SynchroneTurn();
        }
    }

    protected isTurnValid(): boolean {
        switch (this.turn.type) {
            case TurnType.INTERMEDIATE:
            case TurnType.SYNCHRONE:
                const action: MoveTurnAction = this.turn.action;
                const { whiteMove, blackMove }: MoveTurnAction = action;
                return (whiteMove === null || this.isMoveValid(whiteMove)) &&
                    (blackMove === null || this.isMoveValid(blackMove));
            default:
                return false;
        }
    }

    protected runIntermediateTurn(): void {
        const { whiteMove, blackMove }: MoveTurnAction = this.turn.action;

        if (this.isTurnValid() === false) {
            return;
        }

        if (whiteMove !== null) { // White move
            this.applySingleMove(whiteMove);
        }

        if (blackMove !== null) { // Black move
            this.applySingleMove(blackMove);
        }
    }

    protected applySingleMove(move: Move): void {
        const piece: FenPiece = ChessBoardHelper.getFenPiece(this._fenBoard, move.from);
        this.updateCastling(move);
        this._fenBoard = ChessBoardHelper.setFenPiece(this._fenBoard, move.from, FenPiece.EMPTY);
        this._fenBoard = ChessBoardHelper.setFenPiece(this._fenBoard, move.to, piece);
    }

    protected runSynchroneTurn(): void {
        const { whiteMove, blackMove }: MoveTurnAction = this.turn.action;

        if (this.isTurnValid() === false) {
            return;
        }

        if (whiteMove !== null && blackMove !== null) { // Both move
            // We can't use "applySingleMove" because pieces can: evade, confronte or move independently
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
        } else if (whiteMove !== null) { // White move
            this.applySingleMove(whiteMove);
        } else if (blackMove !== null) { // Black move
            this.applySingleMove(blackMove);
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

    protected getIntermediateTurnPossiblePlays(possiblePlays: Array<Vec2>, position: Vec2): Array<Vec2> {
        const fenPiece: FenPiece = ChessBoardHelper.getFenPieceByVec(this._fenBoard, position);
        const intermediateAction: IntermediateTurnAction = this.turn.action as IntermediateTurnAction;
        const target: FenCoordinate = ChessBoardHelper.pieceColor(fenPiece) === PieceColor.WHITE ? intermediateAction.whiteTarget : intermediateAction.blackTarget;

        if (this.oldTurn !== undefined) { // Piece that has moved at the previous turn can't move during intermediate turn!
            const { whiteMove, blackMove }: MoveTurnAction = this.oldTurn.action;
            const whiteLastMovedPiece: Vec2 | undefined = whiteMove ? ChessBoardHelper.fenCoordinateToVec2(whiteMove.to) : undefined;
            const blackLastMovedPiece: Vec2 | undefined = blackMove ? ChessBoardHelper.fenCoordinateToVec2(blackMove.to) : undefined;

            if ((whiteLastMovedPiece && position.equal(whiteLastMovedPiece.x, whiteLastMovedPiece.y))
                || (blackLastMovedPiece && position.equal(blackLastMovedPiece.x, blackLastMovedPiece.y))) {
                return [];
            }
        }

        if (target === null) {
            return [];
        }

        const targetVec: Vec2 = ChessBoardHelper.fenCoordinateToVec2(target);
        return possiblePlays.filter((vec: Vec2) => vec.equal(targetVec.x, targetVec.y));
    }

    public getPossiblePlays(position: Vec2): Array<Vec2> {
        const fenPiece: FenPiece = ChessBoardHelper.getFenPieceByVec(this._fenBoard, position);
        const rules: SynchronousChessRules = this.getRules(ChessBoardHelper.pieceColor(fenPiece));

        const possiblePlays: Array<Vec2> = rules.getPossiblePlays(ChessBoardHelper.pieceType(fenPiece), position, ChessBoardHelper.cloneBoard(this._fenBoard));

        switch (this.turn.type) {
            case TurnType.INTERMEDIATE:
                return this.getIntermediateTurnPossiblePlays(possiblePlays, position);
            case TurnType.SYNCHRONE:
            default:
                return possiblePlays;
        }
    }

    public hasPlayed(color: PieceColor): boolean {
        return this.turn.isFilled(color);
    }
}
