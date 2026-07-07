import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function PlayerForm() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = Boolean(id)

  const [form, setForm] = useState({
    name: '',
    nickname: '',
    phone: '',
    email: '',
    position: '',
    back_number: '',
    birth_date: '',
    role: '일반',
    status: '활동',
  })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isEdit) {
      fetchPlayer()
    }
  }, [id])

  async function fetchPlayer() {
    const { data, error } = await supabase
      .from('players')
      .select('*')
      .eq('id', id)
      .single()

    if (data) {
      setForm({
        name: data.name || '',
        nickname: data.nickname || '',
        phone: data.phone || '',
        email: data.email || '',
        position: data.position || '',
        back_number: data.back_number || '',
        birth_date: data.birth_date || '',
        role: data.role || '일반',
        status: data.status || '활동',
      })
    }
  }

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  async function handleSubmit(e) {
    e.preventDefault()

    if (!form.name) {
      alert('이름을 입력해주세요!')
      return
    }

    setLoading(true)

    const playerData = {
      ...form,
      back_number: form.back_number ? Number(form.back_number) : null,
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
      navigate('/')
    }
  }

  const inputStyle = "w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500"
  const labelStyle = "block text-slate-300 text-sm font-medium mb-2"

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold text-white mb-8">
        {isEdit ? '✏️ 선수 정보 수정' : '➕ 새 선수 등록'}
      </h1>

      <form onSubmit={handleSubmit} className="bg-slate-800 rounded-xl p-6 border border-slate-700">
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

          {/* 별명 */}
          <div>
            <label className={labelStyle}>별명</label>
            <input
              type="text"
              name="nickname"
              value={form.nickname}
              onChange={handleChange}
              placeholder="별명 (선택사항)"
              className={inputStyle}
            />
          </div>

          {/* 포지션 */}
          <div>
            <label className={labelStyle}>포지션</label>
            <select
              name="position"
              value={form.position}
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

          {/* 등번호 */}
          <div>
            <label className={labelStyle}>등번호</label>
            <input
              type="number"
              name="back_number"
              value={form.back_number}
              onChange={handleChange}
              placeholder="7"
              min="1"
              max="99"
              className={inputStyle}
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

          {/* 이메일 */}
          <div>
            <label className={labelStyle}>이메일</label>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              placeholder="email@example.com"
              className={inputStyle}
            />
          </div>

          {/* 생년월일 */}
          <div>
            <label className={labelStyle}>생년월일</label>
            <input
              type="date"
              name="birth_date"
              value={form.birth_date}
              onChange={handleChange}
              className={inputStyle}
            />
          </div>

          {/* 역할 */}
          <div>
            <label className={labelStyle}>역할</label>
            <select
              name="role"
              value={form.role}
              onChange={handleChange}
              className={inputStyle}
            >
              <option value="일반">일반</option>
              <option value="회장">회장</option>
              <option value="부회장">부회장</option>
              <option value="총무">총무</option>
              <option value="운영진">운영진</option>
            </select>
          </div>

          {/* 상태 */}
          <div>
            <label className={labelStyle}>상태</label>
            <select
              name="status"
              value={form.status}
              onChange={handleChange}
              className={inputStyle}
            >
              <option value="활동">활동</option>
              <option value="휴식">휴식</option>
              <option value="탈퇴">탈퇴</option>
            </select>
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
            onClick={() => navigate('/')}
            className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-3 rounded-xl font-semibold transition-colors"
          >
            ↩️ 취소
          </button>
        </div>
      </form>
    </div>
  )
}

export default PlayerForm