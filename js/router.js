/**
 * router.js
 * Minimal hash-based router. Routes are registered as
 * { pattern: '#/patients/:id', handler: (params) => {...} }.
 * No external dependency — plain string matching is sufficient for
 * the small number of screens in KNHOS Lite.
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

function resolveCurrentRoute() {
  const hash = window.location.hash || '#/home';
  for (const route of routes) {
    const match = hash.match(route.regex);
    if (match) {
      const params = {};
      route.paramNames.forEach((name, i) => {
        params[name] = decodeURIComponent(match[i + 1]);
      });
      route.handler(params);
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
