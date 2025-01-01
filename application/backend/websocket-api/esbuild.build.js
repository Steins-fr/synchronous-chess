import * as esbuild from "esbuild";

await esbuild.build({
    entryPoints: [
        { out: "onconnect", in: "./lambdas/onconnect/app.ts" },
        { out: "ondisconnect", in: "./lambdas/ondisconnect/app.ts" },
        { out: "sendmessage", in: "./lambdas/sendmessage/app.ts" },
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
