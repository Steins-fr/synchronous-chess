/** Now, in epoch seconds: the unit of the TTL of DynamoDB, which deletes the expired rooms and password attempts */
export function epochSeconds(): number {
    return Math.floor(Date.now() / 1000);
}
