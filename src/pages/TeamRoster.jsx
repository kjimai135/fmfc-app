import { useState, useEffect } from 'react'
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

  useEffect(() => {
    fetchTeams()
    fetchPlayers()
    fetchSeason()
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
    await supabase
      .from('players')
      .update({ current_team: teamName || null })
      .eq('id', playerId)
    fetchPlayers()
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
        <p className="text-slate-500 text-xs mb-4">
          💡 여기서 설정한 시즌이 순위표·득점순위·경기 기록 전체에 적용됩니다.
        </p>
      )}

      {loading ? (
        <div className="text-center py-20 text-slate-400">
          <p className="text-xl">⏳ 로딩 중...</p>
        </div>
      ) : (
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

                {/* 선수 목록 */}
                <div className="p-3">
                  {teamPlayers.length === 0 ? (
                    <p className="text-slate-500 text-sm px-2 py-2">배정된 선수 없음</p>
                  ) : (
                    <div className="space-y-2">
                      {teamPlayers.map(player => (
                        <div key={player.id} className="flex items-center justify-between bg-slate-800/50 rounded-lg px-3 py-2">
                          {/* 선수 이름 - 팀 색상 적용 */}
                          <span className="text-sm font-medium" style={{ color: playerNameColor }}>
                            {player.name}
                          </span>
                          {canEdit ? (
                            <select
                              value={player.current_team || ''}
                              onChange={(e) => assignTeam(player.id, e.target.value)}
                              className="bg-slate-700 border border-slate-600 rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:border-emerald-500"
                            >
                              <option value="">미배정</option>
                              {teams.map(t => (
                                <option key={t.id} value={t.name}>{t.name}</option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-slate-500 text-xs">{player.current_team}</span>
                          )}
                        </div>
                      ))}
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
                <p className="text-slate-500 text-sm px-2 py-2">모든 선수가 배정되었습니다! 🎉</p>
              ) : (
                <div className="space-y-2">
                  {unassignedPlayers.map(player => (
                    <div key={player.id} className="flex items-center justify-between bg-slate-800/50 rounded-lg px-3 py-2">
                      <span className="text-slate-500 text-sm font-medium">{player.name}</span>
                      {canEdit ? (
                        <select
                          value={player.current_team || ''}
                          onChange={(e) => assignTeam(player.id, e.target.value)}
                          className="bg-slate-700 border border-slate-600 rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:border-emerald-500"
                        >
                          <option value="">미배정</option>
                          {teams.map(t => (
                            <option key={t.id} value={t.name}>{t.name}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-slate-500 text-xs">미배정</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default TeamRoster