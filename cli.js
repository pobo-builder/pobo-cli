import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import { PUBLIC_VERSION } from './constants.generated.js';
import { startRepl } from './repl.js';
import { loginCommand } from './commands/auth/login.js';
import { logoutCommand } from './commands/auth/logout.js';
import { meCommand } from './commands/auth/me.js';
import { aiCommand } from './commands/widget/ai.js';
import { createCommand } from './commands/widget/create.js';
import { deleteCommand } from './commands/widget/delete.js';
import { pushCommand } from './commands/widget/push.js';
import { copyableCommand } from './commands/widget/copyable.js';
import { validateCommand } from './commands/widget/validate.js';
import { connectCommand } from './commands/widget/connect.js';
import { connectionsCommand } from './commands/widget/connections.js';
import { disconnectCommand } from './commands/widget/disconnect.js';
import { flushCommand } from './commands/widget/flush.js';
import { previewCommand } from './commands/widget/preview.js';
import { proxyCommand } from './commands/widget/proxy.js';
import { listCommand } from './commands/widget/list.js';
import { showCommand } from './commands/widget/show.js';
import { doctorCommand } from './commands/system/doctor.js';
import { initCommand } from './commands/system/init.js';
import { listCommand as assetListCommand } from './commands/asset/list.js';
import { createCommand as assetCreateCommand } from './commands/asset/create.js';
import { pushCommand as assetPushCommand } from './commands/asset/push.js';
import { deleteCommand as assetDeleteCommand } from './commands/asset/delete.js';
import { proxyCommand as assetProxyCommand } from './commands/asset/proxy.js';
import { sprintf } from './utils/sprintf.js';
let inRepl = false;
const wrap = (fn) => {
    return async (...args) => {
        try {
            await fn(...args);
        }
        catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            console.error(chalk.red(sprintf('Error: %s', message)));
            if (!inRepl) {
                process.exit(1);
            }
        }
    };
};
const collectSubcommands = (cmd, indent = 0) => {
    const rows = [];
    for (const sub of cmd.commands) {
        if (sub.name() === 'help')
            continue;
        const pad = '  '.repeat(indent);
        const usage = sub.usage();
        const term = usage && usage !== '[options]'
            ? sprintf('%s %s', sub.name(), usage)
            : sub.name();
        rows.push({ command: pad + term, description: sub.description() });
        if (sub.commands.length > 0) {
            rows.push(...collectSubcommands(sub, indent + 1));
        }
    }
    return rows;
};
const buildProgram = () => {
    const program = new Command();
    program
        .name('pobo')
        .description('Pobo Page Builder CLI')
        .version(PUBLIC_VERSION);
    const auth = program.command('auth').description('Authentication');
    auth.command('login').description('Sign in with email and password').action(wrap(loginCommand));
    auth.command('logout').description('Sign out').action(wrap(logoutCommand));
    auth.command('me').description('Show current user info and available eshops').action(wrap(meCommand));
    const widget = program.command('widget').description('Widget management');
    widget.command('list').description('List your widgets').action(wrap(listCommand));
    widget.command('create').description('Create a new widget').action(wrap(createCommand));
    widget
        .command('ai [id]')
        .description('Generate widget HTML/SCSS from an image via Claude (server-side)')
        .requiredOption('-i, --image <path>', 'image file (PNG/JPG/WebP, ≤ 5 MB)')
        .option('-f, --force', 'overwrite local files without confirmation prompt')
        .action(wrap((id, options) => aiCommand({ id, image: options.image, force: options.force })));
    widget
        .command('show [id]')
        .description('Show widget details from server')
        .action(wrap((id) => showCommand({ id })));
    widget
        .command('push [id]')
        .description('Push widget to server (HTML + compiled CSS)')
        .option('-y, --yes', 'skip post-push follow-up prompt')
        .action(wrap((id, options) => pushCommand({ id, yes: options.yes })));
    widget
        .command('copyable [id]')
        .description('Manage which element classes are duplicatable in the editor')
        .option('-l, --list', 'list current copyable classes and exit')
        .option('-a, --add <classes>', 'comma-separated class names to add')
        .option('-r, --remove <classes>', 'comma-separated class names to remove')
        .option('-s, --set <classes>', 'replace the list with these comma-separated class names')
        .option('-c, --clear', 'remove all copyable classes')
        .action(wrap((id, options) => copyableCommand({ id, ...options })));
    widget
        .command('validate [id]')
        .description('Validate widget HTML')
        .action(wrap((id) => validateCommand({ id })));
    widget
        .command('connect [id]')
        .description('Connect widget to one or more e-shops')
        .action(wrap((id) => connectCommand({ id })));
    widget
        .command('disconnect [id]')
        .description('Disconnect widget from one or more e-shops')
        .option('-y, --yes', 'skip confirmation prompt')
        .action(wrap((id, options) => disconnectCommand({ id, yes: options.yes })));
    widget
        .command('connections')
        .description('Show widget × eshop connections matrix (all widgets in one call)')
        .action(wrap(connectionsCommand));
    widget
        .command('flush [id]')
        .description('Delete widget elements')
        .option('-y, --yes', 'skip confirmation prompt')
        .action(wrap((id, options) => flushCommand({ id, yes: options.yes })));
    widget
        .command('delete [id]')
        .description('Delete widget from server (cannot be undone)')
        .option('-y, --yes', 'skip confirmation prompt')
        .action(wrap((id, options) => deleteCommand({ id, yes: options.yes })));
    widget
        .command('preview [id]')
        .description('Open widget preview in browser')
        .option('--no-open', 'do not auto-open the preview URL in the browser')
        .action(wrap((id, options) => previewCommand({ id, open: options.open })));
    widget
        .command('proxy [url]')
        .description('Live preview widget on an e-shop page (wizard if no URL)')
        .option('-p, --port <port>', 'Preview server port', '3001')
        .option('-s, --selector <selector>', 'CSS selector for widget injection target', '.basic-description')
        .option('--no-open', 'do not auto-open the preview URL in the browser')
        .action(wrap((url, options) => proxyCommand({
        url,
        port: parseInt(options.port, 10),
        selector: options.selector,
        open: options.open,
    })));
    const asset = program.command('asset').description('Eshop JS/CSS asset management (compiled locally, pushed to the CDN bundle)');
    asset
        .command('list')
        .description('List the CLI-managed assets of an eshop')
        .option('-e, --eshop <id>', 'eshop ID (interactive picker when omitted)')
        .action(wrap((options) => assetListCommand({ eshop: options.eshop })));
    asset
        .command('create [file]')
        .description('Scaffold a new asset (interactive wizard) or register an existing SCSS/CSS/JS file in pobo.json')
        .option('-e, --eshop <id>', 'eshop ID (interactive picker when omitted)')
        .option('-n, --name <name>', 'asset name (prompted when omitted)')
        .action(wrap((file, options) => assetCreateCommand({ file, eshop: options.eshop, name: options.name })));
    asset
        .command('push')
        .description('Compile and push all pobo.json asset targets to the server')
        .option('-e, --eshop <id>', 'push only targets of this eshop')
        .action(wrap((options) => assetPushCommand({ eshop: options.eshop })));
    asset
        .command('proxy [url]')
        .description('Live preview the eshop with local assets injected (CSS hot reload, JS page reload)')
        .option('-e, --eshop <id>', 'eshop ID (interactive picker when omitted)')
        .option('-p, --port <port>', 'Preview server port', '3001')
        .option('--no-open', 'do not auto-open the preview URL in the browser')
        .action(wrap((url, options) => assetProxyCommand({
        url,
        eshop: options.eshop,
        port: parseInt(options.port, 10),
        open: options.open,
    })));
    asset
        .command('delete [id]')
        .description('Delete a CLI-managed asset from the server and remove its manifest target')
        .option('-e, --eshop <id>', 'eshop ID (interactive picker when omitted)')
        .option('-y, --yes', 'skip confirmation prompt')
        .action(wrap((id, options) => assetDeleteCommand({ id, eshop: options.eshop, yes: options.yes })));
    program
        .command('doctor')
        .description('Health check: environment, config, connectivity, local widgets')
        .action(wrap(doctorCommand));
    program
        .command('init')
        .description('Write CLAUDE.md to the current directory for Claude Code widget creation context')
        .action(wrap(initCommand));
    program.addHelpText('after', () => {
        const rows = collectSubcommands(program);
        if (rows.length === 0)
            return '';
        const table = new Table({
            head: [chalk.bold('Command'), chalk.bold('Description')],
            style: { head: [], border: ['gray'] },
            chars: { mid: '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' },
        });
        for (const r of rows) {
            table.push([r.command, r.description]);
        }
        return sprintf('\nAll commands (recursive):\n%s\n', table.toString());
    });
    return program;
};
export const run = async (argv) => {
    const userArgs = argv.slice(2);
    if (userArgs.length === 0 && process.stdin.isTTY) {
        inRepl = true;
        await startRepl(buildProgram);
        return;
    }
    const program = buildProgram();
    await program.parseAsync(argv);
};
