import { SoundEffect } from './enums/sound-effect.enum';
import { OneShotSoundEffect } from './sound-files';

/** The time between the sounds a change of a game plays one after the other, in seconds: the turns of a chess game, the end of a match after its hand */
export const SOUND_GAP: number = 0.3;

/**
 * The end of a game, or of a match, as a page hears it: a draw without a winner, else won by its winner and a spectator
 * (without a seat), lost by the other player
 */
export function gameEndSound<Seat>(winner: Seat | null, mine: Seat | null): OneShotSoundEffect {
    if (winner === null) {
        return SoundEffect.GAME_DRAW;
    }
    return mine === null || mine === winner ? SoundEffect.GAME_WON : SoundEffect.GAME_LOST;
}

/** A participant took a seat: a seat holds a player it did not hold before */
export function seatTaken(before: ReadonlyArray<string | null | undefined>, after: ReadonlyArray<string | null | undefined>): boolean {
    return after.some((player: string | null | undefined, seat: number) => player !== null && player !== undefined && player !== before[seat]);
}
