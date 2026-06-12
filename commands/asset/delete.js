import chalk from 'chalk';
import { select } from '@inquirer/prompts';
import { api } from '../../api.js';
import { requireToken } from '../../config.js';
import { findManifest, writeManifest, MANIFEST_FILE } from '../../lib/asset-fs.js';
import { resolveEshop } from '../../lib/eshop-picker.js';
import { stripProtocol } from '../../lib/eshop-display.js';
import { sprintf } from '../../utils/sprintf.js';
export const deleteCommand = async ({ id, eshop, yes }) => {
    const config = requireToken();
    const eshopInfo = await resolveEshop(eshop, 'delete an asset from', config.token, config.api_url);
    const result = await api.listAssets(config.token, eshopInfo.id, config.api_url);
    const assets = result.data || [];
    let asset;
    if (id) {
        const assetId = parseInt(id, 10);
        if (Number.isNaN(assetId)) {
            throw new Error(sprintf('Invalid asset ID: %s', id));
        }
        const found = assets.find((a) => a.id === assetId);
        if (!found) {
            throw new Error(sprintf('Asset #%s not found on eshop #%s.', assetId, eshopInfo.id));
        }
        asset = found;
    }
    else {
        if (assets.length === 0) {
            throw new Error(sprintf('Eshop #%s has no CLI-managed assets.', eshopInfo.id));
        }
        if (!process.stdout.isTTY) {
            throw new Error('Pass the asset ID as an argument (non-interactive terminal).');
        }
        const selectedId = await select({
            message: sprintf('Pick an asset to delete from %s:', stripProtocol(eshopInfo.url)),
            choices: assets.map((a) => ({
                name: sprintf('#%s  %s  (%s)', a.id, a.name, a.type),
                value: a.id,
            })),
            pageSize: 20,
        });
        asset = assets.find((a) => a.id === selectedId);
    }
    if (!yes) {
        const action = await select({
            message: sprintf('Really DELETE asset #%s (%s) from %s? It will be removed from the CDN bundle.', asset.id, asset.name, stripProtocol(eshopInfo.url)),
            default: 'cancel',
            choices: [
                { name: 'No, cancel', value: 'cancel' },
                { name: 'Yes, delete the asset from the server', value: 'delete' },
            ],
        });
        if (action === 'cancel') {
            console.log(chalk.gray('Cancelled.'));
            return;
        }
    }
    await api.deleteAsset(config.token, eshopInfo.id, asset.id, config.api_url);
    console.log(chalk.green(sprintf('✓ Asset #%s deleted from %s.', asset.id, stripProtocol(eshopInfo.url))));
    const found = findManifest();
    if (!found) {
        return;
    }
    let removedTarget = false;
    for (const entry of found.manifest.asset) {
        const before = entry.target.length;
        entry.target = entry.target.filter((t) => !(t.eshop_id === eshopInfo.id && t.asset_id === asset.id));
        if (entry.target.length !== before) {
            removedTarget = true;
        }
    }
    if (removedTarget) {
        found.manifest.asset = found.manifest.asset.filter((entry) => entry.target.length > 0);
        writeManifest(found.file, found.manifest);
        console.log(chalk.gray(sprintf('  Removed the target from %s.', MANIFEST_FILE)));
    }
};
