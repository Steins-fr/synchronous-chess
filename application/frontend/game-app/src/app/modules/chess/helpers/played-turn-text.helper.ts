import { TranslationScope } from '@app/services/language/enums/translation-scope.enum';
import { scopedKey } from '@app/services/language/scoped-key';
import { TranslatableText } from '@app/types/translatable-text.type';
import { marker } from '@jsverse/transloco-keys-manager/marker';
import { PlayedAction, PlayedActionKind, PlayedTurn } from '../classes/games/played-turn';
import { PieceColor } from '../enums/piece-color.enum';
import { FenCoordinate } from '../interfaces/move';

/** A square as the board names it, e.g. E7 */
export function squareName(square: FenCoordinate): string {
    return `${ square[0].toUpperCase() }${ square[1] }`;
}

/** What a color played in a turn, after the number and the kind of the turn */
function playedActionText(turn: Readonly<PlayedTurn>, color: PieceColor, action: PlayedAction): TranslatableText {
    const params: Record<string, unknown> = { turn: turn.number, kind: turn.type, color };

    switch (action.kind) {
        case PlayedActionKind.MOVE:
            return {
                key: scopedKey(TranslationScope.CHESS, marker('game.history.move', undefined, 'chess')),
                params: { ...params, from: squareName(action.from), to: squareName(action.to) },
            };
        case PlayedActionKind.PASS:
            return { key: scopedKey(TranslationScope.CHESS, marker('game.history.pass', undefined, 'chess')), params };
        case PlayedActionKind.PROMOTION:
            return {
                key: scopedKey(TranslationScope.CHESS, marker('game.history.promotion', undefined, 'chess')),
                params: { ...params, square: squareName(action.square), piece: action.piece },
            };
    }
}

/**
 * The turns of the game, for its history: a line per color involved in a turn, white first, the latest turn first. A
 * color not involved, without a target in an intermediate turn or a pawn to promote, has no line
 */
export function playedTurnLines(turns: ReadonlyArray<Readonly<PlayedTurn>>): ReadonlyArray<TranslatableText> {
    return [...turns].reverse().flatMap((turn: Readonly<PlayedTurn>) => [
        ...(turn.white === null ? [] : [playedActionText(turn, PieceColor.WHITE, turn.white)]),
        ...(turn.black === null ? [] : [playedActionText(turn, PieceColor.BLACK, turn.black)]),
    ]);
}
