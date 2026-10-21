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

// 🔁 1000행 제한 회피: 전체 행을 페이지네이션으로 가져오기
async function fetchAllRows(table, columns = '*', orderCol = null, ascending = false) {
  const PAGE_SIZE = 1000
  let from = 0
  let all = []
  while (true) {
    let query = supabase.from(table).select(columns).range(from, from + PAGE_SIZE - 1)
    if (orderCol) query = query.order(orderCol, { ascending })
    const { data, error } = await query
    if (error) {
      console.error(`${table} 조회 실패:`, error.message)
      break
    }
    all = all.concat(data || [])
    if (!data || data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return all
}

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
    return now.getHours() >= sh + MATCH_DURATION_HOURS
  }
}

// 🔢 날짜별 라운드 라벨 맵 (시즌별로 1·2R부터 시작 · 챔스 제외)
function buildRoundMap(allMatches) {
  const champs = new Set(allMatches.filter(m => m.is_champions).map(m => m.game_date))

  const bySeasonDates = {}
  allMatches.forEach(m => {
    if (champs.has(m.game_date)) return
    const season = m.season || '_none'
    if (!bySeasonDates[season]) bySeasonDates[season] = new Set()
    bySeasonDates[season].add(m.game_date)
  })

  const map = {}
  Object.values(bySeasonDates).forEach(dateSet => {
    const dates = [...dateSet].sort()
    dates.forEach((d, i) => {
      const first = 1 + i * 2
      map[d] = `${first}·${first + 1}R`
    })
  })

  return map
}

