import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

// "7시", "20시-22시" 등에서 시작 시각(시)만 추출
function parseStartHour(timeStr) {
  if (!timeStr) return null
  const m = String(timeStr).match(/\d{1,2}/)
  if (!m) return null
  let h = parseInt(m[0], 10)
  if (isNaN(h) || h < 0 || h > 23) return null
  return h
}

function SeasonArchive() {
  const { role } = useAuth()
  const canEdit = role === 'admin' || role === 'executive'

  const [seasonLabel, setSeasonLabel] = useState('')
  const [teams, setTeams] = useState([])
  const [players, setPlayers] = useState([])

  const [computed, setComputed] = useState({
    leagueChampion: '',
    scorerRecords: [], // [{name, team, goals}] (골 내림차순)
  })

  const [topScorerIdx, setTopScorerIdx] = useState(0)

  const [champsChampion, setChampsChampion] = useState('')
  const [champsMvp, setChampsMvp] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const [showSaveForm, setShowSaveForm] = useState(false)

  const [archives, setArchives] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)

  const [formRosterOpen, setFormRosterOpen] = useState(false)
  const [formScorerOpen, setFormScorerOpen] = useState(false)

  const [openYears, setOpenYears] = useState({})

  useEffect(() => {
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function init() {
    setLoading(true)
    const { data: seasonRow } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'season_label')
      .single()
    const season = seasonRow?.value || ''
    setSeasonLabel(season)

    const [teamRes, playerRes] = await Promise.all([
      supabase.from('teams').select('*').order('display_order'),
      supabase.from('players').select('*'),
    ])
    setTeams(teamRes.data || [])
    setPlayers(playerRes.data || [])

    await fetchArchives()

    if (season) {
      await computeCurrentSeason(season, teamRes.data || [], playerRes.data || [])
    }
    setLoading(false)
  }

  async function fetchArchives() {
    const { data } = await supabase
      .from('season_archives')
      .select('*')
      .order('season', { ascending: false })
    const list = data || []
    setArchives(list)

    const years = [...new Set(list.map((a) => (a.season || '').split('-')[0] || '기타'))]
      .sort((a, b) => b.localeCompare(a))
    if (years.length > 0) {
      setOpenYears((prev) => {
        if (Object.keys(prev).length > 0) return prev
        return { [years[0]]: true }
      })
    }
  }

  async function computeCurrentSeason(season, teamList, playerList) {
    const [mRes, gRes, resvRes] = await Promise.all([
      supabase.from('matches').select('*').eq('season', season).order('game_date', { ascending: false }),
      supabase.from('goals').select('*').eq('season', season),
      supabase.from('reservations').select('date, time, is_confirmed'),
    ])

    const now = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    const todayKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`

    const startHourByDate = {}
    for (const r of (resvRes.data || [])) {
      if (startHourByDate[r.date] === undefined || r.is_confirmed) {
        const h = parseStartHour(r.time)
        if (h !== null) startHourByDate[r.date] = h
      }
    }
    const isPast = (d) => {
      if (d < todayKey) return true
      if (d > todayKey) return false
      const sh = startHourByDate[d]
      if (sh === undefined || sh === null) return true
      return now.getHours() >= sh
    }

    const matches = (mRes.data || []).filter((m) => isPast(m.game_date))
    const goals = (gRes.data || []).filter((g) => isPast(g.game_date))

    const leagueChampion = computeChampion(matches, teamList)
    const scorerRecords = computeScorers(goals, playerList)

    setComputed({ leagueChampion, scorerRecords })
    setTopScorerIdx(0)
  }

  function computeChampion(matches, teamList) {
    const dates = [...new Set(matches.map((m) => m.game_date))]
    const allMatchups = []
    for (const date of dates) {
      const dayMatches = matches.filter((m) => m.game_date === date).sort((a, b) => a.match_number - b.match_number)
      if (dayMatches.length >= 6) {
        const pairs = [
          { first: dayMatches[0], second: dayMatches[3] },
          { first: dayMatches[1], second: dayMatches[4] },
          { first: dayMatches[2], second: dayMatches[5] },
        ]
        for (const pair of pairs) {
          const teamA = pair.first.team_a
          const teamB = pair.first.team_b
          let totalA = pair.first.score_a
          let totalB = pair.first.score_b
          if (pair.second.team_a === teamA) {
            totalA += pair.second.score_a
            totalB += pair.second.score_b
          } else {
            totalA += pair.second.score_b
            totalB += pair.second.score_a
          }
          allMatchups.push({ teamA, teamB, totalA, totalB })
        }
      }
    }

    const standings = {}
    for (const t of teamList) {
      standings[t.name] = { name: t.name, points: 0, goalsFor: 0, goalsAgainst: 0 }
    }
    for (const m of allMatchups) {
      if (!standings[m.teamA] || !standings[m.teamB]) continue
      standings[m.teamA].goalsFor += m.totalA
      standings[m.teamA].goalsAgainst += m.totalB
      standings[m.teamB].goalsFor += m.totalB
      standings[m.teamB].goalsAgainst += m.totalA
      if (m.totalA > m.totalB) standings[m.teamA].points += 3
      else if (m.totalA < m.totalB) standings[m.teamB].points += 3
      else { standings[m.teamA].points += 1; standings[m.teamB].points += 1 }
    }

    const sorted = Object.values(standings).sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points
      const gdA = a.goalsFor - a.goalsAgainst, gdB = b.goalsFor - b.goalsAgainst
      if (gdB !== gdA) return gdB - gdA
      return b.goalsFor - a.goalsFor
    })

    const hasData = sorted.some((s) => s.points > 0 || s.goalsFor > 0)
    return hasData && sorted.length > 0 ? sorted[0].name : ''
  }

  function computeScorers(goals, playerList) {
    function isSpecial(g) {
      if (!g.player_id) return true
      const n = g.player_name
      return n === 'PK(핸디캡)' || n === 'PK' || n === '자책골'
    }
    function teamOf(playerId, fallback) {
      const p = playerList.find((x) => x.id === playerId)
      return p?.current_team || fallback || '미배정'
    }

    const map = {}
    for (const g of goals) {
      if (isSpecial(g)) continue
      if (!map[g.player_id]) {
        map[g.player_id] = { name: g.player_name, team: teamOf(g.player_id, g.team), goals: 0 }
      }
      map[g.player_id].goals++
    }
    return Object.values(map).sort((a, b) => b.goals - a.goals)
  }

  function getTeamColor(teamName) {
    const t = teams.find((x) => x.name === teamName)
    const color = t?.color || '#ffffff'
    const c = color.toLowerCase()
    if (c === '#1d4ed8' || c === '#2563eb' || c === '#1e40af' || c === '#1e3a8a') return '#60a5fa'
    return color
  }

  function withRank(records) {
    let lastGoals = null
    let lastRank = 0
    return records.map((s, idx) => {
      if (s.goals !== lastGoals) {
        lastRank = idx + 1
        lastGoals = s.goals
      }
      return { ...s, rank: lastRank }
    })
  }

  function buildCurrentRoster() {
    const activeAssigned = players.filter((p) => p.is_active !== false && p.current_team)
    const list = []
    for (const t of teams) {
      const members = activeAssigned
        .filter((p) => p.current_team === t.name)
        .map((p) => p.name)
        .sort((a, b) => a.localeCompare(b))
      if (members.length > 0) {
        list.push({ team: t.name, players: members })
      }
    }
    return list
  }

  async function saveArchive() {
    if (!canEdit) return
    if (!seasonLabel) {
      alert('현재 시즌이 설정되어 있지 않습니다. (팀명단에서 시즌을 설정하세요)')
      return
    }
    if (!window.confirm(`"${seasonLabel}" 시즌 아카이브를 저장할까요?\n(같은 시즌이 이미 있으면 덮어씁니다)`)) return

    setSaving(true)
    const chosen = computed.scorerRecords[topScorerIdx] || computed.scorerRecords[0] || null

    const payload = {
      season: seasonLabel,
      league_champion: computed.leagueChampion || null,
      league_top_scorer: chosen ? chosen.name : null,
      league_top_scorer_goals: chosen ? chosen.goals : 0,
      scorer_records: computed.scorerRecords,
      roster_records: buildCurrentRoster(),
      champs_champion: champsChampion || null,
      champs_mvp: champsMvp || null,
      note: note.trim() || null,
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase
      .from('season_archives')
      .upsert(payload, { onConflict: 'season' })

    setSaving(false)
    if (error) {
      alert('저장에 실패했습니다: ' + error.message)
    } else {
      alert(`✅ "${seasonLabel}" 시즌 아카이브가 저장되었습니다!`)
      setChampsChampion('')
      setChampsMvp('')
      setNote('')
      setShowSaveForm(false)
      fetchArchives()
    }
  }

  async function deleteArchive(season) {
    if (!canEdit) return
    if (!window.confirm(`"${season}" 아카이브를 삭제할까요?`)) return
    await supabase.from('season_archives').delete().eq('season', season)
    if (selected?.season === season) setSelected(null)
    fetchArchives()
  }

  const teamNames = teams.map((t) => t.name)
  const activePlayers = players.filter((p) => p.is_active !== false)
  const rankedScorers = withRank(computed.scorerRecords)
  const currentRosterPreview = buildCurrentRoster()
  const currentRosterTotal = currentRosterPreview.reduce((sum, r) => sum + r.players.length, 0)

  function groupByYear(list) {
    const groups = {}
    for (const a of list) {
      const year = (a.season || '').split('-')[0] || '기타'
      if (!groups[year]) groups[year] = []
      groups[year].push(a)
    }
    Object.values(groups).forEach((arr) =>
      arr.sort((x, y) => (y.season || '').localeCompare(x.season || ''))
    )
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]))
  }

  const archivesByYear = groupByYear(archives)

  function toggleYear(year) {
    setOpenYears((prev) => ({ ...prev, [year]: !prev[year] }))
  }

  // ── 공통 UI ────────────────────────────────

  function FormRow({ icon, label, children }) {
    return (
      <div className="flex items-center gap-3 py-2 border-b border-slate-700/40">
        <span className="text-slate-300 text-sm font-medium w-28 flex-shrink-0">
          {icon} {label}
        </span>
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    )
  }

  function RosterTiles({ roster }) {
    if (!roster || roster.length === 0) return <p className="text-slate-600 text-sm">명단 없음</p>
    return (
      <div className="grid grid-cols-3 gap-3">
        {roster.map((r, idx) => {
          const color = getTeamColor(r.team)
          return (
            <div key={idx} className="rounded-xl border overflow-hidden" style={{ borderColor: `${color}66`, background: `${color}14` }}>
              <div className="px-3 py-2 border-b border-slate-700/50 flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded-full flex-shrink-0" style={{ background: color, border: '1px solid rgba(255,255,255,0.3)' }}></span>
                <span className="font-bold text-sm truncate" style={{ color }}>{r.team}</span>
                <span className="text-slate-500 text-xs flex-shrink-0">({r.players.length})</span>
              </div>
              <div className="p-2 flex flex-wrap gap-1.5">
                {r.players.map((name, i) => (
                  <span key={i} className="text-xs font-medium rounded-md px-2 py-1" style={{ background: 'rgba(15,23,42,0.6)', color }}>
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  function ScorerRows({ records }) {
    if (!records || records.length === 0) return <p className="text-slate-600 text-sm">득점 기록 없음</p>
    const ranked = withRank(records)
    return (
      <div className="rounded-xl overflow-hidden border border-slate-700/50">
        {ranked.map((s, idx) => (
          <div
            key={`${s.name}-${idx}`}
            className="grid grid-cols-[36px_1fr_48px] items-center px-3 py-1.5 text-sm border-t border-slate-700/40 first:border-t-0"
            style={{ background: idx % 2 === 0 ? 'rgba(30,41,59,0.4)' : 'transparent' }}
          >
            <span className="text-center font-bold text-slate-300 text-xs">{s.rank === 1 ? '🥇' : s.rank}</span>
            <span className="font-semibold truncate" style={{ color: getTeamColor(s.team) }}>
              {s.name} <span className="text-slate-500 text-[11px] font-normal">({s.team})</span>
            </span>
            <span className="text-center font-black text-white tabular-nums">{s.goals}</span>
          </div>
        ))}
      </div>
    )
  }

  function TrophyCard({ emoji, label, value, sub, color }) {
    return (
      <div className="rounded-xl p-4 border text-center" style={{ background: 'linear-gradient(135deg, rgba(250,204,21,0.10) 0%, rgba(15,23,42,0.6) 100%)', borderColor: 'rgba(250,204,21,0.3)' }}>
        <div className="text-2xl mb-1">{emoji}</div>
        <p className="text-slate-400 text-xs mb-1">{label}</p>
        <p className="text-lg font-extrabold leading-tight" style={{ color: color || '#fde68a' }}>{value || '-'}</p>
        {sub && <p className="text-slate-300 text-xs mt-0.5">{sub}</p>}
      </div>
    )
  }

  // 저장된 아카이브 카드 (읽기 전용)
  function ArchiveCard({ a }) {
    const isOpen = selected?.season === a.season
    const [rosterOpen, setRosterOpen] = useState(false)
    const [scorerOpen, setScorerOpen] = useState(false)

    return (
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <button
          onClick={() => setSelected(isOpen ? null : a)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-700/40 transition-colors"
        >
          {/* 시즌 + 라벨 붙인 우승팀들 */}
          <div className="flex items-center gap-2.5 flex-wrap text-left">
            <span className="text-white font-bold text-base">{a.season}</span>
            {a.league_champion && (
              <span className="text-sm font-semibold" style={{ color: getTeamColor(a.league_champion) }}>
                🏆 리그 {a.league_champion}
              </span>
            )}
            {a.champs_champion && (
              <span className="text-sm font-semibold" style={{ color: getTeamColor(a.champs_champion) }}>
                👑 챔스 {a.champs_champion}
              </span>
            )}
          </div>
          <span className="text-slate-400 text-sm flex-shrink-0 ml-2">{isOpen ? '▲' : '▼'}</span>
        </button>

        {isOpen && (
          <div className="px-4 pb-4 pt-1 border-t border-slate-700/50 space-y-3">
            <div className="grid grid-cols-2 gap-3 mt-3">
              <TrophyCard emoji="🏆" label="리그 우승팀" value={a.league_champion} color={getTeamColor(a.league_champion)} />
              <TrophyCard emoji="👟" label="리그 득점왕" value={a.league_top_scorer} sub={a.league_top_scorer_goals ? `${a.league_top_scorer_goals}골` : ''} color="#fde68a" />
              <TrophyCard emoji="👑" label="챔스 우승팀" value={a.champs_champion} color={getTeamColor(a.champs_champion)} />
              <TrophyCard emoji="⭐" label="챔스 MVP" value={a.champs_mvp} color="#fde68a" />
            </div>

            {a.note && (
              <div className="bg-slate-900/60 rounded-xl px-3 py-2">
                <p className="text-slate-200 text-sm">📝 {a.note}</p>
              </div>
            )}

            {(a.roster_records || []).length > 0 && (
              <div>
                <button
                  onClick={() => setRosterOpen((v) => !v)}
                  className="w-full flex items-center justify-between bg-slate-900/60 hover:bg-slate-700/60 rounded-lg px-3 py-2 transition-colors"
                >
                  <span className="text-slate-300 text-sm font-medium">👥 팀 명단 ({(a.roster_records || []).length}팀)</span>
                  <span className="text-slate-400 text-sm">{rosterOpen ? '▲' : '▼'}</span>
                </button>
                {rosterOpen && <div className="mt-2"><RosterTiles roster={a.roster_records || []} /></div>}
              </div>
            )}

            {(a.scorer_records || []).length > 0 && (
              <div>
                <button
                  onClick={() => setScorerOpen((v) => !v)}
                  className="w-full flex items-center justify-between bg-slate-900/60 hover:bg-slate-700/60 rounded-lg px-3 py-2 transition-colors"
                >
                  <span className="text-slate-300 text-sm font-medium">📋 개인 득점기록 ({(a.scorer_records || []).length}명)</span>
                  <span className="text-slate-400 text-sm">{scorerOpen ? '▲' : '▼'}</span>
                </button>
                {scorerOpen && <div className="mt-2"><ScorerRows records={a.scorer_records || []} /></div>}
              </div>
            )}

            {canEdit && (
              <button
                onClick={() => deleteArchive(a.season)}
                className="w-full mt-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 py-2.5 rounded-xl text-sm font-semibold transition-colors border border-red-500/20"
              >
                🗑️ 이 시즌 데이터 제거
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  const selectClass = "w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-white flex items-center gap-2">🏆 아카이브</h1>
        <p className="text-slate-400 mt-1">시즌별 우승팀 · 득점왕 · 팀 명단 · 챔스 기록</p>
      </div>

      {loading ? (
        <div className="text-center py-20 text-slate-400">⏳ 불러오는 중...</div>
      ) : (
        <>
          {/* ===== 관리자·임원: 현재 시즌 저장 ===== */}
          {canEdit && (
            <div className="bg-slate-800 rounded-2xl border border-emerald-500/30 mb-8 overflow-hidden">
              <button
                onClick={() => setShowSaveForm((v) => !v)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-700/40 transition-colors"
              >
                <div className="text-left">
                  <h2 className="text-lg font-bold text-white">💾 현재 시즌 저장</h2>
                  <p className="text-slate-400 text-sm mt-0.5">
                    시즌 <span className="text-emerald-400 font-bold">{seasonLabel || '(미설정)'}</span>
                  </p>
                </div>
                <span className="text-slate-400 text-lg flex-shrink-0 ml-3">{showSaveForm ? '▲' : '▼'}</span>
              </button>

              {showSaveForm && (
                <div className="px-5 pb-5 pt-1 border-t border-slate-700/50">
                  <div className="mt-2">
                    <FormRow icon="🏆" label="리그 우승팀">
                      <span className="font-bold" style={{ color: getTeamColor(computed.leagueChampion) }}>
                        {computed.leagueChampion || '-'}
                      </span>
                      <span className="text-slate-500 text-xs ml-2">(자동)</span>
                    </FormRow>

                    <FormRow icon="👟" label="득점왕">
                      {computed.scorerRecords.length === 0 ? (
                        <span className="text-slate-500 text-sm">기록 없음</span>
                      ) : (
                        <select value={topScorerIdx} onChange={(e) => setTopScorerIdx(Number(e.target.value))} className={selectClass}>
                          {rankedScorers.map((s, i) => (
                            <option key={i} value={i}>{s.rank}위 · {s.name} · {s.goals}골</option>
                          ))}
                        </select>
                      )}
                    </FormRow>

                    <FormRow icon="👥" label="팀 명단">
                      <button
                        onClick={() => setFormRosterOpen((v) => !v)}
                        className="w-full flex items-center justify-between bg-slate-700/60 hover:bg-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 transition-colors"
                      >
                        <span>{currentRosterPreview.length}팀 · {currentRosterTotal}명</span>
                        <span className="text-slate-400">{formRosterOpen ? '▲' : '▼'}</span>
                      </button>
                    </FormRow>
                    {formRosterOpen && (
                      <div className="py-2"><RosterTiles roster={currentRosterPreview} /></div>
                    )}

                    <FormRow icon="📋" label="득점기록">
                      <button
                        onClick={() => setFormScorerOpen((v) => !v)}
                        className="w-full flex items-center justify-between bg-slate-700/60 hover:bg-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 transition-colors"
                      >
                        <span>{computed.scorerRecords.length}명</span>
                        <span className="text-slate-400">{formScorerOpen ? '▲' : '▼'}</span>
                      </button>
                    </FormRow>
                    {formScorerOpen && (
                      <div className="py-2"><ScorerRows records={computed.scorerRecords} /></div>
                    )}

                    <FormRow icon="👑" label="챔스 우승팀">
                      <select value={champsChampion} onChange={(e) => setChampsChampion(e.target.value)} className={selectClass}>
                        <option value="">선택 안 함</option>
                        {teamNames.map((n) => (<option key={n} value={n}>{n}</option>))}
                      </select>
                    </FormRow>

                    <FormRow icon="⭐" label="챔스 MVP">
                      <select value={champsMvp} onChange={(e) => setChampsMvp(e.target.value)} className={selectClass}>
                        <option value="">선택 안 함</option>
                        {activePlayers.map((p) => (
                          <option key={p.id} value={p.name}>{p.name}{p.current_team ? ` (${p.current_team})` : ''}</option>
                        ))}
                      </select>
                    </FormRow>

                    <FormRow icon="📝" label="비고">
                      <input
                        type="text"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="선택 입력"
                        className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                      />
                    </FormRow>
                  </div>

                  <button
                    onClick={saveArchive}
                    disabled={saving}
                    className="w-full mt-4 bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-xl font-bold transition-colors disabled:opacity-50"
                  >
                    {saving ? '저장 중...' : `💾 "${seasonLabel}" 시즌 저장`}
                  </button>
                  <p className="text-slate-500 text-xs mt-2 text-center">※ 같은 시즌이 있으면 덮어씁니다.</p>
                </div>
              )}
            </div>
          )}

          {/* ===== 저장된 아카이브 목록 (연도별 접기/펼치기) ===== */}
          <h2 className="text-xl font-bold text-white mb-3">📚 저장된 시즌</h2>
          {archives.length === 0 ? (
            <div className="text-center py-16 text-slate-400 bg-slate-800/40 border border-dashed border-slate-700 rounded-2xl">
              <p className="text-4xl mb-3">🏆</p>
              <p>저장된 아카이브가 없습니다</p>
            </div>
          ) : (
            <div className="space-y-4">
              {archivesByYear.map(([year, items]) => {
                const yearOpen = !!openYears[year]
                return (
                  <div key={year}>
                    {/* 연도 헤더 (진한 배경, 명확히 구분) */}
                    <button
                      onClick={() => toggleYear(year)}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-colors ${
                        yearOpen ? 'bg-emerald-500/15 border border-emerald-500/40' : 'bg-slate-700/60 border border-slate-600 hover:bg-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-300 text-lg font-extrabold">📅 {year}년</span>
                        <span className="text-slate-400 text-sm">· {items.length}개 시즌</span>
                      </div>
                      <span className="text-slate-300 text-base">{yearOpen ? '▲' : '▼'}</span>
                    </button>

                    {/* 그 해 시즌들 (들여쓰기 + 왼쪽 라인으로 계층 표현) */}
                    {yearOpen && (
                      <div className="mt-2 ml-3 pl-3 border-l-2 border-emerald-500/30 space-y-2">
                        {items.map((a) => (
                          <ArchiveCard key={a.id} a={a} />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      <div style={{ height: '40px', width: '100%' }} aria-hidden="true"></div>
    </div>
  )
}

export default SeasonArchive