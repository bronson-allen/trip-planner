import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Hero from '../components/home/Hero'
import PlannerCard from '../components/home/PlannerCard'
import { isPlannableCity } from '../data/cities'
import { saveTripPlan } from '../data/tripPlan'

export default function HomePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  /**
   * `?city=Venice` opens the planner pre-anchored there — the landing spot for Explore's
   * "Plan a trip to X". Validated against the plannable cities so the URL can't inject a value
   * the engine has no places for.
   */
  const requested = searchParams.get('city')
  const [initialCity] = useState(() =>
    requested && isPlannableCity(requested) ? requested : undefined,
  )
  const [plannerOpen, setPlannerOpen] = useState(Boolean(initialCity))

  return (
    <>
      <Hero onPlanClick={() => setPlannerOpen(true)} />
      <PlannerCard
        open={plannerOpen}
        initialCity={initialCity}
        onClose={() => setPlannerOpen(false)}
        onSubmit={(plan) => {
          saveTripPlan(plan)
          navigate('/dashboard')
        }}
      />
    </>
  )
}
