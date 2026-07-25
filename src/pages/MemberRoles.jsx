import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const ROLE_OPTIONS = [
  { value: 'admin', label: '관리자' },
  { value: 'executive', label: '임원' },
  { value: 'captain', label: '주장·부주장' },
  { value: 'member', label: '정회원' },
  { value: 'associate', label: '준회원' },
]

const ROLE_LABELS = {
  admin: '관리자',
  executive: '임원',
  captain: '주장·부주장',
  member: '정회원',
  associate: '준회원',
}

const ROLE_COLORS = {
  admin: 'bg-red-500/20 text-red-300 border-red-500/40',
  executive: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
  captain: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
  member: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  associate: 'bg-slate-500/20 text-slate-300 border-slate-500/40',
}

function MemberRoles() {
  const { user } = useAuth()
  const [profiles, setProfiles] = useState([])
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetchAll()
  }, [])

  async function fetchAll() {
    setLoading(true)
    const [profRes, playerRes] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: true }),
      supabase.from('players').select('id, name').order('name', { ascending: true }),
    ])

    if (profRes.error) {
      console.error('회원 목록 불러오기 오류:', profRes.error)
      alert('회원 목록을 불러오지 못했습니다.')
    } else {
      setProfiles(profRes.data || [])
    }

    if (playerRes.error) {
      console.error('선수 목록 불러오기 오류:', playerRes.error)
    } else {
      setPlayers(playerRes.data || [])
    }

    setLoading(false)
  }

  async function changeRole(profileId, newRole) {
    if (profileId === user?.id && newRole !== 'admin') {
      const ok = confirm('본인의 권한을 변경하려고 합니다. 관리자 권한을 잃으면 이 화면에 다시 들어올 수 없습니다. 계속할까요?')
      if (!ok) return
    }

    setSavingId(profileId)
    const { error } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', profileId)

    if (error) {
      console.error('권한 변경 오류:', error)
      alert('권한 변경에 실패했습니다.')
    } else {
      setProfiles((prev) =>
        prev.map((p) => (p.id === profileId ? { ...p, role: newRole } : p))
      )
    }
    setSavingId(null)
  }

  async function changePlayer(profileId, newPlayerId) {
    setSavingId(profileId)
    const value = newPlayerId === '' ? null : newPlayerId
    const { error } = await supabase
      .from('profiles')
      .update({ player_id: value })
      .eq('id', profileId)

    if (error) {
      console.error('선수 연결 오류:', error)
      alert('선수 연결에 실패했습니다.')
    } else {
      setProfiles((prev) =>
        prev.map((p) => (p.id === profileId ? { ...p, player_id: value } : p))
      )
    }
    setSavingId(null)
  }

  const linkedPlayerIds = new Set(
    profiles.map((p) => p.player_id).filter(Boolean)
  )

  const filtered = profiles.filter((p) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return (
      (p.name || '').toLowerCase().includes(q) ||
      (p.email || '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-1">🔑 회원 권한 관리</h1>
      <p className="text-slate-400 text-sm mb-6">
        회원의 권한을 변경하고, 선수 정보를 연결할 수 있습니다. (관리자·임원 전용)
      </p>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="이름 또는 이메일로 검색"
        className="w-full mb-4 bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
      />

      {loading ? (
        <div className="text-center text-slate-400 py-10">⏳ 불러오는 중...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-slate-400 py-10">회원이 없습니다.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => {
            const linkedPlayer = players.find((pl) => pl.id === p.player_id)
            // 준회원이면서 선수가 연결돼 있으면 = 정회원 요청 상태
            const isRequesting = p.role === 'associate' && !!p.player_id
            return (
              <div
                key={p.id}
                className={`bg-slate-800 border rounded-xl px-4 py-3 ${isRequesting ? 'border-amber-500/50' : 'border-slate-700'}`}
              >
                {/* 상단: 이름 + 권한 뱃지 + 요청 뱃지 */}
                <div className="flex items-center gap-2 flex-wrap mb-3">
                  <span className="text-white font-medium">{p.name || '(이름 없음)'}</span>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full border ${ROLE_COLORS[p.role] || ''}`}>
                    {ROLE_LABELS[p.role] || p.role}
                  </span>
                  {isRequesting && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full border bg-amber-500/20 text-amber-300 border-amber-500/40">
                      🙋 정회원 요청
                    </span>
                  )}
                  {p.id === user?.id && (
                    <span className="text-[11px] text-emerald-400">(나)</span>
                  )}
                  {linkedPlayer && (
                    <span className="text-[11px] text-sky-300">🔗 {linkedPlayer.name}</span>
                  )}
                </div>
                <div className="text-slate-400 text-xs mb-3 truncate">{p.email}</div>

                {/* 하단: 권한 변경 + 선수 연결 */}
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="flex-1">
                    <label className="block text-slate-500 text-[11px] mb-1">권한</label>
                    <select
                      value={p.role}
                      disabled={savingId === p.id}
                      onChange={(e) => changeRole(p.id, e.target.value)}
                      className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                    >
                      {ROLE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex-1">
                    <label className="block text-slate-500 text-[11px] mb-1">선수 연결</label>
                    <select
                      value={p.player_id || ''}
                      disabled={savingId === p.id}
                      onChange={(e) => changePlayer(p.id, e.target.value)}
                      className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                    >
                      <option value="">— 연결 안 함 —</option>
                      {players.map((pl) => {
                        const isLinkedByOther = linkedPlayerIds.has(pl.id) && pl.id !== p.player_id
                        return (
                          <option key={pl.id} value={pl.id} disabled={isLinkedByOther}>
                            {pl.name}{isLinkedByOther ? ' (연결됨)' : ''}
                          </option>
                        )
                      })}
                    </select>
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

export default MemberRoles