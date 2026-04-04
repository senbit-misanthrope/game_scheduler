'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function AuthGuard({ children }) {
  const router = useRouter();
  const pathname = usePathname(); // ✨ 현재 서 있는 페이지 주소를 파악합니다.
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      // ✨ 누구나 여권(로그인) 없이 들어갈 수 있는 '퍼블릭 로비' 지정
      const publicPaths = ['/', '/login'];

      // 유저 정보가 없는데, 퍼블릭 로비도 아닌 곳(마이페이지, 관리자 등)에 가려고 하면 쫓아냅니다.
      if (!session && !publicPaths.includes(pathname)) {
        router.push('/login');
      }
      setLoading(false);
    };
    
    checkAuth();
  }, [pathname, router]);

  // 로딩 중일 때 잠깐 보여줄 화면 (깜빡임 방지)
  if (loading) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-500 font-bold">신원 확인 중... 🔍</div>;

  return <>{children}</>;
}