import { useEffect, useMemo, useState } from 'react'
import './App.css'
import {
  type ActivityAdviceData,
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
import {
  filterActivitiesByDateRange,
  getDefaultDateRange,
} from './lib/activityFilters'

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
  const [selectedTab, setSelectedTab] = useState<string>('all')
  const [expandedActivityIds, setExpandedActivityIds] = useState<Record<string, boolean>>({})
  const [activityAdviceById, setActivityAdviceById] = useState<
    Record<string, ActivityAdviceData | null | undefined>
  >({})
  const [activityAdviceLoadingById, setActivityAdviceLoadingById] = useState<Record<string, boolean>>(
    {},
  )
  const [activityAdviceErrorById, setActivityAdviceErrorById] = useState<Record<string, string>>({})
  const defaultRange = useMemo(() => getDefaultDateRange(), [])
  const [fromDate, setFromDate] = useState<string>(defaultRange.from)
  const [toDate, setToDate] = useState<string>(defaultRange.to)

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
  const activeGoal = goals.items.find((goal) => goal.status !== 'completed')
  const fallbackTargetSessions = activeGoal?.targetSessionsPerWeek ?? 4
  const fallbackPlannedSessions = recommendations.items.reduce(
    (total, item) => total + (item.metadata?.plannedSessions ?? 1),
    0,
  )
  const fallbackCompletedSessions = latestWeek?.sessions ?? 0
  const weeklyPlan = recommendations.trace?.week ?? {
    isoWeek: latestWeek?.isoWeek ?? 'N/A',
    targetSessions: fallbackTargetSessions,
    plannedSessions: fallbackPlannedSessions,
    completedSessions: fallbackCompletedSessions,
    remainingSessions: Math.max(fallbackPlannedSessions - fallbackCompletedSessions, 0),
  }
  const adaptationTrace = recommendations.trace?.adaptation

  const recentActivities = useMemo(
    () => activities.items.slice().sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [activities.items],
  )

  const dateFilteredActivities = useMemo(
    () => filterActivitiesByDateRange(recentActivities, fromDate, toDate),
    [recentActivities, fromDate, toDate],
  )

  const activityTabs = useMemo(() => {
    const categories = new Map<string, { label: string; count: number }>()
    for (const activity of dateFilteredActivities) {
      const id = toActivityTabId(activity.sportType)
      const existing = categories.get(id)
      if (existing) {
        existing.count += 1
      } else {
        categories.set(id, { label: toActivityTabLabel(id), count: 1 })
      }
    }

    return [
      { id: 'all', label: `All (${dateFilteredActivities.length})` },
      ...[...categories.entries()].map(([id, value]) => ({
        id,
        label: `${value.label} (${value.count})`,
      })),
    ]
  }, [dateFilteredActivities])

  const selectedTabId = useMemo(
    () => (activityTabs.some((tab) => tab.id === selectedTab) ? selectedTab : 'all'),
    [activityTabs, selectedTab],
  )

  const filteredRecentActivities = useMemo(() => {
    if (selectedTabId === 'all') {
      return dateFilteredActivities
    }

    return dateFilteredActivities.filter(
      (activity) => toActivityTabId(activity.sportType) === selectedTabId,
    )
  }, [dateFilteredActivities, selectedTabId])

  const loadActivityAdvice = async (activityId: string) => {
    setActivityAdviceLoadingById((previous) => ({ ...previous, [activityId]: true }))
    setActivityAdviceErrorById((previous) => {
      const next = { ...previous }
      delete next[activityId]
      return next
    })

    try {
      const adviceResponse = await fetchDataFile<ActivityAdviceData>(`activity-advice/${activityId}.json`)
      setActivityAdviceById((previous) => ({ ...previous, [activityId]: adviceResponse }))
    } catch {
      setActivityAdviceErrorById((previous) => ({
        ...previous,
        [activityId]: 'Could not load activity advice.',
      }))
      setActivityAdviceById((previous) => ({ ...previous, [activityId]: null }))
    } finally {
      setActivityAdviceLoadingById((previous) => ({ ...previous, [activityId]: false }))
    }
  }

  const toggleActivityDetails = (activityId: string) => {
    const isExpanded = expandedActivityIds[activityId] ?? false
    if (!isExpanded && activityAdviceById[activityId] === undefined) {
      void loadActivityAdvice(activityId)
    }

    setExpandedActivityIds((previous) => ({
      ...previous,
      [activityId]: !previous[activityId],
    }))
  }

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
        <h2>This week: planned vs done</h2>
        <div className="weekly-plan-grid">
          <p>
            <strong>Week:</strong> {weeklyPlan.isoWeek}
          </p>
          <p>
            <strong>Planned:</strong> {weeklyPlan.plannedSessions}
          </p>
          <p>
            <strong>Done:</strong> {weeklyPlan.completedSessions}
          </p>
          <p>
            <strong>Remaining:</strong> {weeklyPlan.remainingSessions}
          </p>
          <p>
            <strong>Goal target:</strong> {weeklyPlan.targetSessions} sessions
          </p>
        </div>
      </section>

      <section className="panel">
        <h2>Next recommendations</h2>
        {recommendations.trace ? (
          <div className="trace-block">
            <p className="list-meta">
              Run {recommendations.trace.runId} · source {recommendations.trace.source}
              {recommendations.trace.model ? ` · model ${recommendations.trace.model}` : ''}
            </p>
            <p className="list-meta">
              Adaptation {adaptationTrace?.changed ? 'updated plan' : 'no changes'} vs previous run
              {adaptationTrace?.previousRunId ? ` (${adaptationTrace.previousRunId})` : ''}
            </p>
            <p className="list-meta">
              Added: {formatIdList(adaptationTrace?.addedRecommendationIds ?? [])} · Updated:{' '}
              {formatIdList(adaptationTrace?.updatedRecommendationIds ?? [])} · Removed:{' '}
              {formatIdList(adaptationTrace?.removedRecommendationIds ?? [])}
            </p>
          </div>
        ) : (
          <p className="list-meta">No adaptation trace metadata available for this recommendation file.</p>
        )}
        {recommendations.items.length === 0 ? (
          <p>No recommendations generated yet.</p>
        ) : (
          <ol className="list">
            {recommendations.items.map((item) => (
              <li key={item.id}>
                <p className="list-title">{item.title}</p>
                <p>{item.description}</p>
                <p className="list-meta">
                  {item.intensity} intensity · confidence {(item.confidence * 100).toFixed(0)}% ·
                  planned {item.metadata?.plannedSessions ?? 1} session
                  {(item.metadata?.plannedSessions ?? 1) === 1 ? '' : 's'}
                  {item.metadata?.rationaleTags?.length
                    ? ` · ${item.metadata.rationaleTags.join(', ')}`
                    : ''}
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
                <td>
                  {goal.url ? (
                    <a href={goal.url} target="_blank" rel="noopener noreferrer">
                      {goal.name}
                    </a>
                  ) : (
                    goal.name
                  )}
                </td>
                <td>{goal.status}</td>
                <td>{goal.targetDate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h2>Recent activities</h2>
        <div className="activity-filters">
          <label className="date-filter">
            <span>From</span>
            <input
              type="date"
              value={fromDate}
              max={toDate}
              onChange={(event) => setFromDate(event.target.value)}
            />
          </label>
          <label className="date-filter">
            <span>To</span>
            <input
              type="date"
              value={toDate}
              min={fromDate}
              onChange={(event) => setToDate(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="link-button"
            onClick={() => {
              const next = getDefaultDateRange()
              setFromDate(next.from)
              setToDate(next.to)
            }}
          >
            Reset to last 7 days
          </button>
        </div>
        <div className="activity-tabs">
          {activityTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={tab.id === selectedTabId ? 'tab-button tab-button-active' : 'tab-button'}
              onClick={() => setSelectedTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <ul className="activity-list">
          {filteredRecentActivities.length === 0 ? (
            <li className="activity-item">No activities in this date range.</li>
          ) : null}
          {filteredRecentActivities.map((activity) => {
            const isRun = activity.sportType === 'Run'
            const isExpanded = expandedActivityIds[activity.id] ?? false
            const advice = activityAdviceById[activity.id]
            const isAdviceLoading = activityAdviceLoadingById[activity.id] ?? false
            const adviceError = activityAdviceErrorById[activity.id]

            return (
              <li key={activity.id} className="activity-item">
                <div className="activity-row">
                  <p className="activity-title">{activity.title ?? `${activity.sportType} activity`}</p>
                  <div className="activity-actions">
                    <span>{activity.startDate.slice(0, 10)}</span>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => toggleActivityDetails(activity.id)}
                    >
                      {isExpanded ? 'Hide details' : 'Expand details'}
                    </button>
                  </div>
                </div>
                <p className="activity-meta">
                  {activity.sportType} · {activity.distanceKm.toFixed(2)} km ·{' '}
                  {Math.round(activity.movingTimeSeconds / 60)} min · Avg HR{' '}
                  {activity.averageHeartRate ? Math.round(activity.averageHeartRate) : '-'}
                </p>
                {isExpanded ? (
                  <div className="activity-details">
                    <p>
                      <strong>Description:</strong> {activity.description?.trim() || 'No description'}
                    </p>
                    <p>
                      <strong>Calories:</strong>{' '}
                        {typeof activity.calories === 'number' ? `${Math.round(activity.calories)} kcal` : '-'}
                      </p>
                    {isRun ? (
                      <p>
                        <strong>Average rhythm:</strong>{' '}
                        {typeof activity.averageRhythm === 'number'
                          ? `${formatRhythm(activity.averageRhythm)} min/km`
                          : '-'}
                      </p>
                    ) : null}
                    <div className="activity-advice">
                      <p className="activity-advice-title">Coaching advice</p>
                      {isAdviceLoading ? <p>Loading advice…</p> : null}
                      {!isAdviceLoading && adviceError ? <p>{adviceError}</p> : null}
                      {!isAdviceLoading && !adviceError && advice ? (
                        <>
                          <p>
                            <strong>Summary:</strong> {advice.advice.summary}
                          </p>
                          <p>
                            <strong>Focus:</strong> {advice.advice.focus}
                          </p>
                          <p>
                            <strong>Next session:</strong> {advice.advice.nextSession}
                          </p>
                          {advice.advice.caution ? (
                            <p>
                              <strong>Caution:</strong> {advice.advice.caution}
                            </p>
                          ) : null}
                          <p className="activity-advice-meta">
                            Generated {advice.generatedAt.slice(0, 10)} · model {advice.model}
                          </p>
                        </>
                      ) : null}
                      {!isAdviceLoading && !adviceError && advice === null ? (
                        <p>No activity advice generated yet.</p>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      </section>

      <section className="panel">
        <h2>Latest insight</h2>
        <p>{insights.summary}</p>
      </section>
    </main>
  )
}

function toActivityTabId(sportType: string): string {
  if (sportType === 'Run') return 'run'
  if (sportType === 'WeightTraining') return 'weight-training'
  if (sportType === 'HighIntensityIntervalTraining') return 'hiit'
  if (sportType === 'Tennis' || sportType === 'Padel') return 'racket-sports'
  return `sport-${sportType.toLowerCase()}`
}

function toActivityTabLabel(tabId: string): string {
  if (tabId === 'run') return 'Run'
  if (tabId === 'weight-training') return 'Weight Training'
  if (tabId === 'hiit') return 'HIIT'
  if (tabId === 'racket-sports') return 'Tennis/Padel'
  if (tabId.startsWith('sport-')) {
    const raw = tabId.replace('sport-', '')
    return raw.charAt(0).toUpperCase() + raw.slice(1)
  }
  return tabId
}

function formatRhythm(minutesPerKm: number): string {
  const totalSeconds = Math.round(minutesPerKm * 60)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function formatIdList(ids: string[]): string {
  return ids.length > 0 ? ids.join(', ') : 'none'
}

export default App
