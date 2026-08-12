import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

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

          {/* 아이디 */}
          <div className="flex-1 min-w-0">
            <label className="block text-slate-400 text-[11px] font-semibold mb-1.5">🔑 아이디</label>
            <input
              type="text"
              value={acc.id}
              onChange={(e) => onChange('id', e.target.value)}
              placeholder="hong1234"
              className={FIELD_CLASS}
            />
          </div>

          {/* 인천시민 체크박스 */}
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

function PlayerForm() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = Boolean(id)

  const [form, setForm] = useState({
    name: '',
    address: '',
    birth_year: '',
    main_position: '',
    join_date: '',
    phone: '',
    // 🏟️ 시설공단
    incheon_member: false,
    incheon_accounts: [emptyAccount()],
    bupyeong_member: false,
    bupyeong_accounts: [emptyAccount()],
  })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isEdit) {
      fetchPlayer()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function fetchPlayer() {
    const { data } = await supabase
      .from('players')
      .select('*')
      .eq('id', id)
      .single()

    if (data) {
      const inAcc = Array.isArray(data.incheon_accounts) && data.incheon_accounts.length > 0
        ? data.incheon_accounts.map(a => ({ ...emptyAccount(), ...a }))
        : [emptyAccount()]
      const buAcc = Array.isArray(data.bupyeong_accounts) && data.bupyeong_accounts.length > 0
        ? data.bupyeong_accounts.map(a => ({ ...emptyAccount(), ...a }))
        : [emptyAccount()]

      setForm({
        name: data.name || '',
        address: data.address || '',
        birth_year: data.birth_year || '',
        main_position: data.main_position || '',
        join_date: data.join_date || '',
        phone: data.phone || '',
        incheon_member: !!data.incheon_member,
        incheon_accounts: inAcc,
        bupyeong_member: !!data.bupyeong_member,
        bupyeong_accounts: buAcc,
      })
    }
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

  // 빈 계정 제거 후 저장용 배열 만들기
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

    if (!form.name) {
      alert('이름을 입력해주세요!')
      return
    }

    setLoading(true)

    const playerData = {
      name: form.name,
      address: form.address,
      birth_year: form.birth_year ? Number(form.birth_year) : null,
      main_position: form.main_position,
      join_date: form.join_date || null,
      phone: form.phone,
      // 🏟️ 시설공단 (미가입이면 계정 목록 비움)
      incheon_member: form.incheon_member,
      incheon_accounts: form.incheon_member ? cleanAccounts(form.incheon_accounts) : [],
      bupyeong_member: form.bupyeong_member,
      bupyeong_accounts: form.bupyeong_member ? cleanAccounts(form.bupyeong_accounts) : [],
    }

    let error
    if (isEdit) {
      ({ error } = await supabase
        .from('players')
        .update(playerData)
        .eq('id', id))
    } else {
      ({ error } = await supabase
        .from('players')
        .insert([playerData]))
    }

    setLoading(false)

    if (error) {
      alert('오류가 발생했습니다: ' + error.message)
    } else {
      navigate('/players')
    }
  }

  const inputStyle = "w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500"
  const labelStyle = "block text-slate-300 text-sm font-medium mb-2"

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold text-white mb-8">
        {isEdit ? '✏️ 선수 정보 수정' : '➕ 새 선수 등록'}
      </h1>

      {/* 등급 안내 */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 mb-6 text-slate-400 text-sm flex items-center gap-2">
        <span>ℹ️</span>
        <span>등급(권한)은 <b>회원 권한 관리</b>에서 설정합니다. 여기서는 선수의 기본 정보만 입력합니다.</span>
      </div>

      <form onSubmit={handleSubmit}>
        {/* ── 👤 기본 정보 ── */}
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 이름 */}
            <div>
              <label className={labelStyle}>이름 *</label>
              <input
                type="text"
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="홍길동"
                className={inputStyle}
                required
              />
            </div>

            {/* 연락처 */}
            <div>
              <label className={labelStyle}>연락처</label>
              <input
                type="tel"
                name="phone"
                value={form.phone}
                onChange={handleChange}
                placeholder="010-1234-5678"
                className={inputStyle}
              />
            </div>

            {/* 주소 */}
            <div className="md:col-span-2">
              <label className={labelStyle}>주소</label>
              <input
                type="text"
                name="address"
                value={form.address}
                onChange={handleChange}
                placeholder="서울시 강남구"
                className={inputStyle}
              />
            </div>

            {/* 나이(생년) */}
            <div>
              <label className={labelStyle}>생년</label>
              <input
                type="number"
                name="birth_year"
                value={form.birth_year}
                onChange={handleChange}
                placeholder="1990"
                min="1950"
                max="2010"
                className={inputStyle}
              />
            </div>

            {/* 주포지션 */}
            <div>
              <label className={labelStyle}>주포지션</label>
              <select
                name="main_position"
                value={form.main_position}
                onChange={handleChange}
                className={inputStyle}
              >
                <option value="">선택하세요</option>
                <option value="GK">GK (골키퍼)</option>
                <option value="DF">DF (수비수)</option>
                <option value="MF">MF (미드필더)</option>
                <option value="FW">FW (공격수)</option>
              </select>
            </div>

            {/* 가입연월 */}
            <div className="md:col-span-2">
              <label className={labelStyle}>가입연월</label>
              <input
                type="month"
                name="join_date"
                value={form.join_date}
                onChange={handleChange}
                className={inputStyle}
              />
            </div>
          </div>
        </div>

        {/* ── 🏟️ 인천 시설공단 ── */}
        <div style={{ marginTop: '24px' }}>
          <div
            className="rounded-2xl border overflow-hidden transition-colors"
            style={{
              borderColor: form.incheon_member ? 'rgba(16,185,129,0.45)' : '#334155',
              background: form.incheon_member ? 'rgba(16,185,129,0.07)' : 'rgba(30,41,59,0.4)',
            }}
          >
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

        {/* 버튼 */}
        <div className="flex gap-4 mt-8">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-xl font-semibold transition-colors disabled:opacity-50"
          >
            {loading ? '저장 중...' : isEdit ? '✅ 수정 완료' : '✅ 등록하기'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/players')}
            className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-3 rounded-xl font-semibold transition-colors"
          >
            ↩️ 취소
          </button>
        </div>
      </form>

      {/* ⬇️ 하단 여백 */}
      <div style={{ height: '70px', width: '100%' }} aria-hidden="true"></div>
    </div>
  )
}

export default PlayerForm