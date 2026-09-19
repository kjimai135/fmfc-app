import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const WEEK_LABELS = ['월', '화', '수', '목', '금', '토', '일']

function toKey(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const PRESENT_STATUSES = ['참석', '늦참', '조퇴']

function statusEmoji(response) {
  if (response === '늦참') return '⏰'
  if (response === '조퇴') return '🏃'
  return ''
}

const TABS = [
  { key: 'assign', label: '🚦 심판 배정' },
  { key: 'stats', label: '📊 배정 현황' },
]

function RefereeAssign() {
  const { role } = useAuth()
  const canAssign = role === 'admin' || role === 'executive'

  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [matches, setMatches] = useState([])
  const [teams, setTeams] = useState([])
  const [attendees, setAttendees] = useState([])
  const [assignments, setAssignments] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [currentSeason, setCurrentSeason] = useState('')

  const [index, setIndex] = useState(0)

  const [statsPeriod, setStatsPeriod] = useState('season')
  const [statsSort, setStatsSort] = useState('count')
  const [allAssignments, setAllAssignments] = useState([])
  const [statsLoading, setStatsLoading] = useState(false)

  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerYM, setPickerYM] = useState(() => {
    const [y, m] = new Date().toISOString().split('T')[0].split('-').map(Number)
    return { year: y, month: m }
  })
  const pickerRef = useRef(null)

  const dragStartX = useRef(null)
  const dragStartY = useRef(null)
  const isDragging = useRef(false)
  const isHorizontal = useRef(false)

  useEffect(() => {
    fetchCurrentSeason()
    fetchTeams()
  }, [])

  useEffect(() => {
    if (selectedDate) fetchData(selectedDate)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate])

  useEffect(() => {
    if (index === 1) fetchAllAssignments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index])

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
    const { data } = await supabase.from('teams').select('*').order('display_order')
    setTeams(data || [])
  }

  async function fetchData(date) {
    setLoading(true)
    const { data: matchData } = await supabase
      .from('matches')
      .select('*')
      .eq('game_date', date)
      .order('match_number')
    setMatches(matchData || [])

    const { data: pollData } = await supabase
      .from('polls')
      .select('id')
      .eq('game_date', date)

    let attendeeList = []
    if (pollData && pollData.length > 0) {
      const pollIds = pollData.map(p => p.id)
      const { data: respData } = await supabase
        .from('poll_responses')
        .select('player_id, player_name, team, response')
        .in('poll_id', pollIds)
      attendeeList = (respData || [])
        .filter(r => PRESENT_STATUSES.includes(r.response))
        .map(r => ({
          player_id: r.player_id,
          name: r.player_name,
          team: r.team,
          response: r.response,
        }))
    }
    setAttendees(attendeeList)

    const { data: refData } = await supabase
      .from('referee_assignments')
      .select('*')
      .eq('game_date', date)
    setAssignments(refData || [])
    setLoading(false)
  }

  async function fetchAllAssignments() {
    setStatsLoading(true)
    const { data } = await supabase.from('referee_assignments').select('*')
    setAllAssignments(data || [])
    setStatsLoading(false)
  }

  function getStatusColor(response) {
    switch (response) {
      case '참석': return '#4ade80'
      case '늦참': return '#facc15'
      case '조퇴': return '#fb923c'
      default: return '#e2e8f0'
    }
  }

  function getTeamColor(teamName) {
    const team = teams.find(t => t.name === teamName)
    const color = team?.color || '#94a3b8'
    const c = color.toLowerCase()
    if (c === '#1d4ed8' || c === '#2563eb' || c === '#1e40af' || c === '#1e3a8a') return '#60a5fa'
    return color
  }

  function getRefereeTeam(match) {
    const playing = new Set([match.team_a, match.team_b])
    return teams.map(t => t.name).find(name => !playing.has(name)) || null
  }

  function getCandidates(match) {
    const refTeam = getRefereeTeam(match)
    if (!refTeam) return []
    return attendees.filter(a => a.team === refTeam)
  }

  function getSlotPlayerId(matchNumber, r, subIndex) {
    const list = assignments.filter(a => a.match_number === matchNumber && a.role === r)
    if (r === '주심') return list[0]?.player_id || ''
    return list[subIndex]?.player_id || ''
  }

  function assignSlot(match, r, subIndex, playerId) {
    if (!canAssign) return
    const mn = match.match_number
    setAssignments(prev => {
      let list = [...prev]
      if (r === '주심') {
        list = list.filter(a => !(a.match_number === mn && a.role === '주심'))
      } else {
        const subs = list.filter(a => a.match_number === mn && a.role === '부심')
        const target = subs[subIndex]
        if (target) list = list.filter(a => a !== target)
      }
      if (!playerId) return list
      const dup = list.some(a => a.match_number === mn && a.player_id === playerId)
      if (dup) {
        alert('이 선수는 같은 쿼터에서 이미 다른 심판으로 배정되어 있습니다.')
        return prev
      }
      const candidate = getCandidates(match).find(c => c.player_id === playerId)
      if (!candidate) return list
      return [...list, {
        game_date: selectedDate,
        match_number: mn,
        role: r,
        player_id: candidate.player_id,
        player_name: candidate.name,
        team: candidate.team,
        season: currentSeason || null,
      }]
    })
  }

  async function saveAssignments() {
    if (!canAssign) return
    setSaving(true)
    const { error: delErr } = await supabase
      .from('referee_assignments')
      .delete()
      .eq('game_date', selectedDate)
    if (delErr) {
      alert('저장 실패: ' + delErr.message)
      setSaving(false)
      return
    }
    const rows = assignments.map(a => ({
      game_date: selectedDate,
      match_number: a.match_number,
      role: a.role,
      player_id: a.player_id,
      player_name: a.player_name,
      team: a.team,
      season: a.season || currentSeason || null,
    }))
    if (rows.length > 0) {
      const { error: insErr } = await supabase.from('referee_assignments').insert(rows)
      if (insErr) {
        alert('저장 실패: ' + insErr.message)
        setSaving(false)
        return
      }
    }
    setSaving(false)
    alert('✅ 심판 배정이 저장되었습니다!')
    fetchData(selectedDate)
  }

  function resetAssignments() {
    if (!canAssign) return
    if (!window.confirm('현재 화면의 선택을 모두 지우시겠습니까?\n(저장 안 하면 기존 저장 내용 유지)')) return
    setAssignments([])
  }

  function formatDate(d) {
    if (!d) return ''
    const [y, m, day] = d.split('-')
    return `${y}. ${m}. ${day}.`
  }

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
  function openPicker() {
    const [y, m] = selectedDate.split('-').map(Number)
    setPickerYM({ year: y, month: m })
    setPickerOpen(v => !v)
  }

  function buildRefStats() {
    let source = allAssignments
    if (statsPeriod === 'season' && currentSeason) {
      source = allAssignments.filter(a => a.season === currentSeason)
    }
    const map = {}
    source.forEach(a => {
      const pid = a.player_id
      if (!pid) return
      if (!map[pid]) {
        map[pid] = { player_id: pid, name: a.player_name, team: a.team || '미배정', main: 0, sub: 0 }
      }
      if (a.role === '주심') map[pid].main++
      else if (a.role === '부심') map[pid].sub++
    })
    let list = Object.values(map).map(x => ({ ...x, total: x.main + x.sub }))
    if (statsSort === 'name') {
      list.sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    } else if (statsSort === 'team') {
      list.sort((a, b) => a.team !== b.team ? a.team.localeCompare(b.team, 'ko') : b.total - a.total)
    } else {
      list.sort((a, b) => b.total !== a.total ? b.total - a.total : a.name.localeCompare(b.name, 'ko'))
    }
    return list
  }

  // 드래그/스와이프
  function handleDragStart(clientX, clientY) {
    dragStartX.current = clientX
    dragStartY.current = clientY
    isDragging.current = true
    isHorizontal.current = false
  }
  function handleDragMove(clientX, clientY) {
    if (!isDragging.current || dragStartX.current === null) return
    const dx = clientX - dragStartX.current
    const dy = clientY - dragStartY.current
    if (!isHorizontal.current && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
      isHorizontal.current = true
    }
  }
  function handleDragEnd(clientX) {
    if (!isDragging.current || dragStartX.current === null) {
      isDragging.current = false
      return
    }
    const dx = clientX - dragStartX.current
    if (isHorizontal.current && Math.abs(dx) > 50) {
      if (dx < 0 && index < TABS.length - 1) setIndex(index + 1)
      else if (dx > 0 && index > 0) setIndex(index - 1)
    }
    dragStartX.current = null
    dragStartY.current = null
    isDragging.current = false
    isHorizontal.current = false
  }

  const calendarCells = buildCalendar(pickerYM.year, pickerYM.month)
  const todayKey = toKey(new Date())
  const stats = buildRefStats()

  // 📋 통합표용: 쿼터별 셀렉트 렌더
  function renderCell(match, r, subIndex) {
    const candidates = getCandidates(match)
    const value = getSlotPlayerId(match.match_number, r, subIndex)
    const selected = candidates.find(c => c.player_id === value)
    const used = new Set(
      assignments
        .filter(a => a.match_number === match.match_number && a.player_id !== value)
        .map(a => a.player_id)
    )
    return (
      <select
        value={value}
        onChange={(e) => assignSlot(match, r, subIndex, e.target.value)}
        onMouseDown={(e) => e.stopPropagation()}
        disabled={!canAssign || candidates.length === 0}
                className="w-full bg-slate-900/70 border border-slate-600 rounded-lg px-2 py-4 text-lg font-bold focus:outline-none focus:border-emerald-500 disabled:opacity-40"
        style={{ color: selected ? getStatusColor(selected.response) : '#94a3b8' }}
      >
        <option value="">-</option>
        {candidates.map(c => (
          <option key={c.player_id} value={c.player_id} disabled={used.has(c.player_id)}>
            {c.name}{statusEmoji(c.response) ? statusEmoji(c.response) : ''}{used.has(c.player_id) ? '(배정)' : ''}
          </option>
        ))}
      </select>
    )
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-4">
        <h1 className="text-3xl font-bold text-white">🚦 심판 배정</h1>
        {currentSeason && (
          <p className="text-slate-400 text-sm mt-1">
            🗓️ 현재 시즌: <span className="text-emerald-400 font-semibold">{currentSeason}</span>
          </p>
        )}
      </div>

      {!canAssign && (
        <div className="bg-sky-500/10 border border-sky-500/30 rounded-xl px-4 py-3 mb-4 text-sky-200 text-sm">
          👀 열람 전용입니다. 심판 배정은 관리자·임원만 가능합니다.
        </div>
      )}

      {/* 탭 */}
      <div className="flex gap-2 mb-3 bg-slate-800/60 border border-slate-700 rounded-xl p-1.5">
        {TABS.map((tab, i) => (
          <button
            key={tab.key}
            onClick={() => setIndex(i)}
            className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-colors ${
              index === i ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-slate-300 hover:bg-slate-700/60'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <p className="text-slate-500 text-xs text-center mb-3">← 좌우로 넘겨서 전환 →</p>

      {/* 날짜 선택 (배정 탭) */}
      {index === 0 && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-4 mb-4">
          <div className="relative inline-block" ref={pickerRef}>
            <button type="button" onClick={openPicker}
              className="flex items-center gap-2 bg-slate-900 hover:bg-slate-700 border border-slate-600 text-white px-5 py-2 rounded-xl font-semibold transition-colors">
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
              <div className="absolute left-0 mt-2 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl p-3" style={{ zIndex: 60, width: '300px' }}>
                <div className="flex items-center justify-between mb-2">
                  <button type="button" onClick={prevMonth} className="text-slate-300 hover:text-white px-3 py-1.5 rounded-lg hover:bg-slate-700">◀</button>
                  <span className="text-white font-bold">{pickerYM.year}년 {pickerYM.month}월</span>
                  <button type="button" onClick={nextMonth} className="text-slate-300 hover:text-white px-3 py-1.5 rounded-lg hover:bg-slate-700">▶</button>
                </div>
                <div className="grid grid-cols-7 mb-1">
                  {WEEK_LABELS.map((w, i) => (
                    <div key={w} className="text-center text-[11px] font-bold py-1" style={{ color: i === 6 ? '#f87171' : i === 5 ? '#60a5fa' : '#94a3b8' }}>{w}</div>
                  ))}
                </div>
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
                      <button key={idx} type="button" onClick={() => pickDate(d)}
                        className="aspect-square rounded-lg text-sm font-medium flex items-center justify-center transition-colors"
                        style={{
                          background: isSelected ? '#10b981' : isToday ? 'rgba(16,185,129,0.18)' : 'transparent',
                          color: isSelected ? '#ffffff' : color,
                          opacity: inMonth ? 1 : 0.35,
                          fontWeight: isToday || isSelected ? 800 : 500,
                        }}>
                        {d.getDate()}
                      </button>
                    )
                  })}
                </div>
                <button type="button" onClick={() => pickDate(new Date())} className="w-full mt-2 bg-slate-700 hover:bg-slate-600 text-emerald-300 text-sm font-semibold py-2 rounded-lg">
                  📍 오늘로 이동
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 슬라이드 영역 */}
      <div
        className="overflow-hidden select-none"
        style={{ touchAction: 'pan-y', cursor: 'grab' }}
        onMouseDown={(e) => handleDragStart(e.clientX, e.clientY)}
        onMouseMove={(e) => { if (isDragging.current) handleDragMove(e.clientX, e.clientY) }}
        onMouseUp={(e) => handleDragEnd(e.clientX)}
        onMouseLeave={(e) => { if (isDragging.current) handleDragEnd(e.clientX) }}
        onTouchStart={(e) => handleDragStart(e.touches[0].clientX, e.touches[0].clientY)}
        onTouchMove={(e) => { if (isDragging.current) handleDragMove(e.touches[0].clientX, e.touches[0].clientY) }}
        onTouchEnd={(e) => handleDragEnd(e.changedTouches[0].clientX)}
      >
        <div className="flex transition-transform duration-300 ease-out" style={{ transform: `translateX(-${index * 100}%)` }}>
          {/* ── 배정 탭 (통합표) ── */}
          <div className="w-full flex-shrink-0 px-0.5">
            {loading ? (
              <div className="text-center py-20 text-slate-400">⏳ 불러오는 중...</div>
            ) : matches.length === 0 ? (
              <div className="text-center py-20 text-slate-400 bg-slate-800/40 border border-dashed border-slate-700 rounded-2xl">
                <p className="text-4xl mb-3">⚽</p>
                <p className="text-white font-semibold">해당 날짜에 생성된 경기가 없습니다</p>
                <p className="text-sm mt-1">먼저 "경기생성 및 기록"에서 경기를 생성해주세요.</p>
              </div>
            ) : attendees.length === 0 ? (
              <div className="text-center py-20 text-slate-400 bg-slate-800/40 border border-dashed border-slate-700 rounded-2xl">
                <p className="text-4xl mb-3">🗳️</p>
                <p className="text-white font-semibold">투표 참석자 정보가 없습니다</p>
                <p className="text-sm mt-1">투표에서 참석/늦참/조퇴한 선수가 있어야 심판을 배정할 수 있습니다.</p>
              </div>
            ) : (
              <>
                {/* 범례 */}
                <div className="flex flex-wrap items-center gap-3 mb-2 text-xs bg-slate-800/40 border border-slate-700 rounded-xl px-3 py-1.5">
                  <span className="text-slate-400">색상:</span>
                  <span className="flex items-center gap-1"><span style={{ color: '#4ade80' }}>●</span> 참석</span>
                  <span className="flex items-center gap-1"><span style={{ color: '#facc15' }}>●</span> ⏰늦참</span>
                  <span className="flex items-center gap-1"><span style={{ color: '#fb923c' }}>●</span> 🏃조퇴</span>
                </div>

                                {/* 📋 통합 표 */}
                <div className="bg-slate-800/60 border border-slate-700 rounded-xl overflow-hidden">
                  <table className="w-full" style={{ tableLayout: 'fixed' }}>
                    <colgroup>
                      <col style={{ width: '9%' }} />
                      <col style={{ width: '25%' }} />
                      <col style={{ width: '22%' }} />
                      <col style={{ width: '22%' }} />
                      <col style={{ width: '22%' }} />
                    </colgroup>
                    <thead>
                      <tr className="bg-slate-900/60 border-b border-slate-700 text-slate-300 text-xs">
                        <th className="px-1 py-3 text-center">쿼터</th>
                        <th className="px-1 py-3 text-center">경기</th>
                        <th className="px-1 py-3 text-center text-yellow-300">👨‍⚖️주심</th>
                        <th className="px-1 py-3 text-center text-sky-300">🚩부심①</th>
                        <th className="px-1 py-3 text-center text-sky-300">🚩부심②</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matches.map(match => {
                        const refTeam = getRefereeTeam(match)
                        const candidates = getCandidates(match)
                        const colorA = getTeamColor(match.team_a)
                        const colorB = getTeamColor(match.team_b)
                        const refColor = refTeam ? getTeamColor(refTeam) : '#94a3b8'
                        return (
                                                    <tr key={match.id} className="border-b border-slate-700/40">
                            {/* 쿼터 */}
                            <td className="px-1 py-6 text-center font-extrabold text-emerald-400 text-2xl">
                              {match.match_number}Q
                            </td>
                                                        {/* 대진 */}
                            <td className="px-1 py-6 text-center leading-tight">
                              <div className="text-base whitespace-nowrap">
                                <span style={{ color: colorA }} className="font-bold">{match.team_a}</span>
                                <span className="text-slate-500 mx-0.5">:</span>
                                <span style={{ color: colorB }} className="font-bold">{match.team_b}</span>
                              </div>
                            </td>
                            {/* 주심 */}
                            <td className="px-1 py-6">{renderCell(match, '주심', 0)}</td>
                            {/* 부심1 */}
                            <td className="px-1 py-6">{renderCell(match, '부심', 0)}</td>
                            {/* 부심2 */}
                            <td className="px-1 py-6">{renderCell(match, '부심', 1)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* 저장 / 리셋 */}
                {canAssign && (
                  <div className="mt-4 flex gap-3">
                    <button onClick={resetAssignments} disabled={saving}
                      className="bg-slate-700 hover:bg-slate-600 text-slate-200 px-6 py-3 rounded-xl font-bold transition-colors disabled:opacity-50 whitespace-nowrap">
                      🔄 초기화
                    </button>
                    <button onClick={saveAssignments} disabled={saving}
                      className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-xl font-bold transition-colors disabled:opacity-50 shadow-lg shadow-emerald-500/20">
                      {saving ? '저장 중...' : '💾 심판 배정 저장'}
                    </button>
                  </div>
                )}
                <p className="text-slate-500 text-xs mt-2 text-center">
                  ※ 선택 즉시 반영됩니다. 저장 버튼을 눌러야 최종 저장됩니다.
                </p>
              </>
            )}
          </div>

          {/* ── 현황 탭 ── */}
          <div className="w-full flex-shrink-0 px-0.5">
            <div className="flex gap-2 mb-3">
              {[
                { key: 'season', label: `이번 시즌${currentSeason ? ` (${currentSeason})` : ''}` },
                { key: 'all', label: '전체 시즌' },
              ].map(opt => (
                <button key={opt.key} onClick={() => setStatsPeriod(opt.key)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    statsPeriod === opt.key ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}>
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="flex gap-2 mb-4">
              <span className="text-slate-400 text-sm py-1.5">정렬:</span>
              {[
                { key: 'count', label: '📊 횟수순' },
                { key: 'name', label: '🔤 이름순' },
                { key: 'team', label: '👥 팀별' },
              ].map(opt => (
                <button key={opt.key} onClick={() => setStatsSort(opt.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    statsSort === opt.key ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
                  }`}>
                  {opt.label}
                </button>
              ))}
            </div>

            {statsLoading ? (
              <div className="text-center py-20 text-slate-400">⏳ 불러오는 중...</div>
            ) : stats.length === 0 ? (
              <div className="text-center py-20 text-slate-400 bg-slate-800/40 border border-dashed border-slate-700 rounded-2xl">
                <p className="text-4xl mb-3">📊</p>
                <p className="text-white font-semibold">심판 배정 기록이 없습니다</p>
              </div>
            ) : (
              <div className="bg-slate-800/60 border border-slate-700 rounded-2xl overflow-hidden">
                <table className="w-full text-sm">
                                      <thead>
                      <tr className="bg-slate-900/60 border-b border-slate-700 text-slate-300 text-sm">
                        <th className="px-1 py-3.5 text-center">쿼터</th>
                        <th className="px-1 py-3.5 text-center">대진/심판팀</th>
                        <th className="px-1 py-3.5 text-center text-yellow-300">👨‍⚖️주심</th>
                        <th className="px-1 py-3.5 text-center text-sky-300">🚩부심①</th>
                        <th className="px-1 py-3.5 text-center text-sky-300">🚩부심②</th>
                      </tr>
                    </thead>
                  <tbody>
                    {stats.map((s, idx) => {
                      const tColor = getTeamColor(s.team)
                      return (
                        <tr key={s.player_id} className={`border-b border-slate-700/40 ${idx % 2 === 0 ? 'bg-slate-900/20' : ''}`}>
                          <td className="px-3 py-2.5 text-left font-medium text-white">{s.name}</td>
                          <td className="px-2 py-2.5 text-center"><span className="text-xs font-bold" style={{ color: tColor }}>{s.team}</span></td>
                          <td className="px-2 py-2.5 text-center text-yellow-300 font-bold">{s.main}</td>
                          <td className="px-2 py-2.5 text-center text-sky-300 font-bold">{s.sub}</td>
                          <td className="px-3 py-2.5 text-center text-white font-black text-base">{s.total}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-slate-500 text-xs mt-2">※ 저장된 심판 배정 기준입니다. (형평성 참고용)</p>
          </div>
        </div>
      </div>

      {/* 점 인디케이터 */}
      <div className="flex justify-center gap-2 mt-4">
        {TABS.map((tab, i) => (
          <button key={tab.key} onClick={() => setIndex(i)} aria-label={tab.label}
            className="transition-all"
            style={{ width: index === i ? '24px' : '8px', height: '8px', borderRadius: '9999px', background: index === i ? '#10b981' : '#475569' }} />
        ))}
      </div>

      <div style={{ height: '70px', width: '100%' }} aria-hidden="true"></div>
    </div>
  )
}

export default RefereeAssign