import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function PollVote() {
  const { id } = useParams()
  const [poll, setPoll] = useState(null)
  const [responses, setResponses] = useState([])
  const [players, setPlayers] = useState([])
  const [teams, setTeams] = useState([])
  const [selectedPlayer, setSelectedPlayer] = useState('')
  const [selectedResponse, setSelectedResponse] = useState('참석')
  const [selectedTeam, setSelectedTeam] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)

  const now = new Date()

  useEffect(() => {
    fetchPoll()
    fetchResponses()
    fetchPlayers()
    fetchTeams()
  }, [id])

  async function fetchPoll() {
    const { data } = await supabase
      .from('polls')
      .select('*')
      .eq('id', id)
      .single()
    setPoll(data)
  }

  async function fetchResponses() {
    const { data } = await supabase
      .from('poll_responses')
      .select('*')
      .eq('poll_id', id)
      .order('responded_at')
    setResponses(data || [])
  }

  async function fetchPlayers() {
    const { data } = await supabase
      .from('players')
      .select('*')
      .order('name')
    setPlayers(data || [])
  }

  async function fetchTeams() {
    const { data } = await supabase
      .from('teams')
      .select('*')
      .order('display_order')
    setTeams(data || [])
  }

  async function handleVote() {
    if (!selectedPlayer || !selectedTeam) {
      alert('이름과 팀을 선택해주세요!')
      return
    }

    const already = responses.find(r => r.player_id === selectedPlayer)
    if (already) {
      alert('이미 투표하셨습니다!')
      return
    }

    const player = players.find(p => p.id === selectedPlayer)

    setLoading(true)
    const { error } = await supabase
      .from('poll_responses')
      .insert([{
        poll_id: id,
        player_id: selectedPlayer,
        player_name: player.name,
        response: selectedResponse,
        team: selectedTeam,
      }])

    if (error) {
      alert('오류가 발생했습니다: ' + error.message)
    } else {
      setSelectedPlayer('')
      setSearch('')
      setSelectedResponse('참석')
      setSelectedTeam('')
      fetchResponses()
    }
    setLoading(false)
  }

  async function handleDelete(responseId) {
    if (!window.confirm('투표를 취소하시겠습니까?')) return
    await supabase.from('poll_responses').delete().eq('id', responseId)
    fetchResponses()
  }

  if (!poll) {
    return <div className="text-center py-20 text-slate-400">⏳ 로딩 중...</div>
  }

  const isExpired = new Date(poll.deadline) < now
  const votedPlayerIds = responses.map(r => r.player_id)
  const filteredPlayers = players.filter(p =>
    p.name?.includes(search) && !votedPlayerIds.includes(p.id)
  )

  const attendList = responses.filter(r => r.response === '참석')
  const earlyLeaveList = responses.filter(r => r.response === '조퇴')
  const absentList = responses.filter(r => r.response === '불참')

  const teamColors = ['bg-blue-500/20 text-blue-400 border-blue-500/30', 'bg-green-500/20 text-green-400 border-green-500/30', 'bg-red-500/20 text-red-400 border-red-500/30', 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', 'bg-purple-500/20 text-purple-400 border-purple-500/30']
  const teamEmojis = ['⚪', '⚫', '🟡', '🔵', '🟣']

  const getTeamColor = (teamName) => {
    const idx = teams.findIndex(t => t.name === teamName)
    return teamColors[idx] || 'bg-slate-500/20 text-slate-400'
  }

  const getTeamEmoji = (teamName) => {
    const idx = teams.findIndex(t => t.name === teamName)
    return teamEmojis[idx] || '⚪'
  }

  const renderTeamSection = (title, icon, list, borderColor, bgColor, textColor) => (
    <div className={`bg-slate-800 rounded-xl border ${borderColor} overflow-hidden mb-6`}>
      <div className={`px-4 py-3 ${bgColor} font-bold ${textColor} flex justify-between`}>
        <span>{icon} {title} ({list.length}명)</span>
      </div>

      {list.length === 0 ? (
        <p className="px-4 py-3 text-slate-500 text-sm">아직 없음</p>
      ) : (
        teams.map(team => {
          const teamList = list.filter(r => r.team === team.name)
          if (teamList.length === 0) return null

          return (
            <div key={team.id}>
              <div className={`px-4 py-2 bg-slate-700/30 text-sm font-medium text-slate-300`}>
                {getTeamEmoji(team.name)} {team.name} ({teamList.length}명)
              </div>
              <div className="divide-y divide-slate-700/30">
                {teamList.map(r => (
                  <div key={r.id} className="px-6 py-2 flex justify-between items-center">
                    <span className="text-white text-sm">{r.player_name}</span>
                    {!isExpired && (
                      <button
                        onClick={() => handleDelete(r.id)}
                        className="text-red-400 hover:text-red-300 text-xs"
                      >
                        취소
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        })
      )}

      {/* 팀 미선택 응답 */}
      {list.filter(r => !r.team).length > 0 && (
        <>
          <div className="px-4 py-2 bg-slate-700/30 text-sm font-medium text-slate-400">
            ⚪ 팀 미지정 ({list.filter(r => !r.team).length}명)
          </div>
          <div className="divide-y divide-slate-700/30">
            {list.filter(r => !r.team).map(r => (
              <div key={r.id} className="px-6 py-2 flex justify-between items-center">
                <span className="text-white text-sm">{r.player_name}</span>
                {!isExpired && (
                  <button
                    onClick={() => handleDelete(r.id)}
                    className="text-red-400 hover:text-red-300 text-xs"
                  >
                    취소
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )

  return (
    <div>
      {/* 헤더 */}
      <div className="mb-6">
        <Link to="/polls" className="text-slate-400 hover:text-white text-sm mb-2 inline-block">
          ← 투표 목록으로
        </Link>
        <h1 className="text-3xl font-bold text-white">⚽ {poll.game_date} 경기</h1>
        {poll.location && (
          <p className="text-slate-400 mt-1">📍 {poll.location}</p>
        )}
        <div className="flex items-center gap-3 mt-2">
          <p className="text-slate-500 text-sm">
            ⏰ 마감: {new Date(poll.deadline).toLocaleString('ko-KR')}
          </p>
          {isExpired ? (
            <span className="bg-red-500/20 text-red-400 px-3 py-1 rounded-full text-xs font-medium">마감</span>
          ) : (
            <span className="bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full text-xs font-medium">진행 중</span>
          )}
        </div>
      </div>

      {/* 투표 폼 (마감 전에만) */}
      {!isExpired && (
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 mb-8">
          <h2 className="text-lg font-bold text-white mb-4">🗳️ 투표하기</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            {/* 이름 검색 */}
            <div>
              <label className="block text-slate-300 text-sm font-medium mb-2">이름 *</label>
              <input
                type="text"
                placeholder="🔍 이름 검색..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setSelectedPlayer('')
                }}
                className="w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 mb-2"
              />
              {search && (
                <div className="bg-slate-700 rounded-xl border border-slate-600 max-h-40 overflow-y-auto">
                  {filteredPlayers.map(player => (
                    <button
                      key={player.id}
                      onClick={() => {
                        setSelectedPlayer(player.id)
                        setSearch(player.name)
                      }}
                      className={`w-full text-left px-4 py-2 hover:bg-slate-600 transition-colors ${
                        selectedPlayer === player.id ? 'bg-emerald-500/20 text-emerald-400' : 'text-white'
                      }`}
                    >
                      {player.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 팀 선택 */}
            <div>
              <label className="block text-slate-300 text-sm font-medium mb-2">팀 *</label>
              <select
                value={selectedTeam}
                onChange={(e) => setSelectedTeam(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="">팀 선택</option>
                {teams.map(team => (
                  <option key={team.id} value={team.name}>{team.name}</option>
                ))}
              </select>
            </div>

            {/* 응답 선택 */}
            <div>
              <label className="block text-slate-300 text-sm font-medium mb-2">참석 여부 *</label>
              <select
                value={selectedResponse}
                onChange={(e) => setSelectedResponse(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="참석">✅ 참석</option>
                <option value="불참">❌ 불참</option>
                <option value="조퇴">🏃 조퇴</option>
              </select>
            </div>

            {/* 투표 버튼 */}
            <div className="flex items-end">
              <button
                onClick={handleVote}
                disabled={loading || !selectedPlayer || !selectedTeam}
                className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white py-3 rounded-xl font-semibold transition-colors"
              >
                {loading ? '등록 중...' : '🗳️ 투표하기'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 요약 카드 */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-emerald-400">{attendList.length}</p>
          <p className="text-slate-400 text-sm">✅ 참석</p>
        </div>
        <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-orange-400">{earlyLeaveList.length}</p>
          <p className="text-slate-400 text-sm">🏃 조퇴</p>
        </div>
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-red-400">{absentList.length}</p>
          <p className="text-slate-400 text-sm">❌ 불참</p>
        </div>
      </div>

      {/* 팀별 명단 - 참석 → 조퇴 → 불참 순 */}
      {renderTeamSection('참석', '✅', attendList, 'border-emerald-500/30', 'bg-emerald-500/10', 'text-emerald-400')}
      {renderTeamSection('조퇴', '🏃', earlyLeaveList, 'border-orange-500/30', 'bg-orange-500/10', 'text-orange-400')}
      {renderTeamSection('불참', '❌', absentList, 'border-red-500/30', 'bg-red-500/10', 'text-red-400')}
    </div>
  )
}

export default PollVote