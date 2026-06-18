import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import chalk from 'chalk';
import Table from 'cli-table3';
import { api } from '../../api.js';
import { getApiUrl, readConfig } from '../../config.js';
import { sprintf } from '../../utils/sprintf.js';
const NODE_REQUIRED = '22.12.0';
const compareVersions = (a, b) => {
    const aParts = a.split('.').map((n) => parseInt(n, 10));
    const bParts = b.split('.').map((n) => parseInt(n, 10));
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
        const av = aParts[i] ?? 0;
        const bv = bParts[i] ?? 0;
        if (av !== bv)
            return av > bv ? 1 : -1;
    }
    return 0;
};
const statusIcon = (status) => {
    switch (status) {
        case 'ok': return chalk.green('✓');
        case 'fail': return chalk.red('✗');
        case 'warn': return chalk.yellow('⚠');
        case 'info': return chalk.gray('·');
    }
};
const checkNodeVersion = () => {
    const current = process.versions.node;
    const ok = compareVersions(current, NODE_REQUIRED) >= 0;
    return {
        label: 'Node version',
        value: sprintf('v%s', current),
        status: ok ? 'ok' : 'fail',
        hint: ok ? undefined : sprintf('Required ≥ %s — upgrade Node', NODE_REQUIRED),
    };
};
const checkEnvVar = (name) => {
    const value = process.env[name];
    return {
        label: name,
        value: value ?? '(not set)',
        status: value ? 'ok' : 'info',
    };
};
const checkConfigFile = () => {
    const configPath = path.join(os.homedir(), '.pobo', 'config.json');
    if (!fs.existsSync(configPath)) {
        return {
            label: 'File',
            value: '(missing)',
            status: 'fail',
            hint: 'Run `pobo auth login` to create it.',
        };
    }
    if (process.platform === 'win32') {
        return { label: 'File', value: 'exists (mode N/A on Windows)', status: 'ok' };
    }
    const stat = fs.statSync(configPath);
    const mode = stat.mode & 0o777;
    if (mode === 0o600) {
        return { label: 'File', value: 'exists, mode 0600', status: 'ok' };
    }
    return {
        label: 'File',
        value: sprintf('exists, mode 0%s', mode.toString(8).padStart(3, '0')),
        status: 'warn',
        hint: 'Should be 0600 for security: chmod 600 ~/.pobo/config.json',
    };
};
const checkToken = (config) => {
    if (!config.token) {
        return {
            label: 'Token',
            value: '(missing)',
            status: 'fail',
            hint: 'Run `pobo auth login`.',
        };
    }
    const len = config.token.length;
    if (len < 32 || len > 128) {
        return {
            label: 'Token',
            value: sprintf('present (%s chars, out of expected 32-128)', len),
            status: 'warn',
        };
    }
    return { label: 'Token', value: sprintf('present (%s chars)', len), status: 'ok' };
};
const checkConfigApiUrl = (config) => ({
    label: 'api_url',
    value: config.api_url ?? '(not set)',
    status: config.api_url ? 'ok' : 'info',
});
const checkResolvedApiUrl = (config) => {
    try {
        const url = getApiUrl(config);
        return { label: 'Resolved API URL', value: url, status: 'ok' };
    }
    catch (e) {
        return {
            label: 'Resolved API URL',
            value: '(unresolvable)',
            status: 'fail',
            hint: e instanceof Error ? e.message : String(e),
        };
    }
};
const checkAuthenticated = async (token, url) => {
    try {
        const me = await api.me(token, url);
        const eshopCount = me.eshop?.length ?? 0;
        return {
            label: 'Authentication',
            value: sprintf('%s (%s eshops)', me.email, eshopCount),
            status: 'ok',
        };
    }
    catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
            label: 'Authentication',
            value: '(failed)',
            status: 'fail',
            hint: message,
        };
    }
};
const checkLocalWidgets = () => {
    const widgetsDir = path.join(process.cwd(), 'widgets');
    if (!fs.existsSync(widgetsDir)) {
        return { label: 'widgets/', value: '(no local widgets)', status: 'info' };
    }
    const entries = fs.readdirSync(widgetsDir, { withFileTypes: true });
    let valid = 0;
    let invalid = 0;
    const ids = [];
    for (const entry of entries) {
        if (!entry.isDirectory())
            continue;
        const metaFile = path.join(widgetsDir, entry.name, 'widget.json');
        if (!fs.existsSync(metaFile)) {
            invalid++;
            continue;
        }
        try {
            const parsed = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
            if (typeof parsed.id === 'number') {
                valid++;
                ids.push(parsed.id);
            }
            else {
                invalid++;
            }
        }
        catch {
            invalid++;
        }
    }
    if (invalid > 0) {
        return {
            label: 'widgets/',
            value: sprintf('%s valid, %s invalid', valid, invalid),
            status: 'warn',
            hint: 'Some widget.json files are missing or malformed.',
        };
    }
    if (valid === 0) {
        return { label: 'widgets/', value: '(empty)', status: 'info' };
    }
    return {
        label: 'widgets/',
        value: sprintf('%s valid (%s)', valid, ids.sort((a, b) => a - b).map((id) => sprintf('#%s', id)).join(', ')),
        status: 'ok',
    };
};
const renderSection = (name, results) => {
    console.log(chalk.bold(sprintf('\n%s', name)));
    const table = new Table({
        style: { head: [], border: ['gray'] },
        colAligns: ['left', 'left', 'center'],
    });
    for (const r of results) {
        table.push([r.label, r.value, statusIcon(r.status)]);
    }
    console.log(table.toString());
    for (const r of results) {
        if (r.hint) {
            console.log(chalk.gray(sprintf('  → %s: %s', r.label, r.hint)));
        }
    }
};
export const doctorCommand = async () => {
    const all = [];
    const env = [
        checkNodeVersion(),
        checkEnvVar('POBO_API_URL'),
        checkEnvVar('POBO_DEFAULT_API_URL'),
    ];
    renderSection('Environment', env);
    all.push(...env);
    const config = readConfig();
    const cfg = [
        checkConfigFile(),
        checkToken(config),
        checkConfigApiUrl(config),
    ];
    renderSection('Config (~/.pobo/config.json)', cfg);
    all.push(...cfg);
    const resolved = checkResolvedApiUrl(config);
    const conn = [resolved];
    if (resolved.status === 'ok' && config.token) {
        conn.push(await checkAuthenticated(config.token, getApiUrl(config)));
    }
    else if (!config.token) {
        conn.push({
            label: 'Authentication',
            value: '(skipped — no token)',
            status: 'info',
        });
    }
    renderSection('Connectivity', conn);
    all.push(...conn);
    const widgets = [checkLocalWidgets()];
    renderSection('Local widgets', widgets);
    all.push(...widgets);
    const fails = all.filter((r) => r.status === 'fail').length;
    const warns = all.filter((r) => r.status === 'warn').length;
    console.log('');
    if (fails === 0 && warns === 0) {
        console.log(chalk.green('All systems nominal. Go pásat widgety.'));
    }
    else if (fails === 0) {
        console.log(chalk.yellow(sprintf('%s warning(s) — review hints above.', warns)));
    }
    else {
        console.log(chalk.red(sprintf('%s failure(s), %s warning(s) — fix the ✗ rows first.', fails, warns)));
        process.exit(1);
    }
};
