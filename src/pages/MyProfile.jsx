import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

// 출생연도(예: 1992) → "1992년 (34세)"
function birthLabel(birthYear) {
  if (!birthYear) return ''
  const age = new Date().getFullYear() - birthYear + 1
  return `${birthYear}년 (${age}세)`
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
    }
    setLoading(false)
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

          <button
            onClick={saveProfile}
            disabled={saving}
            className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-xl font-bold transition-colors disabled:opacity-50"
          >
            {saving ? '저장 중...' : '💾 저장'}
          </button>
        </div>
      )}

      <div style={{ height: '40px', width: '100%' }} aria-hidden="true"></div>
    </div>
  )
}

export default MyProfile