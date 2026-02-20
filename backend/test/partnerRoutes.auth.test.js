const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');

const partnerRoutesPath = require.resolve('../src/routes/partnerRoutes');

function createControllerStub() {
  return new Proxy({}, {
    get: (_, prop) => {
      if (typeof prop !== 'string') return undefined;
      return function handler(_req, res) {
        if (res && typeof res.status === 'function') {
          return res.status(200).json({ success: true, handler: prop });
        }
      };
    }
  });
}

function loadPartnerRoutesWithStubs() {
  const originalLoad = Module._load;
  const controllerStub = createControllerStub();

  function authenticateToken(_req, _res, next) {
    next();
  }

  function checkPartnerOwnership(_req, _res, next) {
    next();
  }

  function requireSuperAdmin(_req, _res, next) {
    next();
  }

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === '../../middleware/authenticateToken') {
      return authenticateToken;
    }
    if (request === '../../middleware/rbac') {
      return { checkPartnerOwnership };
    }
    if (request === '../middleware/requireSuperAdmin') {
      return requireSuperAdmin;
    }
    if (request.startsWith('../controllers/')) {
      return controllerStub;
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  delete require.cache[partnerRoutesPath];
  const router = require(partnerRoutesPath);
  Module._load = originalLoad;
  return router;
}

function getRouteLayer(router, method, path) {
  const m = method.toLowerCase();
  return router.stack.find(
    (layer) => layer.route && layer.route.path === path && layer.route.methods[m]
  );
}

function getMiddlewareNames(routeLayer) {
  return routeLayer.route.stack.map((s) => s.name).filter(Boolean);
}

test('sensitive partner routes require authenticateToken + checkPartnerOwnership', () => {
  const router = loadPartnerRoutesWithStubs();

  const protectedRoutes = [
    ['get', '/:id/orders'],
    ['put', '/:id/orders/:orderId'],
    ['get', '/:id/bookings'],
    ['get', '/:id/bookings/stats'],
    ['get', '/:id/bookings/:bookingId'],
    ['put', '/:id/bookings/:bookingId/status'],
    ['get', '/:id/vouchers/lookup'],
    ['post', '/:id/menu-images'],
    ['delete', '/:id/menu-images/:index'],
    ['get', '/:id/dashboard'],
    ['get', '/:id/analytics'],
    ['get', '/:id/rewards/analytics'],
    ['post', '/:id/offers'],
    ['put', '/:partnerId/offers/:offerId'],
    ['delete', '/:partnerId/offers/:offerId']
  ];

  for (const [method, path] of protectedRoutes) {
    const layer = getRouteLayer(router, method, path);
    assert.ok(layer, `Expected route ${method.toUpperCase()} ${path} to exist`);
    const names = getMiddlewareNames(layer);
    assert.ok(
      names.includes('authenticateToken'),
      `Expected authenticateToken on ${method.toUpperCase()} ${path}`
    );
    assert.ok(
      names.includes('checkPartnerOwnership'),
      `Expected checkPartnerOwnership on ${method.toUpperCase()} ${path}`
    );
  }
});

test('partner update/delete require authenticateToken + requireSuperAdmin', () => {
  const router = loadPartnerRoutesWithStubs();

  for (const method of ['put', 'delete']) {
    const layer = getRouteLayer(router, method, '/:id');
    assert.ok(layer, `Expected route ${method.toUpperCase()} /:id to exist`);
    const names = getMiddlewareNames(layer);
    assert.ok(names.includes('authenticateToken'));
    assert.ok(names.includes('requireSuperAdmin'));
  }
});
