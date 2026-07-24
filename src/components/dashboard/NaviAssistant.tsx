import { useState, type FormEvent } from 'react'

const SUGGESTIONS = [
  'Swap an afternoon stop',
  'Shorter walking days',
  'Add a food-focused day',
  'More museums on Day 1',
] as const

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

export default function NaviAssistant() {
  const [draft, setDraft] = useState('')

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // UI-only for now — wired to the LLM layer later
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
          placeholder="Ask me anything…"
          autoComplete="off"
        />
        <button
          type="submit"
          className="navi__send"
          aria-label="Send message"
          disabled={!draft.trim()}
        >
          <SendIcon />
        </button>
      </form>
    </section>
  )
}
