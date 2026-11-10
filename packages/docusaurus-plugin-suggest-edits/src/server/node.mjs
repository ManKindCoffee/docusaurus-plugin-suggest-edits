export function createNodeHandler(handle, {allowedOrigins = [], trustProxy = false, path = '/api/suggest-edit'} = {}) {
  return async (req, res) => {
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.writeHead(204).end();
    if (req.method !== 'POST' || req.url !== path) {
      return res.writeHead(404, {'Content-Type': 'application/json'}).end(JSON.stringify({error: 'Not found'}));
    }

    const ip =
      trustProxy && req.headers['x-forwarded-for']
        ? req.headers['x-forwarded-for'].split(',')[0].trim()
        : req.socket.remoteAddress;

    const result = await handle({headers: req.headers, body: await readBody(req), ip});
    res.writeHead(result.status, {'Content-Type': 'application/json', ...result.headers}).end(JSON.stringify(result.body));
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) req.destroy(); // the core rejects anything over its own limit
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}