/**
 * The one place the browser reads the Mapbox token.
 *
 * It is a public `pk.` token and does reach the client — that is how Mapbox GL
 * works — but it is supplied by `MAPBOX_API_KEY` at build time rather than
 * committed, so it can be rotated or scoped without touching source or data.
 *
 * Server code must not import this: `import.meta.env` is a Vite construct, and
 * `api/` is built by the Vercel function runtime. Modules under `src/lib` and
 * `src/data` take the token as an argument instead.
 */
export const MAPBOX_TOKEN = import.meta.env.MAPBOX_API_KEY as string | undefined
