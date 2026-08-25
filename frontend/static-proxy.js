/* eslint-disable */
/**
 * Static file proxy for Next.js standalone mode.
 *
 * Why this exists:
 *   Next.js standalone server.js sometimes returns 404 for static files
 *   that physically exist on disk (CSS/JS chunks). This proxy intercepts
 *   /_next/static/* and public/* requests, serving them directly from
 *   the filesystem, and proxies everything else to the Next.js server
 *   running on an internal port.
 *
 * Usage:
 *   PORT=3000 HOSTNAME=0.0.0.0 node static-proxy.js
 *
 * The Next.js server.js is spawned as a child process on port 3001.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { parse } = require('url');

const dir = __dirname;
const currentPort = parseInt(process.env.PORT, 10) || 3000;
const hostname = process.env.HOSTNAME || '0.0.0.0';
const internalPort = 3001;

// --- MIME type map ---
const mimeTypes = {
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.mjs': 'application/javascript; charset=UTF-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=UTF-8',
  '.wasm': 'application/wasm',
  '.html': 'text/html; charset=UTF-8',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.mp4': 'video/mp4',
  '.webmanifest': 'application/manifest+json',
};

// --- Serve a file from the filesystem with proper headers ---
function serveFile(filePath, req, res) {
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain');
      res.end('Not Found');
      return;
    }

    const ext = path.extname(filePath);
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Accept-Ranges', 'bytes');

    // Range request support
    const range = req.headers.range;
    if (range) {
      const match = /bytes=(\d+)-(\d*)/.exec(range);
      if (match) {
        const start = parseInt(match[1], 10);
        const end = match[2] ? parseInt(match[2], 10) : stats.size - 1;
        if (start <= end && end < stats.size) {
          res.statusCode = 206;
          res.setHeader('Content-Range', 'bytes ' + start + '-' + end + '/' + stats.size);
          res.setHeader('Content-Length', end - start + 1);
          fs.createReadStream(filePath, { start: start, end: end }).pipe(res);
          return;
        }
      }
    }

    res.setHeader('Content-Length', stats.size);
    fs.createReadStream(filePath).pipe(res);
  });
}

// --- Proxy request to internal Next.js server ---
function proxyToNext(req, res) {
  var proxyReq = http.request({
    hostname: '127.0.0.1',
    port: internalPort,
    path: req.url,
    method: req.method,
    headers: req.headers,
  }, function (proxyRes) {
    res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', function (err) {
    if (!res.headersSent) {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'text/plain');
      res.end('Bad Gateway');
    }
  });

  // If the client disconnects, destroy the upstream request
  res.on('close', function () {
    proxyReq.destroy();
  });

  req.pipe(proxyReq);
}

// --- Main proxy HTTP server ---
var proxy = http.createServer(function (req, res) {
  var parsedUrl = parse(req.url, true);
  var pathname = parsedUrl.pathname || '/';

  // 1. Serve /_next/static/* directly from .next/static/*
  //    URL:  /_next/static/chunks/abc.css
  //    FS:   .next/static/chunks/abc.css
  if (pathname.indexOf('/_next/static/') === 0) {
    var rel = '.next/' + pathname.slice('/_next/'.length);
    var filePath = path.resolve(dir, rel);

    // Path traversal guard
    if (filePath.indexOf(dir) !== 0) {
      res.statusCode = 403;
      res.end('Forbidden');
      return;
    }

    serveFile(filePath, req, res);
    return;
  }

  // 2. Serve files from public/ directory (favicon, images, etc.)
  if (pathname.charAt(0) === '/' && pathname.indexOf('/_next/') !== 0) {
    var pubPath = path.resolve(dir, 'public', '.' + pathname);

    // Path traversal guard
    if (pubPath.indexOf(path.resolve(dir, 'public')) !== 0) {
      res.statusCode = 403;
      res.end('Forbidden');
      return;
    }

    // Check synchronously (fast path for small public files)
    try {
      var st = fs.statSync(pubPath);
      if (st.isFile()) {
        serveFile(pubPath, req, res);
        return;
      }
    } catch (e) {
      // File doesn't exist, fall through to proxy
    }
  }

  // 3. Everything else -> Next.js
  proxyToNext(req, res);
});

// --- Spawn Next.js standalone server.js on internal port 3001 ---
var child = spawn('node', ['server.js'], {
  cwd: dir,
  env: Object.assign({}, process.env, {
    PORT: String(internalPort),
    HOSTNAME: '127.0.0.1',
  }),
  stdio: ['inherit', 'inherit', 'inherit'],
});

child.on('exit', function (code, signal) {
  console.error('[static-proxy] Next.js child exited code=' + code + ' signal=' + signal);
  process.exit(code || 1);
});

// --- Start the proxy server on the external port ---
proxy.listen(currentPort, hostname, function () {
  console.log('[static-proxy] Proxy listening on ' + hostname + ':' + currentPort);
  console.log('[static-proxy] Next.js child on 127.0.0.1:' + internalPort);
});

// --- Graceful shutdown ---
function shutdown(sig) {
  console.log('[static-proxy] Received ' + sig + ', shutting down...');
  proxy.close();
  child.kill(sig);
  setTimeout(function () { process.exit(0); }, 2000);
}
process.on('SIGTERM', function () { shutdown('SIGTERM'); });
process.on('SIGINT', function () { shutdown('SIGINT'); });
