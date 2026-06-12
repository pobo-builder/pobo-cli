import chalk from 'chalk';
import Table from 'cli-table3';
import { api } from '../../api.js';
import { requireToken } from '../../config.js';
import { resolveEshop } from '../../lib/eshop-picker.js';
import { stripProtocol } from '../../lib/eshop-display.js';
import { sprintf } from '../../utils/sprintf.js';
export const listCommand = async ({ eshop }) => {
    const config = requireToken();
    const eshopInfo = await resolveEshop(eshop, 'list assets for', config.token, config.api_url);
    const result = await api.listAssets(config.token, eshopInfo.id, config.api_url);
    const assets = result.data || [];
    console.log(chalk.gray(sprintf('Eshop %s %s', stripProtocol(eshopInfo.url), chalk.gray(sprintf('#%s', eshopInfo.id)))));
    if (assets.length === 0) {
        console.log(chalk.gray('No CLI-managed assets. Admin-created assets live in the Pobo admin only.'));
        return;
    }
    const table = new Table({
        head: [chalk.bold('ID'), chalk.bold('Name'), chalk.bold('Type'), chalk.bold('Updated')],
        style: { head: [], border: ['gray'] },
        colAligns: ['right', 'left', 'left', 'left'],
    });
    for (const asset of assets) {
        table.push([
            chalk.bold(sprintf('#%s', asset.id)),
            asset.name,
            asset.type,
            chalk.gray(asset.updated_at ?? '—'),
        ]);
    }
    console.log(table.toString());
};
