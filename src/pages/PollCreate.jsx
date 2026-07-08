import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function PollCreate() {
  const navigate = useNavigate()
  const [gameDate, setGameDate] = useState('')
  const [location, setLocation] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()

    if (!gameDate) {
      alert('경기 날짜를 선택해주세요!')
      return
    }

    setLoading(true)

    const deadlineDate = new Date(gameDate)
    deadlineDate.setDate(deadlineDate.getDate() - 1)
    deadlineDate.setHours(23, 0, 0, 0)

    const { error } = await supabase
      .from('polls')
      .insert([{
        game_date: gameDate,
        location: location,
        deadline: deadlineDate.toISOString(),
      }])

    setLoading(false)

    if (error) {
      alert('오류가 발생했습니다: ' + error.message)
    } else {
      navigate('/polls')
    }
  }

  const inputStyle = "w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500"
  const labelStyle = "block text-slate-300 text-sm font-medium mb-2"

  const deadlinePreview = gameDate ? (() => {
    const d = new Date(gameDate)
    d.setDate(d.getDate() - 1)
    d.setHours(23, 0, 0, 0)
    return d.toLocaleString('ko-KR')
  })() : ''

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-3xl font-bold text-white mb-8">🗳️ 새 투표 만들기</h1>

      <form onSubmit={handleSubmit} className="bg-slate-800 rounded-xl p-6 border border-slate-700">
        <div className="space-y-6">
          {/* 경기 날짜 */}
          <div>
            <label className={labelStyle}>경기 날짜 *</label>
            <input
              type="date"
              value={gameDate}
              onChange={(e) => setGameDate(e.target.value)}
              className={inputStyle}
              required
            />
          </div>

          {/* 경기 장소 */}
          <div>
            <label className={labelStyle}>경기 장소</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="예: 연수구 체육공원"
              className={inputStyle}
            />
          </div>

          {/* 마감 시한 미리보기 */}
          {gameDate && (
            <div className="bg-slate-700/50 rounded-xl p-4">
              <p className="text-slate-300 text-sm">
                ⏰ 투표 마감: <span className="text-emerald-400 font-medium">{deadlinePreview}</span>
              </p>
              <p className="text-slate-500 text-xs mt-1">경기 전날 저녁 11시에 자동 마감됩니다</p>
            </div>
          )}
        </div>

        {/* 버튼 */}
        <div className="flex gap-4 mt-8">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-xl font-semibold transition-colors disabled:opacity-50"
          >
            {loading ? '생성 중...' : '✅ 투표 만들기'}
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