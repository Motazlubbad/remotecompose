const { execFileSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const owner = 'Motazlubbad';
const repo = 'remotecompose';
const port = Number(process.env.PORT || 8080);
const allowedFiles = new Set([
  'config.json',
  'config_detail.json',
  'config_estimates.json',
  'config_estimate_detail.json',
]);
const types = {
  '.html': 'text/html; charset=UTF-8',
  '.js': 'text/javascript; charset=UTF-8',
  '.wasm': 'application/wasm',
  '.json': 'application/json; charset=UTF-8',
  '.rc': 'application/octet-stream',
  '.png': 'image/png',
  '.css': 'text/css; charset=UTF-8',
};

function sendJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=UTF-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        req.destroy();
        reject(new Error('Request body too large'));
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function ghJson(args) {
  return JSON.parse(execFileSync('gh', ['api', ...args], { encoding: 'utf8' }));
}

async function deploy(req, res) {
  try {
    const payload = JSON.parse(await readBody(req));
    const file = String(payload.file || '');
    if (!allowedFiles.has(file)) {
      return sendJson(res, 400, { error: 'Unsupported config file' });
    }

    const existing = ghJson([`repos/${owner}/${repo}/contents/${file}`]);
    const content = Buffer.from(`${JSON.stringify(payload.config, null, 2)}\n`).toString('base64');
    const message = `Update ${payload.label || file} screen from local editor`;

    const result = ghJson([
      '--method', 'PUT',
      `repos/${owner}/${repo}/contents/${file}`,
      '-f', `message=${message}`,
      '-f', `content=${content}`,
      '-f', `sha=${existing.sha}`,
    ]);

    sendJson(res, 200, { ok: true, commit: result.commit?.sha });
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}

function serveStatic(req, res) {
  let pathname = decodeURIComponent(new URL(req.url, `http://localhost:${port}`).pathname);
  if (pathname === '/') pathname = '/index.html';

  const file = path.normalize(path.join(root, pathname));
  if (!file.startsWith(root)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(file, (error, data) => {
    if (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
      return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

http.createServer((req, res) => {
  if (req.method === 'OPTIONS' && req.url === '/api/deploy') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    });
    res.end();
    return;
  }
  if (req.method === 'POST' && req.url === '/api/deploy') {
    deploy(req, res);
    return;
  }
  serveStatic(req, res);
}).listen(port, () => {
  console.log(`remotecompose editor with local deploy: http://localhost:${port}`);
});
