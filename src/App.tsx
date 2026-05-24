import { useEffect, useMemo, useState } from 'react'
import './App.css'
import {
  type ActivitiesData,
  type AggregatesData,
  type CoachStateData,
  type GoalsData,
  type InsightsData,
  type RecommendationsData,
  defaultActivitiesData,
  defaultAggregatesData,
  defaultCoachStateData,
  defaultGoalsData,
  defaultInsightsData,
  defaultRecommendationsData,
  fetchDataFile,
} from './data'

function App() {
  const [activities, setActivities] = useState<ActivitiesData>(defaultActivitiesData)
  const [aggregates, setAggregates] = useState<AggregatesData>(defaultAggregatesData)
  const [goals, setGoals] = useState<GoalsData>(defaultGoalsData)
  const [coachState, setCoachState] = useState<CoachStateData>(defaultCoachStateData)
  const [recommendations, setRecommendations] = useState<RecommendationsData>(
    defaultRecommendationsData,
  )
  const [insights, setInsights] = useState<InsightsData>(defaultInsightsData)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const [
          activitiesResponse,
          aggregatesResponse,
          goalsResponse,
          coachStateResponse,
          recommendationsResponse,
          insightsResponse,
        ] = await Promise.all([
          fetchDataFile<ActivitiesData>('activities.json'),
          fetchDataFile<AggregatesData>('aggregates.json'),
          fetchDataFile<GoalsData>('goals.json'),
          fetchDataFile<CoachStateData>('coach-state.json'),
          fetchDataFile<RecommendationsData>('next-recommendations.json'),
          fetchDataFile<InsightsData>('insights.json'),
        ])

        setActivities(activitiesResponse ?? defaultActivitiesData)
        setAggregates(aggregatesResponse ?? defaultAggregatesData)
        setGoals(goalsResponse ?? defaultGoalsData)
        setCoachState(coachStateResponse ?? defaultCoachStateData)
        setRecommendations(recommendationsResponse ?? defaultRecommendationsData)
        setInsights(insightsResponse ?? defaultInsightsData)
      } catch {
        setError(
          'Could not load local data files. Run the data scripts or check public/data/*.json.',
        )
      }
    }

    void load()
  }, [])

  const latestWeek = aggregates.weeks.at(-1)
  const latestMonth = aggregates.months.at(-1)
  const activeGoalCount = goals.items.filter((goal) => goal.status !== 'completed').length

  const recentActivities = useMemo(
    () => activities.items.slice().sort((a, b) => b.startDate.localeCompare(a.startDate)).slice(0, 8),
    [activities.items],
  )

  return (
    <main>
      <header className="header">
        <h1>Training Tracker</h1>
        <p>Webhook + reconciliation pipeline for Strava activities and adaptive AI recommendations.</p>
      </header>

      {error ? <p className="error">{error}</p> : null}

      <section className="cards">
        <article className="card">
          <h2>Distance this week</h2>
          <p className="metric">{latestWeek?.distanceKm.toFixed(1) ?? '0.0'} km</p>
        </article>
        <article className="card">
          <h2>Sessions this week</h2>
          <p className="metric">{latestWeek?.sessions ?? 0}</p>
        </article>
        <article className="card">
          <h2>Distance this month</h2>
          <p className="metric">{latestMonth?.distanceKm.toFixed(1) ?? '0.0'} km</p>
        </article>
        <article className="card">
          <h2>Active goals</h2>
          <p className="metric">{activeGoalCount}</p>
        </article>
      </section>

      <section className="panel">
        <h2>Coach state</h2>
        <p>
          <strong>Phase:</strong> {coachState.state.trainingPhase}
        </p>
        <p>
          <strong>Adherence:</strong> {(coachState.state.adherence * 100).toFixed(0)}%
        </p>
        <p>
          <strong>Fatigue flags:</strong>{' '}
          {coachState.state.fatigueFlags.length > 0
            ? coachState.state.fatigueFlags.join(', ')
            : 'None detected'}
        </p>
      </section>

      <section className="panel">
        <h2>Next recommendations</h2>
        {recommendations.items.length === 0 ? (
          <p>No recommendations generated yet.</p>
        ) : (
          <ol className="list">
            {recommendations.items.map((item) => (
              <li key={item.id}>
                <p className="list-title">{item.title}</p>
                <p>{item.description}</p>
                <p className="list-meta">
                  {item.intensity} intensity · confidence {(item.confidence * 100).toFixed(0)}%
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="panel">
        <h2>Goal progress</h2>
        <table>
          <thead>
            <tr>
              <th>Goal</th>
              <th>Status</th>
              <th>Target date</th>
            </tr>
          </thead>
          <tbody>
            {goals.items.map((goal) => (
              <tr key={goal.id}>
                <td>{goal.name}</td>
                <td>{goal.status}</td>
                <td>{goal.targetDate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h2>Recent activities</h2>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Sport</th>
              <th>Distance</th>
              <th>Duration</th>
              <th>Avg HR</th>
            </tr>
          </thead>
          <tbody>
            {recentActivities.map((activity) => (
              <tr key={activity.id}>
                <td>{activity.startDate.slice(0, 10)}</td>
                <td>{activity.sportType}</td>
                <td>{activity.distanceKm.toFixed(2)} km</td>
                <td>{Math.round(activity.movingTimeSeconds / 60)} min</td>
                <td>{activity.averageHeartRate ? Math.round(activity.averageHeartRate) : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h2>Latest insight</h2>
        <p>{insights.summary}</p>
      </section>
    </main>
  )
}

export default App
