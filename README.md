# CHAIN BREAKER

An automatic brick-breaking simulation built with TypeScript, Vite, and Canvas 2D. Watch a field of 6,400 tiny blocks in two colours give way to a growing chain of bouncing balls.

## Run locally

    npm install
    npm run dev

Open the local address printed by Vite. To create a production build:

    npm run build
    npm run preview

### Deploy

Published at https://chain-breaker.tariki-code.tokyo/ on Cloudflare Pages (build command `npm run build`, output `dist`). See [docs/deploy.md](docs/deploy.md) for the full steps, including the custom domain (DNS is on Netlify). `npm run build` also checks that the Open Graph / Twitter card URLs in `index.html` are absolute.

Google Analytics 4 is set in `src/analytics.ts` (`GA_MEASUREMENT_ID`; empty disables it). It loads only on `chain-breaker.tariki-code.tokyo` (not on localhost or Cloudflare preview URLs) and never in owner mode. Besides page views it sends `run_start`, `run_clear`, `video_download`, `follow_click` and `new_pattern` events (with `pattern_id`). The CSP in `public/_headers` allows only the Google endpoints GA4 needs.

## Controls

- **Start / Pause** — release the first ball or pause the simulation.
- **Reset** — return to the same initial layout and random seed.
- **New pattern / N** — generate a new layout. Each pattern has a number (#0001–#9999); the same number always produces the same field and the same run, so a favourite can be replayed or recorded again. **Classic** returns to the original layout (#0000). The current pattern is remembered in this browser.
- **Sound / M** — soft synthesised sound (no audio files): pentatonic mallet notes for breaks that walk up and down the scale, a warm pad that swells as destruction gets dense, gentle cues for the paddle, capsules and blasts, and a chime when the field is cleared. Mute with the speaker button or **M**; volume is remembered. Sound starts after the first click or key press (a browser rule) and is included in recorded videos.
- **Credit & follow prompt** — for visitors, the canvas (and so every recorded video) shows "CHAIN BREAKER · @kobatch_tk" under the field, and ↓ first opens a small dialog asking for a follow on X (optional; "Save video" always works). The owner can hide both: open the site once with `#owner=<passphrase>` to remember that browser, or `#owner=off` to forget it. Only the passphrase's SHA-256 hash is in `src/owner.ts`; it is a convenience switch, not access control.
- **Palette** — recolour the two block arrays: pick a preset, choose each colour freely, or swap them with ⇄. The choice is remembered in this browser and also applies to sparks, the legend and recorded videos.
- **↓ (Download)** — save the run as a video. Every run is recorded automatically from Start (paused with the simulation) and the recording closes 2 seconds after the field is cleared. Clicking ↓ mid-run saves the footage so far. The file is MP4 where the browser supports it, otherwise WebM. Recording captures the field canvas, with a time / balls / cleared line drawn along its bottom edge. Starting a new run replaces the previous video, so save it first.
- **Share**：今のパターンへのリンクを共有。リンク（`?p=1234`）を開いた人は、同じ配置・同じ展開を再生できます。スマホでは端末の共有画面（LINE、X、メッセージなど）が開き、PCでは「Post on X」と「Copy link」を選べます（Xへの投稿には「via @kobatch_tk」が付きます）。クリア後に押すと、タイムと最大ボール数が投稿文に入ります。アドレスバーのURLも表示中のパターンに合わせて変わります
- **0.5× / 1× / 2× / 4×** — change simulation speed.
- **Space** — start, pause, or resume.
- **R** — reset.

## Simulation

- The 80 × 80 block field is stored in a compact typed array and drawn to an offscreen canvas.
- Layout: a concrete frame seals the field. Its only opening is a zigzag entry channel that runs from the bottom centre deep into the field; the channel walls crack open at regular intervals and its far end is open, so every block is reachable.
- Generated patterns pick one of six colour splits (diagonal, wave, rings, stripes, checker, spiral), a random entrance and zigzag channel route, and up to five extra concrete walls. Every layout is checked with a ball-sized (2×2-cell) flood fill from the channel mouth and regenerated if any block would be unreachable.
- Gold **capsule blocks** release a falling capsule when broken (ordinary blocks occasionally do too). Capsules pass through everything and trigger when the paddle catches them:
  - **+3** launches three balls from the paddle toward the entrance.
  - **×3** splits every ball in play into three.
  - **BOMB** fires a beam at the densest remaining cluster and blasts a wide circle clear. Bombs get more common as the field empties, and in the final 3% bomb capsules fall from the top regularly.
- Orange **bomb blocks** explode when broken and set off nearby bomb blocks in a chain.
- Balls speed up as their number grows (up to about 2.4×), with up to 600 balls in play. Movement is split into short sub-steps so fast balls never tunnel through concrete.
- The paddle meets each ball at the offset that bounces it back toward the channel mouth, and goes for capsules when they arrive first.
- Balls multiply **only** through capsules. While fewer than four balls are in play, a +3 supply capsule falls from the top every 6 seconds, and ordinary blocks drop capsules more often. If every ball is lost, one is relaunched so the run never stalls.
- A ×3 capsule adds at most 100 balls, and ×3 gets rarer as the field fills, so the climax builds over several seconds instead of jumping straight to the cap.
- Screen shake, flashes, shockwave rings and pop-up text mark big moments. Balls are drawn from pre-rendered glow sprites so hundreds stay cheap to draw.
- The seed is reset on every run, so the same controls reproduce the same sequence.

## 日本語

TypeScript、Vite、Canvas 2Dで作った自動進行型のブロック破壊シミュレーションです。6,400個の2色の極小ブロックを、跳ね返るボールが連鎖的に破壊していきます。

### 起動方法

    npm install
    npm run dev

表示されたローカルURLをブラウザで開きます。npm run build で本番用ビルドを作成できます。

### 操作

- **Start / Pause**：シミュレーションの開始・一時停止
- **Reset**：初期状態へ戻す
- **New pattern / N**：新しいブロック配置を自動生成。パターンには番号（#0001〜#9999）が付き、同じ番号なら毎回同じ配置・同じ展開になります。**Classic**で元の配置（#0000）に戻ります
- **Sound / M**：音声ファイルを使わず合成したやわらかな効果音。ブロックの破壊はペンタトニック音階のマリンバ風の音、破壊が激しくなると温かい和音が広がります。スピーカーボタンか **M** でミュート、音量は保存されます。録画にも音が入ります
- **Palette**：2つのブロック群の色を変更。プリセットから選ぶか、それぞれ自由に色を選べます（⇄で入れ替え）。選んだ色はブラウザに保存され、火花・凡例・録画にも反映されます
- **↓（ダウンロード）**：シミュレーションを動画で保存。Startと同時に自動で録画され、クリアの2秒後に録画が終わります。途中で押すとそこまでの映像を保存します。形式はMP4（非対応のブラウザではWebM）。次の回を始めると前の動画は置き換わるので、先に保存してください。
- **0.5× / 1× / 2× / 4×**：再生速度の変更
- **Space**：開始・一時停止・再開
- **R**：リセット

フィールドはコンクリートの外壁で囲まれ、入口は下中央から奥へ伸びるジグザグの通路だけです。金色のカプセルブロックを壊すとアイテムが落ち、パドルで取ると発動します（+3：ボール3個追加、×3：全ボールが3倍、BOMB：残りが最も密集した場所を広範囲に爆破）。オレンジの爆弾ブロックは壊すと爆発し、周りの爆弾ブロックに誘爆します。ボールが増えるのはアイテムを取ったときだけです（ボールが少ない間は上から+3の補給カプセルが降ってきます）。ボールは最大600個まで増え、数が多いほど速くなります（最大で約2.4倍）。

パドルは落下位置を予測して自動で追従します。ブロックの実際の破壊数に応じてボールが分裂し、4段階で破壊が加速します。

## ライセンス

[MIT License](LICENSE) © 2026 tariki-code
