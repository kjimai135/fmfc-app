import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

function AttendanceStats() {
  const [stats, setStats] = useState([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState('rate')
  const [totalGames, setTotalGames] = useState(0)

  useEffect(() => {
    fetchStats()
  }, [])

  async function fetchStats() {
    setLoading(true)

    const { data: attendance } = await supabase
      .from('attendance')
      .select('*')

    const { data: players } = await supabase
      .from('players')
      .select('*')

    if (attendance && players) {
      const gameDates = [...new Set(attendance.map(a => a.game_date))]
      setTotalGames(gameDates.length)

      const playerStats = players.map(player => {
        const records = attendance.filter(a => a.player_id === player.id)
        const attended = records.filter(a => a.status === '출석').length
        const late = records.filter(a => a.status === '지각').length
        const earlyLeave = records.filter(a => a.status === '조퇴').length
        const absent = records.filter(a => a.status === '불참').length
        const total = records.length
        const rate = total > 0 ? Math.round(((attended + late + earlyLeave) / gameDates.length) * 100) : 0

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

  const avgRate = stats.length > 0
    ? Math.round(stats.reduce((sum, s) => sum + s.rate, 0) / stats.length)
    : 0

  return (
    <div>
      <h1 className="text-3xl font-bold text-white mb-2">📊 출석률 통계</h1>
      <p className="text-slate-400 mb-6">총 {totalGames}회 경기 기준</p>

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
                <tr key={player.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                  <td className="px-4 py-3 text-slate-500 text-sm">{idx + 1}</td>
                  <td className="px-4 py-3 text-white font-medium">{player.name}</td>
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