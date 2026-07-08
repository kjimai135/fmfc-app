import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function PollList() {
  const [polls, setPolls] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchPolls()
  }, [])

  async function fetchPolls() {
    setLoading(true)
    const { data } = await supabase
      .from('polls')
      .select('*')
      .order('game_date', { ascending: false })

    if (data) {
      const pollsWithCounts = await Promise.all(
        data.map(async (poll) => {
          const { data: responses } = await supabase
            .from('poll_responses')
            .select('*')
            .eq('poll_id', poll.id)

          const attend = responses?.filter(r => r.response === '참석').length || 0
          const absent = responses?.filter(r => r.response === '불참').length || 0
          const earlyLeave = responses?.filter(r => r.response === '조퇴').length || 0
          const total = responses?.length || 0

          return { ...poll, attend, absent, earlyLeave, total }
        })
      )
      setPolls(pollsWithCounts)
    }
    setLoading(false)
  }

  async function deletePoll(id) {
    if (!window.confirm('이 투표를 삭제하시겠습니까?')) return
    await supabase.from('polls').delete().eq('id', id)
    fetchPolls()
  }

  const now = new Date()

  const isExpired = (deadline) => {
    return new Date(deadline) < now
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white">🗳️ 경기 참석 투표</h1>
          <p className="text-slate-400 mt-1">총 {polls.length}개</p>
        </div>
        <Link
          to="/polls/new"
          className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-3 rounded-xl font-semibold transition-colors"
        >
          + 투표 만들기
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-20 text-slate-400">
          <p className="text-xl">⏳ 로딩 중...</p>
        </div>
      ) : polls.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <p className="text-4xl mb-4">🗳️</p>
          <p className="text-xl">등록된 투표가 없습니다</p>
          <p className="mt-2">"투표 만들기" 버튼을 눌러 새 투표를 만드세요!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {polls.map(poll => {
            const expired = isExpired(poll.deadline)
            return (
              <div key={poll.id} className={`bg-slate-800 rounded-xl p-5 border ${expired ? 'border-slate-700' : 'border-emerald-500/30'}`}>
                <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h2 className="text-lg font-bold text-white">⚽ {poll.game_date} 경기</h2>
                      {expired ? (
                        <span className="bg-red-500/20 text-red-400 px-3 py-1 rounded-full text-xs font-medium">마감</span>
                      ) : (
                        <span className="bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full text-xs font-medium">진행 중</span>
                      )}
                    </div>
                    {poll.location && (
                      <p className="text-slate-400 text-sm mb-2">📍 {poll.location}</p>
                    )}
                    <p className="text-slate-500 text-xs">
                      마감: {new Date(poll.deadline).toLocaleString('ko-KR')}
                    </p>

                    <div className="flex gap-4 mt-3">
                      <span className="text-emerald-400 text-sm">✅ 참석 {poll.attend}</span>
                      <span className="text-red-400 text-sm">❌ 불참 {poll.absent}</span>
                      <span className="text-orange-400 text-sm">🏃 조퇴 {poll.earlyLeave}</span>
                      <span className="text-slate-400 text-sm">총 {poll.total}명</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Link
                      to={`/polls/${poll.id}`}
                      className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                      {expired ? '📋 결과 보기' : '🗳️ 투표하기'}
                    </Link>
                    <button
                      onClick={() => deletePoll(poll.id)}
                      className="bg-red-500/10 hover:bg-red-500/20 text-red-400 px-3 py-2 rounded-lg text-sm transition-colors"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default PollList