import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

// 랜덤 코드 생성 (혼동되는 문자 0,O,1,I,L 제외한 영문+숫자 6자리)
function generateCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

function LetterBoard() {
  const { isPresident } = useAuth()

  // 탭: 'write' | 'check' | 'inbox'(회장)
  const [tab, setTab] = useState('write')

  // ---- 편지 쓰기 상태 ----
  const [content, setContent] = useState('')
  const [pendingCode, setPendingCode] = useState('') // 미리 발급된 코드
  const [issuedCode, setIssuedCode] = useState('')   // 저장 완료된 코드
  const [writing, setWriting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [preCopied, setPreCopied] = useState(false)

  // ---- 내 편지 확인 상태 ----
  const [checkCode, setCheckCode] = useState('')
  const [checkResult, setCheckResult] = useState(null)
  const [checkError, setCheckError] = useState('')
  const [checking, setChecking] = useState(false)

  // ---- 회장 받은 편지함 상태 ----
  const [letters, setLetters] = useState([])
  const [loadingInbox, setLoadingInbox] = useState(false)
  const [replyDrafts, setReplyDrafts] = useState({})

  // 회장 편지함 로드
  useEffect(() => {
    if (tab === 'inbox' && isPresident) {
      fetchInbox()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, isPresident])

  // '편지 쓰기' 탭 진입 시 코드 미리 생성 (아직 발급 전이고 코드 없을 때만)
  useEffect(() => {
    if (tab === 'write' && !issuedCode && !pendingCode) {
      setPendingCode(generateCode())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  // ============ 편지 쓰기 ============
  async function submitLetter(e) {
    e.preventDefault()
    if (!content.trim()) {
      alert('편지 내용을 입력해주세요.')
      return
    }
    setWriting(true)

    // 미리 발급된 코드로 먼저 시도, 중복이면 새 코드로 재시도(최대 5회)
    let lastError = null
    let code = pendingCode || generateCode()
    for (let attempt = 0; attempt < 5; attempt++) {
      const { error } = await supabase
        .from('letters')
        .insert({ content: content.trim(), code })

      if (!error) {
        setIssuedCode(code)
        setContent('')
        setPendingCode('')
        setWriting(false)
        return
      }
      lastError = error
      if (error.code !== '23505') break // 중복 외 오류면 중단
      code = generateCode() // 중복이면 새 코드로
    }

    setWriting(false)
    console.error(lastError)
    alert('편지 등록에 실패했습니다. 잠시 후 다시 시도해주세요.')
  }

  function copyCode() {
    navigator.clipboard?.writeText(issuedCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function copyPendingCode() {
    navigator.clipboard?.writeText(pendingCode)
    setPreCopied(true)
    setTimeout(() => setPreCopied(false), 2000)
  }

  function writeAnother() {
    setIssuedCode('')
    setContent('')
    setPendingCode(generateCode()) // 새 편지용 코드 미리 발급
  }

  // ============ 내 편지 확인 ============
  async function checkLetter(e) {
    e.preventDefault()
    const code = checkCode.trim().toUpperCase()
    if (!code) {
      setCheckError('코드를 입력해주세요.')
      return
    }
    setChecking(true)
    setCheckError('')
    setCheckResult(null)

    const { data, error } = await supabase.rpc('get_letter_by_code', { p_code: code })

    setChecking(false)

    if (error) {
      console.error(error)
      setCheckError('조회 중 오류가 발생했습니다.')
      return
    }
    if (!data || data.length === 0) {
      setCheckError('해당 코드의 편지를 찾을 수 없습니다. 코드를 다시 확인해주세요.')
      return
    }
    setCheckResult(data[0])
  }

  // ============ 회장: 받은 편지함 ============
  async function fetchInbox() {
    setLoadingInbox(true)
    const { data, error } = await supabase
      .from('letters')
      .select('*')
      .order('created_at', { ascending: false })
    setLoadingInbox(false)
    if (error) {
      console.error(error)
      alert('편지함을 불러오지 못했습니다.')
      return
    }
    setLetters(data || [])
  }

  async function saveReply(id) {
    const reply = (replyDrafts[id] || '').trim()
    if (!reply) {
      alert('답글 내용을 입력해주세요.')
      return
    }
    const { error } = await supabase
      .from('letters')
      .update({ reply, replied_at: new Date().toISOString() })
      .eq('id', id)
    if (error) {
      console.error(error)
      alert('답글 저장에 실패했습니다.')
      return
    }
    setReplyDrafts((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    fetchInbox()
  }

  async function deleteLetter(id) {
    if (!window.confirm('이 편지를 삭제하시겠습니까? 되돌릴 수 없습니다.')) return
    const { error } = await supabase.from('letters').delete().eq('id', id)
    if (error) {
      console.error(error)
      alert('삭제에 실패했습니다.')
      return
    }
    fetchInbox()
  }

  function fmt(ts) {
    if (!ts) return ''
    const d = new Date(ts)
    return d.toLocaleString('ko-KR', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
  }

  return (
    <div style={styles.page}>
      <h2 style={styles.title}>💌 마음의 편지</h2>
      <p style={styles.subtitle}>
        익명으로 마음을 전하세요. 작성자 정보는 저장되지 않습니다.
      </p>

      {/* 탭 */}
      <div style={styles.tabs}>
        <button
          style={tab === 'write' ? styles.tabActive : styles.tab}
          onClick={() => setTab('write')}
        >
          ✍️ 편지 쓰기
        </button>
        <button
          style={tab === 'check' ? styles.tabActive : styles.tab}
          onClick={() => setTab('check')}
        >
          🔍 내 편지 확인
        </button>
        {isPresident && (
          <button
            style={tab === 'inbox' ? styles.tabActive : styles.tab}
            onClick={() => setTab('inbox')}
          >
            📬 받은 편지 전체
          </button>
        )}
      </div>

      {/* ===== 편지 쓰기 ===== */}
      {tab === 'write' && (
        <div style={styles.card}>
          {!issuedCode ? (
            <form onSubmit={submitLetter}>
              {/* 미리 보여주는 코드 안내 */}
              <div style={styles.preCodeBox}>
                <span style={styles.preCodeLabel}>📌 나의 확인 코드</span>
                <span style={styles.preCode}>{pendingCode}</span>
                <span style={styles.preCodeHint}>
                  이 코드로 나중에 답글을 확인해요. 꼭 저장하세요!
                </span>
                <button type="button" style={styles.preCopyBtn} onClick={copyPendingCode}>
                  {preCopied ? '✅ 복사됨' : '📋 코드 복사'}
                </button>
              </div>

              <label style={styles.label}>편지 내용</label>
              <textarea
                style={styles.textarea}
                rows={8}
                placeholder="회장님께 전하고 싶은 이야기를 자유롭게 적어주세요."
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
              <button type="submit" style={styles.primaryBtn} disabled={writing}>
                {writing ? '등록 중...' : '편지 보내기'}
              </button>
            </form>
          ) : (
            <div style={styles.codeBox}>
              <p style={styles.codeGuide}>
                ✅ 편지가 전달되었습니다!<br />
                아래 <b>확인 코드</b>를 꼭 저장하세요.
              </p>
              <div style={styles.codeDisplay}>{issuedCode}</div>
              <button style={styles.copyBtn} onClick={copyCode}>
                {copied ? '✅ 복사됨' : '📋 코드 복사'}
              </button>
              <p style={styles.warn}>
                ⚠️ 이 코드를 잃어버리면 회장님의 답글을 확인할 수 없습니다.
                (작성자 정보를 저장하지 않기 때문에 코드 복구가 불가능합니다.)
              </p>
              <button style={styles.secondaryBtn} onClick={writeAnother}>
                다른 편지 쓰기
              </button>
            </div>
          )}
        </div>
      )}

      {/* ===== 내 편지 확인 ===== */}
      {tab === 'check' && (
        <div style={styles.card}>
          <form onSubmit={checkLetter} style={styles.checkForm}>
            <label style={styles.label}>확인 코드 입력</label>
            <div style={styles.checkRow}>
              <input
                style={styles.codeInput}
                placeholder="예: A7X9K2"
                value={checkCode}
                maxLength={6}
                onChange={(e) => setCheckCode(e.target.value.toUpperCase())}
              />
              <button type="submit" style={styles.primaryBtn} disabled={checking}>
                {checking ? '조회 중...' : '확인'}
              </button>
            </div>
          </form>

          {checkError && <p style={styles.error}>{checkError}</p>}

          {checkResult && (
            <div style={styles.resultBox}>
              <div style={styles.letterBlock}>
                <div style={styles.blockLabel}>📝 내 편지</div>
                <div style={styles.letterContent}>{checkResult.content}</div>
                <div style={styles.meta}>{fmt(checkResult.created_at)}</div>
              </div>

              {checkResult.reply ? (
                <div style={styles.replyBlock}>
                  <div style={styles.blockLabel}>💬 회장님의 답글</div>
                  <div style={styles.letterContent}>{checkResult.reply}</div>
                  <div style={styles.meta}>{fmt(checkResult.replied_at)}</div>
                </div>
              ) : (
                <div style={styles.noReply}>
                  아직 회장님의 답글이 없습니다. 조금만 기다려주세요. 🙏
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ===== 회장: 받은 편지 전체 ===== */}
      {tab === 'inbox' && isPresident && (
        <div>
          {loadingInbox ? (
            <p style={styles.loading}>불러오는 중...</p>
          ) : letters.length === 0 ? (
            <p style={styles.empty}>아직 도착한 편지가 없습니다.</p>
          ) : (
            letters.map((l) => (
              <div key={l.id} style={styles.card}>
                <div style={styles.letterBlock}>
                  <div style={styles.blockLabel}>📝 편지</div>
                  <div style={styles.letterContent}>{l.content}</div>
                  <div style={styles.meta}>{fmt(l.created_at)}</div>
                </div>

                {l.reply ? (
                  <div style={styles.replyBlock}>
                    <div style={styles.blockLabel}>💬 내 답글</div>
                    <div style={styles.letterContent}>{l.reply}</div>
                    <div style={styles.meta}>{fmt(l.replied_at)}</div>
                  </div>
                ) : (
                  <div style={styles.replyForm}>
                    <textarea
                      style={styles.textarea}
                      rows={3}
                      placeholder="답글을 작성하세요..."
                      value={replyDrafts[l.id] || ''}
                      onChange={(e) =>
                        setReplyDrafts((prev) => ({ ...prev, [l.id]: e.target.value }))
                      }
                    />
                    <button style={styles.primaryBtn} onClick={() => saveReply(l.id)}>
                      답글 등록
                    </button>
                  </div>
                )}

                <button style={styles.deleteBtn} onClick={() => deleteLetter(l.id)}>
                  🗑 삭제
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ===== 다크 테마 스타일 =====
const styles = {
  page: { maxWidth: 640, margin: '0 auto', padding: 16, color: '#e5e7eb' },
  title: { fontSize: 22, fontWeight: 700, marginBottom: 4, color: '#f9fafb' },
  subtitle: { fontSize: 13, color: '#9ca3af', marginBottom: 16 },
  tabs: { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  tab: {
    padding: '8px 14px', border: '1px solid #374151', borderRadius: 8,
    background: '#1f2937', color: '#d1d5db', cursor: 'pointer', fontSize: 14,
  },
  tabActive: {
    padding: '8px 14px', border: '1px solid #6366f1', borderRadius: 8,
    background: '#6366f1', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600,
  },
  card: {
    border: '1px solid #374151', borderRadius: 12, padding: 16,
    marginBottom: 16, background: '#1f2937',
    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
  },
  label: { display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#d1d5db' },
  textarea: {
    width: '100%', boxSizing: 'border-box', padding: 10, borderRadius: 8,
    border: '1px solid #374151', background: '#111827', color: '#f3f4f6',
    fontSize: 14, resize: 'vertical', marginBottom: 10,
  },
  primaryBtn: {
    padding: '10px 18px', background: '#6366f1', color: '#fff',
    border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600,
  },
  secondaryBtn: {
    padding: '10px 18px', background: '#374151', color: '#e5e7eb',
    border: '1px solid #4b5563', borderRadius: 8, cursor: 'pointer', fontSize: 14, marginTop: 12,
  },
  // 미리 보여주는 코드 박스
  preCodeBox: {
    display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center',
    background: '#312e81', border: '1px solid #4338ca',
    borderRadius: 10, padding: 14, marginBottom: 14, textAlign: 'center',
  },
  preCodeLabel: { fontSize: 12, color: '#c7d2fe' },
  preCode: {
    fontSize: 26, fontWeight: 800, letterSpacing: 5, color: '#a5b4fc',
    fontFamily: 'monospace',
  },
  preCodeHint: { fontSize: 11, color: '#c7d2fe' },
  preCopyBtn: {
    marginTop: 4, padding: '6px 14px', background: 'transparent',
    border: '1px solid #6366f1', color: '#a5b4fc', borderRadius: 8,
    cursor: 'pointer', fontSize: 13,
  },
  codeBox: { textAlign: 'center' },
  codeGuide: { fontSize: 15, lineHeight: 1.6, marginBottom: 12, color: '#e5e7eb' },
  codeDisplay: {
    fontSize: 34, fontWeight: 800, letterSpacing: 6, color: '#a5b4fc',
    background: '#312e81', borderRadius: 10, padding: '16px 0', marginBottom: 12,
    fontFamily: 'monospace',
  },
  copyBtn: {
    padding: '8px 16px', background: 'transparent', border: '1px solid #6366f1',
    color: '#a5b4fc', borderRadius: 8, cursor: 'pointer', fontSize: 14,
  },
  warn: {
    fontSize: 12, color: '#fcd34d', background: '#422006',
    border: '1px solid #78350f', borderRadius: 8, padding: 10, marginTop: 14, lineHeight: 1.5,
  },
  checkForm: { marginBottom: 8 },
  checkRow: { display: 'flex', gap: 8 },
  codeInput: {
    flex: 1, padding: 12, borderRadius: 8, border: '1px solid #374151',
    background: '#111827', color: '#f3f4f6',
    fontSize: 20, letterSpacing: 4, textTransform: 'uppercase',
    fontFamily: 'monospace', textAlign: 'center',
  },
  error: { color: '#f87171', fontSize: 13, marginTop: 10 },
  resultBox: { marginTop: 16 },
  letterBlock: {
    background: '#111827', borderRadius: 10, padding: 14, marginBottom: 12,
    border: '1px solid #374151',
  },
  replyBlock: {
    background: '#312e81', borderRadius: 10, padding: 14, marginBottom: 12,
    border: '1px solid #4338ca',
  },
  blockLabel: { fontSize: 13, fontWeight: 700, marginBottom: 6, color: '#9ca3af' },
  letterContent: { fontSize: 15, lineHeight: 1.6, whiteSpace: 'pre-wrap', color: '#f3f4f6' },
  meta: { fontSize: 12, color: '#6b7280', marginTop: 8, textAlign: 'right' },
  noReply: {
    fontSize: 14, color: '#9ca3af', textAlign: 'center', padding: 16,
    background: '#111827', borderRadius: 10, border: '1px solid #374151',
  },
  replyForm: { marginTop: 8 },
  deleteBtn: {
    marginTop: 8, padding: '6px 12px', background: 'transparent',
    border: '1px solid #7f1d1d', color: '#f87171', borderRadius: 8,
    cursor: 'pointer', fontSize: 13,
  },
  loading: { color: '#9ca3af' },
  empty: { textAlign: 'center', color: '#9ca3af', padding: 40 },
}

export default LetterBoard