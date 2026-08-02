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

function MemberRegister() {
  const { user, profile, reloadProfile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [linkedPlayer, setLinkedPlayer] = useState(null) // 이미 연결된 선수

  // 'choose' | 'existing' | 'new'
  const [mode, setMode] = useState('choose')

  // 기존 명단에서 찾기용
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
    } else {
      setLinkedPlayer(null)
    }
    setLoading(false)
  }

  // 아직 계정과 연결되지 않은 활동중 선수 목록 불러오기
  async function fetchAvailablePlayers() {
    setListLoading(true)

    const [playerRes, profileRes] = await Promise.all([
      supabase
        .from('players')
        .select('id, name, phone, is_active')
        .order('name'),
      supabase.from('profiles').select('player_id'),
    ])

    const allPlayers = (playerRes.data || []).filter(p => p.is_active !== false)

    // 이미 다른 계정에 연결된 선수 id 목록 (조회 권한이 없으면 필터 생략)
    const linkedIds = new Set(
      (profileRes.data || [])
        .map(p => p.player_id)
        .filter(Boolean)
    )

    const available = allPlayers.filter(p => !linkedIds.has(p.id))
    setAvailablePlayers(available)
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
    setSelectedPlayerId('') // 검색어가 바뀌면 선택 해제
  }

  function handleChange(e) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  // ✅ 기존 명단의 선수와 내 계정 연결하기
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
      // ⚠️ 신규 등록 전, 동명이인 확인
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

  // 🔍 이름이 "정확히 일치"할 때만 결과 표시
  const keyword = playerSearch.trim()
  const matchedPlayers = keyword
    ? availablePlayers.filter(p => (p.name || '').trim() === keyword)
    : []

  // ─────────────────────────────────────────────
  // ① 아직 연결 안 됨 + 선택 화면
  // ─────────────────────────────────────────────
  if (!linkedPlayer && mode === 'choose') {
    return (
      <div className="max-w-lg mx-auto">
        <h1 className="text-2xl font-bold text-white mb-1">📝 회원 등록 및 정회원 요청</h1>
        <p className="text-slate-400 text-sm mb-6">
          FM FC에 오신 것을 환영합니다! 아래에서 해당하는 항목을 선택해 주세요. ⚽
        </p>

        <div className="space-y-4">
          {/* 기존 회원 */}
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

          {/* 신규 */}
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
  // ② 기존 명단에서 내 이름 찾기 (정확히 일치할 때만 노출)
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

        {/* 검색 */}
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
          /* 입력 전 안내 */
          <div className="text-center py-12 bg-slate-800/40 rounded-xl border border-dashed border-slate-700">
            <p className="text-4xl mb-3">🔍</p>
            <p className="text-slate-300 mb-1">이름을 입력해 주세요</p>
            <p className="text-slate-500 text-sm">
              개인정보 보호를 위해 전체 명단은 표시되지 않습니다
            </p>
          </div>
        ) : matchedPlayers.length === 0 ? (
          /* 일치하는 이름 없음 */
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
            {/* 결과 개수 안내 */}
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

                      {/* 📱 전화번호 뒷자리 */}
                      {masked ? (
                        <span className="text-emerald-400/90 text-xs font-mono bg-emerald-500/10 px-1.5 py-0.5 rounded flex-shrink-0">
                          {masked}
                        </span>
                      ) : (
                        <span className="text-slate-500 text-xs font-mono bg-slate-700/40 px-1.5 py-0.5 rounded flex-shrink-0">
                          번호없음
                        </span>
                      )}

                      {selected && (
                        <span className="text-emerald-400 text-xs ml-auto flex-shrink-0">✔ 선택됨</span>
                      )}
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
  // ③ 신규 등록 폼 / 연결 후 정보 수정 폼
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