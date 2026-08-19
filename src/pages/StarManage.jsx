import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

// ⭐ 별 수여 사유
const REASONS = [
  { key: '리그우승', label: '🏆 리그 우승', color: '#fbbf24' },
  { key: '득점왕', label: '👟 득점왕', color: '#10b981' },
  { key: '베스트 플레이어', label: '📊 베스트 플레이어', color: '#60a5fa' },
  { key: '챔스우승', label: '👑 챔스 우승', color: '#f59e0b' },
  { key: '챔스MVP', label: '⭐ 챔스 MVP', color: '#a78bfa' },
  { key: '주장', label: '🎖️ 주장', color: '#f472b6' },
  { key: '수동', label: '✍️ 수동 지급', color: '#94a3b8' },
]

// 🔁 예전 사유명 → 현재 사유명 (구 데이터 호환)
const LEGACY_REASON_MAP = {
  '출석왕': '베스트 플레이어',
}

function normalizeReason(key) {
  return LEGACY_REASON_MAP[key] || key
}

function reasonInfo(key) {
  const k = normalizeReason(key)
  return REASONS.find(r => r.key === k) || { key: k, label: k, color: '#94a3b8' }
}

function fmtDate(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function StarManage() {
  const { role } = useAuth()
  const canEdit = role === 'admin' || role === 'executive'

  const [stars, setStars] = useState([])
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // 필터
  const [seasonFilter, setSeasonFilter] = useState('all')
  const [usedFilter, setUsedFilter] = useState('all') // all | remain | used
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState('player') // 'player' | 'history'

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

  // ⭐ 수동 지급
  async function addStar() {
    if (!canEdit) return
    if (!addPlayerId) {
      alert('선수를 선택해 주세요.')
      return
    }
    if (!addSeason.trim()) {
      alert('시즌을 입력해 주세요. (예: 2026-05)')
      return
    }

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

    if (error) {
      console.error('별 지급 오류:', error)
      alert('별 지급에 실패했습니다: ' + error.message)
    } else {
      setAddPlayerId('')
      setAddNote('')
      fetchAll()
    }
  }

  // 🗑️ 별 삭제
  async function deleteStar(star) {
    if (!canEdit) return
    if (!window.confirm(
      `'${star.player_name}' 님의 별을 삭제할까요?\n\n` +
      `· 시즌: ${star.season}\n· 사유: ${reasonInfo(star.reason).label}`
    )) return

    const { error } = await supabase.from('player_stars').delete().eq('id', star.id)
    if (error) {
      console.error('별 삭제 오류:', error)
      alert('삭제에 실패했습니다: ' + error.message)
    } else {
      fetchAll()
    }
  }

  // ⬇️ 뱃지 사용 처리 (오래된 시즌부터 FIFO)
  async function useStars(playerName, remainList) {
    if (!canEdit) return
    const remain = remainList.length
    if (remain === 0) {
      alert('사용 가능한 잔량이 없습니다.')
      return
    }

    const input = window.prompt(
      `'${playerName}' 님의 뱃지를 몇 개 사용할까요?\n(잔량 ${remain}개 · 오래된 시즌부터 차감됩니다)`,
      '1'
    )
    if (input === null) return

    const cnt = parseInt(input, 10)
    if (isNaN(cnt) || cnt < 1) {
      alert('1 이상의 숫자를 입력해 주세요.')
      return
    }
    if (cnt > remain) {
      alert(`잔량(${remain}개)보다 많이 사용할 수 없습니다.`)
      return
    }

    const memo = window.prompt('사용 메모 (선택)', '') || null

    // 오래된 시즌 순 정렬 후 앞에서 cnt개
    const targets = [...remainList]
      .sort((a, b) => (a.season || '').localeCompare(b.season || '') || (a.id > b.id ? 1 : -1))
      .slice(0, cnt)
      .map(s => s.id)

    setSaving(true)
    const { error } = await supabase
      .from('player_stars')
      .update({ used_at: new Date().toISOString(), used_note: memo })
      .in('id', targets)
    setSaving(false)

    if (error) {
      console.error('사용 처리 오류:', error)
      alert('사용 처리에 실패했습니다: ' + error.message)
    } else {
      fetchAll()
    }
  }

  // ↩️ 사용 취소
  async function cancelUse(star) {
    if (!canEdit) return
    if (!window.confirm(
      `'${star.player_name}' 님의 사용 기록을 취소할까요?\n\n` +
      `· 시즌: ${star.season}\n· 사유: ${reasonInfo(star.reason).label}\n· 사용일: ${fmtDate(star.used_at)}`
    )) return

    const { error } = await supabase
      .from('player_stars')
      .update({ used_at: null, used_note: null })
      .eq('id', star.id)

    if (error) {
      console.error('사용 취소 오류:', error)
      alert('취소에 실패했습니다: ' + error.message)
    } else {
      fetchAll()
    }
  }

  // 시즌 목록
  const seasons = [...new Set(stars.map(s => s.season).filter(Boolean))].sort((a, b) => b.localeCompare(a))

  // 전체 통계
  const totalAll = stars.length
  const totalUsed = stars.filter(s => s.used_at).length
  const totalRemain = totalAll - totalUsed

  // 필터 적용
  const filteredStars = stars.filter(s => {
    if (seasonFilter !== 'all' && s.season !== seasonFilter) return false
    if (usedFilter === 'remain' && s.used_at) return false
    if (usedFilter === 'used' && !s.used_at) return false
    const q = search.trim()
    if (q && !(s.player_name || '').includes(q)) return false
    return true
  })

  // 지급 이력은 최신순
  const historyStars = [...filteredStars].sort(
    (a, b) => (b.season || '').localeCompare(a.season || '') || (b.id > a.id ? 1 : -1)
  )

  // 선수별 집계
  const byPlayer = (() => {
    const map = {}
    for (const s of filteredStars) {
      const key = s.player_id || s.player_name
      if (!map[key]) {
        map[key] = {
          player_id: s.player_id,
          name: s.player_name,
          count: 0,
          used: 0,
          remain: 0,
          reasons: {},
          items: [],
          remainItems: [],
        }
      }
      const rk = normalizeReason(s.reason)
      map[key].count++
      if (s.used_at) {
        map[key].used++
      } else {
        map[key].remain++
        map[key].remainItems.push(s)
      }
      map[key].reasons[rk] = (map[key].reasons[rk] || 0) + 1
      map[key].items.push(s)
    }
    return Object.values(map).sort((a, b) => {
      if (b.remain !== a.remain) return b.remain - a.remain
      if (b.count !== a.count) return b.count - a.count
      return (a.name || '').localeCompare(b.name || '')
    })
  })()

  const inputClass =
    'w-full bg-slate-900/80 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-emerald-500'

  return (
    <div className="max-w-4xl mx-auto">
      {/* 헤더 */}
      <div className="mb-4">
        <h1 className="text-3xl font-bold text-white">⭐ 별 관리</h1>
        <p className="text-slate-400 mt-1">시즌 종료 시 수여한 별과 사용 내역을 관리합니다.</p>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-6">
        {[
          { label: '총 별', value: totalAll, color: '#fbbf24', icon: '⭐' },
          { label: '사용', value: totalUsed, color: '#94a3b8', icon: '⬇️' },
          { label: '잔량', value: totalRemain, color: '#10b981', icon: '💎' },
        ].map(c => (
          <div
            key={c.label}
            className="rounded-xl border px-3 py-3 text-center"
            style={{ borderColor: `${c.color}40`, background: `${c.color}12` }}
          >
            <p className="text-slate-400 text-[11px] mb-1">{c.icon} {c.label}</p>
            <p className="font-black text-2xl" style={{ color: c.color }}>{c.value}</p>
          </div>
        ))}
      </div>

      {!canEdit && (
        <div className="bg-sky-500/10 border border-sky-500/30 rounded-xl px-4 py-3 mb-6 text-sky-200 text-sm">
          👀 열람 전용 화면입니다. 별 지급·사용·삭제는 관리자·임원만 가능합니다.
        </div>
      )}

      {/* 수동 지급 버튼 */}
      {canEdit && (
        <div className="mb-4">
          <button
            onClick={() => setShowAddForm(v => !v)}
            className="bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold px-4 py-2.5 rounded-lg transition-colors"
          >
            {showAddForm ? '✕ 닫기' : '⭐ 별 수동 지급'}
          </button>
        </div>
      )}

      {/* 수동 지급 폼 */}
      {canEdit && showAddForm && (
        <div className="bg-slate-800 border border-amber-500/40 rounded-xl p-4 mb-6">
          <p className="text-slate-300 text-sm mb-3">선수에게 별을 직접 지급합니다.</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-slate-400 text-xs mb-1.5">선수</label>
              <select
                value={addPlayerId}
                onChange={(e) => setAddPlayerId(e.target.value)}
                className={inputClass}
              >
                <option value="">— 선수 선택 —</option>
                {players.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}{p.current_team ? ` (${p.current_team})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-400 text-xs mb-1.5">시즌</label>
              <input
                type="text"
                value={addSeason}
                onChange={(e) => setAddSeason(e.target.value)}
                placeholder="예: 2026-05"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-slate-400 text-xs mb-1.5">사유</label>
              <select
                value={addReason}
                onChange={(e) => setAddReason(e.target.value)}
                className={inputClass}
              >
                {REASONS.map(r => (
                  <option key={r.key} value={r.key}>{r.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-400 text-xs mb-1.5">비고 (선택)</label>
              <input
                type="text"
                value={addNote}
                onChange={(e) => setAddNote(e.target.value)}
                placeholder="메모"
                className={inputClass}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={addStar}
              disabled={saving}
              className="bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white text-sm font-bold px-5 py-2 rounded-lg transition-colors"
            >
              {saving ? '지급 중...' : '⭐ 지급하기'}
            </button>
          </div>
        </div>
      )}

      {/* 필터 */}
      <div className="flex flex-col sm:flex-row gap-3 mb-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 선수 이름 검색"
          className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
        />
        <select
          value={seasonFilter}
          onChange={(e) => setSeasonFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-emerald-500"
        >
          <option value="all">전체 시즌</option>
          {seasons.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={usedFilter}
          onChange={(e) => setUsedFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-emerald-500"
        >
          <option value="all">전체</option>
          <option value="remain">💎 잔량만</option>
          <option value="used">⬇️ 사용만</option>
        </select>
      </div>

      {/* 보기 방식 */}
      <div className="flex gap-2 mb-6">
        {[
          { key: 'player', label: '👤 선수별' },
          { key: 'history', label: '📜 지급 이력' },
        ].map(v => (
          <button
            key={v.key}
            onClick={() => setViewMode(v.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              viewMode === v.key
                ? 'bg-emerald-500 text-white'
                : 'bg-slate-800 text-slate-300 border border-slate-600 hover:bg-slate-700'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-20 text-slate-400">⏳ 불러오는 중...</div>
      ) : filteredStars.length === 0 ? (
        <div className="text-center py-20 text-slate-400 bg-slate-800/40 border border-dashed border-slate-700 rounded-2xl">
          <p className="text-4xl mb-3">⭐</p>
          <p className="text-lg">표시할 별이 없습니다</p>
          {canEdit && <p className="text-sm mt-2">시즌 전환 시 자동 지급하거나, 수동으로 지급할 수 있습니다.</p>}
        </div>
      ) : viewMode === 'player' ? (
        /* 👤 선수별 집계 */
        <div className="space-y-2">
          {byPlayer.map((p, idx) => (
            <div
              key={p.player_id || p.name}
              className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3"
            >
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-slate-500 text-sm font-bold w-6">{idx + 1}</span>
                <span className="text-white font-bold">{p.name}</span>

                <span className="text-amber-400 font-black text-lg leading-none">
                  {'⭐'.repeat(Math.min(p.remain, 10))}
                  {p.remain > 10 && <span className="text-sm ml-1">×{p.remain}</span>}
                  {p.remain === 0 && <span className="text-slate-600 text-sm">— 잔량 없음</span>}
                </span>

                <span className="ml-auto flex items-center gap-2 flex-shrink-0">
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/20 text-emerald-300">
                    잔량 {p.remain}
                  </span>
                  {p.used > 0 && (
                    <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-600/40 text-slate-400">
                      사용 {p.used}
                    </span>
                  )}
                  <span className="text-slate-500 text-xs">총 {p.count}</span>
                </span>
              </div>

              {/* 사유별 뱃지 */}
              <div className="flex flex-wrap items-center gap-1.5 mt-2 pl-9">
                {Object.entries(p.reasons).map(([reason, cnt]) => {
                  const info = reasonInfo(reason)
                  return (
                    <span
                      key={reason}
                      className="px-2 py-0.5 rounded text-[11px] font-bold"
                      style={{ background: `${info.color}22`, color: info.color }}
                    >
                      {info.label}{cnt > 1 ? ` ×${cnt}` : ''}
                    </span>
                  )
                })}

                {canEdit && p.remain > 0 && (
                  <button
                    onClick={() => useStars(p.name, p.remainItems)}
                    disabled={saving}
                    className="ml-auto bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-200 text-[11px] font-bold px-2.5 py-1 rounded-lg transition-colors"
                    title="오래된 시즌부터 차감됩니다"
                  >
                    ⬇️ 사용 처리
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* 📜 지급 이력 */
        <div className="space-y-2">
          {historyStars.map(s => {
            const info = reasonInfo(s.reason)
            const used = !!s.used_at
            return (
              <div
                key={s.id}
                className={`border rounded-xl px-4 py-3 flex items-center gap-2.5 flex-wrap transition-colors ${
                  used
                    ? 'bg-slate-800/40 border-slate-700/50 opacity-60'
                    : 'bg-slate-800 border-slate-700'
                }`}
              >
                <span className={`text-lg ${used ? 'grayscale' : 'text-amber-400'}`}>⭐</span>
                <span className="text-white font-bold text-sm">{s.player_name}</span>
                <span
                  className="px-2 py-0.5 rounded text-[11px] font-bold"
                  style={{ background: `${info.color}22`, color: info.color }}
                >
                  {info.label}
                </span>
                <span className="text-slate-400 text-xs">{s.season}</span>
                {s.note && <span className="text-slate-500 text-xs">· {s.note}</span>}

                {used && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-600/40 text-slate-400">
                    사용 {fmtDate(s.used_at)}{s.used_note ? ` · ${s.used_note}` : ''}
                  </span>
                )}

                {canEdit && (
                  <span className="ml-auto flex items-center gap-1 flex-shrink-0">
                    {used && (
                      <button
                        onClick={() => cancelUse(s)}
                        className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 rounded px-2 py-1 text-xs transition-colors"
                        title="사용 취소 (잔량으로 복구)"
                      >
                        ↩️
                      </button>
                    )}
                    <button
                      onClick={() => deleteStar(s)}
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded px-2 py-1 text-xs transition-colors"
                      title="이 별 삭제"
                    >
                      🗑️
                    </button>
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* 하단 여백 */}
      <div style={{ height: '70px', width: '100%' }} aria-hidden="true"></div>
    </div>
  )
}

export default StarManage