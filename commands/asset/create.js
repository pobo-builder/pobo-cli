import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { input, select } from '@inquirer/prompts';
import { requireToken } from '../../config.js';
import { buildAssetValue, findManifest, inferAssetType, writeManifest, MANIFEST_FILE } from '../../lib/asset-fs.js';
import { resolveEshop } from '../../lib/eshop-picker.js';
import { stripProtocol } from '../../lib/eshop-display.js';
import { slugify } from '../../utils/slugify.js';
import { sprintf } from '../../utils/sprintf.js';
export const validateAssetName = (value) => value && value.trim().length > 0 ? true : 'Name must not be empty';
const buildScaffoldTemplate = (type, name, eshop) => sprintf(type === 'style'
    ? '// Asset "%s" for %s (#%s).\n// Compiled locally on `pobo asset push` (compressed) and served in the\n// eshop CDN bundle. Comments are stripped by the compiler — pushing\n// requires at least one real rule.\n'
    : '// Asset "%s" for %s (#%s).\n// Uploaded verbatim on `pobo asset push` and served in the eshop CDN\n// bundle. Pushing requires some actual code below this header.\n', name, stripProtocol(eshop.url), eshop.id);
export const createCommand = async ({ file, eshop, name }) => {
    const config = requireToken();
    const found = findManifest();
    const manifestDir = found?.dir ?? process.cwd();
    const manifestFile = found?.file ?? path.join(process.cwd(), MANIFEST_FILE);
    const manifest = found?.manifest ?? { asset: [] };
    const eshopInfo = await resolveEshop(eshop, 'create the asset on', config.token, config.api_url);
    let source;
    if (file) {
        // Bring-your-own-file mode: validate it builds, register it in the manifest.
        const type = inferAssetType(file);
        buildAssetValue(process.cwd(), file);
        source = path.relative(manifestDir, path.resolve(file)).split(path.sep).join('/');
        const existing = manifest.asset.find((entry) => entry.source === source);
        if (existing && existing.type !== type) {
            throw new Error(sprintf('Manifest entry for %s has type "%s" but the file extension implies "%s".', source, existing.type, type));
        }
        const duplicate = existing?.target.find((t) => t.eshop_id === eshopInfo.id);
        if (duplicate) {
            throw new Error(sprintf('Asset %s already targets eshop #%s (asset #%s). Use `pobo asset push` to update it.', source, eshopInfo.id, duplicate.asset_id ?? '?'));
        }
        let assetName;
        if (existing) {
            assetName = existing.name;
            if (name && name !== existing.name) {
                console.log(chalk.yellow(sprintf('Using manifest name "%s" (ignoring --name; edit %s to rename).', existing.name, MANIFEST_FILE)));
            }
        }
        else if (name) {
            assetName = name.trim();
            if (assetName === '') {
                throw new Error('Name must not be empty.');
            }
        }
        else if (process.stdout.isTTY) {
            assetName = (await input({
                message: 'Asset name:',
                default: path.basename(file, path.extname(file)),
                validate: validateAssetName,
            })).trim();
        }
        else {
            throw new Error('Pass --name <name> for the new asset (non-interactive terminal).');
        }
        if (existing) {
            existing.target.push({ eshop_id: eshopInfo.id });
        }
        else {
            manifest.asset.push({ source, type, name: assetName, target: [{ eshop_id: eshopInfo.id }] });
        }
    }
    else {
        // Wizard mode: scaffold a fresh source file under assets/<eshop_id>/.
        if (!process.stdout.isTTY) {
            throw new Error('Pass a file argument in a non-interactive terminal, e.g. `pobo asset create assets/main.scss --eshop <id> --name <name>`.');
        }
        const type = await select({
            message: 'Asset type:',
            choices: [
                { name: 'Style (SCSS, compiled locally)', value: 'style' },
                { name: 'JavaScript', value: 'javascript' },
            ],
        });
        const assetName = (name?.trim() || await input({ message: 'Asset name:', validate: validateAssetName })).trim();
        if (assetName === '') {
            throw new Error('Name must not be empty.');
        }
        const slug = slugify(assetName) || 'asset';
        const extension = type === 'style' ? 'scss' : 'js';
        source = sprintf('assets/%s/%s.%s', eshopInfo.id, slug, extension);
        const scaffoldFile = path.join(manifestDir, source);
        if (fs.existsSync(scaffoldFile)) {
            throw new Error(sprintf('File %s already exists. Use `pobo asset create %s` to register it instead.', source, source));
        }
        if (manifest.asset.some((entry) => entry.source === source)) {
            throw new Error(sprintf('The manifest already contains an entry for %s.', source));
        }
        fs.mkdirSync(path.dirname(scaffoldFile), { recursive: true });
        fs.writeFileSync(scaffoldFile, buildScaffoldTemplate(type, assetName, eshopInfo));
        manifest.asset.push({ source, type, name: assetName, target: [{ eshop_id: eshopInfo.id }] });
        console.log(chalk.green(sprintf('✓ Scaffolded %s', source)));
    }
    writeManifest(manifestFile, manifest);
    console.log(chalk.green(sprintf('✓ Asset "%s" registered for %s in %s.', manifest.asset.find((entry) => entry.source === source).name, stripProtocol(eshopInfo.url), path.relative(process.cwd(), manifestFile) || MANIFEST_FILE)));
    console.log(chalk.gray('  Edit the source file, then run `pobo asset push` to deploy.'));
};
