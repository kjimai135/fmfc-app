import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

function AttendanceCheck() {
  const [players, setPlayers] = useState([])
  const [selectedPlayer, setSelectedPlayer] = useState(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [todayCount, setTodayCount] = useState(0)
  const [todayChecked, setTodayChecked] = useState([])

  const today = new Date(new Date().getTime() + 9 * 60 * 60 * 1000).toISOString().split('T')[0]

  useEffect(() => {
    fetchPlayers()
    fetchTodayCount()
  }, [])

  async function fetchPlayers() {
    const { data } = await supabase
      .from('players')
      .select('*')
      .order('name')
    setPlayers(data || [])
  }

  async function fetchTodayCount() {
    const { data } = await supabase
      .from('attendance')
      .select('*')
      .eq('game_date', today)
      .order('check_order')
    setTodayCount(data?.length || 0)
    setTodayChecked(data?.map(a => a.player_id) || [])
  }

  async function handleCheckIn(status) {
    if (!selectedPlayer) {
      alert('이름을 선택해주세요!')
      return
    }

    if (todayChecked.includes(selectedPlayer.id)) {
      alert('이미 출석 체크되었습니다!')
      return
    }

    setLoading(true)
    const nextOrder = todayCount + 1

    const { error } = await supabase
      .from('attendance')
      .insert([{
        player_id: selectedPlayer.id,
        player_name: selectedPlayer.name,
        team: selectedPlayer.current_team || '미배정',
        status: status,
        check_order: nextOrder,
        game_date: today,
      }])

    if (error) {
      alert('오류가 발생했습니다: ' + error.message)
      setMessage('')
    } else {
      setMessage(`${selectedPlayer.name}님 ${status} 완료! (${selectedPlayer.current_team || '미배정'})`)
      setSelectedPlayer(null)
      setSearch('')
      fetchTodayCount()

      setTimeout(() => setMessage(''), 3000)
    }
    setLoading(false)
  }

  const filteredPlayers = players.filter(p =>
    p.name?.includes(search) && !todayChecked.includes(p.id)
  )

  return (
    <div className="max-w-lg mx-auto">
      {/* 제목 + 날짜 */}
      <h1 className="text-3xl font-bold text-white mb-8 text-center">
        ✅ 출석 체크 <span className="text-slate-400 text-xl font-normal ml-2">{today}</span>
      </h1>

      {/* 성공 메시지 */}
      {message && (
        <div className="bg-emerald-500/20 border border-emerald-500/50 rounded-xl p-4 mb-6 text-center">
          <p className="text-emerald-400 font-bold text-lg">{message}</p>
        </div>
      )}

      {/* 이름 검색 */}
      <p className="text-slate-400 text-sm mb-3 text-center">이름을 검색하세요</p>

      <input
        type="text"
        placeholder="🔍 이름 입력..."
        value={search}
        onChange={(e) => {
          setSearch(e.target.value)
          setSelectedPlayer(null)
        }}
        className="w-full bg-slate-700 border border-slate-600 rounded-xl px-5 py-5 text-white text-xl placeholder-slate-400 focus:outline-none focus:border-emerald-500 text-center"
      />

      {search && (
        <div className="bg-slate-700 rounded-xl border border-slate-600 mt-3 max-h-48 overflow-y-auto">
          {filteredPlayers.length === 0 ? (
            <p className="px-4 py-3 text-slate-400 text-center text-sm">검색 결과 없음</p>
          ) : (
            filteredPlayers.map(player => (
              <button
                key={player.id}
                onClick={() => {
                  setSelectedPlayer(player)
                  setSearch(player.name)
                }}
                className={`w-full text-left px-4 py-3 hover:bg-slate-600 transition-colors border-b border-slate-600/50 ${
                  selectedPlayer?.id === player.id ? 'bg-emerald-500/20 text-emerald-400' : 'text-white'
                }`}
              >
                <span className="font-medium">{player.name}</span>
                {player.current_team && (
                  <span className="text-slate-400 text-sm ml-2">({player.current_team})</span>
                )}
              </button>
            ))
          )}
        </div>
      )}

      {/* 선택된 선수 정보 */}
      {selectedPlayer && (
        <div className="text-center mt-4">
          <p className="text-white text-xl font-bold">{selectedPlayer.name}</p>
          <p className="text-slate-400">{selectedPlayer.current_team || '팀 미배정'}</p>
        </div>
      )}

      {/* 출석/지각/조퇴 버튼 */}
      <div className="grid grid-cols-3 gap-4" style={{marginTop: '20px'}}>
        <button
          onClick={() => handleCheckIn('출석')}
          disabled={loading || !selectedPlayer}
          className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-30 text-white py-8 rounded-2xl font-bold text-xl transition-colors shadow-lg shadow-emerald-500/20"
        >
          ✅<br />출석
        </button>
        <button
          onClick={() => handleCheckIn('지각')}
          disabled={loading || !selectedPlayer}
          className="bg-yellow-500 hover:bg-yellow-600 disabled:opacity-30 text-white py-8 rounded-2xl font-bold text-xl transition-colors shadow-lg shadow-yellow-500/20"
        >
          ⏰<br />지각
        </button>
        <button
          onClick={() => handleCheckIn('조퇴')}
          disabled={loading || !selectedPlayer}
          className="bg-orange-500 hover:bg-orange-600 disabled:opacity-30 text-white py-8 rounded-2xl font-bold text-xl transition-colors shadow-lg shadow-orange-500/20"
        >
          🏃<br />조퇴
        </button>
      </div>
    </div>
  )
}

export default AttendanceCheck