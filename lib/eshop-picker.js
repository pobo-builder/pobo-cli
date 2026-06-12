import { select } from '@inquirer/prompts';
import { api } from '../api.js';
import { buildEshopChoices } from '../lib/eshop-display.js';
import { sprintf } from '../utils/sprintf.js';
export const resolveEshop = async (eshopArg, action, token, apiUrl) => {
    const result = await api.listEshops(token, apiUrl);
    const eshops = result.data ?? [];
    if (eshops.length === 0) {
        throw new Error('No eshops are assigned to your account.');
    }
    if (eshopArg) {
        const id = parseInt(eshopArg, 10);
        if (Number.isNaN(id)) {
            throw new Error(sprintf('Invalid eshop ID: %s', eshopArg));
        }
        const found = eshops.find((e) => e.id === id);
        if (!found) {
            throw new Error(sprintf('Eshop #%s not found among your eshops.', id));
        }
        return found;
    }
    if (eshops.length === 1) {
        return eshops[0];
    }
    if (!process.stdout.isTTY) {
        throw new Error(sprintf('Pass --eshop <id> to pick the eshop to %s (non-interactive terminal).', action));
    }
    const selectedId = await select({
        message: sprintf('Pick an eshop to %s:', action),
        choices: buildEshopChoices(eshops),
        pageSize: 20,
    });
    const selected = eshops.find((e) => e.id === selectedId);
    if (!selected) {
        throw new Error(sprintf('Eshop #%s not found in server response.', selectedId));
    }
    return selected;
};
