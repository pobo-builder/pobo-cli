import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as sass from 'sass';
export const compileScss = (filePath, { style = 'compressed' } = {}) => {
    const result = sass.compile(filePath, {
        style,
        loadPaths: [
            path.dirname(filePath),
            path.join(process.cwd(), 'node_modules'),
        ],
    });
    return result.css;
};
// Same compile, but also reports every file the compilation touched
// (@use/@forward partials) — used by watchers to track multi-file sources.
export const compileScssWithDeps = (filePath, { style = 'compressed' } = {}) => {
    const result = sass.compile(filePath, {
        style,
        loadPaths: [
            path.dirname(filePath),
            path.join(process.cwd(), 'node_modules'),
        ],
    });
    return {
        css: result.css,
        loadedFiles: result.loadedUrls
            .filter((u) => u.protocol === 'file:')
            .map((u) => fileURLToPath(u)),
    };
};
