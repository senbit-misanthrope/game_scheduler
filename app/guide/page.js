'use client';

import Link from 'next/link';

export default function GuidePage() {
  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto bg-zinc-950 min-h-screen text-zinc-200 font-sans selection:bg-red-900">
      
      <div className="mb-8 border-b-2 border-zinc-800 pb-4 flex justify-between items-end">
        <div>
          <h1 className="text-3xl md:text-4xl font-black text-zinc-100 mb-2 tracking-tight">
            신입 요원 행동 지침서 📜
          </h1>
          <p className="text-zinc-400 font-bold text-sm md:text-base">
            D&D Mystery Club 아지트의 시스템을 100% 활용하는 방법
          </p>
        </div>
        <Link href="/" className="px-4 py-2 bg-zinc-800 border-2 border-zinc-600 text-zinc-200 rounded-lg font-bold text-sm hover:bg-zinc-700 transition shadow-sm whitespace-nowrap">
          대시보드로
        </Link>
      </div>

      <div className="space-y-8">
        
        {/* Section 1: 기본 수칙 */}
        <section className="bg-zinc-900 p-6 md:p-8 rounded-3xl border-2 border-zinc-700 shadow-md relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-red-900/10 rounded-bl-full -z-10"></div>
          <h2 className="text-2xl font-black text-zinc-100 mb-4 flex items-center gap-2">
            <span>🚨</span> 01. 머더 미스테리 기본 수칙
          </h2>
          <div className="space-y-3 text-zinc-300 leading-relaxed">
            <p><span className="font-bold text-red-400">스포일러 절대 금지:</span> 머더 미스테리는 평생 단 한 번만 플레이할 수 있는 장르입니다. 범인, 트릭, 결말 등 일체의 스포일러를 금지합니다.</p>
            <p><span className="font-bold text-emerald-400">플레이 기록 관리:</span> 한 번 플레이한 게임은 상세 페이지에서 <button className="inline-block px-2 py-0.5 mx-1 bg-zinc-800 border border-zinc-600 rounded text-xs font-bold text-zinc-100">플레이 안함</button> 버튼을 눌러 상태를 변경해주세요. 시스템이 자동으로 요원님의 중복 참여를 막아줍니다.</p>
          </div>
        </section>

        {/* Section 2: 모임 소집 */}
        <section className="bg-zinc-900 p-6 md:p-8 rounded-3xl border-2 border-zinc-700 shadow-md">
          <h2 className="text-2xl font-black text-zinc-100 mb-4 flex items-center gap-2">
            <span>🤝</span> 02. 비밀 모임 소집 및 참여
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-zinc-950 p-5 rounded-2xl border border-zinc-800">
              <h3 className="text-lg font-bold text-zinc-200 mb-2">모임 소집하기</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                메인 대시보드에서 원하는 게임(들)의 <span className="inline-block w-4 h-4 border border-zinc-500 rounded bg-zinc-800 mx-1 align-middle"></span> 체크박스를 선택한 후, <strong className="text-red-400">거사일(날짜)</strong>과 <strong className="text-purple-400">역할(참가자/GM)</strong>을 정해 소집을 요청할 수 있습니다.
              </p>
            </div>
            <div className="bg-zinc-950 p-5 rounded-2xl border border-zinc-800">
              <h3 className="text-lg font-bold text-zinc-200 mb-2">모임 확정 시스템</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                <strong className="text-zinc-200">📊 현황판</strong>에서 모임 대기열을 확인하세요. 최소 인원이 모이고, (필요한 경우) GM이 배정되면 자동으로 <strong className="text-emerald-400">디스코드 알림</strong>과 함께 모임이 확정됩니다.
              </p>
            </div>
          </div>
        </section>

        {/* Section 3: 역할 안내 (GM) */}
        <section className="bg-zinc-900 p-6 md:p-8 rounded-3xl border-2 border-zinc-700 shadow-md">
          <h2 className="text-2xl font-black text-zinc-100 mb-4 flex items-center gap-2">
            <span>👑</span> 03. 모임의 지배자 (GM)
          </h2>
          <div className="space-y-4 text-zinc-300 leading-relaxed">
            <p>
              머더 미스테리는 원활한 진행을 위해 <strong className="text-purple-400">GM(Game Master)</strong>이 필수적인 경우가 많습니다. 게임 카드에 <span className="inline-block px-2 py-0.5 mx-1 bg-zinc-800 border border-purple-800 text-purple-400 rounded text-xs font-bold">👑 GM 필수</span> 뱃지가 있다면, 참가자 외에 반드시 GM 역할을 맡을 요원이 필요합니다.
            </p>
            <div className="bg-purple-950/20 border border-purple-900/50 p-4 rounded-xl text-sm">
              💡 본인이 룰을 숙지하고 진행할 수 있는 게임이라면 상세 페이지에서 <button className="inline-block px-2 py-0.5 mx-1 bg-purple-900 border border-purple-700 rounded text-xs font-bold text-purple-100">👑 GM 가능</button> 상태로 체크해 두세요! 현황판에서 구인 중인 게임에 GM으로 합류하여 다른 요원들의 플레이를 도울 수 있습니다.
            </div>
          </div>
        </section>

        {/* Section 4: 추천 및 기록 */}
        <section className="bg-zinc-900 p-6 md:p-8 rounded-3xl border-2 border-zinc-700 shadow-md">
          <h2 className="text-2xl font-black text-zinc-100 mb-4 flex items-center gap-2">
            <span>🎯</span> 04. 맞춤 추천과 명예의 전당
          </h2>
          <ul className="space-y-4 text-zinc-300">
            <li className="flex items-start gap-3">
              <span className="bg-zinc-800 p-2 rounded-lg text-lg">🎯</span>
              <div>
                <strong className="block text-zinc-200 mb-1">맞춤 추천기</strong>
                <span className="text-sm text-zinc-400">모인 인원수와 참석자 닉네임을 입력하면, 아무도 해보지 않은 게임 중 평점과 최적 인원을 분석하여 베스트 게임을 추천해 드립니다.</span>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="bg-zinc-800 p-2 rounded-lg text-lg">🏆</span>
              <div>
                <strong className="block text-zinc-200 mb-1">명예의 전당 & 기록 보관소</strong>
                <span className="text-sm text-zinc-400">활동을 많이 할수록 명예의 전당 랭킹이 올라갑니다. 거사가 끝난 후에는 상세 페이지에 별점과 감상(스포일러 주의!)을 남겨주세요.</span>
              </div>
            </li>
          </ul>
        </section>

        {/* Footer / 서명 */}
        <div className="text-center pt-8 pb-4">
          <p className="text-zinc-500 font-bold text-sm">무사히 거사를 마치고 돌아오시길 바랍니다.</p>
          <p className="text-zinc-600 font-black mt-2 tracking-widest">- 총괄 매니저 쎈빛 -</p>
        </div>

      </div>
    </div>
  );
}