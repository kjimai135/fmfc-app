import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import scorerBg from '../assets/시즌-득점.png'

// "7시", "20시-22시" 등에서 시작 시각(시)만 추출
function parseStartHour(timeStr) {
  if (!timeStr) return null
  const m = String(timeStr).match(/\d{1,2}/)
  if (!m) return null
  let h = parseInt(m[0], 10)
  if (isNaN(h) || h < 0 || h > 23) return null
  return h
}

function ScorerRanking() {
  const [goals, setGoals] = useState([])
  const [teams, setTeams] = useState([])
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [seasonLabel, setSeasonLabel] = useState('')
  const wrapperRef = useRef(null)
  const [scale, setScale] = useState(1)

  // 캡처 영역 고정 크기
  const CAPTURE_WIDTH = 500
  const BG_TOP_HEIGHT = (CAPTURE_WIDTH * 200) / 685   // 상단 로고+타이틀 자리
  const MIN_HEIGHT = (CAPTURE_WIDTH * 960) / 685        // 배경 전체 최소 높이

  // ✅ 타이틀 자간
  const TITLE_LETTER_SPACING = '1px'

  // ✅ 행 관련 조절 값 (여기 숫자만 바꾸면 간격/크기 조정됨)
  const ROW_PADDING = '6px 3%'   // 각 행 위아래 여백 (작을수록 줄 간격 좁아짐)
  const ROW_FONT_SIZE = '16px'   // 행 글자 크기
  const HEADER_FONT_SIZE = '16px' // 헤더 글자 크기

  useEffect(() => {
    fetchTeams()
    fetchPlayers()
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 화면 너비에 맞춰 영역을 축소해서 "보여주기"만 함 (실제 크기는 고정)
  useEffect(() => {
    function updateScale() {
      if (wrapperRef.current) {
        const availWidth = wrapperRef.current.offsetWidth
        setScale(Math.min(1, availWidth / CAPTURE_WIDTH))
      }
    }
    updateScale()
    window.addEventListener('resize', updateScale)
    return () => window.removeEventListener('resize', updateScale)
  }, [])

  // 🗓️ 현재 시즌을 먼저 읽고, 그 시즌 골만 로드
  async function init() {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'season_label')
      .single()
    const season = data?.value || ''
    setSeasonLabel(season)
    fetchGoals(season)
  }

  async function fetchTeams() {
    const { data } = await supabase.from('teams').select('*').order('display_order')
    setTeams(data || [])
  }

  async function fetchPlayers() {
    const { data } = await supabase.from('players').select('*')
    setPlayers(data || [])
  }

  // ✅ 현재 시즌 + 조회 시각 기준 "이미 시작한 경기"의 골만 반영
  async function fetchGoals(season) {
    setLoading(true)

    const now = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    const todayKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`

    // 1) 현재 시즌 골만 조회
    let query = supabase.from('goals').select('*').order('game_date', { ascending: false })
    if (season) query = query.eq('season', season)
    const { data: goalData } = await query

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
    const past = (goalData || []).filter((g) => {
      const d = g.game_date
      if (d < todayKey) return true
      if (d > todayKey) return false
      const startHour = startHourByDate[d]
      if (startHour === undefined || startHour === null) return true
      return now.getHours() >= startHour
    })

    setGoals(past)
    setLoading(false)
  }

  function getTeamColor(teamName) {
    const team = teams.find(t => t.name === teamName)
    const color = team?.color || '#ffffff'
    const c = color.toLowerCase()
    if (c === '#1d4ed8' || c === '#2563eb' || c === '#1e40af' || c === '#1e3a8a') {
      return '#60a5fa'
    }
    return color
  }

  function getPlayerTeam(playerId, fallbackTeam) {
    const player = players.find(p => p.id === playerId)
    return player?.current_team || fallbackTeam || '미배정'
  }

  // ✅ 득점왕 순위 집계에서 제외할 골인지 판별 (PK/자책골 등 특수골)
  function isSpecialGoal(g) {
    if (!g.player_id) return true // player_id 없는 골(PK·자책골)은 제외
    const name = g.player_name
    if (name === 'PK(핸디캡)' || name === 'PK' || name === '자책골') return true
    return false
  }

  function getScorers() {
    const scorers = {}
    for (const g of goals) {
      // 🚫 PK(핸디캡)·자책골 등 특수골은 득점순위 집계에서 제외
      if (isSpecialGoal(g)) continue

      if (!scorers[g.player_id]) {
        scorers[g.player_id] = {
          player_id: g.player_id,
          player_name: g.player_name,
          team: getPlayerTeam(g.player_id, g.team),
          goals: 0,
        }
      }
      scorers[g.player_id].goals++
    }
    const sorted = Object.values(scorers).sort((a, b) => b.goals - a.goals)
    let lastGoals = null
    let lastRank = 0
    sorted.forEach((s, idx) => {
      if (s.goals !== lastGoals) {
        lastRank = idx + 1
        lastGoals = s.goals
      }
      s.rank = lastRank
    })
    return sorted
  }

  function getGroupedScorers() {
    const scorers = getScorers()
    const groups = {}
    for (const s of scorers) {
      const key = `${s.goals}__${s.team}`
      if (!groups[key]) {
        groups[key] = { rank: s.rank, goals: s.goals, team: s.team, names: [] }
      }
      groups[key].names.push(s.player_name)
    }
    return Object.values(groups).sort((a, b) => {
      if (b.goals !== a.goals) return b.goals - a.goals
      return a.team.localeCompare(b.team)
    })
  }

  // 이름 배열을 3명씩 묶기
  function chunkNames(names, size = 3) {
    const rows = []
    for (let i = 0; i < names.length; i += size) {
      rows.push(names.slice(i, i + size))
    }
    return rows
  }

  const groupedScorers = getGroupedScorers()

  const columns = '0.7fr 1.7fr 2.6fr 0.9fr'

  // ✅ 각 셀 공통 스타일 (세로/가로 중앙 정렬)
  const cellStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
  }

  return (
    <div className="max-w-md mx-auto p-4">
      {/* 화면 표시용 래퍼 (축소해서 보여주기) */}
      <div ref={wrapperRef} style={{ width: '100%' }}>
        <div style={{
          width: `${CAPTURE_WIDTH}px`,
          height: `${MIN_HEIGHT}px`,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          marginBottom: `${MIN_HEIGHT * (scale - 1)}px`, // 축소된 만큼 아래 공간 보정
        }}>
          {/* ================= 표시 영역 (항상 500px 고정) ================= */}
          <div
            style={{
              position: 'relative',
              width: `${CAPTURE_WIDTH}px`,
              minHeight: `${MIN_HEIGHT}px`,
              fontFamily: 'pretendard, sans-serif',
              overflow: 'hidden',
              background: '#0a1929',
            }}
          >
            {/* 배경 이미지 */}
            <img
              src={scorerBg}
              alt="background"
              crossOrigin="anonymous"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: 'top center',
                zIndex: 0,
              }}
            />

            {/* 컨텐츠 (배경 위) */}
            <div style={{ position: 'relative', zIndex: 1 }}>
              {/* 상단 로고 + 타이틀 자리 */}
              <div style={{
                width: '100%',
                height: `${BG_TOP_HEIGHT}px`,
                position: 'relative',
              }}>
                {/* SEASON 타이틀 (고정 크기) */}
                <div style={{
                  position: 'absolute',
                  top: '56%',
                  left: 0,
                  right: 0,
                  textAlign: 'center',
                }}>
                  <span style={{
                    color: '#1e3a8a',
                    fontSize: '30px',
                    fontWeight: '900',
                    fontStyle: 'normal',
                    letterSpacing: TITLE_LETTER_SPACING,
                    whiteSpace: 'nowrap',
                    WebkitTextStroke: '4px #ffffff',
                    paintOrder: 'stroke fill',
                    textShadow: '0 0 6px rgba(255,255,255,0.5), 2px 2px 5px rgba(0,0,0,0.5)',
                  }}>
                    SEASON {seasonLabel} 득점순위
                  </span>
                </div>
              </div>

              {/* 표 헤더 */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: columns,
                alignItems: 'center',
                padding: '9px 3%',
                color: '#ffffff',
                fontWeight: '700',
                fontSize: HEADER_FONT_SIZE,
                background: 'rgba(0,0,0,0.75)',
                borderTop: '2px solid rgba(255,255,255,0.6)',
                borderBottom: '2px solid rgba(255,255,255,0.6)',
                textShadow: '1px 1px 3px rgba(0,0,0,1)',
              }}>
                <span style={cellStyle}>순위</span>
                <span style={cellStyle}>소속팀</span>
                <span style={cellStyle}>득점자</span>
                <span style={cellStyle}>득점</span>
              </div>

              {/* 데이터 행 */}
              {loading ? (
                <div style={{ color: 'white', textAlign: 'center', padding: '20px', background: 'rgba(0,0,0,0.75)' }}>⏳ 로딩 중...</div>
              ) : groupedScorers.length === 0 ? (
                <div style={{ color: 'white', textAlign: 'center', padding: '20px', background: 'rgba(0,0,0,0.75)' }}>골 기록이 없습니다</div>
              ) : (
                groupedScorers.map((group, idx) => {
                  const teamColor = getTeamColor(group.team)
                  const nameRows = chunkNames(group.names, 3)
                  return (
                    <div
                      key={`${group.goals}-${group.team}-${idx}`}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: columns,
                        alignItems: 'center',
                        padding: ROW_PADDING,
                        fontSize: ROW_FONT_SIZE,
                        fontWeight: '600',
                        background: 'rgba(0,0,0,0.75)',
                        borderBottom: '1px solid rgba(255,255,255,0.25)',
                      }}
                    >
                      <span style={{ ...cellStyle, color: 'white', fontWeight: '700', textShadow: '1px 1px 3px rgba(0,0,0,1)' }}>{group.rank}</span>
                      <span style={{ ...cellStyle, color: teamColor, fontWeight: '700', textShadow: '1px 1px 4px rgba(0,0,0,1)' }}>{group.team}</span>
                      <span style={{
                        ...cellStyle,
                        flexDirection: 'column',
                        color: teamColor,
                        fontWeight: '700',
                        textShadow: '1px 1px 4px rgba(0,0,0,1)',
                        wordBreak: 'keep-all',
                        lineHeight: 1.3,
                        letterSpacing: '0.3px',
                      }}>
                        {nameRows.map((row, rowIdx) => (
                          <span key={rowIdx} style={{ display: 'block', whiteSpace: 'nowrap' }}>
                            {row.map((name, nameIdx) => {
                              const isLastNameOfAll =
                                rowIdx === nameRows.length - 1 && nameIdx === row.length - 1
                              return (
                                <span key={nameIdx} style={{ display: 'inline-block' }}>
                                  {name}
                                  {!isLastNameOfAll && (
                                    <span style={{ display: 'inline-block', width: '0.55em' }}>,</span>
                                  )}
                                </span>
                              )
                            })}
                          </span>
                        ))}
                      </span>
                      <span style={{ ...cellStyle, color: 'white', fontWeight: '600', textShadow: '1px 1px 3px rgba(0,0,0,1)' }}>{group.goals} 골</span>
                    </div>
                  )
                })
              )}

              {/* 하단 여백 */}
              <div style={{ height: '18px' }}></div>
            </div>
          </div>
          {/* ================= 표시 영역 끝 ================= */}
        </div>
      </div>
    </div>
  )
}

export default ScorerRanking