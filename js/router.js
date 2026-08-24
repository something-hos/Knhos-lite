/**
 * router.js
 * Minimal hash-based router. Routes are registered as
 * { pattern: '#/patients/:id', handler: (params, query) => {...} }.
 * No external dependency — plain string matching is sufficient for
 * the small number of screens in KNHOS Lite.
 *
 * The hash may contain a query string, e.g. "#/patients/TMP-000002?created=1".
 * Path matching and query-string parsing are kept strictly separate (using
 * the native URL/URLSearchParams APIs) so a query string can never leak into
 * a route parameter such as a patient ID.
 */

(function () {
'use strict';

const routes = [];

function registerRoute(pattern, handler) {
  const paramNames = [];
  const regexStr = pattern
    .split('/')
    .map((segment) => {
      if (segment.startsWith(':')) {
        paramNames.push(segment.slice(1));
        return '([^/]+)';
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  const regex = new RegExp(`^${regexStr}$`);
  routes.push({ regex, paramNames, handler });
}

function navigate(hash) {
  window.location.hash = hash;
}

/**
 * Split "#/patients/TMP-000002?created=1" into its path ("#/patients/TMP-000002")
 * and a URLSearchParams for the query ("created=1"), using the native URL
 * parser rather than manual string slicing. A dummy base is required because
 * the hash body is a relative reference, not an absolute URL.
 */
function parseHash(rawHash) {
  const hashBody = rawHash.slice(1); // drop the leading '#', e.g. "/patients/TMP-000002?created=1"
  const parsed = new URL(hashBody, 'https://knhos-router.invalid/');
  return {
    path: `#${parsed.pathname}`, // e.g. "#/patients/TMP-000002"
    query: parsed.searchParams, // e.g. URLSearchParams { created: "1" }
  };
}

function resolveCurrentRoute() {
  const rawHash = window.location.hash || '#/home';
  const { path, query } = parseHash(rawHash);

  for (const route of routes) {
    const match = path.match(route.regex);
    if (match) {
      const params = {};
      route.paramNames.forEach((name, i) => {
        params[name] = decodeURIComponent(match[i + 1]);
      });
      route.handler(params, query);
      return;
    }
  }
  // Fallback: unknown route -> home
  navigate('#/home');
}

function startRouter() {
  window.addEventListener('hashchange', resolveCurrentRoute);
  resolveCurrentRoute();
}

window.KnhosRouter = {
  registerRoute,
  navigate,
  startRouter,
};
})();

