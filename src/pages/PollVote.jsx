import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

function PollVote() {
  const { id } = useParams()
  const { role, profile } = useAuth()

  // ✅ 전체 수정 권한: 관리자·임원·주장(부주장)
  const canEditAll = role === 'admin' || role === 'executive' || role === 'captain'
  // 🙋 로그인한 사용자와 연결된 선수 id (본인 판별용)
  const myPlayerId = profile?.player_id || null

  const [poll, setPoll] = useState(null)
  const [responses, setResponses] = useState([])
  const [players, setPlayers] = useState([])
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(false)

  // 🗳️ 투표 모달 대상 선수
  const [modalPlayer, setModalPlayer] = useState(null)

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

  // 🔐 이 선수의 투표를 내가 수정할 수 있는가?
  function canEditPlayer(player) {
    if (canEditAll) return true
    if (myPlayerId && player.id === myPlayerId) return true
    return false
  }

  // 🗳️ 투표하기 (모달에서 상태 선택 → 즉시 저장)
  async function handleVote(player, response) {
    if (!player) return
    if (!canEditPlayer(player)) {
      alert('본인의 참석 여부만 변경할 수 있습니다.')
      return
    }
    setLoading(true)

    // 기존 투표가 있으면 업데이트, 없으면 새로 추가
    const existing = responses.find(r => r.player_id === player.id)

    if (existing) {
      await supabase
        .from('poll_responses')
        .update({ response, responded_at: new Date().toISOString() })
        .eq('id', existing.id)
    } else {
      await supabase.from('poll_responses').insert([{
        poll_id: id,
        player_id: player.id,
        player_name: player.name,
        team: player.current_team || null,
        response,
      }])
    }

    setLoading(false)
    setModalPlayer(null)
    fetchResponses()
  }

  // 🗑️ 투표 취소 (미투표로)
  async function handleCancelVote(player) {
    if (!player) return
    if (!canEditPlayer(player)) {
      alert('본인의 참석 여부만 변경할 수 있습니다.')
      return
    }
    const existing = responses.find(r => r.player_id === player.id)
    if (!existing) {
      setModalPlayer(null)
      return
    }
    setLoading(true)
    await supabase.from('poll_responses').delete().eq('id', existing.id)
    setLoading(false)
    setModalPlayer(null)
    fetchResponses()
  }

  // 이름 클릭 → 권한 있으면 모달, 없으면 안내
  function onClickPlayer(player) {
    if (!canEditPlayer(player)) {
      alert('본인의 참석 여부만 변경할 수 있습니다.\n(전체 수정은 관리자·임원·주장만 가능)')
      return
    }
    setModalPlayer(player)
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

  // 모달 상태 선택 버튼 정의
  const voteOptions = [
    { key: '참석', emoji: '✅', base: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', active: 'bg-emerald-500 text-white border-emerald-400' },
    { key: '불참', emoji: '❌', base: 'bg-red-500/15 text-red-300 border-red-500/30', active: 'bg-red-500 text-white border-red-400' },
    { key: '조퇴', emoji: '🏃', base: 'bg-orange-500/15 text-orange-300 border-orange-500/30', active: 'bg-orange-500 text-white border-orange-400' },
    { key: '늦참', emoji: '⏰', base: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30', active: 'bg-yellow-500 text-slate-900 border-yellow-400' },
  ]

  if (!poll) {
    return <div className="text-center py-20 text-slate-400">⏳ 로딩 중...</div>
  }

  // ✅ 현재 실제로 존재하는 선수 id 집합
  const validPlayerIds = new Set(players.map(p => p.id))

  // ✅ 실제 선수와 연결된 응답만 (삭제된 선수의 유령 응답 제외)
  const validResponses = responses.filter(r => validPlayerIds.has(r.player_id))

  // 팀별 통계 계산 (유효 응답 기준)
  function getTeamStats(teamName) {
    const teamResponses = validResponses.filter(r => r.team === teamName)
    return {
      참석: teamResponses.filter(r => r.response === '참석').length,
      불참: teamResponses.filter(r => r.response === '불참').length,
      조퇴: teamResponses.filter(r => r.response === '조퇴').length,
      늦참: teamResponses.filter(r => r.response === '늦참').length,
    }
  }

  // 전체 통계 (유효 응답 기준)
  const totalStats = {
    참석: validResponses.filter(r => r.response === '참석').length,
    불참: validResponses.filter(r => r.response === '불참').length,
    조퇴: validResponses.filter(r => r.response === '조퇴').length,
    늦참: validResponses.filter(r => r.response === '늦참').length,
  }

  // 미배정 선수
  const teamNamesList = teams.map(t => t.name)
  const unassignedPlayers = players.filter(p => !p.current_team || !teamNamesList.includes(p.current_team))

  // 모달 대상 선수의 현재 투표 상태
  const modalCurrentResponse = modalPlayer ? getPlayerResponse(modalPlayer.id) : null

  // 🔽 선수 목록을 [투표함 / 미투표]로 분리
  function splitVoted(list) {
    const voted = list.filter(p => getPlayerResponse(p.id))
    const notVoted = list.filter(p => !getPlayerResponse(p.id))
    return { voted, notVoted }
  }

  // 선수 한 줄(행) 렌더링
  function renderPlayerRow(player, nameColor) {
    const resp = getPlayerResponse(player.id)
    const badge = resp ? responseBadge[resp] : null
    const editable = canEditPlayer(player)
    const isMe = myPlayerId && player.id === myPlayerId

    return (
      <button
        key={player.id}
        onClick={() => onClickPlayer(player)}
        className={`w-full flex items-center justify-between rounded-lg px-3 py-2 transition-colors ${
          editable ? 'bg-slate-800/50 hover:bg-slate-700 cursor-pointer' : 'bg-slate-800/30 cursor-default'
        }`}
        title={editable ? '클릭하여 참석 여부 선택' : '본인 것만 변경 가능'}
      >
        <span className="text-sm font-medium flex items-center gap-1" style={{ color: nameColor }}>
          {player.name}
          {isMe && <span className="text-[10px] bg-emerald-500/25 text-emerald-300 px-1.5 py-0.5 rounded-full">나</span>}
        </span>
        {badge ? (
          <span className={`${badge.bg} ${badge.text} px-2 py-1 rounded-lg text-xs font-medium`}>
            {badge.emoji} {resp}
          </span>
        ) : (
          <span className="text-slate-500 text-xs">⬜ 미투표</span>
        )}
      </button>
    )
  }

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

      {/* 안내 문구 */}
      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3 mb-6 text-emerald-200 text-sm">
        {canEditAll ? (
          <>👑 관리자·임원·주장은 <b>모든 선수</b>의 참석 여부를 변경할 수 있습니다.</>
        ) : (
          <>👇 <b>본인 이름</b>을 클릭하면 참석 여부를 선택할 수 있습니다. (본인 것만 변경 가능)</>
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
          const { voted, notVoted } = splitVoted(teamPlayers)

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

              {/* 선수 목록: 투표함 / 미투표 분리 */}
              <div className="p-3 space-y-3">
                {teamPlayers.length === 0 ? (
                  <p className="text-slate-500 text-sm px-2 py-2">배정된 선수 없음</p>
                ) : (
                  <>
                    {/* 투표 완료 */}
                    <div>
                      <p className="text-[11px] font-bold text-emerald-300 mb-1.5 px-1">
                        🗳️ 투표 완료 ({voted.length})
                      </p>
                      {voted.length === 0 ? (
                        <p className="text-slate-600 text-xs px-2 py-1">아직 없음</p>
                      ) : (
                        <div className="space-y-2">
                          {voted.map(player => renderPlayerRow(player, playerNameColor))}
                        </div>
                      )}
                    </div>

                    {/* 미투표 */}
                    <div>
                      <p className="text-[11px] font-bold text-slate-400 mb-1.5 px-1 pt-1 border-t border-slate-700/40">
                        ⬜ 미투표 ({notVoted.length})
                      </p>
                      {notVoted.length === 0 ? (
                        <p className="text-slate-600 text-xs px-2 py-1">전원 투표 완료 🎉</p>
                      ) : (
                        <div className="space-y-2">
                          {notVoted.map(player => renderPlayerRow(player, playerNameColor))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          )
        })}

        {/* 미배정 선수 카드 */}
        {(() => {
          const { voted, notVoted } = splitVoted(unassignedPlayers)
          return (
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

              <div className="p-3 space-y-3">
                {unassignedPlayers.length === 0 ? (
                  <p className="text-slate-500 text-sm px-2 py-2">모든 선수가 배정됨 🎉</p>
                ) : (
                  <>
                    {/* 투표 완료 */}
                    <div>
                      <p className="text-[11px] font-bold text-emerald-300 mb-1.5 px-1">
                        🗳️ 투표 완료 ({voted.length})
                      </p>
                      {voted.length === 0 ? (
                        <p className="text-slate-600 text-xs px-2 py-1">아직 없음</p>
                      ) : (
                        <div className="space-y-2">
                          {voted.map(player => renderPlayerRow(player, '#cbd5e1'))}
                        </div>
                      )}
                    </div>

                    {/* 미투표 */}
                    <div>
                      <p className="text-[11px] font-bold text-slate-400 mb-1.5 px-1 pt-1 border-t border-slate-700/40">
                        ⬜ 미투표 ({notVoted.length})
                      </p>
                      {notVoted.length === 0 ? (
                        <p className="text-slate-600 text-xs px-2 py-1">전원 투표 완료 🎉</p>
                      ) : (
                        <div className="space-y-2">
                          {notVoted.map(player => renderPlayerRow(player, '#cbd5e1'))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          )
        })()}
      </div>

      {/* 🗳️ 투표 선택 모달 */}
      {modalPlayer && (
        <div
          onClick={() => !loading && setModalPlayer(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#1e293b',
              border: '1px solid #475569',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '380px',
              padding: '22px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            }}
          >
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-white text-xl font-bold">
                {modalPlayer.name}
              </h2>
              <button
                onClick={() => setModalPlayer(null)}
                className="text-slate-400 hover:text-white text-xl leading-none px-2"
                title="닫기"
              >
                ✕
              </button>
            </div>
            <p className="text-slate-400 text-sm mb-4">
              {modalPlayer.current_team ? `${modalPlayer.current_team} · ` : '미배정 · '}
              참석 여부를 선택하세요
            </p>

            {/* 상태 선택 버튼 (현재 선택은 강조) */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              {voteOptions.map(opt => {
                const isActive = modalCurrentResponse === opt.key
                return (
                  <button
                    key={opt.key}
                    onClick={() => handleVote(modalPlayer, opt.key)}
                    disabled={loading}
                    className={`py-5 rounded-xl font-bold text-base border transition-colors disabled:opacity-50 ${
                      isActive ? opt.active : opt.base
                    }`}
                  >
                    {opt.emoji} {opt.key}
                    {isActive && <span className="block text-[11px] font-medium mt-0.5">현재 선택</span>}
                  </button>
                )
              })}
            </div>

            {/* 투표 취소 (미투표로) */}
            {modalCurrentResponse && (
              <button
                onClick={() => handleCancelVote(modalPlayer)}
                disabled={loading}
                className="w-full bg-slate-700 hover:bg-slate-600 text-slate-200 py-3 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
              >
                ⬜ 투표 취소 (미투표로)
              </button>
            )}
          </div>
        </div>
      )}

      {/* ⬇️ 하단 여백 */}
      <div style={{ height: '40px', width: '100%' }} aria-hidden="true"></div>
    </div>
  )
}

export default PollVote