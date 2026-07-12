import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import rankingBg from '../assets/시즌-순위표.png'

function SeasonRanking() {
  const [matches, setMatches] = useState([])
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [seasonLabel, setSeasonLabel] = useState('26-1')
  const captureRef = useRef(null)
  const headerBoxRef = useRef(null)
  const [imgHeight, setImgHeight] = useState(0)

  // 화면 너비에 맞춰 이미지 컨테이너 높이 계산 (891:640 비율만큼만 잔디 보이게)
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
    fetchMatches()
  }, [])

  async function fetchTeams() {
    const { data } = await supabase.from('teams').select('*').order('display_order')
    setTeams(data || [])
  }

  async function fetchMatches() {
    setLoading(true)
    const { data } = await supabase.from('matches').select('*').order('game_date', { ascending: false })
    setMatches(data || [])
    setLoading(false)
  }

  function getGameDates() {
    return [...new Set(matches.map(m => m.game_date))]
  }

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
          allMatchups.push({
            date,
            teamA: pair.first.team_a,
            teamB: pair.first.team_b,
            totalA: pair.first.score_a + pair.second.score_a,
            totalB: pair.first.score_b + pair.second.score_b,
          })
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

  async function handleCapture() {
    const { default: html2canvas } = await import('html2canvas')
    const canvas = await html2canvas(captureRef.current, { useCORS: true, scale: 2, backgroundColor: '#000' })
    const link = document.createElement('a')
    link.download = `FM FC 시즌${seasonLabel} 순위표.png`
    link.href = canvas.toDataURL()
    link.click()
  }

  const standings = getStandings()

  const columns = '0.5fr 2fr 0.9fr 0.7fr 0.7fr 0.7fr 0.9fr 0.9fr 0.9fr'

  return (
    <div className="max-w-md mx-auto p-4">
      {/* 시즌 라벨 입력 */}
      <div className="flex items-center gap-3 mb-4">
        <label className="text-slate-300 text-sm font-bold">시즌 번호:</label>
        <input
          type="text"
          value={seasonLabel}
          onChange={(e) => setSeasonLabel(e.target.value)}
          className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-1 text-white w-24 text-center focus:outline-none focus:border-emerald-500"
        />
      </div>

      {/* 📸 캡처 영역 */}
      <div
        ref={captureRef}
        style={{
          width: '100%',
          fontFamily: 'pretendard, sans-serif',
          background: '#000',
        }}
      >
        {/* 배경 이미지 컨테이너 (잔디까지만 보이게 잘라냄) + SEASON 겹치기 */}
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
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              display: 'block',
            }}
            crossOrigin="anonymous"
          />

          {/* SEASON 라벨 - 잔디 위 왼쪽 아래에 겹침 */}
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
            const teamColor = team.color || '#ffffff' // 🎨 팀 유니폼 색상
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
                {/* 순위 - 팀 색상 */}
                <span style={{ fontWeight: '900', color: teamColor }}>{idx + 1}</span>
                {/* 팀명 - 팀 색상 */}
                <span style={{ fontWeight: '900', color: teamColor }}>{team.name}</span>
                {/* 승점 - 팀 색상 */}
                <span style={{ textAlign: 'center', fontWeight: '900', color: teamColor }}>{team.points}</span>
                {/* 나머지 스탯 - 팀 색상 */}
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

      {/* 📸 캡처 버튼 */}
      <button
        onClick={handleCapture}
        className="mt-4 w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 rounded-xl text-lg transition-colors"
      >
        📸 순위표 이미지로 저장
      </button>

      <p className="text-center text-slate-500 text-sm mt-2">
        저장된 이미지를 단톡방에 바로 공유하세요! 🚀
      </p>
    </div>
  )
}

export default SeasonRanking