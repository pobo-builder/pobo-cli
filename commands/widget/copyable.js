import chalk from 'chalk';
import { checkbox, input } from '@inquirer/prompts';
import ora from 'ora';
import { api } from '../../api.js';
import { requireToken } from '../../config.js';
import { readHtml, sanitizeCopyableClass, writeCopyableClass } from '../../lib/widget-fs.js';
import { resolveOrPick } from '../../lib/widget-picker.js';
import { sprintf } from '../../utils/sprintf.js';
const parseClassList = (value) => {
    if (typeof value !== 'string') {
        return [];
    }
    return value
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry !== '');
};
const extractClassTokens = (html) => {
    const seen = new Set();
    const tokens = [];
    const matcher = /class\s*=\s*("([^"]*)"|'([^']*)')/g;
    let match;
    while ((match = matcher.exec(html)) !== null) {
        const value = match[2] ?? match[3] ?? '';
        for (const token of value.split(/\s+/)) {
            const trimmed = token.trim();
            if (trimmed === '' || seen.has(trimmed)) {
                continue;
            }
            seen.add(trimmed);
            tokens.push(trimmed);
        }
    }
    return tokens;
};
const printList = (widgetId, classes) => {
    if (classes.length === 0) {
        console.log(chalk.gray(sprintf('Widget #%s has no copyable classes.', widgetId)));
        return;
    }
    console.log(chalk.bold(sprintf('Copyable classes for widget #%s:', widgetId)));
    for (const cssClass of classes) {
        console.log(sprintf('  %s %s', chalk.green('•'), cssClass));
    }
};
const computeFromFlags = (current, args) => {
    if (args.clear === true) {
        return [];
    }
    let next = args.set !== undefined ? parseClassList(args.set) : [...current];
    if (args.add !== undefined) {
        next = [...next, ...parseClassList(args.add)];
    }
    if (args.remove !== undefined) {
        const removals = new Set(parseClassList(args.remove));
        next = next.filter((cssClass) => !removals.has(cssClass));
    }
    return next;
};
const selectInteractively = async (widget, current) => {
    let htmlClasses;
    try {
        htmlClasses = extractClassTokens(readHtml(widget));
    }
    catch {
        htmlClasses = [];
    }
    const options = [];
    const seen = new Set();
    for (const cssClass of [...htmlClasses, ...current]) {
        if (seen.has(cssClass)) {
            continue;
        }
        seen.add(cssClass);
        options.push(cssClass);
    }
    if (options.length === 0) {
        const answer = await input({
            message: 'Copyable classes (comma-separated):',
            default: current.join(', '),
        });
        return parseClassList(answer);
    }
    return checkbox({
        message: 'Select which element classes are duplicatable in the editor:',
        choices: options.map((cssClass) => ({
            name: cssClass,
            value: cssClass,
            checked: current.includes(cssClass),
        })),
        pageSize: 20,
        loop: false,
    });
};
export const copyableCommand = async (args) => {
    const config = requireToken();
    const widget = await resolveOrPick(args.id, 'edit copyable classes');
    const widgetId = widget.meta.id;
    const current = sanitizeCopyableClass(widget.meta.copyable_class);
    if (args.list === true) {
        printList(widgetId, current);
        return;
    }
    const hasFlag = args.clear === true || args.set !== undefined || args.add !== undefined || args.remove !== undefined;
    const next = sanitizeCopyableClass(hasFlag ? computeFromFlags(current, args) : await selectInteractively(widget, current));
    writeCopyableClass(widget, next);
    const spinner = ora('Syncing copyable classes to server...').start();
    let serverList = next;
    try {
        const response = await api.updateCopyableClass(config.token, widgetId, next, config.api_url);
        if (Array.isArray(response.copyable_class)) {
            serverList = response.copyable_class;
        }
        spinner.succeed(sprintf('Synced (%s copyable class%s)', serverList.length, serverList.length === 1 ? '' : 'es'));
    }
    catch (e) {
        spinner.fail('Server sync failed — local widget.json was updated, run `pobo widget copyable` again to retry.');
        throw e;
    }
    writeCopyableClass(widget, serverList);
    console.log('');
    printList(widgetId, serverList);
};
