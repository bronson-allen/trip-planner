import { useState, type FormEvent } from 'react'
import type { TripState } from '../../../lib/trip/tripState'

const SUGGESTIONS = [
  'Why is my first stop before lunch?',
  "What's near my Day 1 dinner?",
  'Make Day 2 lighter',
  'Swap a museum for something outdoorsy',
] as const

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
  const [message, setMessage] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const instruction = draft.trim()
    if (!instruction || pending) return

    setPending(true)
    setMessage(null)
    try {
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tripState, instruction }),
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
      setMessage(body.message)
      setDraft('')
    } catch (error) {
      setMessage(
        error instanceof Error && error.message
          ? error.message
          : 'Navi is unavailable right now. Your itinerary was not changed.',
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="navi" aria-label="Navi itinerary assistant">
      <div className="navi__aura" aria-hidden="true" />

      <div className="navi__intro">
        <h2 className="navi__greeting">
          Hi I&apos;m <span className="navi__name">Navi</span>
        </h2>
        <p className="navi__subtext">your personal itinerary assistant</p>
      </div>

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

      {message ? (
        <div className="navi__response" aria-live="polite">
          <p>{message}</p>
        </div>
      ) : null}

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
          placeholder="Ask about or refine your trip…"
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
