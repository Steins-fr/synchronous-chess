/**
 * The key a name is searched by, in the indexes by prefix (RoomRepository): in lower case, the same for the name stored
 * and the search, so that a search finds a name whatever its case
 */
export function searchKey(text: string): string {
    return text.trim().toLocaleLowerCase();
}
