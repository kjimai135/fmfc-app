import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

// 지난(종료) 투표를 몇 개까지 보관할지
const PAST_KEEP = 4

function PollList() {
  const [polls, setPolls] = useState([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editDate, setEditDate] = useState('')
  const [editTime, setEditTime] = useState('')
  const [editLocation, setEditLocation] = useState('')
  const [showPast, setShowPast] = useState(false) // 지난 투표 접기/펼치기

  // 오늘 날짜 키 (YYYY-MM-DD)
  const pad = (n) => String(n).padStart(2, '0')
  const todayKey = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  })()

  useEffect(() => {
    fetchPolls()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function fetchPolls() {
    setLoading(true)
    // 🔼 가까운(빠른) 경기 날짜부터 위로: game_date 오름차순
    const { data } = await supabase
      .from('polls')
      .select('*')
      .order('game_date', { ascending: true })

    let all = data || []

    // 🗑️ 지난(종료) 투표가 PAST_KEEP개를 초과하면, 오래된 것 자동 삭제
    const pastPolls = all
      .filter((p) => p.game_date && p.game_date < todayKey)
      .sort((a, b) => b.game_date.localeCompare(a.game_date)) // 최신 지난 것부터

    if (pastPolls.length > PAST_KEEP) {
      const toDelete = pastPolls.slice(PAST_KEEP) // 4개 이후(오래된 것)
      const deleteIds = toDelete.map((p) => p.id)
      if (deleteIds.length > 0) {
        await supabase.from('polls').delete().in('id', deleteIds)
        // 화면 목록에서도 제거
        all = all.filter((p) => !deleteIds.includes(p.id))
      }
    }

    setPolls(all)
    setLoading(false)
  }

  // 📅 경기 스케쥴(확정=노란색)에 맞춰 투표 자동 생성
  async function generateFromSchedule() {
    if (generating) return
    setGenerating(true)

    try {
      const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

      // 오늘 ~ 오늘+14일 범위
      const now = new Date()
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const end = new Date(start)
      end.setDate(end.getDate() + 14)

      const fromKey = keyOf(start)
      const toKey = keyOf(end)

      // 1) 2주 이내의 확정 예약 조회
      const { data: reservations, error: resErr } = await supabase
        .from('reservations')
        .select('*')
        .eq('is_confirmed', true)
        .gte('date', fromKey)
        .lte('date', toKey)
        .order('date', { ascending: true })
        .order('sort_order', { ascending: true })

      if (resErr) {
        alert('예약 정보를 불러오지 못했습니다: ' + resErr.message)
        setGenerating(false)
        return
      }

      if (!reservations || reservations.length === 0) {
        alert('앞으로 2주 이내에 확정(노란색)된 경기 일정이 없습니다.')
        setGenerating(false)
        return
      }

      // 2) 날짜별로 첫 확정 예약만 사용 (구장/시간 대표값)
      const byDate = {}
      for (const r of reservations) {
        if (!byDate[r.date]) byDate[r.date] = r
      }
      const targetDates = Object.keys(byDate)

      // 3) 이미 투표가 있는 날짜 조회 (중복 방지)
      const { data: existingPolls } = await supabase
        .from('polls')
        .select('game_date')
        .in('game_date', targetDates)

      const existingDates = new Set((existingPolls || []).map(p => p.game_date))

      // 4) 없는 날짜만 생성
      const rowsToInsert = targetDates
        .filter(d => !existingDates.has(d))
        .map(d => {
          const r = byDate[d]
          return {
            game_date: d,
            game_time: r.time || null,
            location: r.venue || null,
          }
        })

      if (rowsToInsert.length === 0) {
        alert(`2주 이내 확정 경기 ${targetDates.length}건은 이미 모두 투표가 만들어져 있습니다.`)
        setGenerating(false)
        return
      }

      const { error: insErr } = await supabase.from('polls').insert(rowsToInsert)
      if (insErr) {
        alert('투표 생성 중 오류가 발생했습니다: ' + insErr.message)
        setGenerating(false)
        return
      }

      const skipped = targetDates.length - rowsToInsert.length
      alert(
        `✅ 2주 이내 경기 투표 ${rowsToInsert.length}개를 생성했습니다!` +
        (skipped > 0 ? `\n(이미 있는 ${skipped}건은 건너뜀)` : '')
      )

      await fetchPolls()
    } finally {
      setGenerating(false)
    }
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

  // 📅 날짜 파싱 → 월/일/요일
  function parseDate(dateStr) {
    if (!dateStr) return { month: '', day: '', weekday: '', dObj: null }
    const [y, m, d] = dateStr.split('-').map(Number)
    const dObj = new Date(y, m - 1, d)
    return {
      month: String(m).padStart(2, '0'),
      day: String(d).padStart(2, '0'),
      weekday: WEEKDAYS[dObj.getDay()],
      dObj,
    }
  }

  // ⏳ D-day 계산
  function getDday(dObj) {
    if (!dObj) return null
    const today = new Date()
    const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const diff = Math.round((dObj - t0) / (1000 * 60 * 60 * 24))
    if (diff === 0) return { label: 'D-DAY', tone: 'today' }
    if (diff > 0) return { label: `D-${diff}`, tone: 'upcoming' }
    return { label: '종료', tone: 'past' }
  }

  // 예정(오늘 이후) / 지난(종료) 분리
  const upcomingPolls = polls.filter((p) => p.game_date && p.game_date >= todayKey)
  const pastPolls = polls
    .filter((p) => p.game_date && p.game_date < todayKey)
    .sort((a, b) => b.game_date.localeCompare(a.game_date)) // 최근 지난 것부터
    .slice(0, PAST_KEEP)

  // 개별 투표 카드 렌더링
  function renderPollCard(poll) {
    const { month, day, weekday, dObj } = parseDate(poll.game_date)
    const dday = getDday(dObj)
    const isSunday = weekday === '일'
    const isSaturday = weekday === '토'

    if (editingId === poll.id) {
      /* ✏️ 수정 모드 */
      return (
        <div key={poll.id} className="bg-slate-800 rounded-2xl p-5 border border-emerald-500/40">
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-white mb-2">✏️ 경기 정보 수정</h2>
            <div>
              <label className="block text-slate-300 text-sm font-medium mb-2">경기 날짜 *</label>
              <input
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500"
                style={{ colorScheme: 'dark' }}
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
        </div>
      )
    }

    /* 📋 일반 보기 모드 (한 줄 컴팩트) */
    return (
      <div
        key={poll.id}
        className="group relative bg-slate-800/80 hover:bg-slate-800 rounded-2xl border border-slate-700 hover:border-emerald-500/50 transition-all duration-200 overflow-hidden"
      >
        {/* 왼쪽 강조 바 */}
        <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${
          dday?.tone === 'today' ? 'bg-yellow-400'
            : dday?.tone === 'upcoming' ? 'bg-emerald-500'
            : 'bg-slate-600'
        }`} />

        <div className="flex items-center gap-3 p-3 pl-5">
          {/* 날짜 박스 */}
          <div className="flex flex-col items-center justify-center bg-slate-900/70 rounded-xl px-2.5 py-1.5 min-w-[56px] border border-slate-700 flex-shrink-0">
            <span className={`text-[10px] font-bold leading-none ${
              isSunday ? 'text-red-400' : isSaturday ? 'text-sky-400' : 'text-slate-400'
            }`}>
              {month}월
            </span>
            <span className="text-xl font-black text-white leading-tight">{day}</span>
            <span className={`text-[10px] font-bold leading-none ${
              isSunday ? 'text-red-400' : isSaturday ? 'text-sky-400' : 'text-slate-300'
            }`}>
              {weekday}
            </span>
          </div>

          {/* 정보: D-day + 시간 + 장소 */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              {dday && (
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                  dday.tone === 'today' ? 'bg-yellow-400/20 text-yellow-300'
                    : dday.tone === 'upcoming' ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-slate-700 text-slate-400'
                }`}>
                  {dday.label}
                </span>
              )}
              {poll.game_time && (
                <span className="inline-flex items-center gap-1 bg-slate-700/60 text-slate-100 text-xs font-medium px-2 py-0.5 rounded-md">
                  ⏰ {poll.game_time}
                </span>
              )}
              {poll.location && (
                <span className="inline-flex items-center gap-1 bg-slate-700/60 text-slate-100 text-xs font-medium px-2 py-0.5 rounded-md truncate">
                  📍 {poll.location}
                </span>
              )}
            </div>
          </div>

          {/* 액션 버튼 (장소 옆에 나란히) */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Link
              to={`/polls/${poll.id}`}
              title="투표하기"
              className="bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap"
            >
              🗳️ 투표
            </Link>
            <button
              onClick={() => startEdit(poll)}
              title="수정"
              className="bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
            >
              ✏️ 수정
            </button>
            <button
              onClick={() => deletePoll(poll.id)}
              title="삭제"
              className="bg-red-500/10 hover:bg-red-500/20 text-red-400 px-2.5 py-2 rounded-lg text-sm transition-colors"
            >
              🗑️
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-2">
            🗳️ 투표
          </h1>
          <p className="text-slate-400 mt-1">
            예정 <span className="text-emerald-400 font-semibold">{upcomingPolls.length}</span>개 · 지난 경기 <span className="text-slate-300 font-semibold">{pastPolls.length}</span>개
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={generateFromSchedule}
            disabled={generating}
            title="오늘부터 2주 이내에 확정(노란색)된 경기 스케쥴로 투표를 자동 생성합니다"
            className="flex items-center gap-1.5 bg-yellow-500 hover:bg-yellow-400 text-slate-900 px-5 py-3 rounded-xl font-bold transition-colors disabled:opacity-50 shadow-lg shadow-yellow-500/20"
          >
            {generating ? '⏳ 생성 중...' : '📅 자동투표생성'}
          </button>
          <Link
            to="/polls/new"
            className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-3 rounded-xl font-semibold transition-colors shadow-lg shadow-emerald-500/20"
          >
            📅수동투표생성
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-slate-400">
          <p className="text-xl">⏳ 로딩 중...</p>
        </div>
      ) : polls.length === 0 ? (
        <div className="text-center py-20 text-slate-400 bg-slate-800/40 border border-dashed border-slate-700 rounded-2xl">
          <p className="text-5xl mb-4">🗳️</p>
          <p className="text-xl text-white font-semibold">등록된 경기가 없습니다</p>
          <p className="mt-2 text-sm">"수동투표생성" 또는 "📅 자동투표생성" 버튼을 눌러보세요!</p>
        </div>
      ) : (
        <>
          {/* 📅 예정 경기 */}
          {upcomingPolls.length > 0 ? (
            <div className="space-y-3">
              {upcomingPolls.map((poll) => renderPollCard(poll))}
            </div>
          ) : (
            <div className="text-center py-12 text-slate-400 bg-slate-800/40 border border-dashed border-slate-700 rounded-2xl">
              <p className="text-4xl mb-3">📅</p>
              <p>예정된 경기가 없습니다</p>
            </div>
          )}

          {/* 🕓 지난 경기 (접기/펼치기, 최근 4개) */}
          {pastPolls.length > 0 && (
            <div className="mt-6">
              <button
                onClick={() => setShowPast((v) => !v)}
                className="w-full flex items-center justify-between bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700 rounded-xl px-4 py-3 transition-colors"
              >
                <span className="text-slate-300 font-semibold text-sm">
                  🕓 지난 투표 ({pastPolls.length})
                </span>
                <span className="text-slate-400 text-sm">{showPast ? '▲ 접기' : '▼ 펼치기'}</span>
              </button>

              {showPast && (
                <div className="space-y-3 mt-3">
                  {pastPolls.map((poll) => renderPollCard(poll))}
                  <p className="text-slate-600 text-xs text-center pt-1">
                    ※ 지난 투표는 최근 {PAST_KEEP}개까지만 보관되며, 그 이전 기록은 자동 삭제됩니다.
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ⬇️ 하단 여백 */}
      <div style={{ height: '60px', width: '100%' }} aria-hidden="true"></div>
    </div>
  )
}

export default PollList