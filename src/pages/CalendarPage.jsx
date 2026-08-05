import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const WEEK_LABELS = ['월', '화', '수', '목', '금', '토', '일']

// 🎯 라운드 기준점: 이 날짜가 (13, 14)라운드
const ANCHOR_DATE = '2026-08-08'
const ANCHOR_FIRST_ROUND = 13

// 요일 헤더 색상 (월~금 하늘 / 토 주황 / 일 빨강) — 투명 톤
function headerStyle(idx) {
  if (idx === 6) return { background: 'rgba(220,38,38,0.35)', color: '#fecaca' }
  if (idx === 5) return { background: 'rgba(249,115,22,0.28)', color: '#fed7aa' }
  return { background: 'rgba(56,132,255,0.22)', color: '#cfe2f3' }
}

// YYYY-MM-DD (로컬 기준)
function toKey(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// 월요일 시작 달력 그리드 생성
function buildWeeks(year, month) {
  const first = new Date(year, month - 1, 1)
  const offset = (first.getDay() + 6) % 7 // 월요일 시작 보정
  const start = new Date(year, month - 1, 1 - offset)

  const weeks = []
  const cur = new Date(start)
  for (let w = 0; w < 6; w++) {
    const week = []
    for (let d = 0; d < 7; d++) {
      week.push(new Date(cur))
      cur.setDate(cur.getDate() + 1)
    }
    weeks.push(week)
  }
  return weeks.filter((week) => week.some((d) => d.getMonth() === month - 1))
}

function CalendarPage() {
  const { role } = useAuth()
  // ✅ 수정 권한(일정 편집): 관리자·임원만
  const canEdit = role === 'admin' || role === 'executive'
  // ⚽ 경기 생성 권한: 관리자·임원·주장 (MatchRecord와 동일)
  const canCreateMatch = role === 'admin' || role === 'executive' || role === 'captain'
  // 👀 전체 내용 열람 권한: 관리자·임원·주장(부주장)
  //    → 정회원(member)은 '확정된 일정'만 볼 수 있음
  const canSeeAll = role === 'admin' || role === 'executive' || role === 'captain'

  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)

  const [reservations, setReservations] = useState([])
  const [memos, setMemos] = useState({})
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)

  // ⚽ 경기가 등록된 날짜 목록 (Set)
  const [matchDates, setMatchDates] = useState(new Set())
  // ⚽ 팀 목록 (결과 표시 색상 + 생성용)
  const [teams, setTeams] = useState([])
  // ⚽ 경기 생성 중인 날짜 (버튼 로딩 표시)
  const [creatingKey, setCreatingKey] = useState(null)

  // 🗓️ 현재 시즌
  const [currentSeason, setCurrentSeason] = useState('')

  // 📅 연/월 선택 팝오버
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerYear, setPickerYear] = useState(today.getFullYear())
  const pickerRef = useRef(null)

  // 모달 상태
  const [editKey, setEditKey] = useState(null) // 편집 중인 날짜 (YYYY-MM-DD)
  const [editRows, setEditRows] = useState([])
  const [editMemo, setEditMemo] = useState('')
  const [saving, setSaving] = useState(false)

  // ⚽ 경기 결과 모달 상태
  const [resultKey, setResultKey] = useState(null) // 결과 보는 날짜
  const [resultMatches, setResultMatches] = useState([])
  const [resultGoals, setResultGoals] = useState([])
  const [resultLoading, setResultLoading] = useState(false)
  // ⚽ 결과 모달 헤더 정보 (장소/시간/라운드)
  const [resultInfo, setResultInfo] = useState({ venue: '', time: '', rounds: null })

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month])

  useEffect(() => {
    if (canEdit) fetchPlayers()
    fetchTeams()
    fetchCurrentSeason()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit])

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

  // 🗓️ 현재 시즌 로드
  async function fetchCurrentSeason() {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'season_label')
      .single()
    if (data?.value) setCurrentSeason(data.value)
  }

  async function fetchPlayers() {
    const { data } = await supabase
      .from('players')
      .select('id, name, is_active')
      .order('name')
    setPlayers((data || []).filter((p) => p.is_active !== false))
  }

  async function fetchTeams() {
    const { data } = await supabase
      .from('teams')
      .select('*')
      .order('display_order')
    setTeams(data || [])
  }

  async function fetchData() {
    setLoading(true)
    const lastDay = new Date(year, month, 0).getDate()

    // 앞뒤 달 칸도 표시되므로 여유 있게 조회
    const from = toKey(new Date(year, month - 1, -7))
    const to = toKey(new Date(year, month - 1, lastDay + 7))

    // 일정 조회 (정회원은 확정된 것만)
    let resQuery = supabase
      .from('reservations')
      .select('*')
      .gte('date', from)
      .lte('date', to)
      .order('sort_order')

    if (!canSeeAll) {
      resQuery = resQuery.eq('is_confirmed', true)
    }

    // 메모는 전체 열람 권한자만 조회
    const memoPromise = canSeeAll
      ? supabase.from('calendar_memos').select('*').gte('date', from).lte('date', to)
      : Promise.resolve({ data: [] })

    // ⚽ 경기가 등록된 날짜 조회
    const matchPromise = supabase
      .from('matches')
      .select('game_date')
      .gte('game_date', from)
      .lte('game_date', to)

    const [resRes, memoRes, matchRes] = await Promise.all([resQuery, memoPromise, matchPromise])

    setReservations(resRes.data || [])

    const memoMap = {}
    ;(memoRes.data || []).forEach((m) => {
      memoMap[m.date] = m.content
    })
    setMemos(memoMap)

    const mDates = new Set((matchRes.data || []).map((m) => m.game_date))
    setMatchDates(mDates)

    setLoading(false)
  }

  function goToday() {
    setYear(today.getFullYear())
    setMonth(today.getMonth() + 1)
    setPickerOpen(false)
  }

  function openPicker() {
    setPickerYear(year)
    setPickerOpen((v) => !v)
  }

  function selectMonth(m) {
    setYear(pickerYear)
    setMonth(m)
    setPickerOpen(false)
  }

  // 날짜별 일정 목록
  function getReservations(key) {
    return reservations.filter((r) => r.date === key)
  }

  // 셀 클릭 → 편집 모달 열기
  function openEditor(key) {
    if (!canEdit) return
    const rows = getReservations(key).map((r) => ({
      venue: r.venue || '',
      time: r.time || '',
      reserver: r.reserver || '',
      is_confirmed: !!r.is_confirmed,
    }))
    setEditRows(rows.length > 0 ? rows : [{ venue: '', time: '', reserver: '', is_confirmed: false }])
    setEditMemo(memos[key] || '')
    setEditKey(key)
  }

  // 🔢 라운드 자동 계산 (경기일 1일 = 2라운드, ANCHOR_DATE = 13·14 고정)
  async function calcRounds(date) {
    const { data } = await supabase
      .from('matches')
      .select('game_date')

    const dates = [...new Set((data || []).map((d) => d.game_date))]
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

  // ⚽ 경기 결과 모달 열기
  async function openResult(key, e) {
    if (e) e.stopPropagation() // 셀 클릭(편집) 전파 방지
    setResultKey(key)
    setResultLoading(true)
    setResultInfo({ venue: '', time: '', rounds: null })

    const [mRes, gRes, resvRes, rounds] = await Promise.all([
      supabase.from('matches').select('*').eq('game_date', key).order('match_number'),
      supabase.from('goals').select('*').eq('game_date', key),
      supabase
        .from('reservations')
        .select('*')
        .eq('date', key)
        .order('is_confirmed', { ascending: false })
        .order('sort_order', { ascending: true }),
      calcRounds(key),
    ])

    setResultMatches(mRes.data || [])
    setResultGoals(gRes.data || [])

    // 장소/시간: 확정 예약 우선, 없으면 첫 예약
    let venue = ''
    let time = ''
    const resvList = resvRes.data || []
    if (resvList.length > 0) {
      const confirmed = resvList.find((r) => r.is_confirmed) || resvList[0]
      venue = confirmed.venue || ''
      time = confirmed.time || ''
    }
    setResultInfo({ venue, time, rounds })

    setResultLoading(false)
  }

  // 🏆 이전까지의 누적 순위 계산 (해당 날짜 제외) — MatchRecord와 동일
  async function getPreviousStandings(targetDate) {
    const { data: allMatches } = await supabase
      .from('matches')
      .select('*')
      .neq('game_date', targetDate)
      .order('game_date', { ascending: false })

    const pastMatches = allMatches || []
    const dates = [...new Set(pastMatches.map((m) => m.game_date))]

    const allMatchups = []
    for (const date of dates) {
      const dayMatches = pastMatches
        .filter((m) => m.game_date === date)
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

  // ⚽ 경기 생성 (MatchRecord와 동일: 순위 기반 6경기 자동 배정)
  async function createMatchesForDay(key, e) {
    if (e) e.stopPropagation() // 셀 클릭(편집) 전파 방지
    if (!canCreateMatch) return
    if (teams.length < 3) {
      alert('팀이 3개 이상 필요합니다!')
      return
    }
    if (matchDates.has(key)) {
      alert('이미 해당 날짜에 경기가 등록되어 있습니다!')
      return
    }
    if (!window.confirm(`${key.replace(/-/g, '. ')} 에 6경기(1Q~6Q)를 생성할까요?`)) return

    setCreatingKey(key)

    const standings = await getPreviousStandings(key)

    let rankedTeams
    const hasHistory = standings.some((s) => s.points > 0 || s.goalsFor > 0)

    if (hasHistory) {
      rankedTeams = standings.map((s) => s.name).slice(0, 3)
    } else {
      rankedTeams = teams.map((t) => t.name).slice(0, 3)
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
        game_date: key,
        score_a: 0,
        score_b: 0,
        season: currentSeason || null, // 🗓️ 현재 시즌 기록
        ...m,
      })
    }

    setCreatingKey(null)
    // 버튼이 즉시 '결과'로 바뀌도록 목록 갱신
    await fetchData()

    alert(
      hasHistory
        ? `순위 기반으로 6경기가 생성되었습니다!\n🥇${first} 🥈${second} 🥉${third}`
        : '6경기가 생성되었습니다! (과거 기록이 없어 기본 순서로 배정)'
    )
  }

  // 🎨 팀 색상 가져오기 (파랑은 밝은 파랑으로 변환)
  function getTeamColor(teamName) {
    const team = teams.find((t) => t.name === teamName)
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

  // 합산 결과 계산 (MatchRecord와 동일 로직)
  function getMatchupResults() {
    if (resultMatches.length < 6) return []

    const pairs = []
    const used = new Set()

    for (let i = 0; i < resultMatches.length; i++) {
      if (used.has(i)) continue
      for (let j = i + 1; j < resultMatches.length; j++) {
        if (used.has(j)) continue
        const a = resultMatches[i]
        const b = resultMatches[j]

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

  function updateRow(idx, field, value) {
    setEditRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r))
    )
  }

  function addRow() {
    setEditRows((prev) => [...prev, { venue: '', time: '', reserver: '', is_confirmed: false }])
  }

  function removeRow(idx) {
    setEditRows((prev) => prev.filter((_, i) => i !== idx))
  }

  async function saveDay() {
    if (!canEdit || !editKey) return
    setSaving(true)

    // 1) 해당 날짜 일정 전부 삭제 후 다시 저장
    const { error: delErr } = await supabase
      .from('reservations')
      .delete()
      .eq('date', editKey)

    if (delErr) {
      console.error('삭제 오류:', delErr)
      alert('저장에 실패했습니다.')
      setSaving(false)
      return
    }

    const rowsToInsert = editRows
      .filter((r) => r.venue.trim() || r.time.trim() || r.reserver.trim())
      .map((r, i) => ({
        date: editKey,
        venue: r.venue.trim() || null,
        time: r.time.trim() || null,
        reserver: r.reserver.trim() || null,
        is_confirmed: !!r.is_confirmed,
        sort_order: i,
      }))

    if (rowsToInsert.length > 0) {
      const { error: insErr } = await supabase.from('reservations').insert(rowsToInsert)
      if (insErr) {
        console.error('저장 오류:', insErr)
        alert('저장에 실패했습니다.')
        setSaving(false)
        return
      }
    }

    // 2) 메모 저장 / 삭제
    const memoText = editMemo.trim()
    if (memoText) {
      const { error: memoErr } = await supabase
        .from('calendar_memos')
        .upsert({ date: editKey, content: memoText, updated_at: new Date().toISOString() })
      if (memoErr) console.error('메모 저장 오류:', memoErr)
    } else {
      await supabase.from('calendar_memos').delete().eq('date', editKey)
    }

    setEditKey(null)
    setSaving(false)
    fetchData()
  }

  const weeks = buildWeeks(year, month)
  const todayKey = toKey(today)
  const matchupResults = getMatchupResults()

  return (
    <div className="max-w-full mx-auto">
      {/* 헤더 */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <h1 className="text-2xl font-bold text-white">📅 일정</h1>

        {/* 📆 연/월 선택 버튼 + 팝오버 */}
        <div className="relative" ref={pickerRef}>
          <button
            onClick={openPicker}
            title="연도·월 선택"
            className="flex items-center gap-2 bg-slate-700/70 hover:bg-slate-600 border border-slate-500 text-white px-3 py-1.5 rounded-lg transition-colors"
          >
            {/* 달력 아이콘 (흰색) */}
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
            <span className="text-emerald-400 font-bold text-lg leading-none">
              {year}년 {month}월
            </span>
            <span className="text-slate-400 text-xs">▾</span>
          </button>

          {/* 팝오버 패널 */}
          {pickerOpen && (
            <div
              className="absolute left-0 mt-2 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl p-3"
              style={{ zIndex: 60, width: '280px' }}
            >
              {/* 연도 선택 */}
              <div className="flex items-center justify-between mb-3">
                <button
                  onClick={() => setPickerYear((y) => y - 1)}
                  className="text-slate-300 hover:text-white px-2 py-1 rounded hover:bg-slate-700 transition-colors"
                >
                  ◀
                </button>
                <span className="text-white font-bold text-lg">{pickerYear}년</span>
                <button
                  onClick={() => setPickerYear((y) => y + 1)}
                  className="text-slate-300 hover:text-white px-2 py-1 rounded hover:bg-slate-700 transition-colors"
                >
                  ▶
                </button>
              </div>

              {/* 월 선택 (3열) */}
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                  const isCurrent = pickerYear === year && m === month
                  const isThisMonth =
                    pickerYear === today.getFullYear() && m === today.getMonth() + 1
                  return (
                    <button
                      key={m}
                      onClick={() => selectMonth(m)}
                      className={`py-2 rounded-lg text-sm font-medium transition-colors border ${
                        isCurrent
                          ? 'bg-emerald-500 text-white border-emerald-400'
                          : isThisMonth
                          ? 'bg-slate-700 text-emerald-300 border-emerald-500/40'
                          : 'bg-slate-700/50 text-slate-300 border-slate-600 hover:bg-slate-700'
                      }`}
                    >
                      {m}월
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* 오늘 버튼 - 달력 아이콘 바로 옆 */}
        <button
          onClick={goToday}
          className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
        >
          오늘
        </button>
      </div>

      {(canEdit || canCreateMatch) && (
        <p className="text-slate-500 text-xs mb-2">
          💡 날짜 칸을 클릭하면 일정을 추가·수정할 수 있습니다. (확정하면 노란색) · ⚽ 결과 / + 경기생성 버튼으로 경기를 관리할 수 있습니다.
        </p>
      )}

      {loading ? (
        <div className="text-center text-slate-400 py-20">⏳ 불러오는 중...</div>
      ) : (
        <div
          style={{
            border: '1px solid rgba(148,163,184,0.35)',
            borderRadius: '10px',
            overflow: 'hidden',
            background: 'transparent',
          }}
        >
          {/* 요일 헤더 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {WEEK_LABELS.map((label, i) => (
              <div
                key={label}
                style={{
                  ...headerStyle(i),
                  textAlign: 'center',
                  fontSize: '13px',
                  fontWeight: 700,
                  padding: '6px 0',
                  borderRight: i === 6 ? 'none' : '1px solid rgba(148,163,184,0.25)',
                  borderBottom: '1px solid rgba(148,163,184,0.3)',
                }}
              >
                {label}
              </div>
            ))}
          </div>

          {/* 날짜 셀 */}
          {weeks.map((week, wi) => (
            <div
              key={wi}
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                minHeight: `calc((100vh - 330px) / ${weeks.length})`,
              }}
            >
              {week.map((d, di) => {
                const key = toKey(d)
                const inMonth = d.getMonth() === month - 1
                const dayRes = getReservations(key)
                const hasConfirmed = dayRes.some((r) => r.is_confirmed)
                const memo = memos[key]
                const isWeekend = di >= 5
                const isToday = key === todayKey
                const hasMatch = matchDates.has(key)
                const isCreating = creatingKey === key

                return (
                  <div
                    key={key}
                    onClick={() => openEditor(key)}
                    style={{
                      borderRight: di === 6 ? 'none' : '1px solid rgba(148,163,184,0.2)',
                      borderBottom: wi === weeks.length - 1 ? 'none' : '1px solid rgba(148,163,184,0.2)',
                      padding: '3px 5px 6px',
                      background: hasConfirmed
                        ? 'rgba(250, 204, 21, 0.30)'
                        : isToday
                        ? 'rgba(16,185,129,0.12)'
                        : 'transparent',
                      opacity: inMonth ? 1 : 0.3,
                      cursor: canEdit ? 'pointer' : 'default',
                      overflow: 'hidden',
                    }}
                  >
                    {/* 상단 줄: ⚽ 결과 / + 경기생성 버튼(왼쪽) + 날짜 숫자(오른쪽) */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '4px',
                        marginBottom: '2px',
                      }}
                    >
                      {/* 왼쪽 버튼 영역 (가로로 길게) */}
                      {hasMatch ? (
                        <button
                          onClick={(e) => openResult(key, e)}
                          title="경기 결과 보기"
                          style={{
                            flex: 1,
                            minWidth: 0,
                            fontSize: '10px',
                            fontWeight: 700,
                            color: '#fff',
                            background: 'rgba(16,185,129,0.85)',
                            border: '1px solid rgba(16,185,129,1)',
                            borderRadius: '6px',
                            padding: '1px 4px',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            lineHeight: 1.4,
                          }}
                        >
                          ⚽ 결과
                        </button>
                      ) : canCreateMatch && inMonth && hasConfirmed ? (
                        <button
                          onClick={(e) => createMatchesForDay(key, e)}
                          disabled={isCreating}
                          title="이 날 경기 생성"
                          style={{
                            flex: 1,
                            minWidth: 0,
                            fontSize: '10px',
                            fontWeight: 700,
                            color: isCreating ? '#94a3b8' : '#065f46',
                            background: 'rgba(255,255,255,0.75)',
                            border: '1px dashed rgba(6,95,70,0.7)',
                            borderRadius: '6px',
                            padding: '1px 4px',
                            cursor: isCreating ? 'default' : 'pointer',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            lineHeight: 1.4,
                          }}
                        >
                          {isCreating ? '생성중…' : '+ 경기생성'}
                        </button>
                      ) : (
                        <span style={{ flex: 1 }} />
                      )}

                      {/* 날짜 숫자 (우측) */}
                      <span
                        style={{
                          flexShrink: 0,
                          fontSize: '12px',
                          fontWeight: isToday ? 800 : 500,
                          color: isToday
                            ? '#34d399'
                            : isWeekend
                            ? '#f87171'
                            : '#cbd5e1',
                        }}
                      >
                        {d.getDate()}
                      </span>
                    </div>

                    {/* ★ 메모 (빨간 글씨) - 전체 열람 권한자만 */}
                    {canSeeAll && memo && (
                      <div
                        style={{
                          fontSize: '10px',
                          color: '#fca5a5',
                          fontWeight: 700,
                          whiteSpace: 'pre-wrap',
                          lineHeight: 1.35,
                          marginBottom: '2px',
                        }}
                      >
                        {memo}
                      </div>
                    )}

                    {/* 일정 목록 */}
                    {dayRes.map((r, i) => {
                      // 정회원: 구장 - 시간만 / 그 외: 구장 - 시간 - 예약자
                      const text = canSeeAll
                        ? [r.venue, r.time, r.reserver].filter(Boolean).join('-')
                        : [r.venue, r.time].filter(Boolean).join('-')
                      return (
                        <div
                          key={i}
                          style={{
                            fontSize: '10.5px',
                            color: r.is_confirmed ? '#fef08a' : '#e2e8f0',
                            fontWeight: r.is_confirmed ? 700 : 400,
                            lineHeight: 1.4,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                          title={text}
                        >
                          {text}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}

      {/* ✏️ 편집 모달 */}
      {editKey && (
        <div
          onClick={() => !saving && setEditKey(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#1e293b',
              border: '1px solid #475569',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '680px',
              maxHeight: '85vh',
              overflowY: 'auto',
              padding: '22px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            }}
          >
            <h2 className="text-white text-lg font-bold mb-1">
              📅 {editKey.replace(/-/g, '. ')} 일정
            </h2>
            <p className="text-slate-400 text-xs mb-4">
              구장 · 시간 · 예약자를 입력하세요. 확정하면 달력에 노란색으로 표시됩니다.
            </p>

            {/* 메모 */}
            <div className="mb-4">
              <label className="block text-slate-300 text-sm font-medium mb-1">
                ★ 메모 <span className="text-slate-500 text-xs">(달력에 빨간 글씨로 표시)</span>
              </label>
              <textarea
                value={editMemo}
                onChange={(e) => setEditMemo(e.target.value)}
                rows={3}
                placeholder={'예)\n★10월분 예약\n10시. 인천대공원.원적산'}
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* 일정 항목들 */}
            <label className="block text-slate-300 text-sm font-medium mb-2">일정 항목</label>
            <div className="space-y-2 mb-3">
              {editRows.map((r, idx) => (
                <div key={idx} className="flex flex-wrap items-center gap-2 bg-slate-900/60 rounded-lg p-2">
                  <input
                    type="text"
                    value={r.venue}
                    onChange={(e) => updateRow(idx, 'venue', e.target.value)}
                    placeholder="구장 (예: 삼산체육관)"
                    className="flex-1 min-w-[130px] bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                  <input
                    type="text"
                    value={r.time}
                    onChange={(e) => updateRow(idx, 'time', e.target.value)}
                    placeholder="시간 (예: 20시)"
                    className="w-[100px] bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                  <input
                    type="text"
                    list="player-name-list"
                    value={r.reserver}
                    onChange={(e) => updateRow(idx, 'reserver', e.target.value)}
                    placeholder="예약자 (선수 검색)"
                    className="w-[150px] bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />

                  <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none px-2">
                    <input
                      type="checkbox"
                      checked={r.is_confirmed}
                      onChange={(e) => updateRow(idx, 'is_confirmed', e.target.checked)}
                      className="w-4 h-4 accent-yellow-400"
                    />
                    <span className={r.is_confirmed ? 'text-yellow-300 font-semibold' : 'text-slate-400'}>
                      확정
                    </span>
                  </label>

                  <button
                    onClick={() => removeRow(idx)}
                    className="text-red-400 hover:text-red-300 text-sm px-2"
                    title="이 항목 삭제"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            {/* 선수 이름 자동완성 목록 */}
            <datalist id="player-name-list">
              {players.map((p) => (
                <option key={p.id} value={p.name} />
              ))}
            </datalist>

            <button
              onClick={addRow}
              className="text-emerald-400 hover:text-emerald-300 text-sm mb-5"
            >
              + 일정 추가
            </button>

            {/* 액션 버튼 (2배 크기) */}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setEditKey(null)}
                disabled={saving}
                className="bg-slate-700 hover:bg-slate-600 text-white px-8 py-4 rounded-xl text-lg font-medium transition-colors disabled:opacity-50"
              >
                취소
              </button>
              <button
                onClick={saveDay}
                disabled={saving}
                className="bg-emerald-500 hover:bg-emerald-600 text-white px-10 py-4 rounded-xl text-lg font-bold transition-colors disabled:opacity-50"
              >
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ⚽ 경기 결과 모달 */}
      {resultKey && (
        <div
          onClick={() => setResultKey(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#1e293b',
              border: '1px solid #475569',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '560px',
              maxHeight: '85vh',
              overflowY: 'auto',
              padding: '22px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            }}
          >
            {/* 헤더: 날짜 · 라운드 · 시간 · 장소 (한 줄) + 닫기 */}
            <div className="flex items-start justify-between gap-2 mb-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
                <span className="text-white text-base font-bold whitespace-nowrap">
                  ⚽ {resultKey.replace(/-/g, '. ')}
                </span>
                {resultInfo.rounds && (
                  <span className="text-emerald-300 text-sm font-bold whitespace-nowrap">
                    🏆 {resultInfo.rounds.first}·{resultInfo.rounds.second}R
                  </span>
                )}
                {resultInfo.time && (
                  <span className="text-slate-200 text-sm font-medium whitespace-nowrap">
                    ⏰ {resultInfo.time}
                  </span>
                )}
                {resultInfo.venue && (
                  <span className="text-slate-200 text-sm font-medium whitespace-nowrap">
                    📍 {resultInfo.venue}
                  </span>
                )}
              </div>
              <button
                onClick={() => setResultKey(null)}
                className="text-slate-400 hover:text-white text-xl leading-none px-2 flex-shrink-0"
                title="닫기"
              >
                ✕
              </button>
            </div>

            {resultLoading ? (
              <div className="text-center text-slate-400 py-10">⏳ 불러오는 중...</div>
            ) : resultMatches.length === 0 ? (
              <div className="text-center text-slate-400 py-10">경기 기록이 없습니다.</div>
            ) : (
              <>
                {/* 개별 경기 스코어 */}
                <div className="space-y-2 mb-5">
                  {resultMatches.map((match) => {
                    const matchGoals = resultGoals.filter((g) => g.match_id === match.id)
                    const goalsA = matchGoals.filter((g) => g.team === match.team_a)
                    const goalsB = matchGoals.filter((g) => g.team === match.team_b)
                    const colorA = getTeamColor(match.team_a)
                    const colorB = getTeamColor(match.team_b)
                    const aWin = match.score_a > match.score_b
                    const bWin = match.score_b > match.score_a

                    return (
                      <div
                        key={match.id}
                        className="rounded-xl border border-slate-700 overflow-hidden"
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
                          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 mb-2">
                            <div className="text-center">
                              <p className="text-base font-extrabold" style={{ color: colorA, opacity: bWin ? 0.55 : 1 }}>
                                {match.team_a}
                              </p>
                            </div>

                            <div className="flex items-center gap-2">
                              <span
                                className="text-2xl font-black tabular-nums leading-none w-6 text-center"
                                style={{ color: aWin ? '#fef08a' : '#ffffff' }}
                              >
                                {match.score_a}
                              </span>
                              <span className="text-slate-500 text-lg font-bold">:</span>
                              <span
                                className="text-2xl font-black tabular-nums leading-none w-6 text-center"
                                style={{ color: bWin ? '#fef08a' : '#ffffff' }}
                              >
                                {match.score_b}
                              </span>
                            </div>

                            <div className="text-center">
                              <p className="text-base font-extrabold" style={{ color: colorB, opacity: aWin ? 0.55 : 1 }}>
                                {match.team_b}
                              </p>
                            </div>
                          </div>

                          {/* 득점자 */}
                          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-700/40">
                            <div className="flex flex-wrap gap-1 justify-end">
                              {goalsA.length === 0 && (
                                <span className="text-slate-600 text-[11px]">-</span>
                              )}
                              {goalsA.map((g) => (
                                <span
                                  key={g.id}
                                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] ${
                                    g.player_id ? 'bg-slate-700/60 text-white' : 'bg-amber-500/20 text-amber-200'
                                  }`}
                                >
                                  {goalLabel(g)}
                                </span>
                              ))}
                            </div>
                            <div className="flex flex-wrap gap-1 justify-start">
                              {goalsB.length === 0 && (
                                <span className="text-slate-600 text-[11px]">-</span>
                              )}
                              {goalsB.map((g) => (
                                <span
                                  key={g.id}
                                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] ${
                                    g.player_id ? 'bg-slate-700/60 text-white' : 'bg-amber-500/20 text-amber-200'
                                  }`}
                                >
                                  {goalLabel(g)}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* 합산 결과 */}
                {matchupResults.length > 0 && (
                  <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
                    <h3 className="text-base font-bold text-white mb-3">📊 합산 결과</h3>
                    <div className="space-y-2">
                      {matchupResults.map((r, idx) => {
                        const colorA = getTeamColor(r.teamA)
                        const colorB = getTeamColor(r.teamB)
                        const isDraw = r.result === '무'
                        return (
                          <div
                            key={idx}
                            className="rounded-lg p-3 border border-slate-700/50"
                            style={{
                              background: `linear-gradient(135deg, ${colorA}15 0%, rgba(15,23,42,0.5) 45%, rgba(15,23,42,0.5) 55%, ${colorB}15 100%)`,
                            }}
                          >
                            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                              <p className="text-center font-extrabold" style={{ color: colorA, opacity: r.result === r.teamB ? 0.45 : 1 }}>
                                {r.teamA}
                              </p>
                              <p className="text-center text-white text-xl font-black tabular-nums">{r.total}</p>
                              <p className="text-center font-extrabold" style={{ color: colorB, opacity: r.result === r.teamA ? 0.45 : 1 }}>
                                {r.teamB}
                              </p>
                            </div>
                            <div className="text-center mt-1.5">
                              {isDraw ? (
                                <span className="bg-yellow-500/20 text-yellow-400 px-3 py-0.5 rounded-full text-xs font-semibold">무승부</span>
                              ) : (
                                <span className="bg-emerald-500/20 text-emerald-400 px-3 py-0.5 rounded-full text-xs font-semibold">🏆 {r.result} 승!</span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ⬇️ 하단 여백 */}
      <div style={{ height: '40px', width: '100%' }} aria-hidden="true"></div>
    </div>
  )
}

export default CalendarPage