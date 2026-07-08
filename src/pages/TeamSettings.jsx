import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

function TeamSettings() {
  const [teams, setTeams] = useState([])
  const [players, setPlayers] = useState([])
  const [season, setSeason] = useState('')
  const [newTeamName, setNewTeamName] = useState('')
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [editingName, setEditingName] = useState('')

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

    if (data && data.length > 0) {
      setTeams(data)
      setSeason(data[0].season || '')
    }
    setLoading(false)
  }

  async function fetchPlayers() {
    const { data } = await supabase
      .from('players')
      .select('*')
      .order('name')
    setPlayers(data || [])
  }

  async function addTeam() {
    if (!newTeamName.trim()) {
      alert('팀 이름을 입력해주세요!')
      return
    }

    const nextOrder = teams.length + 1
    const { error } = await supabase
      .from('teams')
      .insert([{
        name: newTeamName.trim(),
        season: season,
        display_order: nextOrder,
      }])

    if (!error) {
      setNewTeamName('')
      fetchTeams()
    }
  }

  async function updateTeamName(id) {
    if (!editingName.trim()) return

    const { error } = await supabase
      .from('teams')
      .update({ name: editingName.trim() })
      .eq('id', id)

    if (!error) {
      setEditingId(null)
      setEditingName('')
      fetchTeams()
    }
  }

  async function updateSeason() {
    if (!season.trim()) return

    const { error } = await supabase
      .from('teams')
      .update({ season: season.trim() })
      .neq('id', '')

    if (!error) {
      alert('시즌이 변경되었습니다!')
      fetchTeams()
    }
  }

  async function deleteTeam(id) {
    if (!window.confirm('이 팀을 삭제하시겠습니까?')) return

    const { error } = await supabase
      .from('teams')
      .delete()
      .eq('id', id)

    if (!error) {
      fetchTeams()
    }
  }

  async function assignTeam(playerId, teamName) {
    await supabase
      .from('players')
      .update({ current_team: teamName || null })
      .eq('id', playerId)
    fetchPlayers()
  }

  const teamEmojis = ['⚪', '⚫', '🟡', '🔵', '🟣', '🟠']

  const teamColors = [
    'border-white/30',
    'border-slate-500/30',
    'border-yellow-300/30',
    'border-blue-500/30',
    'border-purple-500/30',
    'border-orange-500/30',
  ]

  const teamBgColors = [
    'bg-white/5',
    'bg-slate-500/10',
    'bg-yellow-300/10',
    'bg-blue-500/10',
    'bg-purple-500/10',
    'bg-orange-500/10',
  ]

  const getTeamEmoji = (idx) => teamEmojis[idx] || '⚪'
  const getTeamBorder = (idx) => teamColors[idx] || 'border-slate-500/30'
  const getTeamBg = (idx) => teamBgColors[idx] || 'bg-slate-500/10'

  const teamNames = teams.map(t => t.name)
  const unassignedPlayers = players.filter(p => !p.current_team || !teamNames.includes(p.current_team))

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold text-white mb-6">⚙️ 팀 설정</h1>

      {/* 시즌 설정 */}
      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 mb-6">
        <h2 className="text-lg font-bold text-white mb-4">📅 현재 시즌</h2>
        <div className="flex gap-4">
          <input
            type="text"
            value={season}
            onChange={(e) => setSeason(e.target.value)}
            placeholder="예: 2025년 2분기 (4월~6월)"
            className="flex-1 bg-slate-700 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500"
          />
          <button
            onClick={updateSeason}
            className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-3 rounded-xl font-semibold transition-colors"
          >
            저장
          </button>
        </div>
      </div>

      {/* 팀 목록 */}
      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 mb-6">
        <h2 className="text-lg font-bold text-white mb-4">🏆 팀 목록</h2>

        {loading ? (
          <p className="text-slate-400">로딩 중...</p>
        ) : (
          <div className="space-y-3">
            {teams.map((team, idx) => (
              <div key={team.id} className="flex items-center gap-3 bg-slate-700/50 rounded-xl px-4 py-3">
                <span className="text-xl">{getTeamEmoji(idx)}</span>

                {editingId === team.id ? (
                  <div className="flex-1 flex gap-2">
                    <input
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      className="flex-1 bg-slate-600 border border-slate-500 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                      autoFocus
                    />
                    <button
                      onClick={() => updateTeamName(team.id)}
                      className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm"
                    >
                      ✅ 저장
                    </button>
                    <button
                      onClick={() => { setEditingId(null); setEditingName('') }}
                      className="bg-slate-600 hover:bg-slate-500 text-white px-4 py-2 rounded-lg text-sm"
                    >
                      취소
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="flex-1 text-white font-medium">
                      {team.name}
                      <span className="text-slate-400 text-sm ml-2">
                        ({players.filter(p => p.current_team === team.name).length}명)
                      </span>
                    </span>
                    <button
                      onClick={() => { setEditingId(team.id); setEditingName(team.name) }}
                      className="bg-slate-600 hover:bg-slate-500 text-white px-3 py-1 rounded-lg text-sm"
                    >
                      ✏️ 수정
                    </button>
                    <button
                      onClick={() => deleteTeam(team.id)}
                      className="bg-red-500/10 hover:bg-red-500/20 text-red-400 px-3 py-1 rounded-lg text-sm"
                    >
                      🗑️
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 새 팀 추가 */}
        <div className="flex gap-3 mt-4">
          <input
            type="text"
            value={newTeamName}
            onChange={(e) => setNewTeamName(e.target.value)}
            placeholder="새 팀 이름 입력..."
            className="flex-1 bg-slate-700 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500"
          />
          <button
            onClick={addTeam}
            className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-3 rounded-xl font-semibold transition-colors"
          >
            + 추가
          </button>
        </div>
      </div>

      {/* 선수별 팀 배정 - 박스 형태 */}
      <div className="mb-6">
        <h2 className="text-lg font-bold text-white mb-4">👤 선수별 팀 배정</h2>
        <p className="text-slate-400 text-sm mb-4">시즌이 바뀌면 여기서 선수들의 팀을 변경하세요! 드롭다운으로 팀을 변경할 수 있어요.</p>

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
      </div>

      {/* 안내 */}
      <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
        <p className="text-slate-400 text-sm">
          💡 <strong className="text-slate-300">시즌이 바뀌면?</strong> 팀 이름을 수정하고, 선수별 팀 배정을 변경하면 됩니다! 이전 시즌 기록은 그대로 보존됩니다.
        </p>
      </div>
    </div>
  )
}

export default TeamSettings