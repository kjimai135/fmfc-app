import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

function MemberRegister() {
  const { user, profile, reloadProfile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [linkedPlayer, setLinkedPlayer] = useState(null) // 이미 등록(연결)된 선수

  const [form, setForm] = useState({
    name: '',
    birth_year: '',
    main_position: '',
    phone: '',
    address: '',
  })

  useEffect(() => {
    checkExisting()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile])

  // 이미 선수가 연결돼 있으면(=이미 등록 요청함) 그 정보를 보여줌
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
        setForm({
          name: data.name || '',
          birth_year: data.birth_year || '',
          main_position: data.main_position || '',
          phone: data.phone || '',
          address: data.address || '',
        })
      }
    }
    setLoading(false)
  }

  function handleChange(e) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) {
      alert('이름을 입력해 주세요.')
      return
    }

    setSaving(true)

    // 오늘 날짜 (YYYY-MM-DD)
    const today = new Date().toISOString().slice(0, 10)

    const payload = {
      name: form.name.trim(),
      birth_year: form.birth_year ? Number(form.birth_year) : null,
      main_position: form.main_position.trim() || null,
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
    }

    if (linkedPlayer) {
      // 이미 등록한 경우 → 내 선수 정보 수정
      const { error } = await supabase
        .from('players')
        .update(payload)
        .eq('id', linkedPlayer.id)

      if (error) {
        console.error('정보 수정 오류:', error)
        alert('정보 수정에 실패했습니다.')
      } else {
        alert('정보가 수정되었습니다.')
        await checkExisting()
      }
    } else {
      // 신규 등록 → players에 추가 + 내 프로필에 연결
      const { data: newPlayer, error } = await supabase
        .from('players')
        .insert({
          ...payload,
          join_date: today,        // 자동: 오늘
          category: '예비회원',     // 자동: 예비회원
        })
        .select()
        .single()

      if (error) {
        console.error('등록 오류:', error)
        alert('신청에 실패했습니다.')
        setSaving(false)
        return
      }

      // 내 프로필(profiles)에 방금 만든 선수 연결
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

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-white mb-1">📝 회원 등록 및 정회원 요청</h1>
      <p className="text-slate-400 text-sm mb-6">
        {linkedPlayer
          ? '등록한 정보입니다. 수정할 수 있어요. 관리자 승인 후 정회원으로 활동할 수 있습니다.'
          : '본인 정보를 입력하고 회원 신청을 해주세요. 신청하면 관리자에게 정회원 요청이 전달됩니다.'}
      </p>

      {/* 상태 안내 배너 */}
      {linkedPlayer && (
        <div className="mb-6 bg-amber-500/15 border border-amber-500/40 text-amber-200 rounded-xl px-4 py-3 text-sm">
          🙋 <b>정회원 요청됨</b> — 관리자 승인을 기다리는 중입니다.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* 이름 */}
        <div>
          <label className="block text-slate-300 text-sm font-medium mb-1">이름 <span className="text-red-400">*</span></label>
          <input
            type="text"
            name="name"
            value={form.name}
            onChange={handleChange}
            placeholder="홍길동"
            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        {/* 출생년도 */}
        <div>
          <label className="block text-slate-300 text-sm font-medium mb-1">출생년도</label>
          <input
            type="number"
            name="birth_year"
            value={form.birth_year}
            onChange={handleChange}
            placeholder="예: 1993"
            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        {/* 주포지션 */}
        <div>
          <label className="block text-slate-300 text-sm font-medium mb-1">주포지션</label>
          <input
            type="text"
            name="main_position"
            value={form.main_position}
            onChange={handleChange}
            placeholder="예: 공격수, 미드필더, 골키퍼 등"
            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        {/* 전화번호 */}
        <div>
          <label className="block text-slate-300 text-sm font-medium mb-1">전화번호</label>
          <input
            type="tel"
            name="phone"
            value={form.phone}
            onChange={handleChange}
            placeholder="010-1234-5678"
            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        {/* 주소 */}
        <div>
          <label className="block text-slate-300 text-sm font-medium mb-1">주소</label>
          <input
            type="text"
            name="address"
            value={form.address}
            onChange={handleChange}
            placeholder="예: 인천시 연수구"
            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-white font-bold py-3 rounded-xl text-lg transition-colors"
        >
          {saving ? '저장 중...' : linkedPlayer ? '정보 수정하기' : '회원 신청하기'}
        </button>
      </form>
    </div>
  )
}

export default MemberRegister