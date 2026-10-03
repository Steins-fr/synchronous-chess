import { signal } from '@angular/core';
import ChessBoardHelper from '../../helpers/chess-board-helper';
import { FenBoard } from '@app/modules/chess/types/fen-board';
import { SafeBoard } from '@app/modules/chess/types/safe-board';
import { Vec2 } from '../vector/vec2';
import { Column } from '../../interfaces/CoordinateMove';
import Move, { FenColumn, FenCoordinate, FenRow } from '../../interfaces/move';
import ChessRules from '../rules/chess-rules';
import SynchronousChessRules from '../rules/synchronous-chess-rules';
import ChoiceTurn from '../turns/choice-turn';
import { IntermediateTurn } from '../turns/intermediate-turn';
import MoveTurn, { isMoveTurn } from '../turns/move-turn';
import PromotionTurn from '../turns/promotion-turn';
import SyncTurn from '../turns/sync-turn';
import Turn from '../turns/turn';
import IntermediateTurnAction from '../turns/turn-actions/intermediate-turn-action';
import MoveTurnAction from '../turns/turn-actions/move-turn-action';
import PromotionTurnAction from '../turns/turn-actions/promotion-turn-action';
import TurnType, { TurnCategory } from '../turns/turn.types';
import { FenPiece } from '../../enums/fen-piece.enum';
import { PieceColor } from '../../enums/piece-color.enum';
import { PieceType } from '../../enums/piece-type.enum';
import { switchExhaustivenessGuard } from '@app/helpers/switch-exhaustiveness-guard.helper';
import { DrawRules } from './draw-rules';
import { GameEndReason, GameResult } from './game-result';

export default class SynchronousChessGame {
    private readonly _fenBoard = signal<FenBoard>(ChessBoardHelper.createFenBoard());
    public readonly fenBoard = this._fenBoard.asReadonly();
    // A turn is mutated in place when a move is registered, each set must notify even with the same turn
    private readonly _turn = signal<Turn>(new SyncTurn(), { equal: () => false });
    protected readonly turn = this._turn.asReadonly();
    private readonly _oldTurn = signal<Turn | null>(null);
    protected readonly oldTurn = this._oldTurn.asReadonly();
    private readonly _isWhiteInCheck = signal<boolean>(false);
    public readonly isWhiteInCheck = this._isWhiteInCheck.asReadonly();
    private readonly _isWhiteInCheckmate = signal<boolean>(false);
    public readonly isWhiteInCheckmate = this._isWhiteInCheckmate.asReadonly();
    private readonly _isBlackInCheck = signal<boolean>(false);
    public readonly isBlackInCheck = this._isBlackInCheck.asReadonly();
    private readonly _isBlackInCheckmate = signal<boolean>(false);
    public readonly isBlackInCheckmate = this._isBlackInCheckmate.asReadonly();

    /** The end of the game, decided at the start of a synchronous turn */
    private readonly _result = signal<GameResult | null>(null);
    public readonly result = this._result.asReadonly();

    private _oldFenBoard: FenBoard = this._fenBoard();
    public readonly whiteRules: SynchronousChessRules = new SynchronousChessRules(PieceColor.WHITE);
    public readonly blackRules: SynchronousChessRules = new SynchronousChessRules(PieceColor.BLACK);
    private drawRules: DrawRules = new DrawRules();

    public constructor() {
        this.drawRules.recordPosition(this._fenBoard(), this.castlingRights());
    }

    // The turn has been mutated in place, its readers have to be notified
    private notifyTurnChange(): void {
        this._turn.set(this._turn());
    }

    protected getRules(color: PieceColor): SynchronousChessRules {
        return color === PieceColor.BLACK ? this.blackRules : this.whiteRules;
    }

    /** Starts the game from another position, its history starting there */
    public load(fenBoard: FenBoard): void {
        this._fenBoard.set(ChessBoardHelper.cloneBoard(fenBoard));
        this.drawRules = new DrawRules();
        this.drawRules.recordPosition(this._fenBoard(), this.castlingRights());
    }

