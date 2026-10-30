
import { Component, OnDestroy, Signal, computed, inject, input, signal, untracked } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { TranslocoDirective, TranslocoPipe } from '@jsverse/transloco';
import { marker } from '@jsverse/transloco-keys-manager/marker';
import SynchronousChessGameSession from '@app/modules/chess/classes/game-sessions/synchronous-chess-game-session';
import SynchronousChessGame from '@app/modules/chess/classes/games/synchronous-chess-game';
import SynchronousChessGameSessionBuilder from '@app/modules/chess/classes/game-sessions/synchronous-chess-game-session-builder';
import SynchronousChessLocalGameSession from '@app/modules/chess/classes/game-sessions/synchronous-chess-local-game-session';
import { CHESS_AWAY_TIME, ChessPayloads } from '@app/modules/chess/classes/game-sessions/synchronous-chess-online-game-session';
import CoordinateMove from '@app/modules/chess/interfaces/CoordinateMove';
import Move from '@app/modules/chess/interfaces/move';
import { FenPiece } from '@app/modules/chess/enums/fen-piece.enum';
import { PieceColor } from '@app/modules/chess/enums/piece-color.enum';
import MoveTurnAction from '@app/modules/chess/classes/turns/turn-actions/move-turn-action';
import TurnType, { TurnCategory } from '@app/modules/chess/classes/turns/turn.types';
import { Vec2 } from '@app/modules/chess/classes/vector/vec2';
import ChessBoardHelper from '@app/modules/chess/helpers/chess-board-helper';
import { ValidPlayBoard } from '@app/modules/chess/types/valid-play-board';
import { Room } from '@app/services/room-manager/classes/room/room';
import { ChessPromotionComponent } from '../chess/chess-promotion/chess-promotion.component';
import { ChessBoardComponent } from '../chess/chess-board/chess-board.component';
import { ChessPieceComponent } from '../chess/chess-piece/chess-piece.component';
import { MatchLeaveWarning } from '@app/modules/room-layout/match-leave-warning';
import { SteadyHeightDirective } from '@app/modules/room-layout/steady-height.directive';
import { switchExhaustivenessGuard } from '@app/helpers/switch-exhaustiveness-guard.helper';
import { GameEndReason, GameResult } from '@app/modules/chess/classes/games/game-result';
import { TranslatableText } from '@app/types/translatable-text.type';
import { TranslationScope } from '@app/services/language/enums/translation-scope.enum';
import { scopedKey } from '@app/services/language/scoped-key';
import { playedTurnLines, squareName } from '@app/modules/chess/helpers/played-turn-text.helper';
import { CLOCK_LOW, turnClock } from '@app/helpers/turn-clock.helper';
import { LanguageService } from '@app/services/language/language.service';

@Component({
    selector: 'app-sync-chess-game',
    templateUrl: './sync-chess-game.component.html',
    styleUrls: ['./sync-chess-game.component.scss'],
    imports: [ChessBoardComponent, ChessPromotionComponent, MatButtonModule, ChessPieceComponent, SteadyHeightDirective, TranslocoDirective, TranslocoPipe],
})
export class SyncChessGameComponent implements OnDestroy {
    public readonly room = input.required<Room<ChessPayloads> | undefined>();

    protected readonly gameSession = computed<SynchronousChessGameSession>(() => {
        const room = this.room();

        // The session state is made of signals, it must not become a dependency: only a new room recreates the session
        return untracked(() => room ? SynchronousChessGameSessionBuilder.buildOnline(room) : new SynchronousChessLocalGameSession());
    });
    /** The local player plays the game: leaving the page asks to confirm */
    private readonly inMatch: Signal<boolean> = inject(MatchLeaveWarning).watch(computed((): boolean => this.gameSession().inMatch()));
    private readonly languageService = inject(LanguageService);

    private readonly playedPiece = signal<Vec2>(new Vec2(-1, -1));
    protected readonly validPlayBoard = signal<ValidPlayBoard>(ChessBoardHelper.createFilledBoard(false));
    protected whiteColor: PieceColor = PieceColor.WHITE;
    protected blackColor: PieceColor = PieceColor.BLACK;

    /**
     * The color at the bottom of the board: the one of the local player. A spectator sees the board from the free seat
     * it may take, where it shows once seated, else from the side of White
     */
    protected readonly bottomColor: Signal<PieceColor> = computed((): PieceColor => {
        const session: SynchronousChessGameSession = this.gameSession();
        const { whitePlayer, blackPlayer } = session.configuration();

        if (session.myColor !== PieceColor.NONE) {
            return session.myColor;
        }
        return session.seatsOpen() && whitePlayer !== undefined && blackPlayer === undefined ? PieceColor.BLACK : PieceColor.WHITE;
    });
    protected readonly topColor: Signal<PieceColor> = computed((): PieceColor => this.bottomColor() === PieceColor.WHITE ? PieceColor.BLACK : PieceColor.WHITE);

