import * as esbuild from "esbuild";
import { cpSync, rmSync } from "node:fs";

const { metafile } = await esbuild.build({
    entryPoints: [
        { out: "onconnect", in: "./lambdas/onconnect/app.ts" },
        { out: "ondisconnect", in: "./lambdas/ondisconnect/app.ts" },
        { out: "sendmessage", in: "./lambdas/sendmessage/app.ts" },
        // The routes of the HTTP API
        { out: "httpapi", in: "./lambdas/httpapi/app.ts" },
        // A stage restricted to its owner: the login on its HTTP API, the authorizers of its APIs
        { out: "access", in: "./lambdas/access/app.ts" },
        { out: "wsauthorizer", in: "./lambdas/wsauthorizer/app.ts" },
        { out: "httpauthorizer", in: "./lambdas/httpauthorizer/app.ts" },
        // A directory, with the migrations it reads
        { out: "migrate/migrate", in: "./lambdas/migrate/app.ts" },
        // Invoked on a schedule, the database of production kept out of its deep sleep
        { out: "wakedatabase", in: "./lambdas/wakedatabase/app.ts" },
    ],
    bundle: true,
    write: true,
    outdir: "dist",
    platform: "node",
    target: ["node22"],
    legalComments: "none",
    format: "esm",
    outExtension: { ".js": ".mjs" },
    minify: true,
    external: ["@aws-sdk"],
    treeShaking: true,
    sourcemap: false,
    metafile: true,
});

// PGlite (WASM) runs the database of the local API and the specs only: the lambdas reach the Aurora cluster
const localDatabase = Object.keys(metafile.inputs).filter((input) => /@electric-sql\/pglite|drizzle-orm\/pglite/.test(input));
if (localDatabase.length > 0) {
    throw new Error(`The lambdas bundle the local database: ${localDatabase.join(", ")}`);
}

// The migrations the migrate lambda applies, read from its directory
rmSync("dist/migrate/drizzle", { recursive: true, force: true });
cpSync("drizzle", "dist/migrate/drizzle", { recursive: true });
