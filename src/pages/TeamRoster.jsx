import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

function TeamRoster() {
  const { role } = useAuth()
  // ✅ 수정 권한: 관리자·임원·주장(부주장)만
  const canEdit = role === 'admin' || role === 'executive' || role === 'captain'
  // 🗓️ 시즌 수정 권한: 관리자·임원만
  const canEditSeason = role === 'admin' || role === 'executive'

  const [teams, setTeams] = useState([])
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)

  // 🗓️ 현재 시즌 (app_settings.season_label) — 앱 전체가 이 값을 사용
  const [season, setSeason] = useState('')
  const [savingSeason, setSavingSeason] = useState(false)

  // 👤 팀 선택 팝업 대상 선수 + 위치
  const [popupPlayer, setPopupPlayer] = useState(null)
  const [popupPosition, setPopupPosition] = useState({ top: 0, left: 0, placement: 'below' })
  const [saving, setSaving] = useState(false)
  const popupRef = useRef(null)

  useEffect(() => {
    fetchTeams()
    fetchPlayers()
    fetchSeason()
  }, [])

  // 팝업 바깥 클릭 시 닫기
  useEffect(() => {
    function handleClickOutside(e) {
      if (popupRef.current && !popupRef.current.contains(e.target)) {
        setPopupPlayer(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function fetchSeason() {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'season_label')
      .single()
    if (data?.value) setSeason(data.value)
  }

  // 🗓️ 시즌 저장 (관리자·임원만)
  async function saveSeason() {
    if (!canEditSeason) return
    const val = season.trim()
    if (!val) {
      alert('시즌을 입력해주세요! (예: 2026-05)')
      return
    }
    setSavingSeason(true)
    const { error } = await supabase
      .from('app_settings')
      .update({ value: val })
      .eq('key', 'season_label')
    setSavingSeason(false)
    if (error) {
      alert('시즌 저장에 실패했습니다: ' + error.message)
    } else {
      alert(`현재 시즌이 "${val}" 로 저장되었습니다.`)
    }
  }

  async function fetchTeams() {
    setLoading(true)
    const { data } = await supabase
      .from('teams')
      .select('*')
      .order('display_order')
    setTeams(data || [])
    setLoading(false)
  }

  async function fetchPlayers() {
    const { data } = await supabase
      .from('players')
      .select('*')
      .order('name')

    // ✅ 탈퇴한 선수(is_active === false) 제외
    //    (is_active가 null이거나 없는 예전 데이터는 활동중으로 취급)
    const activePlayers = (data || []).filter(p => p.is_active !== false)
    setPlayers(activePlayers)
  }

  async function assignTeam(playerId, teamName) {
    if (!canEdit) return
    setSaving(true)
    await supabase
      .from('players')
      .update({ current_team: teamName || null })
      .eq('id', playerId)
    await fetchPlayers()
    setSaving(false)
    setPopupPlayer(null)
  }

  // 🎨 팀 색상 저장
  async function updateTeamColor(teamId, color) {
    if (!canEdit) return
    await supabase
      .from('teams')
      .update({ color })
      .eq('id', teamId)
    fetchTeams()
  }

  // 👤 선수 이름 클릭 → 팀 선택 팝업 (위치 계산: 아래 공간 부족하면 위로)
  function handlePlayerClick(e, player) {
    if (!canEdit) return
    if (popupPlayer?.id === player.id) {
      setPopupPlayer(null)
      return
    }
    const container = e.currentTarget.closest('.roster-container')
    if (!container) return
    const containerRect = container.getBoundingClientRect()
    const btnRect = e.currentTarget.getBoundingClientRect()

    const popupWidth = 240
    const margin = 12
    const gap = 6

    // ── 좌우 위치 ──
    let left = btnRect.left - containerRect.left
    const popupRightOnScreen = btnRect.left + popupWidth
    if (popupRightOnScreen > window.innerWidth - margin) {
      const overflow = popupRightOnScreen - (window.innerWidth - margin)
      left = left - overflow
    }
    if (left < 0) left = 0

    // ── 상하 위치 (아래 공간 부족하면 위로) ──
    const spaceBelow = window.innerHeight - btnRect.bottom
    const spaceAbove = btnRect.top
    const NEED = 230 // 팝업이 편히 들어갈 최소 높이

    let top
    let placement
    if (spaceBelow < NEED && spaceAbove > spaceBelow) {
      placement = 'above'
      top = btnRect.top - containerRect.top - gap
    } else {
      placement = 'below'
      top = btnRect.bottom - containerRect.top + gap
    }

    setPopupPosition({ top, left, placement })
    setPopupPlayer(player)
  }

  // 🎨 선택 가능한 색상 팔레트 (흰색 / 남색 파랑 / 노랑 형광)
  const colorPalette = [
    { name: '하양', value: '#ffffff' },
    { name: '파랑(남색)', value: '#1d4ed8' },
    { name: '노랑(형광)', value: '#eeff00' },
  ]

  // 🎨 선수 이름용 색상 (파란색은 밝은 파랑으로 변환해서 가독성 확보)
  function getPlayerNameColor(teamColor) {
    if (!teamColor) return '#ffffff'
    const c = teamColor.toLowerCase()
    // 남색 계열이면 밝은 파랑으로
    if (c === '#1d4ed8' || c === '#2563eb' || c === '#1e40af' || c === '#1e3a8a') {
      return '#60a5fa' // 밝은 파랑
    }
    return teamColor
  }

  const teamNamesList = teams.map(t => t.name)
  const unassignedPlayers = players.filter(p => !p.current_team || !teamNamesList.includes(p.current_team))

  // 선수 한 줄 렌더링 (이름 가운데 · 클릭 시 팝업)
  function renderPlayerRow(player, nameColor) {
    return (
      <button
        key={player.id}
        onClick={(e) => handlePlayerClick(e, player)}
        disabled={!canEdit}
        title={canEdit ? '클릭하여 팀 변경' : ''}
        className={`w-full text-center rounded-lg px-3 py-2 transition-colors ${
          canEdit
            ? 'bg-slate-800/50 hover:bg-slate-700 cursor-pointer'
            : 'bg-slate-800/40 cursor-default'
        } ${popupPlayer?.id === player.id ? 'ring-1 ring-emerald-500' : ''}`}
      >
        <span className="text-sm font-medium" style={{ color: nameColor }}>
          {player.name}
        </span>
      </button>
    )
  }

  return (
    <div className="max-w-full mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-3xl font-bold text-white">📋 팀 명단</h1>

        {/* 🗓️ 현재 시즌 관리 (이 값을 앱 전체가 사용) */}
        <div className="flex items-center gap-2 bg-slate-800/60 border border-slate-700 rounded-xl px-3 py-2">
          <label className="text-slate-300 text-sm font-bold whitespace-nowrap">🗓️ 리그 시즌</label>
          {canEditSeason ? (
            <>
              <input
                type="text"
                value={season}
                onChange={(e) => setSeason(e.target.value)}
                placeholder="예: 2026-05"
                className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-1 text-white w-28 text-center focus:outline-none focus:border-emerald-500"
              />
              <button
                onClick={saveSeason}
                disabled={savingSeason}
                className="bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
              >
                {savingSeason ? '저장중…' : '저장'}
              </button>
            </>
          ) : (
            <span className="text-emerald-400 font-bold">{season || '-'}</span>
          )}
        </div>
      </div>

      {canEditSeason && (
        <p className="text-slate-500 text-xs mb-2">
          💡 여기서 설정한 시즌이 순위표·득점순위·경기 기록 전체에 적용됩니다.
        </p>
      )}

      {canEdit && (
        <p className="text-slate-500 text-xs mb-4">
          👆 선수 이름을 클릭하면 팀을 변경할 수 있습니다.
        </p>
      )}

      {loading ? (
        <div className="text-center py-20 text-slate-400">
          <p className="text-xl">⏳ 로딩 중...</p>
        </div>
      ) : (
        <div className="relative roster-container">
          <div className="grid grid-cols-4 gap-4">
            {teams.map((team) => {
              const teamPlayers = players.filter(p => p.current_team === team.name)
              const teamColor = team.color || '#1d4ed8'
              const playerNameColor = getPlayerNameColor(teamColor)

              return (
                <div
                  key={team.id}
                  className="rounded-xl border overflow-hidden"
                  style={{
                    borderColor: `${teamColor}66`,
                    background: `${teamColor}14`,
                  }}
                >
                  {/* 팀 헤더 - 팀명에 색상 적용 (한 줄 유지) */}
                  <div className="px-4 py-3 font-bold text-sm border-b border-slate-700/50">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="inline-block w-3 h-3 rounded-full flex-shrink-0"
                        style={{ background: teamColor, border: '1px solid rgba(255,255,255,0.3)' }}
                      ></span>
                      <span
                        className="whitespace-nowrap overflow-hidden text-ellipsis"
                        style={{ color: teamColor }}
                      >
                        {team.name}{' '}
                        <span className="text-xs font-semibold">({teamPlayers.length}명)</span>
                      </span>
                    </div>
                  </div>

                  {/* 🎨 색상 선택 (권한 있을 때만) */}
                  {canEdit && (
                    <div className="px-3 pt-3 pb-2 border-b border-slate-700/30">
                      <p className="text-slate-400 text-xs mb-2">🎨 유니폼 색상</p>
                      <div className="flex flex-wrap gap-2">
                        {colorPalette.map(c => (
                          <button
                            key={c.value}
                            onClick={() => updateTeamColor(team.id, c.value)}
                            title={c.name}
                            className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110"
                            style={{
                              background: c.value,
                              borderColor: teamColor === c.value ? '#10b981' : 'rgba(255,255,255,0.3)',
                              boxShadow: teamColor === c.value ? '0 0 0 2px #10b981' : 'none',
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 선수 목록 (이름만, 가운데 정렬) */}
                  <div className="p-3">
                    {teamPlayers.length === 0 ? (
                      <p className="text-slate-500 text-sm px-2 py-2 text-center">배정된 선수 없음</p>
                    ) : (
                      <div className="space-y-2">
                        {teamPlayers.map(player => renderPlayerRow(player, playerNameColor))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}

            {/* 미배정 */}
            <div className="rounded-xl border border-slate-500/30 bg-slate-500/10 overflow-hidden">
              <div className="px-4 py-3 font-bold text-slate-400 text-sm border-b border-slate-700/50">
                <span className="whitespace-nowrap overflow-hidden text-ellipsis inline-block max-w-full align-bottom">
                  ⚪ 미배정{' '}
                  <span className="text-xs font-semibold">({unassignedPlayers.length}명)</span>
                </span>
              </div>
              <div className="p-3">
                {unassignedPlayers.length === 0 ? (
                  <p className="text-slate-500 text-sm px-2 py-2 text-center">모든 선수가 배정되었습니다! 🎉</p>
                ) : (
                  <div className="space-y-2">
                    {unassignedPlayers.map(player => renderPlayerRow(player, '#94a3b8'))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 👤 팀 선택 팝업 (이름 근처 · 아래 공간 부족하면 위로) */}
          {popupPlayer && canEdit && (
            <div
              ref={popupRef}
              className="absolute z-50 bg-slate-800 border border-emerald-500/50 rounded-xl shadow-2xl shadow-black/50"
              style={{
                top: popupPosition.top,
                left: popupPosition.left,
                width: '240px',
                maxWidth: '90vw',
                transform: popupPosition.placement === 'above' ? 'translateY(-100%)' : 'none',
              }}
            >
              {/* 헤더 */}
              <div className="flex justify-between items-center px-4 py-3 border-b border-slate-700">
                <h3 className="font-bold text-white text-sm truncate">
                  👤 {popupPlayer.name}
                </h3>
                <button
                  onClick={() => setPopupPlayer(null)}
                  className="text-slate-400 hover:text-white text-base leading-none px-1"
                  title="닫기"
                >
                  ✕
                </button>
              </div>

              {/* 팀 선택 버튼 */}
              <div className="p-3 space-y-2">
                <p className="text-slate-400 text-[11px] px-1">팀을 선택하세요</p>
                {teams.map((t) => {
                  const c = t.color || '#1d4ed8'
                  const isCurrent = popupPlayer.current_team === t.name
                  return (
                    <button
                      key={t.id}
                      onClick={() => assignTeam(popupPlayer.id, t.name)}
                      disabled={saving}
                      className={`w-full flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-bold transition-colors disabled:opacity-50 border ${
                        isCurrent ? 'border-emerald-500' : 'border-slate-600 hover:bg-slate-700'
                      }`}
                      style={{
                        background: isCurrent ? `${c}26` : 'rgba(51,65,85,0.4)',
                        color: getPlayerNameColor(c),
                      }}
                    >
                      <span
                        className="inline-block w-3 h-3 rounded-full flex-shrink-0"
                        style={{ background: c, border: '1px solid rgba(255,255,255,0.35)' }}
                      ></span>
                      <span className="truncate">{t.name}</span>
                      {isCurrent && <span className="ml-auto text-emerald-400 text-xs">✓</span>}
                    </button>
                  )
                })}

                {/* 미배정 */}
                <button
                  onClick={() => assignTeam(popupPlayer.id, '')}
                  disabled={saving}
                  className={`w-full flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-bold transition-colors disabled:opacity-50 border ${
                    !popupPlayer.current_team ? 'border-emerald-500 bg-slate-700/60' : 'border-slate-600 bg-slate-700/30 hover:bg-slate-700'
                  } text-slate-300`}
                >
                  <span
                    className="inline-block w-3 h-3 rounded-full flex-shrink-0"
                    style={{ background: '#64748b', border: '1px solid rgba(255,255,255,0.35)' }}
                  ></span>
                  <span>미배정</span>
                  {!popupPlayer.current_team && <span className="ml-auto text-emerald-400 text-xs">✓</span>}
                </button>

                {saving && <p className="text-slate-500 text-[11px] text-center pt-1">저장 중...</p>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ⬇️ 하단 여백 */}
      <div style={{ height: '60px', width: '100%' }} aria-hidden="true"></div>
    </div>
  )
}

export default TeamRoster