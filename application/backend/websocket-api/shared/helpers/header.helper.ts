/** The headers of an event of API Gateway: the websocket API keeps the case of their names the client sent */
export type EventHeaders = Readonly<Record<string, string | undefined>> | null | undefined;

/** The value of a header of an event, whatever the case of its name */
export function headerValue(headers: EventHeaders, name: string): string | undefined {
    const lowerCaseName: string = name.toLowerCase();

    return Object.entries(headers ?? {}).find(([header]: [string, string | undefined]): boolean => header.toLowerCase() === lowerCaseName)?.[1];
}
