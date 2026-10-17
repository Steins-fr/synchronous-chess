import { defineRelations } from 'drizzle-orm';
import * as schema from './schema';

/** What the relational queries read with a room (`db.query.rooms`) */
// eslint-disable-next-line @typescript-eslint/typedef, @typescript-eslint/explicit-function-return-type -- Drizzle types the relations from what the builder returns: annotated, they would be lost
export const relations = defineRelations(schema, (r) => ({
    rooms: {
        players: r.many.roomPlayers({ from: r.rooms.id, to: r.roomPlayers.roomId }),
        queue: r.many.roomQueue({ from: r.rooms.id, to: r.roomQueue.roomId }),
        tokens: r.many.roomTokens({ from: r.rooms.id, to: r.roomTokens.roomId }),
    },
}));
