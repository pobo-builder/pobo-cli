import fs from 'node:fs';
import path from 'node:path';
import { slugify } from '../utils/slugify.js';
import { sprintf } from '../utils/sprintf.js';
export const buildHtmlTemplate = (rootClass) => `<div class="${rootClass}">
    <div class="${rootClass}__top">
        <h2 class="${rootClass}__head-top">Sample inline heading</h2>
        <span class="${rootClass}__head-bottom">Sample inline subheading shown below the main heading</span>
    </div>

    <div class="${rootClass}__bottom">
        <div class="${rootClass}__bottom-left">
            <img src="https://picsum.photos/800/500" alt="Sample image" class="${rootClass}__bottom-left-img">
        </div>

        <div class="${rootClass}__bottom-right">
            <aside>
                <h2>Sample second-level heading in the WYSIWYG editor</h2>
                <h3>Sample third-level heading in the WYSIWYG editor</h3>
                <p>Sample paragraph of text in the WYSIWYG editor. This text only serves as a placeholder showing how content rendered inside the widget will look.</p>
                <ul>
                    <li>Sample first list item</li>
                    <li>Sample second list item</li>
                    <li>Sample third list item</li>
                </ul>
            </aside>
        </div>
    </div>
</div>
`;
export const buildScssTemplate = (rootClass) => `.${rootClass} {
    --bg: #f6f6f6;
    --padding: 60px;
    --border-radius: 15px;
    --column-gap: 40px;
    --head-top-size: 45px;
    --head-top-color: #111111;
    --head-top-line-height: 26px;
    --head-top-margin: 0 0 20px 0;
    --head-bottom-size: 16px;
    --head-bottom-color: #565656;
    --head-bottom-line-height: 22px;
    --bottom-margin: 40px 0 0 0;
    --body-h2-size: 28px;
    --body-h2-color: #111111;
    --body-h2-line-height: 40px;
    --body-h2-margin: 0 0 10px 0;
    --body-h3-size: 20px;
    --body-h3-color: #565656;
    --body-h3-line-height: 30px;
    --body-h3-margin: 0 0 20px 0;
    --body-p-size: 16px;
    --body-p-color: #565656;
    --body-p-line-height: 22px;
    --body-p-weight: 400;
    --body-p-margin: 0 0 12px 0;
    --body-list-padding: 15px 0 0 0;
    --body-list-margin: 0;
    --body-list-style: none;
    --body-list-item-size: 15px;
    --body-list-item-color: #565656;
    --body-list-item-line-height: 20px;
    --body-list-item-margin: 0 0 5px 0;
    --body-list-item-weight: 400;

    background: var(--bg);
    padding: var(--padding);
    border-radius: var(--border-radius);

    &__top {
        text-align: center;
    }

    &__head-top {
        font-size: var(--head-top-size);
        font-weight: 700;
        color: var(--head-top-color);
        line-height: var(--head-top-line-height);
        margin: var(--head-top-margin);
    }

    &__head-bottom {
        font-size: var(--head-bottom-size);
        color: var(--head-bottom-color);
        line-height: var(--head-bottom-line-height);
    }

    &__bottom {
        display: flex;
        gap: var(--column-gap);
        margin: var(--bottom-margin);
    }

    // Note: if there is an image in the container, the parent must be relative
    &__bottom-left {
        position: relative;
        width: 50%;
    }

    &__bottom-left-img {
        max-width: 100%;
        height: auto;
    }

    &__bottom-right {
        width: 50%;

        h2 {
            font-size: var(--body-h2-size);
            font-weight: 700;
            color: var(--body-h2-color);
            line-height: var(--body-h2-line-height);
            margin: var(--body-h2-margin);
            padding: 0;
        }

        h3 {
            font-size: var(--body-h3-size);
            color: var(--body-h3-color);
            line-height: var(--body-h3-line-height);
            font-weight: 400;
            margin: var(--body-h3-margin);
            padding: 0;
        }

        p {
            font-size: var(--body-p-size);
            font-weight: var(--body-p-weight);
            color: var(--body-p-color);
            line-height: var(--body-p-line-height);
            margin: var(--body-p-margin);
        }

        ul {
            list-style: var(--body-list-style);
            padding: var(--body-list-padding);
            margin: var(--body-list-margin);

            li {
                font-size: var(--body-list-item-size);
                font-weight: var(--body-list-item-weight);
                color: var(--body-list-item-color);
                line-height: var(--body-list-item-line-height);
                margin: var(--body-list-item-margin);
            }
        }
    }
}
`;
export const buildCssPreviewTemplate = (rootClass) => `/* Editor preview overrides. Selector is scoped under .widget-preview-panel
   so these rules only match inside the Pobo admin preview canvas (the wrapper
   is absent on production e-shop pages) AND win over the widget's own root
   declarations by specificity (2 classes vs 1). Edit any value to retheme the
   widget for the editor without touching production styles. */
.widget-preview-panel .${rootClass} {
    --bg: #f6f6f6;
    --padding: 20px;
    --border-radius: 15px;
    --column-gap: 40px;
    --head-top-size: 25px;
    --head-top-color: #111111;
    --head-top-line-height: 26px;
    --head-top-margin: 0 0 10px 0;
    --head-bottom-size: 16px;
    --head-bottom-color: #565656;
    --head-bottom-line-height: 22px;
    --bottom-margin: 20px 0 0 0;
    --body-h2-size: 14px;
    --body-h2-color: #111111;
    --body-h2-line-height: 14px;
    --body-h2-margin: 0 0 10px 0;
    --body-h3-size: 10px;
    --body-h3-color: #565656;
    --body-h3-line-height: 10px;
    --body-h3-margin: 0 0 5px 0;
    --body-p-size: 12px;
    --body-p-color: #565656;
    --body-p-line-height: 14px;
    --body-p-weight: 500;
    --body-p-margin: 0 0 0 0;
    --body-list-padding: 0 0 0 0;
    --body-list-margin: 10px 0 0 10px;
    --body-list-style: disc;
    --body-list-item-size: 12px;
    --body-list-item-color: #565656;
    --body-list-item-line-height: 11px;
    --body-list-item-margin: 0 0 2px 0;
    --body-list-item-weight: 600;
}
`;
export const sanitizeCopyableClass = (value) => {
    if (!Array.isArray(value)) {
        return [];
    }
    const seen = new Set();
    const result = [];
    for (const entry of value) {
        if (typeof entry !== 'string') {
            continue;
        }
        const trimmed = entry.trim();
        if (trimmed === '' || seen.has(trimmed)) {
            continue;
        }
        seen.add(trimmed);
        result.push(trimmed);
    }
    return result;
};
export const readMetadata = (dir) => {
    const file = path.join(dir, 'widget.json');
    if (!fs.existsSync(file)) {
        return null;
    }
    try {
        const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (typeof parsed.id !== 'number' ||
            typeof parsed.name !== 'string' ||
            typeof parsed.root_class !== 'string' ||
            typeof parsed.html !== 'string' ||
            typeof parsed.scss !== 'string' ||
            typeof parsed.css_preview !== 'string') {
            return null;
        }
        parsed.copyable_class = sanitizeCopyableClass(parsed.copyable_class);
        return parsed;
    }
    catch {
        return null;
    }
};
export const widgetRoot = () => path.join(process.cwd(), 'widgets');
export const widgetDir = (id) => path.join(widgetRoot(), String(id));
export const findWidgetByCwd = () => {
    let dir = process.cwd();
    while (true) {
        const meta = readMetadata(dir);
        if (meta && meta.id) {
            return { dir, meta };
        }
        const parent = path.dirname(dir);
        if (parent === dir)
            return null;
        dir = parent;
    }
};
export const findWidgetById = (id) => {
    const dir = widgetDir(id);
    const meta = readMetadata(dir);
    if (meta) {
        return { dir, meta };
    }
    return null;
};
export const resolveWidget = (idArg) => {
    if (idArg) {
        const found = findWidgetById(idArg);
        if (!found) {
            throw new Error(sprintf('Widget with ID %s not found in widgets/%s.', idArg, idArg));
        }
        return found;
    }
    const current = findWidgetByCwd();
    if (!current) {
        throw new Error('Not in a widget directory. Run from widgets/<id> or pass ID as an argument.');
    }
    return current;
};
export const createWidgetScaffold = ({ id, name, rootClass }) => {
    const dir = widgetDir(id);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    const slug = slugify(name);
    const htmlFile = path.join(dir, sprintf('%s-%s.html', slug, id));
    const scssFile = path.join(dir, sprintf('%s-%s-core.scss', slug, id));
    const cssPreviewFile = path.join(dir, sprintf('%s-%s-preview.css', slug, id));
    const metaFile = path.join(dir, 'widget.json');
    if (!fs.existsSync(htmlFile)) {
        fs.writeFileSync(htmlFile, buildHtmlTemplate(rootClass));
    }
    if (!fs.existsSync(scssFile)) {
        fs.writeFileSync(scssFile, buildScssTemplate(rootClass));
    }
    if (!fs.existsSync(cssPreviewFile)) {
        fs.writeFileSync(cssPreviewFile, buildCssPreviewTemplate(rootClass));
    }
    fs.writeFileSync(metaFile, JSON.stringify({
        id,
        name,
        root_class: rootClass,
        html: path.basename(htmlFile),
        scss: path.basename(scssFile),
        css_preview: path.basename(cssPreviewFile),
        copyable_class: [],
    }, null, 2));
    return { dir, htmlFile, scssFile, cssPreviewFile, metaFile };
};
export const writeCopyableClass = (widget, classes) => {
    const file = path.join(widget.dir, 'widget.json');
    const meta = JSON.parse(fs.readFileSync(file, 'utf8'));
    const normalized = sanitizeCopyableClass(classes);
    meta.copyable_class = normalized;
    fs.writeFileSync(file, sprintf('%s\n', JSON.stringify(meta, null, 2)));
    widget.meta.copyable_class = normalized;
    return normalized;
};
export const readHtml = (widget) => {
    const file = path.join(widget.dir, widget.meta.html);
    if (!fs.existsSync(file)) {
        throw new Error(sprintf('HTML file %s does not exist.', widget.meta.html));
    }
    return fs.readFileSync(file, 'utf8');
};
export const readScss = (widget) => {
    const file = path.join(widget.dir, widget.meta.scss);
    if (!fs.existsSync(file)) {
        throw new Error(sprintf('SCSS file %s does not exist.', widget.meta.scss));
    }
    return file;
};
export const readCssPreview = (widget) => {
    const file = path.join(widget.dir, widget.meta.css_preview);
    if (!fs.existsSync(file)) {
        throw new Error(sprintf('Preview CSS file %s does not exist.', widget.meta.css_preview));
    }
    return fs.readFileSync(file, 'utf8');
};
export const isPlaceholderScaffold = (widget) => {
    const htmlFile = path.join(widget.dir, widget.meta.html);
    const scssFile = path.join(widget.dir, widget.meta.scss);
    if (!fs.existsSync(htmlFile) || !fs.existsSync(scssFile)) {
        return true;
    }
    const html = fs.readFileSync(htmlFile, 'utf8');
    const scss = fs.readFileSync(scssFile, 'utf8');
    return (html === buildHtmlTemplate(widget.meta.root_class) &&
        scss === buildScssTemplate(widget.meta.root_class));
};
export const writeWidgetFiles = (widget, files) => {
    const htmlFile = path.join(widget.dir, widget.meta.html);
    const scssFile = path.join(widget.dir, widget.meta.scss);
    fs.writeFileSync(htmlFile, files.html);
    fs.writeFileSync(scssFile, files.scss);
};
