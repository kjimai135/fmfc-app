import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

function TopScorers() {
  const [goals, setGoals] = useState([])
  const [teams, setTeams] = useState([])
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [filterMode, setFilterMode] = useState('all')

  useEffect(() => {
    fetchTeams()
    fetchPlayers()
    fetchGoals()
  }, [])

  useEffect(() => {
    fetchGoals()
  }, [filterMode, startDate, endDate])

  async function fetchTeams() {
    const { data } = await supabase
      .from('teams')
      .select('*')
      .order('display_order')
    setTeams(data || [])
  }

  async function fetchPlayers() {
    const { data } = await supabase
      .from('players')
      .select('*')
    setPlayers(data || [])
  }

  async function fetchGoals() {
    setLoading(true)
    const { data } = await supabase
      .from('goals')
      .select('*')
      .order('game_date', { ascending: false })

    let filtered = data || []

    if (filterMode === 'range' && startDate && endDate) {
      filtered = filtered.filter(g => g.game_date >= startDate && g.game_date <= endDate)
    } else if (filterMode === 'month') {
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]
      filtered = filtered.filter(g => g.game_date >= monthStart && g.game_date <= monthEnd)
    } else if (filterMode === '3months') {
      const now = new Date()
      const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()).toISOString().split('T')[0]
      filtered = filtered.filter(g => g.game_date >= threeMonthsAgo)
    }

    setGoals(filtered)
    setLoading(false)
  }

  // 선수의 실제 소속팀 찾기 (players 테이블의 current_team 기준)
  function getPlayerTeam(playerId, fallbackTeam) {
    const player = players.find(p => p.id === playerId)
    return player?.current_team || fallbackTeam || '미배정'
  }

  // 🎨 팀 색상 가져오기 (팀명단과 동일, 파랑은 밝은 파랑으로 변환)
  function getTeamColor(teamName) {
    const team = teams.find(t => t.name === teamName)
    const color = team?.color || '#ffffff'
    const c = color.toLowerCase()
    if (c === '#1d4ed8' || c === '#2563eb' || c === '#1e40af' || c === '#1e3a8a') {
      return '#60a5fa' // 밝은 파랑
    }
    return color
  }

  // 득점 순위 계산 (실제 소속팀 + 공동 순위)
  function getScorers() {
    const scorers = {}

    for (const g of goals) {
      if (!scorers[g.player_id]) {
        scorers[g.player_id] = {
          player_id: g.player_id,
          player_name: g.player_name,
          team: getPlayerTeam(g.player_id, g.team), // ✅ 실제 소속팀
          goals: 0,
          dates: new Set(),
        }
      }
      scorers[g.player_id].goals++
      scorers[g.player_id].dates.add(g.game_date)
    }

    const sorted = Object.values(scorers)
      .map(s => ({ ...s, games: s.dates.size }))
      .sort((a, b) => b.goals - a.goals)

    // 공동 순위 부여 (같은 골 수 = 같은 순위)
    let lastGoals = null
    let lastRank = 0
    sorted.forEach((s, idx) => {
      if (s.goals !== lastGoals) {
        lastRank = idx + 1
        lastGoals = s.goals
      }
      s.rank = lastRank
    })

    return sorted
  }

  const scorers = getScorers()
  const totalGoals = goals.length
  const gameDates = [...new Set(goals.map(g => g.game_date))].length

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold text-white mb-2">👑 득점왕</h1>
      <p className="text-slate-400 mb-6">총 {totalGoals}골 / {gameDates}일 경기</p>

      {/* 기간 필터 */}
      <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 mb-6">
        <div className="flex flex-wrap gap-2 mb-4">
          {[
            { key: 'all', label: '전체' },
            { key: 'month', label: '이번 달' },
            { key: '3months', label: '최근 3개월 (시즌)' },
            { key: 'range', label: '기간 지정' },
          ].map(option => (
            <button
              key={option.key}
              onClick={() => setFilterMode(option.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filterMode === option.key
                  ? 'bg-emerald-500 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {filterMode === 'range' && (
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div>
              <label className="block text-slate-300 text-sm mb-1">시작일</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-slate-700 border border-slate-600 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div className="text-slate-400 py-2">~</div>
            <div>
              <label className="block text-slate-300 text-sm mb-1">종료일</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-slate-700 border border-slate-600 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>
        )}
      </div>

      {/* 전체 순위 테이블 */}
      {loading ? (
        <div className="text-center py-20 text-slate-400">
          <p className="text-xl">⏳ 로딩 중...</p>
        </div>
      ) : scorers.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <p className="text-4xl mb-4">👑</p>
          <p className="text-xl">골 기록이 없습니다</p>
          <p className="mt-2">경기 기록 페이지에서 골을 등록해주세요</p>
        </div>
      ) : (
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="px-4 py-3 text-slate-400 text-sm w-16">순위</th>
                <th className="px-4 py-3 text-slate-400 text-sm">선수</th>
                <th className="px-4 py-3 text-slate-400 text-sm">팀</th>
                <th className="px-4 py-3 text-slate-400 text-sm text-center">골</th>
                <th className="px-4 py-3 text-slate-400 text-sm text-center">출전 경기</th>
                <th className="px-4 py-3 text-slate-400 text-sm text-center">경기당 골</th>
              </tr>
            </thead>
            <tbody>
              {scorers.map((scorer) => {
                const teamColor = getTeamColor(scorer.team)
                return (
                  <tr key={scorer.player_id} className={`border-b border-slate-700/50 hover:bg-slate-700/30 ${scorer.rank === 1 ? 'bg-emerald-500/5' : ''}`}>
                    <td className="px-4 py-3 text-center">
                      {scorer.rank === 1 ? (
                        <span className="font-bold text-lg">🥇</span>
                      ) : (
                        <span className="font-bold text-slate-500 text-sm">{scorer.rank}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-white font-medium">{scorer.player_name}</td>
                    <td className="px-4 py-3 text-sm font-semibold" style={{ color: teamColor }}>
                      <span className="inline-flex items-center gap-2">
                        <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: teamColor, border: '1px solid rgba(255,255,255,0.3)' }}></span>
                        {scorer.team}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-emerald-400 font-bold text-lg">{scorer.goals}</td>
                    <td className="px-4 py-3 text-center text-slate-300">{scorer.games}</td>
                    <td className="px-4 py-3 text-center text-slate-300">
                      {(scorer.goals / scorer.games).toFixed(1)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default TopScorers