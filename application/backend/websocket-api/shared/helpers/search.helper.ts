/**
 * The key a name is searched by (RoomRepository): in lower case, the same for the name stored and the search, so that a
 * search finds a name whatever its case
 */
export function searchKey(text: string): string {
    return text.trim().toLocaleLowerCase();
}

/** The text in a LIKE pattern, its wildcards matched as they are: `%`, `_` and the escape character `\` */
export function escapeLike(text: string): string {
    return text.replaceAll(/[\\%_]/g, (character: string): string => `\\${ character }`);
}
