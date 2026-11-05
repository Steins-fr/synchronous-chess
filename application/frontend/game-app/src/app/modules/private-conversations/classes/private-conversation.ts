import { TranslatableText } from '@app/types/translatable-text.type';

/** A conversation a game declares, the same on every page */
export interface PrivateConversation {
    /** Unique in the room, see CONVERSATION_ID: the game and its attempt prefix it */
    readonly id: string;
    /** Fixed: other members make another conversation */
    readonly members: ReadonlyArray<string>;
    readonly title: TranslatableText;
    /**
     * Whether its members may write in it. It drives the composer and the notice of the conversation closed only: a
     * message received while it is closed shows, the game being on another chain, ordered apart
     */
    readonly open: boolean;
}
