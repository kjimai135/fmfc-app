import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

// 🕐 "7시", "20시-22시", "오후 2시" 등에서 시작 시각(시)만 추출
function parseStartHour(timeStr) {
  if (!timeStr) return null
  const m = String(timeStr).match(/\d{1,2}/)
  if (!m) return null
  const h = parseInt(m[0], 10)
  if (isNaN(h) || h < 0 || h > 23) return null
  return h
}

function AttendanceCheck() {
  const { profile, role } = useAuth()
  const canCheckOthers = role === 'admin' || role === 'executive' || role === 'captain'

  const [players, setPlayers] = useState([])
  const [myPlayer, setMyPlayer] = useState(null)
  const [selectedPlayer, setSelectedPlayer] = useState(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [todayCount, setTodayCount] = useState(0)
  const [todayChecked, setTodayChecked] = useState([])
  const [showOthers, setShowOthers] = useState(false)

  const [myPickup, setMyPickup] = useState(false)
  const [otherPickup, setOtherPickup] = useState(false)

  const [hasGameToday, setHasGameToday] = useState(null)
  const [todayGameInfo, setTodayGameInfo] = useState(null)

  const [currentSeason, setCurrentSeason] = useState('')
  const [isSeasonTransitionDay, setIsSeasonTransitionDay] = useState(false)

  // 🚦 오늘 심판 배정
  const [refereeAssignments, setRefereeAssignments] = useState([])
  const [refereeMatches, setRefereeMatches] = useState([])
  const [refTeams, setRefTeams] = useState([])

  const today = new Date(new Date().getTime() + 9 * 60 * 60 * 1000).toISOString().split('T')[0]

  useEffect(() => {
    fetchSeason()
    fetchPlayers()
    fetchTodayGame()
    fetchRefereeAssignments()
  }, [])

  useEffect(() => {
    if (currentSeason) {
      fetchTodayCount()
      checkSeasonTransitionDay()
    }
  }, [currentSeason])

  useEffect(() => {
    if (profile?.player_id && players.length > 0) {
      const me = players.find((p) => p.id === profile.player_id)
      setMyPlayer(me || null)
    } else {
      setMyPlayer(null)
    }
  }, [profile, players])

  async function fetchSeason() {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'season_label')
      .single()
    setCurrentSeason(data?.value || '')
  }

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
      .eq('season', currentSeason)
      .order('check_order')
    setTodayCount(data?.length || 0)
    setTodayChecked(data?.map((a) => a.player_id) || [])
  }

  async function fetchTodayGame() {
    const { data, error } = await supabase
      .from('reservations')
      .select('*')
      .eq('date', today)
      .eq('is_confirmed', true)
      .order('sort_order', { ascending: true })

    if (error) {
      console.error('오늘 경기 확인 오류:', error)
      setHasGameToday(false)
      return
    }

    if (data && data.length > 0) {
      setHasGameToday(true)
      setTodayGameInfo({ venue: data[0].venue || '', time: data[0].time || '' })
    } else {
      setHasGameToday(false)
      setTodayGameInfo(null)
    }
  }

  // 🚦 오늘 심판 배정 조회
  async function fetchRefereeAssignments() {
    const [{ data: refData }, { data: matchData }, { data: teamData }] = await Promise.all([
      supabase.from('referee_assignments').select('*').eq('game_date', today),
      supabase.from('matches').select('match_number, team_a, team_b').eq('game_date', today).order('match_number'),
      supabase.from('teams').select('name, color'),
    ])
    setRefereeAssignments(refData || [])
    setRefereeMatches(matchData || [])
    setRefTeams(teamData || [])
  }

  // 🎨 팀 색상 (남색 → 밝은 파랑)
  function getRefTeamColor(teamName) {
    const t = refTeams.find(x => x.name === teamName)
    const color = t?.color || '#e2e8f0'
    const c = color.toLowerCase()
    if (c === '#1d4ed8' || c === '#2563eb' || c === '#1e40af' || c === '#1e3a8a') return '#60a5fa'
    return color
  }

  async function checkSeasonTransitionDay() {
    if (!currentSeason) return
    const { data: prevSeasonData } = await supabase
      .from('attendance')
      .select('season')
      .eq('game_date', today)
      .neq('season', currentSeason)
      .limit(1)
    if (prevSeasonData && prevSeasonData.length > 0) {
      setIsSeasonTransitionDay(true)
    } else {
      setIsSeasonTransitionDay(false)
    }
  }

  function isGameStarted() {
    const startHour = parseStartHour(todayGameInfo?.time)
    if (startHour === null) return false
    const now = new Date()
    const nowDecimal = now.getHours() + now.getMinutes() / 60
    return nowDecimal >= startHour
  }

  async function checkInPlayer(player, status, isPickup) {
    if (!hasGameToday) {
      alert('오늘은 확정된 경기 일정이 없어 출석체크를 할 수 없습니다.')
      return
    }
    if (isSeasonTransitionDay) {
      alert('⚠️ 시즌 전환 당일입니다.\n이전 시즌 경기가 종료된 후 새 시즌 출석체크가 가능합니다.')
      return
    }
    if (!player) {
      alert('선수 정보가 없습니다!')
      return
    }
    if (todayChecked.includes(player.id)) {
      alert('이미 출석 체크되었습니다!')
      return
    }
    if (!currentSeason) {
      alert('현재 시즌 정보를 불러올 수 없습니다.')
      return
    }

    let finalStatus = status
    if (status === '출석' && isGameStarted()) {
      const startHour = parseStartHour(todayGameInfo?.time)
      const confirmed = window.confirm(
        `⏰ 경기 시작 시간(${startHour}시)이 이미 지났습니다.\n` +
        `"늦참"으로 기록됩니다. 계속하시겠습니까?`
      )
      if (!confirmed) return
      finalStatus = '늦참'
    }

    setLoading(true)
    const nextOrder = todayCount + 1

    const { error } = await supabase.from('attendance').insert([
      {
        player_id: player.id,
        player_name: player.name,
        team: player.current_team || '미배정',
        status: finalStatus,
        check_order: nextOrder,
        game_date: today,
        is_pickup: !!isPickup,
        season: currentSeason,
      },
    ])

    if (error) {
      alert('오류가 발생했습니다: ' + error.message)
      setMessage('')
    } else {
      setMessage(
        `${player.name}님 ${finalStatus} 완료!${isPickup ? ' 🚗 픽업' : ''} (${player.current_team || '미배정'})`
      )
      setSelectedPlayer(null)
      setSearch('')
      setOtherPickup(false)
      await fetchTodayCount()
      setTimeout(() => setMessage(''), 3000)
    }
    setLoading(false)
  }

  async function cancelAttendance(player) {
    if (!player) return
    const confirmCancel = window.confirm(`${player.name}님의 출석을 취소하시겠습니까?`)
    if (!confirmCancel) return

    setLoading(true)
    const { error } = await supabase
      .from('attendance')
      .delete()
      .eq('player_id', player.id)
      .eq('game_date', today)
      .eq('season', currentSeason)

    if (error) {
      alert('취소 중 오류가 발생했습니다: ' + error.message)
    } else {
      setMessage(`${player.name}님 출석이 취소되었습니다.`)
      setMyPickup(false)
      await fetchTodayCount()
      setTimeout(() => setMessage(''), 3000)
    }
    setLoading(false)
  }

  const iAmChecked = myPlayer && todayChecked.includes(myPlayer.id)

  const filteredPlayers = players.filter(
    (p) => p.name?.includes(search) && !todayChecked.includes(p.id)
  )

  const gameStarted = hasGameToday && isGameStarted()

  return (
    <div className="max-w-lg mx-auto">
      {/* 제목 + 날짜 + 시즌 */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-white text-center">
          ✅ 출석 체크
        </h1>
        <div className="flex items-center justify-center gap-3 mt-2">
          <span className="text-slate-400 text-xl font-normal">{today}</span>
          {currentSeason && (
            <span className="text-emerald-400 text-sm font-semibold px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30">
              🗓️ {currentSeason}
            </span>
          )}
        </div>
      </div>

      {/* 🚫 시즌 전환 당일 경고 */}
      {isSeasonTransitionDay && (
        <div className="bg-amber-500/10 border border-amber-500/40 rounded-2xl p-6 mb-6 text-center">
          <p className="text-4xl mb-3">⚠️</p>
          <p className="text-amber-300 font-bold text-lg mb-2">시즌 전환 당일입니다</p>
          <p className="text-amber-200/80 text-sm">
            이전 시즌 경기가 이미 기록되어 있습니다.<br />
            새 시즌 출석체크는 내일부터 가능합니다.
          </p>
        </div>
      )}

      {/* 📅 오늘 경기 없음 안내 */}
      {hasGameToday === false && (
        <div className="bg-slate-800 border border-dashed border-slate-600 rounded-2xl p-8 mb-6 text-center">
          <p className="text-4xl mb-3">📅</p>
          <p className="text-white font-bold text-lg mb-1">오늘은 확정된 경기 일정이 없습니다</p>
          <p className="text-slate-400 text-sm">경기가 확정(노란색)된 날에만 출석체크를 할 수 있어요.</p>
        </div>
      )}

      {/* 확인 중 */}
      {hasGameToday === null && (
        <div className="text-center text-slate-400 py-10">⏳ 오늘 경기 일정을 확인하는 중...</div>
      )}

      {/* ⚽ 경기가 있는 날에만 아래 내용 표시 */}
      {hasGameToday === true && !isSeasonTransitionDay && (
        <>
          {/* 📍 오늘 경기 정보 안내 */}
          {(todayGameInfo?.venue || todayGameInfo?.time) && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3 mb-6 text-center text-emerald-200 text-sm">
              ⚽ 오늘 경기
              {todayGameInfo.time && <span className="ml-2">⏰ {todayGameInfo.time}</span>}
              {todayGameInfo.venue && <span className="ml-2">📍 {todayGameInfo.venue}</span>}
            </div>
          )}

          {/* 🔥 경기 시작 후 안내 */}
          {gameStarted && (
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl px-4 py-3 mb-6 text-center text-blue-200 text-sm">
              🕐 경기가 시작되었습니다. 지금 "출석"을 누르면 <b>늦참</b>으로 기록됩니다.
            </div>
          )}

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
                  <p className="text-emerald-400 font-bold text-lg mb-4">오늘 출석 완료!</p>
                  <button
                    onClick={() => cancelAttendance(myPlayer)}
                    disabled={loading}
                    className="bg-red-500/80 hover:bg-red-500 disabled:opacity-30 text-white px-6 py-2.5 rounded-xl font-semibold text-sm transition-colors"
                  >
                    ❌ 출석 취소
                  </button>
                </div>
              ) : (
                <>
                  {/* 🚗 픽업 체크 */}
                  <label
                    className={`flex items-center gap-3 rounded-xl border p-3 mb-4 cursor-pointer transition-colors ${
                      myPickup
                        ? 'bg-amber-500/15 border-amber-500/50'
                        : 'bg-slate-700/40 border-slate-600 hover:bg-slate-700/60'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={myPickup}
                      onChange={(e) => setMyPickup(e.target.checked)}
                      className="w-5 h-5 accent-amber-500 flex-shrink-0"
                    />
                    <div>
                      <p className="text-white font-bold text-sm">🚗 픽업했어요</p>
                      <p className="text-slate-400 text-xs mt-0.5">
                        픽업하신 분은 1시간 일찍 온 것으로 순서가 앞당겨집니다
                      </p>
                    </div>
                  </label>

                  <div className="grid grid-cols-3 gap-4">
                    <button
                      onClick={() => checkInPlayer(myPlayer, '출석', myPickup)}
                      disabled={loading}
                      className="bg-blue-500 hover:bg-blue-600 disabled:opacity-30 text-white py-8 rounded-2xl font-bold text-xl transition-colors shadow-lg shadow-blue-500/20"
                    >
                      ✅<br />출석
                    </button>
                    <button
                      onClick={() => checkInPlayer(myPlayer, '늦참', myPickup)}
                      disabled={loading}
                      className="bg-yellow-500 hover:bg-yellow-600 disabled:opacity-30 text-slate-900 py-8 rounded-2xl font-bold text-xl transition-colors shadow-lg shadow-yellow-500/20"
                    >
                      🕐<br />늦참
                    </button>
                    <button
                      onClick={() => checkInPlayer(myPlayer, '조퇴', myPickup)}
                      disabled={loading}
                      className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-30 text-white py-8 rounded-2xl font-bold text-xl transition-colors shadow-lg shadow-emerald-500/20"
                    >
                      🏃<br />조퇴
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="bg-sky-500/10 border border-sky-500/30 rounded-xl px-4 py-3 mb-6 text-sky-200 text-sm text-center">
              👤 계정에 연결된 선수 정보가 없습니다.
              {canCheckOthers ? ' 아래에서 이름을 검색해 출석 체크하세요.' : ' 관리자에게 선수 연결을 요청해주세요.'}
            </div>
          )}

          {/* ===== 대리 체크 ===== */}
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

                      <label
                        className={`flex items-center gap-3 rounded-xl border p-3 mt-4 cursor-pointer transition-colors ${
                          otherPickup
                            ? 'bg-amber-500/15 border-amber-500/50'
                            : 'bg-slate-700/40 border-slate-600 hover:bg-slate-700/60'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={otherPickup}
                          onChange={(e) => setOtherPickup(e.target.checked)}
                          className="w-5 h-5 accent-amber-500 flex-shrink-0"
                        />
                        <span className="text-white font-bold text-sm">🚗 픽업함</span>
                      </label>

                      <div className="grid grid-cols-3 gap-4" style={{ marginTop: '16px' }}>
                        <button
                          onClick={() => checkInPlayer(selectedPlayer, '출석', otherPickup)}
                          disabled={loading}
                          className="bg-blue-500 hover:bg-blue-600 disabled:opacity-30 text-white py-6 rounded-2xl font-bold text-lg transition-colors"
                        >
                          ✅<br />출석
                        </button>
                        <button
                          onClick={() => checkInPlayer(selectedPlayer, '늦참', otherPickup)}
                          disabled={loading}
                          className="bg-yellow-500 hover:bg-yellow-600 disabled:opacity-30 text-slate-900 py-6 rounded-2xl font-bold text-lg transition-colors"
                        >
                          🕐<br />늦참
                        </button>
                        <button
                          onClick={() => checkInPlayer(selectedPlayer, '조퇴', otherPickup)}
                          disabled={loading}
                          className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-30 text-white py-6 rounded-2xl font-bold text-lg transition-colors"
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

          {/* 🚦 오늘 심판 배정표 (참고용) */}
          {refereeMatches.length > 0 && refereeAssignments.length > 0 && (
            <div className="mt-8">
              <h2 className="text-lg font-bold text-white mb-3 text-center">🚦 오늘 심판 배정</h2>

              <div className="rounded-xl overflow-hidden border border-slate-700">
                {/* 헤더 (라벨 한 번만) */}
                <div className="flex items-center gap-3" style={{ background: 'rgba(15,23,42,0.7)' }}>
                  <div className="flex items-center justify-center flex-shrink-0 w-14 py-2">
                    <span className="text-slate-400 text-xs font-bold">쿼터</span>
                  </div>
                  <div className="flex-1 py-2 pr-3 grid grid-cols-2 gap-2 text-center">
                    <span className="text-white text-xs font-bold">👨‍⚖️ 주심</span>
                    <span className="text-white text-xs font-bold border-l border-slate-700/60">🚩 부심</span>
                  </div>
                </div>

                {/* 쿼터별 행 */}
                {refereeMatches.map(match => {
                  const mainList = refereeAssignments
                    .filter(a => a.match_number === match.match_number && a.role === '주심')
                  const subList = refereeAssignments
                    .filter(a => a.match_number === match.match_number && a.role === '부심')

                  return (
                    <div
                      key={match.match_number}
                      className="flex items-center gap-3 border-t border-slate-700/50"
                      style={{ background: 'rgba(30,41,59,0.6)' }}
                    >
                      {/* 쿼터 배지 */}
                      <div
                        className="flex items-center justify-center flex-shrink-0 w-14 self-stretch"
                        style={{ background: 'rgba(16,185,129,0.15)' }}
                      >
                        <span className="text-emerald-400 font-black text-lg">{match.match_number}Q</span>
                      </div>

                      {/* 주심 / 부심 (이름만) */}
                      <div className="flex-1 py-3 pr-3 grid grid-cols-2 gap-2">
                        <span className="font-bold text-sm text-center">
                          {mainList.length > 0
                            ? mainList.map((a, i) => (
                                <span key={i} style={{ color: getRefTeamColor(a.team) }}>
                                  {a.player_name}{i < mainList.length - 1 ? ', ' : ''}
                                </span>
                              ))
                            : <span className="text-slate-600">-</span>}
                        </span>
                        <span className="font-medium text-sm text-center border-l border-slate-700/60">
                          {subList.length > 0
                            ? subList.map((a, i) => (
                                <span key={i} style={{ color: getRefTeamColor(a.team) }}>
                                  {a.player_name}{i < subList.length - 1 ? ', ' : ''}
                                </span>
                              ))
                            : <span className="text-slate-600">-</span>}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>

              <p className="text-slate-500 text-xs text-center mt-3">
                ※ 관리자가 배정한 오늘 경기 심판입니다.
              </p>
            </div>
          )}
        </>
      )}

      {/* 하단 여백 */}
      <div style={{ height: '60px', width: '100%' }} aria-hidden="true"></div>
    </div>
  )
}

export default AttendanceCheck