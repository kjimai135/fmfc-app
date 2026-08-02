import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const WEEK_LABELS = ['월', '화', '수', '목', '금', '토', '일']

// 요일 헤더 색상 (월~금 하늘 / 토 주황 / 일 빨강) — 투명 톤
function headerStyle(idx) {
  if (idx === 6) return { background: 'rgba(220,38,38,0.35)', color: '#fecaca' }
  if (idx === 5) return { background: 'rgba(249,115,22,0.28)', color: '#fed7aa' }
  return { background: 'rgba(56,132,255,0.22)', color: '#cfe2f3' }
}

// YYYY-MM-DD (로컬 기준)
function toKey(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// 월요일 시작 달력 그리드 생성
function buildWeeks(year, month) {
  const first = new Date(year, month - 1, 1)
  const offset = (first.getDay() + 6) % 7 // 월요일 시작 보정
  const start = new Date(year, month - 1, 1 - offset)

  const weeks = []
  const cur = new Date(start)
  for (let w = 0; w < 6; w++) {
    const week = []
    for (let d = 0; d < 7; d++) {
      week.push(new Date(cur))
      cur.setDate(cur.getDate() + 1)
    }
    weeks.push(week)
  }
  return weeks.filter((week) => week.some((d) => d.getMonth() === month - 1))
}

function CalendarPage() {
  const { role } = useAuth()
  // ✅ 수정 권한: 관리자·임원만
  const canEdit = role === 'admin' || role === 'executive'
  // 👀 전체 내용 열람 권한: 관리자·임원·주장(부주장)
  //    → 정회원(member)은 '확정된 일정'만 볼 수 있음
  const canSeeAll = role === 'admin' || role === 'executive' || role === 'captain'

  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)

  const [reservations, setReservations] = useState([])
  const [memos, setMemos] = useState({})
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)

  // 📅 연/월 선택 팝오버
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerYear, setPickerYear] = useState(today.getFullYear())
  const pickerRef = useRef(null)

  // 모달 상태
  const [editKey, setEditKey] = useState(null) // 편집 중인 날짜 (YYYY-MM-DD)
  const [editRows, setEditRows] = useState([])
  const [editMemo, setEditMemo] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month])

  useEffect(() => {
    if (canEdit) fetchPlayers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit])

  // 팝오버 바깥 클릭 시 닫기
  useEffect(() => {
    function onClickOutside(e) {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setPickerOpen(false)
      }
    }
    if (pickerOpen) document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [pickerOpen])

  async function fetchPlayers() {
    const { data } = await supabase
      .from('players')
      .select('id, name, is_active')
      .order('name')
    setPlayers((data || []).filter((p) => p.is_active !== false))
  }

  async function fetchData() {
    setLoading(true)
    const lastDay = new Date(year, month, 0).getDate()

    // 앞뒤 달 칸도 표시되므로 여유 있게 조회
    const from = toKey(new Date(year, month - 1, -7))
    const to = toKey(new Date(year, month - 1, lastDay + 7))

    // 일정 조회 (정회원은 확정된 것만)
    let resQuery = supabase
      .from('reservations')
      .select('*')
      .gte('date', from)
      .lte('date', to)
      .order('sort_order')

    if (!canSeeAll) {
      resQuery = resQuery.eq('is_confirmed', true)
    }

    // 메모는 전체 열람 권한자만 조회
    const memoPromise = canSeeAll
      ? supabase.from('calendar_memos').select('*').gte('date', from).lte('date', to)
      : Promise.resolve({ data: [] })

    const [resRes, memoRes] = await Promise.all([resQuery, memoPromise])

    setReservations(resRes.data || [])

    const memoMap = {}
    ;(memoRes.data || []).forEach((m) => {
      memoMap[m.date] = m.content
    })
    setMemos(memoMap)

    setLoading(false)
  }

  function goToday() {
    setYear(today.getFullYear())
    setMonth(today.getMonth() + 1)
    setPickerOpen(false)
  }

  function openPicker() {
    setPickerYear(year)
    setPickerOpen((v) => !v)
  }

  function selectMonth(m) {
    setYear(pickerYear)
    setMonth(m)
    setPickerOpen(false)
  }

  // 날짜별 일정 목록
  function getReservations(key) {
    return reservations.filter((r) => r.date === key)
  }

  // 셀 클릭 → 편집 모달 열기
  function openEditor(key) {
    if (!canEdit) return
    const rows = getReservations(key).map((r) => ({
      venue: r.venue || '',
      time: r.time || '',
      reserver: r.reserver || '',
      is_confirmed: !!r.is_confirmed,
    }))
    setEditRows(rows.length > 0 ? rows : [{ venue: '', time: '', reserver: '', is_confirmed: false }])
    setEditMemo(memos[key] || '')
    setEditKey(key)
  }

  function updateRow(idx, field, value) {
    setEditRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r))
    )
  }

  function addRow() {
    setEditRows((prev) => [...prev, { venue: '', time: '', reserver: '', is_confirmed: false }])
  }

  function removeRow(idx) {
    setEditRows((prev) => prev.filter((_, i) => i !== idx))
  }

  async function saveDay() {
    if (!canEdit || !editKey) return
    setSaving(true)

    // 1) 해당 날짜 일정 전부 삭제 후 다시 저장
    const { error: delErr } = await supabase
      .from('reservations')
      .delete()
      .eq('date', editKey)

    if (delErr) {
      console.error('삭제 오류:', delErr)
      alert('저장에 실패했습니다.')
      setSaving(false)
      return
    }

    const rowsToInsert = editRows
      .filter((r) => r.venue.trim() || r.time.trim() || r.reserver.trim())
      .map((r, i) => ({
        date: editKey,
        venue: r.venue.trim() || null,
        time: r.time.trim() || null,
        reserver: r.reserver.trim() || null,
        is_confirmed: !!r.is_confirmed,
        sort_order: i,
      }))

    if (rowsToInsert.length > 0) {
      const { error: insErr } = await supabase.from('reservations').insert(rowsToInsert)
      if (insErr) {
        console.error('저장 오류:', insErr)
        alert('저장에 실패했습니다.')
        setSaving(false)
        return
      }
    }

    // 2) 메모 저장 / 삭제
    const memoText = editMemo.trim()
    if (memoText) {
      const { error: memoErr } = await supabase
        .from('calendar_memos')
        .upsert({ date: editKey, content: memoText, updated_at: new Date().toISOString() })
      if (memoErr) console.error('메모 저장 오류:', memoErr)
    } else {
      await supabase.from('calendar_memos').delete().eq('date', editKey)
    }

    setEditKey(null)
    setSaving(false)
    fetchData()
  }

  const weeks = buildWeeks(year, month)
  const todayKey = toKey(today)

  return (
    <div className="max-w-full mx-auto">
      {/* 헤더 */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <h1 className="text-2xl font-bold text-white">📅 경기 스케쥴</h1>

        {/* 📆 연/월 선택 버튼 + 팝오버 */}
        <div className="relative" ref={pickerRef}>
          <button
            onClick={openPicker}
            title="연도·월 선택"
            className="flex items-center gap-2 bg-slate-700/70 hover:bg-slate-600 border border-slate-500 text-white px-3 py-1.5 rounded-lg transition-colors"
          >
            {/* 달력 아이콘 (흰색) */}
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
            <span className="text-emerald-400 font-bold text-lg leading-none">
              {year}년 {month}월
            </span>
            <span className="text-slate-400 text-xs">▾</span>
          </button>

          {/* 팝오버 패널 */}
          {pickerOpen && (
            <div
              className="absolute left-0 mt-2 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl p-3"
              style={{ zIndex: 60, width: '280px' }}
            >
              {/* 연도 선택 */}
              <div className="flex items-center justify-between mb-3">
                <button
                  onClick={() => setPickerYear((y) => y - 1)}
                  className="text-slate-300 hover:text-white px-2 py-1 rounded hover:bg-slate-700 transition-colors"
                >
                  ◀
                </button>
                <span className="text-white font-bold text-lg">{pickerYear}년</span>
                <button
                  onClick={() => setPickerYear((y) => y + 1)}
                  className="text-slate-300 hover:text-white px-2 py-1 rounded hover:bg-slate-700 transition-colors"
                >
                  ▶
                </button>
              </div>

              {/* 월 선택 (3열) */}
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                  const isCurrent = pickerYear === year && m === month
                  const isThisMonth =
                    pickerYear === today.getFullYear() && m === today.getMonth() + 1
                  return (
                    <button
                      key={m}
                      onClick={() => selectMonth(m)}
                      className={`py-2 rounded-lg text-sm font-medium transition-colors border ${
                        isCurrent
                          ? 'bg-emerald-500 text-white border-emerald-400'
                          : isThisMonth
                          ? 'bg-slate-700 text-emerald-300 border-emerald-500/40'
                          : 'bg-slate-700/50 text-slate-300 border-slate-600 hover:bg-slate-700'
                      }`}
                    >
                      {m}월
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* 오늘 버튼 - 달력 아이콘 바로 옆 */}
        <button
          onClick={goToday}
          className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
        >
          오늘
        </button>
      </div>

      {canEdit && (
        <p className="text-slate-500 text-xs mb-2">
          💡 날짜 칸을 클릭하면 일정을 추가·수정할 수 있습니다. (확정하면 노란색으로 표시)
        </p>
      )}

      {loading ? (
        <div className="text-center text-slate-400 py-20">⏳ 불러오는 중...</div>
      ) : (
        <div
          style={{
            border: '1px solid rgba(148,163,184,0.35)',
            borderRadius: '10px',
            overflow: 'hidden',
            background: 'transparent',
          }}
        >
          {/* 요일 헤더 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {WEEK_LABELS.map((label, i) => (
              <div
                key={label}
                style={{
                  ...headerStyle(i),
                  textAlign: 'center',
                  fontSize: '13px',
                  fontWeight: 700,
                  padding: '6px 0',
                  borderRight: i === 6 ? 'none' : '1px solid rgba(148,163,184,0.25)',
                  borderBottom: '1px solid rgba(148,163,184,0.3)',
                }}
              >
                {label}
              </div>
            ))}
          </div>

          {/* 날짜 셀 */}
          {weeks.map((week, wi) => (
            <div
              key={wi}
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                minHeight: `calc((100vh - 330px) / ${weeks.length})`,
              }}
            >
              {week.map((d, di) => {
                const key = toKey(d)
                const inMonth = d.getMonth() === month - 1
                const dayRes = getReservations(key)
                const hasConfirmed = dayRes.some((r) => r.is_confirmed)
                const memo = memos[key]
                const isWeekend = di >= 5
                const isToday = key === todayKey

                return (
                  <div
                    key={key}
                    onClick={() => openEditor(key)}
                    style={{
                      borderRight: di === 6 ? 'none' : '1px solid rgba(148,163,184,0.2)',
                      borderBottom: wi === weeks.length - 1 ? 'none' : '1px solid rgba(148,163,184,0.2)',
                      padding: '3px 5px 6px',
                      background: hasConfirmed
                        ? 'rgba(250, 204, 21, 0.30)'
                        : isToday
                        ? 'rgba(16,185,129,0.12)'
                        : 'transparent',
                      opacity: inMonth ? 1 : 0.3,
                      cursor: canEdit ? 'pointer' : 'default',
                      overflow: 'hidden',
                    }}
                  >
                    {/* 날짜 숫자 (우측 상단) */}
                    <div
                      style={{
                        textAlign: 'right',
                        fontSize: '12px',
                        fontWeight: isToday ? 800 : 500,
                        color: isToday
                          ? '#34d399'
                          : isWeekend
                          ? '#f87171'
                          : '#cbd5e1',
                        marginBottom: '2px',
                      }}
                    >
                      {d.getDate()}
                    </div>

                    {/* ★ 메모 (빨간 글씨) - 전체 열람 권한자만 */}
                    {canSeeAll && memo && (
                      <div
                        style={{
                          fontSize: '10px',
                          color: '#fca5a5',
                          fontWeight: 700,
                          whiteSpace: 'pre-wrap',
                          lineHeight: 1.35,
                          marginBottom: '2px',
                        }}
                      >
                        {memo}
                      </div>
                    )}

                    {/* 일정 목록 */}
                    {dayRes.map((r, i) => {
                      // 정회원: 구장 - 시간만 / 그 외: 구장 - 시간 - 예약자
                      const text = canSeeAll
                        ? [r.venue, r.time, r.reserver].filter(Boolean).join('-')
                        : [r.venue, r.time].filter(Boolean).join('-')
                      return (
                        <div
                          key={i}
                          style={{
                            fontSize: '10.5px',
                            color: r.is_confirmed ? '#fef08a' : '#e2e8f0',
                            fontWeight: r.is_confirmed ? 700 : 400,
                            lineHeight: 1.4,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                          title={text}
                        >
                          {text}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}

      {/* ✏️ 편집 모달 */}
      {editKey && (
        <div
          onClick={() => !saving && setEditKey(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#1e293b',
              border: '1px solid #475569',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '680px',
              maxHeight: '85vh',
              overflowY: 'auto',
              padding: '22px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            }}
          >
            <h2 className="text-white text-lg font-bold mb-1">
              📅 {editKey.replace(/-/g, '. ')} 일정
            </h2>
            <p className="text-slate-400 text-xs mb-4">
              구장 · 시간 · 예약자를 입력하세요. 확정하면 달력에 노란색으로 표시됩니다.
            </p>

            {/* 메모 */}
            <div className="mb-4">
              <label className="block text-slate-300 text-sm font-medium mb-1">
                ★ 메모 <span className="text-slate-500 text-xs">(달력에 빨간 글씨로 표시)</span>
              </label>
              <textarea
                value={editMemo}
                onChange={(e) => setEditMemo(e.target.value)}
                rows={3}
                placeholder={'예)\n★10월분 예약\n10시. 인천대공원.원적산'}
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* 일정 항목들 */}
            <label className="block text-slate-300 text-sm font-medium mb-2">일정 항목</label>
            <div className="space-y-2 mb-3">
              {editRows.map((r, idx) => (
                <div key={idx} className="flex flex-wrap items-center gap-2 bg-slate-900/60 rounded-lg p-2">
                  <input
                    type="text"
                    value={r.venue}
                    onChange={(e) => updateRow(idx, 'venue', e.target.value)}
                    placeholder="구장 (예: 삼산체육관)"
                    className="flex-1 min-w-[130px] bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                  <input
                    type="text"
                    value={r.time}
                    onChange={(e) => updateRow(idx, 'time', e.target.value)}
                    placeholder="시간 (예: 20시)"
                    className="w-[100px] bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                  <input
                    type="text"
                    list="player-name-list"
                    value={r.reserver}
                    onChange={(e) => updateRow(idx, 'reserver', e.target.value)}
                    placeholder="예약자 (선수 검색)"
                    className="w-[150px] bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />

                  <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none px-2">
                    <input
                      type="checkbox"
                      checked={r.is_confirmed}
                      onChange={(e) => updateRow(idx, 'is_confirmed', e.target.checked)}
                      className="w-4 h-4 accent-yellow-400"
                    />
                    <span className={r.is_confirmed ? 'text-yellow-300 font-semibold' : 'text-slate-400'}>
                      확정
                    </span>
                  </label>

                  <button
                    onClick={() => removeRow(idx)}
                    className="text-red-400 hover:text-red-300 text-sm px-2"
                    title="이 항목 삭제"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            {/* 선수 이름 자동완성 목록 */}
            <datalist id="player-name-list">
              {players.map((p) => (
                <option key={p.id} value={p.name} />
              ))}
            </datalist>

            <button
              onClick={addRow}
              className="text-emerald-400 hover:text-emerald-300 text-sm mb-5"
            >
              + 일정 추가
            </button>

            {/* 액션 버튼 (2배 크기) */}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setEditKey(null)}
                disabled={saving}
                className="bg-slate-700 hover:bg-slate-600 text-white px-8 py-4 rounded-xl text-lg font-medium transition-colors disabled:opacity-50"
              >
                취소
              </button>
              <button
                onClick={saveDay}
                disabled={saving}
                className="bg-emerald-500 hover:bg-emerald-600 text-white px-10 py-4 rounded-xl text-lg font-bold transition-colors disabled:opacity-50"
              >
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ⬇️ 하단 여백 */}
      <div style={{ height: '40px', width: '100%' }} aria-hidden="true"></div>
    </div>
  )
}

export default CalendarPage