    public isCheckmate(): boolean {
        return this.isBlackInCheckmate() || this.isWhiteInCheckmate();
    }

    public isGameOver(): boolean {
        return this._result() !== null;
    }

    /** The castling rights of both players, part of a position */
    private castlingRights(): string {
        return [this.whiteRules, this.blackRules]
            .map((rules: ChessRules) => `${ Number(rules.isQueenSideCastleAvailable()) }${ Number(rules.isKingSideCastleAvailable()) }`)
            .join('');
    }

    public lastMoveTurnAction(): MoveTurnAction | null {
        const oldTurn: Turn | null = this.oldTurn();
        if (!isMoveTurn(oldTurn)) {
            return null;
        }

        return oldTurn.action;
    }

    public getTurnType(): TurnType {
        return this.turn().type;
    }

    public getTurnCategory(): TurnCategory {
        return this.turn().category;
    }

    private kingMoved(move: Move, rules: ChessRules): void {
        const from: Vec2 = ChessBoardHelper.fenCoordinateToVec2(move.from);
        const to: Vec2 = ChessBoardHelper.fenCoordinateToVec2(move.to);
        // If this is a king move, check if it is a castling
        if (from.distanceVec(to) === 2) {
            // The king has moved twice, this is a castling
            const castlingRook: Column = ChessBoardHelper.castlingRook(from, to);
            const rookEmplacement: Vec2 = new Vec2(castlingRook, from.y);
            const rookNewEmplacement: Vec2 = from.addVec(to.subVec(from).div(2, 2));

            this._fenBoard.set(ChessBoardHelper.setFenPieceByVec(this._fenBoard(), rookNewEmplacement, ChessBoardHelper.getFenPieceByVec(this._fenBoard(), rookEmplacement)));
            this._fenBoard.set(ChessBoardHelper.setFenPieceByVec(this._fenBoard(), rookEmplacement, FenPiece.EMPTY));
        }
        rules.setQueenSideCastleAvailable(false);
        rules.setKingSideCastleAvailable(false);
    }

    private rookMoved(move: Move, rules: ChessRules): void {
        switch (move.from[0]) {
            case FenColumn.A:
                rules.setQueenSideCastleAvailable(false);
                break;
            case FenColumn.H:
                rules.setKingSideCastleAvailable(false);
                break;
        }
    }

    public isMoveValid(move: Move): boolean {
        const from: Vec2 = ChessBoardHelper.fenCoordinateToVec2(move.from);
        const to: Vec2 = ChessBoardHelper.fenCoordinateToVec2(move.to);

        if (ChessBoardHelper.getFenPieceByVec(this._fenBoard(), from) === FenPiece.EMPTY) {
            return false;
        }

        return this.getPossiblePlays(from).some((posPlay: Vec2) => posPlay.equal(to.x, to.y));
    }

    public registerMove(move: Move | null, color: PieceColor): boolean {
        if (this.turn().category !== TurnCategory.MOVE) {
            return false;
        }
        const moveTurn: MoveTurn = this.turn() as MoveTurn;

        const isInCheck: boolean = color === PieceColor.WHITE ? this.isWhiteInCheck() : this.isBlackInCheck();

        if (isInCheck && move === null) {
            return false;
        }

        if (move !== null && !this.isMoveValid(move)) {
            return false;
        }

        moveTurn.registerMove(move, color);
        this.notifyTurnChange();

        return true;
    }

    public promote(pieceType: PieceType, color: PieceColor): boolean {
        if (this.turn().type !== TurnType.CHOICE_PROMOTION) {
            return false;
        }
        const promotionTurn: PromotionTurn = this.turn() as PromotionTurn;

        promotionTurn.registerChoice(pieceType, color);
        this.notifyTurnChange();

        return true;
    }

    public colorHasPlayed(color: PieceColor): boolean {
        return this.turn().isFilled(color);
    }

