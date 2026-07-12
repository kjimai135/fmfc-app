import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

function TeamStandings() {
  const [matches, setMatches] = useState([])
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [filterMode, setFilterMode] = useState('all')

  useEffect(() => {
    fetchTeams()
    fetchMatches()
  }, [])

  useEffect(() => {
    fetchMatches()
  }, [filterMode, startDate, endDate])

  async function fetchTeams() {
    const { data } = await supabase
      .from('teams')
      .select('*')
      .order('display_order')
    setTeams(data || [])
  }

  async function fetchMatches() {
    setLoading(true)
    const { data } = await supabase
      .from('matches')
      .select('*')
      .order('game_date', { ascending: false })
    
    let filtered = data || []

    if (filterMode === 'range' && startDate && endDate) {
      filtered = filtered.filter(m => m.game_date >= startDate && m.game_date <= endDate)
    } else if (filterMode === 'month') {
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]
      filtered = filtered.filter(m => m.game_date >= monthStart && m.game_date <= monthEnd)
    } else if (filterMode === '3months') {
      const now = new Date()
      const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()).toISOString().split('T')[0]
      filtered = filtered.filter(m => m.game_date >= threeMonthsAgo)
    }

    setMatches(filtered)
    setLoading(false)
  }

  // 🎨 팀 색상 가져오기 (파랑은 밝은 파랑으로 변환)
  function getTeamColor(teamName) {
    const team = teams.find(t => t.name === teamName)
    const color = team?.color || '#ffffff'
    const c = color.toLowerCase()
    if (c === '#1d4ed8' || c === '#2563eb' || c === '#1e40af' || c === '#1e3a8a') {
      return '#60a5fa' // 밝은 파랑
    }
    return color
  }

  // 날짜별로 그룹화
  function getGameDates() {
    const dates = [...new Set(matches.map(m => m.game_date))]
    return dates
  }

  // 대진별 합산 (전반+후반) - 팀 이름 기준으로 정확히 합산!
  function getMatchups() {
    const dates = getGameDates()
    const allMatchups = []

    for (const date of dates) {
      const dayMatches = matches.filter(m => m.game_date === date).sort((a, b) => a.match_number - b.match_number)

      if (dayMatches.length >= 6) {
        const pairs = [
          { first: dayMatches[0], second: dayMatches[3] },
          { first: dayMatches[1], second: dayMatches[4] },
          { first: dayMatches[2], second: dayMatches[5] },
        ]

        for (const pair of pairs) {
          const teamA = pair.first.team_a
          const teamB = pair.first.team_b

          let totalA = pair.first.score_a
          let totalB = pair.first.score_b

          if (pair.second.team_a === teamA) {
            totalA += pair.second.score_a
            totalB += pair.second.score_b
          } else {
            totalA += pair.second.score_b
            totalB += pair.second.score_a
          }

          allMatchups.push({
            date,
            teamA,
            teamB,
            totalA,
            totalB,
          })
        }
      }
    }

    return allMatchups
  }

  // 팀별 전적 계산
  function getStandings() {
    const matchups = getMatchups()
    const standings = {}

    for (const team of teams) {
      standings[team.name] = {
        name: team.name,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        points: 0,
      }
    }

    for (const m of matchups) {
      if (!standings[m.teamA] || !standings[m.teamB]) continue

      standings[m.teamA].played++
      standings[m.teamB].played++
      standings[m.teamA].goalsFor += m.totalA
      standings[m.teamA].goalsAgainst += m.totalB
      standings[m.teamB].goalsFor += m.totalB
      standings[m.teamB].goalsAgainst += m.totalA

      if (m.totalA > m.totalB) {
        standings[m.teamA].wins++
        standings[m.teamA].points += 3
        standings[m.teamB].losses++
      } else if (m.totalA < m.totalB) {
        standings[m.teamB].wins++
        standings[m.teamB].points += 3
        standings[m.teamA].losses++
      } else {
        standings[m.teamA].draws++
        standings[m.teamA].points += 1
        standings[m.teamB].draws++
        standings[m.teamB].points += 1
      }
    }

    return Object.values(standings).sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points
      const gdA = a.goalsFor - a.goalsAgainst
      const gdB = b.goalsFor - b.goalsAgainst
      if (gdB !== gdA) return gdB - gdA
      return b.goalsFor - a.goalsFor
    })
  }

  const standings = getStandings()
  const totalGames = getGameDates().length

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold text-white mb-2">🏆 팀 전적</h1>
      <p className="text-slate-400 mb-6">총 {totalGames}일 경기 기준</p>

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

      {loading ? (
        <div className="text-center py-20 text-slate-400">
          <p className="text-xl">⏳ 로딩 중...</p>
        </div>
      ) : standings.length === 0 || standings[0].played === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <p className="text-4xl mb-4">🏆</p>
          <p className="text-xl">경기 기록이 없습니다</p>
          <p className="mt-2">경기 기록 페이지에서 경기를 등록해주세요</p>
        </div>
      ) : (
        <>
          {/* 순위표 */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-x-auto mb-6">
            <div className="px-4 py-3 border-b border-slate-700">
              <h2 className="text-lg font-bold text-white">📊 순위표</h2>
            </div>
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="px-4 py-3 text-slate-400 text-sm w-12">#</th>
                  <th className="px-4 py-3 text-slate-400 text-sm">팀</th>
                  <th className="px-4 py-3 text-slate-400 text-sm text-center">경기</th>
                  <th className="px-4 py-3 text-slate-400 text-sm text-center">승</th>
                  <th className="px-4 py-3 text-slate-400 text-sm text-center">무</th>
                  <th className="px-4 py-3 text-slate-400 text-sm text-center">패</th>
                  <th className="px-4 py-3 text-slate-400 text-sm text-center">득점</th>
                  <th className="px-4 py-3 text-slate-400 text-sm text-center">실점</th>
                  <th className="px-4 py-3 text-slate-400 text-sm text-center">득실차</th>
                  <th className="px-4 py-3 text-slate-400 text-sm text-center">승점</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((team, idx) => {
                  const teamColor = getTeamColor(team.name)
                  return (
                    <tr key={team.name} className={`border-b border-slate-700/50 hover:bg-slate-700/30 ${idx === 0 ? 'bg-emerald-500/5' : ''}`}>
                      <td className="px-4 py-3 text-slate-500">{idx + 1}</td>
                      <td className="px-4 py-3 font-bold" style={{ color: teamColor }}>
                        <span className="inline-flex items-center gap-2">
                          <span className="inline-block w-3 h-3 rounded-full flex-shrink-0" style={{ background: teamColor, border: '1px solid rgba(255,255,255,0.3)' }}></span>
                          {team.name}
                          {idx === 0 && <span className="ml-1 text-xs">👑</span>}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-slate-300">{team.played}</td>
                      <td className="px-4 py-3 text-center text-emerald-400 font-bold">{team.wins}</td>
                      <td className="px-4 py-3 text-center text-yellow-400">{team.draws}</td>
                      <td className="px-4 py-3 text-center text-red-400">{team.losses}</td>
                      <td className="px-4 py-3 text-center text-slate-300">{team.goalsFor}</td>
                      <td className="px-4 py-3 text-center text-slate-300">{team.goalsAgainst}</td>
                      <td className="px-4 py-3 text-center text-slate-300">
                        {team.goalsFor - team.goalsAgainst > 0 ? '+' : ''}{team.goalsFor - team.goalsAgainst}
                      </td>
                      <td className="px-4 py-3 text-center text-white font-bold text-lg">{team.points}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

export default TeamStandings