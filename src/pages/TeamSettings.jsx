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
  const [searchPlayer, setSearchPlayer] = useState('')

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
      .update({ current_team: teamName })
      .eq('id', playerId)
    fetchPlayers()
  }

  const teamEmojis = ['⚪', '⚫', '🟡', '🔵', '🟣', '🟠']

  const filteredPlayers = players.filter(p =>
    p.name?.includes(searchPlayer)
  )

  return (
    <div className="max-w-4xl mx-auto">
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
                <span className="text-xl">{teamEmojis[idx] || '⚪'}</span>

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

      {/* 선수별 팀 배정 */}
      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 mb-6">
        <h2 className="text-lg font-bold text-white mb-4">👤 선수별 팀 배정</h2>
        <p className="text-slate-400 text-sm mb-4">시즌이 바뀌면 여기서 선수들의 팀을 변경하세요!</p>

        {/* 검색 */}
        <input
          type="text"
          placeholder="🔍 선수 이름 검색..."
          value={searchPlayer}
          onChange={(e) => setSearchPlayer(e.target.value)}
          className="w-full sm:w-64 bg-slate-700 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 mb-4"
        />

        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="px-4 py-3 text-slate-400 text-sm">이름</th>
                <th className="px-4 py-3 text-slate-400 text-sm">현재 팀</th>
                <th className="px-4 py-3 text-slate-400 text-sm">팀 변경</th>
              </tr>
            </thead>
            <tbody>
              {filteredPlayers.map(player => (
                <tr key={player.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                  <td className="px-4 py-3 text-white font-medium">{player.name}</td>
                  <td className="px-4 py-3">
                    {player.current_team ? (
                      <span className="text-emerald-400 text-sm">{player.current_team}</span>
                    ) : (
                      <span className="text-slate-500 text-sm">미배정</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={player.current_team || ''}
                      onChange={(e) => assignTeam(player.id, e.target.value)}
                      className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-1 text-white text-sm focus:outline-none focus:border-emerald-500"
                    >
                      <option value="">팀 선택</option>
                      {teams.map(team => (
                        <option key={team.id} value={team.name}>{team.name}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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