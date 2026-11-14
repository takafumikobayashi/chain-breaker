# 公開手順（Cloudflare Pages）

公開先は `https://chain-breaker.tariki-code.tokyo/` です。サイトは静的ファイルだけなので、`npm run build` で作られる `dist/` の中身を Cloudflare Pages に置けば動きます。

Cloudflare の画面の名称や配置は変わることがあります。見当たらない場合は、Cloudflare の公式ドキュメントで「Pages」「Custom domains」を確認してください。

## 公開前のチェック

```sh
npm run build     # 型チェック → 本番用ビルド → og:image などが絶対 URL かの確認（違えばエラーで止まる）
npm run preview   # dist/ を手元で確認
```

## 方法A：GitHub と連携して自動で公開する（おすすめ）

ブランチへの push のたびに Cloudflare がビルドして公開します。

1. リポジトリを GitHub に push する（`https://github.com/takafumikobayashi/chain-breaker`）。
2. Cloudflare のダッシュボードで「Workers & Pages」→ 作成 →「Pages」→「Git に接続」を選び、このリポジトリを選ぶ。
3. ビルドの設定：

   | 項目 | 値 |
   |---|---|
   | プロジェクト名 | `chain-breaker` |
   | 本番ブランチ | `main`（`develop` などほかのブランチはプレビューとして公開される） |
   | フレームワーク | なし（または Vite） |
   | ビルドコマンド | `npm run build` |
   | 出力ディレクトリ | `dist` |
   | 環境変数 | 不要 |

   Node.js のバージョンは、リポジトリの `.node-version`（22）が使われます。
4. 保存すると最初のビルドが走り、`chain-breaker.pages.dev` で公開される。表示を確認する。

## 方法B：手元からアップロードする（Wrangler）

GitHub を使わずに、手元でビルドした `dist/` を直接アップロードします。

```sh
npm run build
npx wrangler login                                            # ブラウザで Cloudflare にログイン（初回のみ）
npx wrangler pages deploy dist --project-name chain-breaker   # 初回はプロジェクトが作成される
```

`npx wrangler` は、実行時に Cloudflare の公式 CLI を一時的にダウンロードします。

## 独自ドメインの設定

`tariki-code.tokyo` の DNS は **Netlify** で管理しているため、Netlify に CNAME レコードを追加する。CNAME の向け先は Cloudflare 側でプロジェクトを作ると決まるので、次の順で進める。

1. Cloudflare Pages でプロジェクトを作って一度公開し、`chain-breaker.pages.dev` で表示を確認する。
2. Pages のプロジェクトの「カスタムドメイン」で `chain-breaker.tariki-code.tokyo` を追加する。CNAME の向け先が表示される。
3. Netlify の「Domains」→ `tariki-code.tokyo` → DNS の設定 →「Add new record」で、次のレコードを追加する。

   | 項目 | 値 |
   |---|---|
   | Record type | `CNAME` |
   | Name | `chain-breaker` |
   | Value | `chain-breaker.pages.dev`（手順2で表示された値） |
   | TTL | 既定のまま |

   追加する前に、`chain-breaker` という名前の既存レコードがないこと、Netlify のサイトのドメイン設定（Domain aliases など）に `chain-breaker.tariki-code.tokyo` が登録されていないことを確認する。登録されていると Netlify 側が応答してしまう。
4. Cloudflare 側でドメインの確認と証明書の発行が終わるのを待ち（通常は数分〜1時間程度）、`https://chain-breaker.tariki-code.tokyo/` で表示を確認する。

## 公開後の確認

- シミュレーションが動き、音が鳴る。スマートフォンでも確認する。
- ↓ボタンで動画を保存できる。
- ブラウザの開発者ツールで、コンテンツセキュリティポリシー（CSP）の違反が出ていない。
- SNS で OGP 画像が大きく表示される（画像の URL は `https://chain-breaker.tariki-code.tokyo/og-image.jpg`）。X などはリンクの情報をしばらく保存するため、修正直後は古い表示のことがある。`https://chain-breaker.tariki-code.tokyo/?v=2` のように末尾を変えた URL で確かめる。
- `https://chain-breaker.tariki-code.tokyo/robots.txt` と `/sitemap.xml` が開ける。

## 関連ファイル

| ファイル | 内容 |
|---|---|
| `public/_headers` | Cloudflare Pages のレスポンスヘッダー（CSP、`/assets/*` の長期キャッシュなど） |
| `public/robots.txt`、`public/sitemap.xml` | 検索エンジン向け |
| `public/og-image.jpg` | OGP 画像（1200 × 630） |
| `.node-version` | ビルドに使う Node.js のバージョン |
| `scripts/check-build.mjs` | ビルド後に og:url・og:image・twitter:image が絶対 URL かを確かめる |

別のドメインで公開する場合は、`index.html` の OGP の URL と、`public/robots.txt`・`public/sitemap.xml` のドメインを書き換える。
