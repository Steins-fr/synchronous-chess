/** The messages of an author within this delay of the chain count against its rate, in milliseconds */
export const CHAT_RATE_WINDOW: number = 10_000;
/**
 * The messages an author may have within the window: its next ones are hidden until its rate falls back. Far over what
 * the composer sends, as the network may pack the messages of an honest player on the chain
 */
export const CHAT_RATE_LIMIT: number = 8;
/** The messages the composer sends within the window: the next one waits */
export const CHAT_SEND_LIMIT: number = 3;

/** The rate of the authors of the chat, read on the chain alone: the same on every page, the history included */
export interface ChatFlood {
    /** The times of the latest messages of each author, shown or hidden, within the window: as many as the limit at most */
    readonly times: ReadonlyMap<string, ReadonlyArray<number>>;
    /** The authors whose messages are hidden since their latest one shown */
    readonly flooding: ReadonlySet<string>;
}

export interface ChatAdmission {
    readonly flood: ChatFlood;
    readonly shown: boolean;
    /** The first message hidden since the latest one shown of its author: the log tells it once */
    readonly notice: boolean;
}

export const NO_FLOOD: ChatFlood = { times: new Map(), flooding: new Set() };

/**
 * When the composer may send another message, the times its messages were sent given: none while it may
 * @param sentTimes when the local player sent its messages, by its own clock
 */
export function sendWaitUntil(sentTimes: ReadonlyArray<number>, now: number): number | undefined {
    const recent: ReadonlyArray<number> = sentTimes.filter((sent: number) => sent <= now && now - sent < CHAT_RATE_WINDOW).sort((a: number, b: number) => a - b);
    return recent.length < CHAT_SEND_LIMIT ? undefined : (recent.at(-CHAT_SEND_LIMIT) as number) + CHAT_RATE_WINDOW;
}

/**
 * Whether a message of the chain shows: its author over the rate is hidden, its hidden messages counted, so that a
 * flood stays hidden until it stops
 * @param time when the sequencer ordered the message, never before the previous one
 */
export function admitChatMessage(flood: ChatFlood, author: string, time: number): ChatAdmission {
    const recent: ReadonlyArray<number> = (flood.times.get(author) ?? []).filter((previous: number) => time - previous < CHAT_RATE_WINDOW);
    const shown: boolean = recent.length < CHAT_RATE_LIMIT;
    const notice: boolean = !shown && !flood.flooding.has(author);
    const flooding = new Set<string>(flood.flooding);

    if (shown) {
        flooding.delete(author);
    } else {
        flooding.add(author);
    }

    return { flood: { times: new Map(flood.times).set(author, [...recent, time].slice(-CHAT_RATE_LIMIT)), flooding }, shown, notice };
}
