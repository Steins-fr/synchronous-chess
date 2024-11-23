import * as esbuild from "esbuild";

await esbuild.build({
    entryPoints: [
        { out: "onconnect", in: "./websocket-api/onconnect/src/app.ts" },
        { out: "ondisconnect", in: "./websocket-api/ondisconnect/src/app.ts" },
        { out: "sendmessage", in: "./websocket-api/sendmessage/src/app.ts" },
    ],
    bundle: true,
    write: true,
    outdir: "dist",
    target: ["node22"],
    legalComments: "none",
    format: "esm",
    outExtension: { ".js": ".mjs" },
    minify: true,
    external: ["@aws-sdk"],
    treeShaking: true,
    sourcemap: false,
});
