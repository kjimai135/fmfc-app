import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

// 출생연도(예: 1992) → "1992년 (34세)"
function birthLabel(birthYear) {
  if (!birthYear) return ''
  const age = new Date().getFullYear() - birthYear + 1
  return `${birthYear}년 (${age}세)`
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

function MyProfile() {
  const { profile } = useAuth()
  const myPlayerId = profile?.player_id || null

  const [player, setPlayer] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // 수정 가능한 필드
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [birthYear, setBirthYear] = useState('')
  const [mainPosition, setMainPosition] = useState('')

  // 🏟️ 시설공단
  const [incheonMember, setIncheonMember] = useState(false)
  const [incheonAccounts, setIncheonAccounts] = useState([emptyAccount()])
  const [bupyeongMember, setBupyeongMember] = useState(false)
  const [bupyeongAccounts, setBupyeongAccounts] = useState([emptyAccount()])

  useEffect(() => {
    fetchPlayer()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myPlayerId])

  async function fetchPlayer() {
    if (!myPlayerId) {
      setLoading(false)
      return
    }
    setLoading(true)
    const { data } = await supabase
      .from('players')
      .select('*')
      .eq('id', myPlayerId)
      .single()

    if (data) {
      setPlayer(data)
      setAddress(data.address || '')
      setPhone(data.phone || '')
      setBirthYear(data.birth_year ? String(data.birth_year) : '')
      setMainPosition(data.main_position || '')

      // 🏟️ 시설공단 정보 로드
      setIncheonMember(!!data.incheon_member)
      setIncheonAccounts(
        Array.isArray(data.incheon_accounts) && data.incheon_accounts.length > 0
          ? data.incheon_accounts.map(a => ({ ...emptyAccount(), ...a }))
          : [emptyAccount()]
      )
      setBupyeongMember(!!data.bupyeong_member)
      setBupyeongAccounts(
        Array.isArray(data.bupyeong_accounts) && data.bupyeong_accounts.length > 0
          ? data.bupyeong_accounts.map(a => ({ ...emptyAccount(), ...a }))
          : [emptyAccount()]
      )
    }
    setLoading(false)
  }

  // 🧩 계정 목록 조작
  function updateAccount(setter, idx, key, value) {
    setter(prev => prev.map((a, i) => (i === idx ? { ...a, [key]: value } : a)))
  }

  function addAccount(setter) {
    setter(prev => [...prev, emptyAccount()])
  }

  function removeAccount(setter, idx) {
    setter(prev => {
      const next = prev.filter((_, i) => i !== idx)
      return next.length > 0 ? next : [emptyAccount()]
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

  async function saveProfile() {
    if (!myPlayerId) return
    setSaving(true)

    const yearNum = birthYear.trim() ? parseInt(birthYear.trim(), 10) : null

    const { error } = await supabase
      .from('players')
      .update({
        address: address.trim() || null,
        phone: phone.trim() || null,
        birth_year: yearNum,
        main_position: mainPosition.trim() || null,
        // 🏟️ 시설공단
        incheon_member: incheonMember,
        incheon_accounts: incheonMember ? cleanAccounts(incheonAccounts) : [],
        bupyeong_member: bupyeongMember,
        bupyeong_accounts: bupyeongMember ? cleanAccounts(bupyeongAccounts) : [],
      })
      .eq('id', myPlayerId)

    setSaving(false)
    if (error) {
      alert('저장에 실패했습니다: ' + error.message)
    } else {
      alert('✅ 내 정보가 저장되었습니다!')
      fetchPlayer()
    }
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-white">👤 내 정보</h1>
        <p className="text-slate-400 mt-1">본인의 정보를 확인하고 수정할 수 있습니다.</p>
      </div>

      {loading ? (
        <div className="text-center py-20 text-slate-400">⏳ 불러오는 중...</div>
      ) : !myPlayerId || !player ? (
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 text-center text-slate-300">
          <p className="text-4xl mb-3">🔗</p>
          <p className="font-semibold text-white mb-1">연결된 선수 정보가 없습니다</p>
          <p className="text-sm text-slate-400">
            로그인 계정과 선수가 연결되어 있지 않습니다.<br />
            관리자에게 문의해 주세요.
          </p>
        </div>
      ) : (
        <>
          {/* ── 기본 정보 ── */}
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 space-y-5">
            {/* 읽기 전용 정보 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-900/60 rounded-xl p-3">
                <p className="text-slate-400 text-xs mb-1">이름</p>
                <p className="text-white font-bold text-lg">{player.name}</p>
              </div>
              <div className="bg-slate-900/60 rounded-xl p-3">
                <p className="text-slate-400 text-xs mb-1">소속팀</p>
                <p className="text-white font-bold text-lg">{player.current_team || '미배정'}</p>
              </div>
            </div>
            {player.join_date && (
              <div className="bg-slate-900/60 rounded-xl p-3">
                <p className="text-slate-400 text-xs mb-1">가입연월</p>
                <p className="text-white font-medium">{player.join_date}</p>
              </div>
            )}

            <div className="border-t border-slate-700/50 pt-4">
              <p className="text-slate-300 text-sm font-semibold mb-3">✏️ 수정 가능 항목</p>

              {/* 주소 */}
              <div className="mb-3">
                <label className="block text-slate-400 text-xs font-medium mb-1">주소</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="예: 연수구 송도동"
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* 연락처 */}
              <div className="mb-3">
                <label className="block text-slate-400 text-xs font-medium mb-1">연락처</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="예: 010-1234-5678"
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* 출생연도 */}
              <div className="mb-3">
                <label className="block text-slate-400 text-xs font-medium mb-1">
                  출생연도 {birthYear && <span className="text-slate-500">· {birthLabel(parseInt(birthYear, 10))}</span>}
                </label>
                <input
                  type="number"
                  value={birthYear}
                  onChange={(e) => setBirthYear(e.target.value)}
                  placeholder="예: 1992"
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* 주 포지션 */}
              <div className="mb-1">
                <label className="block text-slate-400 text-xs font-medium mb-1">주 포지션</label>
                <input
                  type="text"
                  value={mainPosition}
                  onChange={(e) => setMainPosition(e.target.value)}
                  placeholder="예: 공격수 / 미드필더 / 수비수 / 골키퍼"
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* ── 🏟️ 인천 시설공단 ── */}
          <div style={{ marginTop: '24px' }}>
            <div
              className="rounded-2xl border overflow-hidden transition-colors"
              style={{
                borderColor: incheonMember ? 'rgba(16,185,129,0.45)' : '#334155',
                background: incheonMember ? 'rgba(16,185,129,0.07)' : 'rgba(30,41,59,0.4)',
              }}
            >
              <label
                className="flex items-center gap-3 px-4 py-4 cursor-pointer"
                style={{ background: incheonMember ? 'rgba(16,185,129,0.12)' : 'rgba(51,65,85,0.4)' }}
              >
                <input
                  type="checkbox"
                  checked={incheonMember}
                  onChange={(e) => setIncheonMember(e.target.checked)}
                  className="w-5 h-5 accent-emerald-500 flex-shrink-0"
                />
                <div>
                  <p className="text-white font-bold">🏟️ 인천 시설공단</p>
                  <p className="text-slate-400 text-xs mt-0.5">가입되어 있다면 체크해 주세요</p>
                </div>
              </label>

              {incheonMember && (
                <div className="p-4 space-y-4">
                  <p className="text-emerald-300/80 text-xs leading-relaxed bg-emerald-500/10 rounded-lg px-3 py-2">
                    💡 여러 계정이 있다면 <b>계정 추가</b>로 각각 등록해 주세요.
                    계정마다 인천시민 여부와 동호회가 다를 수 있습니다.
                  </p>

                  {incheonAccounts.map((acc, idx) => (
                    <AccountCard
                      key={`in-${idx}`}
                      idx={idx}
                      acc={acc}
                      accent="emerald"
                      showCitizen={true}
                      clubList={INCHEON_CLUBS}
                      canRemove={incheonAccounts.length > 1}
                      onChange={(key, value) => updateAccount(setIncheonAccounts, idx, key, value)}
                      onRemove={() => removeAccount(setIncheonAccounts, idx)}
                    />
                  ))}

                  <button
                    type="button"
                    onClick={() => addAccount(setIncheonAccounts)}
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
                borderColor: bupyeongMember ? 'rgba(14,165,233,0.45)' : '#334155',
                background: bupyeongMember ? 'rgba(14,165,233,0.07)' : 'rgba(30,41,59,0.4)',
              }}
            >
              <label
                className="flex items-center gap-3 px-4 py-4 cursor-pointer"
                style={{ background: bupyeongMember ? 'rgba(14,165,233,0.12)' : 'rgba(51,65,85,0.4)' }}
              >
                <input
                  type="checkbox"
                  checked={bupyeongMember}
                  onChange={(e) => setBupyeongMember(e.target.checked)}
                  className="w-5 h-5 accent-sky-500 flex-shrink-0"
                />
                <div>
                  <p className="text-white font-bold">🏟️ 부평 시설공단</p>
                  <p className="text-slate-400 text-xs mt-0.5">가입되어 있다면 체크해 주세요</p>
                </div>
              </label>

              {bupyeongMember && (
                <div className="p-4 space-y-4">
                  <p className="text-sky-300/80 text-xs leading-relaxed bg-sky-500/10 rounded-lg px-3 py-2">
                    💡 여러 계정이 있다면 <b>계정 추가</b>로 각각 등록해 주세요.
                  </p>

                  {bupyeongAccounts.map((acc, idx) => (
                    <AccountCard
                      key={`bu-${idx}`}
                      idx={idx}
                      acc={acc}
                      accent="sky"
                      showCitizen={false}
                      clubList={BUPYEONG_CLUBS}
                      canRemove={bupyeongAccounts.length > 1}
                      onChange={(key, value) => updateAccount(setBupyeongAccounts, idx, key, value)}
                      onRemove={() => removeAccount(setBupyeongAccounts, idx)}
                    />
                  ))}

                  <button
                    type="button"
                    onClick={() => addAccount(setBupyeongAccounts)}
                    className="w-full py-3 rounded-xl border border-dashed border-sky-500/50 text-sky-300 text-sm font-bold hover:bg-sky-500/10 transition-colors"
                  >
                    ＋ 계정 추가
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 저장 버튼 */}
          <div style={{ marginTop: '28px' }}>
            <button
              onClick={saveProfile}
              disabled={saving}
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-3.5 rounded-xl font-bold transition-colors disabled:opacity-50 shadow-lg shadow-emerald-500/20"
            >
              {saving ? '저장 중...' : '💾 저장'}
            </button>
          </div>
        </>
      )}

      <div style={{ height: '70px', width: '100%' }} aria-hidden="true"></div>
    </div>
  )
}

export default MyProfile