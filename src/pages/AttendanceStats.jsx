import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { ANCHOR_DATE, ANCHOR_FIRST_ROUND } from '../lib/rounds'

// ⏱️ 경기 소요 시간 (시작 후 이 시간이 지나야 '종료된 경기'로 집계)
const MATCH_DURATION_HOURS = 2

const TABS = [
  { key: 'league', label: '⚽ 리그 출석' },
  { key: 'champs', label: '🏆 챔스 출석' },
]

// "7시", "20시-22시" 등에서 시작 시각(시)만 추출
function parseStartHour(timeStr) {
  if (!timeStr) return null
  const m = String(timeStr).match(/\d{1,2}/)
  if (!m) return null
  const h = parseInt(m[0], 10)
  if (isNaN(h) || h < 0 || h > 23) return null
  return h
}

// ⏱️ "이미 끝난 경기인지" 판정 함수 생성 (시작 시각 + 경기 시간 기준)
function makeIsFinished(resvData) {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const todayKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`

  const startHourByDate = {}
  for (const r of resvData || []) {
    if (startHourByDate[r.date] === undefined || r.is_confirmed) {
      const h = parseStartHour(r.time)
      if (h !== null) startHourByDate[r.date] = h
    }
  }

  return (d) => {
    if (d < todayKey) return true
    if (d > todayKey) return false
    const sh = startHourByDate[d]
    if (sh === undefined || sh === null) return true
    // 시작 시각 + 경기 시간이 지나야 종료로 간주
    return now.getHours() >= sh + MATCH_DURATION_HOURS
  }
}

// 🔢 날짜별 라운드 라벨 맵 (리그 경기일만 · 챔스 제외)
function buildRoundMap(allMatches) {
  const champs = new Set(allMatches.filter(m => m.is_champions).map(m => m.game_date))
  const dates = [...new Set(allMatches.map(m => m.game_date))].filter(d => !champs.has(d))
  if (!dates.includes(ANCHOR_DATE)) dates.push(ANCHOR_DATE)
  dates.sort()

  const anchorIdx = dates.indexOf(ANCHOR_DATE)
  const map = {}
  if (anchorIdx === -1) return map

  dates.forEach((d, i) => {
    const first = ANCHOR_FIRST_ROUND + (i - anchorIdx) * 2
    if (first > 0) map[d] = `${first}·${first + 1}R`
  })
  return map
}

function AttendanceStats() {
  const { profile } = useAuth()
  // 🙋 본인 선수 id
  const myPlayerId = profile?.player_id || null

  const [stats, setStats] = useState([])
  const [allAttendance, setAllAttendance] = useState([])
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState('rate')
  // ⚽ 리그 / 🏆 챔스 경기 수 (종료된 경기만)
  const [leagueGames, setLeagueGames] = useState(0)
  const [champsGames, setChampsGames] = useState(0)
  // 🏆 챔스 경기일 집합 (팝업 라운드 표시용)
  const [champsDateSet, setChampsDateSet] = useState(new Set())
  // 🔢 날짜 → 라운드 라벨
  const [roundMap, setRoundMap] = useState({})
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  // 🗓️ 기본값: 현 시즌
  const [filterMode, setFilterMode] = useState('season')
  // 📊 보기 기준: 0 = 리그, 1 = 챔스
  const [index, setIndex] = useState(0)
  const [seasonLabel, setSeasonLabel] = useState('')
  const [popupPlayer, setPopupPlayer] = useState(null)
  // placement: 'below' | 'above'
  const [popupPosition, setPopupPosition] = useState({ top: 0, left: 0, placement: 'below' })
  const popupRef = useRef(null)

  // 👆 스와이프 / 드래그
  const startX = useRef(null)
  const startY = useRef(null)
  const dragging = useRef(false)
  const decidedHorizontal = useRef(false)
  const decidedVertical = useRef(false)
  const swipeAreaRef = useRef(null)
  const indexRef = useRef(0) // 네이티브 이벤트 리스너 안에서 최신 index를 읽기 위한 ref

  useEffect(() => {
    indexRef.current = index
  }, [index])

  // 📅 날짜 입력 ref (클릭 시 달력 열기용)
  const startInputRef = useRef(null)
  const endInputRef = useRef(null)

  useEffect(() => {
    fetchStats()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterMode, startDate, endDate])

  useEffect(() => {
    function handleClickOutside(e) {
      if (popupRef.current && !popupRef.current.contains(e.target)) {
        setPopupPlayer(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // 🚫 안드로이드 크롬의 "가장자리 스와이프로 뒤로가기" 제스처와 충돌 방지
  // 🚫 이 화면에 있는 동안 App.jsx의 "당겨서 새로고침"과도 충돌하지 않도록
  //    data-no-pull 속성을 body에 표시해 App.jsx 쪽에서 감지하도록 함
  useEffect(() => {
    const html = document.documentElement
    const body = document.body
    const prevHtml = html.style.overscrollBehaviorX
    const prevBody = body.style.overscrollBehaviorX
    html.style.overscrollBehaviorX = 'contain'
    body.style.overscrollBehaviorX = 'contain'
    body.setAttribute('data-swipe-view', 'true')
    return () => {
      html.style.overscrollBehaviorX = prevHtml
      body.style.overscrollBehaviorX = prevBody
      body.removeAttribute('data-swipe-view')
    }
  }, [])

  // 👆 터치 스와이프: 네이티브 이벤트 리스너를 non-passive로 직접 등록
  //    (React 합성 이벤트의 touchmove는 기본 passive라 preventDefault가 씹히는 경우가 있음)
  //    ⚠️ loading이 끝나야 스와이프 영역(div)이 실제로 렌더링되므로,
  //       loading을 의존성에 넣어 데이터 로딩 완료 후 다시 el을 찾아 리스너를 등록합니다.
  const HORIZONTAL_DECIDE_PX = 4   // 가로로 이 정도만 움직여도 "가로 스와이프"로 빠르게 확정 (민감도↑)
  const VERTICAL_DECIDE_PX = 6     // 세로로 이 정도 움직이면 "세로 스크롤"로 확정 (더 이상 개입 안 함)
  const SWIPE_COMPLETE_PX = 24     // 짧게 스와이프해도 탭이 넘어가도록 임계값 완화 (민감도↑)

  useEffect(() => {
    const el = swipeAreaRef.current
    if (!el) return

    function onTouchStart(e) {
      const t = e.touches[0]
      startX.current = t.clientX
      startY.current = t.clientY
      dragging.current = true
      decidedHorizontal.current = false
      decidedVertical.current = false
    }

    function onTouchMove(e) {
      if (!dragging.current || startX.current === null) return
      const t = e.touches[0]
      const dx = t.clientX - startX.current
      const dy = t.clientY - startY.current

      if (!decidedHorizontal.current && !decidedVertical.current) {
        if (Math.abs(dx) > HORIZONTAL_DECIDE_PX && Math.abs(dx) > Math.abs(dy)) {
          decidedHorizontal.current = true
        } else if (Math.abs(dy) > VERTICAL_DECIDE_PX && Math.abs(dy) >= Math.abs(dx)) {
          decidedVertical.current = true
        }
      }

      // 🚫 가로 스와이프로 확정되면, 브라우저의 세로 스크롤/뒤로가기 제스처를 막고
      //    우리 스와이프 로직만 동작하도록 함 (non-passive 리스너라 preventDefault가 실제로 먹힘)
      if (decidedHorizontal.current) {
        e.preventDefault()
      }
    }

    function onTouchEnd(e) {
      if (!dragging.current || startX.current === null) {
        dragging.current = false
        return
      }
      const t = e.changedTouches[0]
      const dx = t.clientX - startX.current
      const dy = t.clientY - startY.current

      if (decidedHorizontal.current && Math.abs(dx) > SWIPE_COMPLETE_PX) {
        const currentIndex = indexRef.current
        if (dx < 0 && currentIndex < TABS.length - 1) {
          setIndex(currentIndex + 1)
          setPopupPlayer(null)
        } else if (dx > 0 && currentIndex > 0) {
          setIndex(currentIndex - 1)
          setPopupPlayer(null)
        }
      }

      startX.current = null
      startY.current = null
      dragging.current = false
      decidedHorizontal.current = false
      decidedVertical.current = false
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false }) // ⚠️ non-passive 필수 (iOS 대응)
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    el.addEventListener('touchcancel', onTouchEnd, { passive: true })

    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [loading]) // ✅ 로딩이 끝나 스와이프 div가 실제로 나타난 뒤에 다시 등록되도록 함

  async function fetchStats() {
    setLoading(true)

    // 🗓️ 현재 시즌 라벨 조회
    const { data: seasonRow } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'season_label')
      .single()
    const season = seasonRow?.value || ''
    setSeasonLabel(season)

    const [attRes, playerRes, teamRes, matchRes, resvRes] = await Promise.all([
      supabase.from('attendance').select('*').order('game_date', { ascending: false }),
      supabase.from('players').select('*'),
      supabase.from('teams').select('*').order('display_order'),
      supabase.from('matches').select('game_date, season, is_champions'),
      supabase.from('reservations').select('date, time, is_confirmed'),
    ])

    const attendance = attRes.data || []
    const players = playerRes.data || []
    setTeams(teamRes.data || [])
    const allMatches = matchRes.data || []

    setAllAttendance(attendance)

    // 🔢 라운드 맵 (전체 경기 기준)
    setRoundMap(buildRoundMap(allMatches))

    // ⏱️ 종료된 경기만 판정 (시작 + 2시간)
    const isFinished = makeIsFinished(resvRes.data)

    // 🏆 전체 챔스 경기일 (팝업 표시용)
    const allChampsDates = new Set(allMatches.filter(m => m.is_champions).map(m => m.game_date))
    setChampsDateSet(allChampsDates)

    // ── 기간 필터에 해당하는 경기 목록 추리기 ──
    let scopedMatches = allMatches

    if (filterMode === 'season') {
      scopedMatches = season ? allMatches.filter(m => m.season === season) : []
    } else if (filterMode === 'range') {
      scopedMatches = (startDate && endDate)
        ? allMatches.filter(m => m.game_date >= startDate && m.game_date <= endDate)
        : []
    }
    // filterMode === 'all' 이면 전체

    // ⏱️ 종료된 경기만 남기기
    const finishedMatches = scopedMatches.filter(m => isFinished(m.game_date))

    // ⚽ 리그 경기일 / 🏆 챔스 경기일 분리
    const leagueDates = new Set(finishedMatches.filter(m => !m.is_champions).map(m => m.game_date))
    const champsDates = new Set(finishedMatches.filter(m => m.is_champions).map(m => m.game_date))

    setLeagueGames(leagueDates.size)
    setChampsGames(champsDates.size)

    // ✅ 탈퇴한 선수(is_active === false) 제외
    const activePlayers = players.filter(p => p.is_active !== false)
    const PRESENT = ['출석', '늦참', '조퇴']

    const playerStats = activePlayers.map(player => {
      const myRecords = attendance.filter(a => a.player_id === player.id)

      // ⚽ 리그 — 출석률(%)
      const lg = myRecords.filter(a => leagueDates.has(a.game_date))
      const lgAttended = lg.filter(a => a.status === '출석').length
      const lgLate = lg.filter(a => a.status === '늦참').length
      const lgEarly = lg.filter(a => a.status === '조퇴').length
      const lgPresent = lg.filter(a => PRESENT.includes(a.status)).length
      const leagueRate = leagueDates.size > 0 ? Math.round((lgPresent / leagueDates.size) * 100) : 0

      // 🏆 챔스 — 출석 / 불참만
      const champsPresent = myRecords.some(
        a => champsDates.has(a.game_date) && PRESENT.includes(a.status)
      )

      return {
        id: player.id,
        name: player.name,
        team: player.current_team,
        // 리그
        leagueAttended: lgAttended,
        leagueLate: lgLate,
        leagueEarly: lgEarly,
        leaguePresent: lgPresent,
        leagueRate,
        // 챔스
        champsPresent,
      }
    })

    setStats(playerStats)
    setLoading(false)
  }

  // 📊 현재 보기 기준
  const isChampsView = index === 1
  const totalGames = isChampsView ? champsGames : leagueGames

  // ── 🖱️ PC 마우스 드래그 (터치와 별개로 유지) ──
  function handleMouseStart(x, y) {
    startX.current = x
    startY.current = y
    dragging.current = true
    decidedHorizontal.current = false
  }

  function handleMouseMove(x, y) {
    if (!dragging.current || startX.current === null) return
    const dx = x - startX.current
    const dy = y - startY.current
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
      decidedHorizontal.current = true
    }
  }

  function handleMouseEnd(x, y) {
    if (!dragging.current || startX.current === null) {
      dragging.current = false
      return
    }
    const dx = x - startX.current
    const dy = y - startY.current

    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
      if (dx < 0 && index < TABS.length - 1) {
        setIndex((i) => i + 1)
        setPopupPlayer(null)
      } else if (dx > 0 && index > 0) {
        setIndex((i) => i - 1)
        setPopupPlayer(null)
      }
    }

    startX.current = null
    startY.current = null
    dragging.current = false
    decidedHorizontal.current = false
  }

  function onMouseDown(e) { handleMouseStart(e.clientX, e.clientY) }
  function onMouseMove(e) {
    if (!dragging.current) return
    handleMouseMove(e.clientX, e.clientY)
    if (decidedHorizontal.current) e.preventDefault()
  }
  function onMouseUp(e) { handleMouseEnd(e.clientX, e.clientY) }
  function onMouseLeave(e) { if (dragging.current) handleMouseEnd(e.clientX, e.clientY) }

  // 📅 날짜 표시용 (2026. 08. 04.)
  function formatDate(d) {
    if (!d) return '날짜 선택'
    const [y, m, day] = d.split('-')
    return `${y}. ${m}. ${day}.`
  }

  // 📅 날짜 칸 클릭 → 달력 즉시 열기
  function openDatePicker(ref) {
    if (!ref.current) return
    if (typeof ref.current.showPicker === 'function') {
      ref.current.showPicker()
    } else {
      ref.current.focus()
      ref.current.click()
    }
  }

  // 🎨 팀 색상 가져오기 (남색은 밝은 파랑으로 변환)
  function getTeamColor(teamName) {
    const team = teams.find(t => t.name === teamName)
    const color = team?.color || '#94a3b8'
    const c = color.toLowerCase()
    if (c === '#1d4ed8' || c === '#2563eb' || c === '#1e40af' || c === '#1e3a8a') {
      return '#60a5fa' // 밝은 파랑
    }
    return color
  }

  // ✅ 참석률 클릭 시, 팝업 위치 계산 (챔스 탭에서는 동작 안 함)
  function handleRateClick(e, player) {
    if (isChampsView) return
    if (popupPlayer?.id === player.id) {
      setPopupPlayer(null)
      return
    }
    const container = e.currentTarget.closest('.stats-container')
    if (!container) return
    const containerRect = container.getBoundingClientRect()
    const btnRect = e.currentTarget.getBoundingClientRect()

    const popupWidth = 320
    const margin = 12
    const gap = 6

    // ── 좌우 위치 ──
    let left = btnRect.left - containerRect.left
    const popupRightOnScreen = btnRect.left + popupWidth
    if (popupRightOnScreen > window.innerWidth - margin) {
      const overflow = popupRightOnScreen - (window.innerWidth - margin)
      left = left - overflow
    }
    if (left < 0) left = 0

    // ── 상하 위치 ──
    const spaceBelow = window.innerHeight - btnRect.bottom
    const spaceAbove = btnRect.top
    const NEED = 260

    let top
    let placement
    if (spaceBelow < NEED && spaceAbove > spaceBelow) {
      placement = 'above'
      top = btnRect.top - containerRect.top - gap
    } else {
      placement = 'below'
      top = btnRect.bottom - containerRect.top + gap
    }

    setPopupPosition({ top, left, placement })
    setPopupPlayer(player)
  }

  // ✅ 참석률 색상: 50% 기준 2색 (50% 이상 초록 / 미만 빨강)
  const rateColor = (rate) => {
    return rate >= 50 ? 'text-emerald-400' : 'text-red-400'
  }

  const statusIcon = (s) => {
    switch(s) {
      case '출석': return '✅'
      case '늦참': return '🕐'
      case '조퇴': return '🏃'
      default: return ''
    }
  }

  const statusBgColor = (s) => {
    switch(s) {
      case '출석': return 'bg-emerald-500/10 text-emerald-400'
      case '늦참': return 'bg-blue-500/10 text-blue-400'
      case '조퇴': return 'bg-orange-500/10 text-orange-400'
      default: return 'bg-slate-500/10 text-slate-400'
    }
  }

  const popupRecords = popupPlayer
    ? allAttendance
        .filter(a => a.player_id === popupPlayer.id && ['출석', '늦참', '조퇴'].includes(a.status))
        .sort((a, b) => b.game_date.localeCompare(a.game_date))
    : []

  // ✅ 선택된 정렬 방식으로 선수 정렬
  function sortPlayers(players, champsView) {
    return [...players].sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name)
      if (champsView) {
        // 챔스: 출석자 먼저 → 이름순
        if (a.champsPresent !== b.champsPresent) return a.champsPresent ? -1 : 1
        return a.name.localeCompare(b.name)
      }
      return b.leagueRate - a.leagueRate // 리그 참석률순 (기본)
    })
  }

  // ✅ 팀 섹션 생성 (뷰별)
  function buildSections(champsView) {
    return teams.map(team => ({
      key: team.id,
      name: team.name,
      color: getTeamColor(team.name),
      players: sortPlayers(stats.filter(p => p.team === team.name), champsView),
    }))
  }

  // 📋 팀별 그리드 (리그/챔스 공용)
  function TeamGrid({ champsView }) {
    const sections = buildSections(champsView)
    return (
      <div className="grid grid-cols-3 gap-4">
        {sections.map(section => (
          <div
            key={section.key}
            className="rounded-xl border overflow-hidden"
            style={{
              borderColor: `${section.color}66`,
              background: `${section.color}14`,
            }}
          >
            {/* 섹션 헤더 (한 줄 고정) */}
            <div className="px-3 py-3 font-bold text-base border-b border-slate-700/50">
              <div className="flex items-center gap-1.5 min-w-0 whitespace-nowrap">
                <span
                  className="inline-block w-3.5 h-3.5 rounded-full flex-shrink-0"
                  style={{ background: section.color, border: '1px solid rgba(255,255,255,0.3)' }}
                ></span>
                <span className="truncate" style={{ color: section.color }}>
                  {section.name}
                  <span className="text-sm font-semibold ml-1">({section.players.length})</span>
                </span>
              </div>
            </div>

            {/* 선수 목록 */}
            <div className="p-2">
              {section.players.length === 0 ? (
                <p className="text-slate-500 text-sm px-2 py-3 text-center">선수 없음</p>
              ) : (
                <div className="space-y-1">
                  {section.players.map(player => {
                    const isMe = myPlayerId && player.id === myPlayerId
                    const isOpen = !champsView && popupPlayer?.id === player.id
                    return (
                      <div
                        key={player.id}
                        onClick={champsView ? undefined : (e) => handleRateClick(e, player)}
                        role={champsView ? undefined : 'button'}
                        className={`w-full flex items-center rounded-lg px-2 py-2 transition-colors border ${
                          isMe
                            ? 'bg-emerald-500/20 border-emerald-400 shadow-md shadow-emerald-500/20'
                            : 'bg-slate-800/50 border-transparent'
                        } ${
                          champsView ? '' : 'hover:bg-slate-700/60 cursor-pointer'
                        } ${
                          isOpen ? 'ring-1 ring-emerald-500' : ''
                        }`}
                        title={champsView ? '' : '클릭하면 상세 기록 보기'}
                      >
                        <span style={{ width: '30px', flexShrink: 0 }} aria-hidden="true"></span>

                        <span
                          className={`flex-1 min-w-0 text-sm text-center truncate px-0.5 ${isMe ? 'font-extrabold' : 'font-medium'}`}
                          style={{
                            color: isMe ? '#6ee7b7' : section.color,
                            opacity: champsView && !player.champsPresent ? 0.5 : 1,
                          }}
                        >
                          {player.name}
                        </span>

                        {champsView ? (
                          <span
                            className={`text-xs font-bold flex-shrink-0 text-right ${
                              player.champsPresent ? 'text-emerald-400' : 'text-slate-600'
                            }`}
                            style={{ width: '42px' }}
                          >
                            {player.champsPresent ? '✅ 출석' : '불참'}
                          </span>
                        ) : (
                          <span
                            className={`text-sm font-bold flex-shrink-0 text-right tabular-nums ${rateColor(player.leagueRate)}`}
                            style={{ width: '42px' }}
                          >
                            {player.leagueRate}%
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-white mb-2">📊 출석율</h1>
      <p className="text-slate-400 mb-4">
        {isChampsView ? '🏆 챔스' : '⚽ 리그'} 총 {totalGames}회 경기 기준
        {filterMode === 'season' && seasonLabel && (
          <span className="ml-2 text-emerald-400 font-semibold">· 시즌 {seasonLabel}</span>
        )}
      </p>

      {/* 기간 필터 */}
      <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 mb-4">
        <div className="flex flex-wrap gap-2">
          {[
            { key: 'all', label: '전체' },
            { key: 'season', label: `현 시즌${seasonLabel ? ` (${seasonLabel})` : ''}` },
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

        {/* 📅 기간 지정 - 클릭하면 바로 달력 */}
        {filterMode === 'range' && (
          <div className="flex flex-wrap items-end gap-3 mt-4">
            {/* 시작일 */}
            <div className="relative">
              <label className="block text-slate-400 text-xs mb-1.5">시작일</label>
              <button
                type="button"
                onClick={() => openDatePicker(startInputRef)}
                className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg px-4 py-2.5 text-white text-sm font-medium transition-colors min-w-[150px]"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="16" y1="2" x2="16" y2="6"></line>
                  <line x1="8" y1="2" x2="8" y2="6"></line>
                  <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
                <span className={startDate ? 'text-white' : 'text-slate-500'}>
                  {formatDate(startDate)}
                </span>
              </button>
              <input
                ref={startInputRef}
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                onKeyDown={(e) => e.preventDefault()}
                className="absolute opacity-0 pointer-events-none"
                style={{ left: 0, bottom: 0, width: '1px', height: '1px' }}
                tabIndex={-1}
              />
            </div>

            <div className="text-slate-400 pb-3">~</div>

            {/* 종료일 */}
            <div className="relative">
              <label className="block text-slate-400 text-xs mb-1.5">종료일</label>
              <button
                type="button"
                onClick={() => openDatePicker(endInputRef)}
                className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg px-4 py-2.5 text-white text-sm font-medium transition-colors min-w-[150px]"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="16" y1="2" x2="16" y2="6"></line>
                  <line x1="8" y1="2" x2="8" y2="6"></line>
                  <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
                <span className={endDate ? 'text-white' : 'text-slate-500'}>
                  {formatDate(endDate)}
                </span>
              </button>
              <input
                ref={endInputRef}
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                onKeyDown={(e) => e.preventDefault()}
                className="absolute opacity-0 pointer-events-none"
                style={{ left: 0, bottom: 0, width: '1px', height: '1px' }}
                tabIndex={-1}
              />
            </div>

            {/* 초기화 */}
            {(startDate || endDate) && (
              <button
                onClick={() => { setStartDate(''); setEndDate('') }}
                className="bg-slate-700/60 hover:bg-slate-600 text-slate-300 text-xs px-3 py-2.5 rounded-lg transition-colors"
              >
                ✕ 초기화
              </button>
            )}
          </div>
        )}

        {filterMode === 'range' && (!startDate || !endDate) && (
          <p className="text-slate-500 text-xs mt-2">📅 시작일과 종료일을 모두 선택해 주세요.</p>
        )}
      </div>

      {/* ⚽🏆 탭 */}
      <div className="flex gap-2 mb-4 bg-slate-800/60 border border-slate-700 rounded-xl p-1.5">
        {TABS.map((tab, i) => {
          const active = index === i
          const cnt = i === 0 ? leagueGames : champsGames
          return (
            <button
              key={tab.key}
              onClick={() => { setIndex(i); setPopupPlayer(null) }}
              className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-colors ${
                active
                  ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                  : 'text-slate-300 hover:bg-slate-700/60'
              }`}
            >
              {tab.label} <span className="font-normal opacity-80">({cnt})</span>
            </button>
          )
        })}
      </div>

      {/* 스와이프/드래그 힌트 */}
      <p className="text-slate-500 text-xs text-center mb-3">← 좌우로 넘기거나 드래그해서 전환 →</p>

      {/* ✅ 정렬 버튼 */}
      <div className="flex gap-2 mb-4">
        <span className="text-slate-400 text-sm py-2">정렬:</span>
        {[
          { key: 'rate', label: isChampsView ? '✅ 출석순' : '📊 참석률순' },
          { key: 'name', label: '🔤 이름순' },
        ].map(option => (
          <button
            key={option.key}
            onClick={() => setSortBy(option.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              sortBy === option.key
                ? 'bg-emerald-500 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* 슬라이드 영역 */}
      {loading ? (
        <div className="text-center py-20 text-slate-400">
          <p className="text-xl">⏳ 로딩 중...</p>
        </div>
      ) : (
        <div className="relative stats-container">
          <div
            ref={swipeAreaRef}
            className="overflow-hidden select-none"
            style={{ cursor: 'grab', touchAction: 'pan-y', overscrollBehaviorX: 'contain' }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseLeave}
          >
            <div
              className="flex transition-transform duration-300 ease-out"
              style={{ transform: `translateX(-${index * 100}%)` }}
            >
              {/* ⚽ 리그 */}
              <div className="w-full flex-shrink-0">
                <TeamGrid champsView={false} />
              </div>
              {/* 🏆 챔스 */}
              <div className="w-full flex-shrink-0">
                <TeamGrid champsView={true} />
              </div>
            </div>
          </div>

          {/* 하단 점 인디케이터 */}
          <div className="flex justify-center gap-2 mt-4">
            {TABS.map((tab, i) => (
              <button
                key={tab.key}
                onClick={() => { setIndex(i); setPopupPlayer(null) }}
                aria-label={tab.label}
                className="transition-all"
                style={{
                  width: index === i ? '24px' : '8px',
                  height: '8px',
                  borderRadius: '9999px',
                  background: index === i ? '#10b981' : '#475569',
                }}
              ></button>
            ))}
          </div>

          {/* 팝업 (리그 탭에서만) */}
          {popupPlayer && !isChampsView && (
            <div
              ref={popupRef}
              className="absolute z-50 bg-slate-800 border border-emerald-500/50 rounded-xl shadow-2xl shadow-black/50 w-[320px] max-w-[92vw] overflow-hidden"
              style={{
                top: popupPosition.top,
                left: popupPosition.left,
                transform: popupPosition.placement === 'above' ? 'translateY(-100%)' : 'none',
              }}
            >
              {/* 팝업 헤더 */}
              <div className="flex justify-center items-center px-2 py-2 border-b border-slate-700 relative">
  <h3 className="font-bold text-white text-sm">
    👤 {popupPlayer.name}
    {popupPlayer.team && (
      <span className="ml-1.5 text-xs font-normal" style={{ color: getTeamColor(popupPlayer.team) }}>
        · {popupPlayer.team}
      </span>
    )}
  </h3>
  <button
    onClick={() => setPopupPlayer(null)}
    className="text-slate-400 hover:text-white text-base leading-none absolute right-2"
  >
    ✕
  </button>
</div>

              {/* ⚽ 리그 요약 */}
              <div className="px-3 py-2 border-b border-slate-700 bg-emerald-500/5">
                <div className="flex items-baseline justify-center gap-3">
  <span className="text-emerald-300 text-xs font-bold">⚽ 리그 출석률</span>
  <span className={`text-xl font-black ${rateColor(popupPlayer.leagueRate)}`}>
    {popupPlayer.leagueRate}%
  </span>
</div>
                <div className="flex items-center justify-center gap-4">
  <p className="text-slate-400 text-[10px]">
    {popupPlayer.leaguePresent} / {leagueGames}회 참석
  </p>
  <p className="text-slate-500 text-[10px]">
    ✅{popupPlayer.leagueAttended} 🕐{popupPlayer.leagueLate} 🏃{popupPlayer.leagueEarly}
  </p>
</div>
              </div>

              {/* 날짜별 기록 — 매우 컴팩트 */}
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full border-collapse">
                  <thead className="sticky top-0 bg-slate-800 z-10">
                    <tr>
                      <th className="px-1.5 py-1 text-slate-400 text-[10px] font-medium text-center border-b border-slate-700">날짜</th>
                      <th className="px-1.5 py-1 text-slate-400 text-[10px] font-medium text-center border-b border-slate-700">라운드</th>
                      <th className="px-1.5 py-1 text-slate-400 text-[10px] font-medium text-center border-b border-slate-700">상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {popupRecords.map(record => {
                      const isChampsRec = champsDateSet.has(record.game_date)
                      const roundLabel = roundMap[record.game_date]
                      return (
                        <tr key={record.id} className="border-b border-slate-700/25 hover:bg-slate-700/20">
                          <td className="px-1.5 py-0.5 text-slate-200 text-[11px] whitespace-nowrap leading-tight text-center">
                            {record.game_date}
                          </td>
                          <td className="px-1.5 py-0.5 text-[11px] whitespace-nowrap leading-tight text-center">
                            {isChampsRec ? (
                              <span className="font-bold" style={{ color: '#fbbf24' }}>🏆챔스</span>
                            ) : roundLabel ? (
                              <span className="text-emerald-300 font-semibold">{roundLabel}</span>
                            ) : (
                              <span className="text-slate-600">-</span>
                            )}
                          </td>
                          <td className="px-1.5 py-0.5 text-center leading-tight">
                            <span className={`inline-block px-1 py-0 rounded text-[11px] ${statusBgColor(record.status)}`}>
                              {statusIcon(record.status)}{record.status}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {popupRecords.length === 0 && (
                  <p className="text-center text-slate-400 py-3 text-xs">기록 없음</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ⬇️ 하단 여백 (모바일 스크롤 여유) */}
      <div style={{ height: '70px', width: '100%' }} aria-hidden="true"></div>
    </div>
  )
}

export default AttendanceStats