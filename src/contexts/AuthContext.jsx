import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)   // 로그인 세션
  const [profile, setProfile] = useState(null)   // 내 프로필(권한 포함)
  const [loading, setLoading] = useState(true)

  // 내 프로필(권한) 불러오기
  async function loadProfile(userId) {
    if (!userId) {
      setProfile(null)
      return
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (error) {
      console.error('프로필 불러오기 오류:', error)
      setProfile(null)
      return
    }

    // ✅ 연결된 선수(players) 이름으로 표시 이름 교체
    let displayName = data.name
    if (data.player_id) {
      const { data: player } = await supabase
        .from('players')
        .select('name')
        .eq('id', data.player_id)
        .maybeSingle()
      if (player?.name) displayName = player.name
    }

    // profile.name을 선수 이름으로 덮어쓰기 (선수 연결 안 됐으면 원래 이름 유지)
    setProfile({ ...data, name: displayName })
  }

  useEffect(() => {
    // 처음 진입 시 현재 세션 확인
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session)
      await loadProfile(session?.user?.id)
      setLoading(false)
    })

    // 로그인/로그아웃 상태 변화 감지
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session)
      await loadProfile(session?.user?.id)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  // 구글 로그인
  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    })
    if (error) console.error('로그인 오류:', error)
  }

  // 로그아웃
  async function signOut() {
    await supabase.auth.signOut()
    setSession(null)
    setProfile(null)
  }

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    role: profile?.role ?? null,   // 편하게 쓰기 위한 권한 값
    loading,
    signInWithGoogle,
    signOut,
    reloadProfile: () => loadProfile(session?.user?.id),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// 어디서든 로그인 정보/권한 꺼내 쓰는 훅
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth는 AuthProvider 안에서만 사용할 수 있습니다.')
  return ctx
}