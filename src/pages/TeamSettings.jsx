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
  const [showNewSeason, setShowNewSeason] = useState(false)
  const [newSeason, setNewSeason] = useState('')
  const [newTeamNames, setNewTeamNames] = useState([])
  const [resetTeams, setResetTeams] = useState(true)
  const [confirmText, setConfirmText] = useState('')
  const [lastBackupSeason, setLastBackupSeason] = useState(null)

  useEffect(() => {
    fetchTeams()
    fetchPlayers()
    fetchLastBackup()
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

  async function fetchLastBackup() {
    const { data } = await supabase
      .from('season_backups')
      .select('season_name')
      .order('backup_date', { ascending: false })
      .limit(1)

    if (data && data.length > 0) {
      setLastBackupSeason(data[0].season_name)
    }
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

    for (const team of teams) {
      await supabase
        .from('teams')
        .update({ season: season.trim() })
        .eq('id', team.id)
    }

    alert('시즌이 변경되었습니다!')
    fetchTeams()
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

  function openNewSeason() {
    setNewSeason('')
    setNewTeamNames(teams.map(t => ({ id: t.id, oldName: t.name, newName: '' })))
    setResetTeams(true)
    setConfirmText('')
    setShowNewSeason(true)
  }

  async function startNewSeason() {
    if (!newSeason.trim()) {
      alert('새 시즌 이름을 입력해주세요!')
      return
    }

    if (confirmText !== '새 시즌 시작') {
      alert('"새 시즌 시작" 을 정확히 입력해주세요!')
      return
    }

    // 1. 이전 시즌 선수 배정 백업
    const playersWithTeam = players.filter(p => p.current_team)
    for (const p of playersWithTeam) {
      await supabase.from('season_backups').insert({
        season_name: season,
        player_id: p.id,
        player_name: p.name,
        team_name: p.current_team,
      })
    }

    // 2. 이전 시즌 팀 이름 백업
    for (const team of teams) {
      await supabase.from('team_backups').insert({
        season_name: season,
        team_id: team.id,
        team_name: team.name,
        display_order: team.display_order,
      })
    }

    // 3. 시즌 이름 변경
    for (const team of teams) {
      await supabase
        .from('teams')
        .update({ season: newSeason.trim() })
        .eq('id', team.id)
    }

    // 4. 팀 이름 변경 (입력한 경우만)
    for (const team of newTeamNames) {
      if (team.newName.trim() && team.newName.trim() !== team.oldName) {
        await supabase
          .from('teams')
          .update({ name: team.newName.trim() })
          .eq('id', team.id)
      }
    }

    // 5. 전체 선수 팀 배정 초기화
    if (resetTeams) {
      for (const p of players) {
        await supabase
          .from('players')
          .update({ current_team: null })
          .eq('id', p.id)
      }
    }

    setShowNewSeason(false)
    setConfirmText('')
    fetchTeams()
    fetchPlayers()
    fetchLastBackup()
    alert(`🎉 새 시즌 "${newSeason}" 이(가) 시작되었습니다!\n\n이전 시즌 "${season}" 백업이 저장되었습니다.`)
  }

  async function restoreBackup() {
    if (!lastBackupSeason) return

    if (!window.confirm(`이전 시즌 "${lastBackupSeason}" 을(를) 복원하시겠습니까?\n\n팀 이름과 선수 배정이 모두 이전 시즌으로 되돌아갑니다.`)) {
      return
    }

    // 1. 팀 이름 복원
    const { data: teamBackups } = await supabase
      .from('team_backups')
      .select('*')
      .eq('season_name', lastBackupSeason)

    if (teamBackups && teamBackups.length > 0) {
      for (const tb of teamBackups) {
        if (tb.team_id) {
          await supabase
            .from('teams')
            .update({ name: tb.team_name, season: lastBackupSeason })
            .eq('id', tb.team_id)
        }
      }
    }

    // 2. 선수 배정 초기화
    for (const p of players) {
      await supabase
        .from('players')
        .update({ current_team: null })
        .eq('id', p.id)
    }

    // 3. 선수 배정 복원
    const { data: playerBackups } = await supabase
      .from('season_backups')
      .select('*')
      .eq('season_name', lastBackupSeason)

    let restored = 0
    if (playerBackups && playerBackups.length > 0) {
      for (const backup of playerBackups) {
        if (backup.player_id) {
          const { error } = await supabase
            .from('players')
            .update({ current_team: backup.team_name })
            .eq('id', backup.player_id)

          if (!error) restored++
        }
      }
    }

    fetchTeams()
    fetchPlayers()
    alert(`✅ "${lastBackupSeason}" 시즌이 복원되었습니다!\n\n팀 이름 + 선수 ${restored}명 배정 복원 완료!`)
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

  const teamNamesList = teams.map(t => t.name)
  const unassignedPlayers = players.filter(p => !p.current_team || !teamNamesList.includes(p.current_team))

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold text-white mb-6">⚙️ 팀 설정</h1>

      {/* 시즌 설정 */}
      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 mb-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
          <h2 className="text-lg font-bold text-white">📅 현재 시즌</h2>
          <div className="flex gap-2">
            {lastBackupSeason && (
              <button
                onClick={restoreBackup}
                className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl font-semibold transition-colors text-sm"
              >
                ⏪ 이전 시즌 복원
              </button>
            )}
            <button
              onClick={openNewSeason}
              className="bg-blue-500 hover:bg-blue-600 text-white px-5 py-2 rounded-xl font-semibold transition-colors text-sm"
            >
              🔄 새 시즌 시작
            </button>
          </div>
        </div>
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
        {lastBackupSeason && (
          <p className="text-slate-500 text-xs mt-3">
            💾 마지막 백업: "{lastBackupSeason}"
          </p>
        )}
      </div>

      {/* 새 시즌 시작 모달 */}
      {showNewSeason && (
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-6 mb-6">
          <h2 className="text-xl font-bold text-white mb-4">🔄 새 시즌 시작</h2>

          <div className="bg-slate-800/50 rounded-lg p-3 mb-4">
            <p className="text-slate-400 text-sm">현재 시즌: <span className="text-white font-medium">{season}</span></p>
            <p className="text-slate-400 text-sm">배정된 선수: <span className="text-white font-medium">{players.filter(p => p.current_team).length}명</span></p>
          </div>

          <div className="mb-6">
            <label className="block text-slate-300 text-sm font-medium mb-2">새 시즌 이름 *</label>
            <input
              type="text"
              value={newSeason}
              onChange={(e) => setNewSeason(e.target.value)}
              placeholder="예: 2025년 3분기 (7~9월)"
              className="w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="mb-6">
            <label className="block text-slate-300 text-sm font-medium mb-3">팀 이름 변경 (변경할 팀만 입력)</label>
            <div className="space-y-3">
              {newTeamNames.map((team, idx) => (
                <div key={team.id} className="flex items-center gap-3">
                  <span className="text-xl">{getTeamEmoji(idx)}</span>
                  <span className="text-slate-400 text-sm w-24">{team.oldName}</span>
                  <span className="text-slate-500">→</span>
                  <input
                    type="text"
                    value={team.newName}
                    onChange={(e) => {
                      const updated = [...newTeamNames]
                      updated[idx].newName = e.target.value
                      setNewTeamNames(updated)
                    }}
                    placeholder={`그대로 유지: ${team.oldName}`}
                    className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="mb-6">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={resetTeams}
                onChange={(e) => setResetTeams(e.target.checked)}
                className="w-5 h-5 rounded"
              />
              <span className="text-white text-sm">전체 선수 팀 배정 초기화 (미배정으로)</span>
            </label>
            <p className="text-slate-500 text-xs mt-1 ml-8">체크하면 모든 선수가 미배정 상태가 됩니다</p>
          </div>

          <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-xl p-4">
            <p className="text-red-400 text-sm font-medium mb-2">⚠️ 확인을 위해 아래에 "새 시즌 시작" 을 입력해주세요</p>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder='새 시즌 시작'
              className="w-full bg-slate-700 border border-red-500/30 rounded-lg px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-red-500"
            />
          </div>

          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 mb-6">
            <p className="text-emerald-400 text-sm">💾 이전 시즌 팀 이름과 선수 배정이 자동으로 백업됩니다. 잘못 눌렀을 경우 "이전 시즌 복원"으로 되돌릴 수 있어요!</p>
          </div>

          <div className="flex gap-4">
            <button
              onClick={startNewSeason}
              disabled={confirmText !== '새 시즌 시작'}
              className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:opacity-30 text-white py-3 rounded-xl font-semibold transition-colors"
            >
              🔄 새 시즌 시작!
            </button>
            <button
              onClick={() => setShowNewSeason(false)}
              className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-3 rounded-xl font-semibold transition-colors"
            >
              취소
            </button>
          </div>
        </div>
      )}

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
      <div className="mb-6">
        <h2 className="text-lg font-bold text-white mb-4">👤 선수별 팀 배정</h2>
        <p className="text-slate-400 text-sm mb-4">시즌이 바뀌면 여기서 선수들의 팀을 변경하세요!</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

      <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
        <p className="text-slate-400 text-sm">
          💡 <strong className="text-slate-300">시즌이 바뀌면?</strong> "🔄 새 시즌 시작" 버튼을 눌러주세요. 이전 시즌 팀 이름과 선수 배정이 자동 백업되고, "⏪ 이전 시즌 복원"으로 되돌릴 수 있어요!
        </p>
      </div>
    </div>
  )
}

export default TeamSettings