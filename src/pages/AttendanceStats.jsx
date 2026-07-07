import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

function AttendanceStats() {
  const [stats, setStats] = useState([])
  const [allAttendance, setAllAttendance] = useState([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState('rate')
  const [totalGames, setTotalGames] = useState(0)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [filterMode, setFilterMode] = useState('all')
  const [selectedPlayer, setSelectedPlayer] = useState(null)

  useEffect(() => {
    fetchStats()
  }, [filterMode, startDate, endDate])

  async function fetchStats() {
    setLoading(true)

    const { data: attendance } = await supabase
      .from('attendance')
      .select('*')
      .order('game_date', { ascending: false })

    const { data: players } = await supabase
      .from('players')
      .select('*')

    if (attendance && players) {
      setAllAttendance(attendance)
      let filtered = attendance

      if (filterMode === 'range' && startDate && endDate) {
        filtered = attendance.filter(a =>
          a.game_date >= startDate && a.game_date <= endDate
        )
      } else if (filterMode === 'month') {
        const now = new Date()
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]
        filtered = attendance.filter(a =>
          a.game_date >= monthStart && a.game_date <= monthEnd
        )
      } else if (filterMode === '3months') {
        const now = new Date()
        const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()).toISOString().split('T')[0]
        filtered = attendance.filter(a => a.game_date >= threeMonthsAgo)
      }

      const gameDates = [...new Set(filtered.map(a => a.game_date))]
      setTotalGames(gameDates.length)

      const playerStats = players.map(player => {
        const records = filtered.filter(a => a.player_id === player.id)
        const attended = records.filter(a => a.status === '출석').length
        const late = records.filter(a => a.status === '지각').length
        const earlyLeave = records.filter(a => a.status === '조퇴').length
        const absent = records.filter(a => a.status === '불참').length
        const total = records.length
        const rate = gameDates.length > 0 ? Math.round(((attended + late + earlyLeave) / gameDates.length) * 100) : 0

        return {
          id: player.id,
          name: player.name,
          attended,
          late,
          earlyLeave,
          absent,
          total,
          rate,
        }
      })

      setStats(playerStats)
    }
    setLoading(false)
  }

  const sorted = [...stats].sort((a, b) => {
    switch(sortBy) {
      case 'rate': return b.rate - a.rate
      case 'name': return a.name.localeCompare(b.name)
      case 'attended': return b.attended - a.attended
      case 'absent': return b.absent - a.absent
      default: return 0
    }
  })

  const rateColor = (rate) => {
    if (rate >= 80) return 'text-emerald-400'
    if (rate >= 60) return 'text-yellow-400'
    if (rate >= 40) return 'text-orange-400'
    return 'text-red-400'
  }

  const rateBarColor = (rate) => {
    if (rate >= 80) return 'bg-emerald-500'
    if (rate >= 60) return 'bg-yellow-500'
    if (rate >= 40) return 'bg-orange-500'
    return 'bg-red-500'
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

  const statusBgColor = (s) => {
    switch(s) {
      case '출석': return 'bg-emerald-500/10 text-emerald-400'
      case '불참': return 'bg-red-500/10 text-red-400'
      case '지각': return 'bg-yellow-500/10 text-yellow-400'
      case '조퇴': return 'bg-orange-500/10 text-orange-400'
      default: return ''
    }
  }

  const avgRate = stats.length > 0
    ? Math.round(stats.reduce((sum, s) => sum + s.rate, 0) / stats.length)
    : 0

  const playerRecords = selectedPlayer
    ? allAttendance
        .filter(a => a.player_id === selectedPlayer.id)
        .sort((a, b) => b.game_date.localeCompare(a.game_date))
    : []

  return (
    <div>
      <h1 className="text-3xl font-bold text-white mb-2">📊 출석률 통계</h1>
      <p className="text-slate-400 mb-6">총 {totalGames}회 경기 기준</p>

      {/* 기간 필터 */}
      <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 mb-6">
        <div className="flex flex-wrap gap-2 mb-4">
          {[
            { key: 'all', label: '전체' },
            { key: 'month', label: '이번 달' },
            { key: '3months', label: '최근 3개월 (시즌)' },
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

        {filterMode === 'range' && (
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div>
              <label className="block text-slate-300 text-sm mb-1">시작일</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-slate-700 border border-slate-600 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div className="text-slate-400 py-2">~</div>
            <div>
              <label className="block text-slate-300 text-sm mb-1">종료일</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-slate-700 border border-slate-600 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>
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
          <p className="text-slate-400 text-sm">평균 출석률</p>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-yellow-400">
            {stats.filter(s => s.rate >= 80).length}
          </p>
          <p className="text-slate-400 text-sm">80% 이상</p>
        </div>
      </div>

      {/* 개인 상세 기록 모달 */}
      {selectedPlayer && (
        <div className="bg-slate-800 rounded-xl p-6 border border-emerald-500/50 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-white">
              👤 {selectedPlayer.name} 출석 기록
            </h2>
            <button
              onClick={() => setSelectedPlayer(null)}
              className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-sm"
            >
              ✕ 닫기
            </button>
          </div>

          {/* 개인 요약 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="bg-emerald-500/10 rounded-lg p-3 text-center">
              <p className="text-lg font-bold text-emerald-400">{selectedPlayer.attended}</p>
              <p className="text-slate-400 text-xs">✅ 출석</p>
            </div>
            <div className="bg-yellow-500/10 rounded-lg p-3 text-center">
              <p className="text-lg font-bold text-yellow-400">{selectedPlayer.late}</p>
              <p className="text-slate-400 text-xs">⏰ 지각</p>
            </div>
            <div className="bg-orange-500/10 rounded-lg p-3 text-center">
              <p className="text-lg font-bold text-orange-400">{selectedPlayer.earlyLeave}</p>
              <p className="text-slate-400 text-xs">🏃 조퇴</p>
            </div>
            <div className="bg-red-500/10 rounded-lg p-3 text-center">
              <p className="text-lg font-bold text-red-400">{selectedPlayer.absent}</p>
              <p className="text-slate-400 text-xs">❌ 불참</p>
            </div>
          </div>

          {/* 날짜별 기록 */}
          <div className="max-h-60 overflow-y-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="px-4 py-2 text-slate-400 text-sm">날짜</th>
                  <th className="px-4 py-2 text-slate-400 text-sm">팀</th>
                  <th className="px-4 py-2 text-slate-400 text-sm">상태</th>
                  <th className="px-4 py-2 text-slate-400 text-sm">시간</th>
                </tr>
              </thead>
              <tbody>
                {playerRecords.map(record => (
                  <tr key={record.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                    <td className="px-4 py-2 text-white text-sm">{record.game_date}</td>
                    <td className="px-4 py-2 text-slate-300 text-sm">{record.team}</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusBgColor(record.status)}`}>
                        {statusIcon(record.status)} {record.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-slate-400 text-sm">
                      {new Date(record.checked_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {playerRecords.length === 0 && (
            <p className="text-center text-slate-400 py-4">출석 기록이 없습니다</p>
          )}
        </div>
      )}

      {/* 정렬 옵션 */}
      <div className="flex gap-2 mb-4">
        <span className="text-slate-400 text-sm py-2">정렬:</span>
        {[
          { key: 'rate', label: '출석률순' },
          { key: 'name', label: '이름순' },
          { key: 'attended', label: '출석횟수순' },
          { key: 'absent', label: '불참횟수순' },
        ].map(option => (
          <button
            key={option.key}
            onClick={() => setSortBy(option.key)}
            className={`px-3 py-1 rounded-lg text-sm transition-colors ${
              sortBy === option.key
                ? 'bg-emerald-500 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* 통계 테이블 */}
      {loading ? (
        <div className="text-center py-20 text-slate-400">
          <p className="text-xl">⏳ 로딩 중...</p>
        </div>
      ) : (
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="px-4 py-3 text-slate-400 text-sm w-12">#</th>
                <th className="px-4 py-3 text-slate-400 text-sm">이름</th>
                <th className="px-4 py-3 text-slate-400 text-sm">출석률</th>
                <th className="px-4 py-3 text-slate-400 text-sm text-center">✅ 출석</th>
                <th className="px-4 py-3 text-slate-400 text-sm text-center">⏰ 지각</th>
                <th className="px-4 py-3 text-slate-400 text-sm text-center">🏃 조퇴</th>
                <th className="px-4 py-3 text-slate-400 text-sm text-center">❌ 불참</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((player, idx) => (
                <tr
                  key={player.id}
                  className="border-b border-slate-700/50 hover:bg-slate-700/30 cursor-pointer"
                  onClick={() => setSelectedPlayer(player)}
                >
                  <td className="px-4 py-3 text-slate-500 text-sm">{idx + 1}</td>
                  <td className="px-4 py-3 text-emerald-400 font-medium underline">{player.name}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 bg-slate-700 rounded-full h-2 max-w-[120px]">
                        <div
                          className={`h-2 rounded-full ${rateBarColor(player.rate)}`}
                          style={{ width: `${player.rate}%` }}
                        />
                      </div>
                      <span className={`font-bold text-sm ${rateColor(player.rate)}`}>
                        {player.rate}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center text-emerald-400">{player.attended}</td>
                  <td className="px-4 py-3 text-center text-yellow-400">{player.late}</td>
                  <td className="px-4 py-3 text-center text-orange-400">{player.earlyLeave}</td>
                  <td className="px-4 py-3 text-center text-red-400">{player.absent}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default AttendanceStats