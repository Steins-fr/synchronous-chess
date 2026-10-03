// Generates sonar-way.json: the ESLint rules matching the TypeScript quality profile of the SonarCloud project,
// so that `npm run lint` raises the issues SonarCloud would report. The profile stays the reference: rerun this
// script when it changes (`npm run sonar-rules` from the game app), then review the diff.
//
// Needs the SonarQube CLI (`sonar`) on the PATH, authenticated on the organization of sonar-project.properties.
// Each rule of the profile is mapped through eslint-plugin-sonarjs (installed in the game app): its own rules carry
// their Sonar key and scope, its README maps the other keys to the ESLint core and plugin rules SonarCloud runs.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const pluginRoot = new URL('../../frontend/game-app/node_modules/eslint-plugin-sonarjs/', import.meta.url);
const sonarjs = createRequire(new URL('../../frontend/game-app/package.json', import.meta.url))('eslint-plugin-sonarjs');
const outputFile = new URL('sonar-way.json', import.meta.url);

// ESLint rule prefixes of the plugins used by the packages; the rules of the other plugins (React, Vue, jsx-a11y...)
// do not apply to this code base
const PREFIXES = {
    eslint: '',
    'typescript-eslint': '@typescript-eslint/',
    unicorn: 'unicorn/',
    promise: 'promise/',
    '@angular-eslint': '@angular-eslint/',
    import: 'import/',
};

// Rules only one package uses: the others go to `sources`
const PACKAGE_GROUPS = { '@angular-eslint': 'angular', import: 'import' };

// Translates the parameters of the profile to the ESLint options, the names differ
const OPTIONS = {
    S101: (p) => [{ format: p.format }],
    S107: (p) => [Number(p.maximumFunctionParameters)],
    S1479: (p) => [Number(p.maximum)],
    S2004: (p) => [{ threshold: Number(p.max) }],
    S2068: (p) => [{ passwordWords: p.passwordWords.split(',') }],
    S2999: (p) => [{ considerJSDoc: p.considerJSDoc === 'true' }],
    S3776: (p) => [Number(p.threshold)],
    S4275: (p) => [{ allowImplicit: p.allowImplicit === 'true' }],
    S5693: (p) => [{ fileUploadSizeLimit: Number(p.fileUploadSizeLimit), standardSizeLimit: Number(p.standardSizeLimit) }],
    S5843: (p) => [{ threshold: Number(p.threshold) }],
    S6418: (p) => [{ secretWords: p.secretWords, randomnessSensibility: Number(p.randomnessSensibility) }],
    S7718: (p) => [{ ignore: p.ignore.split(',') }],
};

// Deviations from the profile, by ESLint rule
const OVERRIDES = {
    // SonarCloud runs these rules with exceptions of its own that the ESLint rules lack: they flag the Angular
    // decorators (@Component...) and the helper classes with static members only
    'new-cap': 'off',
    '@typescript-eslint/no-extraneous-class': 'off',
};

