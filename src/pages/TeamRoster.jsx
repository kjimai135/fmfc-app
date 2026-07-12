import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

function TeamRoster() {
  const [teams, setTeams] = useState([])
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchTeams()
    fetchPlayers()
  }, [])

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
    setPlayers(data || [])
  }

  async function assignTeam(playerId, teamName) {
    await supabase
      .from('players')
      .update({ current_team: teamName || null })
      .eq('id', playerId)
    fetchPlayers()
  }

  // 🎨 팀 색상 저장
  async function updateTeamColor(teamId, color) {
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
      <h1 className="text-3xl font-bold text-white mb-6">📋 팀 명단</h1>

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
                {/* 팀 헤더 - 팀명에 색상 적용 */}
                <div className="px-4 py-3 font-bold text-lg border-b border-slate-700/50">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block w-4 h-4 rounded-full flex-shrink-0"
                      style={{ background: teamColor, border: '1px solid rgba(255,255,255,0.3)' }}
                    ></span>
                    <span style={{ color: teamColor }}>
                      {team.name} ({teamPlayers.length}명)
                    </span>
                  </div>
                </div>

                {/* 🎨 색상 선택 */}
                <div className="px-3 pt-3 pb-2 border-b border-slate-700/30">
                  <p className="text-slate-400 text-xs mb-2">🎨 유니폼 색상</p>
                  <div className="flex flex-wrap gap-2">
                    {colorPalette.map(c => (
                      <button
                        key={c.value}
                        onClick={() => updateTeamColor(team.id, c.value)}
                        title={c.name}
                        className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110"
                        style={{
                          background: c.value,
                          borderColor: teamColor === c.value ? '#10b981' : 'rgba(255,255,255,0.3)',
                          boxShadow: teamColor === c.value ? '0 0 0 2px #10b981' : 'none',
                        }}
                      />
                    ))}
                  </div>
                </div>

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
            <div className="px-4 py-3 font-bold text-slate-400 text-lg border-b border-slate-700/50">
              ⚪ 미배정 ({unassignedPlayers.length}명)
            </div>
            <div className="p-3">
              {unassignedPlayers.length === 0 ? (
                <p className="text-slate-500 text-sm px-2 py-2">모든 선수가 배정되었습니다! 🎉</p>
              ) : (
                <div className="space-y-2">
                  {unassignedPlayers.map(player => (
                    <div key={player.id} className="flex items-center justify-between bg-slate-800/50 rounded-lg px-3 py-2">
                      <span className="text-slate-500 text-sm font-medium">{player.name}</span>
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