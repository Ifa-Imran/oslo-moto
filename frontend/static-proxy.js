/* eslint-disable */
/**
 * Static file proxy for Next.js standalone mode.
 *
 * Serves /_next/static/* and public/* files directly from the filesystem,
 * and proxies everything else to the Next.js server on port 3001.
 *
 * Usage:
 *   PORT=3000 HOSTNAME=0.0.0.0 node static-proxy.js
 *
 * The Next.js server.js must be started separately on port 3001:
 *   PORT=3001 HOSTNAME=127.0.0.1 node server.js &
 */

var http = require('http');
var fs = require('fs');
var path = require('path');
var url = require('url');

var dir = __dirname;
var currentPort = parseInt(process.env.PORT, 10) || 3000;
var hostname = process.env.HOSTNAME || '0.0.0.0';
var targetPort = 3001;

// --- MIME type map ---
var mimeTypes = {
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
  fs.stat(filePath, function (err, stats) {
    if (err || !stats.isFile()) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain');
      res.end('Not Found');
      return;
    }

    var ext = path.extname(filePath);
    var contentType = mimeTypes[ext] || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Accept-Ranges', 'bytes');

    // Range request support
    var range = req.headers.range;
    if (range) {
      var match = /bytes=(\d+)-(\d*)/.exec(range);
      if (match) {
        var start = parseInt(match[1], 10);
        var end = match[2] ? parseInt(match[2], 10) : stats.size - 1;
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
    port: targetPort,
    path: req.url,
    method: req.method,
    headers: req.headers,
  }, function (proxyRes) {
    res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', function () {
    if (!res.headersSent) {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'text/plain');
      res.end('Bad Gateway');
    }
  });

  res.on('close', function () {
    proxyReq.destroy();
  });

  req.pipe(proxyReq);
}

// --- Main proxy HTTP server ---
var proxy = http.createServer(function (req, res) {
  var parsedUrl = url.parse(req.url, true);
  var pathname = parsedUrl.pathname || '/';

  // 1. Serve /_next/static/* directly from .next/static/*
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
    var pubDir = path.resolve(dir, 'public');
    if (pubPath.indexOf(pubDir) !== 0) {
      res.statusCode = 403;
      res.end('Forbidden');
      return;
    }

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

  // 3. Everything else -> Next.js on port 3001
  proxyToNext(req, res);
});

// --- Start the proxy server ---
proxy.listen(currentPort, hostname, function () {
  console.log('[static-proxy] Listening on ' + hostname + ':' + currentPort);
  console.log('[static-proxy] Proxying to 127.0.0.1:' + targetPort);
});

// --- Graceful shutdown ---
function shutdown(sig) {
  console.log('[static-proxy] Received ' + sig + ', shutting down...');
  proxy.close();
  setTimeout(function () { process.exit(0); }, 2000);
}
process.on('SIGTERM', function () { shutdown('SIGTERM'); });
process.on('SIGINT', function () { shutdown('SIGINT'); });
