import fs from 'node:fs';
import path from 'node:path';
import { compileScss } from '../lib/scss-compiler.js';
import { sprintf } from '../utils/sprintf.js';
export const MANIFEST_FILE = 'pobo.json';
// Mirrors the server-side cap (CliAssetStoreRequest MAX_VALUE_BYTES) so a
// too-large artifact fails locally before any request is made.
export const MAX_ASSET_VALUE_BYTES = 262_144;
const ASSET_TYPES = ['style', 'javascript'];
export const inferAssetType = (file) => {
    const ext = path.extname(file).toLowerCase();
    if (ext === '.scss' || ext === '.css')
        return 'style';
    if (ext === '.js' || ext === '.mjs')
        return 'javascript';
    throw new Error(sprintf('Cannot infer asset type from "%s". Supported extensions: .scss, .css (style), .js, .mjs (javascript).', file));
};
const isAssetTarget = (value) => {
    if (!value || typeof value !== 'object')
        return false;
    const obj = value;
    if (typeof obj.eshop_id !== 'number' || !Number.isInteger(obj.eshop_id) || obj.eshop_id <= 0)
        return false;
    if (obj.asset_id !== undefined && (typeof obj.asset_id !== 'number' || !Number.isInteger(obj.asset_id) || obj.asset_id <= 0))
        return false;
    return true;
};
const validateEntry = (value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(sprintf('Manifest entry asset[%s] must be an object.', index));
    }
    const obj = value;
    if (typeof obj.source !== 'string' || obj.source.trim() === '') {
        throw new Error(sprintf('Manifest entry asset[%s] is missing a "source" file path.', index));
    }
    if (typeof obj.type !== 'string' || !ASSET_TYPES.includes(obj.type)) {
        throw new Error(sprintf('Manifest entry asset[%s] has invalid "type" (expected "style" or "javascript").', index));
    }
    if (typeof obj.name !== 'string' || obj.name.trim() === '') {
        throw new Error(sprintf('Manifest entry asset[%s] is missing a "name".', index));
    }
    if (!Array.isArray(obj.target) || obj.target.some((t) => !isAssetTarget(t))) {
        throw new Error(sprintf('Manifest entry asset[%s] has invalid "target" (expected array of { eshop_id, asset_id? } with positive integer ids).', index));
    }
    const target = obj.target;
    const seenEshops = new Set();
    for (const t of target) {
        if (seenEshops.has(t.eshop_id)) {
            throw new Error(sprintf('Manifest entry asset[%s] targets eshop #%s more than once.', index, t.eshop_id));
        }
        seenEshops.add(t.eshop_id);
    }
    return {
        source: obj.source,
        type: obj.type,
        name: obj.name,
        target,
    };
};
export const parseManifest = (raw, file) => {
    let data;
    try {
        data = JSON.parse(raw);
    }
    catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        throw new Error(sprintf('Manifest %s is not valid JSON (comments are not supported): %s', file, message), { cause: e });
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error(sprintf('Manifest %s must be a JSON object with an "asset" array.', file));
    }
    const assetField = data.asset;
    if (!Array.isArray(assetField)) {
        throw new Error(sprintf('Manifest %s must contain an "asset" array.', file));
    }
    return { asset: assetField.map((entry, index) => validateEntry(entry, index)) };
};
export const readManifest = (file) => parseManifest(fs.readFileSync(file, 'utf8'), file);
export const findManifest = () => {
    let dir = process.cwd();
    while (true) {
        const file = path.join(dir, MANIFEST_FILE);
        if (fs.existsSync(file)) {
            return { dir, file, manifest: readManifest(file) };
        }
        const parent = path.dirname(dir);
        if (parent === dir)
            return null;
        dir = parent;
    }
};
export const requireManifest = () => {
    const found = findManifest();
    if (!found) {
        throw new Error(sprintf('No %s manifest found (searched from the current directory upwards). Run `pobo asset create <file>` to start one.', MANIFEST_FILE));
    }
    return found;
};
export const writeManifest = (file, manifest) => {
    fs.writeFileSync(file, sprintf('%s\n', JSON.stringify(manifest, null, 2)));
};
export const buildAssetValue = (baseDir, source) => {
    const file = path.resolve(baseDir, source);
    if (!fs.existsSync(file)) {
        throw new Error(sprintf('Asset source file %s does not exist.', source));
    }
    const value = path.extname(file).toLowerCase() === '.scss'
        ? compileScss(file)
        : fs.readFileSync(file, 'utf8');
    const size = Buffer.byteLength(value, 'utf8');
    if (size > MAX_ASSET_VALUE_BYTES) {
        throw new Error(sprintf('Compiled asset %s is %s kB — exceeds the %s kB limit.', source, (size / 1024).toFixed(1), MAX_ASSET_VALUE_BYTES / 1024));
    }
    return value;
};
