import fs from 'node:fs';
import chalk from 'chalk';
import { select } from '@inquirer/prompts';
import ora from 'ora';
import { api } from '../../api.js';
import { connectCommand } from '../../commands/widget/connect.js';
import { requireToken } from '../../config.js';
import { compileScss } from '../../lib/scss-compiler.js';
import { readCssPreview, readHtml, readScss, sanitizeCopyableClass } from '../../lib/widget-fs.js';
import { resolveOrPick } from '../../lib/widget-picker.js';
import { sprintf } from '../../utils/sprintf.js';
export const pushCommand = async ({ id, yes }) => {
    const config = requireToken();
    const widget = await resolveOrPick(id, 'push');
    const widgetId = widget.meta.id;
    console.log(chalk.gray(sprintf('Widget #%s (%s)', widgetId, widget.meta.name)));
    const html = readHtml(widget);
    const scssPath = readScss(widget);
    const cssPreview = readCssPreview(widget);
    const compileSpinner = ora('Compiling SCSS...').start();
    let css;
    try {
        css = compileScss(scssPath);
        compileSpinner.succeed(sprintf('SCSS compiled (core %s kB, preview %s kB)', (css.length / 1024).toFixed(1), (cssPreview.length / 1024).toFixed(1)));
    }
    catch (e) {
        compileSpinner.fail('SCSS compilation failed');
        const message = e instanceof Error ? e.message : String(e);
        throw new Error(sprintf('SCSS compilation failed: %s', message), { cause: e });
    }
    const parseSpinner = ora('Parsing HTML on server...').start();
    const parsed = await api.parseWidget(config.token, widgetId, html, config.api_url);
    if (!parsed.widget || parsed.widget.length === 0) {
        parseSpinner.fail('HTML contains no elements');
        throw new Error('HTML contains no elements.');
    }
    parseSpinner.succeed(sprintf('Parsed (%s elements)', parsed.widget.length));
    const flushSpinner = ora('Deleting old elements...').start();
    await api.flushWidget(config.token, widgetId, config.api_url);
    flushSpinner.succeed('Old elements deleted');
    const copyableClass = sanitizeCopyableClass(widget.meta.copyable_class);
    const uploadSpinner = ora(sprintf('Pushing %s elements...', parsed.widget.length)).start();
    await api.pushWidget(config.token, widgetId, parsed.widget, copyableClass, config.api_url);
    uploadSpinner.succeed(sprintf('Elements pushed (%s copyable class%s)', copyableClass.length, copyableClass.length === 1 ? '' : 'es'));
    const cssSpinner = ora('Pushing CSS...').start();
    const scssSource = fs.readFileSync(scssPath, 'utf8');
    await api.updateCss(config.token, widgetId, { css, scss: scssSource, cssPreview, htmlSource: html }, config.api_url);
    cssSpinner.succeed(sprintf('CSS pushed (core %s kB, preview %s kB)', (css.length / 1024).toFixed(1), (cssPreview.length / 1024).toFixed(1)));
    console.log(chalk.green(sprintf('\n✓ Widget #%s pushed (%s elements, %s kB CSS).', widgetId, parsed.widget.length, (css.length / 1024).toFixed(1))));
    if (yes || !process.stdout.isTTY) {
        return;
    }
    const next = await select({
        message: 'What next?',
        default: 'done',
        choices: [
            { name: 'Done', value: 'done' },
            { name: 'Connect to an eshop', value: 'connect' },
        ],
    });
    if (next === 'connect') {
        await connectCommand({ id: String(widgetId) });
    }
};
