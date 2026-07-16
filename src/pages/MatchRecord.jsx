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
      { match_number: 1, half: '전반', team_a: t[1], team_b: t[2] },
      { match_number: 2, half: '전반', team_a: t[0], team_b: t[1] },
      { match_number: 3, half: '전반', team_a: t[0], team_b: t[2] },
      { match_number: 4, half: '후반', team_a: t[1], team_b: t[2] },
      { match_number: 5, half: '후반', team_a: t[0], team_b: t[1] },
      { match_number: 6, half: '후반', team_a: t[0], team_b: t[2] },
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

  async function updateTeamName(matchId, field, value) {
    await supabase
      .from('matches')
      .update({ [field]: value })
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

  const teamEmojis = ['⚪', '⚫', '🟡', '🔵', '🟣', '🟠']
  const getTeamEmoji = (teamName) => {
    const idx = teams.findIndex(t => t.name === teamName)
    return teamEmojis[idx] || '⚽'
  }

  function getMatchupResults() {
    if (matches.length < 6) return []

    const pairs = []
    const used = new Set()

    for (let i = 0; i < matches.length; i++) {
      if (used.has(i)) continue
      for (let j = i + 1; j < matches.length; j++) {
        if (used.has(j)) continue
        const a = matches[i]
        const b = matches[j]

        const sameMatchup =
          (a.team_a === b.team_a && a.team_b === b.team_b) ||
          (a.team_a === b.team_b && a.team_b === b.team_a)

        if (sameMatchup && a.half !== b.half) {
          const first = a.half === '전반' ? a : b
          const second = a.half === '전반' ? b : a

          let totalA, totalB
          if (first.team_a === second.team_a) {
            totalA = first.score_a + second.score_a
            totalB = first.score_b + second.score_b
          } else {
            totalA = first.score_a + second.score_b
            totalB = first.score_b + second.score_a
          }

          let result = '무'
          if (totalA > totalB) result = first.team_a
          if (totalB > totalA) result = first.team_b

          pairs.push({
            teamA: first.team_a,
            teamB: first.team_b,
            firstHalf: `${first.score_a} : ${first.score_b}`,
            secondHalf: first.team_a === second.team_a
              ? `${second.score_a} : ${second.score_b}`
              : `${second.score_b} : ${second.score_a}`,
            total: `${totalA} : ${totalB}`,
            totalA,
            totalB,
            result,
          })

          used.add(i)
          used.add(j)
          break
        }
      }
    }

    return pairs
  }

  const matchupResults = getMatchupResults()

  const allTeamNames = [...new Set([
    ...teams.map(t => t.name),
    ...matches.map(m => m.team_a),
    ...matches.map(m => m.team_b),
  ])]

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <h1 className="text-3xl font-bold text-white">⚽ 경기순서&결과</h1>
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
          <p className="text-slate-400 text-sm mb-2">6경기 (1Q ~ 6Q)가 자동 생성됩니다.</p>
          <p className="text-slate-500 text-xs mb-4">생성 후 팀명을 수동으로 변경할 수 있어요.</p>

          <div className="bg-slate-700/50 rounded-lg p-3 mb-4 text-sm text-slate-300">
            <p>1등({teams[0]?.name}): 2,3,5,6쿼터</p>
            <p>2등({teams[1]?.name}): 1,2,4,5쿼터</p>
            <p>3등({teams[2]?.name}): 1,3,4,6쿼터</p>
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
              const colorA = getTeamColor(match.team_a)
              const colorB = getTeamColor(match.team_b)

              return (
                <div key={match.id} className="bg-slate-800 rounded-xl border border-slate-700 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-emerald-400 text-sm font-bold">{match.match_number}Q</span>
                  </div>

                  {/* 팀 이름 수정 + 스코어 */}
                  <div className="flex items-center justify-center gap-3 mb-2">
                    <div className="text-center flex-1">
                      <select
                        value={match.team_a}
                        onChange={(e) => updateTeamName(match.id, 'team_a', e.target.value)}
                        className="bg-slate-700 border border-slate-600 rounded-lg px-2 py-1 text-lg font-extrabold focus:outline-none focus:border-emerald-500 text-center"
                        style={{ color: colorA }}
                      >
                        {allTeamNames.map(name => (
                          <option key={name} value={name} style={{ color: '#fff' }}>{name}</option>
                        ))}
                      </select>
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
                      <select
                        value={match.team_b}
                        onChange={(e) => updateTeamName(match.id, 'team_b', e.target.value)}
                        className="bg-slate-700 border border-slate-600 rounded-lg px-2 py-1 text-lg font-extrabold focus:outline-none focus:border-emerald-500 text-center"
                        style={{ color: colorB }}
                      >
                        {allTeamNames.map(name => (
                          <option key={name} value={name} style={{ color: '#fff' }}>{name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* 골 기록 - 왼쪽팀 골은 가운데(오른쪽 정렬)로 모이게 */}
                  <div className="grid grid-cols-2 gap-4">
                    {/* 왼쪽 팀 골 - 오른쪽 정렬 (가운데 쪽으로) */}
                    <div className="flex flex-col items-end">
                      <p className="text-xs mb-2" style={{ color: colorA }}>⚽ {match.team_a} 골</p>
                      {goalsA.map(g => (
                        <div key={g.id} className="flex items-center justify-end gap-2 bg-slate-700/50 rounded px-2 py-1 mb-1 w-full">
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
                        className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-xs mt-1 focus:outline-none focus:border-emerald-500 text-right"
                      >
                        <option value="">+ 골 추가 (전체 선수)</option>
                        {players.map(p => (
                          <option key={p.id} value={p.id}>{p.name} {p.current_team ? `(${p.current_team})` : ''}</option>
                        ))}
                      </select>
                    </div>
                    {/* 오른쪽 팀 골 - 왼쪽 정렬 (가운데 쪽으로) */}
                    <div className="flex flex-col items-start">
                      <p className="text-xs mb-2" style={{ color: colorB }}>⚽ {match.team_b} 골</p>
                      {goalsB.map(g => (
                        <div key={g.id} className="flex items-center justify-start gap-2 bg-slate-700/50 rounded px-2 py-1 mb-1 w-full">
                          <button onClick={() => removeGoal(g.id)} className="text-red-400 text-xs">✕</button>
                          <span className="text-white text-xs">{g.player_name}</span>
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
                        <option value="">+ 골 추가 (전체 선수)</option>
                        {players.map(p => (
                          <option key={p.id} value={p.id}>{p.name} {p.current_team ? `(${p.current_team})` : ''}</option>
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
              <h2 className="text-lg font-bold text-white mb-4">📊 합산 결과</h2>
              <div className="space-y-4">
                {matchupResults.map((r, idx) => {
                  const colorA = getTeamColor(r.teamA)
                  const colorB = getTeamColor(r.teamB)
                  return (
                    <div key={idx} className="bg-slate-700/30 rounded-xl p-4">
                      <div className="flex items-center justify-center gap-6">
                        <div className="text-center flex-1">
                          <p className="font-extrabold text-xl" style={{ color: colorA, opacity: r.result === r.teamB ? 0.5 : 1 }}>
                            {r.teamA}
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-white text-2xl font-bold">{r.total}</p>
                        </div>
                        <div className="text-center flex-1">
                          <p className="font-extrabold text-xl" style={{ color: colorB, opacity: r.result === r.teamA ? 0.5 : 1 }}>
                            {r.teamB}
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
                  )
                })}
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