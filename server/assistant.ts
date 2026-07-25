import { openai } from '@ai-sdk/openai'
import { generateText, isStepCount, tool } from 'ai'
import { z } from 'zod'
import { PLACES, PLACES_BY_ID } from '../src/data/places.ts'
import { buildTripDays } from '../src/data/tripPlan.ts'
import type { TripState } from '../src/lib/trip/tripState.ts'
import {
  addStop,
  explainStop,
  nearbyPlaces,
  rebalanceDay,
  removeStop,
  reorderStop,
  searchPlaces,
  swapStop,
  type MutationResult,
  type ToolResult,
} from '../src/lib/trip/tools.ts'

const MODEL_ID = 'gpt-4.1'
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_REQUESTS = 10
const MAX_SEARCH_ATTEMPTS = 2
const FINAL_RESPONSE_STEP = 5

const ASSISTANT_TOOLS = [
  'searchPlaces',
  'explainStop',
  'nearbyPlaces',
  'addStop',
  'removeStop',
  'swapStop',
  'reorderStop',
  'rebalanceDay',
] as const

const FINAL_RESPONSE_INSTRUCTIONS = `Now respond to the traveler. Do not attempt or imitate any
additional tool calls. Summarize only confirmed changes and helpful alternatives in 1-3 plain-text
sentences. Never include function syntax, JSON arguments, ids, tool names, datasets, or internal reasoning.`

const TOOL_CALL_TEXT_PATTERN =
  /to=functions\.[\w-]+\s+code:\s*\{[^{}]*\}\s*/giu

const rateLimits = new Map<string, { count: number; resetAt: number }>()

const tripStateSchema = z.object({
  city: z.string().min(1).max(80),
  startDate: z.iso.date(),
  prefs: z.object({
    interests: z.array(z.string().max(40)).max(20),
    budget: z.enum(['budget', 'moderate', 'splurge']).optional(),
    authenticityPref: z.number().min(-2).max(2).optional(),
    pace: z.enum(['relaxed', 'balanced', 'packed']).optional(),
  }),
  days: z
    .array(
      z.object({
        day: z.number().int().min(1).max(7),
        stops: z
          .array(
            z.object({
              placeId: z.string().min(1).max(120),
              slot: z.enum(['morning', 'lunch', 'afternoon', 'evening', 'dinner']),
            }),
          )
          .max(30),
      }),
    )
    .min(1)
    .max(7),
})

const requestSchema = z.object({
  tripState: tripStateSchema,
  instruction: z.string().trim().min(1).max(500),
})

type ToolCallSummary = {
  name: string
  input: unknown
}

function allowedOrigin(request: Request): string | null {
  const origin = request.headers.get('origin')
  if (!origin) return null

  const requestOrigin = new URL(request.url).origin
  const configuredOrigin = process.env.APP_ORIGIN
  const vercelOrigin = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null
  const allowed = new Set([requestOrigin, configuredOrigin, vercelOrigin].filter(Boolean))
  return allowed.has(origin) ? origin : ''
}

function corsHeaders(origin: string | null): HeadersInit {
  return {
    'Access-Control-Allow-Origin': origin || 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  }
}

function clientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}

function isRateLimited(ip: string, now = Date.now()): boolean {
  const current = rateLimits.get(ip)
  if (!current || current.resetAt <= now) {
    rateLimits.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return false
  }
  current.count += 1
  return current.count > RATE_LIMIT_REQUESTS
}

function validateStateReferences(state: TripState): string | null {
  const seenDays = new Set<number>()
  const seenPlaces = new Set<string>()
  for (const day of state.days) {
    if (seenDays.has(day.day)) return `Day ${day.day} appears more than once.`
    seenDays.add(day.day)
    for (const stop of day.stops) {
      const place = PLACES_BY_ID.get(stop.placeId)
      if (!place) return `Unknown place id "${stop.placeId}".`
      if (place.city !== state.city) return `${place.name} is not in ${state.city}.`
      if (seenPlaces.has(stop.placeId)) return `${place.name} appears more than once.`
      seenPlaces.add(stop.placeId)
    }
  }
  return null
}

