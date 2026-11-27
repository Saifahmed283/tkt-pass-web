// Minimal local Vercel-like server for smoke-testing the API without deploying.
// Usage: node scripts/local-server.mjs   (then http://localhost:3000/pass?t=...)
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')

const envFile = path.join(root, '.env.local')
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2]
  }
}

const routes = [
  ['GET', '/api/pass', 'api/pass.js'],
  ['POST', '/api/pass/design', 'api/pass/design.js'],
  ['GET', '/api/admin/auth', 'api/admin/auth.js'],
  ['POST', '/api/admin/auth', 'api/admin/auth.js'],
  ['POST', '/api/admin/logout', 'api/admin/logout.js'],
  ['GET', '/api/admin/tickets', 'api/admin/tickets.js'],
  ['POST', '/api/admin/tickets', 'api/admin/tickets.js'],
  ['PATCH', '/api/admin/tickets', 'api/admin/tickets.js'],
  ['DELETE', '/api/admin/tickets', 'api/admin/tickets.js'],
  ['POST', '/api/admin/import', 'api/admin/import.js'],
  ['GET', '/api/admin/preview', 'api/admin/preview.js'],
  ['POST', '/api/admin/send', 'api/admin/send.js'],
  ['GET', '/api/admin/stats', 'api/admin/stats.js']
]

const staticDir = path.join(root, 'public')
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' }

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  req.query = Object.fromEntries(url.searchParams)

  const match = routes.find(([method, route]) => method === req.method && url.pathname === route)
  if (match) {
    try {
      const mod = await import(pathToFileURL(path.join(root, match[2])).href)
      await mod.default(req, res)
    } catch (err) {
      console.error(err)
      if (!res.writableEnded) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'SERVER_ERROR', message: err.message }))
      }
    }
    return
  }

  let file = url.pathname === '/' ? '/admin.html' : url.pathname
  if (file === '/pass') file = '/pass.html'
  if (file === '/admin') file = '/admin.html'
  const target = path.join(staticDir, path.normalize(file).replace(/^(\.\.[/\\])+/, ''))
  if (fs.existsSync(target) && fs.statSync(target).isFile()) {
    res.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream' })
    fs.createReadStream(target).pipe(res)
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'NOT_FOUND' }))
  }
}).listen(3000, () => console.log('Local API running at http://localhost:3000'))
