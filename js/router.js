(function() {
  const routes = {};
  function registerRoute(hash, callback) { routes[hash] = callback; }
  function navigate(hash) { window.location.hash = hash; }
  function handleRoute() {
    let hash = window.location.hash || '#/home';
    const baseHash = hash.split('?')[0];
    for (const route in routes) {
      const routeParts = route.split('/');
      const hashParts = baseHash.split('/');
      if (routeParts.length === hashParts.length) {
        let match = true;
        let params = {};
        for (let i = 0; i < routeParts.length; i++) {
          if (routeParts[i].startsWith(':')) { params[routeParts[i].substring(1)] = hashParts[i]; }
          else if (routeParts[i] !== hashParts[i]) { match = false; break; }
        }
        if (match) return routes[route](params);
      }
    }
    if (routes['#/home']) routes['#/home']();
  }
  function startRouter() {
    window.addEventListener('hashchange', handleRoute);
    handleRoute();
  }
  window.KnhosRouter = { registerRoute, navigate, startRouter };
})();


