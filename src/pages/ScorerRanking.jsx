import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import scorerBg from '../assets/시즌-득점.png'

function ScorerRanking() {
  const [goals, setGoals] = useState([])
  const [teams, setTeams] = useState([])
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [seasonLabel, setSeasonLabel] = useState('26-1')
  const captureRef = useRef(null)
  const wrapperRef = useRef(null)
  const [scale, setScale] = useState(1)

  // 캡처 영역 고정 크기
  const CAPTURE_WIDTH = 500
  const BG_TOP_HEIGHT = (CAPTURE_WIDTH * 200) / 685   // 상단 로고+타이틀 자리
  const MIN_HEIGHT = (CAPTURE_WIDTH * 960) / 685        // 배경 전체 최소 높이

  useEffect(() => {
    fetchTeams()
    fetchPlayers()
    fetchGoals()
    fetchSeasonLabel()
  }, [])

  // 화면 너비에 맞춰 캡처 영역을 축소해서 "보여주기"만 함 (실제 크기는 고정)
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

  async function fetchSeasonLabel() {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'season_label')
      .single()
    if (data?.value) setSeasonLabel(data.value)
  }

  async function fetchTeams() {
    const { data } = await supabase.from('teams').select('*').order('display_order')
    setTeams(data || [])
  }

  async function fetchPlayers() {
    const { data } = await supabase.from('players').select('*')
    setPlayers(data || [])
  }

  async function fetchGoals() {
    setLoading(true)
    const { data } = await supabase.from('goals').select('*').order('game_date', { ascending: false })
    setGoals(data || [])
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

  function getScorers() {
    const scorers = {}
    for (const g of goals) {
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

  const groupedScorers = getGroupedScorers()

  async function handleCapture() {
    const { default: html2canvas } = await import('html2canvas')
    const canvas = await html2canvas(captureRef.current, { useCORS: true, scale: 2, backgroundColor: '#000' })
    const link = document.createElement('a')
    link.download = `FM FC 시즌${seasonLabel} 득점순위.png`
    link.href = canvas.toDataURL()
    link.click()
  }

  const columns = '0.7fr 1.7fr 2.6fr 0.9fr'

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
          {/* ================= 📸 캡처 영역 (항상 500px 고정) ================= */}
          <div
            ref={captureRef}
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
                    letterSpacing: '-1px',
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
                padding: '11px 3%',
                color: '#ffffff',
                fontWeight: '700',
                fontSize: '18px',
                background: 'rgba(0,0,0,0.75)',
                borderTop: '2px solid rgba(255,255,255,0.6)',
                borderBottom: '2px solid rgba(255,255,255,0.6)',
                textShadow: '1px 1px 3px rgba(0,0,0,1)',
              }}>
                <span style={{ textAlign: 'center' }}>순위</span>
                <span style={{ textAlign: 'center' }}>소속팀</span>
                <span style={{ textAlign: 'center' }}>득점자</span>
                <span style={{ textAlign: 'center' }}>득점</span>
              </div>

              {/* 데이터 행 */}
              {loading ? (
                <div style={{ color: 'white', textAlign: 'center', padding: '20px', background: 'rgba(0,0,0,0.75)' }}>⏳ 로딩 중...</div>
              ) : groupedScorers.length === 0 ? (
                <div style={{ color: 'white', textAlign: 'center', padding: '20px', background: 'rgba(0,0,0,0.75)' }}>골 기록이 없습니다</div>
              ) : (
                groupedScorers.map((group, idx) => {
                  const teamColor = getTeamColor(group.team)
                  return (
                    <div
                      key={`${group.goals}-${group.team}-${idx}`}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: columns,
                        alignItems: 'center',
                        padding: '9px 3%',
                        fontSize: '18px',
                        fontWeight: '600',
                        background: 'rgba(0,0,0,0.75)',
                        borderBottom: '1px solid rgba(255,255,255,0.25)',
                      }}
                    >
                      <span style={{ textAlign: 'center', color: 'white', fontWeight: '700', textShadow: '1px 1px 3px rgba(0,0,0,1)' }}>{group.rank}</span>
                      <span style={{ textAlign: 'center', color: teamColor, fontWeight: '700', textShadow: '1px 1px 4px rgba(0,0,0,1)' }}>{group.team}</span>
                      <span style={{ textAlign: 'center', color: teamColor, fontWeight: '700', textShadow: '1px 1px 4px rgba(0,0,0,1)' }}>{group.names.join(', ')}</span>
                      <span style={{ textAlign: 'center', color: 'white', fontWeight: '600', textShadow: '1px 1px 3px rgba(0,0,0,1)' }}>{group.goals} 골</span>
                    </div>
                  )
                })
              )}

              {/* 하단 여백 */}
              <div style={{ height: '18px' }}></div>
            </div>
          </div>
          {/* ================= 캡처 영역 끝 ================= */}
        </div>
      </div>

      {/* 📸 캡처 버튼 */}
      <button
        onClick={handleCapture}
        className="mt-4 w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 rounded-xl text-lg transition-colors"
      >
        📸 득점순위 이미지로 저장
      </button>

      <p className="text-center text-slate-500 text-sm mt-2">
        저장된 이미지를 단톡방에 바로 공유하세요! 🚀
      </p>
    </div>
  )
}

export default ScorerRanking