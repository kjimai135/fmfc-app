import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { calcRounds } from '../lib/rounds'

// ✅ 월요일 시작 요일 라벨
const WEEK_LABELS = ['월', '화', '수', '목', '금', '토', '일']

// 🏆 챔스 강조색 (진한 황금색)
const CHAMPS_COLOR = '#f59e0b'

// YYYY-MM-DD (로컬 기준)
function toKey(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

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

  // 🏆 경기 생성 시 챔스 경기 여부
  const [createAsChamps, setCreateAsChamps] = useState(false)

  // ⭐ 챔스 MVP 저장 중 표시
  const [savingMvp, setSavingMvp] = useState(false)

  // 🗓️ 현재 시즌 (app_settings.season_label)
  const [currentSeason, setCurrentSeason] = useState('')

  // 📅 스케쥴(구장/시간) + 라운드 정보
  const [dayInfo, setDayInfo] = useState({ venue: '', time: '', rounds: null })

  // 📅 커스텀 달력 팝오버
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerYM, setPickerYM] = useState(() => {
    const [y, m] = new Date(new Date().getTime() + 9 * 60 * 60 * 1000)
      .toISOString().split('T')[0].split('-').map(Number)
    return { year: y, month: m } // month: 1~12
  })
  const pickerRef = useRef(null)

  useEffect(() => {
    fetchTeams()
    fetchPlayers()
    fetchCurrentSeason()
  }, [])

  useEffect(() => {
    if (selectedDate) {
      fetchMatches(selectedDate)
      fetchGoals(selectedDate)
      fetchDayInfo(selectedDate)
    }
  }, [selectedDate])

  // 팝오버 바깥 클릭 시 닫기
  useEffect(() => {
    function onClickOutside(e) {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setPickerOpen(false)
      }
    }
    if (pickerOpen) document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [pickerOpen])

  async function fetchCurrentSeason() {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'season_label')
      .single()
    if (data?.value) setCurrentSeason(data.value)
  }

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

  // 🏆 이전까지의 누적 순위 계산 (오늘 날짜 제외, 챔스 경기 제외)
  async function getPreviousStandings() {
    const { data: allMatches } = await supabase
      .from('matches')
      .select('*')
      .neq('game_date', selectedDate)
      .order('game_date', { ascending: false })

    // 챔스 경기는 리그 순위에서 제외
    const pastMatches = (allMatches || []).filter(m => !m.is_champions)
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
        season: currentSeason || null,
        is_champions: createAsChamps, // 🏆 챔스 여부
        ...m,
      })
    }

    setShowCreate(false)
    setCreateAsChamps(false)
    setLoading(false)
    fetchMatches(selectedDate)
    fetchDayInfo(selectedDate)
    alert(
      (createAsChamps ? '🏆 챔스 경기로 생성되었습니다!\n(라운드 계산에서 제외됩니다)\n' : '') +
      (hasHistory
        ? `순위 기반으로 6경기가 생성되었습니다!\n🥇${first} 🥈${second} 🥉${third}`
        : '6경기가 생성되었습니다! (과거 기록이 없어 기본 순서로 배정)')
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
    const match = matches.find(m => m.id === matchId)
    const seasonVal = match?.season || currentSeason || null

    await supabase.from('goals').insert({
      match_id: matchId,
      game_date: selectedDate,
      player_id: playerId,
      player_name: playerName,
      team: team,
      season: seasonVal,
    })
    await syncMatchScore(matchId)
    fetchMatches(selectedDate)
    fetchGoals(selectedDate)
  }

  // 🥅🎯 특수 골(자책골/PK) 추가
  async function addSpecialGoal(match, field, goalType) {
    if (!canEdit) return
    const team = field === 'score_a' ? match.team_a : match.team_b
    const seasonVal = match?.season || currentSeason || null

    await supabase.from('goals').insert({
      match_id: match.id,
      game_date: selectedDate,
      player_id: null,
      player_name: goalType,
      team: team,
      season: seasonVal,
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

  // ⭐ 챔스 MVP 저장 (그 날의 모든 matches row에 동일하게 기록)
  async function saveChampsMvp(mvpName) {
    if (!canEdit) return
    setSavingMvp(true)
    await supabase
      .from('matches')
      .update({ champs_mvp: mvpName || null })
      .eq('game_date', selectedDate)
    await fetchMatches(selectedDate)
    setSavingMvp(false)
  }

  // 🗑️ 이 날 경기 전체 삭제 — 2단계 재확인
  async function deleteDay() {
    if (!canEdit) return
    const count = matches.length
    if (!window.confirm(`⚠️ ${selectedDate} 경기 기록 ${count}건을 전부 삭제하시겠습니까?\n(골 기록 포함 · 복구할 수 없습니다!)`)) return
    if (!window.confirm(`정말 삭제하시겠습니까?\n${selectedDate} · 총 ${count}경기가 영구 삭제됩니다.`)) return

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

  // 합산 결과 계산 (리그용 — 전+후반 합산 3매치업)
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

  // 🏆 이 날이 챔스 경기인지
  const isChampsDay = matches.length > 0 && matches.some(m => m.is_champions)

  // 🏆 챔스 순위 테이블 (개별 6경기 각각 승무패로 집계)
  function getChampsStandings() {
    const standings = {}
    function ensure(name) {
      if (!standings[name]) {
        standings[name] = {
          name,
          played: 0, wins: 0, draws: 0, losses: 0,
          goalsFor: 0, goalsAgainst: 0, points: 0,
        }
      }
    }

    for (const m of matches) {
      const a = m.team_a
      const b = m.team_b
      if (!a || !b) continue
      ensure(a)
      ensure(b)
      const sa = m.score_a || 0
      const sb = m.score_b || 0
      standings[a].played++
      standings[b].played++
      standings[a].goalsFor += sa
      standings[a].goalsAgainst += sb
      standings[b].goalsFor += sb
      standings[b].goalsAgainst += sa
      if (sa > sb) {
        standings[a].wins++
        standings[a].points += 3
        standings[b].losses++
      } else if (sa < sb) {
        standings[b].wins++
        standings[b].points += 3
        standings[a].losses++
      } else {
        standings[a].draws++
        standings[b].draws++
        standings[a].points += 1
        standings[b].points += 1
      }
    }

    return Object.values(standings).sort((x, y) => {
      if (y.points !== x.points) return y.points - x.points
      const gdX = x.goalsFor - x.goalsAgainst
      const gdY = y.goalsFor - y.goalsAgainst
      if (gdY !== gdX) return gdY - gdX
      return y.goalsFor - x.goalsFor
    })
  }

  // 🏆 챔스 순위 & 우승팀 (개별 6경기 기준)
  const champsStandings = isChampsDay ? getChampsStandings() : []
  const champsWinner =
    isChampsDay && champsStandings.length > 0 && champsStandings[0].played > 0
      ? champsStandings[0]
      : null

  // ⭐ 현재 저장된 챔스 MVP
  const currentMvp = matches.find(m => m.champs_mvp)?.champs_mvp || ''

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

  // 📅 커스텀 달력 열기 (현재 선택 날짜의 연/월로 맞춤)
  function openPicker() {
    const [y, m] = selectedDate.split('-').map(Number)
    setPickerYM({ year: y, month: m })
    setPickerOpen(v => !v)
  }

  // 📅 달력 그리드용 날짜 배열 (✅ 월요일 시작, 6주)
  function buildCalendar(year, month) {
    const first = new Date(year, month - 1, 1)
    const startOffset = (first.getDay() + 6) % 7
    const start = new Date(year, month - 1, 1 - startOffset)
    const cells = []
    const cur = new Date(start)
    for (let i = 0; i < 42; i++) {
      cells.push(new Date(cur))
      cur.setDate(cur.getDate() + 1)
    }
    return cells
  }

  function prevMonth() {
    setPickerYM(({ year, month }) => month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 })
  }
  function nextMonth() {
    setPickerYM(({ year, month }) => month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 })
  }
  function pickDate(d) {
    setSelectedDate(toKey(d))
    setPickerOpen(false)
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

  const calendarCells = buildCalendar(pickerYM.year, pickerYM.month)
  const todayKey = toKey(new Date(new Date().getTime() + 9 * 60 * 60 * 1000))
  const activePlayers = players.filter(p => p.is_active !== false)

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-white">⚽ 경기생성 및 기록</h1>
        {currentSeason && (
          <p className="text-slate-400 text-sm mt-1">🗓️ 현재 시즌: <span className="text-emerald-400 font-semibold">{currentSeason}</span></p>
        )}
      </div>

      {/* 🔒 읽기 전용 안내 (정회원) */}
      {!canEdit && (
        <div className="bg-sky-500/10 border border-sky-500/30 rounded-xl px-4 py-3 mb-6 text-sky-200 text-sm">
          👀 열람 전용 화면입니다. 경기 기록 수정은 관리자·임원·주장만 가능합니다.
        </div>
      )}

      {/* 날짜 선택(커스텀 달력) + 오늘 경기 생성 버튼 */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-4 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* 📅 날짜 선택 버튼 + 커스텀 달력 팝오버 */}
          <div className="relative" ref={pickerRef}>
            <button
              type="button"
              onClick={openPicker}
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

            {pickerOpen && (
              <div
                className="absolute left-0 mt-2 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl p-3"
                style={{ zIndex: 60, width: '300px' }}
              >
                {/* 연/월 이동 */}
                <div className="flex items-center justify-between mb-2">
                  <button
                    type="button"
                    onClick={prevMonth}
                    className="text-slate-300 hover:text-white px-3 py-1.5 rounded-lg hover:bg-slate-700"
                  >◀</button>
                  <span className="text-white font-bold">
                    {pickerYM.year}년 {pickerYM.month}월
                  </span>
                  <button
                    type="button"
                    onClick={nextMonth}
                    className="text-slate-300 hover:text-white px-3 py-1.5 rounded-lg hover:bg-slate-700"
                  >▶</button>
                </div>

                {/* 요일 헤더 (월~일) */}
                <div className="grid grid-cols-7 mb-1">
                  {WEEK_LABELS.map((w, i) => (
                    <div
                      key={w}
                      className="text-center text-[11px] font-bold py-1"
                      style={{ color: i === 6 ? '#f87171' : i === 5 ? '#60a5fa' : '#94a3b8' }}
                    >
                      {w}
                    </div>
                  ))}
                </div>

                {/* 날짜 그리드 */}
                <div className="grid grid-cols-7 gap-1">
                  {calendarCells.map((d, idx) => {
                    const key = toKey(d)
                    const inMonth = d.getMonth() === pickerYM.month - 1
                    const isSelected = key === selectedDate
                    const isToday = key === todayKey
                    const dow = d.getDay()
                    let color = '#e2e8f0'
                    if (dow === 0) color = '#f87171'
                    else if (dow === 6) color = '#60a5fa'
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => pickDate(d)}
                        className="aspect-square rounded-lg text-sm font-medium flex items-center justify-center transition-colors"
                        style={{
                          background: isSelected ? '#10b981' : isToday ? 'rgba(16,185,129,0.18)' : 'transparent',
                          color: isSelected ? '#ffffff' : color,
                          opacity: inMonth ? 1 : 0.35,
                          fontWeight: isToday || isSelected ? 800 : 500,
                        }}
                      >
                        {d.getDate()}
                      </button>
                    )
                  })}
                </div>

                {/* 오늘로 이동 */}
                <button
                  type="button"
                  onClick={() => pickDate(new Date(new Date().getTime() + 9 * 60 * 60 * 1000))}
                  className="w-full mt-2 bg-slate-700 hover:bg-slate-600 text-emerald-300 text-sm font-semibold py-2 rounded-lg"
                >
                  📍 오늘로 이동
                </button>
              </div>
            )}
          </div>

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

      {/* 📍 경기 정보 (장소 / 시간 / 라운드 / 챔스 배지) — 경기가 있는 날만 표시 */}
      {matches.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-6">
          {isChampsDay && (
            <span
              className="inline-flex items-center gap-1 text-sm font-bold px-3 py-1.5 rounded-lg border"
              style={{ background: `${CHAMPS_COLOR}22`, color: CHAMPS_COLOR, borderColor: `${CHAMPS_COLOR}66` }}
            >
              🏆 챔피언스 (챔스)
            </span>
          )}
          {dayInfo.rounds && !isChampsDay && (
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
          <p className="text-slate-500 text-xs mb-1">
            📊 이전 순위표를 기반으로 팀이 자동 배정됩니다.
          </p>
          {currentSeason && (
            <p className="text-slate-500 text-xs mb-4">🗓️ 시즌: {currentSeason} 로 기록됩니다.</p>
          )}

          <div className="bg-slate-700/50 rounded-lg p-3 mb-4 text-sm text-slate-300 space-y-1">
            <p>🥇 1위: 2,3,5,6쿼터</p>
            <p>🥈 2위: 1,2,4,5쿼터</p>
            <p>🥉 3위: 1,3,4,6쿼터</p>
          </div>

          {/* 🏆 챔스 경기 체크박스 */}
          <label
            className="flex items-start gap-3 rounded-xl border p-3 mb-4 cursor-pointer transition-colors"
            style={{
              background: createAsChamps ? `${CHAMPS_COLOR}1a` : 'rgba(51,65,85,0.4)',
              borderColor: createAsChamps ? `${CHAMPS_COLOR}66` : '#475569',
            }}
          >
            <input
              type="checkbox"
              checked={createAsChamps}
              onChange={(e) => setCreateAsChamps(e.target.checked)}
              className="mt-0.5 w-5 h-5 flex-shrink-0"
              style={{ accentColor: CHAMPS_COLOR }}
            />
            <div>
              <p className="text-white font-bold text-sm">🏆 챔피언스(챔스) 경기로 생성</p>
              <p className="text-slate-400 text-xs mt-0.5">
                체크 시 이 날의 6경기는 챔스로 기록됩니다. (리그 순위·득점왕·<b>라운드 계산</b>에서 제외 / 경기 후 MVP 선택 가능)
              </p>
            </div>
          </label>

          <div className="flex gap-4">
            <button
              onClick={createDayMatches}
              disabled={loading}
              className="flex-1 text-white py-3 rounded-xl font-semibold transition-colors disabled:opacity-50"
              style={{ background: createAsChamps ? CHAMPS_COLOR : '#10b981' }}
            >
              {loading ? '생성 중...' : createAsChamps ? '🏆 챔스 경기 생성' : '✅ 경기 생성'}
            </button>
            <button
              onClick={() => { setShowCreate(false); setCreateAsChamps(false) }}
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
          {/* 🏆 챔스 우승팀 + ⭐ MVP (챔스인 날 — 맨 위로) */}
          {isChampsDay && (
            <div
              className="rounded-2xl border p-6 mb-6"
              style={{ borderColor: `${CHAMPS_COLOR}66`, background: `${CHAMPS_COLOR}14` }}
            >
              <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">🏆 챔피언스 결과</h2>

              {/* 챔스 우승팀 */}
              <div
                className="rounded-xl p-4 mb-4 text-center border"
                style={{
                  borderColor: `${CHAMPS_COLOR}33`,
                  background: `linear-gradient(135deg, ${CHAMPS_COLOR}20 0%, rgba(15,23,42,0.6) 100%)`,
                }}
              >
                <p className="text-slate-300 text-xs mb-1">👑 챔스 우승팀 (승점 최다)</p>
                {champsWinner ? (
                  <p className="text-2xl font-extrabold" style={{ color: getTeamColor(champsWinner.name) }}>
                    {champsWinner.name}
                    <span className="text-slate-400 text-sm font-normal ml-2">({champsWinner.points}점)</span>
                  </p>
                ) : (
                  <p className="text-slate-500 text-sm">경기 결과 입력 후 표시됩니다</p>
                )}
              </div>

              {/* MVP 선택 */}
              <div>
                <label className="block text-slate-300 text-sm font-medium mb-2">⭐ 챔스 MVP (경기 후 주장 협의로 선택)</label>
                {canEdit ? (
                  <select
                    value={currentMvp}
                    onChange={(e) => saveChampsMvp(e.target.value)}
                    disabled={savingMvp}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none disabled:opacity-50"
                    style={{ borderColor: currentMvp ? CHAMPS_COLOR : '#475569' }}
                  >
                    <option value="">MVP 선택 안 함</option>
                    {activePlayers.map(p => (
                      <option key={p.id} value={p.name}>
                        {p.name}{p.current_team ? ` (${p.current_team})` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-white font-bold">{currentMvp || '-'}</p>
                )}
                {currentMvp && (
                  <p className="text-sm mt-2 font-semibold" style={{ color: CHAMPS_COLOR }}>⭐ MVP: {currentMvp}</p>
                )}
                {savingMvp && <p className="text-slate-500 text-xs mt-1">저장 중...</p>}
              </div>
            </div>
          )}

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

          {/* 📊 결과: 챔스면 순위 테이블, 리그면 합산 결과 */}
          {isChampsDay ? (
            champsStandings.length > 0 && (
              <div className="bg-slate-800 rounded-2xl border overflow-hidden mb-6" style={{ borderColor: `${CHAMPS_COLOR}55` }}>
                <div className="px-5 py-3 border-b border-slate-700 flex items-center gap-2">
                  <span className="text-lg font-bold text-white">🏆 챔스 순위</span>
                  <span className="text-slate-400 text-xs">(6경기 각각 승·무·패)</span>
                </div>
                <table className="w-full text-center text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-slate-400 text-xs">
                      <th className="px-3 py-2.5 text-left">팀</th>
                      <th className="px-1 py-2.5">승</th>
                      <th className="px-1 py-2.5">무</th>
                      <th className="px-1 py-2.5">패</th>
                      <th className="px-1 py-2.5">득</th>
                      <th className="px-1 py-2.5">실</th>
                      <th className="px-1 py-2.5">득실</th>
                      <th className="px-3 py-2.5">승점</th>
                    </tr>
                  </thead>
                  <tbody>
                    {champsStandings.map((t, idx) => {
                      const color = getTeamColor(t.name)
                      const gd = t.goalsFor - t.goalsAgainst
                      return (
                        <tr
                          key={t.name}
                          className="border-b border-slate-700/40"
                          style={{ background: idx === 0 && t.played > 0 ? `${CHAMPS_COLOR}12` : 'transparent' }}
                        >
                          <td className="px-3 py-2.5 text-left font-bold" style={{ color }}>
                            <span className="inline-flex items-center gap-1.5">
                              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: color, border: '1px solid rgba(255,255,255,0.3)' }}></span>
                              {t.name}
                              {idx === 0 && t.played > 0 && <span className="text-xs">👑</span>}
                            </span>
                          </td>
                          <td className="px-1 py-2.5 text-emerald-400 font-bold">{t.wins}</td>
                          <td className="px-1 py-2.5 text-yellow-400">{t.draws}</td>
                          <td className="px-1 py-2.5 text-red-400">{t.losses}</td>
                          <td className="px-1 py-2.5 text-slate-300">{t.goalsFor}</td>
                          <td className="px-1 py-2.5 text-slate-300">{t.goalsAgainst}</td>
                          <td className="px-1 py-2.5 text-slate-300">{gd > 0 ? '+' : ''}{gd}</td>
                          <td className="px-3 py-2.5 text-white font-black text-base">{t.points}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            matchupResults.length > 0 && (
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
            )
          )}

          {/* 🗑️ 이 날 경기 전체 삭제 (맨 아래 · 넉넉히 띄움 · 빨간 버튼) */}
          {canEdit && (
            <div style={{ marginTop: '80px', paddingTop: '28px', borderTop: '1px solid rgba(71,85,105,0.4)' }}>
              <div className="flex justify-center">
                <button
                  onClick={deleteDay}
                  className="bg-red-600 hover:bg-red-700 text-white text-sm font-bold px-6 py-3 rounded-xl shadow-lg shadow-red-600/20 transition-colors"
                >
                  🗑️ 이 날 경기 전체 삭제
                </button>
              </div>
              <p className="text-slate-500 text-xs text-center mt-3">
                ※ {selectedDate}의 모든 경기·골 기록이 영구 삭제됩니다. (되돌릴 수 없음)
              </p>
            </div>
          )}
        </>
      )}

      {/* ⬇️ 하단 여백 */}
      <div style={{ height: '60px', width: '100%' }} aria-hidden="true"></div>
    </div>
  )
}

export default MatchRecord