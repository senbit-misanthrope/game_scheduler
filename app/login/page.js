'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  
  // 상태 관리: 'login', 'signup', 'forgot' (비밀번호 찾기)
  const [mode, setMode] = useState('login');

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        alert('가입 성공! 메인으로 이동합니다. (호칭은 마이페이지에서 설정해주세요)');
        router.push('/');
      } else if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push('/');
      } else if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/update-password`, 
        });
        if (error) throw error;
        alert('입력하신 이메일로 비밀번호 재설정 링크를 보냈습니다. 메일함을 확인해주세요!');
        setMode('login');
      }
    } catch (error) {
      // 중복 가입 에러 인터셉트 및 커스텀 문구 출력
      if (mode === 'signup' && error.message && error.message.toLowerCase().includes('already registered')) {
        alert('이미 가입된 이메일입니다. 로그인을 하시거나 비밀번호 찾기를 하세요');
      } else {
        alert(error.message || '인증 중 오류가 발생했습니다.');
      }
    } finally {
      setLoading(false);
    }
  };

  // ✨ 신규 추가: 카카오 & 구글 소셜 로그인 처리 함수 (이메일 철벽 우회 적용)
  const handleOAuthLogin = async (provider) => {
    const authOptions = {
      // 로그인 성공 후 메인 페이지로 돌아가기
      redirectTo: `${window.location.origin}/`, 
    };

    // 💡 핵심: 카카오 로그인 시 이메일을 빼고 닉네임/프사만 요청해서 에러(KOE205) 방지
    if (provider === 'kakao') {
      authOptions.scopes = 'profile_nickname profile_image';
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: provider,
      options: authOptions,
    });
    
    if (error) {
      alert("소셜 로그인 중 오류가 발생했습니다.");
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col justify-center items-center p-4 font-sans selection:bg-red-900">
      <div className="mb-8 text-center">
        <h1 className="text-4xl font-black tracking-wider text-zinc-100 drop-shadow-md">
        <span className="text-red-600">D&D Mystery Club</span>
        </h1>
        <p className="text-zinc-500 mt-2 font-bold">
          {mode === 'login' ? '어둠 속으로 입장하세요' : mode === 'signup' ? '새로운 요원으로 합류하세요' : '잃어버린 열쇠를 찾습니다'}
        </p>
      </div>

      <div className="bg-zinc-900 border-2 border-zinc-800 p-8 rounded-3xl w-full max-w-md shadow-2xl">
        
        {/* ✨ 신규 추가: 소셜 로그인 버튼 영역 (비밀번호 찾기 모드가 아닐 때만 표시) */}
        {mode !== 'forgot' && (
          <div className="flex flex-col gap-3 mb-6">
            <button 
              type="button"
              onClick={() => handleOAuthLogin('kakao')}
              className="w-full flex items-center justify-center gap-2 py-3.5 bg-[#FEE500] hover:bg-[#F4DC00] text-[#3A1D1D] rounded-xl font-black shadow-md transition"
            >
              <svg viewBox="0 0 32 32" className="w-5 h-5 fill-current"><path d="M16 4.64c-6.96 0-12.64 4.48-12.64 10.08 0 3.52 2.32 6.64 5.76 8.48l-1.44 5.44c-0.08 0.4 0.32 0.72 0.64 0.56l6.24-4.24c0.48 0.08 0.96 0.08 1.44 0.08 6.96 0 12.64-4.48 12.64-10.08S22.96 4.64 16 4.64z"/></svg>
              카카오 1초 만에 시작하기
            </button>
            <button 
              type="button"
              onClick={() => handleOAuthLogin('google')}
              className="w-full flex items-center justify-center gap-2 py-3.5 bg-white hover:bg-gray-100 text-gray-800 border-2 border-gray-300 rounded-xl font-black shadow-md transition"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Google 계정으로 계속하기
            </button>
            <div className="flex items-center my-3 gap-3">
              <div className="flex-1 border-t-2 border-zinc-800"></div>
              <span className="text-xs font-bold text-zinc-500">또는 이메일로 진행</span>
              <div className="flex-1 border-t-2 border-zinc-800"></div>
            </div>
          </div>
        )}

        <form onSubmit={handleAuth} className="space-y-5">
          <div>
            <label className="block text-sm font-bold text-zinc-400 mb-2">아이디 (이메일)</label>
            <input 
              type="email" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              required 
              className="w-full bg-zinc-950 border-2 border-zinc-700 p-3 rounded-xl focus:border-red-600 text-zinc-100 outline-none transition" 
            />
          </div>
          
          {mode !== 'forgot' && (
            <div>
              <label className="block text-sm font-bold text-zinc-400 mb-2">비밀번호</label>
              <input 
                type="password" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                required 
                className="w-full bg-zinc-950 border-2 border-zinc-700 p-3 rounded-xl focus:border-red-600 text-zinc-100 outline-none transition" 
              />
            </div>
          )}

          {mode === 'signup' && (
            <div className="bg-red-950/30 border border-red-900/50 p-4 rounded-xl mt-4">
              <h4 className="text-red-500 font-black text-sm flex items-center gap-1.5 mb-2">
                <span>🚨</span> 신입 요원 보안 수칙
              </h4>
              <ul className="text-xs font-bold text-zinc-400 space-y-1.5 pl-5 list-disc">
                <li><span className="text-zinc-300">이메일:</span> 비밀번호 복구를 위해 수신 가능한 실제 주소를 입력하세요.</li>
                <li><span className="text-red-400">비밀번호:</span> 외부 서비스와 동일한 암호는 <span className="underline decoration-red-500 decoration-2 text-red-300">절대 사용 금지</span>합니다. (보안 취약 우려)</li>
              </ul>
            </div>
          )}

          <button 
            type="submit" 
            disabled={loading} 
            className={`w-full py-3.5 rounded-xl font-black tracking-wide transition shadow-lg border-2 mt-2 ${
              loading ? 'bg-zinc-800 border-zinc-700 text-zinc-500 cursor-not-allowed' : 'bg-red-800 border-red-700 text-white hover:bg-red-700'
            }`}
          >
            {loading ? '처리 중...' : mode === 'login' ? '입장하기 🚪' : mode === 'signup' ? '서약하기 🩸' : '복구 링크 받기 📧'}
          </button>
        </form>

        <div className="mt-6 flex flex-col gap-3 text-center border-t-2 border-zinc-800 pt-6">
          {mode === 'login' ? (
            <>
              <button onClick={() => setMode('signup')} className="text-sm font-bold text-zinc-400 hover:text-zinc-200 transition">
                아직 아지트의 일원이 아니신가요? <span className="text-red-500 hover:underline">가입하기</span>
              </button>
              <button onClick={() => setMode('forgot')} className="text-sm font-bold text-zinc-500 hover:text-zinc-300 transition">
                비밀번호를 잊으셨나요?
              </button>
            </>
          ) : (
            <button onClick={() => setMode('login')} className="text-sm font-bold text-zinc-400 hover:text-zinc-200 transition">
              이미 요원이신가요? <span className="text-red-500 hover:underline">돌아가기</span>
            </button>
          )}
        </div>
      </div>
      
      <Link href="/" className="mt-8 text-zinc-600 font-bold hover:text-zinc-400 transition text-sm">
        ← 메인으로 돌아가기 (임시)
      </Link>
    </div>
  );
}