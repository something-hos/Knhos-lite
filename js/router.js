(function() {
  const routes = {};
  const historyStack = [];

  function registerRoute(hash, callback) { routes[hash] = callback; }

  function currentHash() {
    return window.location.hash || '#/home';
  }

  function navigate(hash) {
    const from = currentHash();
    if (hash === from) return; 
    historyStack.push(from);
    window.location.hash = hash;
  }

  function goBack() {
    const prevHash = historyStack.length ? historyStack.pop() : '#/home';
    window.location.hash = prevHash;
  }

  function canGoBack() {
    return historyStack.length > 0;
  }

  function handleRoute() {
    let hash = currentHash();
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

  window.KnhosRouter = { registerRoute, navigate, goBack, canGoBack, startRouter };
})();
