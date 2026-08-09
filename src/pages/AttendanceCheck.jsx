import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

function AttendanceCheck() {
  const { profile, role } = useAuth()
  // 관리자·임원·주장은 다른 사람 대리 체크 가능
  const canCheckOthers = role === 'admin' || role === 'executive' || role === 'captain'

  const [players, setPlayers] = useState([])
  const [myPlayer, setMyPlayer] = useState(null) // 내 계정에 연결된 선수
  const [selectedPlayer, setSelectedPlayer] = useState(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [todayCount, setTodayCount] = useState(0)
  const [todayChecked, setTodayChecked] = useState([])
  const [showOthers, setShowOthers] = useState(false)

  const today = new Date(new Date().getTime() + 9 * 60 * 60 * 1000).toISOString().split('T')[0]

  useEffect(() => {
    fetchPlayers()
    fetchTodayCount()
  }, [])

  // 내 선수 정보 세팅 (profile.player_id 기준)
  useEffect(() => {
    if (profile?.player_id && players.length > 0) {
      const me = players.find((p) => p.id === profile.player_id)
      setMyPlayer(me || null)
    } else {
      setMyPlayer(null)
    }
  }, [profile, players])

  async function fetchPlayers() {
    const { data } = await supabase
      .from('players')
      .select('*')
      .order('name')
    setPlayers((data || []).filter((p) => p.is_active !== false))
  }

  async function fetchTodayCount() {
    const { data } = await supabase
      .from('attendance')
      .select('*')
      .eq('game_date', today)
      .order('check_order')
    setTodayCount(data?.length || 0)
    setTodayChecked(data?.map((a) => a.player_id) || [])
  }

  // 특정 선수를 출석 처리 (본인/대리 공통)
  async function checkInPlayer(player, status) {
    if (!player) {
      alert('선수 정보가 없습니다!')
      return
    }
    if (todayChecked.includes(player.id)) {
      alert('이미 출석 체크되었습니다!')
      return
    }

    setLoading(true)
    const nextOrder = todayCount + 1

    const { error } = await supabase.from('attendance').insert([
      {
        player_id: player.id,
        player_name: player.name,
        team: player.current_team || '미배정',
        status: status,
        check_order: nextOrder,
        game_date: today,
      },
    ])

    if (error) {
      alert('오류가 발생했습니다: ' + error.message)
      setMessage('')
    } else {
      setMessage(`${player.name}님 ${status} 완료! (${player.current_team || '미배정'})`)
      setSelectedPlayer(null)
      setSearch('')
      await fetchTodayCount()
      setTimeout(() => setMessage(''), 3000)
    }
    setLoading(false)
  }

  const iAmChecked = myPlayer && todayChecked.includes(myPlayer.id)

  const filteredPlayers = players.filter(
    (p) => p.name?.includes(search) && !todayChecked.includes(p.id)
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

      {/* ===== 본인 빠른 출석 ===== */}
      {myPlayer ? (
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 mb-6">
          <p className="text-slate-400 text-sm text-center mb-1">👤 내 출석</p>
          <p className="text-white text-2xl font-bold text-center">{myPlayer.name}</p>
          <p className="text-slate-400 text-center mb-5">{myPlayer.current_team || '팀 미배정'}</p>

          {iAmChecked ? (
            <div className="bg-emerald-500/15 border border-emerald-500/40 rounded-2xl py-6 text-center">
              <p className="text-4xl mb-2">🎉</p>
              <p className="text-emerald-400 font-bold text-lg">오늘 출석 완료!</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              <button
                onClick={() => checkInPlayer(myPlayer, '출석')}
                disabled={loading}
                className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-30 text-white py-8 rounded-2xl font-bold text-xl transition-colors shadow-lg shadow-emerald-500/20"
              >
                ✅<br />출석
              </button>
              <button
                onClick={() => checkInPlayer(myPlayer, '늦참')}
                disabled={loading}
                className="bg-blue-500 hover:bg-blue-600 disabled:opacity-30 text-white py-8 rounded-2xl font-bold text-xl transition-colors shadow-lg shadow-blue-500/20"
              >
                🕐<br />늦참
              </button>
              <button
                onClick={() => checkInPlayer(myPlayer, '조퇴')}
                disabled={loading}
                className="bg-orange-500 hover:bg-orange-600 disabled:opacity-30 text-white py-8 rounded-2xl font-bold text-xl transition-colors shadow-lg shadow-orange-500/20"
              >
                🏃<br />조퇴
              </button>
            </div>
          )}
        </div>
      ) : (
        // 선수 연결이 안 된 계정 안내
        <div className="bg-sky-500/10 border border-sky-500/30 rounded-xl px-4 py-3 mb-6 text-sky-200 text-sm text-center">
          👤 계정에 연결된 선수 정보가 없습니다.
          {canCheckOthers ? ' 아래에서 이름을 검색해 출석 체크하세요.' : ' 관리자에게 선수 연결을 요청해주세요.'}
        </div>
      )}

      {/* ===== 대리 체크 (관리자·임원·주장, 또는 선수 연결 안 된 계정) ===== */}
      {(canCheckOthers || !myPlayer) && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-4">
          <button
            onClick={() => setShowOthers((v) => !v)}
            className="w-full flex items-center justify-between text-slate-200 font-semibold"
          >
            <span>🔍 다른 회원 출석 체크</span>
            <span className="text-slate-400">{showOthers ? '▲' : '▼'}</span>
          </button>

          {showOthers && (
            <div className="mt-4">
              <input
                type="text"
                placeholder="🔍 이름 입력..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setSelectedPlayer(null)
                }}
                className="w-full bg-slate-700 border border-slate-600 rounded-xl px-5 py-4 text-white text-lg placeholder-slate-400 focus:outline-none focus:border-emerald-500 text-center"
              />

              {search && (
                <div className="bg-slate-700 rounded-xl border border-slate-600 mt-3 max-h-48 overflow-y-auto">
                  {filteredPlayers.length === 0 ? (
                    <p className="px-4 py-3 text-slate-400 text-center text-sm">검색 결과 없음</p>
                  ) : (
                    filteredPlayers.map((player) => (
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

              {selectedPlayer && (
                <>
                  <div className="text-center mt-4">
                    <p className="text-white text-xl font-bold">{selectedPlayer.name}</p>
                    <p className="text-slate-400">{selectedPlayer.current_team || '팀 미배정'}</p>
                  </div>

                  <div className="grid grid-cols-3 gap-4" style={{ marginTop: '16px' }}>
                    <button
                      onClick={() => checkInPlayer(selectedPlayer, '출석')}
                      disabled={loading}
                      className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-30 text-white py-6 rounded-2xl font-bold text-lg transition-colors"
                    >
                      ✅<br />출석
                    </button>
                    <button
                      onClick={() => checkInPlayer(selectedPlayer, '늦참')}
                      disabled={loading}
                      className="bg-blue-500 hover:bg-blue-600 disabled:opacity-30 text-white py-6 rounded-2xl font-bold text-lg transition-colors"
                    >
                      🕐<br />늦참
                    </button>
                    <button
                      onClick={() => checkInPlayer(selectedPlayer, '조퇴')}
                      disabled={loading}
                      className="bg-orange-500 hover:bg-orange-600 disabled:opacity-30 text-white py-6 rounded-2xl font-bold text-lg transition-colors"
                    >
                      🏃<br />조퇴
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* 오늘 출석 인원 */}
      <p className="text-slate-500 text-sm text-center mt-6">오늘 출석 인원: {todayCount}명</p>
    </div>
  )
}

export default AttendanceCheck