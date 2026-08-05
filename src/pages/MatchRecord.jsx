import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

// 🎯 라운드 기준점: 이 날짜가 (13, 14)라운드
const ANCHOR_DATE = '2026-08-08'
const ANCHOR_FIRST_ROUND = 13 // 그 날의 첫 라운드 (두 번째는 +1)

function MatchRecord() {
  const { role } = useAuth()
  // ✅ 수정 권한: 관리자·임원·주장(부주장)만. 정회원(member)은 열람만 가능(읽기 전용)
  const canEdit = role === 'admin' || role === 'executive' || role === 'captain'

  const [teams, setTeams] = useState([])
  const [players, setPlayers] = useState([])
  const [matches, setMatches] = useState([])
  const [goals, setGoals] = useState([])
  const [selectedDate, setSelectedDate] = useState(
    new Date(new Date().getTime() + 9 * 60 * 60 * 1000).toISOString().split('T')[0]
  )
  const [loading, setLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)

  // 📅 스케쥴(구장/시간) + 라운드 정보
  const [dayInfo, setDayInfo] = useState({ venue: '', time: '', rounds: null })

  // 📅 날짜 입력 참조
  const dateInputRef = useRef(null)

  useEffect(() => {
    fetchTeams()
    fetchPlayers()
  }, [])

  useEffect(() => {
    if (selectedDate) {
      fetchMatches(selectedDate)
      fetchGoals(selectedDate)
      fetchDayInfo(selectedDate)
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

  // 📅 그 날의 장소/시간(스케쥴) + 라운드 계산
  async function fetchDayInfo(date) {
    const { data: resList } = await supabase
      .from('reservations')
      .select('*')
      .eq('date', date)
      .order('is_confirmed', { ascending: false })
      .order('sort_order', { ascending: true })

    let venue = ''
    let time = ''
    if (resList && resList.length > 0) {
      const confirmed = resList.find(r => r.is_confirmed) || resList[0]
      venue = confirmed.venue || ''
      time = confirmed.time || ''
    }

    const rounds = await calcRounds(date)
    setDayInfo({ venue, time, rounds })
  }

  // 🔢 라운드 자동 계산 (경기일 1일 = 2라운드, ANCHOR_DATE = 13·14 고정)
  async function calcRounds(date) {
    const { data } = await supabase
      .from('matches')
      .select('game_date')

    const dates = [...new Set((data || []).map(d => d.game_date))]
    if (!dates.includes(ANCHOR_DATE)) dates.push(ANCHOR_DATE)
    if (!dates.includes(date)) dates.push(date)
    dates.sort()

    const anchorIdx = dates.indexOf(ANCHOR_DATE)
    const targetIdx = dates.indexOf(date)
    if (anchorIdx === -1 || targetIdx === -1) return null

    const offset = targetIdx - anchorIdx
    const first = ANCHOR_FIRST_ROUND + offset * 2
    const second = first + 1
    if (first <= 0) return null
    return { first, second }
  }

  // 🏆 이전까지의 누적 순위 계산 (오늘 날짜 제외)
  async function getPreviousStandings() {
    const { data: allMatches } = await supabase
      .from('matches')
      .select('*')
      .neq('game_date', selectedDate)
      .order('game_date', { ascending: false })

    const pastMatches = allMatches || []
    const dates = [...new Set(pastMatches.map(m => m.game_date))]

    const allMatchups = []
    for (const date of dates) {
      const dayMatches = pastMatches
        .filter(m => m.game_date === date)
        .sort((a, b) => a.match_number - b.match_number)

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

          allMatchups.push({ teamA, teamB, totalA, totalB })
        }
      }
    }

    const standings = {}
    for (const team of teams) {
      standings[team.name] = {
        name: team.name,
        points: 0,
        goalsFor: 0,
        goalsAgainst: 0,
      }
    }

    for (const m of allMatchups) {
      if (!standings[m.teamA] || !standings[m.teamB]) continue
      standings[m.teamA].goalsFor += m.totalA
      standings[m.teamA].goalsAgainst += m.totalB
      standings[m.teamB].goalsFor += m.totalB
      standings[m.teamB].goalsAgainst += m.totalA
      if (m.totalA > m.totalB) {
        standings[m.teamA].points += 3
      } else if (m.totalA < m.totalB) {
        standings[m.teamB].points += 3
      } else {
        standings[m.teamA].points += 1
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

  async function createDayMatches() {
    if (!canEdit) return
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

    const standings = await getPreviousStandings()

    let rankedTeams
    const hasHistory = standings.some(s => s.points > 0 || s.goalsFor > 0)

    if (hasHistory) {
      rankedTeams = standings.map(s => s.name).slice(0, 3)
    } else {
      rankedTeams = teams.map(t => t.name).slice(0, 3)
    }

    const [first, second, third] = rankedTeams

    const dayMatches = [
      { match_number: 1, half: '전반', team_a: second, team_b: third },
      { match_number: 2, half: '전반', team_a: first, team_b: second },
      { match_number: 3, half: '전반', team_a: first, team_b: third },
      { match_number: 4, half: '후반', team_a: second, team_b: third },
      { match_number: 5, half: '후반', team_a: first, team_b: second },
      { match_number: 6, half: '후반', team_a: first, team_b: third },
    ]

    for (const m of dayMatches) {
      await supabase.from('matches').insert({
        game_date: selectedDate,
        score_a: 0,
        score_b: 0,
        ...m,
      })
    }

    setShowCreate(false)
    setLoading(false)
    fetchMatches(selectedDate)
    fetchDayInfo(selectedDate)
    alert(
      hasHistory
        ? `순위 기반으로 6경기가 생성되었습니다!\n🥇${first} 🥈${second} 🥉${third}`
        : '6경기가 생성되었습니다! (과거 기록이 없어 기본 순서로 배정)'
    )
  }

  // 🔄 골 개수로 matches 점수 컬럼 동기화
  async function syncMatchScore(matchId) {
    const { data: gs } = await supabase
      .from('goals')
      .select('*')
      .eq('match_id', matchId)

    const { data: mArr } = await supabase
      .from('matches')
      .select('*')
      .eq('id', matchId)
      .limit(1)

    const match = mArr && mArr[0]
    if (!match) return

    const list = gs || []
    const scoreA = list.filter(g => g.team === match.team_a).length
    const scoreB = list.filter(g => g.team === match.team_b).length

    await supabase
      .from('matches')
      .update({ score_a: scoreA, score_b: scoreB })
      .eq('id', matchId)
  }

  async function updateTeamName(matchId, field, value) {
    if (!canEdit) return
    await supabase
      .from('matches')
      .update({ [field]: value })
      .eq('id', matchId)
    await syncMatchScore(matchId)
    fetchMatches(selectedDate)
    fetchGoals(selectedDate)
  }

  async function addGoal(matchId, playerId, playerName, team) {
    if (!canEdit) return
    await supabase.from('goals').insert({
      match_id: matchId,
      game_date: selectedDate,
      player_id: playerId,
      player_name: playerName,
      team: team,
    })
    await syncMatchScore(matchId)
    fetchMatches(selectedDate)
    fetchGoals(selectedDate)
  }

  // 🥅🎯 특수 골(자책골/PK) 추가
  async function addSpecialGoal(match, field, goalType) {
    if (!canEdit) return
    const team = field === 'score_a' ? match.team_a : match.team_b

    await supabase.from('goals').insert({
      match_id: match.id,
      game_date: selectedDate,
      player_id: null,
      player_name: goalType,
      team: team,
    })

    await syncMatchScore(match.id)
    fetchMatches(selectedDate)
    fetchGoals(selectedDate)
  }

  // 통합 드롭다운 처리: 선수골 / PK / 자책골
  function handleGoalSelect(match, field, value) {
    if (!value) return
    if (value === '__PK__') {
      addSpecialGoal(match, field, 'PK(핸디캡)')
    } else if (value === '__OG__') {
      addSpecialGoal(match, field, '자책골')
    } else {
      const p = players.find(p => p.id === value)
      const team = field === 'score_a' ? match.team_a : match.team_b
      if (p) addGoal(match.id, p.id, p.name, team)
    }
  }

  async function removeGoal(goalId) {
    if (!canEdit) return
    const g = goals.find(x => x.id === goalId)
    await supabase.from('goals').delete().eq('id', goalId)

    if (g) {
      await syncMatchScore(g.match_id)
    }

    fetchMatches(selectedDate)
    fetchGoals(selectedDate)
  }

  async function deleteDay() {
    if (!canEdit) return
    if (!window.confirm(`${selectedDate} 경기 기록을 전부 삭제하시겠습니까?`)) return

    for (const m of matches) {
      await supabase.from('matches').delete().eq('id', m.id)
    }

    fetchMatches(selectedDate)
    fetchGoals(selectedDate)
    fetchDayInfo(selectedDate)
    alert('삭제되었습니다.')
  }

  // 🎨 팀 색상 가져오기 (파랑은 밝은 파랑으로 변환)
  function getTeamColor(teamName) {
    const team = teams.find(t => t.name === teamName)
    const color = team?.color || '#ffffff'
    const c = color.toLowerCase()
    if (c === '#1d4ed8' || c === '#2563eb' || c === '#1e40af' || c === '#1e3a8a') {
      return '#60a5fa'
    }
    return color
  }

  // 특수 골 표시용 라벨
  function goalLabel(g) {
    if (g.player_name === '자책골') return '🥅 자책골'
    if (g.player_name === 'PK(핸디캡)' || g.player_name === 'PK') return '🎯 PK(핸디캡)'
    return `⚽ ${g.player_name}`
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

  // 날짜 표기 (2026. 08. 04.)
  function formatDate(d) {
    if (!d) return ''
    const [y, m, day] = d.split('-')
    return `${y}. ${m}. ${day}.`
  }

  // 📅 버튼 클릭 → 달력 열기 (사용자 제스처 안에서 showPicker 호출)
  function openDatePicker() {
    const el = dateInputRef.current
    if (!el) return
    try {
      if (typeof el.showPicker === 'function') {
        el.showPicker()
        return
      }
    } catch (e) {
      // 폴백
    }
    el.focus()
    el.click()
  }

  // 득점 영역 (한 팀) 렌더링 - 태그 + 통합 드롭다운
  function GoalArea({ match, field, teamGoals, align }) {
    const isRight = align === 'right'
    return (
      <div className={`flex flex-col ${isRight ? 'items-end' : 'items-start'}`}>
        <div className={`flex flex-wrap gap-1 ${isRight ? 'justify-end' : 'justify-start'} mb-1.5 min-h-[20px]`}>
          {teamGoals.length === 0 && (
            <span className="text-slate-600 text-[11px]">득점 없음</span>
          )}
          {teamGoals.map(g => (
            <span
              key={g.id}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${
                g.player_id ? 'bg-slate-700/60 text-white' : 'bg-amber-500/20 text-amber-200'
              }`}
            >
              {goalLabel(g)}
              {canEdit && (
                <button onClick={() => removeGoal(g.id)} className="text-red-400 hover:text-red-300 leading-none">✕</button>
              )}
            </span>
          ))}
        </div>
        {canEdit && (
          <select
            value=""
            onChange={(e) => { handleGoalSelect(match, field, e.target.value); e.target.value = '' }}
            className={`w-full bg-slate-800/70 border border-slate-600 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-emerald-500 ${isRight ? 'text-right' : ''}`}
          >
            <option value="">+ 득점 추가</option>
            <option value="__PK__">🎯 PK(핸디캡)</option>
            <option value="__OG__">🥅 자책골</option>
            {players.map(p => (
              <option key={p.id} value={p.id}>{p.name} {p.current_team ? `(${p.current_team})` : ''}</option>
            ))}
          </select>
        )}
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-white">⚽ 경기순서 & 결과</h1>
      </div>

      {/* 🔒 읽기 전용 안내 (정회원) */}
      {!canEdit && (
        <div className="bg-sky-500/10 border border-sky-500/30 rounded-xl px-4 py-3 mb-6 text-sky-200 text-sm">
          👀 열람 전용 화면입니다. 경기 기록 수정은 관리자·임원·주장만 가능합니다.
        </div>
      )}

      {/* 날짜 선택 + 오늘 경기 생성 버튼 */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-4 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* 📅 날짜 선택: 버튼 클릭 시 showPicker() 호출 (input은 겹치지 않고 숨김) */}
          <button
            type="button"
            onClick={openDatePicker}
            className="flex items-center gap-2 bg-slate-900 hover:bg-slate-700 border border-slate-600 text-white px-5 py-2 rounded-xl font-semibold transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
            <span className="text-emerald-400 font-bold leading-none">{formatDate(selectedDate)}</span>
            <span className="text-slate-400 text-xs">▾</span>
          </button>

          {/* 실제 날짜 입력 (버튼과 겹치지 않게 화면에서 숨김. showPicker 대상) */}
          <input
            ref={dateInputRef}
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            aria-hidden="true"
            tabIndex={-1}
            style={{
              position: 'absolute',
              width: '1px',
              height: '1px',
              padding: 0,
              margin: '-1px',
              overflow: 'hidden',
              clip: 'rect(0 0 0 0)',
              whiteSpace: 'nowrap',
              border: 0,
              colorScheme: 'dark',
            }}
          />

          {/* 오늘 경기 생성 버튼 */}
          {canEdit && matches.length === 0 && (
            <button
              onClick={() => setShowCreate(true)}
              className="bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2 rounded-xl font-semibold transition-colors shadow-lg shadow-emerald-500/20"
            >
              + 오늘 경기 생성
            </button>
          )}
        </div>
      </div>

      {/* 📍 경기 정보 (장소 / 시간 / 라운드) — 경기가 있는 날만 표시 */}
      {matches.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-6">
          {dayInfo.rounds && (
            <span className="inline-flex items-center gap-1 bg-emerald-500/15 text-emerald-300 text-sm font-bold px-3 py-1.5 rounded-lg border border-emerald-500/30">
              🏆 {dayInfo.rounds.first}·{dayInfo.rounds.second} 라운드
            </span>
          )}
          {dayInfo.time && (
            <span className="inline-flex items-center gap-1 bg-slate-700/60 text-slate-100 text-sm font-medium px-3 py-1.5 rounded-lg">
              ⏰ {dayInfo.time}
            </span>
          )}
          {dayInfo.venue && (
            <span className="inline-flex items-center gap-1 bg-slate-700/60 text-slate-100 text-sm font-medium px-3 py-1.5 rounded-lg">
              📍 {dayInfo.venue}
            </span>
          )}
        </div>
      )}

      {/* 경기 생성 모달 */}
      {canEdit && showCreate && (
        <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700 mb-6">
          <h2 className="text-lg font-bold text-white mb-3">📅 {selectedDate} 경기 생성</h2>
          <p className="text-slate-400 text-sm mb-2">6경기 (1Q ~ 6Q)가 자동 생성됩니다.</p>
          <p className="text-slate-500 text-xs mb-4">
            📊 이전 순위표를 기반으로 팀이 자동 배정됩니다.
          </p>

          <div className="bg-slate-700/50 rounded-lg p-3 mb-4 text-sm text-slate-300 space-y-1">
            <p>🥇 1위: 2,3,5,6쿼터</p>
            <p>🥈 2위: 1,2,4,5쿼터</p>
            <p>🥉 3위: 1,3,4,6쿼터</p>
          </div>

          <div className="flex gap-4">
            <button
              onClick={createDayMatches}
              disabled={loading}
              className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-xl font-semibold transition-colors disabled:opacity-50"
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
          {canEdit && <p className="mt-2">"오늘 경기 생성" 버튼을 눌러주세요</p>}
        </div>
      ) : (
        <>
          {/* 개별 경기 스코어 */}
          <div className="space-y-3 mb-8">
            {matches.map(match => {
              const matchGoals = goals.filter(g => g.match_id === match.id)
              const goalsA = matchGoals.filter(g => g.team === match.team_a)
              const goalsB = matchGoals.filter(g => g.team === match.team_b)
              const scoreA = goalsA.length
              const scoreB = goalsB.length
              const colorA = getTeamColor(match.team_a)
              const colorB = getTeamColor(match.team_b)
              const aWin = scoreA > scoreB
              const bWin = scoreB > scoreA

              return (
                <div
                  key={match.id}
                  className="rounded-2xl border border-slate-700 overflow-hidden"
                  style={{
                    background: `linear-gradient(135deg, ${colorA}12 0%, rgba(15,23,42,0.6) 40%, rgba(15,23,42,0.6) 60%, ${colorB}12 100%)`,
                  }}
                >
                  {/* 쿼터 라벨 */}
                  <div className="flex items-center justify-center py-1 bg-slate-900/50 border-b border-slate-700/50">
                    <span className="text-emerald-400 text-xs font-extrabold tracking-wide">
                      {match.match_number}Q
                    </span>
                  </div>

                  <div className="p-3">
                    {/* 팀 이름 + 스코어 */}
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 mb-3">
                      {/* 팀 A */}
                      <div className="text-center">
                        {canEdit ? (
                          <select
                            value={match.team_a}
                            onChange={(e) => updateTeamName(match.id, 'team_a', e.target.value)}
                            className="bg-slate-800/80 border border-slate-600 rounded-lg px-2 py-1.5 text-base font-extrabold focus:outline-none focus:border-emerald-500 text-center w-full max-w-[120px]"
                            style={{ color: colorA }}
                          >
                            {allTeamNames.map(name => (
                              <option key={name} value={name} style={{ color: '#fff' }}>{name}</option>
                            ))}
                          </select>
                        ) : (
                          <p className="text-lg font-extrabold" style={{ color: colorA, opacity: bWin ? 0.55 : 1 }}>
                            {match.team_a}
                          </p>
                        )}
                      </div>

                      {/* 스코어 (골 개수) */}
                      <div className="flex items-center gap-3">
                        <span
                          className="text-3xl font-black tabular-nums leading-none w-7 text-center"
                          style={{ color: aWin ? '#fef08a' : '#ffffff' }}
                        >
                          {scoreA}
                        </span>
                        <span className="text-slate-500 text-xl font-bold">:</span>
                        <span
                          className="text-3xl font-black tabular-nums leading-none w-7 text-center"
                          style={{ color: bWin ? '#fef08a' : '#ffffff' }}
                        >
                          {scoreB}
                        </span>
                      </div>

                      {/* 팀 B */}
                      <div className="text-center">
                        {canEdit ? (
                          <select
                            value={match.team_b}
                            onChange={(e) => updateTeamName(match.id, 'team_b', e.target.value)}
                            className="bg-slate-800/80 border border-slate-600 rounded-lg px-2 py-1.5 text-base font-extrabold focus:outline-none focus:border-emerald-500 text-center w-full max-w-[120px]"
                            style={{ color: colorB }}
                          >
                            {allTeamNames.map(name => (
                              <option key={name} value={name} style={{ color: '#fff' }}>{name}</option>
                            ))}
                          </select>
                        ) : (
                          <p className="text-lg font-extrabold" style={{ color: colorB, opacity: aWin ? 0.55 : 1 }}>
                            {match.team_b}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* 골 기록 */}
                    <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-700/40">
                      <GoalArea match={match} field="score_a" teamGoals={goalsA} align="right" />
                      <GoalArea match={match} field="score_b" teamGoals={goalsB} align="left" />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* 합산 결과 */}
          {matchupResults.length > 0 && (
            <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 mb-6">
              <h2 className="text-lg font-bold text-white mb-4">📊 합산 결과</h2>
              <div className="space-y-3">
                {matchupResults.map((r, idx) => {
                  const colorA = getTeamColor(r.teamA)
                  const colorB = getTeamColor(r.teamB)
                  const isDraw = r.result === '무'
                  return (
                    <div
                      key={idx}
                      className="rounded-xl p-4 border border-slate-700/50"
                      style={{
                        background: `linear-gradient(135deg, ${colorA}15 0%, rgba(15,23,42,0.5) 45%, rgba(15,23,42,0.5) 55%, ${colorB}15 100%)`,
                      }}
                    >
                      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
                        <div className="text-center">
                          <p className="font-extrabold text-lg" style={{ color: colorA, opacity: r.result === r.teamB ? 0.45 : 1 }}>
                            {r.teamA}
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-white text-2xl font-black tabular-nums">{r.total}</p>
                        </div>
                        <div className="text-center">
                          <p className="font-extrabold text-lg" style={{ color: colorB, opacity: r.result === r.teamA ? 0.45 : 1 }}>
                            {r.teamB}
                          </p>
                        </div>
                      </div>
                      <div className="text-center mt-2">
                        {isDraw ? (
                          <span className="bg-yellow-500/20 text-yellow-400 px-3 py-1 rounded-full text-xs font-semibold">무승부</span>
                        ) : (
                          <span className="bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full text-xs font-semibold">🏆 {r.result} 승!</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* 🔒 삭제 버튼 */}
          {canEdit && (
            <div className="text-right">
              <button
                onClick={deleteDay}
                className="bg-red-500/10 hover:bg-red-500/20 text-red-400 px-4 py-2 rounded-lg text-sm transition-colors"
              >
                🗑️ 이 날 경기 전체 삭제
              </button>
            </div>
          )}
        </>
      )}

      {/* ⬇️ 하단 여백 */}
      <div style={{ height: '40px', width: '100%' }} aria-hidden="true"></div>
    </div>
  )
}

export default MatchRecord