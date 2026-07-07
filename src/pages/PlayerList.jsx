import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function PlayerList() {
  const [players, setPlayers] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchPlayers()
  }, [])

  async function fetchPlayers() {
    setLoading(true)
    const { data, error } = await supabase
      .from('players')
      .select('*')
      .order('name')

    if (error) {
      console.error('Error:', error)
    } else {
      setPlayers(data || [])
    }
    setLoading(false)
  }

  async function deletePlayer(id) {
    if (!window.confirm('정말 삭제하시겠습니까?')) return

    const { error } = await supabase
      .from('players')
      .delete()
      .eq('id', id)

    if (!error) {
      fetchPlayers()
    }
  }

  const filtered = players.filter(p =>
    p.name?.includes(search) ||
    p.nickname?.includes(search) ||
    p.position?.includes(search)
  )

  const positionColor = (pos) => {
    switch(pos) {
      case 'GK': return 'bg-yellow-500/20 text-yellow-400'
      case 'DF': return 'bg-blue-500/20 text-blue-400'
      case 'MF': return 'bg-green-500/20 text-green-400'
      case 'FW': return 'bg-red-500/20 text-red-400'
      default: return 'bg-slate-500/20 text-slate-400'
    }
  }

  return (
    <div>
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white">👤 선수 관리</h1>
          <p className="text-slate-400 mt-1">총 {filtered.length}명</p>
        </div>
        <Link
          to="/players/new"
          className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-3 rounded-xl font-semibold transition-colors"
        >
          + 선수 등록
        </Link>
      </div>

      {/* 검색 */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="🔍 이름, 별명, 포지션으로 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
        />
      </div>

      {/* 선수 목록 */}
      {loading ? (
        <div className="text-center py-20 text-slate-400">
          <p className="text-xl">⏳ 로딩 중...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <p className="text-4xl mb-4">⚽</p>
          <p className="text-xl">등록된 선수가 없습니다</p>
          <p className="mt-2">위의 "선수 등록" 버튼을 눌러 선수를 추가하세요!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(player => (
            <div key={player.id} className="bg-slate-800 rounded-xl p-5 border border-slate-700 hover:border-emerald-500/50 transition-colors">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="text-lg font-bold text-white">{player.name}</h3>
                  {player.nickname && (
                    <p className="text-slate-400 text-sm">"{player.nickname}"</p>
                  )}
                </div>
                {player.back_number && (
                  <span className="bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-lg font-bold text-lg">
                    #{player.back_number}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-2 mb-4">
                {player.position && (
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${positionColor(player.position)}`}>
                    {player.position}
                  </span>
                )}
                {player.role && player.role !== '일반' && (
                  <span className="bg-purple-500/20 text-purple-400 px-3 py-1 rounded-full text-sm font-medium">
                    {player.role}
                  </span>
                )}
              </div>

              {player.phone && (
                <p className="text-slate-400 text-sm mb-4">📱 {player.phone}</p>
              )}

              <div className="flex gap-2">
                <Link
                  to={`/players/${player.id}/edit`}
                  className="flex-1 text-center bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg text-sm transition-colors"
                >
                  ✏️ 수정
                </Link>
                <button
                  onClick={() => deletePlayer(player.id)}
                  className="flex-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 py-2 rounded-lg text-sm transition-colors"
                >
                  🗑️ 삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default PlayerList