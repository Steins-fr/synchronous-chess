/** The game of a room, given by the page creating it: a page lists the open rooms of its own game only */
export enum RoomGame {
    CHESS = 'chess',
    CHAT = 'chat',
    SEVENTEEN_POKER = 'seventeen-poker',
    RUSSIAN_ROULETTE = 'russian-roulette',
    BID_POKER = 'bid-poker',
    MINORITY_GAME = 'minority-game',
    CONTRABAND = 'contraband',
    GARDEN_OF_EDEN = 'garden-of-eden',
}

/** Whether a game received from the network is one of the rooms */
export function isRoomGame(value: unknown): value is RoomGame {
    return (Object.values(RoomGame) as unknown[]).includes(value);
}
