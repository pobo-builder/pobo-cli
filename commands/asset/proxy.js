import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import chalk from 'chalk';
import chokidar from 'chokidar';
import open from 'open';
import { select } from '@inquirer/prompts';
import { api } from '../../api.js';
import { requireToken } from '../../config.js';
import { requireManifest } from '../../lib/asset-fs.js';
import { hasDeployedAssetCss, injectIntoPage } from '../../lib/asset-injector.js';
import { stripProtocol } from '../../lib/eshop-display.js';
import { fetchPage, findFreePort } from '../../lib/proxy-server.js';
import { compileScssWithDeps } from '../../lib/scss-compiler.js';
import { sprintf } from '../../utils/sprintf.js';
const buildAssets = (dir, entries) => {
    let css = '';
    let js = '';
    const watchFiles = new Set();
    for (const entry of entries) {
        const file = path.resolve(dir, entry.source);
        watchFiles.add(file);
        if (!fs.existsSync(file)) {
            console.error(chalk.red(sprintf('Missing source file: %s', entry.source)));
            continue;
        }
        try {
            if (entry.type === 'style') {
                if (path.extname(file).toLowerCase() === '.scss') {
                    const result = compileScssWithDeps(file);
                    css += sprintf('\n/* %s (%s) */\n%s', entry.name, entry.source, result.css);
                    for (const dep of result.loadedFiles) {
                        watchFiles.add(dep);
                    }
                }
                else {
                    css += sprintf('\n/* %s (%s) */\n%s', entry.name, entry.source, fs.readFileSync(file, 'utf8'));
                }
            }
            else {
                js += sprintf('\n/* %s (%s) */\n%s\n', entry.name, entry.source, fs.readFileSync(file, 'utf8'));
            }
        }
        catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            console.error(chalk.red(sprintf('Build error in %s: %s', entry.source, message)));
        }
    }
    return { css, js, watchFiles: [...watchFiles] };
};
export const proxyCommand = async ({ url, eshop, port, open: shouldOpen }) => {
    const config = requireToken();
    const { dir, manifest } = requireManifest();
    const manifestEshopIds = [...new Set(manifest.asset.flatMap((entry) => entry.target.map((t) => t.eshop_id)))];
    if (manifestEshopIds.length === 0) {
        throw new Error('The manifest has no targets to preview. Run `pobo asset create` first.');
    }
    const eshops = (await api.listEshops(config.token, config.api_url)).data ?? [];
    const urlById = new Map(eshops.map((e) => [e.id, e.url]));
    let eshopId;
    if (eshop) {
        eshopId = parseInt(eshop, 10);
        if (Number.isNaN(eshopId)) {
            throw new Error(sprintf('Invalid eshop ID: %s', eshop));
        }
        if (!manifestEshopIds.includes(eshopId)) {
            throw new Error(sprintf('No manifest targets for eshop #%s.', eshopId));
        }
    }
    else if (manifestEshopIds.length === 1) {
        eshopId = manifestEshopIds[0];
    }
    else if (process.stdout.isTTY) {
        eshopId = await select({
            message: 'Pick an eshop to preview:',
            choices: manifestEshopIds.map((id) => {
                const eshopUrl = urlById.get(id);
                return {
                    name: eshopUrl
                        ? sprintf('%s  %s', stripProtocol(eshopUrl), chalk.gray(sprintf('#%s', id)))
                        : sprintf('#%s', id),
                    value: id,
                };
            }),
            pageSize: 20,
        });
    }
    else {
        throw new Error('Pass --eshop <id> to pick the eshop to preview (non-interactive terminal).');
    }
    const entries = manifest.asset.filter((entry) => entry.target.some((t) => t.eshop_id === eshopId));
    let resolvedUrl = url;
    if (!resolvedUrl) {
        resolvedUrl = urlById.get(eshopId);
        if (!resolvedUrl) {
            throw new Error(sprintf('Eshop #%s is not in your account — pass the page URL as an argument.', eshopId));
        }
    }
    if (!resolvedUrl.startsWith('http')) {
        throw new Error('Enter a valid eshop URL (http:// or https://).');
    }
    const parsedUrl = new URL(resolvedUrl);
    const clients = new Set();
    let missingCssWarned = false;
    const actualPort = await findFreePort(port);
    if (actualPort !== port) {
        console.log(chalk.yellow(sprintf('Port %s is busy — using %s instead.', port, actualPort)));
    }
    let built = buildAssets(dir, entries);
    const jsSources = new Set(entries
        .filter((entry) => entry.type === 'javascript')
        .map((entry) => path.resolve(dir, entry.source)));
    const pushUpdate = (payload) => {
        const message = sprintf('data: %s\n\n', JSON.stringify(payload));
        for (const client of clients) {
            client.write(message);
        }
        console.log(chalk.gray(sprintf('[%s] %s → %s client(s)', new Date().toLocaleTimeString(), payload.reload ? 'Reload' : 'CSS update', clients.size)));
    };
    const server = http.createServer(async (req, res) => {
        if (req.url === '/events') {
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            });
            clients.add(res);
            res.write(sprintf('data: %s\n\n', JSON.stringify({ css: built.css })));
            req.on('close', () => clients.delete(res));
            return;
        }
        // Any other path is in-proxy navigation: fetch the same path from the
        // eshop, inject the local assets and rewritten links, serve it.
        const targetUrl = req.url === '/'
            ? resolvedUrl
            : sprintf('%s%s', parsedUrl.origin, req.url);
        try {
            const pageHtml = await fetchPage(targetUrl);
            if (!hasDeployedAssetCss(pageHtml) && !missingCssWarned) {
                missingCssWarned = true;
                console.log(chalk.yellow('Deployed asset stylesheet (#pobo-template-core) not found on the page — injecting styles at the end of <head> instead.'));
            }
            const injected = injectIntoPage(pageHtml, new URL(targetUrl), actualPort, built.css, built.js);
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(injected);
        }
        catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end(sprintf('Failed to fetch page: %s', message));
        }
    });
    const watcher = chokidar.watch(built.watchFiles, { ignoreInitial: true });
    let debounce = null;
    watcher.on('all', (_event, filePath) => {
        if (debounce)
            clearTimeout(debounce);
        debounce = setTimeout(() => {
            built = buildAssets(dir, entries);
            watcher.add(built.watchFiles);
            if (jsSources.has(path.resolve(filePath))) {
                pushUpdate({ reload: true });
            }
            else {
                pushUpdate({ css: built.css });
            }
        }, 100);
    });
    const previewUrl = sprintf('http://localhost:%s', actualPort);
    server.listen(actualPort, () => {
        void (async () => {
            console.log('');
            console.log(chalk.green('  ✓ Pobo Asset Preview running'));
            console.log(chalk.gray(sprintf('    %s', previewUrl)));
            console.log('');
            console.log(chalk.gray(sprintf('  Eshop: %s %s', stripProtocol(resolvedUrl), chalk.gray(sprintf('#%s', eshopId)))));
            console.log(chalk.gray('  Deployed asset CSS/JS is replaced by your local sources (admin-created assets are not included).'));
            console.log(chalk.gray('  Watching:'));
            for (const entry of entries) {
                console.log(chalk.gray(sprintf('    %s (%s)', entry.source, entry.type)));
            }
            console.log('');
            if (!shouldOpen) {
                return;
            }
            try {
                await open(previewUrl);
            }
            catch (e) {
                const message = e instanceof Error ? e.message : String(e);
                console.log(chalk.yellow(sprintf('  Could not auto-open browser: %s', message)));
                console.log(chalk.gray(sprintf('  Open %s manually, or rerun with --no-open to skip.', previewUrl)));
            }
        })();
    });
    const cleanup = () => {
        void watcher.close();
        server.close();
        process.exit(0);
    };
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
};
