const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  app.use(
    '/ws',
    createProxyMiddleware({
      target: 'ws://localhost:3001',
      ws: true,
      changeOrigin: true
    })
  );
}; 