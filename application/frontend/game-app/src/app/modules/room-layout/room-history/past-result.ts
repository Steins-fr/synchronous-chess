import { TranslatableText } from '@app/types/translatable-text.type';

/** The result of a match or a game over before the one in progress, on its line of the history of the room */
export interface PastResult {
    /** Its number in the room, from 1 */
    readonly number: number;
    /** Its number, told by its game: `Match 1:` */
    readonly label: TranslatableText;
    readonly text: TranslatableText;
    /** The check of its cards or its cylinder, which may end once the next one started, none while pending */
    readonly verification: TranslatableText | null;
}
