import ChessBoardHelper, { FenBoard, SafeBoard } from '../../../helpers/chess-board-helper';
import SynchronousChessRules from '../rules/synchronous-chess-rules';
import Vec2 from 'vec2';
import ChessRules, { PieceColor, FenPiece, PieceType } from '../rules/chess-rules';
import Move, { FenColumn, FenCoordinate, FenRow } from '../interfaces/move';
import { Column } from '../interfaces/CoordinateMove';
import Turn from '../turns/turn';
import SynchroneTurn from '../turns/synchrone-turn';
import TurnType, { TurnCategory } from '../turns/turn.types';
import MoveTurnAction from '../turns/turn-actions/move-turn-action';
import IntermediateTurnAction from '../turns/turn-actions/intermediate-turn-action';
import { IntermediateTurn } from '../turns/intermediate-turn';
import MoveTurn from '../turns/move-turn';
import PromotionTurn from '../turns/promotion-turn';
import PromotionTurnAction from '../turns/turn-actions/promotion-turn-action';
import ChoiceTurn from '../turns/choice-turn';

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

    public lastMoveTurnAction(): MoveTurnAction | null {
        if (this.oldTurn === undefined || this.oldTurn.category !== TurnCategory.MOVE) {
            return null;
        }
        return this.oldTurn.action;
    }

    public getTurnType(): TurnType {
        return this.turn.type;
    }

    public getTurnCategory(): TurnCategory {
        return this.turn.category;
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

    public registerMove(move: Move | null, color: PieceColor): boolean {
        if (this.turn.category !== TurnCategory.MOVE) {
            return false;
        }
        const moveTurn: MoveTurn = this.turn as MoveTurn;

        if (move !== null && this.isMoveValid(move) === false) {
            return false;
        }

        moveTurn.registerMove(move, color);

        return true;
    }

    public promote(pieceType: PieceType, color: PieceColor): boolean {
        if (this.turn.type !== TurnType.CHOICE_PROMOTION) {
            return false;
        }
        const promotionTurn: PromotionTurn = this.turn as PromotionTurn;

        promotionTurn.registerChoice(pieceType, color);

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
            case TurnType.MOVE_INTERMEDIATE:
                this.runIntermediateTurn();
                break;
            case TurnType.MOVE_SYNCHRONE:
                this.runSynchroneTurn();
                break;
            case TurnType.CHOICE_PROMOTION:
                this.runPromotionTurn();
                break;
        }

        this.turn.isDone = true;
        this.nextTurn();
        this.checkPromotionTurn();

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
        const turnCategory: TurnCategory = this.turn.category;

        this.oldTurn = this.turn;

        if (turnCategory === TurnCategory.MOVE) {
            const { whiteMove, blackMove }: MoveTurnAction = this.turn.action;
            const whiteSafeBoard: SafeBoard = this.whiteRules.getSafeBoard(this._fenBoard, blackMove ? blackMove.to : undefined);
            const blackSafeBoard: SafeBoard = this.blackRules.getSafeBoard(this._fenBoard, whiteMove ? whiteMove.to : undefined);

            const intermediateAction: IntermediateTurnAction = {
                whiteTarget: this.getNextTurnTarget(blackMove, blackSafeBoard),
                blackTarget: this.getNextTurnTarget(whiteMove, whiteSafeBoard)
            };

            if (intermediateAction.whiteTarget !== null || intermediateAction.blackTarget !== null) {
                this.turn = new IntermediateTurn(intermediateAction, whiteMove, blackMove);
            }
        } else if (turnCategory === TurnCategory.CHOICE) {
            const choiceTurn: ChoiceTurn = this.turn as ChoiceTurn;
            this.turn = choiceTurn.nextTurn;
        }

        // If the turn was not changed, change it
        if (this.turn.isDone) {
            this.turn = new SynchroneTurn();
        }
    }

    protected canPromote(move: Move): boolean {
        if (move === null) {
            return false;
        }

        const fenCoordinate: FenCoordinate = move.to;
        const piece: FenPiece = ChessBoardHelper.getFenPiece(this._fenBoard, fenCoordinate);
        const color: PieceColor = ChessBoardHelper.pieceColor(piece);
        const row: FenRow = color === PieceColor.WHITE ? FenRow._8 : FenRow._1;

        if (fenCoordinate[1] === row && ChessBoardHelper.pieceType(piece) === PieceType.PAWN) {
            return true;
        }

        return false;
    }

    protected checkPromotionTurn(): void {
        if (this.oldTurn.category !== TurnCategory.MOVE) {
            return;
        }

        const promotionAction: PromotionTurnAction = { whiteFenCoordinate: null, blackFenCoordinate: null };
        const { whiteMove, blackMove }: MoveTurnAction = this.oldTurn.action;
        if (this.canPromote(whiteMove)) {
            promotionAction.whiteFenCoordinate = whiteMove.to;
        }

        if (this.canPromote(blackMove)) {
            promotionAction.blackFenCoordinate = blackMove.to;
        }

        if (promotionAction.whiteFenCoordinate !== null || promotionAction.blackFenCoordinate !== null) {
            this.turn = new PromotionTurn(promotionAction, this.turn);
        }
    }

    protected isTurnValid(): boolean {
        switch (this.turn.type) {
            case TurnType.MOVE_INTERMEDIATE:
            case TurnType.MOVE_SYNCHRONE:
                const action: MoveTurnAction = this.turn.action;
                const { whiteMove, blackMove }: MoveTurnAction = action;
                return (whiteMove === null || this.isMoveValid(whiteMove)) &&
                    (blackMove === null || this.isMoveValid(blackMove));
            default:
                return false;
        }
    }

    protected runPromotionTurn(): void {
        const promotionTurn: PromotionTurn = this.turn as PromotionTurn;
        const { whiteFenCoordinate, whitePiece, blackFenCoordinate, blackPiece }: PromotionTurnAction = promotionTurn.action;

        if (whiteFenCoordinate !== null) { // White move
            this._fenBoard = ChessBoardHelper.promote(this._fenBoard, whiteFenCoordinate, whitePiece, PieceColor.WHITE);
        }

        if (blackFenCoordinate !== null) { // Black move
            this._fenBoard = ChessBoardHelper.promote(this._fenBoard, blackFenCoordinate, blackPiece, PieceColor.BLACK);
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
            // We can't use "applySingleMove" because pieces can: evade, confront or move independently
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
        const intermediateTurn: IntermediateTurn = this.turn as IntermediateTurn;
        const intermediateAction: IntermediateTurnAction = intermediateTurn.action;
        const target: FenCoordinate = ChessBoardHelper.pieceColor(fenPiece) === PieceColor.WHITE ? intermediateAction.whiteTarget : intermediateAction.blackTarget;

        const lastWhiteMove: Move | null = intermediateTurn.lastWhiteMove;
        const lastBlackMove: Move | null = intermediateTurn.lastBlackMove;
        const whiteLastMovedPiece: Vec2 | null = lastWhiteMove ? ChessBoardHelper.fenCoordinateToVec2(lastWhiteMove.to) : null;
        const blackLastMovedPiece: Vec2 | null = lastBlackMove ? ChessBoardHelper.fenCoordinateToVec2(lastBlackMove.to) : null;

        if ((whiteLastMovedPiece && position.equal(whiteLastMovedPiece.x, whiteLastMovedPiece.y))
            || (blackLastMovedPiece && position.equal(blackLastMovedPiece.x, blackLastMovedPiece.y))) {
            return [];
        }

        if (target === null) {
            return [];
        }

        const targetVec: Vec2 = ChessBoardHelper.fenCoordinateToVec2(target);
        return possiblePlays.filter((vec: Vec2) => vec.equal(targetVec.x, targetVec.y));
    }

    public getPossiblePlays(position: Vec2): Array<Vec2> {
        if (this.turn.category !== TurnCategory.MOVE) {
            return [];
        }

        const fenPiece: FenPiece = ChessBoardHelper.getFenPieceByVec(this._fenBoard, position);
        const rules: SynchronousChessRules = this.getRules(ChessBoardHelper.pieceColor(fenPiece));

        const possiblePlays: Array<Vec2> = rules.getPossiblePlays(ChessBoardHelper.pieceType(fenPiece), position, ChessBoardHelper.cloneBoard(this._fenBoard));

        switch (this.turn.type) {
            case TurnType.MOVE_INTERMEDIATE:
                return this.getIntermediateTurnPossiblePlays(possiblePlays, position);
            case TurnType.MOVE_SYNCHRONE:
            default:
                return possiblePlays;
        }
    }

    public hasPlayed(color: PieceColor): boolean {
        return this.turn.isFilled(color);
    }
}