function itineraryContext(state: TripState): string {
  const datesByDay = new Map(buildTripDays(state.startDate).map((date) => [date.day, date]))
  return state.days
    .map((day) => {
      const date = datesByDay.get(day.day)
      const stops = day.stops
        .map((stop) => {
          const place = PLACES_BY_ID.get(stop.placeId)
          return place
            ? `${stop.slot}: ${place.name} [id=${place.id}, type=${place.type}, tags=${place.tags.join('|')}]`
            : `${stop.slot}: unknown id`
        })
        .join('; ')
      const calendarLabel = date
        ? `${date.weekday}, ${date.dateLabel} (${date.iso})`
        : state.startDate
      return `Day ${day.day} — ${calendarLabel}: ${stops}`
    })
    .join('\n')
}

function datasetVocabulary(state: TripState): string {
  const cityPlaces = PLACES.filter((place) => place.city === state.city)
  const types = [...new Set(cityPlaces.map((place) => place.type))].sort()
  const tags = [...new Set(cityPlaces.flatMap((place) => place.tags))].sort()
  return `Valid place types: ${types.join(', ')}\nValid tags: ${tags.join(', ')}`
}

function mutationOutput(
  result: ToolResult<MutationResult>,
  update: (state: TripState) => void,
): { ok: true; summary: string } | { ok: false; error: unknown } {
  if (!result.ok) return { ok: false, error: result.error }
  update(result.value.tripState)
  return { ok: true, summary: result.value.summary }
}

function sanitizeAssistantMessage(text: string): string {
  const cleaned = text.replace(TOOL_CALL_TEXT_PATTERN, '').trim()
  if (/functions\.|<tool[_-]?call|tool[_-]?call>/iu.test(cleaned)) return ''
  return cleaned
}

export function OPTIONS(request: Request): Response {
  const origin = allowedOrigin(request)
  if (origin === '') return new Response(null, { status: 403 })
  return new Response(null, { status: 204, headers: corsHeaders(origin) })
}

