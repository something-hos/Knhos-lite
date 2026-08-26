/**
 * router.js
 * Minimal hash-based router. Routes are registered as
 * { pattern: '#/patients/:id', handler: (params, query) => {...} }.
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

function parseHash(rawHash) {
  const hashBody = rawHash.slice(1);
  const parsed = new URL(hashBody, 'https://knhos-router.invalid/');
  return {
    path: `#${parsed.pathname}`,
    query: parsed.searchParams,
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
