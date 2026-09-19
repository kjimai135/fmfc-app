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

// 상태 이모지
function statusEmoji(response) {
  if (response === '늦참') return '⏰'
  if (response === '조퇴') return '🏃'
  return ''
}

function RefereeAssign() {
  const { role } = useAuth()
  const canAssign = role === 'admin' || role === 'executive'

  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split('T')[0]
  )
  const [matches, setMatches] = useState([])
  const [teams, setTeams] = useState([])
  const [attendees, setAttendees] = useState([])
  const [assignments, setAssignments] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [currentSeason, setCurrentSeason] = useState('')

  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerYM, setPickerYM] = useState(() => {
    const [y, m] = new Date().toISOString().split('T')[0].split('-').map(Number)
    return { year: y, month: m }
  })
  const pickerRef = useRef(null)

  useEffect(() => {
    fetchCurrentSeason()
    fetchTeams()
  }, [])

  useEffect(() => {
    if (selectedDate) fetchData(selectedDate)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate])

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

  // 🎨 상태 색상
  function getStatusColor(response) {
    switch (response) {
      case '참석': return '#4ade80'
      case '늦참': return '#facc15'
      case '조퇴': return '#fb923c'
      default: return '#e2e8f0'
    }
  }

  // 🎨 팀 색상
  function getTeamColor(teamName) {
    const team = teams.find(t => t.name === teamName)
    const color = team?.color || '#94a3b8'
    const c = color.toLowerCase()
    if (c === '#1d4ed8' || c === '#2563eb' || c === '#1e40af' || c === '#1e3a8a') {
      return '#60a5fa'
    }
    return color
  }

  // 뛰지 않는 팀
  function getRefereeTeam(match) {
    const playing = new Set([match.team_a, match.team_b])
    return teams.map(t => t.name).find(name => !playing.has(name)) || null
  }

  // 심판 후보
  function getCandidates(match) {
    const refTeam = getRefereeTeam(match)
    if (!refTeam) return []
    return attendees.filter(a => a.team === refTeam)
  }

  // 🔥 특정 슬롯의 현재 배정 선수 id
  // slotKey: '주심' | '부심-0' | '부심-1'
  function getSlotPlayerId(matchNumber, role, subIndex) {
    const list = assignments.filter(
      a => a.match_number === matchNumber && a.role === role
    )
    if (role === '주심') {
      return list[0]?.player_id || ''
    }
    // 부심은 subIndex로 구분 (배열 순서)
    return list[subIndex]?.player_id || ''
  }

  // 🔥 슬롯에 선수 지정 (드롭다운 변경)
  function assignSlot(match, role, subIndex, playerId) {
    if (!canAssign) return
    const mn = match.match_number

    setAssignments(prev => {
      let list = [...prev]

      if (role === '주심') {
        // 기존 주심 제거
        list = list.filter(a => !(a.match_number === mn && a.role === '주심'))
      } else {
        // 부심: 해당 subIndex의 것만 제거
        const subs = list.filter(a => a.match_number === mn && a.role === '부심')
        const target = subs[subIndex]
        if (target) {
          list = list.filter(a => a !== target)
        }
      }

      // 빈 값이면 여기서 끝 (해제)
      if (!playerId) return list

      // 🚫 같은 쿼터에서 이미 다른 슬롯에 배정된 선수인지 체크 (중복 방지)
      const alreadyInQuarter = list.some(
        a => a.match_number === mn && a.player_id === playerId
      )
      if (alreadyInQuarter) {
        alert('이 선수는 같은 쿼터에서 이미 다른 심판으로 배정되어 있습니다.')
        return prev
      }

      const candidate = getCandidates(match).find(c => c.player_id === playerId)
      if (!candidate) return list

      return [...list, {
        game_date: selectedDate,
        match_number: mn,
        role,
        player_id: candidate.player_id,
        player_name: candidate.name,
        team: candidate.team,
        season: currentSeason || null,
      }]
    })
  }

  // 💾 저장 (덮어쓰기)
  async function saveAssignments() {
    if (!canAssign) return
    setSaving(true)

    const { error: delErr } = await supabase
      .from('referee_assignments')
      .delete()
      .eq('game_date', selectedDate)

    if (delErr) {
      alert('저장 실패(삭제 단계): ' + delErr.message)
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
        alert('저장 실패(삽입 단계): ' + insErr.message)
        setSaving(false)
        return
      }
    }

    setSaving(false)
    alert('✅ 심판 배정이 저장되었습니다!')
    fetchData(selectedDate)
  }

  // 🔄 초기화 (화면만)
  function resetAssignments() {
    if (!canAssign) return
    if (!window.confirm('현재 화면의 선택을 모두 지우시겠습니까?\n(저장 버튼을 누르지 않으면 기존 저장 내용은 유지됩니다)')) return
    setAssignments([])
  }

  // 📋 요약
  function getSummary(matchNumber) {
    const main = assignments
      .filter(a => a.match_number === matchNumber && a.role === '주심')
      .map(a => a.player_name)
    const sub = assignments
      .filter(a => a.match_number === matchNumber && a.role === '부심')
      .map(a => a.player_name)
    return { main, sub }
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

  const calendarCells = buildCalendar(pickerYM.year, pickerYM.month)
  const todayKey = toKey(new Date())

  // 드롭다운 옵션 렌더 (선택된 슬롯 제외한 후보)
  function renderOptions(match, selfPlayerId) {
    const candidates = getCandidates(match)
    // 같은 쿼터에서 이미 배정된 선수들 (자기 자신 제외)
    const usedIds = new Set(
      assignments
        .filter(a => a.match_number === match.match_number && a.player_id !== selfPlayerId)
        .map(a => a.player_id)
    )
    return candidates.map(c => (
      <option
        key={c.player_id}
        value={c.player_id}
        disabled={usedIds.has(c.player_id)}
      >
        {c.name}{statusEmoji(c.response) ? ` ${statusEmoji(c.response)}` : ''}
        {usedIds.has(c.player_id) ? ' (배정됨)' : ''}
      </option>
    ))
  }

  // 슬롯 드롭다운 컴포넌트
  function SlotSelect({ match, role, subIndex, label, color }) {
    const value = getSlotPlayerId(match.match_number, role, subIndex)
    const selected = getCandidates(match).find(c => c.player_id === value)
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold w-16 flex-shrink-0" style={{ color }}>
          {label}
        </span>
        <select
          value={value}
          onChange={(e) => assignSlot(match, role, subIndex, e.target.value)}
          disabled={!canAssign}
          className="flex-1 bg-slate-900/70 border border-slate-600 rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-emerald-500"
          style={{ color: selected ? getStatusColor(selected.response) : '#94a3b8' }}
        >
          <option value="">— 선택 —</option>
          {renderOptions(match, value)}
        </select>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-white">🚦 심판 배정</h1>
        {currentSeason && (
          <p className="text-slate-400 text-sm mt-1">
            🗓️ 현재 시즌: <span className="text-emerald-400 font-semibold">{currentSeason}</span>
          </p>
        )}
      </div>

      {!canAssign && (
        <div className="bg-sky-500/10 border border-sky-500/30 rounded-xl px-4 py-3 mb-6 text-sky-200 text-sm">
          👀 열람 전용입니다. 심판 배정은 관리자·임원만 가능합니다.
        </div>
      )}

      {/* 날짜 선택 */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-4 mb-4">
        <div className="relative inline-block" ref={pickerRef}>
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
              <button type="button" onClick={() => pickDate(new Date())} className="w-full mt-2 bg-slate-700 hover:bg-slate-600 text-emerald-300 text-sm font-semibold py-2 rounded-lg">
                📍 오늘로 이동
              </button>
            </div>
          )}
        </div>
      </div>

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
          <div className="flex flex-wrap items-center gap-3 mb-3 text-xs bg-slate-800/40 border border-slate-700 rounded-xl px-3 py-2">
            <span className="text-slate-400">이름 색상:</span>
            <span className="flex items-center gap-1"><span style={{ color: '#4ade80' }}>●</span> 참석</span>
            <span className="flex items-center gap-1"><span style={{ color: '#facc15' }}>●</span> ⏰늦참</span>
            <span className="flex items-center gap-1"><span style={{ color: '#fb923c' }}>●</span> 🏃조퇴</span>
          </div>

          {/* 쿼터별 슬롯 */}
          <div className="space-y-3">
            {matches.map(match => {
              const refTeam = getRefereeTeam(match)
              const candidates = getCandidates(match)
              const colorA = getTeamColor(match.team_a)
              const colorB = getTeamColor(match.team_b)
              const refColor = refTeam ? getTeamColor(refTeam) : '#94a3b8'

              return (
                <div key={match.id} className="rounded-2xl border border-slate-700 overflow-hidden bg-slate-800/50">
                  {/* 헤더 */}
                  <div className="px-4 py-2.5 bg-slate-900/50 border-b border-slate-700 flex items-center justify-between flex-wrap gap-1">
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-400 font-extrabold">{match.match_number}Q</span>
                      <span className="text-sm">
                        <span style={{ color: colorA }} className="font-bold">{match.team_a}</span>
                        <span className="text-slate-500 mx-1.5">vs</span>
                        <span style={{ color: colorB }} className="font-bold">{match.team_b}</span>
                      </span>
                    </div>
                    <span className="text-xs">
                      <span className="text-slate-400">🚦 심판: </span>
                      <span className="font-bold" style={{ color: refColor }}>{refTeam || '없음'}</span>
                      <span className="text-slate-500 ml-1">({candidates.length}명)</span>
                    </span>
                  </div>

                  {/* 슬롯 3개 */}
                  <div className="p-3 space-y-2">
                    {candidates.length === 0 ? (
                      <p className="text-slate-500 text-sm py-1">
                        {refTeam ? `${refTeam}에 참석한 선수가 없습니다.` : '심판 팀을 찾을 수 없습니다.'}
                      </p>
                    ) : (
                      <>
                        <SlotSelect match={match} role="주심" subIndex={0} label="👨‍⚖️ 주심" color="#facc15" />
                        <SlotSelect match={match} role="부심" subIndex={0} label="🚩 부심①" color="#38bdf8" />
                        <SlotSelect match={match} role="부심" subIndex={1} label="🚩 부심②" color="#38bdf8" />
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* 저장 / 리셋 */}
          {canAssign && (
            <div className="mt-6 flex gap-3">
              <button
                onClick={resetAssignments}
                disabled={saving}
                className="bg-slate-700 hover:bg-slate-600 text-slate-200 px-6 py-3.5 rounded-xl font-bold transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                🔄 초기화
              </button>
              <button
                onClick={saveAssignments}
                disabled={saving}
                className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white py-3.5 rounded-xl font-bold transition-colors disabled:opacity-50 shadow-lg shadow-emerald-500/20"
              >
                {saving ? '저장 중...' : '💾 심판 배정 저장'}
              </button>
            </div>
          )}

          {/* 📋 요약표 */}
          <div className="mt-8">
            <h2 className="text-lg font-bold text-white mb-3">📋 심판 배정 요약</h2>
            <div className="bg-slate-800/60 border border-slate-700 rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-900/50 border-b border-slate-700 text-slate-400 text-xs">
                    <th className="px-3 py-2.5 text-center w-12">쿼터</th>
                    <th className="px-3 py-2.5 text-center">대진</th>
                    <th className="px-3 py-2.5 text-center">👨‍⚖️ 주심</th>
                    <th className="px-3 py-2.5 text-center">🚩 부심</th>
                  </tr>
                </thead>
                <tbody>
                  {matches.map(match => {
                    const { main, sub } = getSummary(match.match_number)
                    const colorA = getTeamColor(match.team_a)
                    const colorB = getTeamColor(match.team_b)
                    return (
                      <tr key={match.id} className="border-b border-slate-700/40">
                        <td className="px-3 py-2.5 text-center font-extrabold text-emerald-400">{match.match_number}Q</td>
                        <td className="px-3 py-2.5 text-center whitespace-nowrap">
                          <span style={{ color: colorA }} className="font-bold">{match.team_a}</span>
                          <span className="text-slate-500 mx-1 text-xs">vs</span>
                          <span style={{ color: colorB }} className="font-bold">{match.team_b}</span>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {main.length > 0 ? <span className="text-yellow-300 font-bold">{main.join(', ')}</span> : <span className="text-slate-600">-</span>}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {sub.length > 0 ? <span className="text-sky-300 font-medium">{sub.join(', ')}</span> : <span className="text-slate-600">-</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-slate-500 text-xs mt-2">
              ※ 선택한 내용이 실시간 반영됩니다. 저장 버튼을 눌러야 최종 저장됩니다.
            </p>
          </div>
        </>
      )}

      <div style={{ height: '70px', width: '100%' }} aria-hidden="true"></div>
    </div>
  )
}

export default RefereeAssign