import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function PollVote() {
  const { id } = useParams()
  const [poll, setPoll] = useState(null)
  const [responses, setResponses] = useState([])
  const [players, setPlayers] = useState([])
  const [teams, setTeams] = useState([])
  const [search, setSearch] = useState('')
  const [selectedPlayer, setSelectedPlayer] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchPoll()
    fetchResponses()
    fetchPlayers()
    fetchTeams()
  }, [id])

  async function fetchPoll() {
    const { data } = await supabase.from('polls').select('*').eq('id', id).single()
    setPoll(data)
  }

  async function fetchResponses() {
    const { data } = await supabase
      .from('poll_responses')
      .select('*')
      .eq('poll_id', id)
      .order('responded_at')
    setResponses(data || [])
  }

  async function fetchPlayers() {
    const { data } = await supabase.from('players').select('*').order('name')
    setPlayers(data || [])
  }

  async function fetchTeams() {
    const { data } = await supabase.from('teams').select('*').order('display_order')
    setTeams(data || [])
  }

  // 🗳️ 투표하기 (이름 선택 후 상태 버튼 클릭)
  async function handleVote(response) {
    if (!selectedPlayer) {
      alert('먼저 이름을 선택해주세요!')
      return
    }

    setLoading(true)

    // 기존 투표가 있으면 업데이트, 없으면 새로 추가
    const existing = responses.find(r => r.player_id === selectedPlayer.id)

    if (existing) {
      await supabase
        .from('poll_responses')
        .update({ response, responded_at: new Date().toISOString() })
        .eq('id', existing.id)
    } else {
      await supabase.from('poll_responses').insert([{
        poll_id: id,
        player_id: selectedPlayer.id,
        player_name: selectedPlayer.name,
        team: selectedPlayer.current_team || null,
        response,
      }])
    }

    setSelectedPlayer(null)
    setSearch('')
    setLoading(false)
    fetchResponses()
  }

  async function handleDelete(responseId) {
    if (!window.confirm('투표를 취소하시겠습니까?')) return
    await supabase.from('poll_responses').delete().eq('id', responseId)
    fetchResponses()
  }

  // 🎨 선수 이름 색상 (남색 → 밝은 파랑)
  function getPlayerNameColor(teamColor) {
    if (!teamColor) return '#ffffff'
    const c = teamColor.toLowerCase()
    if (c === '#1d4ed8' || c === '#2563eb' || c === '#1e40af' || c === '#1e3a8a') {
      return '#60a5fa'
    }
    return teamColor
  }

  // 특정 선수의 투표 상태 가져오기
  function getPlayerResponse(playerId) {
    return responses.find(r => r.player_id === playerId)?.response || null
  }

  // 상태별 뱃지 스타일
  const responseBadge = {
    '참석': { emoji: '✅', bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
    '불참': { emoji: '❌', bg: 'bg-red-500/20', text: 'text-red-400' },
    '조퇴': { emoji: '🏃', bg: 'bg-orange-500/20', text: 'text-orange-400' },
    '늦참': { emoji: '⏰', bg: 'bg-yellow-500/20', text: 'text-yellow-400' },
  }

  if (!poll) {
    return <div className="text-center py-20 text-slate-400">⏳ 로딩 중...</div>
  }

  // 이름 검색 결과
  const filteredPlayers = search
    ? players.filter(p => p.name?.includes(search))
    : []

  // 팀별 통계 계산
  function getTeamStats(teamName) {
    const teamResponses = responses.filter(r => r.team === teamName)
    return {
      참석: teamResponses.filter(r => r.response === '참석').length,
      불참: teamResponses.filter(r => r.response === '불참').length,
      조퇴: teamResponses.filter(r => r.response === '조퇴').length,
      늦참: teamResponses.filter(r => r.response === '늦참').length,
    }
  }

  // 전체 통계
  const totalStats = {
    참석: responses.filter(r => r.response === '참석').length,
    불참: responses.filter(r => r.response === '불참').length,
    조퇴: responses.filter(r => r.response === '조퇴').length,
    늦참: responses.filter(r => r.response === '늦참').length,
  }

  // 미배정 선수
  const teamNamesList = teams.map(t => t.name)
  const unassignedPlayers = players.filter(p => !p.current_team || !teamNamesList.includes(p.current_team))

  return (
    <div className="max-w-full mx-auto">
      {/* 헤더 */}
      <div className="mb-6">
        <Link to="/polls" className="text-slate-400 hover:text-white text-sm mb-2 inline-block">
          ← 투표 목록으로
        </Link>
        <h1 className="text-3xl font-bold text-white">⚽ {poll.game_date} 경기</h1>
        <div className="flex flex-wrap gap-4 mt-2">
          {poll.game_time && <p className="text-slate-400">⏰ {poll.game_time}</p>}
          {poll.location && <p className="text-slate-400">📍 {poll.location}</p>}
        </div>
      </div>

      {/* 🗳️ 투표 폼 */}
      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 mb-6">
        <h2 className="text-lg font-bold text-white mb-4">🗳️ 투표하기</h2>

        {/* 이름 검색 */}
        <div className="mb-4">
          <label className="block text-slate-300 text-sm font-medium mb-2">1️⃣ 이름 검색</label>
          <input
            type="text"
            placeholder="🔍 이름을 입력하세요..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setSelectedPlayer(null)
            }}
            className="w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500"
          />
          {search && !selectedPlayer && (
            <div className="bg-slate-700 rounded-xl border border-slate-600 max-h-48 overflow-y-auto mt-2">
              {filteredPlayers.length === 0 ? (
                <p className="px-4 py-3 text-slate-400 text-sm">검색 결과가 없습니다</p>
              ) : (
                filteredPlayers.map(player => {
                  const voted = getPlayerResponse(player.id)
                  return (
                    <button
                      key={player.id}
                      onClick={() => {
                        setSelectedPlayer(player)
                        setSearch(player.name)
                      }}
                      className="w-full text-left px-4 py-2 hover:bg-slate-600 transition-colors text-white flex justify-between items-center"
                    >
                      <span>{player.name} <span className="text-slate-400 text-xs">{player.current_team ? `(${player.current_team})` : '(미배정)'}</span></span>
                      {voted && <span className="text-xs text-slate-400">{responseBadge[voted]?.emoji} {voted}</span>}
                    </button>
                  )
                })
              )}
            </div>
          )}
        </div>

        {/* 선택된 선수 + 상태 버튼 */}
        {selectedPlayer && (
          <div>
            <label className="block text-slate-300 text-sm font-medium mb-2">
              2️⃣ <span className="text-emerald-400 font-bold">{selectedPlayer.name}</span> 님의 참석 여부를 선택하세요
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <button onClick={() => handleVote('참석')} disabled={loading} className="bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-400 border border-emerald-500/30 py-4 rounded-xl font-bold transition-colors">✅ 참석</button>
              <button onClick={() => handleVote('불참')} disabled={loading} className="bg-red-500/20 hover:bg-red-500/40 text-red-400 border border-red-500/30 py-4 rounded-xl font-bold transition-colors">❌ 불참</button>
              <button onClick={() => handleVote('조퇴')} disabled={loading} className="bg-orange-500/20 hover:bg-orange-500/40 text-orange-400 border border-orange-500/30 py-4 rounded-xl font-bold transition-colors">🏃 조퇴</button>
              <button onClick={() => handleVote('늦참')} disabled={loading} className="bg-yellow-500/20 hover:bg-yellow-500/40 text-yellow-400 border border-yellow-500/30 py-4 rounded-xl font-bold transition-colors">⏰ 늦참</button>
            </div>
          </div>
        )}
      </div>

      {/* 📊 전체 요약 */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-emerald-400">{totalStats.참석}</p>
          <p className="text-slate-400 text-sm">✅ 참석</p>
        </div>
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-red-400">{totalStats.불참}</p>
          <p className="text-slate-400 text-sm">❌ 불참</p>
        </div>
        <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-orange-400">{totalStats.조퇴}</p>
          <p className="text-slate-400 text-sm">🏃 조퇴</p>
        </div>
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-yellow-400">{totalStats.늦참}</p>
          <p className="text-slate-400 text-sm">⏰ 늦참</p>
        </div>
      </div>

      {/* 👥 팀별 명단 (팀 3개 + 미배정 = 가로 4칸) */}
      <h2 className="text-xl font-bold text-white mb-4">👥 팀별 현황</h2>
      <div className="grid grid-cols-4 gap-4">
        {teams.map(team => {
          const teamColor = team.color || '#1d4ed8'
          const playerNameColor = getPlayerNameColor(teamColor)
          const teamPlayers = players.filter(p => p.current_team === team.name)
          const stats = getTeamStats(team.name)

          return (
            <div
              key={team.id}
              className="rounded-xl border overflow-hidden"
              style={{ borderColor: `${teamColor}66`, background: `${teamColor}14` }}
            >
              {/* 팀 헤더 */}
              <div className="px-4 py-3 font-bold text-lg border-b border-slate-700/50">
                <div className="flex items-center gap-2">
                  <span className="inline-block w-4 h-4 rounded-full flex-shrink-0" style={{ background: teamColor, border: '1px solid rgba(255,255,255,0.3)' }}></span>
                  <span style={{ color: teamColor }}>{team.name} ({teamPlayers.length}명)</span>
                </div>
              </div>

              {/* 팀별 통계 */}
              <div className="px-3 py-2 border-b border-slate-700/30 flex flex-wrap gap-2 text-xs">
                <span className="text-emerald-400">✅ {stats.참석}</span>
                <span className="text-red-400">❌ {stats.불참}</span>
                <span className="text-orange-400">🏃 {stats.조퇴}</span>
                <span className="text-yellow-400">⏰ {stats.늦참}</span>
              </div>

              {/* 선수 목록 + 상태 뱃지 */}
              <div className="p-3">
                {teamPlayers.length === 0 ? (
                  <p className="text-slate-500 text-sm px-2 py-2">배정된 선수 없음</p>
                ) : (
                  <div className="space-y-2">
                    {teamPlayers.map(player => {
                      const resp = getPlayerResponse(player.id)
                      const badge = resp ? responseBadge[resp] : null
                      const respObj = responses.find(r => r.player_id === player.id)
                      return (
                        <div key={player.id} className="flex items-center justify-between bg-slate-800/50 rounded-lg px-3 py-2">
                          <span className="text-sm font-medium" style={{ color: playerNameColor }}>{player.name}</span>
                          {badge ? (
                            <button
                              onClick={() => respObj && handleDelete(respObj.id)}
                              className={`${badge.bg} ${badge.text} px-2 py-1 rounded-lg text-xs font-medium`}
                              title="클릭하면 투표 취소"
                            >
                              {badge.emoji} {resp}
                            </button>
                          ) : (
                            <span className="text-slate-500 text-xs">⬜ 미투표</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {/* 미배정 선수 카드 */}
        <div className="rounded-xl border border-slate-500/30 bg-slate-500/10 overflow-hidden">
          <div className="px-4 py-3 font-bold text-slate-400 text-lg border-b border-slate-700/50">
            ⚪ 미배정 ({unassignedPlayers.length}명)
          </div>

          {/* 미배정 통계 */}
          <div className="px-3 py-2 border-b border-slate-700/30 flex flex-wrap gap-2 text-xs">
            <span className="text-emerald-400">✅ {unassignedPlayers.filter(p => getPlayerResponse(p.id) === '참석').length}</span>
            <span className="text-red-400">❌ {unassignedPlayers.filter(p => getPlayerResponse(p.id) === '불참').length}</span>
            <span className="text-orange-400">🏃 {unassignedPlayers.filter(p => getPlayerResponse(p.id) === '조퇴').length}</span>
            <span className="text-yellow-400">⏰ {unassignedPlayers.filter(p => getPlayerResponse(p.id) === '늦참').length}</span>
          </div>

          <div className="p-3">
            {unassignedPlayers.length === 0 ? (
              <p className="text-slate-500 text-sm px-2 py-2">모든 선수가 배정됨 🎉</p>
            ) : (
              <div className="space-y-2">
                {unassignedPlayers.map(player => {
                  const resp = getPlayerResponse(player.id)
                  const badge = resp ? responseBadge[resp] : null
                  const respObj = responses.find(r => r.player_id === player.id)
                  return (
                    <div key={player.id} className="flex items-center justify-between bg-slate-800/50 rounded-lg px-3 py-2">
                      <span className="text-slate-400 text-sm font-medium">{player.name}</span>
                      {badge ? (
                        <button
                          onClick={() => respObj && handleDelete(respObj.id)}
                          className={`${badge.bg} ${badge.text} px-2 py-1 rounded-lg text-xs font-medium`}
                          title="클릭하면 투표 취소"
                        >
                          {badge.emoji} {resp}
                        </button>
                      ) : (
                        <span className="text-slate-500 text-xs">⬜ 미투표</span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default PollVote