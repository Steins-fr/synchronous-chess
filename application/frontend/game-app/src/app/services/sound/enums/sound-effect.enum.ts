// The sound effects of the games, played on every page of the room as the state of the game changes
export enum SoundEffect {
    CHESS_MOVE = 'chess-move',
    CHESS_CAPTURE = 'chess-capture',
    CHESS_CHECK = 'chess-check',
    CHESS_CASTLING = 'chess-castling',
    CHESS_PROMOTION = 'chess-promotion',
    CHESS_TURN_START = 'chess-turn-start',
    POKER_SHUFFLE = 'poker-shuffle',
    POKER_DEAL = 'poker-deal',
    POKER_CARD_TURN = 'poker-card-turn',
    POKER_FOLD = 'poker-fold',
    POKER_POT_WON = 'poker-pot-won',
    // The pot going to the other player, on the page of the player losing it
    POKER_POT_LOST = 'poker-pot-lost',
    // A bullet put in a chamber, on the page of the player picking its chambers
    ROULETTE_BULLET = 'roulette-bullet',
    ROULETTE_LOAD = 'roulette-load',
    ROULETTE_SPIN = 'roulette-spin',
    // The hammer cocked, as the revolver rises before the player
    ROULETTE_COCK = 'roulette-cock',
    // The hammer on an empty chamber
    ROULETTE_CLICK = 'roulette-click',
    ROULETTE_SHOT = 'roulette-shot',
    // A participant taking a seat, at every game
    SEAT_TAKEN = 'seat-taken',
    // Chips moving on a table: a bet, a pass, a pot, the chips of the table taken
    CHIPS = 'chips',
    // The end of a game, of every game: won on the page of its winner (a spectator too), lost on the page of its loser
    GAME_WON = 'game-won',
    GAME_LOST = 'game-lost',
    GAME_DRAW = 'game-draw',
    // A message of another participant received unread (the chat closed or scrolled up), or while the page is hidden
    CHAT_MESSAGE = 'chat-message',
    ROOM_JOIN = 'room-join',
    ROOM_LEAVE = 'room-leave',
}
