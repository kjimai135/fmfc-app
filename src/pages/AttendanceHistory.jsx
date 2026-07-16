import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

function AttendanceHistory() {
  const [attendance, setAttendance] = useState([])
  const [teams, setTeams] = useState([])
  const [selectedDate, setSelectedDate] = useState(
    new Date(new Date().getTime() + 9 * 60 * 60 * 1000).toISOString().split('T')[0]
  )
  const [availableDates, setAvailableDates] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAvailableDates()
    fetchTeams()
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

  // ✅ 개별 선수 상태 수정
  async function updateStatus(recordId, newStatus) {
    await supabase
      .from('attendance')
      .update({ status: newStatus })
      .eq('id', recordId)
    fetchAttendance(selectedDate)
  }

  // ✅ 개별 선수 기록 삭제 (= 불참 처리)
  async function deleteRecord(recordId, playerName) {
    if (!window.confirm(`${playerName} 선수의 출석 기록을 삭제(불참 처리)할까요?`)) return
    await supabase
      .from('attendance')
      .delete()
      .eq('id', recordId)
    fetchAttendance(selectedDate)
  }

  // ✅ 선택한 날짜 전체 삭제
  async function deleteAllForDate() {
    if (!window.confirm(`${selectedDate} 날짜의 출석 기록을 전부 삭제할까요?\n(복구할 수 없습니다!)`)) return
    await supabase
      .from('attendance')
      .delete()
      .eq('game_date', selectedDate)
    await fetchAvailableDates()
    fetchAttendance(selectedDate)
  }

  const statusIcon = (s) => {
    switch(s) {
      case '출석': return '✅'
      case '늦참': return '🕐'
      case '조퇴': return '🏃'
      default: return ''
    }
  }

  // 🎨 팀 색상 가져오기 (팀명단과 동일, 남색은 밝은 파랑으로 변환)
  function getTeamColor(teamName) {
    const team = teams.find(t => t.name === teamName)
    const color = team?.color || '#ffffff'
    const c = color.toLowerCase()
    if (c === '#1d4ed8' || c === '#2563eb' || c === '#1e40af' || c === '#1e3a8a') {
      return '#60a5fa' // 밝은 파랑
    }
    return color
  }

  // 출석 기록에 저장된 팀 이름들 (중복 제거, 순서 유지)
  const recordedTeams = [...new Set(attendance.map(a => a.team))]

  const statusOptions = ['출석', '늦참', '조퇴']

  return (
    <div>
      <h1 className="text-3xl font-bold text-white mb-6">📋 출석 현황</h1>

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

      {/* 🗑️ 날짜 전체 삭제 버튼 */}
      {attendance.length > 0 && (
        <div className="flex justify-end mb-6">
          <button
            onClick={deleteAllForDate}
            className="bg-red-600/80 hover:bg-red-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            🗑️ {selectedDate} 기록 전체 삭제
          </button>
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
        </div>
      ) : (
        recordedTeams.map(teamName => {
          const teamAttendance = attendance.filter(a => a.team === teamName)
          if (teamAttendance.length === 0) return null
          const teamColor = getTeamColor(teamName)

          return (
            <div key={teamName} className="mb-6 rounded-xl border overflow-hidden" style={{ borderColor: `${teamColor}66` }}>
              {/* 팀 헤더 - 팀 색상 적용 */}
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
                      <th className="px-4 py-2 text-slate-400 text-sm text-center">관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamAttendance.map((record, idx) => (
                      <tr key={record.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                        <td className="px-4 py-2 text-emerald-400 font-bold">{idx + 1}</td>
                        <td className="px-4 py-2 font-medium" style={{ color: teamColor }}>{record.player_name}</td>
                        {/* ✅ 상태 수정 드롭다운 (출석/늦참/조퇴) */}
                        <td className="px-4 py-2">
                          <select
                            value={record.status}
                            onChange={(e) => updateStatus(record.id, e.target.value)}
                            className="bg-slate-700 border border-slate-600 rounded-lg px-2 py-1 text-white text-sm focus:outline-none focus:border-emerald-500"
                          >
                            {statusOptions.map(s => (
                              <option key={s} value={s}>{statusIcon(s)} {s}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-2 text-slate-400 text-sm">
                          {new Date(record.checked_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        {/* ✅ 삭제(=불참 처리) 버튼 */}
                        <td className="px-4 py-2 text-center">
                          <button
                            onClick={() => deleteRecord(record.id, record.player_name)}
                            className="text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg px-2 py-1 text-sm transition-colors"
                            title="삭제 (불참 처리)"
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}

export default AttendanceHistory