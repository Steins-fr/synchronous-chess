import * as esbuild from "esbuild";

const { metafile } = await esbuild.build({
    entryPoints: [
        { out: "onconnect", in: "./lambdas/onconnect/app.ts" },
        { out: "ondisconnect", in: "./lambdas/ondisconnect/app.ts" },
        { out: "sendmessage", in: "./lambdas/sendmessage/app.ts" },
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