export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now()
  const requestId = crypto.randomUUID()
  const origin = allowedOrigin(request)
  if (origin === '') {
    console.warn(
      JSON.stringify({
        event: 'assistant_request',
        requestId,
        model: MODEL_ID,
        latencyMs: Date.now() - startedAt,
        toolCalls: [],
        outcome: 'origin_rejected',
      }),
    )
    return Response.json(
      { error: 'Origin not allowed.' },
      { status: 403, headers: corsHeaders(null) },
    )
  }

  const ip = clientIp(request)
  if (isRateLimited(ip)) {
    console.warn(
      JSON.stringify({
        event: 'assistant_request',
        requestId,
        model: MODEL_ID,
        latencyMs: Date.now() - startedAt,
        toolCalls: [],
        outcome: 'rate_limited',
      }),
    )
    return Response.json(
      { error: 'Too many assistant requests. Please wait a minute.' },
      { status: 429, headers: corsHeaders(origin) },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    console.warn(
      JSON.stringify({
        event: 'assistant_request',
        requestId,
        model: MODEL_ID,
        latencyMs: Date.now() - startedAt,
        toolCalls: [],
        outcome: 'invalid_json',
      }),
    )
    return Response.json(
      { error: 'Request body must be valid JSON.' },
      { status: 400, headers: corsHeaders(origin) },
    )
  }

  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    console.warn(
      JSON.stringify({
        event: 'assistant_request',
        requestId,
        model: MODEL_ID,
        latencyMs: Date.now() - startedAt,
        toolCalls: [],
        outcome: 'invalid_request',
      }),
    )
    return Response.json(
      { error: 'Invalid assistant request.', details: parsed.error.flatten() },
      { status: 400, headers: corsHeaders(origin) },
    )
  }
  const stateError = validateStateReferences(parsed.data.tripState)
  if (stateError) {
    console.warn(
      JSON.stringify({
        event: 'assistant_request',
        requestId,
        model: MODEL_ID,
        latencyMs: Date.now() - startedAt,
        toolCalls: [],
        outcome: 'invalid_state',
      }),
    )
    return Response.json(
      { error: 'Invalid itinerary state.', details: stateError },
      { status: 400, headers: corsHeaders(origin) },
    )
  }

  let currentState: TripState = structuredClone(parsed.data.tripState)
  const mutationSummaries: string[] = []
  let searchAttempts = 0
  const directRemovalRequested =
    /\b(remove|delete|drop|take out)\b/iu.test(parsed.data.instruction)
  const availableTools = directRemovalRequested
    ? [...ASSISTANT_TOOLS]
    : ASSISTANT_TOOLS.filter((name) => name !== 'removeStop')
  const updateState = (next: TripState) => {
    currentState = next
  }

  try {
    const result = await generateText({
      model: openai(MODEL_ID),
      // Five bounded tool steps plus one tool-free step for a useful final answer.
      stopWhen: isStepCount(FINAL_RESPONSE_STEP + 1),
      providerOptions: {
        openai: {
          parallelToolCalls: false,
          store: false,
        },
      },
      prepareStep: ({ stepNumber, instructions }) => {
        if (stepNumber >= FINAL_RESPONSE_STEP) {
          return {
            activeTools: [],
            toolChoice: 'none',
            instructions:
              typeof instructions === 'string'
                ? `${instructions}\n\n${FINAL_RESPONSE_INSTRUCTIONS}`
                : FINAL_RESPONSE_INSTRUCTIONS,
          }
        }
        return {
          activeTools:
            searchAttempts >= MAX_SEARCH_ATTEMPTS
              ? availableTools.filter((name) => name !== 'searchPlaces')
              : availableTools,
          toolChoice: stepNumber === 0 ? 'required' : 'auto',
        }
      },
      system: `You are Navi, a concise and friendly travel-planning assistant for the displayed itinerary.
Answer only about this trip. Use tools for every factual claim about places, scores, distance, or schedule.
Never invent or type a place id. For a new place, call searchPlaces first and copy an id from its result.
For a swap, search first, then call swapStop with a returned id.

Interpret weekday and date references from the calendar labels below. Break compound requests into independent
parts and complete every safe part you can; one unavailable preference must not block unrelated changes.
Make direct changes such as lighter/fuller days or reordering before searching for optional replacements.
For requests about starting, ending, or sequencing a day, inspect existing stop types first and use swap or
reorder when appropriate.

Search filters are exact and combined with AND. Use only constraints the traveler actually requested and only
the valid vocabulary below. Use "types" when several place types could satisfy the request. Do not add price,
proximity, type, or tag restrictions the traveler did not request, and do not invent synonymous tags or types.
You may search at most twice: after an empty result, relax optional proximity or soft tags once, then continue.

For broad preference changes, preserve stops that already match and search for replacements before changing
non-matching stops. Use swapStop to replace them one at a time. Never remove a stop merely because no
replacement was found, and use removeStop only when the traveler explicitly asks to remove or delete something.

In the final response, clearly say what changed and briefly explain anything you could not accommodate.
Offer a useful alternative when possible. Never mention tools, function names, datasets, ids, search attempts,
technical limits, or internal reasoning. Do not claim a change succeeded unless a mutation tool confirmed it.
Keep the response to 1-3 warm, direct sentences in plain text with no Markdown formatting.

Current itinerary in ${currentState.city}:
${itineraryContext(currentState)}

${datasetVocabulary(currentState)}`,
      prompt: parsed.data.instruction,
      tools: {
        searchPlaces: tool({
          description:
            'Find eligible, unused places matching exact constraints. All tags are required (AND); types match any listed value (OR); type matches one exact value; used itinerary stops are excluded. Do not add constraints the traveler did not state. Check the itinerary context for an existing matching stop before searching. Always call before addStop or swapStop.',
          inputSchema: z.object({
            tags: z.array(z.string()).max(8).optional(),
            maxPrice: z.number().int().min(1).max(4).optional(),
            types: z.array(z.string()).min(1).max(8).optional(),
            type: z.string().optional(),
            nearPlaceId: z.string().optional(),
            radiusKm: z.number().positive().max(20).optional(),
            limit: z.number().int().min(1).max(10).optional(),
          }),
          execute: (input) => {
            searchAttempts += 1
            const output = searchPlaces(currentState, PLACES, input)
            if (!output.ok) return output
            return {
              ok: true,
              candidates: output.value,
              candidateCount: output.value.length,
              guidance:
                output.value.length > 0
                  ? 'Choose only from these candidates.'
                  : searchAttempts < MAX_SEARCH_ATTEMPTS
                    ? 'No exact match. Relax only an optional proximity or soft-tag constraint once.'
                    : 'No suitable unused match. Continue other requested changes and explain the limitation helpfully.',
            }
          },
        }),
        explainStop: tool({
          description:
            'Explain why an existing itinerary stop was selected and placed in its current slot.',
          inputSchema: z.object({ placeId: z.string() }),
          execute: ({ placeId }) => explainStop(currentState, PLACES, placeId),
        }),
        nearbyPlaces: tool({
          description: 'Find eligible unused places near an existing itinerary stop.',
          inputSchema: z.object({
            placeId: z.string(),
            radiusKm: z.number().positive().max(20).optional(),
          }),
          execute: ({ placeId, radiusKm }) =>
            nearbyPlaces(currentState, PLACES, placeId, radiusKm),
        }),
        addStop: tool({
          description: 'Add a place returned by searchPlaces to a specific day.',
          inputSchema: z.object({ placeId: z.string(), day: z.number().int().min(1).max(7) }),
          execute: (input) => {
            const output = mutationOutput(addStop(currentState, PLACES, input), updateState)
            if (output.ok) mutationSummaries.push(output.summary)
            return output
          },
        }),
        removeStop: tool({
          description:
            'Remove an existing itinerary stop only when the traveler explicitly asks to remove, delete, or drop it. Never use this to make room after a failed search or to approximate a preference change.',
          inputSchema: z.object({ placeId: z.string() }),
          execute: ({ placeId }) => {
            const output = mutationOutput(removeStop(currentState, PLACES, placeId), updateState)
            if (output.ok) mutationSummaries.push(output.summary)
            return output
          },
        }),
        swapStop: tool({
          description:
            'Replace an existing stop with a replacement id returned by searchPlaces.',
          inputSchema: z.object({
            placeId: z.string(),
            replacementPlaceId: z.string(),
          }),
          execute: (input) => {
            const output = mutationOutput(swapStop(currentState, PLACES, input), updateState)
            if (output.ok) mutationSummaries.push(output.summary)
            return output
          },
        }),
        reorderStop: tool({
          description: 'Move an existing stop to a zero-based position within its current day.',
          inputSchema: z.object({
            placeId: z.string(),
            toIndex: z.number().int().min(0).max(29),
          }),
          execute: (input) => {
            const output = mutationOutput(reorderStop(currentState, PLACES, input), updateState)
            if (output.ok) mutationSummaries.push(output.summary)
            return output
          },
        }),
        rebalanceDay: tool({
          description:
            'Make a day lighter or fuller. For lighter, optionally move the lowest-value sight to a different target day.',
          inputSchema: z.object({
            day: z.number().int().min(1).max(7),
            direction: z.enum(['lighter', 'fuller']),
            targetDay: z.number().int().min(1).max(7).optional(),
          }),
          execute: (input) => {
            const output = mutationOutput(rebalanceDay(currentState, PLACES, input), updateState)
            if (output.ok) mutationSummaries.push(output.summary)
            return output
          },
        }),
      },
    })

    const toolCalls: ToolCallSummary[] = result.toolCalls.map((call) => ({
      name: call.toolName,
      input: call.input,
    }))
    const message =
      sanitizeAssistantMessage(result.text) ||
      mutationSummaries.join(' ') ||
      "I couldn't make that change confidently with the options available. Try relaxing one preference or asking me to adjust one part of the day."

    console.info(
      JSON.stringify({
        event: 'assistant_request',
        requestId,
        model: MODEL_ID,
        latencyMs: Date.now() - startedAt,
        tokens: result.usage,
        toolCalls,
        outcome: 'success',
      }),
    )

    return Response.json(
      { tripState: currentState, message, toolCalls },
      { headers: corsHeaders(origin) },
    )
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'assistant_request',
        requestId,
        model: MODEL_ID,
        latencyMs: Date.now() - startedAt,
        toolCalls: [],
        outcome: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
    )
    return Response.json(
      { error: 'Navi is unavailable right now. Your itinerary was not changed.' },
      { status: 503, headers: corsHeaders(origin) },
    )
  }
}
