# 新しい版を出す・前の版に戻す

## 新しい版を出す

1. 出したい変更が各リポジトリの main に入り、main の CI(`image`)が成功していることを確かめる。成功すると、イメージがコミットのハッシュのタグで GHCR に置かれます
2. 出すコミットのハッシュ(40文字)を控える。GitHub のコミットの画面か、`git rev-parse origin/main` で分かります
3. サーバーで実行する:

   ```sh
   cd /opt/team-ops && git pull   # deploy/ の設定が変わっていれば取り込む
   cd deploy
   ./deploy.sh api=<ハッシュ>                # API だけ
   ./deploy.sh web=<ハッシュ> relay=<ハッシュ>   # 複数でも
   ```

   指定しなかったものは `.env` のタグのままです。

4. 最後に `Deployed: ...` と出れば完了です。出した内容は `deploys.log` に1行ずつ残ります

確かめる:

- `https://demo.freie.jp` で「デモとしてログイン」から、お知らせを送るところまで試す
- `docker compose -f compose.prod.yaml logs --since 10m api api-worker` にエラーがない

### 出し方の注意

- マイグレーションは、新しい版を起動する前に流れます。マイグレーションは列や表を足すだけにする決まり(CLAUDE.md)なので、古い版が動いている間に流れても困りません
- API と画面の両方が変わる変更は、API を先に出す
- デモのデータは消えてもかまいません。データを作り直したいときは `docker compose -f compose.prod.yaml exec api php artisan demo:prune --all` ですべてのデモチームを消せます

## 前の版に戻す

```sh
cd /opt/team-ops/deploy
./deploy.sh --rollback
```

`deploys.log` の1つ前の行のタグに戻します。もっと前に戻すときは、`deploys.log` を見てハッシュを指定します(`./deploy.sh api=<ハッシュ>`)。

マイグレーションは戻しません。列や表を足すだけなので、古い版はそのまま動きます。

## deploy.sh が失敗したとき

| 出たメッセージ | 見るところ |
|---|---|
| `Not a commit hash` | ハッシュは40文字の全体を指定する |
| イメージが取れない(`pull` で失敗) | そのハッシュの CI が成功しているか。GHCR のイメージが Public か |
| マイグレーションで失敗 | `docker compose -f compose.prod.yaml logs mysql`。新しい版は起動していないので、デモは前の版のまま動いています |
| `The demo does not answer` | [troubleshooting.md](troubleshooting.md)。急ぐなら `./deploy.sh --rollback` |