    /** The moves of the game, the latest first: its history, shown by the page in the panel of the room, after the end of a player away */
    public readonly history: Signal<ReadonlyArray<TranslatableText>> = computed((): ReadonlyArray<TranslatableText> => {
        const game: SynchronousChessGame = this.gameSession().game;
        const result: GameResult | null = game.result();
        const lines: ReadonlyArray<TranslatableText> = playedTurnLines(game.playedTurns());
        return result?.reason === GameEndReason.AWAY
            ? [{ key: scopedKey(TranslationScope.CHESS, marker('game.history.away', undefined, 'chess')), params: { color: result.winner === PieceColor.WHITE ? PieceColor.BLACK : PieceColor.WHITE } }, ...lines]
            : lines;
    });

    protected readonly clockLow: number = CLOCK_LOW;
    /** The clock of the other player, away, on the page of the player waiting for it: the game claimed once over */
    protected readonly awayTimeLeft: Signal<number | null> = turnClock({
        // A turn run starts the time again: the other player played meanwhile
        running: (): boolean => {
            const session: SynchronousChessGameSession = this.gameSession();
            session.game.playedTurns();
            return session.forfeitClaimable();
        },
        times: () => ({ turnTime: CHESS_AWAY_TIME, awayTime: 0 }),
        // The time of the player away is its whole time
        away: computed((): boolean => false),
        timeOut: () => this.gameSession().claimForfeit(),
    });
    /** The names of the players away, listed in the language of the page */
    private readonly listFormat = computed<Intl.ListFormat>(() => new Intl.ListFormat(this.languageService.language(), { type: 'conjunction' }));
    /** A seated player away during the game: every page waits for it */
    protected readonly awayStatus: Signal<TranslatableText | undefined> = computed((): TranslatableText | undefined => {
        const session: SynchronousChessGameSession = this.gameSession();
        const away: ReadonlyArray<string> = session.awayPlayers();
        return away.length > 0 && !session.seatsOpen() && !session.game.isGameOver()
            ? { key: scopedKey(TranslationScope.CHESS, marker('game.away', undefined, 'chess')), params: { name: this.listFormat().format(away) } }
            : undefined;
    });

    public ngOnDestroy(): void {
        this.gameSession().destroy();
    }

    public piecePicked(cellPos: Vec2): void {
        this.playedPiece.set(cellPos);
        this.pieceClicked(cellPos);
    }

    public pieceClicked(cellPos: Vec2): void {
        const validPlayBoard: ValidPlayBoard = ChessBoardHelper.createFilledBoard(false);
        this.gameSession().game.getPossiblePlays(cellPos).forEach((play: Vec2) => {
            validPlayBoard[play.y][play.x] = true;
        });
        this.validPlayBoard.set(validPlayBoard);
    }

    public pieceDropped(cellPos: Vec2): void {
        const coordinateMove: CoordinateMove = {
            from: this.playedPiece().toArray(),
            to: cellPos.toArray()
        };

        this.gameSession().move(ChessBoardHelper.fromCoordinateMoveToMove(coordinateMove));
        this.resetHighlight();
        this.playedPiece.set(new Vec2(-1, -1));
    }

    /** The key of the name of the turn */
    public turnType(): string {
        const turnType: TurnType = this.gameSession().game.getTurnType();
        switch (turnType) {
            case TurnType.MOVE_SYNC:
                return scopedKey(TranslationScope.CHESS, marker('game.turn.sync', undefined, 'chess'));
            case TurnType.MOVE_INTERMEDIATE:
                return scopedKey(TranslationScope.CHESS, marker('game.turn.intermediate', undefined, 'chess'));
            case TurnType.CHOICE_PROMOTION:
                return scopedKey(TranslationScope.CHESS, marker('game.turn.promotion', undefined, 'chess'));
            default:
                return switchExhaustivenessGuard(turnType);
        }
    }

    public isMoveTurn(): boolean {
        return this.gameSession().game.getTurnCategory() === TurnCategory.MOVE;
    }

    public moveColor(): PieceColor {
        return this.isMoveTurn() ? this.gameSession().playingColor : PieceColor.NONE;
    }

    // Only an intermediate turn can be skipped, a synchronous turn requires a move from both players
    public canSkip(): boolean {
        return this.gameSession().game.getTurnType() === TurnType.MOVE_INTERMEDIATE;
    }

    public isPromotion(): boolean {
        return this.gameSession().game.getTurnType() === TurnType.CHOICE_PROMOTION;
    }

    public hasPlayed(color: PieceColor): boolean {
        return this.gameSession().game.hasPlayed(color);
    }

