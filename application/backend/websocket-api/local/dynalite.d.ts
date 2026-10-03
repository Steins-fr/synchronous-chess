// dynalite ships no types: only what the local server uses
declare module 'dynalite' {
    import { Server } from 'node:http';

    interface DynaliteOptions {
        /** Milliseconds a table takes to become active */
        createTableMs?: number;
        deleteTableMs?: number;
        updateTableMs?: number;
        /** LevelDB directory to persist the tables, in memory otherwise */
        path?: string;
    }

    export default function dynalite(options?: DynaliteOptions): Server;
}
