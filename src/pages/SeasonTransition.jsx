import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

// 주장 이름 → 팀명 자동 생성
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

const COLOR_PALETTE = [
  { name: '흰색', value: '#ffffff' },
  { name: '파란색', value: '#1d4ed8' },
  { name: '형광(노랑)', value: '#eeff00' },
]

// ⭐ 별 사유 정의
const STAR_REASONS = [
  { key: '리그우승', label: '🏆 리그 우승', color: '#fbbf24' },
  { key: '득점왕', label: '👟 득점왕', color: '#10b981' },
  { key: '베스트 플레이어', label: '📊 베스트 플레이어', color: '#60a5fa' },
  { key: '챔스우승', label: '👑 챔스 우승', color: '#f59e0b' },
  { key: '챔스MVP', label: '⭐ 챔스 MVP', color: '#a78bfa' },
  { key: '주장', label: '🎖️ 주장', color: '#f472b6' },
]

function SeasonTransition() {
  const { role, isPresident } = useAuth()
  const canEdit = role === 'admin' || isPresident

  const [currentSeason, setCurrentSeason] = useState('')
  const [players, setPlayers] = useState([])
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)

  // ── 1단계: 아카이브 ──
  const [archiveOpen, setArchiveOpen] = useState(true)
  const [archiveSaved, setArchiveSaved] = useState(false)
  const [savedArchive, setSavedArchive] = useState(null)
  const [archiveSaving, setArchiveSaving] = useState(false)
  const [computed, setComputed] = useState({ leagueChampion: '', scorerRecords: [], roster: [] })
  const [topScorerIdx, setTopScorerIdx] = useState(0)
  const [champsChampion, setChampsChampion] = useState('')
  const [champsMvp, setChampsMvp] = useState('')
  const [note, setNote] = useState('')

  // ── 2단계: 별 ──
  const [starOpen, setStarOpen] = useState(false)
  const [starCalculating, setStarCalculating] = useState(false)
  const [starGiving, setStarGiving] = useState(false)
  const [starResult, setStarResult] = useState(null)
  const [starGiven, setStarGiven] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState({})
  const [starAddPlayerId, setStarAddPlayerId] = useState('')
  const [starAddReason, setStarAddReason] = useState('리그우승')

  // ── 3단계: 전환 ──
  const [transitionOpen, setTransitionOpen] = useState(false)
  const [newSeason, setNewSeason] = useState('')
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
    const { data: seasonRow } = await supabase
      .from('app_settings').select('value').eq('key', 'season_label').single()
    const season = seasonRow?.value || ''
    setCurrentSeason(season)

    const [playerRes, teamRes, archRes] = await Promise.all([
      supabase.from('players').select('*').order('name'),
      supabase.from('teams').select('*').order('display_order'),
      season ? supabase.from('season_archives').select('*').eq('season', season).maybeSingle() : Promise.resolve({ data: null }),
    ])

    const activePlayers = (playerRes.data || []).filter((p) => p.is_active !== false)
    setPlayers(activePlayers)
    setTeams(teamRes.data || [])

    if (archRes.data) {
      setArchiveSaved(true)
      setSavedArchive(archRes.data)
      setChampsChampion(archRes.data.champs_champion || '')
      setChampsMvp(archRes.data.champs_mvp || '')
      setNote(archRes.data.note || '')
      setArchiveOpen(false)
      setStarOpen(true)
    }

    if (season) {
      await computeCurrentSeason(season, teamRes.data || [], playerRes.data || [])
    }
    setLoading(false)
  }

  // ── 공통 계산 ──
  function computeStandings(matches, teamList) {
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
          const teamA = pair.first.team_a, teamB = pair.first.team_b
          let totalA = pair.first.score_a, totalB = pair.first.score_b
          if (pair.second.team_a === teamA) { totalA += pair.second.score_a; totalB += pair.second.score_b }
          else { totalA += pair.second.score_b; totalB += pair.second.score_a }
          allMatchups.push({ teamA, teamB, totalA, totalB })
        }
      }
    }
    const st = {}
    for (const t of teamList) st[t.name] = { name: t.name, points: 0, wins: 0, goalsFor: 0, goalsAgainst: 0 }
    for (const m of allMatchups) {
      if (!st[m.teamA] || !st[m.teamB]) continue
      st[m.teamA].goalsFor += m.totalA; st[m.teamA].goalsAgainst += m.totalB
      st[m.teamB].goalsFor += m.totalB; st[m.teamB].goalsAgainst += m.totalA
      if (m.totalA > m.totalB) { st[m.teamA].points += 3; st[m.teamA].wins++ }
      else if (m.totalA < m.totalB) { st[m.teamB].points += 3; st[m.teamB].wins++ }
      else { st[m.teamA].points += 1; st[m.teamB].points += 1 }
    }
    return Object.values(st).sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points
      const gdA = a.goalsFor - a.goalsAgainst, gdB = b.goalsFor - b.goalsAgainst
      if (gdB !== gdA) return gdB - gdA
      if (b.wins !== a.wins) return b.wins - a.wins
      return b.goalsFor - a.goalsFor
    })
  }

  function computeChampion(matches, teamList) {
    const sorted = computeStandings(matches, teamList)
    const hasData = sorted.some((s) => s.points > 0 || s.goalsFor > 0)
    return hasData && sorted.length > 0 ? sorted[0].name : ''
  }

  function computeChampsChampion(champsMatches) {
    if (!champsMatches || champsMatches.length === 0) return ''
    const st = {}
    const ensure = (n) => { if (!st[n]) st[n] = { name: n, points: 0, goalsFor: 0, goalsAgainst: 0 } }
    for (const m of champsMatches) {
      const a = m.team_a, b = m.team_b
      if (!a || !b) continue
      ensure(a); ensure(b)
      const sa = m.score_a || 0, sb = m.score_b || 0
      st[a].goalsFor += sa; st[a].goalsAgainst += sb
      st[b].goalsFor += sb; st[b].goalsAgainst += sa
      if (sa > sb) st[a].points += 3
      else if (sa < sb) st[b].points += 3
      else { st[a].points += 1; st[b].points += 1 }
    }
    const sorted = Object.values(st).sort((x, y) => {
      if (y.points !== x.points) return y.points - x.points
      const gdX = x.goalsFor - x.goalsAgainst, gdY = y.goalsFor - y.goalsAgainst
      if (gdY !== gdX) return gdY - gdX
      return y.goalsFor - x.goalsFor
    })
    const hasData = sorted.some((s) => s.points > 0 || s.goalsFor > 0)
    return hasData && sorted.length > 0 ? sorted[0].name : ''
  }

  function computeScorers(goals, playerList) {
    const isSpecial = (g) => {
      if (!g.player_id) return true
      const n = g.player_name
      return n === 'PK(핸디캡)' || n === 'PK' || n === '자책골'
    }
    const teamOf = (pid, fb) => playerList.find((x) => x.id === pid)?.current_team || fb || '미배정'
    const map = {}
    for (const g of goals) {
      if (isSpecial(g)) continue
      if (!map[g.player_id]) map[g.player_id] = { player_id: g.player_id, name: g.player_name, team: teamOf(g.player_id, g.team), goals: 0 }
      map[g.player_id].goals++
    }
    return Object.values(map).sort((a, b) => b.goals - a.goals)
  }

  function buildRoster(teamList, playerList) {
    const assigned = playerList.filter((p) => p.is_active !== false && p.current_team)
    const list = []
    for (const t of teamList) {
      const members = assigned.filter((p) => p.current_team === t.name).map((p) => p.name).sort((a, b) => a.localeCompare(b))
      if (members.length > 0) list.push({ team: t.name, players: members })
    }
    return list
  }

  function makeIsPast(resvData) {
    const now = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    const todayKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
    const startHourByDate = {}
    for (const r of resvData || []) {
      if (startHourByDate[r.date] === undefined || r.is_confirmed) {
        const h = parseStartHour(r.time)
        if (h !== null) startHourByDate[r.date] = h
      }
    }
    return (d) => {
      if (d < todayKey) return true
      if (d > todayKey) return false
      const sh = startHourByDate[d]
      if (sh === undefined || sh === null) return true
      return now.getHours() >= sh
    }
  }

  // 1단계: 현재 시즌 자동 계산
  async function computeCurrentSeason(season, teamList, playerList) {
    const [mRes, gRes, resvRes] = await Promise.all([
      supabase.from('matches').select('*').eq('season', season),
      supabase.from('goals').select('*').eq('season', season),
      supabase.from('reservations').select('date, time, is_confirmed'),
    ])
    const isPast = makeIsPast(resvRes.data)
    const allPast = (mRes.data || []).filter((m) => isPast(m.game_date))
    const leagueMatches = allPast.filter((m) => !m.is_champions)
    const champsMatches = allPast.filter((m) => m.is_champions)
    const champsIds = new Set(champsMatches.map((m) => m.id))
    const leagueGoals = (gRes.data || [])
      .filter((g) => isPast(g.game_date))
      .filter((g) => !(g.match_id && champsIds.has(g.match_id)))

    setComputed({
      leagueChampion: computeChampion(leagueMatches, teamList),
      scorerRecords: computeScorers(leagueGoals, playerList),
      roster: buildRoster(teamList, playerList),
    })
    setTopScorerIdx(0)

    // 챔스 자동 감지
    const autoChampsChamp = computeChampsChampion(champsMatches)
    const autoMvp = champsMatches.find((m) => m.champs_mvp)?.champs_mvp || ''
    setChampsChampion((prev) => prev || autoChampsChamp || '')
    setChampsMvp((prev) => prev || autoMvp || '')
  }

  // 1단계: 아카이브 저장
  async function saveArchive() {
    if (!currentSeason) {
      alert('현재 시즌이 설정되어 있지 않습니다.')
      return
    }
    if (!window.confirm(`"${currentSeason}" 시즌 기록을 저장할까요?\n(같은 시즌이 있으면 덮어씁니다)`)) return

    setArchiveSaving(true)
    const chosen = computed.scorerRecords[topScorerIdx] || computed.scorerRecords[0] || null

    const payload = {
      season: currentSeason,
      league_champion: computed.leagueChampion || null,
      league_top_scorer: chosen ? chosen.name : null,
      league_top_scorer_goals: chosen ? chosen.goals : 0,
      scorer_records: computed.scorerRecords,
      roster_records: computed.roster,
      champs_champion: champsChampion || null,
      champs_mvp: champsMvp || null,
      note: note.trim() || null,
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase.from('season_archives').upsert(payload, { onConflict: 'season' })
    setArchiveSaving(false)

    if (error) {
      alert('저장에 실패했습니다: ' + error.message)
    } else {
      alert(`✅ "${currentSeason}" 시즌 기록이 저장되었습니다!\n\n이제 2단계 별 지급을 진행하세요.`)
      setArchiveSaved(true)
      setSavedArchive(payload)
      setArchiveOpen(false)
      setStarOpen(true)
      setStarResult(null)
      setStarGiven(false)
    }
  }

  // ── 2단계: 별 자동 계산 ──
  async function calculateStars() {
    if (!archiveSaved || !savedArchive) {
      alert('먼저 1단계에서 시즌 기록을 저장해 주세요.')
      return
    }
    setStarCalculating(true)
    setStarGiven(false)

    try {
      const [mRes, attRes, resvRes] = await Promise.all([
        supabase.from('matches').select('*').eq('season', currentSeason),
        supabase.from('attendance').select('*'),
        supabase.from('reservations').select('date, time, is_confirmed'),
      ])

      const isPast = makeIsPast(resvRes.data)
      const allPast = (mRes.data || []).filter((m) => isPast(m.game_date))
      const leagueMatches = allPast.filter((m) => !m.is_champions)
      const champsMatches = allPast.filter((m) => m.is_champions)
      const allAttendance = attRes.data || []
      const PRESENT = ['출석', '늦참', '조퇴']

      // ⚽ 리그 경기일 / 🏆 챔스 경기일 분리
      const leagueDates = new Set(leagueMatches.map((m) => m.game_date))
      const champsDates = new Set(champsMatches.map((m) => m.game_date))
      const leagueGames = leagueDates.size
      const champsGames = champsDates.size

      // ⚽ 리그 출석률 (베스트 플레이어·리그우승 기준)
      const rate = {}
      for (const p of players) {
        const cnt = allAttendance.filter(
          (a) => a.player_id === p.id && leagueDates.has(a.game_date) && PRESENT.includes(a.status)
        ).length
        rate[p.id] = leagueGames > 0 ? Math.round((cnt / leagueGames) * 100) : 0
      }

      const standings = computeStandings(leagueMatches, teams)
      const groups = []

      // 1. 리그 우승 (아카이브 값 사용 · 리그 출석률 50%↑)
      const leagueChamp = savedArchive.league_champion || ''
      const champPlayers = leagueChamp ? players.filter((p) => p.current_team === leagueChamp) : []
      groups.push({
        reason: '리그우승',
        note: leagueChamp ? `${leagueChamp} · 리그 출석률 50%↑` : '우승팀 없음',
        candidates: champPlayers
          .map((p) => ({
            player_id: p.id, name: p.name, team: p.current_team,
            info: `${rate[p.id]}%`, checked: rate[p.id] >= 50,
          }))
          .sort((a, b) => parseInt(b.info) - parseInt(a.info)),
      })

      // 2. 득점왕 (아카이브 값 사용)
      const topScorerName = savedArchive.league_top_scorer || ''
      const topScorerP = topScorerName ? players.find((p) => p.name === topScorerName) : null
      groups.push({
        reason: '득점왕',
        note: topScorerName ? `${savedArchive.league_top_scorer_goals || 0}골` : '미선정',
        candidates: topScorerP
          ? [{ player_id: topScorerP.id, name: topScorerP.name, team: topScorerP.current_team, info: `${savedArchive.league_top_scorer_goals || 0}골`, checked: true }]
          : [],
      })

      // 3. 베스트 플레이어 (⚽ 리그 출석률 기준 · 1등 5명 / 2등 3명 / 3등 1명)
      const quotas = [5, 3, 1]
      const bestCandidates = []
      let hasTie = false
      standings.slice(0, 3).forEach((st, ri) => {
        const quota = quotas[ri]
        const tp = players
          .filter((p) => p.current_team === st.name)
          .map((p) => ({ ...p, rate: rate[p.id] }))
          .sort((a, b) => b.rate - a.rate || a.name.localeCompare(b.name))
        if (tp.length === 0) return

        const cutoff = tp[Math.min(quota, tp.length) - 1]?.rate ?? 0
        const above = tp.filter((p) => p.rate > cutoff)
        const at = tp.filter((p) => p.rate === cutoff)
        const remain = quota - above.length
        const tie = at.length > remain && remain > 0
        if (tie) hasTie = true

        for (const p of above) {
          bestCandidates.push({ player_id: p.id, name: p.name, team: st.name, teamRank: ri + 1, info: `${ri + 1}위팀 ${p.rate}%`, checked: true })
        }
        at.forEach((p, i) => {
          bestCandidates.push({
            player_id: p.id, name: p.name, team: st.name, teamRank: ri + 1,
            info: `${ri + 1}위팀 ${p.rate}%${tie ? ' ⚠️' : ''}`,
            checked: i < remain, tieWarn: tie,
          })
        })
      })
      groups.push({
        reason: '베스트 플레이어',
        note: `⚽ 리그 출석률 기준 · 1위 5명·2위 3명·3위 1명 (리그 ${leagueGames}경기)`,
        tie: hasTie,
        candidates: bestCandidates,
      })

      // 4. 챔스 우승 (아카이브 값 사용 · 🏆 챔스 참석 여부)
      const champsChamp = savedArchive.champs_champion || ''
      const champsAtt = []
      if (champsChamp && champsGames > 0) {
        for (const p of players) {
          const ok = allAttendance.some(
            (a) => a.player_id === p.id && champsDates.has(a.game_date) &&
              PRESENT.includes(a.status) && a.team === champsChamp
          )
          if (ok) champsAtt.push({ player_id: p.id, name: p.name, team: champsChamp, info: '참석', checked: true })
        }
      }
      groups.push({
        reason: '챔스우승',
        note: champsChamp ? `${champsChamp} · 🏆 챔스 참석자` : '챔스 없음',
        candidates: champsAtt,
      })

      // 5. 챔스 MVP (아카이브 값 사용)
      const mvpName = savedArchive.champs_mvp || ''
      const mvpP = mvpName ? players.find((p) => p.name === mvpName) : null
      groups.push({
        reason: '챔스MVP',
        note: mvpName || '미선정',
        candidates: mvpP ? [{ player_id: mvpP.id, name: mvpP.name, team: mvpP.current_team, info: 'MVP', checked: true }] : [],
      })

      // 6. 주장 (is_captain 우선 → 없으면 팀명 역추적)
      let captains = players.filter((p) => p.is_captain === true)
      let capNote = `${captains.length}명`
      if (captains.length === 0) {
        // 팀명에서 역추적: "민석팀" → 이름이 "민석"으로 끝나는 선수
        const found = []
        for (const t of teams) {
          const base = (t.name || '').replace(/팀$/, '')
          if (!base) continue
          const match = players.find((p) => p.current_team === t.name && p.name.endsWith(base))
          if (match) found.push(match)
        }
        captains = found
        capNote = `${captains.length}명 (팀명 자동 추정)`
      }
      groups.push({
        reason: '주장',
        note: capNote,
        candidates: captains.map((p) => ({ player_id: p.id, name: p.name, team: p.current_team, info: '주장', checked: true })),
      })

      setStarResult({ groups, leagueGames, champsGames })
      // 동점 있는 그룹만 펼침
      const exp = {}
      groups.forEach((g) => { if (g.tie) exp[g.reason] = true })
      setExpandedGroups(exp)
    } catch (e) {
      console.error(e)
      alert('별 계산 중 오류: ' + (e.message || e))
    } finally {
      setStarCalculating(false)
    }
  }

  function toggleGroup(reason) {
    setExpandedGroups((prev) => ({ ...prev, [reason]: !prev[reason] }))
  }

  function toggleCandidate(gi, ci) {
    setStarResult((prev) => {
      if (!prev) return prev
      const groups = prev.groups.map((g, i) =>
        i !== gi ? g : { ...g, candidates: g.candidates.map((c, j) => (j === ci ? { ...c, checked: !c.checked } : c)) }
      )
      return { ...prev, groups }
    })
  }

  function addCandidate() {
    if (!starAddPlayerId) { alert('선수를 선택해 주세요.'); return }
    const p = players.find((x) => x.id === starAddPlayerId)
    if (!p) return
    setStarResult((prev) => {
      if (!prev) return prev
      const groups = prev.groups.map((g) => {
        if (g.reason !== starAddReason) return g
        if (g.candidates.some((c) => c.player_id === p.id)) { alert('이미 목록에 있습니다.'); return g }
        return { ...g, candidates: [...g.candidates, { player_id: p.id, name: p.name, team: p.current_team, info: '수동', checked: true }] }
      })
      return { ...prev, groups }
    })
    setExpandedGroups((prev) => ({ ...prev, [starAddReason]: true }))
    setStarAddPlayerId('')
  }

  async function giveStars() {
    if (!starResult) return
    const rows = []
    for (const g of starResult.groups) {
      for (const c of g.candidates) {
        if (c.checked) rows.push({ player_id: c.player_id, player_name: c.name, season: currentSeason, reason: g.reason, note: c.info || null })
      }
    }
    if (rows.length === 0) { alert('지급할 별이 없습니다.'); return }

    const summary = starResult.groups
      .map((g) => {
        const n = g.candidates.filter((c) => c.checked).length
        return n > 0 ? `· ${STAR_REASONS.find((r) => r.key === g.reason)?.label}: ${n}명` : null
      }).filter(Boolean).join('\n')

    if (!window.confirm(`⭐ ${currentSeason} 시즌 별 지급\n\n${summary}\n\n총 ${rows.length}개를 지급할까요?`)) return

    setStarGiving(true)
    const { error } = await supabase.from('player_stars').insert(rows)
    setStarGiving(false)

    if (error) {
      alert('별 지급 실패: ' + error.message)
    } else {
      alert(`✅ 총 ${rows.length}개의 별이 지급되었습니다!\n\n이제 3단계 시즌 전환을 진행하세요.`)
      setStarGiven(true)
      setStarOpen(false)
      setTransitionOpen(true)
    }
  }

  // ── 3단계 ──
  function selectCaptain(idx, playerId) {
    const p = players.find((x) => x.id === playerId)
    setTeamSetups((prev) => prev.map((t, i) => (i === idx ? { ...t, captainId: playerId, teamName: p ? suggestTeamName(p.name) : t.teamName } : t)))
  }

  function updateSetup(idx, field, value) {
    setTeamSetups((prev) => prev.map((t, i) => (i === idx ? { ...t, [field]: value } : t)))
  }

  function isCaptainTaken(pid, cur) {
    return teamSetups.some((t, i) => i !== cur && t.captainId === pid)
  }

  async function runTransition() {
    if (!canEdit) return
    if (!newSeason.trim()) { alert('새 시즌명을 입력해주세요! (예: 2026-06)'); return }
    if (newSeason.trim() === currentSeason) { alert('새 시즌명이 현재 시즌과 같습니다.'); return }
    for (let i = 0; i < 3; i++) {
      if (!teamSetups[i].captainId) { alert(`${i + 1}번째 팀의 주장을 선택해주세요!`); return }
      if (!teamSetups[i].teamName.trim()) { alert(`${i + 1}번째 팀명을 입력해주세요!`); return }
    }
    if (new Set(teamSetups.map((t) => t.captainId)).size !== 3) { alert('주장 3명은 서로 달라야 합니다!'); return }
    const teamNames = teamSetups.map((t) => t.teamName.trim())
    if (new Set(teamNames).size !== 3) { alert('팀명 3개는 서로 달라야 합니다!'); return }

    if (!window.confirm(
      `⚠️ 시즌을 전환합니다.\n\n• 새 시즌: ${newSeason.trim()}\n• 팀: ${teamNames.join(', ')}\n` +
      `• 주장: ${teamSetups.map((t) => players.find((p) => p.id === t.captainId)?.name).join(', ')}\n\n` +
      `모든 선수가 미배정으로 초기화됩니다. 계속할까요?`
    )) return

    setProcessing(true)
    try {
      for (let i = 0; i < 3; i++) {
        const t = teams[i]
        if (!t) continue
        await supabase.from('teams').update({ name: teamSetups[i].teamName.trim(), color: teamSetups[i].color }).eq('id', t.id)
      }
      await supabase.from('profiles').update({ role: 'member' }).eq('role', 'captain')
      await supabase.from('players').update({ current_team: null, is_captain: false }).neq('id', '00000000-0000-0000-0000-000000000000')

      for (let i = 0; i < 3; i++) {
        const cid = teamSetups[i].captainId
        await supabase.from('players').update({ current_team: teamSetups[i].teamName.trim(), is_captain: true }).eq('id', cid)
        const { data: prof } = await supabase.from('profiles').select('id, role').eq('player_id', cid).maybeSingle()
        if (prof && prof.role !== 'admin' && prof.role !== 'executive') {
          await supabase.from('profiles').update({ role: 'captain' }).eq('id', prof.id)
        }
      }
      await supabase.from('app_settings').update({ value: newSeason.trim() }).eq('key', 'season_label')

      alert(`✅ ${newSeason.trim()} 시즌으로 전환되었습니다!\n\n팀명단에서 나머지 선수를 배정해 주세요.`)
      setNewSeason('')
      setTeamSetups([
        { captainId: '', teamName: '', color: '#ffffff' },
        { captainId: '', teamName: '', color: '#1d4ed8' },
        { captainId: '', teamName: '', color: '#eeff00' },
      ])
      setArchiveSaved(false); setSavedArchive(null)
      setStarResult(null); setStarGiven(false)
      setArchiveOpen(true); setStarOpen(false); setTransitionOpen(false)
      init()
    } catch (e) {
      console.error(e)
      alert('전환 중 오류: ' + (e.message || e))
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

  const totalStars = starResult ? starResult.groups.reduce((s, g) => s + g.candidates.filter((c) => c.checked).length, 0) : 0
  const teamNames = teams.map((t) => t.name)
  const selectClass = 'w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500'

  // 🎨 팀 컬러 (흰색은 가독성 위해 밝은 회색으로)
  function teamColorOf(name) {
    const t = teams.find((x) => x.name === name)
    const c = (t?.color || '').toLowerCase()
    if (!c) return '#94a3b8'
    if (c === '#ffffff' || c === '#fff') return '#e2e8f0'
    return c
  }

  // 📊 후보를 팀별 열로 묶기 (등장 순서 = 1위팀 → 2위팀 → 3위팀)
  function groupCandidatesByTeam(candidates) {
    const order = []
    const map = {}
    candidates.forEach((c, i) => {
      const key = c.team || '미배정'
      if (!map[key]) { map[key] = []; order.push(key) }
      map[key].push({ ...c, _idx: i })
    })
    return order.map((t) => ({ team: t, list: map[t] }))
  }

  // 팀명이 헤더로 올라갔으므로 항목에서는 "N위팀 " 접두사 제거
  function shortInfo(info) {
    if (!info) return ''
    return String(info).replace(/^\d+\s*위팀\s*/, '')
  }

  // 열 헤더에 표시할 순위 배지 (베스트 플레이어처럼 teamRank 있는 경우)
  function rankOf(list) {
    const r = list.find((c) => c.teamRank)?.teamRank
    return r || null
  }

  // 단계 헤더 컴포넌트
  function StepHeader({ step, title, desc, done, disabled, open, onToggle, color }) {
    return (
      <button
        onClick={disabled ? undefined : onToggle}
        disabled={disabled}
        className={`w-full flex items-center gap-3 px-4 py-4 text-left transition-colors ${
          disabled ? 'cursor-not-allowed' : 'cursor-pointer hover:brightness-110'
        }`}
        style={{ background: disabled ? 'rgba(51,65,85,0.3)' : `${color}18` }}
      >
        <span
          className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0"
          style={{ background: disabled ? '#475569' : done ? '#10b981' : color, color: '#fff' }}
        >
          {done ? '✓' : step}
        </span>
        <div className="flex-1 min-w-0">
          <p className={`font-bold ${disabled ? 'text-slate-500' : 'text-white'}`}>{title}</p>
          <p className="text-slate-400 text-xs mt-0.5">{desc}</p>
        </div>
        {done && <span className="text-emerald-400 text-xs font-bold flex-shrink-0">완료</span>}
        {disabled && <span className="text-slate-600 text-xs flex-shrink-0">🔒</span>}
        {!disabled && <span className="text-slate-400 flex-shrink-0">{open ? '▲' : '▼'}</span>}
      </button>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-white">🔄 시즌 전환</h1>
        <p className="text-slate-400 mt-1">
          현재 시즌: <span className="text-emerald-400 font-semibold">{currentSeason || '(미설정)'}</span>
          <span className="text-slate-500 text-sm ml-2">· 1 → 2 → 3 순서대로 진행하세요</span>
        </p>
      </div>

      {loading ? (
        <div className="text-center py-20 text-slate-400">⏳ 불러오는 중...</div>
      ) : (
        <>
          {/* ═══ 1단계: 시즌 기록 저장 ═══ */}
          <div className="rounded-2xl border overflow-hidden mb-4" style={{ borderColor: archiveSaved ? 'rgba(16,185,129,0.4)' : 'rgba(59,130,246,0.4)' }}>
            <StepHeader
              step="1" title="🗂️ 시즌 기록 저장"
              desc="우승팀 · 득점왕 · 챔스 기록을 아카이브에 저장합니다"
              done={archiveSaved} disabled={false}
              open={archiveOpen} onToggle={() => setArchiveOpen((v) => !v)}
              color="#3b82f6"
            />

            {archiveOpen && (
              <div className="p-4 bg-slate-900/40 space-y-3">
                {/* 리그 우승팀 */}
                <div className="flex items-center gap-3 py-2 border-b border-slate-700/40">
                  <span className="text-slate-300 text-sm font-medium w-28 flex-shrink-0">🏆 리그 우승팀</span>
                  <span className="text-emerald-400 font-bold">{computed.leagueChampion || '-'}</span>
                </div>

                {/* 득점왕 */}
                <div className="flex items-center gap-3 py-2 border-b border-slate-700/40">
                  <span className="text-slate-300 text-sm font-medium w-28 flex-shrink-0">👟 득점왕</span>
                  <div className="flex-1">
                    {computed.scorerRecords.length === 0 ? (
                      <span className="text-slate-500 text-sm">기록 없음</span>
                    ) : (
                      <select value={topScorerIdx} onChange={(e) => setTopScorerIdx(Number(e.target.value))} className={selectClass}>
                        {computed.scorerRecords.map((s, i) => (
                          <option key={i} value={i}>{s.name} · {s.goals}골 ({s.team})</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                {/* 팀 명단 / 득점기록 요약 */}
                <div className="flex items-center gap-3 py-2 border-b border-slate-700/40">
                  <span className="text-slate-300 text-sm font-medium w-28 flex-shrink-0">👥 팀 명단</span>
                  <span className="text-slate-400 text-sm">
                    {computed.roster.length}팀 · {computed.roster.reduce((s, r) => s + r.players.length, 0)}명
                    <span className="text-slate-600 mx-2">|</span>
                    📋 득점기록 {computed.scorerRecords.length}명
                  </span>
                </div>

                {/* 챔스 우승팀 */}
                <div className="flex items-center gap-3 py-2 border-b border-slate-700/40">
                  <span className="text-slate-300 text-sm font-medium w-28 flex-shrink-0">👑 챔스 우승팀</span>
                  <div className="flex-1">
                    <select value={champsChampion} onChange={(e) => setChampsChampion(e.target.value)} className={selectClass}>
                      <option value="">선택 안 함</option>
                      {teamNames.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                </div>

                {/* 챔스 MVP */}
                <div className="flex items-center gap-3 py-2 border-b border-slate-700/40">
                  <span className="text-slate-300 text-sm font-medium w-28 flex-shrink-0">⭐ 챔스 MVP</span>
                  <div className="flex-1">
                    <select value={champsMvp} onChange={(e) => setChampsMvp(e.target.value)} className={selectClass}>
                      <option value="">선택 안 함</option>
                      {players.map((p) => (
                        <option key={p.id} value={p.name}>{p.name}{p.current_team ? ` (${p.current_team})` : ''}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* 비고 */}
                <div className="flex items-center gap-3 py-2">
                  <span className="text-slate-300 text-sm font-medium w-28 flex-shrink-0">📝 비고</span>
                  <input
                    type="text" value={note} onChange={(e) => setNote(e.target.value)}
                    placeholder="선택 입력"
                    className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <button
                  onClick={saveArchive}
                  disabled={archiveSaving}
                  className="w-full mt-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white py-3 rounded-xl font-bold transition-colors"
                >
                  {archiveSaving ? '저장 중...' : `🗂️ "${currentSeason}" 시즌 기록 저장`}
                </button>
                <p className="text-slate-500 text-xs text-center">※ 같은 시즌이 있으면 덮어씁니다.</p>
              </div>
            )}
          </div>

          {/* ═══ 2단계: 별 지급 ═══ */}
          <div className="rounded-2xl border overflow-hidden mb-4" style={{ borderColor: starGiven ? 'rgba(16,185,129,0.4)' : archiveSaved ? 'rgba(245,158,11,0.4)' : '#334155' }}>
            <StepHeader
              step="2" title="⭐ 별 지급"
              desc={archiveSaved ? '저장된 기록 기준으로 별 대상자를 계산합니다' : '1단계를 먼저 완료해 주세요'}
              done={starGiven} disabled={!archiveSaved}
              open={starOpen} onToggle={() => setStarOpen((v) => !v)}
              color="#f59e0b"
            />

            {starOpen && archiveSaved && (
              <div className="p-4 bg-slate-900/40">
                {!starResult ? (
                  <div className="text-center py-4">
                    <div className="flex flex-wrap justify-center gap-2 mb-4">
                      {STAR_REASONS.map((r) => (
                        <span key={r.key} className="px-2.5 py-1 rounded-lg text-[11px] font-bold" style={{ background: `${r.color}20`, color: r.color }}>
                          {r.label}
                        </span>
                      ))}
                    </div>
                    <p className="text-slate-500 text-xs mb-5">
                      ⚽ 베스트 플레이어는 <b className="text-sky-400">리그 출석률</b>만 사용합니다. (🏆 챔스 제외)
                    </p>
                    <button
                      onClick={calculateStars} disabled={starCalculating}
                      className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-bold px-6 py-3 rounded-xl transition-colors"
                    >
                      {starCalculating ? '계산 중...' : '⭐ 별 자동 계산하기'}
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                      <p className="text-slate-300 text-sm">
                        총 <span className="text-amber-400 font-black text-xl">{totalStars}</span>개 지급 예정
                        <span className="text-slate-500 text-xs ml-2">
                          · ⚽ 리그 {starResult.leagueGames}경기
                          {starResult.champsGames > 0 && ` · 🏆 챔스 ${starResult.champsGames}경기`}
                        </span>
                      </p>
                      <button
                        onClick={calculateStars} disabled={starCalculating}
                        className="text-slate-400 hover:text-white text-xs px-3 py-1.5 rounded-lg border border-slate-600 hover:bg-slate-700"
                      >
                        🔄 다시 계산
                      </button>
                    </div>

                    {/* 사유별 접기/펼치기 */}
                    <div className="space-y-2">
                      {starResult.groups.map((g, gi) => {
                        const info = STAR_REASONS.find((r) => r.key === g.reason) || { label: g.reason, color: '#94a3b8' }
                        const checked = g.candidates.filter((c) => c.checked).length
                        const isOpen = !!expandedGroups[g.reason]
                        const empty = g.candidates.length === 0
                        const teamCols = empty ? [] : groupCandidatesByTeam(g.candidates)
                        const scrollX = teamCols.length > 4

                        return (
                          <div key={g.reason} className="rounded-xl border overflow-hidden" style={{ borderColor: `${info.color}33` }}>
                            <button
                              onClick={() => !empty && toggleGroup(g.reason)}
                              disabled={empty}
                              className={`w-full flex items-center gap-2 px-3 py-2.5 ${empty ? 'cursor-default' : 'hover:brightness-110 cursor-pointer'}`}
                              style={{ background: `${info.color}12` }}
                            >
                              <span className="font-bold text-sm flex-shrink-0" style={{ color: info.color }}>{info.label}</span>
                              <span className="text-slate-500 text-[11px] truncate hidden sm:inline">{g.note}</span>
                              {g.tie && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/25 text-amber-300 flex-shrink-0">⚠️ 동점</span>
                              )}
                              <span className="ml-auto flex items-center gap-2 flex-shrink-0">
                                <span className="text-white text-sm font-bold">{checked}명</span>
                                {!empty && <span className="text-slate-500 text-xs">{isOpen ? '▲' : '▼'}</span>}
                              </span>
                            </button>

                            {/* ✅ 팀별 열(컬럼) 나열 */}
                            {isOpen && !empty && (
                              <div className={`p-2 bg-slate-900/50 ${scrollX ? 'overflow-x-auto' : ''}`}>
                                <div
                                  className="grid gap-2 items-start"
                                  style={{
                                    gridTemplateColumns: scrollX
                                      ? `repeat(${teamCols.length}, minmax(130px, 1fr))`
                                      : `repeat(${teamCols.length}, minmax(0, 1fr))`,
                                    minWidth: scrollX ? `${teamCols.length * 140}px` : undefined,
                                  }}
                                >
                                  {teamCols.map((col) => {
                                    const tc = teamColorOf(col.team)
                                    const colChecked = col.list.filter((c) => c.checked).length
                                    const rk = rankOf(col.list)

                                    return (
                                      <div
                                        key={col.team}
                                        className="rounded-lg border overflow-hidden"
                                        style={{ borderColor: `${tc}40`, background: `${tc}0d` }}
                                      >
                                        {/* 팀 헤더 */}
                                        <div
                                          className="flex items-center justify-center gap-1 px-1.5 py-1.5 border-b"
                                          style={{ borderColor: `${tc}26`, background: `${tc}14` }}
                                        >
                                          {rk && (
                                            <span className="px-1 py-0.5 rounded text-[9px] font-black bg-slate-900/60 text-slate-300 flex-shrink-0">
                                              {rk}위
                                            </span>
                                          )}
                                          <span
                                            className="text-[11px] font-extrabold truncate"
                                            style={{ color: tc }}
                                            title={col.team}
                                          >
                                            {col.team}
                                          </span>
                                          <span className="text-[10px] text-slate-400 flex-shrink-0">({colChecked})</span>
                                        </div>

                                        {/* 선수 목록 (세로) */}
                                        <div className="p-1.5 space-y-1">
                                          {col.list.map((c) => (
                                            <label
                                              key={`${c.player_id}-${c._idx}`}
                                              className={`flex items-center gap-1.5 rounded-md px-1.5 py-1.5 cursor-pointer transition-colors ${
                                                c.checked ? 'bg-slate-700/70' : 'bg-slate-800/40 hover:bg-slate-700/40'
                                              } ${c.tieWarn ? 'ring-1 ring-amber-500/50' : ''}`}
                                            >
                                              <input
                                                type="checkbox" checked={c.checked}
                                                onChange={() => toggleCandidate(gi, c._idx)}
                                                className="w-3.5 h-3.5 accent-amber-500 flex-shrink-0"
                                              />
                                              <span className={`text-xs font-medium truncate ${c.checked ? 'text-white' : 'text-slate-500'}`}>
                                                {c.name}
                                              </span>
                                              <span className="text-slate-500 text-[10px] ml-auto flex-shrink-0">
                                                {shortInfo(c.info)}
                                              </span>
                                            </label>
                                          ))}
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>

                    {/* 수동 추가 */}
                    <div className="mt-4 pt-3 border-t border-slate-700/50 flex flex-wrap gap-2">
                      <select
                        value={starAddPlayerId} onChange={(e) => setStarAddPlayerId(e.target.value)}
                        className="flex-1 min-w-[130px] bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
                      >
                        <option value="">＋ 선수 추가</option>
                        {players.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}{p.current_team ? ` (${p.current_team})` : ''}</option>
                        ))}
                      </select>
                      <select
                        value={starAddReason} onChange={(e) => setStarAddReason(e.target.value)}
                        className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
                      >
                        {STAR_REASONS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                      </select>
                      <button onClick={addCandidate} className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-4 py-2 rounded-lg">추가</button>
                    </div>

                    <button
                      onClick={giveStars} disabled={starGiving || totalStars === 0}
                      className="w-full mt-4 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl transition-colors"
                    >
                      {starGiving ? '지급 중...' : `⭐ 별 ${totalStars}개 지급 확정`}
                    </button>
                    {starGiven && <p className="text-emerald-400 text-xs text-center mt-2">✅ 지급 완료 · 중복 지급 주의</p>}
                  </>
                )}
              </div>
            )}
          </div>

          {/* ═══ 3단계: 시즌 전환 ═══ */}
          <div className="rounded-2xl border overflow-hidden" style={{ borderColor: starGiven ? 'rgba(16,185,129,0.4)' : '#334155' }}>
            <StepHeader
              step="3" title="🔄 시즌 전환 실행"
              desc={starGiven ? '새 시즌 정보를 입력하고 전환합니다' : '2단계를 먼저 완료해 주세요'}
              done={false} disabled={!starGiven}
              open={transitionOpen} onToggle={() => setTransitionOpen((v) => !v)}
              color="#10b981"
            />

            {transitionOpen && starGiven && (
              <div className="p-4 bg-slate-900/40">
                <div className="mb-5">
                  <label className="block text-slate-300 text-sm font-medium mb-1.5">🗓️ 새 시즌명</label>
                  <input
                    type="text" value={newSeason} onChange={(e) => setNewSeason(e.target.value)}
                    placeholder="예: 2026-06"
                    className="w-full sm:max-w-xs bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-6">
                  {teamSetups.map((setup, idx) => (
                    <div key={idx} className="bg-slate-800 border border-slate-700 rounded-2xl p-3 sm:p-5">
                      <div className="flex items-center gap-2 mb-5 pb-4 border-b border-slate-700/50 min-h-[32px]">
                        <span className="inline-block w-5 h-5 rounded-full flex-shrink-0" style={{ background: setup.color, border: '1px solid rgba(255,255,255,0.4)' }}></span>
                        <span className="font-extrabold text-sm truncate" style={{ color: setup.color === '#ffffff' ? '#e2e8f0' : setup.color }}>
                          {setup.teamName || '\u00A0'}
                        </span>
                      </div>

                      <div className="mb-6">
                        <label className="block text-slate-400 text-xs mb-2">👑 주장</label>
                        <select
                          value={setup.captainId} onChange={(e) => selectCaptain(idx, e.target.value)}
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

                      <div>
                        <div className="text-slate-400 text-xs" style={{ marginBottom: '3px' }}>🎨 유니폼 색상</div>
                        <div className="flex items-center" style={{ gap: '16px', paddingLeft: '2px', paddingBottom: '8px' }}>
                          {COLOR_PALETTE.map((c) => {
                            const active = setup.color === c.value
                            return (
                              <button
                                key={c.value} type="button" onClick={() => updateSetup(idx, 'color', c.value)}
                                title={c.name} aria-label={c.name}
                                style={{
                                  width: '20px', height: '20px', borderRadius: '9999px', flexShrink: 0,
                                  background: c.value,
                                  border: active ? '2px solid #34d399' : '1px solid rgba(255,255,255,0.4)',
                                  outline: active ? '2px solid #34d399' : 'none', outlineOffset: '2px',
                                  opacity: active ? 1 : 0.7, cursor: 'pointer', transition: 'opacity 0.15s',
                                }}
                              ></button>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={runTransition} disabled={processing}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-4 rounded-xl font-bold text-lg transition-colors disabled:opacity-40"
                >
                  {processing ? '전환 중...' : '🔄 시즌 전환 실행'}
                </button>
                <p className="text-red-300/70 text-xs mt-2 text-center">
                  ⚠️ 모든 선수가 미배정으로 초기화됩니다. (되돌릴 수 없음)
                </p>
              </div>
            )}
          </div>

          <div style={{ height: '60px', width: '100%' }} aria-hidden="true"></div>
        </>
      )}
    </div>
  )
}

export default SeasonTransition