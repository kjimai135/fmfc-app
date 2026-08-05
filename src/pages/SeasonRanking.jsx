import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import rankingBg from '../assets/시즌-순위표.png'

// "7시", "20시-22시" 등에서 시작 시각(시)만 추출
function parseStartHour(timeStr) {
  if (!timeStr) return null
  const m = String(timeStr).match(/\d{1,2}/)
  if (!m) return null
  let h = parseInt(m[0], 10)
  if (isNaN(h) || h < 0 || h > 23) return null
  return h
}

function SeasonRanking() {
  const [matches, setMatches] = useState([])
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [seasonLabel, setSeasonLabel] = useState('') // 🗓️ 팀명단에서 설정한 시즌 번호
  const headerBoxRef = useRef(null)
  const [imgHeight, setImgHeight] = useState(0)

  useEffect(() => {
    function updateHeight() {
      if (headerBoxRef.current) {
        const width = headerBoxRef.current.offsetWidth
        setImgHeight((width * 640) / 891)
      }
    }
    updateHeight()
    window.addEventListener('resize', updateHeight)
    return () => window.removeEventListener('resize', updateHeight)
  }, [])

  useEffect(() => {
    fetchTeams()
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 🗓️ 현재 시즌을 먼저 읽고, 그 시즌 경기만 로드
  async function init() {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'season_label')
      .single()
    const season = data?.value || ''
    setSeasonLabel(season)
    fetchMatches(season)
  }

  async function fetchTeams() {
    const { data } = await supabase.from('teams').select('*').order('display_order')
    setTeams(data || [])
  }

  // ✅ 현재 시즌 + 조회 시각 기준 "이미 시작한 경기"만 반영
  async function fetchMatches(season) {
    setLoading(true)

    const now = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    const todayKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`

    // 1) 현재 시즌 경기만 조회
    let query = supabase.from('matches').select('*').order('game_date', { ascending: false })
    if (season) query = query.eq('season', season)
    const { data: matchData } = await query

    // 2) 예약(시작 시각) 조회 → 날짜별 시작 시각 맵
    const { data: resvData } = await supabase
      .from('reservations')
      .select('date, time, is_confirmed, sort_order')

    const startHourByDate = {}
    for (const r of (resvData || [])) {
      if (startHourByDate[r.date] === undefined || r.is_confirmed) {
        const h = parseStartHour(r.time)
        if (h !== null) startHourByDate[r.date] = h
      }
    }

    // 3) 미래 경기(아직 시작 안 한 날짜) 제외
    const past = (matchData || []).filter((m) => {
      const d = m.game_date
      if (d < todayKey) return true
      if (d > todayKey) return false
      const startHour = startHourByDate[d]
      if (startHour === undefined || startHour === null) return true
      return now.getHours() >= startHour
    })

    setMatches(past)
    setLoading(false)
  }

  function getGameDates() {
    return [...new Set(matches.map(m => m.game_date))]
  }

  // 대진별 합산 - 팀 이름 기준으로 정확히 합산!
  function getMatchups() {
    const dates = getGameDates()
    const allMatchups = []
    for (const date of dates) {
      const dayMatches = matches.filter(m => m.game_date === date).sort((a, b) => a.match_number - b.match_number)
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

          allMatchups.push({ date, teamA, teamB, totalA, totalB })
        }
      }
    }
    return allMatchups
  }

  function getStandings() {
    const matchups = getMatchups()
    const standings = {}
    for (const team of teams) {
      standings[team.name] = { name: team.name, color: team.color || '#ffffff', played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, points: 0 }
    }
    for (const m of matchups) {
      if (!standings[m.teamA] || !standings[m.teamB]) continue
      standings[m.teamA].played++; standings[m.teamB].played++
      standings[m.teamA].goalsFor += m.totalA; standings[m.teamA].goalsAgainst += m.totalB
      standings[m.teamB].goalsFor += m.totalB; standings[m.teamB].goalsAgainst += m.totalA
      if (m.totalA > m.totalB) { standings[m.teamA].wins++; standings[m.teamA].points += 3; standings[m.teamB].losses++ }
      else if (m.totalA < m.totalB) { standings[m.teamB].wins++; standings[m.teamB].points += 3; standings[m.teamA].losses++ }
      else { standings[m.teamA].draws++; standings[m.teamA].points += 1; standings[m.teamB].draws++; standings[m.teamB].points += 1 }
    }
    return Object.values(standings).sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points
      const gdA = a.goalsFor - a.goalsAgainst, gdB = b.goalsFor - b.goalsAgainst
      if (gdB !== gdA) return gdB - gdA
      return b.goalsFor - a.goalsFor
    })
  }

  const standings = getStandings()

  const columns = '0.5fr 2fr 0.9fr 0.7fr 0.7fr 0.7fr 0.9fr 0.9fr 0.9fr'

  return (
    <div className="max-w-md mx-auto p-4">
      {/* 표시 영역 */}
      <div
        style={{
          width: '100%',
          fontFamily: 'pretendard, sans-serif',
          background: '#000',
        }}
      >
        {/* 배경 이미지 컨테이너 + 시즌 번호 겹치기 (번호는 팀명단 값에서 가져옴) */}
        <div
          ref={headerBoxRef}
          style={{
            position: 'relative',
            width: '100%',
            height: `${imgHeight}px`,
            overflow: 'hidden',
          }}
        >
          <img
            src={rankingBg}
            alt="header"
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', display: 'block' }}
            crossOrigin="anonymous"
          />
          <div style={{
            position: 'absolute',
            bottom: '12px',
            left: '4%',
            color: 'white',
            fontSize: 'clamp(18px, 5vw, 30px)',
            fontWeight: '900',
            fontStyle: 'italic',
            letterSpacing: '1px',
            lineHeight: 1,
            textShadow: '2px 2px 5px rgba(0,0,0,0.9)',
          }}>
            SEASON {seasonLabel}
          </div>
        </div>

        {/* 표 헤더 */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: columns,
          alignItems: 'center',
          padding: '18px 4%',
          background: '#000',
          color: '#e5e5e5',
          fontWeight: '800',
          fontSize: 'clamp(12px, 3.2vw, 20px)',
        }}>
          <span></span>
          <span>TEAM</span>
          <span style={{ textAlign: 'center' }}>승점</span>
          <span style={{ textAlign: 'center' }}>승</span>
          <span style={{ textAlign: 'center' }}>무</span>
          <span style={{ textAlign: 'center' }}>패</span>
          <span style={{ textAlign: 'center' }}>득점</span>
          <span style={{ textAlign: 'center' }}>실점</span>
          <span style={{ textAlign: 'center' }}>득실</span>
        </div>

        {/* 데이터 행 */}
        {loading ? (
          <div style={{ background: '#000', color: 'white', textAlign: 'center', padding: '30px' }}>⏳ 로딩 중...</div>
        ) : (
          standings.map((team, idx) => {
            const gd = team.goalsFor - team.goalsAgainst
            const teamColor = team.color || '#ffffff'
            return (
              <div
                key={team.name}
                style={{
                  display: 'grid',
                  gridTemplateColumns: columns,
                  alignItems: 'center',
                  padding: '22px 4%',
                  color: teamColor,
                  fontSize: 'clamp(14px, 3.6vw, 22px)',
                  fontWeight: 'bold',
                  background: idx % 2 === 0 ? '#666666' : '#000000',
                }}
              >
                <span style={{ fontWeight: '900', color: teamColor }}>{idx + 1}</span>
                <span style={{ fontWeight: '900', color: teamColor }}>{team.name}</span>
                <span style={{ textAlign: 'center', fontWeight: '900', color: teamColor }}>{team.points}</span>
                <span style={{ textAlign: 'center', color: teamColor }}>{team.wins}</span>
                <span style={{ textAlign: 'center', color: teamColor }}>{team.draws}</span>
                <span style={{ textAlign: 'center', color: teamColor }}>{team.losses}</span>
                <span style={{ textAlign: 'center', color: teamColor }}>{team.goalsFor}</span>
                <span style={{ textAlign: 'center', color: teamColor }}>{team.goalsAgainst}</span>
                <span style={{ textAlign: 'center', color: teamColor }}>{gd > 0 ? '+ ' : gd < 0 ? '- ' : ''}{Math.abs(gd)}</span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

export default SeasonRanking