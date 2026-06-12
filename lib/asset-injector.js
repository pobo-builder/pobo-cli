import { sprintf } from '../utils/sprintf.js';
// Stable element ids the Pobo platform renders on every eshop page.
// templates/{url}.css carries the deployed asset styles (replaced in place
// by the locally compiled ones), javascript/{url}.js the deployed asset JS
// (stripped; the local JS is injected before </body> instead, which matches
// the original tag's `defer` timing). custom/{url}.css (#pobo-custom-core)
// is widget CSS — unrelated to assets, left untouched.
const DEPLOYED_CSS_RE = /<link[^>]*id="pobo-template-core"[^>]*>/i;
const DEPLOYED_JS_RE = /<script[^>]*id="pobo-custom-script"[^>]*>\s*<\/script>/i;
export const hasDeployedAssetCss = (pageHtml) => DEPLOYED_CSS_RE.test(pageHtml);
// A literal "</script>" inside the injected code would terminate the inline
// tag early; the escaped form is only ever valid inside strings/regexes,
// which is the only place the sequence can legally appear in JS source.
export const escapeInlineScript = (code) => code.replace(/<\/script/gi, '<\\/script');
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Rewrites navigation so the user can browse the whole eshop through the
// proxy: same-origin and root-relative <a href> values point at localhost.
// Only anchors are touched — stylesheets, images and scripts must keep
// loading from the real origin (that is what the <base> tag is for).
export const rewriteAnchors = (pageHtml, origin, localOrigin) => {
    const absoluteHref = new RegExp(sprintf('(\\bhref=["\'])%s(/[^"\']*)?(["\'])', escapeRegExp(origin)), 'gi');
    const rootRelativeHref = /(\bhref=["'])\/(?!\/)([^"']*)(["'])/gi;
    return pageHtml.replace(/<a\b[^>]*>/gi, (tag) => tag
        .replace(absoluteHref, (_m, pre, pathPart, post) => sprintf('%s%s%s%s', pre, localOrigin, pathPart ?? '/', post))
        .replace(rootRelativeHref, (_m, pre, pathPart, post) => sprintf('%s%s/%s%s', pre, localOrigin, pathPart, post)));
};
const liveReloadScript = (port) => `
<script>
(function() {
    function init() {
        var source = new EventSource('http://localhost:${port}/events');
        source.onopen = function() { console.log('[Pobo Asset Preview] Connected'); };
        source.onmessage = function(event) {
            var data = JSON.parse(event.data);
            if (data.reload) { location.reload(); return; }
            if (data.css !== undefined) {
                var style = document.getElementById('pobo-dev-assets');
                if (style) { style.textContent = data.css; }
            }
        };
        source.onerror = function() { console.log('[Pobo Asset Preview] Connection lost'); };
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
</script>`;
// Pobo platform support files injected into every previewed page; the
// timestamp cache-buster makes the browser fetch a fresh copy per request.
const PLATFORM_ASSETS_BASE = 'https://image.pobo.space/assets';
const platformAssetTags = (cacheBust) => sprintf('<link href="%s/generic.css?v=%s" rel="stylesheet"><script src="%s/editor.js?v=%s" defer></script>', PLATFORM_ASSETS_BASE, cacheBust, PLATFORM_ASSETS_BASE, cacheBust);
export const injectIntoPage = (pageHtml, pageUrl, port, css, js, cacheBust = Date.now()) => {
    const baseTag = `<base href="${pageUrl.origin}${pageUrl.pathname}">`;
    let modified = pageHtml.replace(/<head([^>]*)>/i, `<head$1>${baseTag}${platformAssetTags(cacheBust)}`);
    modified = rewriteAnchors(modified, pageUrl.origin, sprintf('http://localhost:%s', port));
    const styleTag = sprintf('<style id="pobo-dev-assets">%s</style>', css);
    if (DEPLOYED_CSS_RE.test(modified)) {
        modified = modified.replace(DEPLOYED_CSS_RE, styleTag);
    }
    else {
        modified = modified.replace('</head>', sprintf('%s</head>', styleTag));
    }
    modified = modified.replace(DEPLOYED_JS_RE, '');
    const jsTag = sprintf('<script id="pobo-dev-assets-js">%s</script>', escapeInlineScript(js));
    modified = modified.replace('</body>', sprintf('%s%s</body>', jsTag, liveReloadScript(port)));
    return modified;
};
