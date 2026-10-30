// The forms of a link, each one apart: an address with its scheme (`https://`), the www of a site, a domain of a common
// top level, in lowercase (`chess.com`, `discord.gg/abc`). The domains of two letters are left out but `.gg`, and the
// top levels in capitals: a sentence missing the space after its period (`fini.Je`, `ok.Net`) would read as one
const LINKS: ReadonlyArray<RegExp> = [
    /:\/\//u,
    /\bwww\./iu,
    /\b[\p{L}\d-]+\.(?:com|net|org|io|gg|ly|xyz|info|app|dev)\b/u,
];

/** A word of an e-mail address: a name, then a domain with a top level of two letters at least (not `@bob`, nor `a@b.c`) */
function isEmailAddress(word: string): boolean {
    const at: number = word.indexOf('@');
    const domain: string = word.slice(at + 1);
    const dot: number = domain.lastIndexOf('.');
    return at > 0 && !domain.includes('@') && dot > 0 && domain.length - dot > 2;
}

/** Whether a text holds a link or an e-mail address, refused in the chat: no player sends the others away from the room */
export function holdsLink(text: string): boolean {
    return LINKS.some((link: RegExp) => link.test(text)) || text.split(/\s/u).some((word: string) => isEmailAddress(word));
}
