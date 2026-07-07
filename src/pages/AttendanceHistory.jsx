import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const TEAMS = ['호진팀', '민석팀', '용규팀']

function AttendanceHistory() {
  const [attendance, setAttendance] = useState([])
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [availableDates, setAvailableDates] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAvailableDates()
  }, [])

  useEffect(() => {
    if (selectedDate) {
      fetchAttendance(selectedDate)
    }
  }, [selectedDate])

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

  const statusIcon = (s) => {
    switch(s) {
      case '출석': return '✅'
      case '불참': return '❌'
      case '지각': return '⏰'
      case '조퇴': return '🏃'
      default: return ''
    }
  }

  const teamColor = (team) => {
    switch(team) {
      case '호진팀': return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
      case '민석팀': return 'bg-green-500/20 text-green-400 border-green-500/30'
      case '용규팀': return 'bg-red-500/20 text-red-400 border-red-500/30'
      default: return 'bg-slate-500/20 text-slate-400'
    }
  }

  const teamEmoji = (team) => {
    switch(team) {
      case '호진팀': return '🔵'
      case '민석팀': return '🟢'
      case '용규팀': return '🔴'
      default: return '⚪'
    }
  }

  const statusCount = (s) => attendance.filter(a => a.status === s).length

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

        {/* 최근 경기 날짜 빠른 선택 */}
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

      {/* 요약 통계 */}
      {attendance.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-emerald-400">{statusCount('출석')}</p>
            <p className="text-slate-400 text-sm">✅ 출석</p>
          </div>
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-red-400">{statusCount('불참')}</p>
            <p className="text-slate-400 text-sm">❌ 불참</p>
          </div>
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-yellow-400">{statusCount('지각')}</p>
            <p className="text-slate-400 text-sm">⏰ 지각</p>
          </div>
          <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-orange-400">{statusCount('조퇴')}</p>
            <p className="text-slate-400 text-sm">🏃 조퇴</p>
          </div>
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
        TEAMS.map(team => {
          const teamAttendance = attendance.filter(a => a.team === team)
          if (teamAttendance.length === 0) return null

          return (
            <div key={team} className={`mb-6 rounded-xl border ${teamColor(team)} overflow-hidden`}>
              <div className="px-4 py-3 font-bold text-lg">
                {teamEmoji(team)} {team} ({teamAttendance.length}명)
              </div>
              <div className="bg-slate-800">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="px-4 py-2 text-slate-400 text-sm w-16">순서</th>
                      <th className="px-4 py-2 text-slate-400 text-sm">이름</th>
                      <th className="px-4 py-2 text-slate-400 text-sm">상태</th>
                      <th className="px-4 py-2 text-slate-400 text-sm">체크 시간</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamAttendance.map((record, idx) => (
                      <tr key={record.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                        <td className="px-4 py-2 text-emerald-400 font-bold">{idx + 1}</td>
                        <td className="px-4 py-2 text-white font-medium">{record.player_name}</td>
                        <td className="px-4 py-2">{statusIcon(record.status)} {record.status}</td>
                        <td className="px-4 py-2 text-slate-400 text-sm">
                          {new Date(record.checked_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
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