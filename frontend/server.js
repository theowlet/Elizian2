const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const PUBLIC_DIR = path.join(__dirname, 'public');
const ROOT_DIR = __dirname;

// React SPA routes that should fallback to index.html
const SPA_ROUTES = [
  '/admin',
  '/admin/login',
  '/admin/multi-tier',
  '/partner/login',
  '/partner/console',
  '/home',
  '/login',
  '/otp',
  '/signup',
  '/mpin-setup',
  '/mpin-login',
  '/events/booking',
  '/wellness',
  '/health-wellness',
  '/data-entry'
];

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.jsx': 'application/javascript',
  '.mjs': 'application/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject'
};

const server = http.createServer((req, res) => {
  // Remove query string and decode URL
  let filePath = decodeURIComponent(req.url.split('?')[0]);
  
  // Default to index.html
  if (filePath === '/') {
    filePath = '/index.html';
  }
  
  // Check if this is a React SPA route (no file extension and matches SPA routes)
  const isSPARoute = !path.extname(filePath) && 
    (SPA_ROUTES.some(route => filePath === route || filePath.startsWith(route + '/')) ||
     // Also check if it's a known React route pattern
     filePath.startsWith('/admin') || 
     filePath.startsWith('/partner') ||
     filePath.startsWith('/home') ||
     filePath.startsWith('/login') ||
     filePath.startsWith('/otp') ||
     filePath.startsWith('/signup') ||
     filePath.startsWith('/mpin') ||
     filePath.startsWith('/events') ||
     filePath.startsWith('/wellness') ||
     filePath.startsWith('/data-entry'));
  
  // For SPA routes, serve the root index.html (React app entry point)
  if (isSPARoute) {
    const rootIndexPath = path.join(ROOT_DIR, 'index.html');
    fs.access(rootIndexPath, fs.constants.F_OK, (err) => {
      if (err) {
        // Fallback to public/index.html if root index.html doesn't exist
        const fallbackPath = path.join(PUBLIC_DIR, 'index.html');
        fs.readFile(fallbackPath, (err, data) => {
          if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found - React app entry point missing');
            return;
          }
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(data);
        });
        return;
      }
      fs.readFile(rootIndexPath, (err, data) => {
        if (err) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('500 Internal Server Error');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(data);
      });
    });
    return;
  }
  
  // For static files, check in public directory first
  let fullPath = path.join(PUBLIC_DIR, filePath);
  
  // Get file extension for MIME type
  const ext = path.extname(filePath).toLowerCase();
  let contentType = MIME_TYPES[ext];
  
  // If not found, try to determine from file path
  if (!contentType) {
    if (ext === '.jsx' || filePath.endsWith('.jsx')) {
      contentType = 'application/javascript';
    } else if (ext === '.js' || filePath.endsWith('.js')) {
      contentType = 'application/javascript';
    } else if (ext === '.mjs' || filePath.endsWith('.mjs')) {
      contentType = 'application/javascript';
    } else {
      contentType = 'application/octet-stream';
    }
  }
  
  // Check if file exists in public directory
  fs.access(fullPath, fs.constants.F_OK, (err) => {
    if (err) {
      // If not in public, try root directory (for src files when using Vite)
      const rootPath = path.join(ROOT_DIR, filePath);
      fs.access(rootPath, fs.constants.F_OK, (rootErr) => {
        if (rootErr) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('404 Not Found');
          return;
        }
        // Serve from root directory
        fs.readFile(rootPath, (err, data) => {
          if (err) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('500 Internal Server Error');
            return;
          }
          const headers = {
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
          };
          res.writeHead(200, headers);
          res.end(data);
        });
      });
      return;
    }
    
    // Read and serve file from public directory
    fs.readFile(fullPath, (err, data) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('500 Internal Server Error');
        return;
      }
      
      // Set CORS headers for development
      const headers = {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      };
      
      res.writeHead(200, headers);
      res.end(data);
    });
  });
});

server.listen(PORT, () => {
  console.log(`✅ Frontend server running on http://localhost:${PORT}`);
  console.log(`📁 Serving files from: ${PUBLIC_DIR}`);
  console.log(`\n🌐 Open your browser to: http://localhost:${PORT}`);
});

