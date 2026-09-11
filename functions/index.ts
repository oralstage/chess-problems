// 旧アドレス chess-problems.pages.dev に来た人を arcade.chessproblem.org へ送る。
//
// `/` だけを見る。このアプリのルートは全部フラグメント（#/direct/yacpdb/123 等）なので、人が
// 着地するパスは `/` しかない。_middleware.ts だと全リクエストを通るので使わない — `/api/*` が
// 301 を返すようになると、raspi の死活監視（content-type も検査する）・daily-post・
// build-problem-index が黙って壊れる。この形なら API は素通りで、向き先の書き換えは要らない。
//
// フラグメントは書かない。転送先にフラグメントが無ければブラウザが元のものを付け直すので、
// #/direct/yacpdb/123 で共有されたリンクはそのまま新アドレスで開く。クエリは引き継がれない
// ので自分で足す。
//
// 301（恒久）。ただし Cache-Control: no-store を付ける。301 は既定ではブラウザが恒久的に
// キャッシュし、後で外してもサーバーに問い合わせが来なくなる（＝一度踏んだ人を旧アドレスに
// 戻せない）が、明示的な指定があればキャッシュされない。移転として伝わる 301 のまま、撤回の
// 余地を残すため。Response.redirect はヘッダを付けられないので Response を自分で組む。
// プレビュー用の <hash>.chess-problems.pages.dev は完全一致しないので転送しない。
//
// ⚠️ `?handoff=` は転送しない。これはレートの引き継ぎで、新アドレスから「このブラウザの
// アカウントをくれ」と来た要求（src/utils/domainHandoff.ts）。ここで 301 を返すと旧アドレスの
// JS が走らず、セッションIDを渡せないまま送り返すことになり、引き継ぎが**全員で静かに失敗
// する**。マーカーがフラグメントではなくクエリにあるのはこのため — フラグメントはサーバーに
// 届かないので、ここで見分けられない。

const OLD_HOST = 'chess-problems.pages.dev'
const NEW_ORIGIN = 'https://arcade.chessproblem.org'

export const onRequest = (context: { request: Request; next: () => Promise<Response> }) => {
  const url = new URL(context.request.url)
  // Pages routes this file to `/` alone, so the path check is belt and braces —
  // but it is what keeps the promise that `/api/*` never sees a 301, and that
  // promise is what the raspi monitor and the post/index scripts rely on.
  if (url.pathname !== '/') return context.next()
  if (url.hostname !== OLD_HOST) return context.next()
  if (url.searchParams.has('handoff')) return context.next()
  return new Response(null, {
    status: 301,
    headers: { location: NEW_ORIGIN + '/' + url.search, 'cache-control': 'no-store' },
  })
}
