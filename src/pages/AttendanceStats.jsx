import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

function AttendanceStats() {
  const { profile } = useAuth()
  // 🙋 본인 선수 id
  const myPlayerId = profile?.player_id || null

  const [stats, setStats] = useState([])
  const [allAttendance, setAllAttendance] = useState([])
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState('rate')
  const [totalGames, setTotalGames] = useState(0)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  // 🗓️ 기본값: 현 시즌
  const [filterMode, setFilterMode] = useState('season')
  const [seasonLabel, setSeasonLabel] = useState('')
  const [popupPlayer, setPopupPlayer] = useState(null)
  // placement: 'below' | 'above'
  const [popupPosition, setPopupPosition] = useState({ top: 0, left: 0, placement: 'below' })
  const popupRef = useRef(null)

  // 📅 날짜 입력 ref (클릭 시 달력 열기용)
  const startInputRef = useRef(null)
  const endInputRef = useRef(null)

  useEffect(() => {
    fetchStats()
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

    const { data: attendance } = await supabase
      .from('attendance')
      .select('*')
      .order('game_date', { ascending: false })

    const { data: players } = await supabase
      .from('players')
      .select('*')

    const { data: teamsData } = await supabase
      .from('teams')
      .select('*')
      .order('display_order')

    setTeams(teamsData || [])

    if (attendance && players) {
      setAllAttendance(attendance)
      let filtered = attendance

      if (filterMode === 'range') {
        if (startDate && endDate) {
          filtered = attendance.filter(a =>
            a.game_date >= startDate && a.game_date <= endDate
          )
        } else {
          filtered = []
        }
      } else if (filterMode === 'season') {
        // 🗓️ 현 시즌: matches에서 현재 시즌 경기 날짜를 가져와 그 날짜의 출석만 집계
        if (season) {
          const { data: seasonMatches } = await supabase
            .from('matches')
            .select('game_date')
            .eq('season', season)
          const seasonDates = new Set((seasonMatches || []).map(m => m.game_date))
          filtered = attendance.filter(a => seasonDates.has(a.game_date))
        } else {
          filtered = []
        }
      }
      // filterMode === 'all' 이면 전체 (필터 없음)

      const gameDates = [...new Set(filtered.map(a => a.game_date))]
      setTotalGames(gameDates.length)

      // ✅ 탈퇴한 선수(is_active === false) 제외
      const activePlayers = players.filter(p => p.is_active !== false)

      const playerStats = activePlayers.map(player => {
        const records = filtered.filter(a => a.player_id === player.id)
        const attended = records.filter(a => a.status === '출석').length
        const late = records.filter(a => a.status === '늦참').length
        const earlyLeave = records.filter(a => a.status === '조퇴').length
        const total = records.length
        const rate = gameDates.length > 0 ? Math.round(((attended + late + earlyLeave) / gameDates.length) * 100) : 0

        return {
          id: player.id,
          name: player.name,
          team: player.current_team,
          attended,
          late,
          earlyLeave,
          total,
          rate,
        }
      })

      setStats(playerStats)
    }
    setLoading(false)
  }

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

  // ✅ 참석률 클릭 시, 팝업 위치 계산 (좌우 보정 + 아래 공간 부족하면 이름 바로 위)
  function handleRateClick(e, player) {
    if (popupPlayer?.id === player.id) {
      setPopupPlayer(null)
      return
    }
    const container = e.currentTarget.closest('.relative')
    const containerRect = container.getBoundingClientRect()
    const btnRect = e.currentTarget.getBoundingClientRect()

    const popupWidth = 360
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

  const avgRate = stats.length > 0
    ? Math.round(stats.reduce((sum, s) => sum + s.rate, 0) / stats.length)
    : 0

  const popupRecords = popupPlayer
    ? allAttendance
        .filter(a => a.player_id === popupPlayer.id && ['출석', '늦참', '조퇴'].includes(a.status))
        .sort((a, b) => b.game_date.localeCompare(a.game_date))
    : []

  // ✅ 선택된 정렬 방식으로 선수 정렬
  function sortPlayers(players) {
    return [...players].sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name)
      return b.rate - a.rate // 참석률순 (기본)
    })
  }

  // ✅ 팀 섹션만 (미배정 제거)
  const sections = teams.map(team => ({
    key: team.id,
    name: team.name,
    color: getTeamColor(team.name),
    players: sortPlayers(stats.filter(p => p.team === team.name)),
  }))

  return (
    <div>
      <h1 className="text-3xl font-bold text-white mb-2">📊 출석율</h1>
      <p className="text-slate-400 mb-6">
        총 {totalGames}회 경기 기준
        {filterMode === 'season' && seasonLabel && (
          <span className="ml-2 text-emerald-400 font-semibold">· 시즌 {seasonLabel}</span>
        )}
      </p>

      {/* 기간 필터 */}
      <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 mb-6">
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
              {/* 실제 date input (숨김 · 달력만 사용) */}
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

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-white">{stats.length}</p>
          <p className="text-slate-400 text-sm">전체 선수</p>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-emerald-400">{totalGames}</p>
          <p className="text-slate-400 text-sm">총 경기 수</p>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-blue-400">{avgRate}%</p>
          <p className="text-slate-400 text-sm">평균 참석률</p>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-yellow-400">
            {stats.filter(s => s.rate >= 50).length}
          </p>
          <p className="text-slate-400 text-sm">50% 이상</p>
        </div>
      </div>

      {/* ✅ 정렬 버튼 */}
      <div className="flex gap-2 mb-4">
        <span className="text-slate-400 text-sm py-2">정렬:</span>
        {[
          { key: 'rate', label: '📊 참석률순' },
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

      {/* 팀별 섹션 - 가로 3개 (항상 3개 고정) */}
      {loading ? (
        <div className="text-center py-20 text-slate-400">
          <p className="text-xl">⏳ 로딩 중...</p>
        </div>
      ) : (
        <div className="relative">
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
                {/* 섹션 헤더 */}
                <div className="px-4 py-3 font-bold text-lg border-b border-slate-700/50">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block w-4 h-4 rounded-full flex-shrink-0"
                      style={{ background: section.color, border: '1px solid rgba(255,255,255,0.3)' }}
                    ></span>
                    <span style={{ color: section.color }}>
                      {section.name} ({section.players.length}명)
                    </span>
                  </div>
                </div>

                {/* 선수 목록 - 세로 1열 (이름 가운데, % 오른쪽 고정폭) */}
                <div className="p-2">
                  {section.players.length === 0 ? (
                    <p className="text-slate-500 text-sm px-2 py-3 text-center">선수 없음</p>
                  ) : (
                    <div className="space-y-1">
                      {section.players.map(player => {
                        const isMe = myPlayerId && player.id === myPlayerId
                        const isOpen = popupPlayer?.id === player.id
                        return (
                          <button
                            key={player.id}
                            onClick={(e) => handleRateClick(e, player)}
                            className={`w-full flex items-center bg-slate-800/50 hover:bg-slate-700/60 rounded-lg px-2 py-2 transition-colors ${
                              isOpen ? 'ring-1 ring-emerald-500' : isMe ? 'ring-1 ring-sky-400/60' : ''
                            }`}
                            title="클릭하면 상세 기록 보기"
                          >
                            {/* 왼쪽 균형 여백 (고정 폭) */}
                            <span style={{ width: '24px', flexShrink: 0 }} aria-hidden="true"></span>

                            {/* 이름 (가운데) - 팀 색상 */}
                            <span
                              className="flex-1 min-w-0 text-sm font-medium text-center truncate px-0.5"
                              style={{ color: section.color }}
                            >
                              {player.name}
                            </span>

                            {/* 참석률 % (오른쪽 · 고정 폭 · 우측정렬) */}
                            <span
                              className={`text-sm font-bold flex-shrink-0 text-right tabular-nums ${rateColor(player.rate)}`}
                              style={{ width: '38px' }}
                            >
                              {player.rate}%
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* 팝업 - 이름 바로 아래(기본) 또는 바로 위(아래 공간 부족 시) */}
          {popupPlayer && (
            <div
              ref={popupRef}
              className="absolute z-50 bg-slate-800 border border-emerald-500/50 rounded-xl shadow-2xl shadow-black/50 w-[360px] max-w-[90vw]"
              style={{
                top: popupPosition.top,
                left: popupPosition.left,
                transform: popupPosition.placement === 'above' ? 'translateY(-100%)' : 'none',
              }}
            >
              {/* 팝업 헤더 */}
              <div className="flex justify-between items-center px-4 py-3 border-b border-slate-700">
                <h3 className="font-bold text-white">
                  👤 {popupPlayer.name}
                  {popupPlayer.team && (
                    <span className="ml-2 text-sm font-normal" style={{ color: getTeamColor(popupPlayer.team) }}>
                      · {popupPlayer.team}
                    </span>
                  )}
                </h3>
                <button
                  onClick={() => setPopupPlayer(null)}
                  className="text-slate-400 hover:text-white text-lg"
                >
                  ✕
                </button>
              </div>

              {/* 개인 요약 - 출석/늦참/조퇴 */}
              <div className="grid grid-cols-3 gap-2 px-4 py-3 border-b border-slate-700">
                <div className="text-center">
                  <p className="text-sm font-bold text-emerald-400">{popupPlayer.attended || 0}</p>
                  <p className="text-xs text-slate-400">출석</p>
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-blue-400">{popupPlayer.late || 0}</p>
                  <p className="text-xs text-slate-400">늦참</p>
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-orange-400">{popupPlayer.earlyLeave || 0}</p>
                  <p className="text-xs text-slate-400">조퇴</p>
                </div>
              </div>

              {/* 날짜별 기록 - 출석/늦참/조퇴 */}
              <div className="max-h-48 overflow-y-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="px-4 py-2 text-slate-400 text-xs">날짜</th>
                      <th className="px-4 py-2 text-slate-400 text-xs">팀</th>
                      <th className="px-4 py-2 text-slate-400 text-xs">상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {popupRecords.map(record => (
                      <tr key={record.id} className="border-b border-slate-700/30 hover:bg-slate-700/20">
                        <td className="px-4 py-1.5 text-white text-xs">{record.game_date}</td>
                        <td className="px-4 py-1.5 text-slate-300 text-xs">{record.team}</td>
                        <td className="px-4 py-1.5">
                          <span className={`px-2 py-0.5 rounded-full text-xs ${statusBgColor(record.status)}`}>
                            {statusIcon(record.status)} {record.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {popupRecords.length === 0 && (
                  <p className="text-center text-slate-400 py-4 text-sm">기록 없음</p>
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