function AttendanceStats() {
  const { profile } = useAuth()
  const myPlayerId = profile?.player_id || null

  const [stats, setStats] = useState([])
  const [allAttendance, setAllAttendance] = useState([])
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState('rate')
  const [leagueGames, setLeagueGames] = useState(0)
  const [champsGames, setChampsGames] = useState(0)
  const [champsDateSet, setChampsDateSet] = useState(new Set())
  const [roundMap, setRoundMap] = useState({})
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [filterMode, setFilterMode] = useState('season')
  const [index, setIndex] = useState(0)
  const [seasonLabel, setSeasonLabel] = useState('')
  const [popupPlayer, setPopupPlayer] = useState(null)
  const [popupPosition, setPopupPosition] = useState({ top: 0, left: 0, placement: 'below' })
  const popupRef = useRef(null)

  const [availableSeasons, setAvailableSeasons] = useState([])
  const [selectedSeason, setSelectedSeason] = useState('')

  const startX = useRef(null)
  const startY = useRef(null)
  const dragging = useRef(false)
  const decidedHorizontal = useRef(false)
  const decidedVertical = useRef(false)
  const swipeAreaRef = useRef(null)
  const indexRef = useRef(0)

  useEffect(() => {
    indexRef.current = index
  }, [index])

  const startInputRef = useRef(null)
  const endInputRef = useRef(null)

  useEffect(() => {
    fetchSeasons()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (selectedSeason) {
      fetchStats()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterMode, startDate, endDate, selectedSeason])

  useEffect(() => {
    function handleClickOutside(e) {
      if (popupRef.current && !popupRef.current.contains(e.target)) {
        setPopupPlayer(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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

  const HORIZONTAL_DECIDE_PX = 4
  const VERTICAL_DECIDE_PX = 6
  const SWIPE_COMPLETE_PX = 24

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
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    el.addEventListener('touchcancel', onTouchEnd, { passive: true })

    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [loading])

  async function fetchSeasons() {
    const { data: seasonRow } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'season_label')
      .single()
    const currentSeason = seasonRow?.value || ''
    setSeasonLabel(currentSeason)

    // 🔁 전체 조회 (season 목록용)
    const seasonData = await fetchAllRows('attendance', 'season')

    if (seasonData) {
      const seasonsFromAttendance = [...new Set(seasonData.map(a => a.season).filter(Boolean))]
      const allSeasons = new Set([...seasonsFromAttendance, currentSeason])
      const uniqueSeasons = [...allSeasons].filter(Boolean).sort().reverse()
      setAvailableSeasons(uniqueSeasons)
      setSelectedSeason(currentSeason)
    }
  }

  async function fetchStats() {
    setLoading(true)

    // 🔥 기본 데이터 조회 (경기/출석/예약)
    // 🔁 attendance는 1000행 제한 회피를 위해 전체 조회
    const [allAttendanceData, matchRes, resvRes] = await Promise.all([
      fetchAllRows('attendance', '*', 'game_date', false),
      supabase.from('matches').select('game_date, season, is_champions'),
      supabase.from('reservations').select('date, time, is_confirmed'),
    ])

    const allMatches = matchRes.data || []

    setRoundMap(buildRoundMap(allMatches))

    const isFinished = makeIsFinished(resvRes.data)

    const allChampsDates = new Set(allMatches.filter(m => m.is_champions).map(m => m.game_date))
    setChampsDateSet(allChampsDates)

    // ── 🔥 시즌별 팀/선수 데이터 결정 ──
    let teams = []
    let players = []
    let playerTeamMap = {}

    if (filterMode === 'season' && selectedSeason) {
      if (selectedSeason === seasonLabel) {
        const [teamRes, playerRes] = await Promise.all([
          supabase.from('teams').select('*').order('display_order'),
          supabase.from('players').select('id, name, current_team').neq('is_active', false),
        ])
        teams = teamRes.data || []
        players = playerRes.data || []

        players.forEach(p => {
          playerTeamMap[p.id] = p.current_team
        })
      } else {
        const { data: archiveData } = await supabase
          .from('season_archives')
          .select('roster_records')
          .eq('season', selectedSeason)
          .single()

        if (archiveData?.roster_records) {
          const roster = archiveData.roster_records

          teams = roster.map((teamData, idx) => ({
            id: `legacy-team-${idx}`,
            name: teamData.team,
            color: '#94a3b8',
            display_order: idx + 1,
          }))

          const playerNameToTeam = {}
          roster.forEach(teamData => {
            teamData.players.forEach(playerName => {
              playerNameToTeam[playerName] = teamData.team
            })
          })

          const { data: allPlayers } = await supabase
            .from('players')
            .select('id, name')

          if (allPlayers) {
            const rosterPlayerNames = new Set()
            roster.forEach(teamData => {
              teamData.players.forEach(name => rosterPlayerNames.add(name))
            })

            players = allPlayers
              .filter(p => rosterPlayerNames.has(p.name))
              .map(p => ({
                id: p.id,
                name: p.name,
                current_team: playerNameToTeam[p.name] || '미배정'
              }))

            players.forEach(p => {
              playerTeamMap[p.id] = p.current_team
            })
          }
        }
      }
    } else {
      const [teamRes, playerRes] = await Promise.all([
        supabase.from('teams').select('*').order('display_order'),
        supabase.from('players').select('id, name, current_team').neq('is_active', false),
      ])
      teams = teamRes.data || []
      players = playerRes.data || []

      players.forEach(p => {
        playerTeamMap[p.id] = p.current_team
      })
    }

    setTeams(teams)

    // ── 기간 필터에 해당하는 경기 목록 추리기 ──
    let scopedMatches = allMatches

    if (filterMode === 'season') {
      scopedMatches = selectedSeason ? allMatches.filter(m => m.season === selectedSeason) : []
    } else if (filterMode === 'range') {
      scopedMatches = (startDate && endDate)
        ? allMatches.filter(m => m.game_date >= startDate && m.game_date <= endDate)
        : []
    }

    const finishedMatches = scopedMatches.filter(m => isFinished(m.game_date))

    const leagueDates = new Set(finishedMatches.filter(m => !m.is_champions).map(m => m.game_date))
    const champsDates = new Set(finishedMatches.filter(m => m.is_champions).map(m => m.game_date))

    setLeagueGames(leagueDates.size)
    setChampsGames(champsDates.size)

    // 🔥 출석 데이터도 같은 기간으로 필터링
    let attendance = allAttendanceData
    if (filterMode === 'season' && selectedSeason) {
      attendance = allAttendanceData.filter(a => a.season === selectedSeason)
    } else if (filterMode === 'range' && startDate && endDate) {
      attendance = allAttendanceData.filter(a => a.game_date >= startDate && a.game_date <= endDate)
    }

    setAllAttendance(attendance)

    // ✅ 선수별 통계 계산
    const PRESENT = ['출석', '늦참', '조퇴']
    const playerStatsMap = {}

    players.forEach(p => {
      playerStatsMap[p.id] = {
        id: p.id,
        name: p.name,
        team: playerTeamMap[p.id] || '미배정',
        leagueAttended: 0,
        leagueLate: 0,
        leagueEarly: 0,
        leaguePresent: 0,
        champsPresent: false,
      }
    })

    attendance.forEach(record => {
      const pid = record.player_id
      if (!pid) return

      if (!playerStatsMap[pid]) {
        playerStatsMap[pid] = {
          id: pid,
          name: record.player_name,
          team: playerTeamMap[pid] || '미배정',
          leagueAttended: 0,
          leagueLate: 0,
          leagueEarly: 0,
          leaguePresent: 0,
          champsPresent: false,
        }
      }

      const isLeague = leagueDates.has(record.game_date)
      const isChamps = champsDates.has(record.game_date)

      if (isLeague && PRESENT.includes(record.status)) {
        playerStatsMap[pid].leaguePresent++
        if (record.status === '출석') playerStatsMap[pid].leagueAttended++
        if (record.status === '늦참') playerStatsMap[pid].leagueLate++
        if (record.status === '조퇴') playerStatsMap[pid].leagueEarly++
      }

      if (isChamps && PRESENT.includes(record.status)) {
        playerStatsMap[pid].champsPresent = true
      }
    })

    const playerStats = Object.values(playerStatsMap).map(p => ({
      ...p,
      leagueRate: leagueDates.size > 0 ? Math.round((p.leaguePresent / leagueDates.size) * 100) : 0,
    }))

    setStats(playerStats)
    setLoading(false)
  }

  const isChampsView = index === 1
  const totalGames = isChampsView ? champsGames : leagueGames

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

  function formatDate(d) {
    if (!d) return '날짜 선택'
    const [y, m, day] = d.split('-')
    return `${y}. ${m}. ${day}.`
  }

  function openDatePicker(ref) {
    if (!ref.current) return
    if (typeof ref.current.showPicker === 'function') {
      ref.current.showPicker()
    } else {
      ref.current.focus()
      ref.current.click()
    }
  }

  function getTeamColor(teamName) {
    const team = teams.find(t => t.name === teamName)
    const color = team?.color || '#94a3b8'
    const c = color.toLowerCase()
    if (c === '#1d4ed8' || c === '#2563eb' || c === '#1e40af' || c === '#1e3a8a') {
      return '#60a5fa'
    }
    return color
  }

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

    let left = btnRect.left - containerRect.left
    const popupRightOnScreen = btnRect.left + popupWidth
    if (popupRightOnScreen > window.innerWidth - margin) {
      const overflow = popupRightOnScreen - (window.innerWidth - margin)
      left = left - overflow
    }
    if (left < 0) left = 0

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

  const rateColor = (rate) => {
    return rate >= 50 ? 'text-emerald-400' : 'text-red-400'
  }

  const statusIcon = (s) => {
    switch(s) {
      case '출석': return '🔵'
      case '조퇴': return '🏃'
      case '늦참': return '⏰'
      default: return ''
    }
  }

  const statusBgColor = (s) => {
    switch(s) {
      case '출석': return 'bg-blue-500/10 text-blue-400'
      case '조퇴': return 'bg-emerald-500/10 text-emerald-400'
      case '늦참': return 'bg-yellow-500/10 text-yellow-400'
      case '불참': return 'bg-red-500/10 text-red-400'
      default: return 'bg-slate-500/10 text-slate-400'
    }
  }

  const popupRecords = popupPlayer
    ? allAttendance
        .filter(a => a.player_id === popupPlayer.id && ['출석', '늦참', '조퇴'].includes(a.status))
        .sort((a, b) => b.game_date.localeCompare(a.game_date))
    : []

  function sortPlayers(players, champsView) {
    return [...players].sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name)
      if (champsView) {
        if (a.champsPresent !== b.champsPresent) return a.champsPresent ? -1 : 1
        return a.name.localeCompare(b.name)
      }
      return b.leagueRate - a.leagueRate
    })
  }

  function buildSections(champsView) {
    return teams.map(team => ({
      key: team.id,
      name: team.name,
      color: getTeamColor(team.name),
      players: sortPlayers(stats.filter(p => p.team === team.name), champsView),
    }))
  }

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
      <h1 className="text-3xl font-bold text-white mb-2">📊 출석률</h1>
      <p className="text-slate-400 mb-4">
        {isChampsView ? '🏆 챔스' : '⚽ 리그'} 총 {totalGames}회 경기 기준
        {filterMode === 'season' && selectedSeason && (
          <span className="ml-2 text-emerald-400 font-semibold">· 시즌 {selectedSeason}</span>
        )}
      </p>

      <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 mb-4">
        <div className="flex flex-wrap gap-2 mb-3">
          {[
            { key: 'all', label: '전체' },
            { key: 'season', label: '시즌별' },
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

        {filterMode === 'season' && (
          <div className="mt-3">
            <label className="block text-slate-400 text-xs mb-1.5">시즌 선택</label>
            <select
              value={selectedSeason}
              onChange={(e) => setSelectedSeason(e.target.value)}
              className="w-full sm:max-w-xs bg-slate-700 border border-slate-600 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-emerald-500"
            >
              {availableSeasons.map(season => (
                <option key={season} value={season}>
                  {season} {season === seasonLabel && '(현재)'}
                </option>
              ))}
            </select>
          </div>
        )}

        {filterMode === 'range' && (
          <div className="flex flex-wrap items-end gap-3 mt-4">
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

      <p className="text-slate-500 text-xs text-center mb-3">← 좌우로 넘기거나 드래그해서 전환 →</p>

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
              <div className="w-full flex-shrink-0">
                <TeamGrid champsView={false} />
              </div>
              <div className="w-full flex-shrink-0">
                <TeamGrid champsView={true} />
              </div>
            </div>
          </div>

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
                    🔵{popupPlayer.leagueAttended} 🏃{popupPlayer.leagueEarly} ⏰{popupPlayer.leagueLate}
                  </p>
                </div>
              </div>

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

      <div style={{ height: '70px', width: '100%' }} aria-hidden="true"></div>
    </div>
  )
}

export default AttendanceStats