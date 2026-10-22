// The scopes of the translations: the texts of a game, in src/i18n/<scope>, loaded by the pages showing it only. A route
// writes its scopes as literals (provideTranslocoScope('chess')): the keys manager finds the scopes that way
export enum TranslationScope {
    CHESS = 'chess',
    CHAT = 'chat',
    POKER = 'poker',
    /** The names of the playing cards, shared by the card games */
    CARDS = 'cards',
}