    public verifyCheck(): void {
        this._isWhiteInCheck.set(false);
        this._isBlackInCheck.set(false);

        // Check can only exists during synchrone turn.
        if (this.turn().type !== TurnType.MOVE_SYNC) {
            return;
        }

        const whiteSafeBoard: SafeBoard = this.whiteRules.getSafeBoard(this._fenBoard());
        const blackSafeBoard: SafeBoard = this.blackRules.getSafeBoard(this._fenBoard());
        const whiteKingFenCoordinate: FenCoordinate = ChessBoardHelper.findKing(this._fenBoard(), FenPiece.WHITE_KING);
        const blackKingFenCoordinate: FenCoordinate = ChessBoardHelper.findKing(this._fenBoard(), FenPiece.BLACK_KING);

        if (!ChessBoardHelper.isSafe(whiteSafeBoard, whiteKingFenCoordinate)) {
            this._isWhiteInCheck.set(true);
            if (this.getPossiblePlays(ChessBoardHelper.fenCoordinateToVec2(whiteKingFenCoordinate)).length === 0) {
                this._isWhiteInCheckmate.set(true);
            }
        }

        if (!ChessBoardHelper.isSafe(blackSafeBoard, blackKingFenCoordinate)) {
            this._isBlackInCheck.set(true);
            if (this.getPossiblePlays(ChessBoardHelper.fenCoordinateToVec2(blackKingFenCoordinate)).length === 0) {
                this._isBlackInCheckmate.set(true);
            }
        }
    }

    public runTurn(): boolean {
        if (!this.turn().canBeExecuted()) {
            return false;
        }

        this._oldFenBoard = ChessBoardHelper.cloneBoard(this._fenBoard());

        const turnType: TurnType = this.turn().type;

        switch (turnType) {
            case TurnType.MOVE_INTERMEDIATE:
                this.runIntermediateTurn();
                break;
            case TurnType.MOVE_SYNC:
                this.runSyncTurn();
                break;
            case TurnType.CHOICE_PROMOTION:
                this.runPromotionTurn();
                break;
            default:
                switchExhaustivenessGuard(turnType);
        }

        if (turnType !== TurnType.CHOICE_PROMOTION) {
            const { whiteMove, blackMove }: MoveTurnAction = this.turn().action as MoveTurnAction;
            this.drawRules.recordMoves(this._oldFenBoard, this._fenBoard(), [whiteMove, blackMove].filter((move: Move | null) => move !== null));
        }

        this.turn().isDone = true;
        this.nextTurn();
        this.checkPromotionTurn();
        this.verifyCheck();
        this.verifyEnd();

        return true;
    }

    /** At the start of a synchronous turn: a checkmate, then a stalemate, then the draws of the history end the game */
    public verifyEnd(): void {
        if (this.turn().type !== TurnType.MOVE_SYNC) {
            return;
        }

        this.drawRules.recordPosition(this._fenBoard(), this.castlingRights());
        this._result.set(this.endOfGame());
    }

    private endOfGame(): GameResult | null {
        const isWhiteCheckmated: boolean = this.isWhiteInCheckmate();
        const isBlackCheckmated: boolean = this.isBlackInCheckmate();

        if (isWhiteCheckmated && isBlackCheckmated) {
            return { winner: PieceColor.NONE, reason: GameEndReason.DOUBLE_CHECKMATE };
        }

        if (isWhiteCheckmated || isBlackCheckmated) {
            return { winner: isWhiteCheckmated ? PieceColor.BLACK : PieceColor.WHITE, reason: GameEndReason.CHECKMATE };
        }

        if (this.isStalemate(PieceColor.WHITE) || this.isStalemate(PieceColor.BLACK)) {
            return { winner: PieceColor.NONE, reason: GameEndReason.STALEMATE };
        }

        const draw: GameEndReason | null = this.drawRules.draw(this._fenBoard());
        return draw === null ? null : { winner: PieceColor.NONE, reason: draw };
    }

