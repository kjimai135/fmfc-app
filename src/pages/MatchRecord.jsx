import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

function MatchRecord() {
  const [teams, setTeams] = useState([])
  const [players, setPlayers] = useState([])
  const [matches, setMatches] = useState([])
  const [goals, setGoals] = useState([])
  const [selectedDate, setSelectedDate] = useState(
    new Date(new Date().getTime() + 9 * 60 * 60 * 1000).toISOString().split('T')[0]
  )
  const [availableDates, setAvailableDates] = useState([])
  const [loading, setLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => {
    fetchTeams()
    fetchPlayers()
    fetchAvailableDates()
  }, [])

  useEffect(() => {
    if (selectedDate) {
      fetchMatches(selectedDate)
      fetchGoals(selectedDate)
    }
  }, [selectedDate])

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
      .order('name')
    setPlayers(data || [])
  }

  async function fetchAvailableDates() {
    const { data } = await supabase
      .from('matches')
      .select('game_date')
      .order('game_date', { ascending: false })

    if (data) {
      const unique = [...new Set(data.map(d => d.game_date))]
      setAvailableDates(unique)
    }
  }

  async function fetchMatches(date) {
    const { data } = await supabase
      .from('matches')
      .select('*')
      .eq('game_date', date)
      .order('match_number')
    setMatches(data || [])
  }

  async function fetchGoals(date) {
    const { data } = await supabase
      .from('goals')
      .select('*')
      .eq('game_date', date)
    setGoals(data || [])
  }

  async function createDayMatches() {
    if (teams.length < 3) {
      alert('팀이 3개 이상 필요합니다!')
      return
    }

    const existing = matches.length > 0
    if (existing) {
      alert('이미 해당 날짜에 경기가 등록되어 있습니다!')
      return
    }

    setLoading(true)
    const t = teams.map(t => t.name)

    const dayMatches = [
      { match_number: 1, half: '전반', team_a: t[0], team_b: t[1] },
      { match_number: 2, half: '전반', team_a: t[1], team_b: t[2] },
      { match_number: 3, half: '전반', team_a: t[2], team_b: t[0] },
      { match_number: 4, half: '후반', team_a: t[0], team_b: t[1] },
      { match_number: 5, half: '후반', team_a: t[1], team_b: t[2] },
      { match_number: 6, half: '후반', team_a: t[2], team_b: t[0] },
    ]

    for (const m of dayMatches) {
      await supabase.from('matches').insert({
        game_date: selectedDate,
        ...m,
      })
    }

    setShowCreate(false)
    setLoading(false)
    fetchMatches(selectedDate)
    fetchAvailableDates()
    alert('6경기가 생성되었습니다!')
  }

  async function updateScore(matchId, field, value) {
    const score = Math.max(0, parseInt(value) || 0)
    await supabase
      .from('matches')
      .update({ [field]: score })
      .eq('id', matchId)
    fetchMatches(selectedDate)
  }

  async function addGoal(matchId, playerId, playerName, team) {
    await supabase.from('goals').insert({
      match_id: matchId,
      game_date: selectedDate,
      player_id: playerId,
      player_name: playerName,
      team: team,
    })
    fetchGoals(selectedDate)
  }

  async function removeGoal(goalId) {
    await supabase.from('goals').delete().eq('id', goalId)
    fetchGoals(selectedDate)
  }

  async function deleteDay() {
    if (!window.confirm(`${selectedDate} 경기 기록을 전부 삭제하시겠습니까?`)) return

    for (const m of matches) {
      await supabase.from('matches').delete().eq('id', m.id)
    }

    fetchMatches(selectedDate)
    fetchGoals(selectedDate)
    fetchAvailableDates()
    alert('삭제되었습니다.')
  }

  const teamEmojis = ['⚪', '⚫', '🟡', '🔵', '🟣', '🟠']
  const getTeamEmoji = (teamName) => {
    const idx = teams.findIndex(t => t.name === teamName)
    return teamEmojis[idx] || '⚽'
  }

  // 합산 결과 계산
  function getMatchupResult() {
    if (matches.length < 6) return []

    const matchups = [
      { teamA: matches[0].team_a, teamB: matches[0].team_b, first: matches[0], second: matches[3] },
      { teamA: matches[1].team_a, teamB: matches[1].team_b, first: matches[1], second: matches[4] },
      { teamA: matches[2].team_a, teamB: matches[2].team_b, first: matches[2], second: matches[5] },
    ]

    return matchups.map(m => {
      const totalA = m.first.score_a + m.second.score_a
      const totalB = m.first.score_b + m.second.score_b
      let result = '무'
      if (totalA > totalB) result = m.teamA
      if (totalB > totalA) result = m.teamB

      return {
        teamA: m.teamA,
        teamB: m.teamB,
        firstHalf: `${m.first.score_a} : ${m.first.score_b}`,
        secondHalf: `${m.second.score_a} : ${m.second.score_b}`,
        total: `${totalA} : ${totalB}`,
        totalA,
        totalB,
        result,
      }
    })
  }

  const matchupResults = getMatchupResult()

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <h1 className="text-3xl font-bold text-white">⚽ 경기 기록</h1>
        {matches.length === 0 && (
          <button
            onClick={() => setShowCreate(true)}
            className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-3 rounded-xl font-semibold transition-colors"
          >
            + 오늘 경기 생성
          </button>
        )}
      </div>

      {/* 날짜 선택 */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div>
          <label className="block text-slate-300 text-sm font-medium mb-2">날짜 선택</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500"
          />
        </div>
        <div>
          <label className="block text-slate-300 text-sm font-medium mb-2">최근 경기</label>
          <div className="flex flex-wrap gap-2">
            {availableDates.slice(0, 6).map(date => (
              <button
                key={date}
                onClick={() => setSelectedDate(date)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  selectedDate === date
                    ? 'bg-emerald-500 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
                }`}
              >
                {date}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 경기 생성 모달 */}
      {showCreate && (
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 mb-6">
          <h2 className="text-lg font-bold text-white mb-3">📅 {selectedDate} 경기 생성</h2>
          <p className="text-slate-400 text-sm mb-4">6경기 (전반 3경기 + 후반 3경기)가 자동 생성됩니다.</p>

          <div className="bg-slate-700/50 rounded-lg p-3 mb-4 text-sm text-slate-300">
            <p>전반: {teams[0]?.name} vs {teams[1]?.name} / {teams[1]?.name} vs {teams[2]?.name} / {teams[2]?.name} vs {teams[0]?.name}</p>
            <p>후반: 동일 대진 반복</p>
          </div>

          <div className="flex gap-4">
            <button
              onClick={createDayMatches}
              disabled={loading}
              className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-xl font-semibold transition-colors"
            >
              {loading ? '생성 중...' : '✅ 경기 생성'}
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-3 rounded-xl font-semibold transition-colors"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* 경기 목록 */}
      {matches.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <p className="text-4xl mb-4">⚽</p>
          <p className="text-xl">해당 날짜의 경기 기록이 없습니다</p>
          <p className="mt-2">"오늘 경기 생성" 버튼을 눌러주세요</p>
        </div>
      ) : (
        <>
          {/* 개별 경기 스코어 입력 */}
          <div className="space-y-4 mb-8">
            {matches.map(match => {
              const matchGoals = goals.filter(g => g.match_id === match.id)
              const goalsA = matchGoals.filter(g => g.team === match.team_a)
              const goalsB = matchGoals.filter(g => g.team === match.team_b)

              return (
                <div key={match.id} className="bg-slate-800 rounded-xl border border-slate-700 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-slate-400 text-sm">{match.half} {match.match_number}경기</span>
                  </div>

                  {/* 스코어 */}
                  <div className="flex items-center justify-center gap-4 mb-4">
                    <div className="text-center flex-1">
                      <p className="text-white font-bold">{getTeamEmoji(match.team_a)} {match.team_a}</p>
                    </div>
                    <input
                      type="number"
                      min="0"
                      value={match.score_a}
                      onChange={(e) => updateScore(match.id, 'score_a', e.target.value)}
                      className="w-16 bg-slate-700 border border-slate-600 rounded-lg px-2 py-2 text-white text-center text-xl font-bold focus:outline-none focus:border-emerald-500"
                    />
                    <span className="text-slate-400 text-xl font-bold">:</span>
                    <input
                      type="number"
                      min="0"
                      value={match.score_b}
                      onChange={(e) => updateScore(match.id, 'score_b', e.target.value)}
                      className="w-16 bg-slate-700 border border-slate-600 rounded-lg px-2 py-2 text-white text-center text-xl font-bold focus:outline-none focus:border-emerald-500"
                    />
                    <div className="text-center flex-1">
                      <p className="text-white font-bold">{getTeamEmoji(match.team_b)} {match.team_b}</p>
                    </div>
                  </div>

                  {/* 골 기록 */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-slate-400 text-xs mb-2">⚽ {match.team_a} 골</p>
                      {goalsA.map(g => (
                        <div key={g.id} className="flex items-center justify-between bg-slate-700/50 rounded px-2 py-1 mb-1">
                          <span className="text-white text-xs">{g.player_name}</span>
                          <button onClick={() => removeGoal(g.id)} className="text-red-400 text-xs">✕</button>
                        </div>
                      ))}
                      <select
                        onChange={(e) => {
                          if (e.target.value) {
                            const p = players.find(p => p.id === e.target.value)
                            if (p) addGoal(match.id, p.id, p.name, match.team_a)
                            e.target.value = ''
                          }
                        }}
                        className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-xs mt-1 focus:outline-none focus:border-emerald-500"
                      >
                        <option value="">+ 골 추가</option>
                        {players.filter(p => p.current_team === match.team_a).map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <p className="text-slate-400 text-xs mb-2">⚽ {match.team_b} 골</p>
                      {goalsB.map(g => (
                        <div key={g.id} className="flex items-center justify-between bg-slate-700/50 rounded px-2 py-1 mb-1">
                          <span className="text-white text-xs">{g.player_name}</span>
                          <button onClick={() => removeGoal(g.id)} className="text-red-400 text-xs">✕</button>
                        </div>
                      ))}
                      <select
                        onChange={(e) => {
                          if (e.target.value) {
                            const p = players.find(p => p.id === e.target.value)
                            if (p) addGoal(match.id, p.id, p.name, match.team_b)
                            e.target.value = ''
                          }
                        }}
                        className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-xs mt-1 focus:outline-none focus:border-emerald-500"
                      >
                        <option value="">+ 골 추가</option>
                        {players.filter(p => p.current_team === match.team_b).map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* 합산 결과 */}
          {matchupResults.length > 0 && (
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 mb-6">
              <h2 className="text-lg font-bold text-white mb-4">📊 합산 결과 (전반 + 후반)</h2>
              <div className="space-y-4">
                {matchupResults.map((r, idx) => (
                  <div key={idx} className="bg-slate-700/30 rounded-xl p-4">
                    <div className="flex items-center justify-center gap-6">
                      <div className="text-center flex-1">
                        <p className={`font-bold text-lg ${r.result === r.teamA ? 'text-emerald-400' : r.result === '무' ? 'text-yellow-400' : 'text-slate-400'}`}>
                          {getTeamEmoji(r.teamA)} {r.teamA}
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-white text-2xl font-bold">{r.total}</p>
                        <p className="text-slate-500 text-xs mt-1">전반 {r.firstHalf} / 후반 {r.secondHalf}</p>
                      </div>
                      <div className="text-center flex-1">
                        <p className={`font-bold text-lg ${r.result === r.teamB ? 'text-emerald-400' : r.result === '무' ? 'text-yellow-400' : 'text-slate-400'}`}>
                          {getTeamEmoji(r.teamB)} {r.teamB}
                        </p>
                      </div>
                    </div>
                    <div className="text-center mt-2">
                      {r.result === '무' ? (
                        <span className="bg-yellow-500/20 text-yellow-400 px-3 py-1 rounded-full text-sm">무승부</span>
                      ) : (
                        <span className="bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full text-sm">{r.result} 승!</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 삭제 버튼 */}
          <div className="text-right">
            <button
              onClick={deleteDay}
              className="bg-red-500/10 hover:bg-red-500/20 text-red-400 px-4 py-2 rounded-lg text-sm"
            >
              🗑️ 이 날 경기 전체 삭제
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export default MatchRecord