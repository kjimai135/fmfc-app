import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

// 📱 전화번호 뒷 4자리 중 첫자리·끝자리만 노출 (예: 5678 → 5**8)
function maskPhoneTail(phone) {
  if (!phone) return null
  const digits = String(phone).replace(/\D/g, '')
  if (digits.length < 4) return null
  const tail = digits.slice(-4)
  return `${tail[0]}**${tail[3]}`
}

// 🏟️ 인천 시설공단 등록 동호회 목록
const INCHEON_CLUBS = [
  '쎄끈빠끈FC',
  '로또일등대기자',
  'FMFC',
  '초심FC',
  '백암선생',
  'FM',
  '범박FC',
  'PYS FC',
  '퍼스트마인드FC',
  'GOF풋살',
  '초심',
]

// 🏟️ 부평 시설공단 등록 동호회 목록 (추후 추가 예정)
const BUPYEONG_CLUBS = []

// 빈 계정 한 칸
const emptyAccount = () => ({ name: '', id: '', citizen: false, club: '' })

const FIELD_CLASS =
  'w-full bg-slate-900/80 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:bg-slate-900'

// ✅ 계정 카드 (컴포넌트 밖에 정의해야 입력 포커스가 유지됨!)
function AccountCard({ idx, acc, accent, showCitizen, clubList, onChange, onRemove, canRemove }) {
  const accentColor = accent === 'emerald' ? '#10b981' : '#0ea5e9'

  return (
    <div
      className="rounded-xl overflow-hidden border"
      style={{ borderColor: `${accentColor}44`, background: 'rgba(15,23,42,0.55)' }}
    >
      {/* 카드 헤더 */}
      <div
        className="flex items-center justify-between px-3 py-2.5"
        style={{ background: `${accentColor}1a` }}
      >
        <div className="flex items-center gap-2">
          <span
            className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black text-white"
            style={{ background: accentColor }}
          >
            {idx + 1}
          </span>
          <span className="text-white text-sm font-bold">계정 정보</span>
        </div>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-slate-400 hover:text-red-400 text-xs px-2 py-1 rounded-lg hover:bg-red-500/10 transition-colors"
          >
            🗑️ 삭제
          </button>
        )}
      </div>

      {/* 카드 본문 */}
      <div className="p-3 space-y-3">
        {/* 이름 / 아이디 / 인천시민 — 한 줄 */}
        <div className="flex items-end gap-2">
          {/* 이름 */}
          <div className="flex-1 min-w-0">
            <label className="block text-slate-400 text-[11px] font-semibold mb-1.5">👤 이름</label>
            <input
              type="text"
              value={acc.name}
              onChange={(e) => onChange('name', e.target.value)}
              placeholder="홍길동"
              className={FIELD_CLASS}
            />
          </div>

          {/* 아이디 (선택 입력) */}
          <div className="flex-1 min-w-0">
            <label className="block text-slate-400 text-[11px] font-semibold mb-1.5">
              🔑 아이디 <span className="text-slate-500 font-normal">(선택)</span>
            </label>
            <input
              type="text"
              value={acc.id}
              onChange={(e) => onChange('id', e.target.value)}
              placeholder="hong1234"
              className={FIELD_CLASS}
            />
          </div>

          {/* 인천시민 체크박스 (네모만) */}
    {showCitizen && (
  <div className="flex-shrink-0">
    <label className="block text-slate-400 text-[11px] font-semibold mb-1.5 text-center">
      🏙️ 인천시민
    </label>
    <label
      className={`flex items-center justify-center rounded-lg border cursor-pointer transition-colors ${
        acc.citizen
          ? 'bg-emerald-500/15 border-emerald-500'
          : 'bg-slate-900/80 border-slate-600 hover:border-slate-500'
      }`}
     
      title={acc.citizen ? '인천시민 인증됨' : '인천시민 아님'}
    >
      <input
        type="checkbox"
        checked={acc.citizen}
        onChange={(e) => onChange('citizen', e.target.checked)}
        className="w-4 h-4 accent-emerald-500 cursor-pointer"
      />
    </label>
  </div>
)}
        </div>

        {/* 동호회 */}
        <div>
          <label className="block text-slate-400 text-[11px] font-semibold mb-1.5">⚽ 가입 동호회</label>
          {clubList.length > 0 ? (
            <select
              value={acc.club}
              onChange={(e) => onChange('club', e.target.value)}
              className={FIELD_CLASS}
            >
              <option value="">— 동호회를 선택하세요 —</option>
              {clubList.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={acc.club}
              onChange={(e) => onChange('club', e.target.value)}
              placeholder="동호회명 입력"
              className={FIELD_CLASS}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function MemberRegister() {
  const { user, profile, reloadProfile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [linkedPlayer, setLinkedPlayer] = useState(null)

  // 'choose' | 'existing' | 'new'
  const [mode, setMode] = useState('choose')

  const [availablePlayers, setAvailablePlayers] = useState([])
  const [playerSearch, setPlayerSearch] = useState('')
  const [selectedPlayerId, setSelectedPlayerId] = useState('')
  const [listLoading, setListLoading] = useState(false)

  const [form, setForm] = useState({
    name: '',
    birth_year: '',
    main_position: '',
    phone: '',
    address: '',
    incheon_member: false,
    incheon_accounts: [emptyAccount()],
    bupyeong_member: false,
    bupyeong_accounts: [emptyAccount()],
  })

  useEffect(() => {
    checkExisting()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile])

  async function checkExisting() {
    setLoading(true)
    if (profile?.player_id) {
      const { data } = await supabase
        .from('players')
        .select('*')
        .eq('id', profile.player_id)
        .single()
      if (data) {
        setLinkedPlayer(data)
        const inAcc = Array.isArray(data.incheon_accounts) && data.incheon_accounts.length > 0
          ? data.incheon_accounts.map(a => ({ ...emptyAccount(), ...a }))
          : [emptyAccount()]
        const buAcc = Array.isArray(data.bupyeong_accounts) && data.bupyeong_accounts.length > 0
          ? data.bupyeong_accounts.map(a => ({ ...emptyAccount(), ...a }))
          : [emptyAccount()]
        setForm({
          name: data.name || '',
          birth_year: data.birth_year || '',
          main_position: data.main_position || '',
          phone: data.phone || '',
          address: data.address || '',
          incheon_member: !!data.incheon_member,
          incheon_accounts: inAcc,
          bupyeong_member: !!data.bupyeong_member,
          bupyeong_accounts: buAcc,
        })
      }
    } else {
      setLinkedPlayer(null)
    }
    setLoading(false)
  }

  async function fetchAvailablePlayers() {
    setListLoading(true)
    const [playerRes, profileRes] = await Promise.all([
      supabase.from('players').select('id, name, phone, is_active').order('name'),
      supabase.from('profiles').select('player_id'),
    ])
    const allPlayers = (playerRes.data || []).filter(p => p.is_active !== false)
    const linkedIds = new Set((profileRes.data || []).map(p => p.player_id).filter(Boolean))
    setAvailablePlayers(allPlayers.filter(p => !linkedIds.has(p.id)))
    setListLoading(false)
  }

  function goExisting() {
    setMode('existing')
    setSelectedPlayerId('')
    setPlayerSearch('')
    fetchAvailablePlayers()
  }

  function handleSearchChange(e) {
    setPlayerSearch(e.target.value)
    setSelectedPlayerId('')
  }

  function handleChange(e) {
    const { name, value, type, checked } = e.target
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
  }

  // 🧩 계정 목록 조작
  function updateAccount(field, idx, key, value) {
    setForm((prev) => ({
      ...prev,
      [field]: prev[field].map((a, i) => (i === idx ? { ...a, [key]: value } : a)),
    }))
  }

  function addAccount(field) {
    setForm((prev) => ({ ...prev, [field]: [...prev[field], emptyAccount()] }))
  }

  function removeAccount(field, idx) {
    setForm((prev) => {
      const next = prev[field].filter((_, i) => i !== idx)
      return { ...prev, [field]: next.length > 0 ? next : [emptyAccount()] }
    })
  }

  async function linkExistingPlayer() {
    if (!selectedPlayerId) {
      alert('본인 이름을 선택해 주세요.')
      return
    }
    const target = availablePlayers.find(p => String(p.id) === String(selectedPlayerId))
    const masked = maskPhoneTail(target?.phone)
    const ok = window.confirm(
      `'${target?.name}'${masked ? ` (${masked})` : ''} 님이 본인이 맞습니까?\n\n` +
      `본인이 아닌 이름을 선택하면 승인이 거부될 수 있습니다.`
    )
    if (!ok) return

    setSaving(true)
    const { error } = await supabase
      .from('profiles')
      .update({ player_id: selectedPlayerId })
      .eq('id', user.id)

    if (error) {
      console.error('연결 오류:', error)
      if (error.code === '23505') {
        alert('이미 다른 계정에 연결된 선수입니다.\n관리자에게 문의해 주세요.')
        fetchAvailablePlayers()
      } else {
        alert('연결에 실패했습니다. 관리자에게 문의해 주세요.')
      }
      setSaving(false)
      return
    }

    alert('연결이 완료되었습니다! 관리자 승인을 기다려 주세요. 🙌')
    await reloadProfile()
    await checkExisting()
    setSaving(false)
  }

  function cleanAccounts(list) {
    return list
      .filter(a => (a.name || '').trim() || (a.id || '').trim())
      .map(a => ({
        name: (a.name || '').trim(),
        id: (a.id || '').trim(),
        citizen: !!a.citizen,
        club: (a.club || '').trim(),
      }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) {
      alert('이름을 입력해 주세요.')
      return
    }

    setSaving(true)
    const today = new Date().toISOString().slice(0, 10)

    const payload = {
      name: form.name.trim(),
      birth_year: form.birth_year ? Number(form.birth_year) : null,
      main_position: form.main_position.trim() || null,
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
      incheon_member: form.incheon_member,
      incheon_accounts: form.incheon_member ? cleanAccounts(form.incheon_accounts) : [],
      bupyeong_member: form.bupyeong_member,
      bupyeong_accounts: form.bupyeong_member ? cleanAccounts(form.bupyeong_accounts) : [],
    }

    if (linkedPlayer) {
      const { error } = await supabase.from('players').update(payload).eq('id', linkedPlayer.id)
      if (error) {
        console.error('정보 수정 오류:', error)
        alert('정보 수정에 실패했습니다.')
      } else {
        alert('정보가 수정되었습니다.')
        await checkExisting()
      }
    } else {
      const { data: sameName } = await supabase
        .from('players')
        .select('id, name')
        .eq('name', payload.name)
        .limit(1)

      if (sameName && sameName.length > 0) {
        const proceed = window.confirm(
          `⚠️ 명단에 이미 '${payload.name}' 님이 있습니다.\n\n` +
          `본인이라면 [취소]를 누르고 "기존 명단에서 내 이름 찾기"를 이용해 주세요.\n` +
          `동명이인이라면 [확인]을 눌러 계속 진행합니다.`
        )
        if (!proceed) {
          setSaving(false)
          goExisting()
          return
        }
      }

      const { data: newPlayer, error } = await supabase
        .from('players')
        .insert({ ...payload, join_date: today, category: '예비회원' })
        .select()
        .single()

      if (error) {
        console.error('등록 오류:', error)
        alert('신청에 실패했습니다.')
        setSaving(false)
        return
      }

      const { error: linkError } = await supabase
        .from('profiles')
        .update({ player_id: newPlayer.id })
        .eq('id', user.id)

      if (linkError) {
        console.error('연결 오류:', linkError)
        alert('신청은 됐지만 계정 연결에 실패했습니다. 관리자에게 문의해 주세요.')
      } else {
        alert('회원 신청이 완료되었습니다! 관리자 승인을 기다려 주세요. 🙌')
        await reloadProfile()
        await checkExisting()
      }
    }

    setSaving(false)
  }

  if (loading) {
    return <div className="text-center text-slate-400 py-10">⏳ 불러오는 중...</div>
  }

  const keyword = playerSearch.trim()
  const matchedPlayers = keyword
    ? availablePlayers.filter(p => (p.name || '').trim() === keyword)
    : []

  const inputClass =
    'w-full bg-slate-900/80 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500'

  // ─────────────────────────────────────────────
  // ① 선택 화면
  // ─────────────────────────────────────────────
  if (!linkedPlayer && mode === 'choose') {
    return (
      <div className="max-w-lg mx-auto">
        <h1 className="text-2xl font-bold text-white mb-1">📝 회원 등록 및 정회원 요청</h1>
        <p className="text-slate-400 text-sm mb-6">
          FM FC에 오신 것을 환영합니다! 아래에서 해당하는 항목을 선택해 주세요. ⚽
        </p>

        <div className="space-y-4">
          <button
            onClick={goExisting}
            className="w-full text-left bg-slate-800 hover:bg-slate-750 border border-slate-700 hover:border-emerald-500/60 rounded-2xl p-5 transition-all hover:-translate-y-0.5"
          >
            <div className="text-3xl mb-2">🙋</div>
            <h2 className="text-white font-bold text-lg mb-1">이미 FM FC에서 활동 중이에요</h2>
            <p className="text-slate-400 text-sm">
              선수 명단에서 <b className="text-emerald-400">내 이름을 찾아</b> 계정과 연결합니다.
            </p>
            <p className="text-amber-400/80 text-xs mt-2">
              ✅ 기존 출석·득점 기록이 그대로 유지됩니다
            </p>
          </button>

          <button
            onClick={() => setMode('new')}
            className="w-full text-left bg-slate-800 hover:bg-slate-750 border border-slate-700 hover:border-emerald-500/60 rounded-2xl p-5 transition-all hover:-translate-y-0.5"
          >
            <div className="text-3xl mb-2">🆕</div>
            <h2 className="text-white font-bold text-lg mb-1">처음 가입해요</h2>
            <p className="text-slate-400 text-sm">
              선수 명단에 없는 <b className="text-emerald-400">신규 회원</b>으로 등록합니다.
            </p>
          </button>
        </div>

        <div className="mt-6 bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-slate-400 text-xs leading-relaxed">
          ℹ️ 이미 명단에 있는데 <b className="text-slate-300">"처음 가입해요"</b>로 등록하면
          이름이 중복 생성됩니다. 헷갈리시면 먼저 <b className="text-slate-300">"활동 중이에요"</b>에서
          이름을 검색해 보세요!
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────
  // ② 기존 명단에서 찾기
  // ─────────────────────────────────────────────
  if (!linkedPlayer && mode === 'existing') {
    return (
      <div className="max-w-lg mx-auto">
        <button
          onClick={() => setMode('choose')}
          className="text-slate-400 hover:text-white text-sm mb-4 transition-colors"
        >
          ← 뒤로
        </button>

        <h1 className="text-2xl font-bold text-white mb-1">🙋 기존 명단에서 내 이름 찾기</h1>
        <p className="text-slate-400 text-sm mb-4">
          본인 이름을 <b className="text-emerald-400">정확히 전부</b> 입력해 주세요.
          일치하는 회원이 있으면 아래에 표시됩니다.
        </p>

        <input
          type="text"
          value={playerSearch}
          onChange={handleSearchChange}
          placeholder="예: 홍길동 (이름 전체 입력)"
          className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 mb-4"
        />

        {listLoading ? (
          <div className="text-center text-slate-400 py-10">⏳ 명단 불러오는 중...</div>
        ) : !keyword ? (
          <div className="text-center py-12 bg-slate-800/40 rounded-xl border border-dashed border-slate-700">
            <p className="text-4xl mb-3">🔍</p>
            <p className="text-slate-300 mb-1">이름을 입력해 주세요</p>
            <p className="text-slate-500 text-sm">개인정보 보호를 위해 전체 명단은 표시되지 않습니다</p>
          </div>
        ) : matchedPlayers.length === 0 ? (
          <div className="text-center py-10 bg-slate-800/50 rounded-xl border border-slate-700">
            <p className="text-4xl mb-3">🤔</p>
            <p className="text-slate-300 mb-1">
              '<b className="text-white">{keyword}</b>' 님을 찾을 수 없습니다
            </p>
            <p className="text-slate-500 text-sm mb-4 leading-relaxed">
              이름을 정확히 입력했는지 확인해 주세요.<br />
              명단에 없거나, 이미 다른 계정에 연결되었을 수 있어요.
            </p>
            <button
              onClick={() => setMode('new')}
              className="text-emerald-400 hover:text-emerald-300 text-sm underline"
            >
              신규 회원으로 등록하기 →
            </button>
          </div>
        ) : (
          <>
            <p className="text-slate-400 text-xs mb-2">
              ✅ {matchedPlayers.length}명 찾았습니다
              {matchedPlayers.length > 1 && (
                <span className="text-amber-400"> · 동명이인이 있어요. 전화번호 뒷자리로 확인해 주세요</span>
              )}
            </p>

            <div className="space-y-2 mb-5">
              {matchedPlayers.map(p => {
                const selected = String(selectedPlayerId) === String(p.id)
                const masked = maskPhoneTail(p.phone)
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPlayerId(p.id)}
                    className={`w-full text-left rounded-xl px-4 py-3 border transition-all ${
                      selected
                        ? 'bg-emerald-500/15 border-emerald-500 text-white'
                        : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-semibold truncate">{p.name}</span>
                      {masked ? (
                        <span className="text-emerald-400/90 text-xs font-mono bg-emerald-500/10 px-1.5 py-0.5 rounded flex-shrink-0">
                          {masked}
                        </span>
                      ) : (
                        <span className="text-slate-500 text-xs font-mono bg-slate-700/40 px-1.5 py-0.5 rounded flex-shrink-0">
                          번호없음
                        </span>
                      )}
                      {selected && <span className="text-emerald-400 text-xs ml-auto flex-shrink-0">✔ 선택됨</span>}
                    </div>
                  </button>
                )
              })}
            </div>

            <button
              onClick={linkExistingPlayer}
              disabled={saving || !selectedPlayerId}
              className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl text-lg transition-colors"
            >
              {saving ? '연결 중...' : '이 이름으로 연결하기'}
            </button>

            <p className="text-slate-500 text-xs mt-3 text-center">
              ⚠️ 반드시 <b className="text-slate-400">본인 이름</b>을 선택해 주세요. 관리자가 확인 후 승인합니다.
            </p>
          </>
        )}
      </div>
    )
  }

  // ─────────────────────────────────────────────
  // ③ 신규 등록 / 정보 수정 폼
  // ─────────────────────────────────────────────
  return (
    <div className="max-w-lg mx-auto">
      {!linkedPlayer && (
        <button
          onClick={() => setMode('choose')}
          className="text-slate-400 hover:text-white text-sm mb-4 transition-colors"
        >
          ← 뒤로
        </button>
      )}

      <h1 className="text-2xl font-bold text-white mb-1">
        {linkedPlayer ? '📝 내 정보' : '🆕 신규 회원 등록'}
      </h1>
      <p className="text-slate-400 text-sm mb-6">
        {linkedPlayer
          ? '등록한 정보입니다. 수정할 수 있어요. 관리자 승인 후 정회원으로 활동할 수 있습니다.'
          : '본인 정보를 입력하고 회원 신청을 해주세요. 신청하면 관리자에게 정회원 요청이 전달됩니다.'}
      </p>

      {linkedPlayer && (
        <div className="mb-6 bg-amber-500/15 border border-amber-500/40 text-amber-200 rounded-xl px-4 py-3 text-sm">
          🙋 <b>정회원 요청됨</b> — 관리자 승인을 기다리는 중입니다.
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* ── 👤 기본 정보 ── */}
        <div className="bg-slate-800/40 border border-slate-700 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 bg-slate-700/40 border-b border-slate-700">
            <p className="text-white font-bold text-sm">👤 기본 정보</p>
          </div>
          <div className="p-4 space-y-4">
            <div>
              <label className="block text-slate-300 text-xs font-semibold mb-2">
                이름 <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="홍길동"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-slate-300 text-xs font-semibold mb-2">출생년도</label>
              <input
                type="number"
                name="birth_year"
                value={form.birth_year}
                onChange={handleChange}
                placeholder="예: 1993"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-slate-300 text-xs font-semibold mb-2">주포지션</label>
              <input
                type="text"
                name="main_position"
                value={form.main_position}
                onChange={handleChange}
                placeholder="예: 공격수, 미드필더, 골키퍼 등"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-slate-300 text-xs font-semibold mb-2">전화번호</label>
              <input
                type="tel"
                name="phone"
                value={form.phone}
                onChange={handleChange}
                placeholder="010-1234-5678"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-slate-300 text-xs font-semibold mb-2">주소</label>
              <input
                type="text"
                name="address"
                value={form.address}
                onChange={handleChange}
                placeholder="예: 인천시 연수구"
                className={inputClass}
              />
            </div>
          </div>
        </div>

        {/* ── 🏟️ 인천 시설공단 ── */}
        <div style={{ marginTop: '28px' }}>
          <div
            className="rounded-2xl border overflow-hidden transition-colors"
            style={{
              borderColor: form.incheon_member ? 'rgba(16,185,129,0.45)' : '#334155',
              background: form.incheon_member ? 'rgba(16,185,129,0.07)' : 'rgba(30,41,59,0.4)',
            }}
          >
            {/* 섹션 헤더 (토글) */}
            <label
              className="flex items-center gap-3 px-4 py-4 cursor-pointer"
              style={{ background: form.incheon_member ? 'rgba(16,185,129,0.12)' : 'rgba(51,65,85,0.4)' }}
            >
              <input
                type="checkbox"
                name="incheon_member"
                checked={form.incheon_member}
                onChange={handleChange}
                className="w-5 h-5 accent-emerald-500 flex-shrink-0"
              />
              <div>
                <p className="text-white font-bold">🏟️ 인천 시설공단</p>
                <p className="text-slate-400 text-xs mt-0.5">가입되어 있다면 체크해 주세요</p>
              </div>
            </label>

            {form.incheon_member && (
              <div className="p-4 space-y-4">
                <p className="text-emerald-300/80 text-xs leading-relaxed bg-emerald-500/10 rounded-lg px-3 py-2">
                  💡 여러 계정이 있다면 <b>계정 추가</b>로 각각 등록해 주세요.
                  계정마다 인천시민 여부와 동호회가 다를 수 있습니다.
                </p>

                {form.incheon_accounts.map((acc, idx) => (
                  <AccountCard
                    key={`in-${idx}`}
                    idx={idx}
                    acc={acc}
                    accent="emerald"
                    showCitizen={true}
                    clubList={INCHEON_CLUBS}
                    canRemove={form.incheon_accounts.length > 1}
                    onChange={(key, value) => updateAccount('incheon_accounts', idx, key, value)}
                    onRemove={() => removeAccount('incheon_accounts', idx)}
                  />
                ))}

                <button
                  type="button"
                  onClick={() => addAccount('incheon_accounts')}
                  className="w-full py-3 rounded-xl border border-dashed border-emerald-500/50 text-emerald-300 text-sm font-bold hover:bg-emerald-500/10 transition-colors"
                >
                  ＋ 계정 추가
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── 🏟️ 부평 시설공단 ── */}
        <div style={{ marginTop: '20px' }}>
          <div
            className="rounded-2xl border overflow-hidden transition-colors"
            style={{
              borderColor: form.bupyeong_member ? 'rgba(14,165,233,0.45)' : '#334155',
              background: form.bupyeong_member ? 'rgba(14,165,233,0.07)' : 'rgba(30,41,59,0.4)',
            }}
          >
            <label
              className="flex items-center gap-3 px-4 py-4 cursor-pointer"
              style={{ background: form.bupyeong_member ? 'rgba(14,165,233,0.12)' : 'rgba(51,65,85,0.4)' }}
            >
              <input
                type="checkbox"
                name="bupyeong_member"
                checked={form.bupyeong_member}
                onChange={handleChange}
                className="w-5 h-5 accent-sky-500 flex-shrink-0"
              />
              <div>
                <p className="text-white font-bold">🏟️ 부평 시설공단</p>
                <p className="text-slate-400 text-xs mt-0.5">가입되어 있다면 체크해 주세요</p>
              </div>
            </label>

            {form.bupyeong_member && (
              <div className="p-4 space-y-4">
                <p className="text-sky-300/80 text-xs leading-relaxed bg-sky-500/10 rounded-lg px-3 py-2">
                  💡 여러 계정이 있다면 <b>계정 추가</b>로 각각 등록해 주세요.
                </p>

                {form.bupyeong_accounts.map((acc, idx) => (
                  <AccountCard
                    key={`bu-${idx}`}
                    idx={idx}
                    acc={acc}
                    accent="sky"
                    showCitizen={false}
                    clubList={BUPYEONG_CLUBS}
                    canRemove={form.bupyeong_accounts.length > 1}
                    onChange={(key, value) => updateAccount('bupyeong_accounts', idx, key, value)}
                    onRemove={() => removeAccount('bupyeong_accounts', idx)}
                  />
                ))}

                <button
                  type="button"
                  onClick={() => addAccount('bupyeong_accounts')}
                  className="w-full py-3 rounded-xl border border-dashed border-sky-500/50 text-sky-300 text-sm font-bold hover:bg-sky-500/10 transition-colors"
                >
                  ＋ 계정 추가
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 제출 버튼 */}
        <div style={{ marginTop: '32px' }}>
          <button
            type="submit"
            disabled={saving}
            className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-white font-bold py-4 rounded-xl text-lg transition-colors shadow-lg shadow-emerald-500/20"
          >
            {saving ? '저장 중...' : linkedPlayer ? '💾 정보 수정하기' : '✅ 회원 신청하기'}
          </button>
        </div>
      </form>

      {/* ⬇️ 하단 여백 */}
      <div style={{ height: '70px', width: '100%' }} aria-hidden="true"></div>
    </div>
  )
}

export default MemberRegister