    /** A player not in check which can not move any piece */
    private isStalemate(color: PieceColor): boolean {
        if (color === PieceColor.WHITE ? this.isWhiteInCheck() : this.isBlackInCheck()) {
            return false;
        }

        return !this.canMoveAnyPiece(color);
    }

    /** In the current turn */
    private canMoveAnyPiece(color: PieceColor): boolean {
        return this._fenBoard().some((row: ReadonlyArray<FenPiece>, y: number) => row.some((piece: FenPiece, x: number) =>
            ChessBoardHelper.pieceColor(piece) === color && this.getPossiblePlays(new Vec2(x, y)).length > 0));
    }

    protected getNextTurnTarget(move: Move | undefined | null, oldSafeBoard: SafeBoard, safeBoard: SafeBoard): FenCoordinate | null {
        if (move
            && ChessBoardHelper.getFenPiece(this._fenBoard(), move.to) !== FenPiece.EMPTY
            && !ChessBoardHelper.isSafe(oldSafeBoard, move.to)
            && !ChessBoardHelper.isSafe(safeBoard, move.to)) { // We assure that the destination remains attacked or protected.
            return move.to;
        }

        return null;
    }

    protected nextTurn(): void {
        const turnCategory: TurnCategory = this.turn().category;

        this._oldTurn.set(this.turn());

        if (turnCategory === TurnCategory.MOVE) {
            const { whiteMove, blackMove }: MoveTurnAction = this.turn().action as MoveTurnAction;
            const blackMoveDestination: FenCoordinate | undefined = blackMove ? blackMove.to : undefined;
            const whiteMoveDestination: FenCoordinate | undefined = whiteMove ? whiteMove.to : undefined;

            const whiteOldSafeBoard: SafeBoard = this.whiteRules.getSafeBoard(this._oldFenBoard, blackMoveDestination);
            const blackOldSafeBoard: SafeBoard = this.blackRules.getSafeBoard(this._oldFenBoard, whiteMoveDestination);
            const whiteSafeBoard: SafeBoard = this.whiteRules.getSafeBoard(this._fenBoard(), blackMoveDestination);
            const blackSafeBoard: SafeBoard = this.blackRules.getSafeBoard(this._fenBoard(), whiteMoveDestination);

            const intermediateAction: IntermediateTurnAction = {
                whiteTarget: this.getNextTurnTarget(blackMove, blackOldSafeBoard, blackSafeBoard),
                blackTarget: this.getNextTurnTarget(whiteMove, whiteOldSafeBoard, whiteSafeBoard),
                whiteMove: null,
                blackMove: null,
            };

            if (intermediateAction.whiteTarget !== null || intermediateAction.blackTarget !== null) {
                // The possible captures are the plays of the intermediate turn
                this._turn.set(new IntermediateTurn(intermediateAction, whiteMove, blackMove));

                // A player has the right to capture the piece which moved to its target only if it can capture it
                const whiteTarget: FenCoordinate | null = this.canMoveAnyPiece(PieceColor.WHITE) ? intermediateAction.whiteTarget : null;
                const blackTarget: FenCoordinate | null = this.canMoveAnyPiece(PieceColor.BLACK) ? intermediateAction.blackTarget : null;

                this._turn.set(whiteTarget === null && blackTarget === null
                    ? new SyncTurn()
                    : new IntermediateTurn({ ...intermediateAction, whiteTarget, blackTarget }, whiteMove, blackMove));
            }
        } else if (turnCategory === TurnCategory.CHOICE) {
            const choiceTurn: ChoiceTurn = this.turn() as ChoiceTurn;
            this._turn.set(choiceTurn.nextTurn);
        }

        // If the turn was not changed, change it
        if (this.turn().isDone) {
            this._turn.set(new SyncTurn());
        }
    }

