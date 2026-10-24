/** The longest name of a room: the API refuses a longer one */
export const ROOM_NAME_MAX_LENGTH: number = 32;

/**
 * Joins the name of a room to its tag, in its id (`friday#451203`): the name given to create a room can not hold it, the
 * id splitting at it
 */
export const ROOM_TAG_SEPARATOR: string = '#';

/** The digits of the tag the API draws for a room: rooms of the same name, of any game, each get their own */
export const ROOM_TAG_DIGITS: number = 6;

/** The longest id of a room, its name and its tag: the API refuses a longer one */
export const ROOM_ID_MAX_LENGTH: number = ROOM_NAME_MAX_LENGTH + ROOM_TAG_SEPARATOR.length + ROOM_TAG_DIGITS;

/** The longest name of a player: the API refuses a longer one */
export const PLAYER_NAME_MAX_LENGTH: number = 32;

/**
 * The shortest password of a private room: the API refuses a shorter one. The passwords are limited by client, a client
 * trying them from many IPs does not guess a long one
 */
export const ROOM_PASSWORD_MIN_LENGTH: number = 6;

/** The longest password of a private room: the API refuses a longer one */
export const ROOM_PASSWORD_MAX_LENGTH: number = 128;

/** The longest search of the open rooms: the API refuses a longer one */
export const ROOM_SEARCH_MAX_LENGTH: number = 64;

/** The most players a room accepts: the API refuses to create a larger one */
export const ROOM_MAX_PLAYERS: number = 16;

/**
 * How long a private room refuses the passwords of a client which gave too many wrong ones, in seconds: the client
 * waits as long before giving a password again
 */
export const ROOM_PASSWORD_LOCK_DELAY: number = 60;
