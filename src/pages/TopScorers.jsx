import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

function TopScorers() {
  const [goals, setGoals] = useState([])
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [filterMode, setFilterMode] = useState('all')

  useEffect(() => {
    fetchTeams()
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

  const teamEmojis = ['⚪', '⚫', '🟡', '🔵', '🟣', '🟠']
  const getTeamEmoji = (teamName) => {
    const idx = teams.findIndex(t => t.name === teamName)
    return teamEmojis[idx] || '⚽'
  }

  // 득점 순위 계산
  function getScorers() {
    const scorers = {}

    for (const g of goals) {
      if (!scorers[g.player_id]) {
        scorers[g.player_id] = {
          player_id: g.player_id,
          player_name: g.player_name,
          team: g.team,
          goals: 0,
          dates: new Set(),
        }
      }
      scorers[g.player_id].goals++
      scorers[g.player_id].dates.add(g.game_date)
    }

    return Object.values(scorers)
      .map(s => ({ ...s, games: s.dates.size }))
      .sort((a, b) => b.goals - a.goals)
  }

  const scorers = getScorers()
  const totalGoals = goals.length
  const gameDates = [...new Set(goals.map(g => g.game_date))].length

  // 순위 메달
  const getMedal = (idx) => {
    switch(idx) {
      case 0: return '🥇'
      case 1: return '🥈'
      case 2: return '🥉'
      default: return `${idx + 1}`
    }
  }

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

      {/* TOP 3 카드 */}
      {scorers.length >= 3 && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          {scorers.slice(0, 3).map((scorer, idx) => (
            <div key={scorer.player_id} className={`rounded-xl p-4 text-center border ${
              idx === 0 ? 'bg-yellow-500/10 border-yellow-500/30' :
              idx === 1 ? 'bg-slate-400/10 border-slate-400/30' :
              'bg-orange-700/10 border-orange-700/30'
            }`}>
              <p className="text-3xl mb-2">{getMedal(idx)}</p>
              <p className="text-white font-bold text-lg">{scorer.player_name}</p>
              <p className="text-slate-400 text-sm">{getTeamEmoji(scorer.team)} {scorer.team}</p>
              <p className="text-3xl font-bold text-white mt-2">{scorer.goals}<span className="text-slate-400 text-sm ml-1">골</span></p>
              <p className="text-slate-500 text-xs mt-1">{scorer.games}경기 출전</p>
            </div>
          ))}
        </div>
      )}

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
              {scorers.map((scorer, idx) => (
                <tr key={scorer.player_id} className={`border-b border-slate-700/50 hover:bg-slate-700/30 ${idx < 3 ? 'bg-emerald-500/5' : ''}`}>
                  <td className="px-4 py-3 text-center">
                    <span className={`font-bold ${idx < 3 ? 'text-lg' : 'text-slate-500 text-sm'}`}>
                      {getMedal(idx)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-white font-medium">{scorer.player_name}</td>
                  <td className="px-4 py-3 text-slate-300 text-sm">{getTeamEmoji(scorer.team)} {scorer.team}</td>
                  <td className="px-4 py-3 text-center text-emerald-400 font-bold text-lg">{scorer.goals}</td>
                  <td className="px-4 py-3 text-center text-slate-300">{scorer.games}</td>
                  <td className="px-4 py-3 text-center text-slate-300">
                    {(scorer.goals / scorer.games).toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default TopScorers