    protected canPromote(move: Move | null): boolean {
        if (move === null) {
            return false;
        }

        const fenCoordinate: FenCoordinate = move.to;
        const piece: FenPiece = ChessBoardHelper.getFenPiece(this._fenBoard(), fenCoordinate);
        const color: PieceColor = ChessBoardHelper.pieceColor(piece);
        const row: FenRow = color === PieceColor.WHITE ? FenRow._8 : FenRow._1;

        return fenCoordinate[1] === row && ChessBoardHelper.pieceType(piece) === PieceType.PAWN;
    }

    protected checkPromotionTurn(): void {
        const oldTurn: Turn | null = this.oldTurn();
        if (!isMoveTurn(oldTurn)) {
            return;
        }

        const promotionAction: PromotionTurnAction = {
            whiteFenCoordinate: null,
            blackFenCoordinate: null,
            whitePiece: null,
            blackPiece: null,
        };
        const { whiteMove, blackMove }: MoveTurnAction = oldTurn.action;
        if (this.canPromote(whiteMove) && whiteMove) {
            promotionAction.whiteFenCoordinate = whiteMove.to;
        }

        if (this.canPromote(blackMove) && blackMove) {
            promotionAction.blackFenCoordinate = blackMove.to;
        }

        if (promotionAction.whiteFenCoordinate !== null || promotionAction.blackFenCoordinate !== null) {
            this._turn.set(new PromotionTurn(promotionAction, this.turn()));
        }
    }

    protected isTurnValid(): boolean {
        const turnType: TurnType = this.turn().type;
        switch (turnType) {
            case TurnType.MOVE_INTERMEDIATE:
            case TurnType.MOVE_SYNC:
                const action: MoveTurnAction = this.turn().action as MoveTurnAction;
                const { whiteMove, blackMove }: MoveTurnAction = action;
                return (whiteMove === null || this.isMoveValid(whiteMove)) &&
                    (blackMove === null || this.isMoveValid(blackMove));
            case TurnType.CHOICE_PROMOTION:
                return false;
            default:
                return switchExhaustivenessGuard(turnType);
        }
    }

    protected runPromotionTurn(): void {
        const promotionTurn: PromotionTurn = this.turn() as PromotionTurn;
        const { whiteFenCoordinate, whitePiece, blackFenCoordinate, blackPiece }: PromotionTurnAction = promotionTurn.action;

        if (whiteFenCoordinate !== null && whitePiece) { // White move
            this._fenBoard.set(ChessBoardHelper.promote(this._fenBoard(), whiteFenCoordinate, whitePiece, PieceColor.WHITE));
        }

        if (blackFenCoordinate !== null && blackPiece) { // Black move
            this._fenBoard.set(ChessBoardHelper.promote(this._fenBoard(), blackFenCoordinate, blackPiece, PieceColor.BLACK));
        }
    }

