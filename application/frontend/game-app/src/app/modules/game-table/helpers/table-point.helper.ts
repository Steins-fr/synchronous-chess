/** A place of the table, from its top left corner */
export interface TablePoint {
    readonly x: number;
    readonly y: number;
}

/** The middle of a box of the table, from the top left corner of the table */
export const middle = (rect: DOMRect, origin: DOMRect): TablePoint => ({ x: rect.left + rect.width / 2 - origin.left, y: rect.top + rect.height / 2 - origin.top });
