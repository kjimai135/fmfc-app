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

  // 🗳️ 투표 모달 대상 선수 (다른 선수 대리 투표용)
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
    // ✅ 탈퇴한 선수(is_active === false) 제외
    //    (is_active가 null이거나 없는 예전 데이터는 활동중으로 취급)
    setPlayers((data || []).filter(p => p.is_active !== false))
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

  // 🗳️ 투표하기 (모달 또는 상단 "내 투표" 카드에서 호출)
  async function handleVote(player, response) {
    if (!player) return
    if (!canEditPlayer(player)) {
      alert('본인의 참석 여부만 변경할 수 있습니다.')
      return
    }
    setLoading(true)

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

  // 이름 클릭 → 다른 선수는 권한 있으면 모달, 본인은 상단 카드 이용 안내
  function onClickPlayer(player) {
    const isMe = myPlayerId && player.id === myPlayerId
    if (isMe) {
      // 본인은 상단 "내 투표" 카드에서만 변경 가능
      return
    }
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

  // 💡 상태별 램프 색상
  const LAMP_COLORS = {
    '참석': '#10b981', // 초록
    '늦참': '#eab308', // 노랑
    '조퇴': '#f97316', // 주황
    '불참': '#ef4444', // 빨강
  }

  // 투표 상태 선택 버튼 정의 (모달 + 상단 카드 공용)
  const voteOptions = [
    { key: '참석', emoji: '✅', base: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', active: 'bg-emerald-500 text-white border-emerald-400' },
    { key: '불참', emoji: '❌', base: 'bg-red-500/15 text-red-300 border-red-500/30', active: 'bg-red-500 text-white border-red-400' },
    { key: '조퇴', emoji: '🏃', base: 'bg-orange-500/15 text-orange-300 border-orange-500/30', active: 'bg-orange-500 text-white border-orange-400' },
    { key: '늦참', emoji: '⏰', base: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30', active: 'bg-yellow-500 text-slate-900 border-yellow-400' },
  ]

  if (!poll) {
    return <div className="text-center py-20 text-slate-400">⏳ 로딩 중...</div>
  }

  // ✅ 현재 실제로 존재하는(활동중) 선수 id 집합
  const validPlayerIds = new Set(players.map(p => p.id))

  // ✅ 실제 선수와 연결된 응답만 (삭제·탈퇴 선수의 유령 응답 제외)
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

  // 미배정 선수
  const teamNamesList = teams.map(t => t.name)
  const unassignedPlayers = players.filter(p => !p.current_team || !teamNamesList.includes(p.current_team))
  // 팀에 배정된 선수 (미투표 계산에 사용)
  const assignedPlayers = players.filter(p => p.current_team && teamNamesList.includes(p.current_team))

  // 전체 통계 (유효 응답 기준)
  const totalStats = {
    참석: validResponses.filter(r => r.response === '참석').length,
    불참: validResponses.filter(r => r.response === '불참').length,
    조퇴: validResponses.filter(r => r.response === '조퇴').length,
    늦참: validResponses.filter(r => r.response === '늦참').length,
    // 🆕 미투표: 팀 배정된 활동중 선수 중 응답이 없는 사람 (미배정·탈퇴자 제외)
    미투표: assignedPlayers.filter(p => !getPlayerResponse(p.id)).length,
  }

  // 모달 대상 선수의 현재 투표 상태
  const modalCurrentResponse = modalPlayer ? getPlayerResponse(modalPlayer.id) : null

  // 🙋 내 선수 정보 + 현재 투표 상태
  const myPlayer = myPlayerId ? players.find(p => p.id === myPlayerId) : null
  const myResponse = myPlayer ? getPlayerResponse(myPlayer.id) : null

  // 🔽 선수 목록을 [참석예정(참석/조퇴/늦참) / 미투표·불참]으로 분리
  function splitByAvailability(list) {
    const coming = list.filter(p => {
      const r = getPlayerResponse(p.id)
      return r === '참석' || r === '조퇴' || r === '늦참'
    })
    const down = list.filter(p => {
      const r = getPlayerResponse(p.id)
      return r === '불참' || !r
    })
    return { coming, down }
  }

  // 💡 램프 하나 렌더링 (상태 텍스트 없이 색깔 원만)
  function StatusLamp({ resp }) {
    const color = resp ? LAMP_COLORS[resp] : null
    return (
      <span
        title={resp || '미투표'}
        style={{
          width: '14px',
          height: '14px',
          borderRadius: '9999px',
          flexShrink: 0,
          display: 'inline-block',
          background: color || 'transparent',
          border: color ? '1px solid rgba(255,255,255,0.35)' : '1.5px solid #64748b',
          boxShadow: color ? `0 0 6px ${color}80` : 'none',
        }}
      ></span>
    )
  }

  // 📊 통계 줄 (아이콘 없이 색깔 숫자만 · 한 줄 고정)
  function StatsRow({ stats }) {
    return (
      <div
        className="px-3 py-1.5 border-b border-slate-700/30 flex items-center text-sm font-bold whitespace-nowrap overflow-hidden"
        style={{ gap: '10px' }}
      >
        <span title="참석" style={{ color: LAMP_COLORS['참석'] }}>{stats.참석}</span>
        <span title="늦참" style={{ color: LAMP_COLORS['늦참'] }}>{stats.늦참}</span>
        <span title="조퇴" style={{ color: LAMP_COLORS['조퇴'] }}>{stats.조퇴}</span>
        <span title="불참" style={{ color: LAMP_COLORS['불참'] }}>{stats.불참}</span>
      </div>
    )
  }

  // 선수 한 줄(행) 렌더링 — 이름 가운데, 램프 오른쪽 (본인은 눈에 띄게 강조 + 클릭 비활성)
  function renderPlayerRow(player, nameColor) {
    const resp = getPlayerResponse(player.id)
    const isMe = myPlayerId && player.id === myPlayerId
    // 본인은 아래 목록에서 클릭 불가(상단 "내 투표" 카드 이용), 그 외엔 기존 권한 로직 사용
    const editable = !isMe && canEditPlayer(player)

    return (
      <button
        key={player.id}
        onClick={() => onClickPlayer(player)}
        disabled={isMe}
        className={`w-full flex items-center gap-1.5 rounded-lg px-3 py-2 transition-colors border ${
          isMe
            ? 'bg-emerald-500/20 border-emerald-400 shadow-md shadow-emerald-500/20'
            : editable
            ? 'bg-slate-800/50 hover:bg-slate-700 cursor-pointer border-transparent'
            : 'bg-slate-800/30 cursor-default border-transparent'
        }`}
        title={isMe ? '내 투표는 위 "내 투표" 카드에서 변경하세요' : editable ? '클릭하여 참석 여부 선택' : '본인 것만 변경 가능'}
      >
        {/* 램프 폭만큼 왼쪽 여백 (이름이 정확히 가운데 오도록) */}
        <span style={{ width: '14px', flexShrink: 0 }} aria-hidden="true"></span>

        {/* 이름 (가운데) */}
        <span
          className={`flex-1 min-w-0 text-sm flex items-center justify-center text-center ${isMe ? 'font-extrabold' : 'font-medium'}`}
          style={{ color: isMe ? '#6ee7b7' : nameColor }}
        >
          <span className="truncate">{player.name}</span>
        </span>

        {/* 💡 상태 램프 (오른쪽) */}
        <StatusLamp resp={resp} />
      </button>
    )
  }

  // 선수 목록 렌더링 (참석예정 → 구분선 → 미투표·불참)
  function renderPlayerList(list, nameColor) {
    const { coming, down } = splitByAvailability(list)
    return (
      <div className="space-y-2">
        {coming.map(player => renderPlayerRow(player, nameColor))}
        {coming.length > 0 && down.length > 0 && (
          <div className="border-t border-slate-700/40 my-1"></div>
        )}
        {down.map(player => renderPlayerRow(player, nameColor))}
      </div>
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

      {/* 🙋 내 투표 (맨 위, 새로 생성/변경) — 이름/팀 가운데 정렬 */}
      {myPlayer ? (
        <div className="bg-slate-800 border border-emerald-500/40 rounded-2xl p-5 mb-6">
          <p className="text-slate-400 text-sm mb-1 text-center">🙋 내 투표</p>
          <p className="text-white text-xl font-bold text-center">{myPlayer.name}</p>
          <p className="text-slate-400 text-sm mb-4 text-center">{myPlayer.current_team || '팀 미배정'}</p>

          <div className="grid grid-cols-4 gap-2 mb-3">
            {voteOptions.map(opt => {
              const isActive = myResponse === opt.key
              return (
                <button
                  key={opt.key}
                  onClick={() => handleVote(myPlayer, opt.key)}
                  disabled={loading}
                  className={`py-4 rounded-xl font-bold text-sm border transition-colors disabled:opacity-50 ${
                    isActive ? opt.active : opt.base
                  }`}
                >
                  {opt.emoji}<br />{opt.key}
                </button>
              )
            })}
          </div>

          {myResponse && (
            <button
              onClick={() => handleCancelVote(myPlayer)}
              disabled={loading}
              className="w-full bg-slate-700 hover:bg-slate-600 text-slate-200 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
            >
              ⬜ 투표 취소 (미투표로)
            </button>
          )}
        </div>
      ) : (
        <div className="bg-sky-500/10 border border-sky-500/30 rounded-xl px-4 py-3 mb-6 text-sky-200 text-sm text-center">
          👤 계정에 연결된 선수 정보가 없어 본인 투표를 할 수 없습니다. 관리자에게 문의해주세요.
        </div>
      )}

      {/* 안내 문구 */}
      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3 mb-4 text-emerald-200 text-sm">
        {canEditAll ? (
          <>👑 관리자·임원·주장은 아래 목록에서 <b>다른 선수</b>의 참석 여부도 변경할 수 있습니다. (본인 것은 위 "내 투표"에서 변경)</>
        ) : (
          <>👇 아래는 전체 <b>참석 현황</b>입니다. 본인 투표는 위 "내 투표"에서 변경해주세요.</>
        )}
      </div>

      {/* 👥 팀별 명단 (팀 3개 + 미배정 = 가로 4칸) — 제목 가운데 정렬 */}
      <h2 className="text-xl font-bold text-white mb-4 text-center">👥 팀별 현황</h2>

      {/* 📊 전체 요약 (팀별 현황 헤더 바로 아래로 이동) */}
      <div className="grid grid-cols-5 gap-3 mb-4">
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-emerald-400">{totalStats.참석}</p>
          <p className="text-slate-400 text-sm">참석</p>
        </div>
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-yellow-400">{totalStats.늦참}</p>
          <p className="text-slate-400 text-sm">늦참</p>
        </div>
        <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-orange-400">{totalStats.조퇴}</p>
          <p className="text-slate-400 text-sm">조퇴</p>
        </div>
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-red-400">{totalStats.불참}</p>
          <p className="text-slate-400 text-sm">불참</p>
        </div>
        {/* 🆕 미투표 (미배정·탈퇴자 제외) */}
        <div className="bg-slate-500/10 border border-slate-500/40 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-slate-300">{totalStats.미투표}</p>
          <p className="text-slate-400 text-sm">미투표</p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
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
              {/* 팀 헤더 (한 줄 고정) */}
              <div className="px-3 py-2.5 font-bold text-base border-b border-slate-700/50">
                <div className="flex items-center gap-1.5 min-w-0 whitespace-nowrap">
                  <span className="inline-block w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ background: teamColor, border: '1px solid rgba(255,255,255,0.3)' }}></span>
                  <span className="truncate" style={{ color: teamColor }}>
                    {team.name}
                    <span className="text-xs font-semibold ml-1">({teamPlayers.length})</span>
                  </span>
                </div>
              </div>

              {/* 팀별 통계 (숫자만, 한 줄) */}
              <StatsRow stats={stats} />

              {/* 선수 목록 (참석예정 → 구분선 → 미투표·불참) */}
              <div className="p-2.5">
                {teamPlayers.length === 0 ? (
                  <p className="text-slate-500 text-xs px-2 py-2">배정된 선수 없음</p>
                ) : (
                  renderPlayerList(teamPlayers, playerNameColor)
                )}
              </div>
            </div>
          )
        })}

        {/* 미배정 선수 카드 */}
        <div className="rounded-xl border border-slate-500/30 bg-slate-500/10 overflow-hidden">
          <div className="px-3 py-2.5 font-bold text-slate-400 text-base border-b border-slate-700/50">
            <div className="flex items-center gap-1.5 min-w-0 whitespace-nowrap">
              <span className="inline-block w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ background: '#64748b', border: '1px solid rgba(255,255,255,0.3)' }}></span>
              <span className="truncate">
                미배정
                <span className="text-xs font-semibold ml-1">({unassignedPlayers.length})</span>
              </span>
            </div>
          </div>

          <StatsRow
            stats={{
              참석: unassignedPlayers.filter(p => getPlayerResponse(p.id) === '참석').length,
              늦참: unassignedPlayers.filter(p => getPlayerResponse(p.id) === '늦참').length,
              조퇴: unassignedPlayers.filter(p => getPlayerResponse(p.id) === '조퇴').length,
              불참: unassignedPlayers.filter(p => getPlayerResponse(p.id) === '불참').length,
            }}
          />

          <div className="p-2.5">
            {unassignedPlayers.length === 0 ? (
              <p className="text-slate-500 text-xs px-2 py-2">모든 선수가 배정됨 🎉</p>
            ) : (
              renderPlayerList(unassignedPlayers, '#cbd5e1')
            )}
          </div>
        </div>
      </div>

      {/* 🗳️ 투표 선택 모달 (다른 선수 대리 투표용) */}
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