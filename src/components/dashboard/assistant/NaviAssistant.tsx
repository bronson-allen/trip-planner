import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { TripState } from '../../../lib/trip/tripState'

const SUGGESTIONS = [
  'Why is my first stop before lunch?',
  'Make Day 2 lighter',
  'Swap a museum for something outdoorsy',
  'What can I add near Day 1?',
] as const

const NAVI_TAGLINE = 'Your personal itinerary assistant.'
const NAVI_HELP =
  'I can answer questions about your plan, rearrange your stops, lighten a busy day, or add something nearby.'

const MAX_HISTORY_TURNS = 6

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

type NaviAssistantProps = {
  tripState: TripState
  onTripStateChange: (state: TripState) => void
}

type AssistantResponse = {
  tripState: TripState
  message: string
  toolCalls: Array<{ name: string; input: unknown }>
}

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4.5 12h13M12.5 6.5 18.5 12l-6 5.5"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function NaviAssistant({
  tripState,
  onTripStateChange,
}: NaviAssistantProps) {
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [pending, setPending] = useState(false)
  const threadRef = useRef<HTMLDivElement>(null)
  const hasConversation = messages.length > 0

  useEffect(() => {
    const thread = threadRef.current
    if (!thread) return
    thread.scrollTop = thread.scrollHeight
  }, [messages, pending])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const instruction = draft.trim()
    if (!instruction || pending) return

    const history = messages.slice(-MAX_HISTORY_TURNS)
    const userMessage: ChatMessage = { role: 'user', content: instruction }

    setPending(true)
    setMessages((current) => [...current, userMessage])
    setDraft('')

    try {
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tripState, instruction, history }),
      })
      const raw = await response.text()
      let body: AssistantResponse | { error?: string }
      try {
        body = JSON.parse(raw) as AssistantResponse | { error?: string }
      } catch {
        throw new Error(
          'Navi API is not available. Restart the app with `npm run dev` so /api/assistant is served.',
        )
      }
      if (!response.ok || !('tripState' in body)) {
        throw new Error('error' in body && body.error ? body.error : 'Assistant request failed.')
      }

      onTripStateChange(body.tripState)
      setMessages((current) => [...current, { role: 'assistant', content: body.message }])
    } catch (error) {
      const errorMessage =
        error instanceof Error && error.message
          ? error.message
          : 'Navi is unavailable right now. Your itinerary was not changed.'
      setMessages((current) => [...current, { role: 'assistant', content: errorMessage }])
    } finally {
      setPending(false)
    }
  }

  return (
    <section
      className={`navi${hasConversation ? ' navi--active' : ''}`}
      aria-label="Navi itinerary assistant"
    >
      <div className="navi__aura" aria-hidden="true" />

      <div className="navi__intro">
        {hasConversation ? (
          <h2 className="navi__greeting navi__greeting--compact">
            <span className="navi__name">Navi</span>
          </h2>
        ) : (
          <>
            <h2 className="navi__greeting">
              Hi I&apos;m <span className="navi__name">Navi</span>
            </h2>
            <p className="navi__subtext">{NAVI_TAGLINE}</p>
            <p className="navi__help">{NAVI_HELP}</p>
          </>
        )}
      </div>

      {hasConversation ? (
        <div
          ref={threadRef}
          className="navi__thread"
          role="log"
          aria-live="polite"
          aria-relevant="additions"
        >
          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`navi__bubble navi__bubble--${message.role}`}
            >
              <p>{message.content}</p>
            </div>
          ))}
          {pending ? (
            <div className="navi__thinking" aria-live="polite">
              <span className="navi__thinking-dots" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              <span>Navi is thinking…</span>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="navi__suggestions" role="group" aria-label="Suggested prompts">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="navi__pill"
              onClick={() => setDraft(suggestion)}
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      <form className="navi__composer" onSubmit={submit}>
        <label className="visually-hidden" htmlFor="navi-ask">
          Ask Navi
        </label>
        <input
          id="navi-ask"
          className="navi__input"
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="What would you like to change?"
          autoComplete="off"
          maxLength={500}
          disabled={pending}
        />
        <button
          type="submit"
          className="navi__send"
          aria-label="Send message"
          disabled={!draft.trim() || pending}
        >
          {pending ? <span className="navi__pending">…</span> : <SendIcon />}
        </button>
      </form>
    </section>
  )
}
