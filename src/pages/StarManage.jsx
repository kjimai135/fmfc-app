import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import StarBadge from '../components/StarBadge'

// 🎁 교환 기준 (별 10개 = 1회)
const EXCHANGE_UNIT = 10

// ⭐ 별 수여 사유
const REASONS = [
  { key: '리그우승', label: '리그 우승', icon: '🏆', color: '#fbbf24' },
  { key: '득점왕', label: '득점왕', icon: '👟', color: '#10b981' },
  { key: '베스트 플레이어', label: '베스트 플레이어', icon: '📊', color: '#60a5fa' },
  { key: '챔스우승', label: '챔스 우승', icon: '👑', color: '#f59e0b' },
  { key: '챔스MVP', label: '챔스 MVP', icon: '⭐', color: '#a78bfa' },
  { key: '주장', label: '주장', icon: '🎖️', color: '#f472b6' },
  { key: '수동', label: '수동 지급', icon: '✍️', color: '#94a3b8' },
]

const LEGACY_REASON_MAP = { '출석왕': '베스트 플레이어' }

function normalizeReason(key) {
  return LEGACY_REASON_MAP[key] || key
}

function reasonInfo(key) {
  const k = normalizeReason(key)
  return REASONS.find(r => r.key === k) || { key: k, label: k, icon: '⭐', color: '#94a3b8' }
}

function fmtDate(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const pad = (n) => String(n).padStart(2, '0')
  return `${String(d.getFullYear()).slice(2)}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`
}

