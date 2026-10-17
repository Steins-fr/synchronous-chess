/** Now, in epoch seconds: the unit of the expiry of the rooms and of the counts of password attempts */
export function epochSeconds(): number {
    return Math.floor(Date.now() / 1000);
}
