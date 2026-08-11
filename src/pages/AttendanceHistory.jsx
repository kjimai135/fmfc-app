import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

function AttendanceHistory() {
  const { role, profile } = useAuth()
  // ✅ 수정 권한: 관리자·임원·주장/부주장
  const canEdit = role === 'admin' || role === 'executive' || role === 'captain'
  // 🙋 본인 선수 id
  const myPlayerId = profile?.player_id || null

  const [attendance, setAttendance] = useState([])
  const [teams, setTeams] = useState([])
  const [players, setPlayers] = useState([])
  const [selectedDate, setSelectedDate] = useState(
    new Date(new Date().getTime() + 9 * 60 * 60 * 1000).toISOString().split('T')[0]
  )
  const [availableDates, setAvailableDates] = useState([])
  const [loading, setLoading] = useState(true)

  // 수동 추가 폼 상태
  const [showAddForm, setShowAddForm] = useState(false)
  const [addPlayerId, setAddPlayerId] = useState('')
  const [addTeam, setAddTeam] = useState('')
  const [addStatus, setAddStatus] = useState('출석')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchAvailableDates()
    fetchTeams()
    if (canEdit) fetchPlayers()
  }, [])

  useEffect(() => {
    if (selectedDate) {
      fetchAttendance(selectedDate)
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
      .select('id, name, current_team, is_active')
      .order('name')
    setPlayers((data || []).filter(p => p.is_active !== false))
  }

  async function fetchAvailableDates() {
    const { data } = await supabase
      .from('attendance')
      .select('game_date')
      .order('game_date', { ascending: false })

    if (data) {
      const unique = [...new Set(data.map(d => d.game_date))]
      setAvailableDates(unique)
      if (unique.length > 0 && !unique.includes(selectedDate)) {
        setSelectedDate(unique[0])
      }
    }
  }

  async function fetchAttendance(date) {
    setLoading(true)
    const { data } = await supabase
      .from('attendance')
      .select('*')
      .eq('game_date', date)
      .order('check_order')

    setAttendance(data || [])
    setLoading(false)
  }

  // ✅ 개별 선수 상태 수정 (관리자·임원·주장/부주장)
  async function updateStatus(recordId, newStatus) {
    if (!canEdit) return
    await supabase
      .from('attendance')
      .update({ status: newStatus })
      .eq('id', recordId)
    fetchAttendance(selectedDate)
  }

  // ✅ 개별 선수 기록 삭제 (관리자·임원·주장/부주장)
  async function deleteRecord(recordId, playerName) {
    if (!canEdit) return
    if (!window.confirm(`${playerName} 선수의 출석 기록을 삭제(불참 처리)할까요?`)) return
    await supabase
      .from('attendance')
      .delete()
      .eq('id', recordId)
    fetchAttendance(selectedDate)
  }

  // ✅ 선택한 날짜 전체 삭제 (관리자·임원·주장/부주장) — 2단계 재확인
  async function deleteAllForDate() {
    if (!canEdit) return
    const count = attendance.length
    // 1차 확인
    if (!window.confirm(`⚠️ ${selectedDate} 날짜의 출석 기록 ${count}건을 전부 삭제할까요?\n(복구할 수 없습니다!)`)) return
    // 2차 확인 (실수 방지)
    if (!window.confirm(`정말 삭제하시겠습니까?\n${selectedDate} · 총 ${count}건이 영구 삭제됩니다.`)) return

    await supabase
      .from('attendance')
      .delete()
      .eq('game_date', selectedDate)
    await fetchAvailableDates()
    fetchAttendance(selectedDate)
  }

  // ✅ 선수 수동 추가 (관리자·임원·주장/부주장)
  async function addAttendance() {
    if (!canEdit) return
    if (!addPlayerId) {
      alert('선수를 선택해 주세요.')
      return
    }
    if (!addTeam) {
      alert('팀을 선택해 주세요.')
      return
    }

    const player = players.find(p => p.id === addPlayerId)
    if (!player) return

    setSaving(true)

    const sameTeam = attendance.filter(a => a.team === addTeam)
    const nextOrder = sameTeam.length > 0
      ? Math.max(...sameTeam.map(a => a.check_order || 0)) + 1
      : 1

    const { error } = await supabase
      .from('attendance')
      .insert({
        player_id: player.id,
        player_name: player.name,
        team: addTeam,
        status: addStatus,
        game_date: selectedDate,
        check_order: nextOrder,
        checked_at: new Date().toISOString(),
      })

    if (error) {
      console.error('출석 추가 오류:', error)
      alert('출석 추가에 실패했습니다.')
    } else {
      setAddPlayerId('')
      await fetchAvailableDates()
      await fetchAttendance(selectedDate)
    }
    setSaving(false)
  }

  const statusIcon = (s) => {
    switch(s) {
      case '출석': return '✅'
      case '늦참': return '🕐'
      case '조퇴': return '🏃'
      default: return ''
    }
  }

  function getTeamColor(teamName) {
    const team = teams.find(t => t.name === teamName)
    const color = team?.color || '#ffffff'
    const c = color.toLowerCase()
    if (c === '#1d4ed8' || c === '#2563eb' || c === '#1e40af' || c === '#1e3a8a') {
      return '#60a5fa'
    }
    return color
  }

  const recordedTeams = [...new Set(attendance.map(a => a.team))]
  const statusOptions = ['출석', '늦참', '조퇴']

  const alreadyIds = new Set(attendance.map(a => a.player_id).filter(Boolean))
  const selectablePlayers = players.filter(p => !alreadyIds.has(p.id))

  return (
    <div>
      <h1 className="text-3xl font-bold text-white mb-6">📋 출석현황</h1>

      {/* 🔒 읽기 전용 안내 (수정 권한 없을 때 = 정회원) */}
      {!canEdit && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 mb-6 text-slate-400 text-sm flex items-center gap-2">
          <span>🔒</span>
          <span>출석 기록 <b>조회만 가능</b>합니다. 수정·삭제·추가는 관리자·임원·주장단만 할 수 있어요.</span>
        </div>
      )}

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

      {/* 상단 버튼: 선수 추가만 (전체 삭제는 맨 아래로 이동) */}
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {showAddForm ? '✕ 닫기' : '+ 선수 수동 추가'}
          </button>
        </div>
      )}

      {/* ✅ 수동 추가 폼 (수정 권한자만) */}
      {canEdit && showAddForm && (
        <div className="bg-slate-800 border border-emerald-500/40 rounded-xl p-4 mb-6">
          <p className="text-slate-300 text-sm mb-3">
            <b>{selectedDate}</b> 날짜에 선수를 수동으로 추가합니다.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-slate-400 text-xs mb-1">선수</label>
              <select
                value={addPlayerId}
                onChange={(e) => setAddPlayerId(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
              >
                <option value="">— 선수 선택 —</option>
                {selectablePlayers.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-400 text-xs mb-1">팀</label>
              <select
                value={addTeam}
                onChange={(e) => setAddTeam(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
              >
                <option value="">— 팀 선택 —</option>
                {teams.map(t => (
                  <option key={t.id} value={t.name}>{t.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-400 text-xs mb-1">상태</label>
              <select
                value={addStatus}
                onChange={(e) => setAddStatus(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
              >
                {statusOptions.map(s => (
                  <option key={s} value={s}>{statusIcon(s)} {s}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end mt-3">
            <button
              onClick={addAttendance}
              disabled={saving}
              className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
            >
              {saving ? '추가 중...' : '추가하기'}
            </button>
          </div>

          {selectablePlayers.length === 0 && (
            <p className="text-slate-500 text-xs mt-2">추가할 수 있는 선수가 없습니다. (이미 모두 등록됨 또는 활성 선수 없음)</p>
          )}
        </div>
      )}

      {/* 팀별 출석 현황 */}
      {loading ? (
        <div className="text-center py-20 text-slate-400">
          <p className="text-xl">⏳ 로딩 중...</p>
        </div>
      ) : attendance.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <p className="text-4xl mb-4">📋</p>
          <p className="text-xl">해당 날짜의 출석 기록이 없습니다</p>
          {canEdit && (
            <p className="mt-2 text-sm">위의 "+ 선수 수동 추가"로 기록을 입력할 수 있습니다.</p>
          )}
        </div>
      ) : (
        recordedTeams.map(teamName => {
          const teamAttendance = attendance.filter(a => a.team === teamName)
          if (teamAttendance.length === 0) return null
          const teamColor = getTeamColor(teamName)

          return (
            <div key={teamName} className="mb-6 rounded-xl border overflow-hidden" style={{ borderColor: `${teamColor}66` }}>
              <div className="px-4 py-3 font-bold text-lg flex items-center gap-2" style={{ background: `${teamColor}1a` }}>
                <span className="inline-block w-4 h-4 rounded-full flex-shrink-0" style={{ background: teamColor, border: '1px solid rgba(255,255,255,0.3)' }}></span>
                <span style={{ color: teamColor }}>{teamName} ({teamAttendance.length}명)</span>
              </div>
              <div className="bg-slate-800">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="px-4 py-2 text-slate-400 text-sm w-16">순서</th>
                      <th className="px-4 py-2 text-slate-400 text-sm">이름</th>
                      <th className="px-4 py-2 text-slate-400 text-sm">상태</th>
                      <th className="px-4 py-2 text-slate-400 text-sm">시간</th>
                      {/* 관리 열은 수정 권한 있을 때만 */}
                      {canEdit && (
                        <th className="px-4 py-2 text-slate-400 text-sm text-center">관리</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {teamAttendance.map((record, idx) => {
                      const isMe = myPlayerId && record.player_id === myPlayerId
                      return (
                        <tr
                          key={record.id}
                          className={`border-b border-slate-700/50 hover:bg-slate-700/30 ${
                            isMe ? 'bg-sky-500/5' : ''
                          }`}
                          style={isMe ? { boxShadow: 'inset 0 0 0 1px rgba(56,189,248,0.6)' } : undefined}
                        >
                          <td className="px-4 py-2 text-emerald-400 font-bold">{idx + 1}</td>
                          <td className="px-4 py-2 font-medium" style={{ color: teamColor }}>{record.player_name}</td>
                          {/* ✅ 상태: 권한 있으면 드롭다운, 없으면 텍스트만 */}
                          <td className="px-4 py-2">
                            {canEdit ? (
                              <select
                                value={record.status}
                                onChange={(e) => updateStatus(record.id, e.target.value)}
                                className="bg-slate-700 border border-slate-600 rounded-lg px-2 py-1 text-white text-sm focus:outline-none focus:border-emerald-500"
                              >
                                {statusOptions.map(s => (
                                  <option key={s} value={s}>{statusIcon(s)} {s}</option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-slate-200 text-sm">
                                {statusIcon(record.status)} {record.status}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-slate-400 text-sm">
                            {record.checked_at ? new Date(record.checked_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '-'}
                          </td>
                          {/* ✅ 삭제 버튼: 수정 권한 있을 때만 */}
                          {canEdit && (
                            <td className="px-4 py-2 text-center">
                              <button
                                onClick={() => deleteRecord(record.id, record.player_name)}
                                className="text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg px-2 py-1 text-sm transition-colors"
                                title="삭제 (불참 처리)"
                              >
                                🗑️
                              </button>
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })
      )}

      {/* ⬇️ 기록 전체 삭제 (맨 아래 · 명단과 넉넉히 띄움 · 빨간 버튼) */}
      {canEdit && attendance.length > 0 && !loading && (
        <div style={{ marginTop: '80px', paddingTop: '28px', borderTop: '1px solid rgba(71,85,105,0.4)' }}>
          <div className="flex justify-center">
            <button
              onClick={deleteAllForDate}
              className="bg-red-600 hover:bg-red-700 text-white text-sm font-bold px-6 py-3 rounded-xl shadow-lg shadow-red-600/20 transition-colors"
            >
              🗑️ {selectedDate} 기록 전체 삭제
            </button>
          </div>
          <p className="text-slate-500 text-xs text-center mt-3">
            ※ 이 날짜의 모든 출석 기록이 영구 삭제됩니다. (되돌릴 수 없음)
          </p>
        </div>
      )}

      {/* 하단 여백 */}
      <div style={{ height: '60px', width: '100%' }} aria-hidden="true"></div>
    </div>
  )
}

export default AttendanceHistory