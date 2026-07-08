import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

function TeamRoster() {
  const [teams, setTeams] = useState([])
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [latestSeason, setLatestSeason] = useState(null)

  useEffect(() => {
    fetchTeams()
    fetchPlayers()
    fetchLatestSeason()
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

  async function fetchLatestSeason() {
    const { data } = await supabase
      .from('season_rosters')
      .select('season_name')
      .order('saved_at', { ascending: false })
      .limit(1)

    if (data && data.length > 0) {
      setLatestSeason(data[0].season_name)
    }
  }

  async function assignTeam(playerId, teamName) {
    await supabase
      .from('players')
      .update({ current_team: teamName || null })
      .eq('id', playerId)

    // 최근 시즌 싱크
    if (latestSeason) {
      const player = players.find(p => p.id === playerId)
      if (player) {
        // 기존 시즌 기록 삭제
        await supabase
          .from('season_rosters')
          .delete()
          .eq('season_name', latestSeason)
          .eq('player_id', playerId)

        // 팀이 있으면 새로 저장
        if (teamName) {
          await supabase.from('season_rosters').insert({
            season_name: latestSeason,
            player_id: playerId,
            player_name: player.name,
            team_name: teamName,
          })
        }
      }
    }

    fetchPlayers()
  }

  const teamEmojis = ['⚪', '⚫', '🟡', '🔵', '🟣', '🟠']
  const teamColors = ['border-white/30', 'border-slate-500/30', 'border-yellow-300/30', 'border-blue-500/30', 'border-purple-500/30', 'border-orange-500/30']
  const teamBgColors = ['bg-white/5', 'bg-slate-500/10', 'bg-yellow-300/10', 'bg-blue-500/10', 'bg-purple-500/10', 'bg-orange-500/10']

  const getTeamEmoji = (idx) => teamEmojis[idx] || '⚪'
  const getTeamBorder = (idx) => teamColors[idx] || 'border-slate-500/30'
  const getTeamBg = (idx) => teamBgColors[idx] || 'bg-slate-500/10'

  const teamNamesList = teams.map(t => t.name)
  const unassignedPlayers = players.filter(p => !p.current_team || !teamNamesList.includes(p.current_team))

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white">📋 팀 명단</h1>
          {latestSeason && (
            <p className="text-slate-400 text-sm mt-1">최근 시즌: {latestSeason} 과 자동 싱크 중</p>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-slate-400">
          <p className="text-xl">⏳ 로딩 중...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 팀별 박스 */}
          {teams.map((team, idx) => {
            const teamPlayers = players.filter(p => p.current_team === team.name)

            return (
              <div key={team.id} className={`rounded-xl border ${getTeamBorder(idx)} ${getTeamBg(idx)} overflow-hidden`}>
                <div className="px-4 py-3 font-bold text-white text-lg border-b border-slate-700/50">
                  {getTeamEmoji(idx)} {team.name} ({teamPlayers.length}명)
                </div>
                <div className="p-3">
                  {teamPlayers.length === 0 ? (
                    <p className="text-slate-500 text-sm px-2 py-2">배정된 선수 없음</p>
                  ) : (
                    <div className="space-y-2">
                      {teamPlayers.map(player => (
                        <div key={player.id} className="flex items-center justify-between bg-slate-800/50 rounded-lg px-3 py-2">
                          <span className="text-white text-sm font-medium">{player.name}</span>
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

          {/* 미배정 박스 */}
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
                      <span className="text-white text-sm font-medium">{player.name}</span>
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