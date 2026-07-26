import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

// timestamptz(ISO) → date 입력값(YYYY-MM-DD)으로 변환
function toDateInput(isoString) {
  if (!isoString) return ''
  const d = new Date(isoString)
  if (isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// 시작일(YYYY-MM-DD) → 그날 00:00:00 ISO
function startOfDayISO(dateStr) {
  if (!dateStr) return null
  const d = new Date(`${dateStr}T00:00:00`)
  if (isNaN(d.getTime())) return null
  return d.toISOString()
}

// 종료일(YYYY-MM-DD) → 그날 23:59:59 ISO (종료일 당일도 하루 종일 표시)
function endOfDayISO(dateStr) {
  if (!dateStr) return null
  const d = new Date(`${dateStr}T23:59:59`)
  if (isNaN(d.getTime())) return null
  return d.toISOString()
}

// YYYY-MM-DD → "2026. 7. 26." 형태로 표시
function formatDateLabel(dateStr) {
  if (!dateStr) return ''
  const d = new Date(`${dateStr}T00:00:00`)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('ko-KR')
}

function NoticeDetail() {
  const params = useParams()
  const id = params.id || 'new'   // id 없으면(/notices/new) 'new'로 취급

  const navigate = useNavigate()
  const { role, profile } = useAuth()

  const isNew = id === 'new'
  const canManage = role === 'admin' || role === 'executive'

  const [notice, setNotice] = useState(null)
  const [loading, setLoading] = useState(!isNew)
  const [editing, setEditing] = useState(isNew)
  const [saving, setSaving] = useState(false)

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [tickerStartAt, setTickerStartAt] = useState('')
  const [tickerEndAt, setTickerEndAt] = useState('')

  useEffect(() => {
    if (isNew) {
      setNotice(null)
      setTitle('')
      setContent('')
      setIsActive(true)
      setTickerStartAt('')
      setTickerEndAt('')
      setEditing(true)
      setLoading(false)
    } else {
      setEditing(false)
      fetchNotice()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function fetchNotice() {
    if (!id || id === 'new') {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('notices')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      if (error) {
        console.error('공지 불러오기 에러:', error)
      } else if (data) {
        setNotice(data)
        setTitle(data.title || '')
        setContent(data.content || '')
        setIsActive(data.is_active)
        setTickerStartAt(toDateInput(data.ticker_start_at))
        setTickerEndAt(toDateInput(data.ticker_end_at))
      }
    } catch (e) {
      console.error('공지 불러오기 예외:', e)
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    if (!title.trim()) {
      alert('제목을 입력해주세요!')
      return
    }
    if (!content.trim()) {
      alert('내용을 입력해주세요!')
      return
    }

    // 기간 유효성 검사: 시작일 > 종료일이면 막기
    if (tickerStartAt && tickerEndAt && new Date(tickerStartAt) > new Date(tickerEndAt)) {
      alert('티커 노출 종료일이 시작일보다 빠릅니다. 다시 확인해주세요!')
      return
    }

    setSaving(true)

    const startISO = startOfDayISO(tickerStartAt)
    const endISO = endOfDayISO(tickerEndAt)

    if (isNew) {
      // ✅ 연결된 선수(players) 이름 가져오기
      let authorName = profile?.name || null
      if (profile?.player_id) {
        const { data: player } = await supabase
          .from('players')
          .select('name')
          .eq('id', profile.player_id)
          .maybeSingle()
        if (player?.name) authorName = player.name
      }

      const { data, error } = await supabase
        .from('notices')
        .insert([{
          title: title.trim(),
          content: content.trim(),
          author: authorName,
          is_active: isActive,
          ticker_start_at: startISO,
          ticker_end_at: endISO,
        }])
        .select()
        .single()

      if (error) {
        alert('작성에 실패했습니다: ' + error.message)
        setSaving(false)
        return
      }
      navigate(`/notices/${data.id}`)
    } else {
      const { error } = await supabase
        .from('notices')
        .update({
          title: title.trim(),
          content: content.trim(),
          is_active: isActive,
          ticker_start_at: startISO,
          ticker_end_at: endISO,
        })
        .eq('id', id)

      if (error) {
        alert('수정에 실패했습니다: ' + error.message)
        setSaving(false)
        return
      }
      setEditing(false)
      fetchNotice()
    }
    setSaving(false)
  }

  async function handleDelete() {
    if (!window.confirm('이 공지를 삭제하시겠습니까?')) return
    await supabase.from('notices').delete().eq('id', id)
    navigate('/notices')
  }

  if (loading) {
    return <div className="text-center text-slate-400 py-10">⏳ 불러오는 중...</div>
  }

  // ✏️ 작성/수정 모드
  if (editing) {
    return (
      <div className="max-w-2xl mx-auto">
        <Link to="/notices" className="text-slate-400 hover:text-white text-sm mb-4 inline-block">
          ← 공지 목록으로
        </Link>
        <h1 className="text-2xl font-bold text-white mb-6">
          {isNew ? '✍️ 새 공지 작성' : '✏️ 공지 수정'}
        </h1>

        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 space-y-4">
          {/* 제목 */}
          <div>
            <label className="block text-slate-300 text-sm font-medium mb-2">
              제목 <span className="text-red-400">*</span>
              <span className="text-slate-500 text-xs ml-2">(공지 티커에 흐르는 내용)</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 이번 주 토요일 경기 취소 안내"
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* 내용 */}
          <div>
            <label className="block text-slate-300 text-sm font-medium mb-2">
              내용 <span className="text-red-400">*</span>
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="공지 상세 내용을 입력하세요."
              rows={10}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 resize-y"
            />
          </div>

          {/* 티커 표시 여부 */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isActive"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4 accent-emerald-500"
            />
            <label htmlFor="isActive" className="text-slate-300 text-sm">
              📢 공지 티커에 표시 (체크 해제 시 게시판에만 저장)
            </label>
          </div>

          {/* 티커 노출 기간 */}
          <div className="bg-slate-900/40 border border-slate-700 rounded-lg p-4 space-y-3">
            <p className="text-slate-300 text-sm font-medium">
              ⏰ 티커 노출 기간 <span className="text-slate-500 text-xs ml-1">(선택 · 비워두면 항상 표시)</span>
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* 시작일 */}
              <div>
                <label className="block text-slate-400 text-xs mb-1">시작일</label>
                <div className="flex items-center gap-2 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      const input = e.currentTarget.nextElementSibling
                      input.showPicker ? input.showPicker() : input.focus()
                    }}
                    className="text-lg leading-none hover:scale-110 transition-transform"
                    title="달력 열기"
                  >
                    📅
                  </button>
                  {/* 실제 date input은 화면에서 숨김 */}
                  <input
                    type="date"
                    value={tickerStartAt}
                    onChange={(e) => setTickerStartAt(e.target.value)}
                    className="w-0 h-0 opacity-0 absolute pointer-events-none"
                    tabIndex={-1}
                  />
                  <span className={`text-sm ${tickerStartAt ? 'text-white' : 'text-slate-500'}`}>
                    {tickerStartAt
                      ? `${formatDateLabel(tickerStartAt)} 00:00 부터`
                      : '날짜 선택 안 함'}
                  </span>
                </div>
              </div>

              {/* 종료일 */}
              <div>
                <label className="block text-slate-400 text-xs mb-1">종료일</label>
                <div className="flex items-center gap-2 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      const input = e.currentTarget.nextElementSibling
                      input.showPicker ? input.showPicker() : input.focus()
                    }}
                    className="text-lg leading-none hover:scale-110 transition-transform"
                    title="달력 열기"
                  >
                    📅
                  </button>
                  <input
                    type="date"
                    value={tickerEndAt}
                    onChange={(e) => setTickerEndAt(e.target.value)}
                    className="w-0 h-0 opacity-0 absolute pointer-events-none"
                    tabIndex={-1}
                  />
                  <span className={`text-sm ${tickerEndAt ? 'text-white' : 'text-slate-500'}`}>
                    {tickerEndAt
                      ? `${formatDateLabel(tickerEndAt)} 23:59 까지`
                      : '날짜 선택 안 함'}
                  </span>
                </div>
              </div>
            </div>

            {/* 선택된 노출 기간 요약 */}
            {(tickerStartAt || tickerEndAt) && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2">
                <p className="text-emerald-300 text-sm">
                  📢 노출 기간:{' '}
                  <span className="font-medium">
                    {tickerStartAt ? `${formatDateLabel(tickerStartAt)} 00:00` : '즉시'}
                  </span>
                  {' ~ '}
                  <span className="font-medium">
                    {tickerEndAt ? `${formatDateLabel(tickerEndAt)} 23:59` : '무기한'}
                  </span>
                </p>
              </div>
            )}

            {(tickerStartAt || tickerEndAt) && (
              <button
                type="button"
                onClick={() => { setTickerStartAt(''); setTickerEndAt('') }}
                className="text-slate-400 hover:text-white text-xs underline"
              >
                기간 지우기 (항상 표시)
              </button>
            )}
            <p className="text-slate-500 text-xs leading-relaxed">
              · 시작일 당일 0시부터 티커에 나타납니다 (비우면 즉시)<br />
              · 종료일 당일까지 표시되고, 다음 날부터 자동으로 사라집니다 (비우면 무기한)<br />
              · 티커에서 사라져도 공지 게시판에는 계속 남아 있습니다
            </p>
          </div>

          {/* 버튼 */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-xl font-semibold transition-colors disabled:opacity-50"
            >
              {saving ? '저장 중...' : '💾 저장'}
            </button>
            <button
              onClick={() => {
                if (isNew) navigate('/notices')
                else { setEditing(false); fetchNotice() }
              }}
              className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-3 rounded-xl font-semibold transition-colors"
            >
              ↩️ 취소
            </button>
          </div>
        </div>
      </div>
    )
  }

  // 📄 상세 보기 모드
  if (!notice) {
    return (
      <div className="text-center text-slate-400 py-10">
        공지를 찾을 수 없습니다.
        <div className="mt-4">
          <Link to="/notices" className="text-emerald-400">← 공지 목록으로</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Link to="/notices" className="text-slate-400 hover:text-white text-sm mb-4 inline-block">
        ← 공지 목록으로
      </Link>

      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
        {/* 제목 */}
        <div className="flex items-start gap-2 mb-2">
          {!notice.is_active && (
            <span className="text-[11px] bg-slate-600 text-slate-300 px-2 py-0.5 rounded-full flex-shrink-0 mt-1.5">숨김</span>
          )}
          <h1 className="text-2xl font-bold text-white">{notice.title || '(제목 없음)'}</h1>
        </div>

        {/* 작성 정보 */}
        <p className="text-slate-500 text-sm mb-2">
          {notice.author ? `${notice.author} · ` : ''}
          {new Date(notice.created_at).toLocaleString('ko-KR')}
        </p>

        {/* 티커 노출 기간 표시 (설정된 경우만) */}
        {notice.is_active && (notice.ticker_start_at || notice.ticker_end_at) && (
          <p className="text-emerald-400/80 text-xs mb-6 pb-4 border-b border-slate-700">
            ⏰ 티커 노출:{' '}
            {notice.ticker_start_at
              ? `${new Date(notice.ticker_start_at).toLocaleDateString('ko-KR')} 00:00`
              : '즉시'}
            {' ~ '}
            {notice.ticker_end_at
              ? `${new Date(notice.ticker_end_at).toLocaleDateString('ko-KR')} 23:59`
              : '무기한'}
          </p>
        )}
        {!(notice.is_active && (notice.ticker_start_at || notice.ticker_end_at)) && (
          <div className="mb-6 pb-4 border-b border-slate-700" />
        )}

        {/* 내용 (줄바꿈 유지) */}
        <div className="text-slate-200 whitespace-pre-wrap leading-relaxed min-h-[100px]">
          {notice.content}
        </div>

        {/* 관리 버튼 (관리자·임원만) */}
        {canManage && (
          <div className="flex gap-2 justify-end mt-6 pt-4 border-t border-slate-700">
            <button
              onClick={() => setEditing(true)}
              className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              ✏️ 수정
            </button>
            <button
              onClick={handleDelete}
              className="bg-red-500/10 hover:bg-red-500/20 text-red-400 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              🗑️ 삭제
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default NoticeDetail