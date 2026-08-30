import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

function PollCreate() {
  const navigate = useNavigate()
  const { role } = useAuth()
  // 🔑 수동 투표 생성 권한: 관리자·임원만
  const canManagePolls = role === 'admin' || role === 'executive'

  const [gameDate, setGameDate] = useState('')
  const [gameTime, setGameTime] = useState('')
  const [location, setLocation] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canManagePolls) return // 🔒 이중 차단

    if (!gameDate) {
      alert('경기 날짜를 선택해주세요!')
      return
    }

    setLoading(true)

    const { error } = await supabase
      .from('polls')
      .insert([{
        game_date: gameDate,
        game_time: gameTime,
        location: location,
      }])

    setLoading(false)

    if (error) {
      alert('오류가 발생했습니다: ' + error.message)
    } else {
      navigate('/polls')
    }
  }

  // 🔒 권한 없는 사용자는 접근 차단
  if (!canManagePolls) {
    return (
      <div className="max-w-xl mx-auto text-center py-20">
        <p className="text-5xl mb-4">🔒</p>
        <h2 className="text-xl font-bold text-white mb-2">접근 권한이 없습니다</h2>
        <p className="text-slate-400 mb-6">투표 생성은 관리자·임원만 가능합니다.</p>
        <button
          onClick={() => navigate('/polls')}
          className="bg-slate-700 hover:bg-slate-600 text-white px-6 py-3 rounded-xl font-semibold transition-colors"
        >
          ↩️ 투표 목록으로
        </button>
      </div>
    )
  }

  const inputStyle = "w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500"
  const labelStyle = "block text-slate-300 text-sm font-medium mb-2"

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-3xl font-bold text-white mb-8">🗳️ 새 경기 만들기</h1>

      <form onSubmit={handleSubmit} className="bg-slate-800 rounded-xl p-6 border border-slate-700">
        <div className="space-y-6">
          {/* 경기 날짜 */}
          <div>
            <label className={labelStyle}>경기 날짜 *</label>
            <input
              type="date"
              value={gameDate}
              onChange={(e) => setGameDate(e.target.value)}
              className={`${inputStyle} date-input-white`}
              max="9999-12-31"
              required
            />
          </div>

          {/* 경기 시간 */}
          <div>
            <label className={labelStyle}>경기 시간</label>
            <input
              type="text"
              value={gameTime}
              onChange={(e) => setGameTime(e.target.value)}
              placeholder="예: 20시"
              className={inputStyle}
            />
          </div>

          {/* 경기 장소 */}
          <div>
            <label className={labelStyle}>경기 장소</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="예: 연수구 용담공원"
              className={inputStyle}
            />
          </div>
        </div>

        {/* 버튼 */}
        <div className="flex gap-4 mt-8">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-xl font-semibold transition-colors disabled:opacity-50"
          >
            {loading ? '생성 중...' : '✅ 경기 만들기'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/polls')}
            className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-3 rounded-xl font-semibold transition-colors"
          >
            ↩️ 취소
          </button>
        </div>
      </form>
    </div>
  )
}

export default PollCreate