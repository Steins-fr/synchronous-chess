// The protocol has no package.json: it reuses the rules and the dependencies of the websocket API,
// whose `npm run lint` also lints this folder
import apiConfig from "../../backend/websocket-api/eslint.config.mjs";

export default [
    ...apiConfig,
    {
        files: ["**/*.ts"],
        languageOptions: {
            parserOptions: {
                project: "tsconfig.json",
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },
];
