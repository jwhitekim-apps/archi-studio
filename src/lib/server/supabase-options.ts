// 서버가 만드는 모든 Supabase 클라이언트의 공통 옵션. 요청마다 새로 만들고 세션을 안에 저장하지 않는다.
// Node 20에는 전역 WebSocket이 없어 supabase-js가 Realtime 클라이언트를 만들 때 실패한다.
// 실시간 기능은 쓰지 않으므로 빈 전송 클래스를 넘겨 추가 의존성(ws) 없이 넘어간다. Node 22 이상으로 올리면 지울 수 있다.
class UnusedWebSocket {}

export const supabaseClientOptions = {
	auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
	realtime: { transport: UnusedWebSocket as unknown as typeof WebSocket }
};
