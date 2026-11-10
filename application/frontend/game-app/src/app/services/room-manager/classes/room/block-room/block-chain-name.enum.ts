/** The block chains of the application, each one agrees on its blocks independently */
export enum BlockChainName {
    CHAT = 'chat',
    CHESS = 'chess',
    POKER = 'poker',
    ROULETTE = 'roulette',
    /** The Bid Poker: a name without a hyphen, a key of the selects of the texts of a cheat */
    BID_POKER = 'bid',
    /** The Minority Game */
    MINORITY = 'minority',
    /** The Contraband */
    CONTRABAND = 'contraband',
    /** The Garden of Eden */
    EDEN = 'eden',
    /** The Fixed Roulette */
    FIXED_ROULETTE = 'fixed',
    /** The private conversations of a game, encrypted to their members */
    PRIVATE = 'private',
}