    protected runIntermediateTurn(): void {
        const { whiteMove, blackMove }: MoveTurnAction = this.turn().action as MoveTurnAction;

        if (!this.isTurnValid()) {
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
        const piece = ChessBoardHelper.getFenPiece(this._fenBoard(), move.from);

        this.updateCastling(move);
        this._fenBoard.set(ChessBoardHelper.setFenPiece(this._fenBoard(), move.from, FenPiece.EMPTY));
        this._fenBoard.set(ChessBoardHelper.setFenPiece(this._fenBoard(), move.to, piece));
    }

    protected runSyncTurn(): void {
        const { whiteMove, blackMove }: MoveTurnAction = this.turn().action as MoveTurnAction;

        if (!this.isTurnValid()) {
            return;
        }

        if (whiteMove !== null && blackMove !== null) { // Both move
            // We can't use "applySingleMove" because pieces can: evade, confront or move independently
            const whitePiece: FenPiece | null = ChessBoardHelper.getFenPiece(this._fenBoard(), whiteMove.from);
            const blackPiece: FenPiece | null = ChessBoardHelper.getFenPiece(this._fenBoard(), blackMove.from);

            if (!whitePiece || !blackPiece) {
                throw new Error('Piece is undefined');
            }

            this.updateCastling(whiteMove);
            this.updateCastling(blackMove);
            this._fenBoard.set(ChessBoardHelper.setFenPiece(this._fenBoard(), whiteMove.from, FenPiece.EMPTY));
            this._fenBoard.set(ChessBoardHelper.setFenPiece(this._fenBoard(), blackMove.from, FenPiece.EMPTY));

            if (whiteMove.to.toString() === blackMove.to.toString()) {  // Confrontation. King survive, others double capture
                let destinationPiece: FenPiece = FenPiece.EMPTY;
                if (whitePiece === FenPiece.WHITE_KING) {
                    destinationPiece = whitePiece;
                } else if (blackPiece === FenPiece.BLACK_KING) {
                    destinationPiece = blackPiece;
                }

                this._fenBoard.set(ChessBoardHelper.setFenPiece(this._fenBoard(), whiteMove.to, destinationPiece));
            } else {
                this._fenBoard.set(ChessBoardHelper.setFenPiece(this._fenBoard(), whiteMove.to, whitePiece));
                this._fenBoard.set(ChessBoardHelper.setFenPiece(this._fenBoard(), blackMove.to, blackPiece));
            }
        } else if (whiteMove !== null) { // White move
            this.applySingleMove(whiteMove);
        } else if (blackMove !== null) { // Black move
            this.applySingleMove(blackMove);
        }
    }

    protected updateCastling(move: Move): void {

        const fromPiece: FenPiece | null = ChessBoardHelper.getFenPiece(this._fenBoard(), move.from);

        if (!fromPiece) {
            throw new Error('Piece is undefined');
        }

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
        const fenPiece: FenPiece = ChessBoardHelper.getFenPieceByVec(this._fenBoard(), position);

        const intermediateTurn: IntermediateTurn = this.turn() as IntermediateTurn;
        const intermediateAction: IntermediateTurnAction = intermediateTurn.action;
        const target: FenCoordinate | null = ChessBoardHelper.pieceColor(fenPiece) === PieceColor.WHITE ? intermediateAction.whiteTarget : intermediateAction.blackTarget;

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

    protected getSynchronousTurnPossiblePlays(possiblePlays: Array<Vec2>, position: Vec2): Array<Vec2> {
        const fenPiece = ChessBoardHelper.getFenPieceByVec(this._fenBoard(), position);

        const pieceColor: PieceColor = ChessBoardHelper.pieceColor(fenPiece);
        const pieceType: PieceType = ChessBoardHelper.pieceType(fenPiece);
        const isInCheck: boolean = pieceColor === PieceColor.WHITE ? this.isWhiteInCheck() : this.isBlackInCheck();

        if (isInCheck && pieceType !== PieceType.KING) {
            return [];
        }

        return possiblePlays;
    }

    public getPossiblePlays(position: Vec2): Array<Vec2> {
        if (this.turn().category !== TurnCategory.MOVE || this.isBlackInCheckmate() || this.isWhiteInCheckmate() || this.isGameOver()) {
            return [];
        }

        const fenPiece = ChessBoardHelper.getFenPieceByVec(this._fenBoard(), position);

        const rules: SynchronousChessRules = this.getRules(ChessBoardHelper.pieceColor(fenPiece));

        const possiblePlays: Array<Vec2> = rules.getPossiblePlays(ChessBoardHelper.pieceType(fenPiece), position, ChessBoardHelper.cloneBoard(this._fenBoard()));

        const turnType: TurnType = this.turn().type;

        switch (turnType) {
            case TurnType.MOVE_INTERMEDIATE:
                return this.getIntermediateTurnPossiblePlays(possiblePlays, position);
            case TurnType.MOVE_SYNC:
                return this.getSynchronousTurnPossiblePlays(possiblePlays, position);
            case TurnType.CHOICE_PROMOTION:
                return possiblePlays;
            default:
                return switchExhaustivenessGuard(turnType);
        }
    }

    public hasPlayed(color: PieceColor): boolean {
        return this.turn().isFilled(color);
    }
}
