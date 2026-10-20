# くるくるドライブ！

Three.js + TypeScript + Vite のブラウザーゲーム試作です。Phase 1 の運転、メダル、ゴールと、Phase 2 の QR セッション/WebSocket 入力を実装しています。車や背景は現在 Three.js の仮モデルです。

## 開発環境

- Node.js 20.19+ または 22.12+
- npm
- 公開ホストで実機確認する場合は、有効な HTTPS/WSS 終端

## 起動

```sh
npm ci
npm run dev
```

ゲーム画面は `http://localhost:5173`、セッション/WebSocket サーバーは `3000` で起動します。iPhone コントローラーは別リポジトリの `mobile-steering-controller` (`5174`) で起動します。公開時の QR は同じホストの `/controller/` を開き、ゲームとコントローラー間は `/ws` を WSS で共有します。別ホストへ分ける場合に限り、ゲームの Vite ビルド時に `VITE_CONTROLLER_ORIGIN=https://<controller-host>` を指定します。iPhone Safari の傾きセンサーには HTTPS のセキュアコンテキストが必要です。

ローカルでキーボード操作する場合は ←/→、ブレーキは Space です。スマホ接続時は接続後 3 秒で走り始め、切断すると停止します。

## コマンド

```sh
npm test
npm run build
```

## Render で同一ホストに公開する

`render.yaml` は Node Web Service 1台でゲーム、`/controller/`、セッション API、WebSocket を配信する Blueprint です。Render の HTTPS 終端を使うため、アプリ側で証明書やトンネルを設定しません。`PORT` は Render が設定し、Node サーバーがその値を使います。ゲーム画面が生成する QR は自動的に同じ HTTPS ホストの `https://<Renderのホスト名>/controller/` を指します。接続は同じホストの `wss://<Renderのホスト名>/ws` を使います。

デプロイの前提と手順:

1. このリポジトリと `mobile-steering-controller` の変更を、それぞれ GitHub の `main` にコミットして push する。Render のビルドはゲーム側リポジトリの `scripts/render-build.sh` がコントローラーリポジトリの `main` を取得して一緒にビルドする。
2. Render で Blueprint を作成し、このリポジトリを接続する。`render.yaml` の Free Web Service を確認してデプロイする。
3. デプロイ完了後、Render が表示する実ホスト名を使ってゲームを開く。ホスト名はサービス作成後に Render が割り当てるため、事前に固定 URL を記載できない。
4. `https://<Renderのホスト名>/` でゲーム、`https://<Renderのホスト名>/controller/` でコントローラーが開くことを確認し、ゲーム画面の QR を iPhone 11 Safari で読む。

任意のビルド環境変数:

- `MOBILE_CONTROLLER_REPO`: ビルド対象コントローラーの Git URL。既定値は `https://github.com/Yuji5124/mobile-steering-controller.git`。認証情報を URL に埋め込まない。
- `MOBILE_CONTROLLER_REF`: 取得するブランチまたは ref。既定値は `main`。再現性のため、運用時は検証した commit SHA を設定する。

Render の無料 Web Service は現行プランの案内上、ワークスペースあたり月 750 インスタンス時間の共有枠で、15 分間リクエストがないと休止し、次のアクセスで起動待ち (通常およそ 1 分) が発生します。初回プレイでは起動待ちがあり、無料枠の上限到達後は停止するため、常時プレイ用の低遅延 SLA にはなりません。WebSocket は Render の Web Service でサポートされますが、デプロイや切断で接続が失われる可能性があり、コントローラーは再接続します。走行中は約 30 Hz の入力が流れるため通常の操作中は接続が継続します。地域、端末回線、無料インスタンスの状態により遅延は変動します。実機の RTT と切断時停止を確認してください。

無料枠と WebSocket の条件は変更される場合があります。サービスを作る直前に [Render Free](https://render.com/docs/free)、[Render WebSockets](https://render.com/docs/websocket)、[Blueprints](https://render.com/docs/blueprint-spec) を確認してください。この作業環境から Render 公式ドキュメントへのアクセスが拒否されたため、上記の数値は公開操作直前のライブ確認を完了していません。Render のアカウント接続、サービス作成、公開デプロイはまだ行っていません。

## 現在の範囲

- 入力プロトコル v1 は `src/network/protocol.ts`。操舵範囲、型、連番をサーバーで検証します。
- セッションは暗号学的乱数18 byteのベアラートークンで保護し、10分で失効します。WebSocketはトークンと `host` / `controller` のroleを検証し、入力はサイズ上限・型・操舵範囲・単調増加する連番を確認します。アカウント認証やセッション発行のレート制限はありません。QRを見られる人はそのセッションのコントローラーとして接続できるため、公開QRを第三者へ共有しないでください。
- ゲーム内の道路とメダルは仮配置です。BlenderMCP/GLB、効果音、実機での接続/操舵確認は未実施です。
- 同一 LAN の実機試験には、両 Vite サーバーを端末から到達可能にし、Safari が信頼する HTTPS/WSS 証明書を用意してください。

## Phase 2.5｜iPhone 11 実機確認

実機確認は以下のチェック表を記録してください。未実施の項目は PASS にしないでください。

1. Windows PC または iPad で、HTTPS のゲーム URL を開く。ゲーム画面と接続用 QR が表示されることを確認する。
2. iPhone 11 を横向きにし、Safari で QR を読み取る。HTTPS のコントローラー画面が開くことを確認する。
3. 「ハンドルをはじめる」をタップし、iOS のモーションと方向のアクセスを許可する。正面を向けた姿勢を中央として記録する。
4. ⚙ 診断パネルを開き、画面角度、β/γ、補正後傾斜、操舵目標/送信値、送信 Hz、RTT を確認する。端末を左・右へゆっくり傾け、ゲーム側の `?debug=1` 表示と車の方向が合うことを確認する。逆なら診断パネルの反転ボタンで再確認する。
5. 平滑化スライダーを小さく/大きく動かし、操舵値の追従が滑らかさと応答速度の両方で変化することを確認する。
6. ブレーキを押して減速し、離して再加速する。クラクションを押す。ゲーム画面側では事前に「サウンドを有効にする」をタップする。
7. コントローラーの Wi‑Fi を一時切断するか Safari を閉じ、ゲーム側の車が停止することを確認する。復帰後に接続表示と3秒カウントダウンを確認する。
8. Windows Chrome と iPad Safari でも QR、操舵、ブレーキ、クラクション、再接続を同様に記録する。

`http://localhost` と `172.*` の開発 URL は iPhone 11 実機テスト用の公開 URL ではありません。公開後はゲームと `/controller/` が同じホストで開き、WebSocket が `/ws` で WSS 接続できることを確認してから実機検証してください。現時点で公開ホストは作成していないため、公開 URL と実機接続結果は未確定です。

診断表示はコントローラーの ⚙ ボタン、ゲーム画面は `?debug=1` で表示します。ブラウザーの RTT はコントローラーからシグナリングサーバーまでの往復時間です。ゲーム画面の「受信後」はサーバーが入力を受けてからの経過時間です。