function StarManage() {
  const { role } = useAuth()
  const canEdit = role === 'admin' || role === 'executive'

  const [stars, setStars] = useState([])
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [search, setSearch] = useState('')
  const [viewFilter, setViewFilter] = useState('all') // all | ready | has | none | used
  const [expanded, setExpanded] = useState(null)

  // ✏️ 편집 모드 (선수 단위)
  const [editMode, setEditMode] = useState(false)
  const [editRows, setEditRows] = useState({}) // { [starId]: { season, reason, note, deleted } }

  // 수동 지급 폼
  const [showAddForm, setShowAddForm] = useState(false)
  const [addPlayerId, setAddPlayerId] = useState('')
  const [addSeason, setAddSeason] = useState('')
  const [addReason, setAddReason] = useState('수동')
  const [addNote, setAddNote] = useState('')

  useEffect(() => {
    fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 🔍 검색어·필터가 바뀌면 펼침·편집 초기화
  useEffect(() => {
    setExpanded(null)
    setEditMode(false)
    setEditRows({})
  }, [search, viewFilter])

  async function fetchAll() {
    setLoading(true)
    const [starRes, playerRes, seasonRes] = await Promise.all([
      supabase.from('player_stars').select('*').order('season', { ascending: true }),
      supabase.from('players').select('id, name, current_team, is_active').order('name'),
      supabase.from('app_settings').select('value').eq('key', 'season_label').single(),
    ])
    setStars(starRes.data || [])
    setPlayers((playerRes.data || []).filter(p => p.is_active !== false))
    if (seasonRes.data?.value && !addSeason) setAddSeason(seasonRes.data.value)
    setLoading(false)
  }

  async function addStar() {
    if (!canEdit) return
    if (!addPlayerId) return alert('선수를 선택해 주세요.')
    if (!addSeason.trim()) return alert('시즌을 입력해 주세요. (예: 2026-05)')

    const player = players.find(p => p.id === addPlayerId)
    if (!player) return

    setSaving(true)
    const { error } = await supabase.from('player_stars').insert({
      player_id: player.id,
      player_name: player.name,
      season: addSeason.trim(),
      reason: addReason,
      note: addNote.trim() || null,
    })
    setSaving(false)

    if (error) alert('별 지급에 실패했습니다: ' + error.message)
    else { setAddPlayerId(''); setAddNote(''); fetchAll() }
  }

  // ✏️ 편집 시작
  function startEdit(items) {
    const rows = {}
    for (const s of items) {
      rows[s.id] = {
        season: s.season || '',
        reason: normalizeReason(s.reason),
        note: s.note || '',
        deleted: false,
      }
    }
    setEditRows(rows)
    setEditMode(true)
  }

  function cancelEdit() {
    setEditMode(false)
    setEditRows({})
  }

  function updateRow(id, field, value) {
    setEditRows(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }

  function toggleDelete(id) {
    setEditRows(prev => ({ ...prev, [id]: { ...prev[id], deleted: !prev[id].deleted } }))
  }

  // 💾 일괄 저장
  async function saveAll(items) {
    if (!canEdit) return

    const updates = []
    const deletes = []

    for (const s of items) {
      const row = editRows[s.id]
      if (!row) continue

      if (row.deleted) {
        deletes.push(s.id)
        continue
      }
      if (!row.season.trim()) {
        return alert('시즌은 비워둘 수 없습니다.')
      }
      const changed =
        row.season.trim() !== (s.season || '') ||
        row.reason !== normalizeReason(s.reason) ||
        (row.note.trim() || null) !== (s.note || null)

      if (changed) {
        updates.push({
          id: s.id,
          season: row.season.trim(),
          reason: row.reason,
          note: row.note.trim() || null,
        })
      }
    }

    if (updates.length === 0 && deletes.length === 0) {
      cancelEdit()
      return
    }

    let msg = ''
    if (updates.length) msg += `· 수정 ${updates.length}건\n`
    if (deletes.length) msg += `· 삭제 ${deletes.length}건\n`
    if (!window.confirm(`변경 내용을 저장할까요?\n\n${msg}\n※ 삭제는 되돌릴 수 없습니다.`)) return

    setSaving(true)
    try {
      for (const u of updates) {
        const { id, ...fields } = u
        const { error } = await supabase.from('player_stars').update(fields).eq('id', id)
        if (error) throw error
      }
      if (deletes.length) {
        const { error } = await supabase.from('player_stars').delete().in('id', deletes)
        if (error) throw error
      }
      cancelEdit()
      await fetchAll()
    } catch (e) {
      alert('저장에 실패했습니다: ' + (e.message || e))
    } finally {
      setSaving(false)
    }
  }

  // 🎁 10개 교환 처리 (오래된 시즌부터 차감)
  async function exchange(playerName, remainList) {
    if (!canEdit) return
    const remain = remainList.length
    const times = Math.floor(remain / EXCHANGE_UNIT)
    if (times < 1) return alert(`별 ${EXCHANGE_UNIT}개 이상부터 교환할 수 있습니다. (현재 ${remain}개)`)

    let cnt = 1
    if (times > 1) {
      const input = window.prompt(
        `'${playerName}' 님 · 잔량 ${remain}개\n최대 ${times}회 교환 가능합니다.\n\n몇 회 교환할까요?`,
        '1'
      )
      if (input === null) return
      cnt = parseInt(input, 10)
      if (isNaN(cnt) || cnt < 1) return alert('1 이상의 숫자를 입력해 주세요.')
      if (cnt > times) return alert(`최대 ${times}회까지만 가능합니다.`)
    } else {
      if (!window.confirm(`'${playerName}' 님의 별 ${EXCHANGE_UNIT}개를 교환 처리할까요?\n\n잔량 ${remain} → ${remain - EXCHANGE_UNIT}`)) return
    }

    const memo = window.prompt('교환 내용 (선택)\n예: 유니폼, 상품권, 회비 차감', '') || null
    const useCount = cnt * EXCHANGE_UNIT

    const targets = [...remainList]
      .sort((a, b) => (a.season || '').localeCompare(b.season || '') || (a.id > b.id ? 1 : -1))
      .slice(0, useCount)
      .map(s => s.id)

    setSaving(true)
    const { error } = await supabase
      .from('player_stars')
      .update({ used_at: new Date().toISOString(), used_note: memo })
      .in('id', targets)
    setSaving(false)

    if (error) alert('교환 처리에 실패했습니다: ' + error.message)
    else fetchAll()
  }

  // ↩️ 사용 취소 (선수 단위 · 최근 사용분부터 되돌림)
  async function cancelUse(playerName, usedList) {
    if (!canEdit) return
    if (usedList.length === 0) return alert('사용 기록이 없습니다.')

    const input = window.prompt(
      `'${playerName}' 님의 사용 기록을 되돌립니다.\n사용 ${usedList.length}개 · 최근 사용분부터 복구됩니다.\n\n몇 개를 되돌릴까요?`,
      String(Math.min(EXCHANGE_UNIT, usedList.length))
    )
    if (input === null) return

    const cnt = parseInt(input, 10)
    if (isNaN(cnt) || cnt < 1) return alert('1 이상의 숫자를 입력해 주세요.')
    if (cnt > usedList.length) return alert(`사용 개수(${usedList.length})보다 많이 되돌릴 수 없습니다.`)

    const targets = [...usedList]
      .sort((a, b) => new Date(b.used_at) - new Date(a.used_at))
      .slice(0, cnt)
      .map(s => s.id)

    setSaving(true)
    const { error } = await supabase
      .from('player_stars')
      .update({ used_at: null, used_note: null })
      .in('id', targets)
    setSaving(false)

    if (error) alert('취소에 실패했습니다: ' + error.message)
    else fetchAll()
  }

  // 👥 선수별 집계 — 활성 선수만 (탈퇴자 제외 · 별 0개도 포함)
  const allPlayers = (() => {
    const map = {}

    // 1) 활성 선수 전원 등록
    for (const p of players) {
      map[p.id] = {
        key: p.id,
        name: p.name,
        team: p.current_team || '',
        count: 0, used: 0, remain: 0,
        reasons: {}, items: [], remainItems: [], usedItems: [],
      }
    }

    // 2) 별 기록 반영 — 활성 선수 것만 (탈퇴자 기록은 무시)
    for (const s of stars) {
      const key = s.player_id
      if (!key || !map[key]) continue

      const rk = normalizeReason(s.reason)
      map[key].count++
      if (s.used_at) { map[key].used++; map[key].usedItems.push(s) }
      else { map[key].remain++; map[key].remainItems.push(s) }
      map[key].reasons[rk] = (map[key].reasons[rk] || 0) + 1
      map[key].items.push(s)
    }

    return Object.values(map).map(p => ({
      ...p,
      times: Math.floor(p.remain / EXCHANGE_UNIT),
      progress: p.remain % EXCHANGE_UNIT,
    }))
  })()

  // 상단 통계도 활성 선수 기준
  const totalAll = allPlayers.reduce((s, p) => s + p.count, 0)
  const totalUsed = allPlayers.reduce((s, p) => s + p.used, 0)
  const totalRemain = allPlayers.reduce((s, p) => s + p.remain, 0)

  const byPlayer = (() => {
    let list = [...allPlayers]
    const q = search.trim()
    if (q) list = list.filter(p => (p.name || '').includes(q))
    if (viewFilter === 'ready') list = list.filter(p => p.times > 0)
    if (viewFilter === 'has') list = list.filter(p => p.remain > 0)
    if (viewFilter === 'none') list = list.filter(p => p.remain === 0)
    if (viewFilter === 'used') list = list.filter(p => p.used > 0)

    return list.sort((a, b) => {
      if (b.times !== a.times) return b.times - a.times
      if (b.remain !== a.remain) return b.remain - a.remain
      if (b.count !== a.count) return b.count - a.count
      return (a.name || '').localeCompare(b.name || '')
    })
  })()

  const inputClass =
    'w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-emerald-500'
  const editInputClass =
    'bg-slate-800 border border-slate-600 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-emerald-500'

  return (
    <div className="max-w-3xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-end justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-white">⭐ 별 현황</h1>
          <p className="text-slate-500 text-sm mt-1">별 {EXCHANGE_UNIT}개 = 교환 1회</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-slate-400">총 <b className="text-slate-200 text-base">{totalAll}</b></span>
          <span className="text-slate-700">·</span>
          <span className="text-slate-400">사용 <b className="text-slate-200 text-base">{totalUsed}</b></span>
          <span className="text-slate-700">·</span>
          <span className="text-emerald-400">잔량 <b className="text-base">{totalRemain}</b></span>
        </div>
      </div>

      {!canEdit && (
        <p className="bg-sky-500/10 border border-sky-500/30 rounded-lg px-4 py-2.5 mb-4 text-sky-200 text-sm">
          👀 열람 전용 · 지급·교환·수정은 관리자·임원만 가능합니다.
        </p>
      )}

      {canEdit && (
        <p className="text-slate-500 text-xs mb-3">
          💡 <span className="text-amber-400 font-semibold">🎁 ×N</span> 배지를 누르면 교환 처리됩니다.
        </p>
      )}

      {/* 검색 + 필터 */}
      <div className="flex gap-2 mb-4">
        <div className="flex-1 relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="선수 검색"
            className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-3.5 pr-9 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-base leading-none"
              title="검색어 지우기"
            >
              ✕
            </button>
          )}
        </div>
        <select
          value={viewFilter}
          onChange={(e) => setViewFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-emerald-500"
        >
          <option value="all">전체</option>
          <option value="ready">🎁 교환 가능</option>
          <option value="has">별 보유</option>
          <option value="none">별 없음</option>
          <option value="used">사용 이력</option>
        </select>
        {canEdit && (
          <button
            onClick={() => setShowAddForm(v => !v)}
            className="bg-slate-700 hover:bg-slate-600 text-white text-sm font-semibold px-4 py-2.5 rounded-lg whitespace-nowrap"
          >
            {showAddForm ? '✕' : '＋ 지급'}
          </button>
        )}
      </div>

      {/* 수동 지급 폼 */}
      {canEdit && showAddForm && (
        <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-3 mb-4 grid grid-cols-2 gap-2">
          <select value={addPlayerId} onChange={(e) => setAddPlayerId(e.target.value)} className={inputClass}>
            <option value="">선수 선택</option>
            {players.map(p => (
              <option key={p.id} value={p.id}>{p.name}{p.current_team ? ` (${p.current_team})` : ''}</option>
            ))}
          </select>
          <input type="text" value={addSeason} onChange={(e) => setAddSeason(e.target.value)} placeholder="시즌 (2026-05)" className={inputClass} />
          <select value={addReason} onChange={(e) => setAddReason(e.target.value)} className={inputClass}>
            {REASONS.map(r => <option key={r.key} value={r.key}>{r.icon} {r.label}</option>)}
          </select>
          <input type="text" value={addNote} onChange={(e) => setAddNote(e.target.value)} placeholder="비고 (선택)" className={inputClass} />
          <button
            onClick={addStar}
            disabled={saving}
            className="col-span-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-bold py-2.5 rounded-lg"
          >
            {saving ? '지급 중...' : '⭐ 지급하기'}
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-20 text-slate-400">불러오는 중...</div>
      ) : byPlayer.length === 0 ? (
        <div className="text-center py-16 text-slate-500 border border-dashed border-slate-700 rounded-xl">
          표시할 선수가 없습니다
        </div>
      ) : (
        <div className="space-y-1.5">
          {byPlayer.map((p, idx) => {
            const isOpen = expanded === p.key
            const ready = p.times > 0
            const empty = p.count === 0
            const pct = Math.round((p.progress / EXCHANGE_UNIT) * 100)
            const editing = isOpen && editMode
            const sortedItems = [...p.items].sort((a, b) => (b.season || '').localeCompare(a.season || ''))

            return (
              <div
                key={p.key}
                className="rounded-lg overflow-hidden border transition-colors"
                style={{
                  borderColor: ready ? 'rgba(245,158,11,0.45)' : 'rgba(51,65,85,0.7)',
                  background: ready ? 'rgba(245,158,11,0.07)' : 'rgba(30,41,59,0.6)',
                  opacity: empty ? 0.6 : 1,
                }}
              >
                {/* 요약 행 */}
                <div
                  onClick={() => {
                    if (editing || empty) return
                    setExpanded(isOpen ? null : p.key)
                    setEditMode(false)
                    setEditRows({})
                  }}
                  className={`flex items-center gap-3 px-3.5 py-3 transition-colors ${
                    editing || empty ? '' : 'cursor-pointer hover:bg-slate-700/30'
                  }`}
                >
                  <span className="text-slate-600 text-sm font-bold w-6 text-right flex-shrink-0">{idx + 1}</span>
                  <span className="text-white text-base font-bold w-20 flex-shrink-0 truncate">{p.name}</span>

                  {/* ⭐ 잔량 (별 안에 숫자) */}
                  <span className="flex items-center justify-center flex-shrink-0 w-9">
                    <StarBadge count={p.remain} size={34} title={`잔량 ${p.remain}개`} />
                  </span>

                  {/* 진행 바 */}
                  <span className="flex-1 min-w-[60px] hidden sm:flex items-center gap-2">
                    <span className="flex-1 h-2 rounded-full bg-slate-700/70 overflow-hidden">
                      <span
                        className="block h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, background: ready ? '#f59e0b' : '#475569' }}
                      />
                    </span>
                    <span className="text-slate-500 text-xs w-9 flex-shrink-0">{p.progress}/{EXCHANGE_UNIT}</span>
                  </span>

                  {/* 🎁 교환 배지 (관리자는 클릭 = 교환 처리) */}
                  <span className="ml-auto flex items-center gap-2 flex-shrink-0">
                    {ready && (
                      canEdit && !editing ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); exchange(p.name, p.remainItems) }}
                          disabled={saving}
                          className="px-3 py-1.5 rounded text-xs font-black bg-amber-500 hover:bg-amber-400 active:scale-95 disabled:opacity-50 text-slate-900 shadow-sm shadow-amber-500/30 transition-all"
                          title={`클릭하면 별 ${EXCHANGE_UNIT}개 교환 처리`}
                        >
                          🎁 ×{p.times}
                        </button>
                      ) : (
                        <span className="px-2.5 py-1 rounded text-xs font-black bg-amber-500 text-slate-900">
                          🎁 ×{p.times}
                        </span>
                      )
                    )}
                    <span className="text-slate-600 text-sm w-3">
                      {empty ? '' : (isOpen ? '▲' : '▼')}
                    </span>
                  </span>
                </div>

                {/* 펼침 상세 */}
                {isOpen && !empty && (
                  <div className="border-t border-slate-700/50 bg-slate-900/50">
                    {/* 상세 헤더 — 편집 / 사용취소 버튼 */}
                    <div className="flex items-center gap-2 px-3.5 py-2 border-b border-slate-700/40 flex-wrap">
                      <span className="text-slate-500 text-xs">
                        총 {p.count} · 사용 {p.used} · 잔량 {p.remain}
                      </span>

                      {canEdit && (
                        <span className="ml-auto flex items-center gap-1.5">
                          {editing ? (
                            <>
                              <button
                                onClick={() => saveAll(sortedItems)}
                                disabled={saving}
                                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold px-3.5 py-1.5 rounded"
                              >
                                {saving ? '저장 중...' : '💾 저장'}
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs px-3 py-1.5 rounded"
                              >
                                취소
                              </button>
                            </>
                          ) : (
                            <>
                              {p.used > 0 && (
                                <button
                                  onClick={() => cancelUse(p.name, p.usedItems)}
                                  disabled={saving}
                                  className="text-emerald-400 hover:bg-emerald-500/10 border border-emerald-500/30 text-xs px-3 py-1.5 rounded"
                                  title="사용 기록 되돌리기"
                                >
                                  ↩️ 사용 취소
                                </button>
                              )}
                              <button
                                onClick={() => startEdit(sortedItems)}
                                className="bg-slate-700 hover:bg-slate-600 text-slate-100 text-xs font-semibold px-3.5 py-1.5 rounded"
                              >
                                ✏️ 편집
                              </button>
                            </>
                          )}
                        </span>
                      )}
                    </div>

                    {/* 사유 요약 (보기 모드에서만) */}
                    {!editing && (
                      <div className="flex flex-wrap items-center gap-1.5 px-3.5 py-2.5 border-b border-slate-700/30">
                        {Object.entries(p.reasons).map(([reason, cnt]) => {
                          const info = reasonInfo(reason)
                          return (
                            <span
                              key={reason}
                              className="px-2 py-0.5 rounded text-xs font-bold"
                              style={{ background: `${info.color}1f`, color: info.color }}
                            >
                              {info.icon} {info.label} ×{cnt}
                            </span>
                          )
                        })}
                      </div>
                    )}

                    {editing && (
                      <p className="px-3.5 py-2 text-amber-300/80 text-[11px] bg-amber-500/5 border-b border-slate-700/30">
                        시즌·사유·비고를 수정하고 저장하세요. 지울 항목은 우측 ✕ 를 눌러 표시합니다.
                      </p>
                    )}

                    {/* 목록 */}
                    <div className="divide-y divide-slate-800/70 max-h-96 overflow-y-auto">
                      {sortedItems.map(s => {
                        const info = reasonInfo(s.reason)
                        const used = !!s.used_at

                        // ✏️ 편집 모드
                        if (editing) {
                          const row = editRows[s.id]
                          if (!row) return null
                          return (
                            <div
                              key={s.id}
                              className={`flex items-center gap-1.5 px-3.5 py-2 ${row.deleted ? 'bg-red-500/10' : ''}`}
                            >
                              <input
                                type="text"
                                value={row.season}
                                onChange={(e) => updateRow(s.id, 'season', e.target.value)}
                                disabled={row.deleted}
                                placeholder="시즌"
                                className={`${editInputClass} w-[74px] flex-shrink-0 ${row.deleted ? 'line-through opacity-50' : ''}`}
                              />
                              <select
                                value={row.reason}
                                onChange={(e) => updateRow(s.id, 'reason', e.target.value)}
                                disabled={row.deleted}
                                className={`${editInputClass} flex-shrink-0 ${row.deleted ? 'opacity-50' : ''}`}
                              >
                                {REASONS.map(r => (
                                  <option key={r.key} value={r.key}>{r.icon} {r.label}</option>
                                ))}
                              </select>
                              <input
                                type="text"
                                value={row.note}
                                onChange={(e) => updateRow(s.id, 'note', e.target.value)}
                                disabled={row.deleted}
                                placeholder="비고"
                                className={`${editInputClass} flex-1 min-w-[60px] ${row.deleted ? 'opacity-50' : ''}`}
                              />
                              {used && <span className="text-slate-600 text-[10px] flex-shrink-0">사용</span>}
                              <button
                                onClick={() => toggleDelete(s.id)}
                                className={`flex-shrink-0 text-xs px-2 py-1 rounded transition-colors ${
                                  row.deleted
                                    ? 'bg-red-500/25 text-red-300'
                                    : 'text-slate-500 hover:text-red-300 hover:bg-red-500/10'
                                }`}
                                title={row.deleted ? '삭제 취소' : '삭제 표시'}
                              >
                                {row.deleted ? '↺' : '✕'}
                              </button>
                            </div>
                          )
                        }

                        // 보기 모드
                        return (
                          <div key={s.id} className={`flex items-center gap-2.5 px-3.5 py-2 text-sm ${used ? 'opacity-45' : ''}`}>
                            <span className="text-slate-500 w-16 flex-shrink-0">{s.season}</span>
                            <span className="flex-shrink-0 font-medium" style={{ color: info.color }}>
                              {info.icon} {info.label}
                            </span>
                            {s.note && <span className="text-slate-600 text-xs truncate hidden sm:inline">· {s.note}</span>}
                            {used && (
                              <span className="ml-auto text-slate-500 text-xs flex-shrink-0">
                                사용 {fmtDate(s.used_at)}{s.used_note ? ` · ${s.used_note}` : ''}
                              </span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div style={{ height: '70px', width: '100%' }} aria-hidden="true"></div>
    </div>
  )
}

export default StarManage