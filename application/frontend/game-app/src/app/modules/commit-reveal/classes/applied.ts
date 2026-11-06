/** What a move did */
export enum Applied {
    APPLIED = 'applied',
    /** Against the rules: the session reports it */
    ILLEGAL = 'illegal',
    /** Out of its phase, from a player not awaited, or sent again: the first one counts */
    IGNORED = 'ignored',
}
