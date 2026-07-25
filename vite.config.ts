import type { IncomingMessage, ServerResponse } from 'node:http'
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
 * Serves `/api/assistant` during `npm run dev` so Navi works without a separate
 * `vercel dev` process. Production still uses the Vercel Function in `api/`.
 */
function assistantApiPlugin(): Plugin {
  return {
    name: 'assistant-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/assistant')) {
          next()
          return
        }

        try {
          await handleAssistantRequest(server, req, res)
        } catch (error) {
          console.error('[assistant-api]', error)
          if (!res.headersSent) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'Assistant middleware failed.' }))
          }
        }
      })
    },
  }
}

async function handleAssistantRequest(
  server: ViteDevServer,
  req: IncomingMessage,
  res: ServerResponse,
) {
  const mod = (await server.ssrLoadModule('/server/assistant.ts')) as {
    POST: (request: Request) => Promise<Response>
    OPTIONS: (request: Request) => Response
  }

  const host = req.headers.host ?? 'localhost:5173'
  const url = `http://${host}${req.url ?? '/api/assistant'}`
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
  for (const [key, value] of Object.entries(env)) {
    if (process.env[key] === undefined) process.env[key] = value
  }

  return {
    plugins: [react(), assistantApiPlugin()],
    // Expose MAPBOX_* so client code can read MAPBOX_API_KEY (public token only).
    envPrefix: ['VITE_', 'MAPBOX_'],
    test: {
      include: ['tests/**/*.test.ts'],
    },
  }
})
