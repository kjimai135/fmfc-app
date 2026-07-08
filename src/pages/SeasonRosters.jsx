import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

function SeasonRosters() {
  const [seasons, setSeasons] = useState([])
  const [selectedSeason, setSelectedSeason] = useState(null)
  const [seasonRoster, setSeasonRoster] = useState([])
  const [teams, setTeams] = useState([])
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showSave, setShowSave] = useState(false)
  const [newSeasonName, setNewSeasonName] = useState('')
  const [confirmText, setConfirmText] = useState('')
  const [latestSeason, setLatestSeason] = useState(null)

  useEffect(() => {
    fetchSeasons()
    fetchTeams()
    fetchPlayers()
  }, [])

  async function fetchSeasons() {
    setLoading(true)
    const { data } = await supabase
      .from('season_rosters')
      .select('season_name, saved_at')
      .order('saved_at', { ascending: false })

    if (data) {
      const unique = []
      const seen = new Set()
      for (const d of data) {
        if (!seen.has(d.season_name)) {
          seen.add(d.season_name)
          unique.push({ season_name: d.season_name, saved_at: d.saved_at })
        }
      }
      setSeasons(unique)
      if (unique.length > 0) {
        setLatestSeason(unique[0].season_name)
      }
    }
    setLoading(false)
  }

  async function fetchTeams() {
    const { data } = await supabase
      .from('teams')
      .select('*')
      .order('display_order')
    setTeams(data || [])
  }

  async function fetchPlayers() {
    const { data } = await supabase
      .from('players')
      .select('*')
      .order('name')
    setPlayers(data || [])
  }

  async function fetchSeasonRoster(seasonName) {
    const { data } = await supabase
      .from('season_rosters')
      .select('*')
      .eq('season_name', seasonName)
      .order('team_name')

    setSeasonRoster(data || [])
    setSelectedSeason(seasonName)
  }

  async function saveNewSeason() {
    if (!newSeasonName.trim()) {
      alert('현 시즌 이름을 입력해주세요! (예: 2027-03)')
      return
    }

    if (confirmText !== '시즌 저장') {
      alert('"현 시즌 저장" 을 정확히 입력해주세요!')
      return
    }

    // 같은 시즌명 중복 체크
    const exists = seasons.find(s => s.season_name === newSeasonName.trim())
    if (exists) {
      alert('이미 존재하는 시즌 이름입니다!')
      return
    }

    // 팀 배정된 선수만 저장
    const playersWithTeam = players.filter(p => p.current_team)
    if (playersWithTeam.length === 0) {
      alert('팀에 배정된 선수가 없습니다!')
      return
    }

    // 시즌 명단 저장
    for (const p of playersWithTeam) {
      await supabase.from('season_rosters').insert({
        season_name: newSeasonName.trim(),
        player_id: p.id,
        player_name: p.name,
        team_name: p.current_team,
      })
    }

    // 전체 선수 미배정 초기화
    for (const p of players) {
      await supabase
        .from('players')
        .update({ current_team: null })
        .eq('id', p.id)
    }

    setShowSave(false)
    setNewSeasonName('')
    setConfirmText('')
    fetchSeasons()
    fetchPlayers()
    alert(`🎉 시즌 "${newSeasonName}" 명단이 저장되었습니다!\n\n전체 선수가 미배정으로 초기화되었습니다.`)
  }

  async function deleteSeason(seasonName) {
    if (!window.confirm(`"${seasonName}" 시즌 명단을 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.`)) {
      return
    }

    const { data: roster } = await supabase
      .from('season_rosters')
      .select('id')
      .eq('season_name', seasonName)

    if (roster) {
      for (const r of roster) {
        await supabase.from('season_rosters').delete().eq('id', r.id)
      }
    }

    setSelectedSeason(null)
    setSeasonRoster([])
    fetchSeasons()
    alert(`"${seasonName}" 시즌이 삭제되었습니다.`)
  }

  const teamEmojis = ['⚪', '⚫', '🟡', '🔵', '🟣', '🟠']

  const getTeamEmoji = (teamName) => {
    const idx = teams.findIndex(t => t.name === teamName)
    return teamEmojis[idx] || '⚽'
  }

  // 시즌 명단을 팀별로 그룹화
  const groupByTeam = (roster) => {
    const groups = {}
    for (const r of roster) {
      if (!groups[r.team_name]) {
        groups[r.team_name] = []
      }
      groups[r.team_name].push(r)
    }
    return groups
  }

  const rosterGroups = groupByTeam(seasonRoster)

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <h1 className="text-3xl font-bold text-white">📚 시즌별 명단</h1>
        <button
          onClick={() => { setShowSave(true); setNewSeasonName(''); setConfirmText('') }}
          className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-3 rounded-xl font-semibold transition-colors"
        >
          💾 현 시즌 저장
        </button>
      </div>

      {/* 현 시즌 저장 모달 */}
      {showSave && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-6 mb-6">
          <h2 className="text-xl font-bold text-white mb-4">💾 현 시즌 저장</h2>

          <div className="bg-slate-800/50 rounded-lg p-3 mb-4">
            <p className="text-slate-400 text-sm">현재 배정된 선수: <span className="text-white font-medium">{players.filter(p => p.current_team).length}명</span></p>
            <p className="text-slate-400 text-sm">총 선수: <span className="text-white font-medium">{players.length}명</span></p>
          </div>

          <div className="mb-6">
            <label className="block text-slate-300 text-sm font-medium mb-2">현 시즌 이름 * (예: 2027-01)</label>
            <input
              type="text"
              value={newSeasonName}
              onChange={(e) => setNewSeasonName(e.target.value)}
              placeholder="2025-03"
              className="w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="mb-6 bg-orange-500/10 border border-orange-500/30 rounded-xl p-4">
            <p className="text-orange-400 text-sm mb-1">⚠️ 저장 후 전체 선수가 미배정으로 초기화됩니다!</p>
            <p className="text-slate-500 text-xs">다음 드래프트 후 팀 명단에서 새로 배정하세요.</p>
          </div>

          <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-xl p-4">
            <p className="text-red-400 text-sm font-medium mb-2">확인을 위해 "저장" 을 입력해주세요</p>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder='저장'
              className="w-full bg-slate-700 border border-red-500/30 rounded-lg px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-red-500"
            />
          </div>

          <div className="flex gap-4">
            <button
              onClick={saveNewSeason}
              disabled={confirmText !== '저장'}
              className="flex-1 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-30 text-white py-3 rounded-xl font-semibold transition-colors"
            >
              💾 저장
            </button>
            <button
              onClick={() => setShowSave(false)}
              className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-3 rounded-xl font-semibold transition-colors"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* 시즌 목록 */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 mb-6">
        <div className="px-4 py-3 border-b border-slate-700">
          <h2 className="text-lg font-bold text-white">📅 시즌 목록</h2>
        </div>

        {loading ? (
          <div className="p-4 text-slate-400">로딩 중...</div>
        ) : seasons.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <p className="text-4xl mb-4">📚</p>
            <p>저장된 시즌이 없습니다</p>
            <p className="text-sm mt-1">팀 명단에서 배정 후 "현 시즌 저장"을 눌러주세요</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-700/50">
            {seasons.map((s, idx) => (
              <div
                key={s.season_name}
                className={`px-4 py-3 flex justify-between items-center cursor-pointer hover:bg-slate-700/30 transition-colors ${
                  selectedSeason === s.season_name ? 'bg-emerald-500/10' : ''
                }`}
                onClick={() => fetchSeasonRoster(s.season_name)}
              >
                <div>
                  <span className="text-white font-medium">{s.season_name}</span>
                  {idx === 0 && (
                    <span className="ml-2 bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full text-xs">최근</span>
                  )}
                  <p className="text-slate-500 text-xs mt-0.5">
                    {new Date(s.saved_at).toLocaleDateString('ko-KR')} 저장
                  </p>
                </div>
                <div className="flex gap-2 items-center">
                  {selectedSeason === s.season_name && (
                    <span className="text-emerald-400 text-sm">보는 중</span>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteSeason(s.season_name) }}
                    className="bg-red-500/10 hover:bg-red-500/20 text-red-400 px-3 py-1 rounded-lg text-xs"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 선택한 시즌 명단 */}
      {selectedSeason && (
        <div>
          <h2 className="text-xl font-bold text-white mb-4">
            📋 {selectedSeason} 현 시즌 명단
            {selectedSeason === latestSeason && (
              <span className="ml-2 text-emerald-400 text-sm font-normal">(팀 명단과 싱크 중)</span>
            )}
          </h2>

          {Object.keys(rosterGroups).length === 0 ? (
            <div className="text-center py-10 text-slate-400">
              <p>명단이 없습니다</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(rosterGroups).map(([teamName, members]) => (
                <div key={teamName} className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
                  <div className="px-4 py-3 bg-slate-700/50 font-bold text-white">
                    {getTeamEmoji(teamName)} {teamName} ({members.length}명)
                  </div>
                  <div className="divide-y divide-slate-700/30">
                    {members.map((m, idx) => (
                      <div key={m.id} className="px-4 py-2 flex items-center gap-3">
                        <span className="text-slate-500 text-xs w-6">{idx + 1}</span>
                        <span className="text-white text-sm">{m.player_name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default SeasonRosters