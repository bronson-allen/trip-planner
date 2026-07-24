import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Hero from '../components/Hero'
import PlannerCard from '../components/PlannerCard'
import { saveTripPlan } from '../data/tripPlan'

export default function HomePage() {
  const navigate = useNavigate()
  const [plannerOpen, setPlannerOpen] = useState(false)

  return (
    <>
      <Hero onPlanClick={() => setPlannerOpen(true)} />
      <PlannerCard
        open={plannerOpen}
        onClose={() => setPlannerOpen(false)}
        onSubmit={(plan) => {
          saveTripPlan(plan)
          navigate('/dashboard')
        }}
      />
    </>
  )
}
