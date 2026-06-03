import { getApiUrl } from './config.js';
import { sprintf } from './utils/sprintf.js';
const REQUEST_TIMEOUT_MS = 30_000;
const AI_REQUEST_TIMEOUT_MS = 65_000;
export class ApiError extends Error {
    status;
    data;
    constructor(message, status, data) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.data = data;
    }
}
const hasErrorPayload = (data) => {
    if (!data || typeof data !== 'object')
        return false;
    const obj = data;
    if (typeof obj.error !== 'undefined')
        return true;
    if (Array.isArray(obj.errors) && obj.errors.length > 0)
        return true;
    return false;
};
const extractErrorMessage = (data, fallback, status) => {
    if (data && typeof data === 'object') {
        const obj = data;
        const candidates = [obj.error, obj.errors, obj.message];
        for (const value of candidates) {
            if (typeof value === 'string')
                return value;
            if (value !== undefined && value !== null)
                return JSON.stringify(value);
        }
    }
    return fallback || sprintf('HTTP %s', status);
};
export const parseJsonLoose = (text) => {
    if (!text)
        return null;
    try {
        return JSON.parse(text);
    }
    catch { }
    const firstBrace = text.indexOf('{');
    const firstBracket = text.indexOf('[');
    const candidates = [firstBrace, firstBracket].filter((i) => i >= 0);
    if (candidates.length === 0)
        return { raw: text };
    const start = Math.min(...candidates);
    const lastBrace = text.lastIndexOf('}');
    const lastBracket = text.lastIndexOf(']');
    const end = Math.max(lastBrace, lastBracket);
    if (end <= start)
        return { raw: text };
    try {
        return JSON.parse(text.slice(start, end + 1));
    }
    catch {
        return { raw: text };
    }
};
const request = async (method, path, { body = null, rawBody, token = null, apiUrl = null, timeoutMs } = {}) => {
    const url = sprintf('%s%s', apiUrl ?? getApiUrl(null), path);
    const headers = {
        'Accept': 'application/json',
    };
    if (!rawBody) {
        headers['Content-Type'] = 'application/json';
    }
    if (token) {
        headers['Authorization'] = sprintf('Bearer %s', token);
    }
    const effectiveTimeout = timeoutMs ?? REQUEST_TIMEOUT_MS;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), effectiveTimeout);
    const init = { method, headers, signal: controller.signal };
    if (rawBody !== undefined) {
        init.body = rawBody;
    }
    else if (body !== null) {
        init.body = JSON.stringify(body);
    }
    let response;
    try {
        response = await fetch(url, init);
    }
    catch (e) {
        if (e instanceof Error && e.name === 'AbortError') {
            throw new Error(sprintf('API did not respond within %ss (%s).', effectiveTimeout / 1000, url), { cause: e });
        }
        const message = e instanceof Error ? e.message : String(e);
        throw new Error(sprintf('Cannot connect to API (%s): %s', url, message), { cause: e });
    }
    finally {
        clearTimeout(timeout);
    }
    const text = await response.text();
    const data = parseJsonLoose(text);
    if (!response.ok || hasErrorPayload(data)) {
        throw new ApiError(extractErrorMessage(data, text, response.status), response.status, data);
    }
    return data;
};
export const api = {
    login: (email, password, apiUrl) => request('POST', '/login', { body: { email, password }, apiUrl }),
    me: (token, apiUrl) => request('GET', '/me', { token, apiUrl }),
    logout: (token, apiUrl) => request('POST', '/logout', { token, apiUrl }),
    listEshops: (token, apiUrl) => request('GET', '/eshop', { token, apiUrl }),
    listWidgets: (token, apiUrl) => request('GET', '/widget', { token, apiUrl }),
    createWidget: (token, args, apiUrl) => {
        const body = {
            name: args.name,
            enable_typography_css: args.enableTypographyCss,
        };
        return request('POST', '/widget', { token, body, apiUrl });
    },
    showWidget: (token, id, apiUrl) => request('GET', sprintf('/widget/%s', id), { token, apiUrl }),
    deleteWidget: (token, id, apiUrl) => request('DELETE', sprintf('/widget/%s', id), { token, apiUrl }),
    parseWidget: (token, id, html, apiUrl) => request('POST', sprintf('/widget/%s/parse', id), { token, body: { html }, apiUrl }),
    pushWidget: (token, id, widget, copyableClass, apiUrl) => {
        const body = { widget };
        if (Array.isArray(copyableClass)) {
            body.copyable_class = copyableClass;
        }
        return request('POST', sprintf('/widget/%s/push', id), { token, body, apiUrl });
    },
    updateCopyableClass: (token, id, copyableClass, apiUrl) => {
        const body = { copyable_class: copyableClass };
        return request('PUT', sprintf('/widget/%s/copyable-class', id), {
            token,
            body,
            apiUrl,
        });
    },
    updateCss: (token, id, args, apiUrl) => {
        const body = { css: args.css };
        if (args.scss !== undefined)
            body.scss = args.scss;
        if (args.cssPreview !== undefined)
            body.css_preview = args.cssPreview;
        if (args.htmlSource !== undefined)
            body.html_source = args.htmlSource;
        return request('PUT', sprintf('/widget/%s/css', id), { token, body, apiUrl });
    },
    flushWidget: (token, id, apiUrl) => request('DELETE', sprintf('/widget/%s/flush', id), { token, apiUrl }),
    connectWidget: (token, id, eshopId, apiUrl) => {
        const body = { eshop_id: eshopId };
        return request('POST', sprintf('/widget/%s/connect', id), { token, body, apiUrl });
    },
    listWidgetConnections: (token, id, apiUrl) => request('GET', sprintf('/widget/%s/connect', id), { token, apiUrl }),
    listAllWidgetConnections: (token, apiUrl) => request('GET', '/widget/connections', { token, apiUrl }),
    disconnectWidget: (token, id, eshopId, apiUrl) => {
        const body = { eshop_id: eshopId };
        return request('POST', sprintf('/widget/%s/disconnect', id), { token, body, apiUrl });
    },
    generateWidgetAi: (token, id, image, apiUrl) => {
        const formData = new FormData();
        formData.append('image', image.blob, image.filename);
        return request('POST', sprintf('/widget/%s/ai', id), {
            token,
            rawBody: formData,
            apiUrl,
            timeoutMs: AI_REQUEST_TIMEOUT_MS,
        });
    },
};
