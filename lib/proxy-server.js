import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { sprintf } from '../utils/sprintf.js';
const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 15_000;
const PORT_SEARCH_RANGE = 20;
const isPortFree = (port) => new Promise((resolve) => {
    const tester = net.createServer();
    tester.once('error', () => resolve(false));
    tester.once('listening', () => {
        tester.close(() => resolve(true));
    });
    tester.listen(port);
});
export const findFreePort = async (start) => {
    for (let p = start; p < start + PORT_SEARCH_RANGE; p++) {
        if (await isPortFree(p))
            return p;
    }
    throw new Error(sprintf('No free port found in range %s-%s. Stop the other process or pass a different --port.', start, start + PORT_SEARCH_RANGE - 1));
};
export const fetchPage = (url, redirects = 0) => {
    if (redirects > MAX_REDIRECTS) {
        return Promise.reject(new Error(sprintf('Redirect limit exceeded (%s).', MAX_REDIRECTS)));
    }
    return new Promise((resolve, reject) => {
        const lib = url.startsWith('https') ? https : http;
        const req = lib.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 Pobo-CLI' } }, (res) => {
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                let loc = res.headers.location;
                if (loc.startsWith('/')) {
                    const u = new URL(url);
                    loc = sprintf('%s%s', u.origin, loc);
                }
                fetchPage(loc, redirects + 1).then(resolve, reject);
                return;
            }
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
            res.on('error', reject);
        });
        req.setTimeout(FETCH_TIMEOUT_MS, () => {
            req.destroy(new Error(sprintf('Timeout %ss while fetching %s.', FETCH_TIMEOUT_MS / 1000, url)));
        });
        req.on('error', reject);
    });
};
