import './Hero.css'

type HeroProps = {
  onPlanClick: () => void
}

export default function Hero({ onPlanClick }: HeroProps) {
  return (
    <section className="hero">
      <div className="hero__blobs" aria-hidden="true">
        <span className="hero__blob hero__blob--a" />
        <span className="hero__blob hero__blob--b" />
        <span className="hero__blob hero__blob--c" />
      </div>

      <img
        className="hero__map"
        src="/assets/dot_world_map.svg"
        alt=""
        draggable={false}
        aria-hidden="true"
      />

      <div className="hero__content">
        <h1 className="hero__title">Your Personalized Travel Planner</h1>
        <button type="button" className="hero__cta" onClick={onPlanClick}>
          Plan the perfect trip
        </button>
      </div>
    </section>
  )
}
