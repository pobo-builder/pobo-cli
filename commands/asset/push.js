import chalk from 'chalk';
import { select } from '@inquirer/prompts';
import { ApiError, api } from '../../api.js';
import { requireToken } from '../../config.js';
import { buildAssetValue, requireManifest, writeManifest } from '../../lib/asset-fs.js';
import { stripProtocol } from '../../lib/eshop-display.js';
import { sprintf } from '../../utils/sprintf.js';
// Interactive narrowing of the push scope. Only kicks in on a TTY without
// --eshop when the manifest targets several eshops; the default choice keeps
// the push-everything semantics, so Enter behaves exactly like before.
const pickEshopFilter = async (manifest, config) => {
    const eshopIds = [...new Set(manifest.asset.flatMap((entry) => entry.target.map((t) => t.eshop_id)))];
    if (eshopIds.length < 2) {
        return null;
    }
    const result = await api.listEshops(config.token, config.api_url);
    const urlById = new Map((result.data ?? []).map((e) => [e.id, e.url]));
    const targetCount = manifest.asset.reduce((sum, entry) => sum + entry.target.length, 0);
    const choice = await select({
        message: 'Push targets for:',
        default: 'all',
        choices: [
            { name: sprintf('All eshops (%s targets)', targetCount), value: 'all' },
            ...eshopIds.map((id) => {
                const url = urlById.get(id);
                return {
                    name: url
                        ? sprintf('%s  %s', stripProtocol(url), chalk.gray(sprintf('#%s', id)))
                        : sprintf('#%s', id),
                    value: id,
                };
            }),
        ],
        pageSize: 20,
    });
    return choice === 'all' ? null : choice;
};
export const pushCommand = async ({ eshop }) => {
    const config = requireToken();
    const { dir, file, manifest } = requireManifest();
    let eshopFilter = null;
    if (eshop) {
        eshopFilter = parseInt(eshop, 10);
        if (Number.isNaN(eshopFilter)) {
            throw new Error(sprintf('Invalid eshop ID: %s', eshop));
        }
    }
    else if (process.stdout.isTTY) {
        eshopFilter = await pickEshopFilter(manifest, config);
    }
    const items = [];
    for (const entry of manifest.asset) {
        for (const target of entry.target) {
            if (eshopFilter !== null && target.eshop_id !== eshopFilter)
                continue;
            items.push({ entry, target });
        }
    }
    if (items.length === 0) {
        throw new Error(eshopFilter !== null
            ? sprintf('No manifest targets for eshop #%s.', eshopFilter)
            : 'The manifest has no targets to push. Run `pobo asset create <file>` first.');
    }
    const successes = [];
    const failures = [];
    const values = new Map();
    let manifestDirty = false;
    for (const entry of new Set(items.map((i) => i.entry))) {
        try {
            const value = buildAssetValue(dir, entry.source);
            if (value.trim() === '') {
                // Comment-only SCSS compiles to nothing (compressed output
                // strips comments) — the server rejects empty values anyway.
                throw new Error(sprintf('%s produced an empty artifact — write some %s before pushing.', entry.source, entry.type === 'style' ? 'styles' : 'code'));
            }
            values.set(entry, value);
            console.log(chalk.gray(sprintf('Asset "%s" (%s, %s kB)', entry.name, entry.source, (Buffer.byteLength(value, 'utf8') / 1024).toFixed(1))));
        }
        catch (e) {
            values.set(entry, null);
            const reason = e instanceof Error ? e.message : String(e);
            console.log(chalk.red(sprintf('Asset "%s" (%s): %s', entry.name, entry.source, reason)));
        }
    }
    for (const item of items) {
        const { entry, target } = item;
        const value = values.get(entry);
        if (value === null || value === undefined) {
            failures.push({ item, reason: sprintf('Build failed for %s.', entry.source) });
            continue;
        }
        try {
            if (target.asset_id) {
                await api.updateAsset(config.token, target.eshop_id, target.asset_id, { name: entry.name, value }, config.api_url);
                successes.push({ item, created: false });
            }
            else {
                const created = await api.createAsset(config.token, target.eshop_id, { name: entry.name, type: entry.type, value }, config.api_url);
                target.asset_id = created.id;
                manifestDirty = true;
                successes.push({ item, created: true });
            }
        }
        catch (e) {
            const reason = e instanceof ApiError || e instanceof Error ? e.message : String(e);
            failures.push({ item, reason });
        }
    }
    // Persist asset_id write-backs even on partial failure — the created
    // assets exist on the server, losing their ids would orphan them.
    if (manifestDirty) {
        writeManifest(file, manifest);
    }
    console.log('');
    for (const { item, created } of successes) {
        console.log(chalk.green(sprintf('  ✓ %s → eshop #%s %s %s', item.entry.name, item.target.eshop_id, created ? 'created' : 'updated', chalk.gray(sprintf('#%s', item.target.asset_id)))));
    }
    for (const { item, reason } of failures) {
        console.log(chalk.red(sprintf('  ✗ %s → eshop #%s  %s', item.entry.name, item.target.eshop_id, chalk.gray(reason))));
    }
    if (failures.length === 0) {
        console.log(chalk.green(sprintf('\n✓ %s asset target(s) pushed.', successes.length)));
        return;
    }
    if (successes.length === 0) {
        throw new Error(sprintf('All %s asset push(es) failed.', failures.length));
    }
    console.log(chalk.yellow(sprintf('\n%s pushed, %s failed.', successes.length, failures.length)));
};
