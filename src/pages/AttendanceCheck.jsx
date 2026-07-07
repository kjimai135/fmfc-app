import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const TEAMS = ['호진팀', '민석팀', '용규팀']

function AttendanceCheck() {
  const [players, setPlayers] = useState([])
  const [todayAttendance, setTodayAttendance] = useState([])
  const [selectedPlayer, setSelectedPlayer] = useState('')
  const [selectedTeam, setSelectedTeam] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('출석')
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')

  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    fetchPlayers()
    fetchTodayAttendance()
  }, [])

  async function fetchPlayers() {
    const { data } = await supabase
      .from('players')
      .select('*')
      .order('name')
    setPlayers(data || [])
  }

  async function fetchTodayAttendance() {
    const { data } = await supabase
      .from('attendance')
      .select('*')
      .eq('game_date', today)
      .order('check_order')
    setTodayAttendance(data || [])
  }

  async function handleCheckIn() {
    if (!selectedPlayer || !selectedTeam) {
      alert('이름과 팀을 선택해주세요!')
      return
    }

    const already = todayAttendance.find(a => a.player_id === selectedPlayer)
    if (already) {
      alert('이미 출석 체크되었습니다!')
      return
    }

    const player = players.find(p => p.id === selectedPlayer)
    const nextOrder = todayAttendance.length + 1

    setLoading(true)
    const { error } = await supabase
      .from('attendance')
      .insert([{
        player_id: selectedPlayer,
        player_name: player.name,
        team: selectedTeam,
        status: selectedStatus,
        check_order: nextOrder,
        game_date: today,
      }])

    if (error) {
      alert('오류가 발생했습니다: ' + error.message)
    } else {
      setSelectedPlayer('')
      setSelectedTeam('')
      setSelectedStatus('출석')
      setSearch('')
      fetchTodayAttendance()
    }
    setLoading(false)
  }

  async function handleDelete(id) {
    if (!window.confirm('출석 기록을 삭제하시겠습니까?')) return
    await supabase.from('attendance').delete().eq('id', id)
    fetchTodayAttendance()
  }

  const filteredPlayers = players.filter(p =>
    p.name?.includes(search)
  )

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

  const checkedPlayerIds = todayAttendance.map(a => a.player_id)

  return (
    <div>
      <h1 className="text-3xl font-bold text-white mb-2">✅ 출석 체크</h1>
      <p className="text-slate-400 mb-6">📅 {today} (오늘)</p>

      {/* 출석 체크 폼 */}
      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 mb-8">
        <h2 className="text-lg font-bold text-white mb-4">출석 등록</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          {/* 선수 검색 & 선택 */}
          <div>
            <label className="block text-slate-300 text-sm font-medium mb-2">이름 *</label>
            <input
              type="text"
              placeholder="🔍 이름 검색..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setSelectedPlayer('')
              }}
              className="w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 mb-2"
            />
            {search && (
              <div className="bg-slate-700 rounded-xl border border-slate-600 max-h-40 overflow-y-auto">
                {filteredPlayers
                  .filter(p => !checkedPlayerIds.includes(p.id))
                  .map(player => (
                  <button
                    key={player.id}
                    onClick={() => {
                      setSelectedPlayer(player.id)
                      setSearch(player.name)
                    }}
                    className={`w-full text-left px-4 py-2 hover:bg-slate-600 transition-colors ${
                      selectedPlayer === player.id ? 'bg-emerald-500/20 text-emerald-400' : 'text-white'
                    }`}
                  >
                    {player.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 팀 선택 */}
          <div>
            <label className="block text-slate-300 text-sm font-medium mb-2">팀 *</label>
            <select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500"
            >
              <option value="">팀 선택</option>
              {TEAMS.map(team => (
                <option key={team} value={team}>{team}</option>
              ))}
            </select>
          </div>

          {/* 출석 상태 */}
          <div>
            <label className="block text-slate-300 text-sm font-medium mb-2">상태</label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500"
            >
              <option value="출석">✅ 출석</option>
              <option value="불참">❌ 불참</option>
              <option value="지각">⏰ 지각</option>
              <option value="조퇴">🏃 조퇴</option>
            </select>
          </div>

          {/* 등록 버튼 */}
          <div className="flex items-end">
            <button
              onClick={handleCheckIn}
              disabled={loading || !selectedPlayer || !selectedTeam}
              className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white py-3 rounded-xl font-semibold transition-colors"
            >
              {loading ? '등록 중...' : '✅ 출석 등록'}
            </button>
          </div>
        </div>
      </div>

      {/* 오늘 출석 현황 - 팀별 */}
      <h2 className="text-xl font-bold text-white mb-4">
        📋 오늘 출석 현황 ({todayAttendance.length}명)
      </h2>

      {todayAttendance.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <p className="text-4xl mb-4">📋</p>
          <p className="text-xl">아직 출석 기록이 없습니다</p>
          <p className="mt-2">위에서 출석 체크를 시작하세요!</p>
        </div>
      ) : (
        TEAMS.map(team => {
          const teamAttendance = todayAttendance.filter(a => a.team === team)
          if (teamAttendance.length === 0) return null

          return (
            <div key={team} className={`mb-6 rounded-xl border ${teamColor(team)} overflow-hidden`}>
              <div className={`px-4 py-3 font-bold text-lg`}>
                {teamEmoji(team)} {team} ({teamAttendance.length}명)
              </div>
              <div className="bg-slate-800">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="px-4 py-2 text-slate-400 text-sm w-16">순서</th>
                      <th className="px-4 py-2 text-slate-400 text-sm">이름</th>
                      <th className="px-4 py-2 text-slate-400 text-sm">상태</th>
                      <th className="px-4 py-2 text-slate-400 text-sm">시간</th>
                      <th className="px-4 py-2 text-slate-400 text-sm w-16">삭제</th>
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
                        <td className="px-4 py-2">
                          <button
                            onClick={() => handleDelete(record.id)}
                            className="text-red-400 hover:text-red-300 text-sm"
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

export default AttendanceCheck