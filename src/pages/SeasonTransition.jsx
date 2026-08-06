import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

// 주장 이름 → 팀명 자동 생성 (3글자면 뒤 2글자+팀, 2글자면 그대로+팀)
function suggestTeamName(name) {
  if (!name) return ''
  const n = name.trim()
  if (n.length >= 3) return n.slice(-2) + '팀'
  return n + '팀'
}

// "7시", "20시-22시" 등에서 시작 시각(시)만 추출
function parseStartHour(timeStr) {
  if (!timeStr) return null
  const m = String(timeStr).match(/\d{1,2}/)
  if (!m) return null
  let h = parseInt(m[0], 10)
  if (isNaN(h) || h < 0 || h > 23) return null
  return h
}

// 색상 팔레트 (흰색 / 파랑 / 형광노랑 3가지만)
const COLOR_PALETTE = [
  { name: '흰색', value: '#ffffff' },
  { name: '파란색', value: '#1d4ed8' },
  { name: '형광(노랑)', value: '#eeff00' },
]

function SeasonTransition() {
  const { role, isPresident } = useAuth()
  const canEdit = role === 'admin' || isPresident

  const [currentSeason, setCurrentSeason] = useState('')
  const [players, setPlayers] = useState([])
  const [teams, setTeams] = useState([])
  const [archivedSeasons, setArchivedSeasons] = useState([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)

  // 입력값
  const [newSeason, setNewSeason] = useState('')
  // 팀 3개: { captainId, teamName, color }
  const [teamSetups, setTeamSetups] = useState([
    { captainId: '', teamName: '', color: '#ffffff' },
    { captainId: '', teamName: '', color: '#1d4ed8' },
    { captainId: '', teamName: '', color: '#eeff00' },
  ])

  useEffect(() => {
    init()
  }, [])

  async function init() {
    setLoading(true)
    const [seasonRow, playerRes, teamRes, archiveRes] = await Promise.all([
      supabase.from('app_settings').select('value').eq('key', 'season_label').single(),
      supabase.from('players').select('*').order('name'),
      supabase.from('teams').select('*').order('display_order'),
      supabase.from('season_archives').select('season'),
    ])

    setCurrentSeason(seasonRow.data?.value || '')
    setPlayers((playerRes.data || []).filter((p) => p.is_active !== false))
    setTeams(teamRes.data || [])
    setArchivedSeasons((archiveRes.data || []).map((a) => a.season))
    setLoading(false)
  }

  const isArchived = currentSeason && archivedSeasons.includes(currentSeason)

  function selectCaptain(idx, playerId) {
    const p = players.find((x) => x.id === playerId)
    setTeamSetups((prev) =>
      prev.map((t, i) =>
        i === idx
          ? { ...t, captainId: playerId, teamName: p ? suggestTeamName(p.name) : t.teamName }
          : t
      )
    )
  }

  function updateSetup(idx, field, value) {
    setTeamSetups((prev) => prev.map((t, i) => (i === idx ? { ...t, [field]: value } : t)))
  }

  function isCaptainTaken(playerId, currentIdx) {
    return teamSetups.some((t, i) => i !== currentIdx && t.captainId === playerId)
  }

  // ─────────────────────────────────────────────
  // 아카이브 자동 저장용 계산 함수들 (SeasonArchive.jsx와 동일 로직)
  // ─────────────────────────────────────────────

  function computeChampion(matches, teamList) {
    const dates = [...new Set(matches.map((m) => m.game_date))]
    const allMatchups = []
    for (const date of dates) {
      const dayMatches = matches
        .filter((m) => m.game_date === date)
        .sort((a, b) => a.match_number - b.match_number)
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
      else {
        standings[m.teamA].points += 1
        standings[m.teamB].points += 1
      }
    }

    const sorted = Object.values(standings).sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points
      const gdA = a.goalsFor - a.goalsAgainst
      const gdB = b.goalsFor - b.goalsAgainst
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

  function buildCurrentRoster(teamList, playerList) {
    const activeAssigned = playerList.filter((p) => p.is_active !== false && p.current_team)
    const list = []
    for (const t of teamList) {
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

  // 현재 시즌을 아카이브에 저장 (리그 우승/득점왕/득점기록/팀명단만 자동 저장)
  async function autoArchiveCurrentSeason() {
    if (!currentSeason) return { ok: true, skipped: true }

    // 최신 teams / players 조회 (초기화 전 상태 기준)
    const [teamRes, playerRes, mRes, gRes, resvRes] = await Promise.all([
      supabase.from('teams').select('*').order('display_order'),
      supabase.from('players').select('*'),
      supabase
        .from('matches')
        .select('*')
        .eq('season', currentSeason)
        .order('game_date', { ascending: false }),
      supabase.from('goals').select('*').eq('season', currentSeason),
      supabase.from('reservations').select('date, time, is_confirmed'),
    ])

    const teamList = teamRes.data || []
    const playerList = playerRes.data || []

    // isPast: 예약 시작시각 기반으로 "이미 치른 경기"만 집계
    const now = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    const todayKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`

    const startHourByDate = {}
    for (const r of resvRes.data || []) {
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
    const roster = buildCurrentRoster(teamList, playerList)
    const topScorer = scorerRecords[0] || null

    const payload = {
      season: currentSeason,
      league_champion: leagueChampion || null,
      league_top_scorer: topScorer ? topScorer.name : null,
      league_top_scorer_goals: topScorer ? topScorer.goals : 0,
      scorer_records: scorerRecords,
      roster_records: roster,
      champs_champion: null, // 자동 저장 시엔 알 수 없음 (필요하면 아카이브 메뉴에서 별도 입력)
      champs_mvp: null,
      note: null,
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase
      .from('season_archives')
      .upsert(payload, { onConflict: 'season' })

    if (error) return { ok: false, error }
    return { ok: true, skipped: false }
  }

  async function runTransition() {
    if (!canEdit) return

    if (!newSeason.trim()) {
      alert('새 시즌명을 입력해주세요! (예: 2026-06)')
      return
    }
    if (newSeason.trim() === currentSeason) {
      alert('새 시즌명이 현재 시즌과 같습니다.')
      return
    }
    for (let i = 0; i < 3; i++) {
      if (!teamSetups[i].captainId) {
        alert(`${i + 1}번째 팀의 주장을 선택해주세요!`)
        return
      }
      if (!teamSetups[i].teamName.trim()) {
        alert(`${i + 1}번째 팀명을 입력해주세요!`)
        return
      }
    }
    const capIds = teamSetups.map((t) => t.captainId)
    if (new Set(capIds).size !== 3) {
      alert('주장 3명은 서로 다른 선수여야 합니다!')
      return
    }
    const teamNames = teamSetups.map((t) => t.teamName.trim())
    if (new Set(teamNames).size !== 3) {
      alert('팀명 3개는 서로 달라야 합니다!')
      return
    }

    const willArchive = currentSeason && !isArchived
    const confirmMsg =
      `⚠️ 시즌을 전환합니다.\n\n` +
      (willArchive
        ? `• 현재 시즌(${currentSeason})을 먼저 아카이브에 자동 저장합니다.\n  (리그 우승 · 득점왕 · 득점기록 · 팀 명단)\n  ※ 챔스 우승/MVP/비고는 저장되지 않습니다.\n\n`
        : isArchived
        ? `• 현재 시즌(${currentSeason})은 이미 아카이브에 저장되어 있어 그대로 유지합니다.\n\n`
        : ``) +
      `• 새 시즌: ${newSeason.trim()}\n` +
      `• 팀: ${teamNames.join(', ')}\n` +
      `• 주장: ${teamSetups.map((t) => players.find((p) => p.id === t.captainId)?.name).join(', ')}\n\n` +
      `모든 선수가 미배정으로 초기화되고, 기존 주장 권한이 정회원으로 변경됩니다.\n계속할까요?`
    if (!window.confirm(confirmMsg)) return

    setProcessing(true)

    try {
      // (0) 아카이브 자동 저장 (아직 저장 안 된 경우에만)
      if (willArchive) {
        const res = await autoArchiveCurrentSeason()
        if (!res.ok) {
          alert('아카이브 저장에 실패했습니다. 전환을 중단합니다.\n' + (res.error?.message || ''))
          setProcessing(false)
          return
        }
      }

      // (A) teams 3개 업데이트 (이름 + 색상)
      for (let i = 0; i < 3; i++) {
        const t = teams[i]
        if (!t) continue
        await supabase
          .from('teams')
          .update({ name: teamSetups[i].teamName.trim(), color: teamSetups[i].color })
          .eq('id', t.id)
      }

      // (B) 기존 captain → member 강등 (admin/executive는 유지)
      await supabase.from('profiles').update({ role: 'member' }).eq('role', 'captain')

      // (C) 전 선수 초기화: 팀 미배정 + 주장 해제
      await supabase
        .from('players')
        .update({ current_team: null, is_captain: false })
        .neq('id', '00000000-0000-0000-0000-000000000000')

      // (D) 새 주장 3명 → is_captain=true + 소속팀 지정 + 권한
      for (let i = 0; i < 3; i++) {
        const captainId = teamSetups[i].captainId
        const teamName = teamSetups[i].teamName.trim()
        await supabase
          .from('players')
          .update({ current_team: teamName, is_captain: true })
          .eq('id', captainId)

        const { data: prof } = await supabase
          .from('profiles')
          .select('id, role')
          .eq('player_id', captainId)
          .maybeSingle()

        if (prof && prof.role !== 'admin' && prof.role !== 'executive') {
          await supabase.from('profiles').update({ role: 'captain' }).eq('id', prof.id)
        }
      }

      // (E) 시즌 번호 변경
      await supabase.from('app_settings').update({ value: newSeason.trim() }).eq('key', 'season_label')

      alert(
        (willArchive ? `✅ ${currentSeason} 시즌이 아카이브에 저장되었습니다.\n\n` : '') +
          `✅ ${newSeason.trim()} 시즌으로 전환되었습니다!\n\n이제 팀명단에서 나머지 선수를 배정(드래프트)해 주세요.`
      )
      setNewSeason('')
      setTeamSetups([
        { captainId: '', teamName: '', color: '#ffffff' },
        { captainId: '', teamName: '', color: '#1d4ed8' },
        { captainId: '', teamName: '', color: '#eeff00' },
      ])
      init()
    } catch (e) {
      console.error(e)
      alert('시즌 전환 중 오류가 발생했습니다: ' + (e.message || e))
    } finally {
      setProcessing(false)
    }
  }

  if (!canEdit) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20 text-slate-400">
        <p className="text-4xl mb-3">🔒</p>
        <p>시즌 전환은 관리자·회장만 사용할 수 있습니다.</p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-white">🔄 시즌 전환</h1>
        <p className="text-slate-400 mt-1">
          현재 시즌: <span className="text-emerald-400 font-semibold">{currentSeason || '(미설정)'}</span>
        </p>
      </div>

      {loading ? (
        <div className="text-center py-20 text-slate-400">⏳ 불러오는 중...</div>
      ) : (
        <>
          {/* 아카이브 저장 안내 */}
          <div
            className={`rounded-xl px-4 py-3 mb-5 text-sm border ${
              isArchived
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                : 'bg-sky-500/10 border-sky-500/30 text-sky-200'
            }`}
          >
            {isArchived ? (
              <>✅ 현재 시즌(<b>{currentSeason}</b>)이 이미 아카이브에 저장되어 있습니다.</>
            ) : (
              <>
                ℹ️ 전환을 실행하면 현재 시즌(<b>{currentSeason || '미설정'}</b>)이 <b>자동으로 아카이브에 저장</b>된 후 전환됩니다.
                <br />
                <span className="text-sky-300/80 text-xs">
                  ※ 챔스 우승·MVP·비고까지 남기려면 먼저 「아카이브」 메뉴에서 저장해 주세요.
                </span>
              </>
            )}
          </div>

          {/* 새 시즌명 */}
          <div className="mb-5">
            <label className="block text-slate-300 text-sm font-medium mb-1.5">🗓️ 새 시즌명</label>
            <input
              type="text"
              value={newSeason}
              onChange={(e) => setNewSeason(e.target.value)}
              placeholder="예: 2026-06"
              className="w-full sm:max-w-xs bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* 팀 3개 설정 (항상 3열 유지) */}
          <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-6">
            {teamSetups.map((setup, idx) => (
              <div key={idx} className="bg-slate-800 border border-slate-700 rounded-2xl p-3 sm:p-5">
                {/* 팀 헤더 (팀명만 표시) */}
                <div className="flex items-center gap-2 mb-5 pb-4 border-b border-slate-700/50 min-h-[32px]">
                  <span
                    className="inline-block w-5 h-5 rounded-full flex-shrink-0"
                    style={{ background: setup.color, border: '1px solid rgba(255,255,255,0.4)' }}
                  ></span>
                  <span
                    className="font-extrabold text-sm truncate"
                    style={{ color: setup.color === '#ffffff' ? '#e2e8f0' : setup.color }}
                  >
                    {setup.teamName || '\u00A0'}
                  </span>
                </div>

                {/* 주장 선택 */}
                <div className="mb-6">
                  <label className="block text-slate-400 text-xs mb-2">👑 주장</label>
                  <select
                    value={setup.captainId}
                    onChange={(e) => selectCaptain(idx, e.target.value)}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-2 py-2.5 text-white text-sm focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">선택</option>
                    {players.map((p) => (
                      <option key={p.id} value={p.id} disabled={isCaptainTaken(p.id, idx)}>
                        {p.name}{isCaptainTaken(p.id, idx) ? ' (선택됨)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 색상 선택 — 라벨과 동그라미 사이 간격을 인라인 style로 강제 */}
                <div>
                  <div
                    className="text-slate-400 text-xs"
                    style={{ marginBottom: '3px' }}
                  >
                    🎨 유니폼 색상
                  </div>
                  <div
                    className="flex items-center"
                    style={{ gap: '16px', paddingLeft: '2px', paddingBottom: '8px' }}
                  >
                    {COLOR_PALETTE.map((c) => {
                      const active = setup.color === c.value
                      return (
                        <button
                          key={c.value}
                          type="button"
                          onClick={() => updateSetup(idx, 'color', c.value)}
                          title={c.name}
                          aria-label={c.name}
                          style={{
                            width: '20px',
                            height: '20px',
                            borderRadius: '9999px',
                            flexShrink: 0,
                            background: c.value,
                            border: active
                              ? '2px solid #34d399'
                              : '1px solid rgba(255,255,255,0.4)',
                            outline: active ? '2px solid #34d399' : 'none',
                            outlineOffset: '2px',
                            opacity: active ? 1 : 0.7,
                            cursor: 'pointer',
                            transition: 'opacity 0.15s',
                          }}
                        ></button>
                      )
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 실행 버튼 */}
          <button
            onClick={runTransition}
            disabled={processing}
            className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-4 rounded-xl font-bold text-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {processing ? '전환 중...' : '🔄 시즌 전환 실행'}
          </button>
          <p className="text-slate-500 text-xs mt-2 text-center">
            ※ 실행 시 현재 시즌이 아카이브에 자동 저장된 후 전환됩니다.
          </p>

          {/* 하단 여백 */}
          <div style={{ height: '60px', width: '100%' }} aria-hidden="true"></div>
        </>
      )}
    </div>
  )
}

export default SeasonTransition