function sonarApi(endpoint) {
    return execFileSync('sonar', ['api', 'get', endpoint], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
}

function readProjectProperties() {
    const properties = readFileSync(new URL('../../../sonar-project.properties', import.meta.url), 'utf8');
    return Object.fromEntries([...properties.matchAll(/^([\w.]+)=(.*)$/gm)].map(([, key, value]) => [key, value.trim()]));
}

// The text between the first `<tag>` and its closing tag
function xmlValue(xml, tag) {
    const start = xml.indexOf(`<${tag}>`);
    if (start === -1) {
        return '';
    }
    const end = xml.indexOf(`</${tag}>`, start);
    return xml.slice(start + tag.length + 2, end)
        .replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&apos;', "'").replaceAll('&amp;', '&');
}

// The active rules of the profile, from its backup: the search of the rules misses the ones SonarSource added lately
function fetchProfileRules(organization, profileName) {
    const backup = sonarApi(`/api/qualityprofiles/backup?organization=${organization}&language=ts&qualityProfile=${encodeURIComponent(profileName)}`);
    return backup.split('<rule>').slice(1).map((rule) => ({
        repo: xmlValue(rule, 'repositoryKey'),
        sonarKey: xmlValue(rule, 'key'),
        params: Object.fromEntries(rule.split('<parameter>').slice(1).map((param) => [xmlValue(param, 'key'), xmlValue(param, 'value')])),
    }));
}

// Sonar key -> { name, scope } of the rules of eslint-plugin-sonarjs
function readPluginRules() {
    const rules = {};
    for (const [name, rule] of Object.entries(sonarjs.rules)) {
        const sonarKey = rule.meta.docs.url.match(/S\d+/)[0];
        const meta = readFileSync(new URL(`cjs/${sonarKey}/generated-meta.js`, pluginRoot), 'utf8');
        rules[sonarKey] = { name, scope: meta.match(/scope = '(\w+)'/)[1] };
    }
    return rules;
}

// Sonar key -> [[plugin, rule]] of the ESLint rules SonarCloud runs, listed in the README of eslint-plugin-sonarjs
// (a key can map to several rules, one per plugin)
function readExternalRules() {
    const readme = readFileSync(new URL('README.md', pluginRoot), 'utf8');
    return Object.fromEntries(readme.split('\n').filter((line) => /^\| S\d+ /.test(line)).map((line) => {
        const [, sonarKey, cell] = line.split('|');
        // The links read `[plugin/rule](url)`
        const rules = cell.split('[').slice(1).map((part) => {
            const link = part.slice(0, part.indexOf(']'));
            const slash = link.lastIndexOf('/');
            return [link.slice(0, slash), link.slice(slash + 1)];
        });
        return [sonarKey.trim(), rules];
    }));
}

// The ESLint value of a rule: its severity, followed by its options when the profile sets parameters
function eslintValue(sonarKey, params) {
    if (Object.keys(params).length > 0 && !OPTIONS[sonarKey]) {
        throw new Error(`No translation of the parameters of ${sonarKey} (${JSON.stringify(params)}): add one to OPTIONS`);
    }
    const options = Object.keys(params).length > 0 ? OPTIONS[sonarKey](params) : [];
    return options.length > 0 ? ['error', ...options] : 'error';
}

function sortKeys(rules) {
    return Object.fromEntries(Object.entries(rules).sort(([a], [b]) => a.localeCompare(b)));
}

const { 'sonar.organization': organization, 'sonar.projectKey': projectKey } = readProjectProperties();
const profile = JSON.parse(sonarApi(`/api/qualityprofiles/search?organization=${organization}&project=${projectKey}&language=ts`)).profiles[0];
const pluginRules = readPluginRules();
const externalRules = readExternalRules();
const groups = { sources: {}, tests: {}, angular: {}, import: {} };
const skipped = {};

for (const { repo, sonarKey, params } of fetchProfileRules(organization, profile.name)) {
    if (repo !== 'typescript') {
        // Security (taint analysis) and architecture rules: SonarCloud only
        skipped[repo] = (skipped[repo] ?? 0) + 1;
    } else if (pluginRules[sonarKey]) {
        const { name, scope } = pluginRules[sonarKey];
        groups[scope === 'Tests' ? 'tests' : 'sources'][`sonarjs/${name}`] = eslintValue(sonarKey, params);
    } else {
        const rules = externalRules[sonarKey] ?? [[`unknown to eslint-plugin-sonarjs ${sonarjs.meta.version}`]];
        const usedRules = rules.filter(([plugin]) => plugin in PREFIXES);
        for (const [plugin, rule] of usedRules) {
            groups[PACKAGE_GROUPS[plugin] ?? 'sources'][PREFIXES[plugin] + rule] = eslintValue(sonarKey, params);
        }
        if (usedRules.length === 0) {
            skipped[rules[0][0]] = (skipped[rules[0][0]] ?? 0) + 1;
        }
    }
}

for (const rules of Object.values(groups)) {
    for (const [rule, value] of Object.entries(OVERRIDES)) {
        if (rule in rules) {
            rules[rule] = value;
        }
    }
}

writeFileSync(outputFile, JSON.stringify({
    profile: profile.name,
    ...Object.fromEntries(Object.entries(groups).map(([group, rules]) => [group, sortKeys(rules)])),
}, null, 4) + '\n');

const groupCounts = Object.entries(groups).map(([group, rules]) => Object.keys(rules).length + ' ' + group);
const skippedCounts = Object.entries(skipped).map(([plugin, count]) => count + ' ' + plugin);
console.log(`${profile.name}: ${groupCounts.join(', ')}`);
console.log(`Skipped: ${skippedCounts.join(', ')}`);
