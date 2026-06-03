import fs from 'node:fs';
import path from 'node:path';
import { select } from '@inquirer/prompts';
import { api } from '../api.js';
import { findWidgetById, findWidgetByCwd, readMetadata, widgetRoot } from '../lib/widget-fs.js';
import { sprintf } from '../utils/sprintf.js';
const scanLocalWidgets = () => {
    const root = widgetRoot();
    if (!fs.existsSync(root)) {
        return [];
    }
    const widgets = [];
    const entries = fs.readdirSync(root, { withFileTypes: true });
    for (const entry of entries) {
        if (!entry.isDirectory())
            continue;
        const dir = path.join(root, entry.name);
        const meta = readMetadata(dir);
        if (!meta)
            continue;
        widgets.push({ dir, meta });
    }
    widgets.sort((a, b) => a.meta.id - b.meta.id);
    return widgets;
};
// ----- LOCAL picker (push/validate/proxy — needs HTML/SCSS files locally) -----
export const pickLocalWidget = async (action) => {
    const candidates = scanLocalWidgets();
    if (candidates.length === 0) {
        throw new Error('No local widgets found in widgets/. Run `pobo widget create` first.');
    }
    if (candidates.length === 1) {
        return candidates[0];
    }
    const selectedId = await select({
        message: sprintf('Pick a widget to %s:', action),
        choices: candidates.map((w) => ({
            name: sprintf('#%s  %s  (%s)', w.meta.id, w.meta.name, w.meta.root_class),
            value: w.meta.id,
        })),
    });
    const selected = candidates.find((w) => w.meta.id === selectedId);
    if (!selected) {
        throw new Error(sprintf('Widget #%s not found in local widgets/ folder.', selectedId));
    }
    return selected;
};
export const resolveOrPick = async (idArg, action) => {
    if (idArg) {
        const found = findWidgetById(idArg);
        if (!found) {
            throw new Error(sprintf('Widget with ID %s not found in widgets/%s.', idArg, idArg));
        }
        return found;
    }
    const cwd = findWidgetByCwd();
    if (cwd)
        return cwd;
    return pickLocalWidget(action);
};
// ----- SERVER picker (delete/flush/connect/show — server-side ops, local files irrelevant) -----
const parseId = (idArg) => {
    const id = typeof idArg === 'number' ? idArg : parseInt(idArg, 10);
    if (Number.isNaN(id)) {
        throw new Error(sprintf('Invalid widget ID: %s', idArg));
    }
    return id;
};
export const pickServerWidget = async (action, token, apiUrl) => {
    const result = await api.listWidgets(token, apiUrl);
    const widgets = result.data ?? [];
    if (widgets.length === 0) {
        throw new Error('No widgets on the server. Run `pobo widget create` first.');
    }
    if (widgets.length === 1) {
        return widgets[0];
    }
    const selectedId = await select({
        message: sprintf('Pick a widget to %s:', action),
        choices: widgets.map((w) => ({
            name: sprintf('#%s  %s  (%s)', w.id, w.name, w.root_class),
            value: w.id,
        })),
    });
    const selected = widgets.find((w) => w.id === selectedId);
    if (!selected) {
        throw new Error(sprintf('Widget #%s not found in server response.', selectedId));
    }
    return selected;
};
export const resolveOrPickServer = async (idArg, action, token, apiUrl) => {
    const result = await api.listWidgets(token, apiUrl);
    const widgets = result.data ?? [];
    if (widgets.length === 0) {
        throw new Error('No widgets on the server. Run `pobo widget create` first.');
    }
    if (idArg) {
        const id = parseId(idArg);
        const found = widgets.find((w) => w.id === id);
        if (!found) {
            throw new Error(sprintf('Widget #%s not found on the server.', id));
        }
        return found;
    }
    const cwd = findWidgetByCwd();
    if (cwd) {
        const found = widgets.find((w) => w.id === cwd.meta.id);
        if (found)
            return found;
        // cwd points at orphan widget — fall through to picker
    }
    if (widgets.length === 1) {
        return widgets[0];
    }
    const selectedId = await select({
        message: sprintf('Pick a widget to %s:', action),
        choices: widgets.map((w) => ({
            name: sprintf('#%s  %s  (%s)', w.id, w.name, w.root_class),
            value: w.id,
        })),
    });
    const selected = widgets.find((w) => w.id === selectedId);
    if (!selected) {
        throw new Error(sprintf('Widget #%s not found in server response.', selectedId));
    }
    return selected;
};
