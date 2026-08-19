import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

function SeasonArchive() {
  const { role } = useAuth()
  const canEdit = role === 'admin' || role === 'executive'

  const [teams, setTeams] = useState([])
  const [archives, setArchives] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)
  const [openYears, setOpenYears] = useState({})

  useEffect(() => {
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function init() {
    setLoading(true)
    const { data: teamData } = await supabase.from('teams').select('*').order('display_order')
    setTeams(teamData || [])
    await fetchArchives()
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

  async function deleteArchive(season) {
    if (!canEdit) return
    if (!window.confirm(`"${season}" 아카이브를 삭제할까요?`)) return
    await supabase.from('season_archives').delete().eq('season', season)
    if (selected?.season === season) setSelected(null)
    fetchArchives()
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

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-white flex items-center gap-2">🏆 아카이브</h1>
        <p className="text-slate-400 mt-1">시즌별 우승팀 · 득점왕 · 팀 명단 · 챔스 기록</p>
      </div>

      {canEdit && (
        <p className="bg-slate-800/60 border border-slate-700 rounded-lg px-4 py-2.5 mb-6 text-slate-400 text-sm">
          💡 시즌 기록 저장은 <span className="text-emerald-400 font-semibold">🔄 시즌 전환</span> 메뉴의 1단계에서 진행합니다.
        </p>
      )}

      {loading ? (
        <div className="text-center py-20 text-slate-400">⏳ 불러오는 중...</div>
      ) : (
        <>
          <h2 className="text-xl font-bold text-white mb-3">📚 저장된 시즌</h2>
          {archives.length === 0 ? (
            <div className="text-center py-16 text-slate-400 bg-slate-800/40 border border-dashed border-slate-700 rounded-2xl">
              <p className="text-4xl mb-3">🏆</p>
              <p>저장된 아카이브가 없습니다</p>
              {canEdit && <p className="text-sm mt-2">시즌 전환 1단계에서 시즌 기록을 저장해 주세요.</p>}
            </div>
          ) : (
            <div className="space-y-4">
              {archivesByYear.map(([year, items]) => {
                const yearOpen = !!openYears[year]
                return (
                  <div key={year}>
                    {/* 연도 헤더 */}
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

                    {/* 그 해 시즌들 */}
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