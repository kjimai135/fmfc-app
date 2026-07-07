import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function PlayerForm() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = Boolean(id)

  const [form, setForm] = useState({
    category: '정회원',
    name: '',
    address: '',
    birth_year: '',
    main_position: '',
    join_date: '',
    phone: '',
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
        category: data.category || '정회원',
        name: data.name || '',
        address: data.address || '',
        birth_year: data.birth_year || '',
        main_position: data.main_position || '',
        join_date: data.join_date || '',
        phone: data.phone || '',
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
      birth_year: form.birth_year ? Number(form.birth_year) : null,
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
          {/* 카테고리 */}
          <div>
            <label className={labelStyle}>카테고리 *</label>
            <select
              name="category"
              value={form.category}
              onChange={handleChange}
              className={inputStyle}
            >
              <option value="정회원">정회원</option>
              <option value="예비회원">예비회원</option>
              <option value="임원">임원</option>
            </select>
          </div>

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
          <div>
            <label className={labelStyle}>가입연월</label>
            <input
              type="month"
              name="join_date"
              value={form.join_date}
              onChange={handleChange}
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