    public lastMove(color: PieceColor): TranslatableText {
        const action: MoveTurnAction | null = this.gameSession().game.lastMoveTurnAction();
        if (action === null) {
            return { key: scopedKey(TranslationScope.CHESS, marker('game.lastMove.none', undefined, 'chess')) };
        }
        return this.formatLastMove(color === PieceColor.WHITE ? action.whiteMove : action.blackMove);
    }

    public displayInteractions(color: PieceColor): boolean {
        return this.gameSession().playingColor === color && !this.gameSession().game.isGameOver();
    }

    public inCheck(color: PieceColor): boolean {
        return color === PieceColor.WHITE ? this.gameSession().game.isWhiteInCheck() : this.gameSession().game.isBlackInCheck();
    }

    public inCheckmate(color: PieceColor): boolean {
        return color === PieceColor.WHITE ? this.gameSession().game.isWhiteInCheckmate() : this.gameSession().game.isBlackInCheckmate();
    }

    /** The king standing for the player of a color */
    protected king(color: PieceColor): FenPiece {
        return color === PieceColor.WHITE ? FenPiece.WHITE_KING : FenPiece.BLACK_KING;
    }

    /** The end of the game, once over. A win picks its sentence by the winner (an ICU select): no color word fits in it */
    public resultText(): TranslatableText | undefined {
        const result: GameResult | null = this.gameSession().game.result();
        return result === null
            ? undefined
            : { key: scopedKey(TranslationScope.CHESS, SyncChessGameComponent.resultKey(result)), params: { winner: result.winner } };
    }

    // The key of the result in the chess scope, without its scope (scopedKey)
    private static resultKey(result: GameResult): string {
        switch (result.reason) {
            case GameEndReason.CHECKMATE:
                return marker('game.result.checkmate', undefined, 'chess');
            case GameEndReason.KING_CAPTURED:
                return result.winner === PieceColor.NONE
                    ? marker('game.result.kingsCaptured', undefined, 'chess')
                    : marker('game.result.kingCaptured', undefined, 'chess');
            case GameEndReason.DOUBLE_CHECKMATE:
                return marker('game.result.doubleCheckmate', undefined, 'chess');
            case GameEndReason.STALEMATE:
                return marker('game.result.stalemate', undefined, 'chess');
            case GameEndReason.THREEFOLD_REPETITION:
                return marker('game.result.threefoldRepetition', undefined, 'chess');
            case GameEndReason.FIFTY_TURNS:
                return marker('game.result.fiftyTurns', undefined, 'chess');
            case GameEndReason.INSUFFICIENT_MATERIAL:
                return marker('game.result.insufficientMaterial', undefined, 'chess');
            case GameEndReason.AWAY:
                return marker('game.result.away', undefined, 'chess');
            default:
                return switchExhaustivenessGuard(result.reason);
        }
    }

    public skip(): void {
        this.gameSession().move(null);
    }

    /** A participant without a seat takes the free one at the bottom of the board, until the game starts */
    public canTakeSeat(): boolean {
        return this.gameSession().seatsOpen() && this.gameSession().myColor === PieceColor.NONE && this.seatedPlayer(this.bottomColor()) === undefined;
    }

    /** The local player leaves its seat, at the bottom of the board, until the game starts */
    public canLeaveSeat(): boolean {
        return this.gameSession().seatsOpen() && this.gameSession().myColor !== PieceColor.NONE;
    }

    /** The local player frees the seat of a player away, until the game starts: the other seated player, or the host */
    public canRelease(color: PieceColor): boolean {
        return this.gameSession().canRelease(color);
    }

    public release(color: PieceColor): void {
        // A second click, before the request is in the chain, sends nothing
        if (this.canRelease(color)) {
            this.gameSession().release(color);
        }
    }

    public takeSeat(color: PieceColor): void {
        this.gameSession().takeSeat(color);
    }

    public leaveSeat(): void {
        this.gameSession().leaveSeat();
    }

    protected seatedPlayer(color: PieceColor): string | undefined {
        const { whitePlayer, blackPlayer } = this.gameSession().configuration();
        return color === PieceColor.WHITE ? whitePlayer : blackPlayer;
    }

    private resetHighlight(): void {
        this.validPlayBoard.set(ChessBoardHelper.createFilledBoard(false));
    }

    private formatLastMove(move: Move | null): TranslatableText {
        if (move === null) {
            return { key: scopedKey(TranslationScope.CHESS, marker('game.lastMove.passed', undefined, 'chess')) };
        }
        return { key: scopedKey(TranslationScope.CHESS, marker('game.lastMove.move', undefined, 'chess')), params: { from: squareName(move.from), to: squareName(move.to) } };
    }
}
