import { existsSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join } from 'node:path'
import react from '@vitejs/plugin-react'
import { loadEnv, type Plugin, type ViteDevServer } from 'vite'
import { defineConfig } from 'vitest/config'

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

/**
 * Serves `/api/<name>` during `npm run dev` by loading `server/<name>.ts` directly,
 * so a new endpoint works the moment its file exists — no route table to update.
 * Production still uses the matching Vercel Function built by `bundle:api`.
 */
function apiPlugin(): Plugin {
  return {
    name: 'api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = req.url?.split('?')[0] ?? ''
        const match = /^\/api\/([\w-]+)$/.exec(path)
        const modulePath = match ? `/server/${match[1]}.ts` : null
        if (!modulePath || !existsSync(join(server.config.root, modulePath))) return next()

        try {
          await handleApiRequest(server, modulePath, req, res)
        } catch (error) {
          console.error(`[api]${modulePath}`, error)
          if (!res.headersSent) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'API middleware failed.' }))
          }
        }
      })
    },
  }
}

async function handleApiRequest(
  server: ViteDevServer,
  modulePath: string,
  req: IncomingMessage,
  res: ServerResponse,
) {
  const mod = (await server.ssrLoadModule(modulePath)) as {
    POST: (request: Request) => Promise<Response>
    OPTIONS: (request: Request) => Response
  }

  const host = req.headers.host ?? 'localhost:5173'
  const url = `http://${host}${req.url ?? '/'}`
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null) continue
    headers.set(key, Array.isArray(value) ? value.join(',') : value)
  }
  
  const method = req.method ?? 'GET'
  const request =
    method === 'GET' || method === 'HEAD'
      ? new Request(url, { method, headers })
      : new Request(url, {
          method,
          headers,
          body: await readBody(req),
        })

  const response = method === 'OPTIONS' ? mod.OPTIONS(request) : await mod.POST(request)

  res.statusCode = response.status
  response.headers.forEach((value, key) => {
    res.setHeader(key, value)
  })
  res.end(Buffer.from(await response.arrayBuffer()))
}

export default defineConfig(({ mode }) => {
  // Make server-only secrets (OPENAI_API_KEY) available to the local API middleware.
  const env = loadEnv(mode, process.cwd(), '')
  // File values win over stale shell env so token rotation in `.env` takes effect on restart.
  for (const [key, value] of Object.entries(env)) {
    process.env[key] = value
  }

  return {
    plugins: [react(), apiPlugin()],
    // Only expose the public pk. token — not every MAPBOX_* var (e.g. sk. secrets).
    envPrefix: ['VITE_', 'MAPBOX_API_KEY'],
    test: {
      include: ['tests/**/*.test.ts'],
    },
  }
})
