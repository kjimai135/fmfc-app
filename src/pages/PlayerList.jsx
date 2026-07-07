import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function PlayerList() {
  const [players, setPlayers] = useState([])
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
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

  const filtered = players.filter(p => {
    const matchSearch =
      p.name?.includes(search) ||
      p.address?.includes(search) ||
      p.main_position?.includes(search)
    const matchCategory = filterCategory ? p.category === filterCategory : true
    return matchSearch && matchCategory
  })

  const positionColor = (pos) => {
    switch(pos) {
      case 'GK': return 'bg-yellow-500/20 text-yellow-400'
      case 'DF': return 'bg-blue-500/20 text-blue-400'
      case 'MF': return 'bg-green-500/20 text-green-400'
      case 'FW': return 'bg-red-500/20 text-red-400'
      default: return 'bg-slate-500/20 text-slate-400'
    }
  }

  const categoryColor = (cat) => {
    switch(cat) {
      case '정회원': return 'bg-emerald-500/20 text-emerald-400'
      case '예비회원': return 'bg-orange-500/20 text-orange-400'
      case '임원': return 'bg-purple-500/20 text-purple-400'
      default: return 'bg-slate-500/20 text-slate-400'
    }
  }

  const currentYear = new Date().getFullYear()

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

      {/* 검색 & 필터 */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <input
          type="text"
          placeholder="🔍 이름, 주소, 포지션으로 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
        />
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500"
        >
          <option value="">전체 카테고리</option>
          <option value="정회원">정회원</option>
          <option value="예비회원">예비회원</option>
          <option value="임원">임원</option>
        </select>
      </div>

      {/* 선수 목록 - 테이블 형태 */}
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
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-800/80">
                <th className="px-4 py-3 text-slate-400 text-sm font-medium">카테고리</th>
                <th className="px-4 py-3 text-slate-400 text-sm font-medium">이름</th>
                <th className="px-4 py-3 text-slate-400 text-sm font-medium">주소</th>
                <th className="px-4 py-3 text-slate-400 text-sm font-medium">나이</th>
                <th className="px-4 py-3 text-slate-400 text-sm font-medium">주포지션</th>
                <th className="px-4 py-3 text-slate-400 text-sm font-medium">가입연월</th>
                <th className="px-4 py-3 text-slate-400 text-sm font-medium">연락처</th>
                <th className="px-4 py-3 text-slate-400 text-sm font-medium text-center">관리</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(player => (
                <tr key={player.id} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors">
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${categoryColor(player.category)}`}>
                      {player.category || '-'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-white font-medium">{player.name}</td>
                  <td className="px-4 py-3 text-slate-300 text-sm">{player.address || '-'}</td>
                  <td className="px-4 py-3 text-slate-300 text-sm">
                    {player.birth_year ? `${player.birth_year}년 (${currentYear - player.birth_year}세)` : '-'}
                  </td>
                  <td className="px-4 py-3">
                    {player.main_position ? (
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${positionColor(player.main_position)}`}>
                        {player.main_position}
                      </span>
                    ) : '-'}
                  </td>
                  <td className="px-4 py-3 text-slate-300 text-sm">{player.join_date || '-'}</td>
                  <td className="px-4 py-3 text-slate-300 text-sm">{player.phone || '-'}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-center">
                      <Link
                        to={`/players/${player.id}/edit`}
                        className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-1 rounded-lg text-xs transition-colors"
                      >
                        ✏️
                      </Link>
                      <button
                        onClick={() => deletePlayer(player.id)}
                        className="bg-red-500/10 hover:bg-red-500/20 text-red-400 px-3 py-1 rounded-lg text-xs transition-colors"
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default PlayerList