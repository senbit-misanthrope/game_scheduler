// lib/notifications.js

export const sendDiscordMessage = async (message) => {
    try {
      // 디스코드로 직접 안 가고, 우리가 만든 안전한 서버 API로 전달합니다.
      await fetch('/api/discord', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
    } catch (error) {
      console.error("API 라우터 호출 실패:", error);
    }
  };
  
  // 이메일 알림 보류
  export const sendEmailNotification = async (to, subject, text) => {
    console.log(`[이메일 발송 예약] To: ${to}, Subject: ${subject}`);
  };