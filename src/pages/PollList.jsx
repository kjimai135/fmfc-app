import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function PollList() {
  const [polls, setPolls] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [editDate, setEditDate] = useState('')
  const [editTime, setEditTime] = useState('')
  const [editLocation, setEditLocation] = useState('')

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
          const lateArrive = responses?.filter(r => r.response === '늦참').length || 0
          const total = responses?.length || 0

          return { ...poll, attend, absent, earlyLeave, lateArrive, total }
        })
      )
      setPolls(pollsWithCounts)
    }
    setLoading(false)
  }

  async function deletePoll(id) {
    if (!window.confirm('이 경기 투표를 삭제하시겠습니까?')) return
    await supabase.from('polls').delete().eq('id', id)
    fetchPolls()
  }

  // ✏️ 수정 시작
  function startEdit(poll) {
    setEditingId(poll.id)
    setEditDate(poll.game_date || '')
    setEditTime(poll.game_time || '')
    setEditLocation(poll.location || '')
  }

  // ↩️ 수정 취소
  function cancelEdit() {
    setEditingId(null)
    setEditDate('')
    setEditTime('')
    setEditLocation('')
  }

  // 💾 수정 저장
  async function saveEdit(id) {
    if (!editDate) {
      alert('경기 날짜를 입력해주세요!')
      return
    }
    const { error } = await supabase
      .from('polls')
      .update({
        game_date: editDate,
        game_time: editTime,
        location: editLocation,
      })
      .eq('id', id)

    if (error) {
      alert('오류가 발생했습니다: ' + error.message)
    } else {
      cancelEdit()
      fetchPolls()
    }
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
          + 경기 만들기
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-20 text-slate-400">
          <p className="text-xl">⏳ 로딩 중...</p>
        </div>
      ) : polls.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <p className="text-4xl mb-4">🗳️</p>
          <p className="text-xl">등록된 경기가 없습니다</p>
          <p className="mt-2">"경기 만들기" 버튼을 눌러 새 경기를 만드세요!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {polls.map(poll => (
            <div key={poll.id} className="bg-slate-800 rounded-xl p-5 border border-emerald-500/30">
              {editingId === poll.id ? (
                /* ✏️ 수정 모드 */
                <div className="space-y-4">
                  <h2 className="text-lg font-bold text-white mb-2">✏️ 경기 정보 수정</h2>
                  <div>
                    <label className="block text-slate-300 text-sm font-medium mb-2">경기 날짜 *</label>
                    <input
                      type="date"
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                      className="w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 text-sm font-medium mb-2">경기 시간</label>
                    <input
                      type="text"
                      value={editTime}
                      onChange={(e) => setEditTime(e.target.value)}
                      placeholder="예: 오후 2시 ~ 4시"
                      className="w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 text-sm font-medium mb-2">경기 장소</label>
                    <input
                      type="text"
                      value={editLocation}
                      onChange={(e) => setEditLocation(e.target.value)}
                      placeholder="예: 연수구 체육공원"
                      className="w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => saveEdit(poll.id)}
                      className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-xl font-semibold transition-colors"
                    >
                      💾 저장
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-3 rounded-xl font-semibold transition-colors"
                    >
                      ↩️ 취소
                    </button>
                  </div>
                </div>
              ) : (
                /* 📋 일반 보기 모드 */
                <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                  <div className="flex-1">
                    {/* 날짜 → 시간 → 장소 한 줄에 (동일 폰트) */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3">
                      <span className="text-lg font-bold text-white">⚽ {poll.game_date}</span>
                      {poll.game_time && (
                        <span className="text-lg font-bold text-white">⏰ {poll.game_time}</span>
                      )}
                      {poll.location && (
                        <span className="text-lg font-bold text-white">📍 {poll.location}</span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-4">
                      <span className="text-emerald-400 text-sm">✅ 참석 {poll.attend}</span>
                      <span className="text-red-400 text-sm">❌ 불참 {poll.absent}</span>
                      <span className="text-orange-400 text-sm">🏃 조퇴 {poll.earlyLeave}</span>
                      <span className="text-yellow-400 text-sm">⏰ 늦참 {poll.lateArrive}</span>
                      <span className="text-slate-400 text-sm">총 {poll.total}명</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => startEdit(poll)}
                      className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                      ✏️ 수정
                    </button>
                    <Link
                      to={`/polls/${poll.id}`}
                      className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                      🗳️ 투표하기
                    </Link>
                    <button
                      onClick={() => deletePoll(poll.id)}
                      className="bg-red-500/10 hover:bg-red-500/20 text-red-400 px-3 py-2 rounded-lg text-sm transition-colors"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default PollList