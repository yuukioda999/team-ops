# 初期設定から公開まで(最初の1回)

上から順に進めます。各手順の最後にある「確かめる」が通ってから次に進んでください。

## 0. 公開の前にやっておくこと(GitHub)

1. team-ops-api・team-ops-web・notify-relay の main に、イメージを GHCR に置く変更が入っていることを確かめる。各リポジトリの Actions で、main の CI の `image` が成功していれば置かれています
2. GitHub のプロフィール → Packages に `team-ops-api`・`team-ops-web`・`notify-relay` の3つが出ていることを確かめる
3. 3つとも、Package settings → Danger Zone → Change visibility で **Public** にする。リポジトリが公開なので、イメージも公開でかまいません。こうするとサーバーで GitHub にログインせずに取ってこられます

確かめる:手元の PC で `docker pull ghcr.io/yuukioda999/team-ops-api:latest` がログインなしで成功する

## 1. VPS の契約

1. さくらのVPS で **2GB** のプランを契約する(まず月払い)。リージョンは石狩・東京・大阪のどれでもかまいません
2. OS のインストールで **Ubuntu 24.04** を選ぶ
3. 「SSH キー」を登録する。手元の PC で鍵がなければ作る:

   ```sh
   ssh-keygen -t ed25519 -C "team-ops-demo" -f ~/.ssh/team-ops-demo
   cat ~/.ssh/team-ops-demo.pub   # これをコントロールパネルに貼る
   ```

4. 「パケットフィルター」を有効にし、**SSH(22)・Web(80・443)** だけを許可する
5. コントロールパネルで、サーバーの IPv4 と IPv6 のアドレスを控える

確かめる:`ssh -i ~/.ssh/team-ops-demo ubuntu@<IPv4>` でログインできる

## 2. サーバーの基本設定

以下はサーバーにログインして実行します。

```sh
# パッケージを最新にし、セキュリティ更新を自動で入れる
sudo apt update && sudo apt -y upgrade
sudo apt -y install unattended-upgrades git
sudo dpkg-reconfigure -plow unattended-upgrades   # 「はい」を選ぶ

# 時刻を日本時間に(ログの読みやすさのため。アプリは UTC で動く)。cron は再起動するまで古い時刻帯のまま
sudo timedatectl set-timezone Asia/Tokyo
sudo systemctl restart cron

# メモリが足りなくなったときに MySQL が強制終了されないよう、2GB のスワップを作る
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swappiness.conf && sudo sysctl --system
```

SSH はパスワードでのログインと root でのログインを止めます。**別のターミナルでログインしたまま**行い、設定後に新しく接続できることを確かめてから閉じてください。

```sh
# sshd は同じ項目なら先に読んだ値を使う。cloud-init の 50-cloud-init.conf より先に読まれるよう 00- にする
sudo tee /etc/ssh/sshd_config.d/00-team-ops.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
EOF
sudo sshd -t && sudo systemctl reload ssh
```

サーバーの中のファイアウォール(パケットフィルターとの二重の守り):

```sh
sudo ufw default deny incoming
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp   # HTTP/3
sudo ufw enable
```

確かめる:

- 新しいターミナルで `ssh -i ~/.ssh/team-ops-demo ubuntu@<IPv4>` が通る
- `sudo sshd -T | grep -Ei '^(passwordauthentication|kbdinteractiveauthentication|permitrootlogin) '` の3つがすべて `no`
- `ssh -o PubkeyAuthentication=no ubuntu@<IPv4>` が `Permission denied` になる
- `sudo ufw status` に 22・80・443 だけが出る
- `free -h` の Swap が 2.0Gi

## 3. Docker を入れる

Docker の公式の手順(apt のリポジトリ)で入れます。

```sh
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt update
sudo apt -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker ubuntu   # 一度ログアウトして入り直すと sudo なしで使える

# 自動更新の対象に Docker も入れ、カーネルの更新のために必要なら深夜に自動で再起動する
sudo tee /etc/apt/apt.conf.d/52unattended-upgrades-local <<'EOF'
Unattended-Upgrade::Origins-Pattern { "origin=Docker"; };
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:45";
EOF
```

コンテナは `restart: unless-stopped` なので、再起動のあとは自動で起動します。

確かめる:`sudo unattended-upgrade --dry-run --debug 2>&1 | grep -i 'origin=Docker'` に Docker が出る


注意:Docker が公開したポートは ufw を通りません。そのため `compose.prod.yaml` では、外に出すのを Caddy(ホストのネットワーク)だけにし、web は `127.0.0.1` にだけ公開しています。ほかのポートを `ports:` に足さないでください。

確かめる:入り直してから `docker run --rm hello-world` が動く

## 4. DNS

freie.jp の DNS を管理しているサービスで、次の2つを足します。

| 名前 | 種類 | 値 |
|---|---|---|
| demo | A | サーバーの IPv4 |
| demo | AAAA | サーバーの IPv6 |

確かめる:手元の PC で `dig +short demo.freie.jp A` と `dig +short demo.freie.jp AAAA` がサーバーのアドレスを返す(反映に数分〜1時間かかることがあります)

## 5. 設定ファイルを作る

```sh
sudo mkdir -p /opt/team-ops && sudo chown ubuntu:ubuntu /opt/team-ops
git clone https://github.com/yuukioda999/team-ops.git /opt/team-ops
cd /opt/team-ops/deploy
./init-env.sh demo.freie.jp
```

`init-env.sh` が、新しい乱数の鍵とパスワードを入れた `.env`・`.env.api`・`.env.relay` を作ります(権限は 600)。

続けて `.env` を開き、`ACME_EMAIL`(証明書の期限切れなどの連絡を受けるアドレス。初期値は info@freie.jp)を確かめます。監視(Grafana Cloud)は公開のあとに [monitoring.md](monitoring.md) で足します。それまでは `COMPOSE_PROFILES=` が空のままで、監視なしで動きます。

`.env` 系の3ファイルは、パスワードマネージャーなどサーバーの外にも控えておきます。`APP_KEY` と `BLIND_INDEX_KEY` をなくすと、バックアップから戻しても暗号化した項目を読めません。

確かめる:`ls -l .env .env.api .env.relay` の権限が3つとも `-rw-------`

## 6. 公開する

```sh
cd /opt/team-ops/deploy
./deploy.sh api=<API のハッシュ> web=<Web のハッシュ> relay=<relay のハッシュ>
```

ハッシュは各リポジトリの main の最新のコミット(40文字)で、そのコミットの CI が成功している必要があります。初回から必ずハッシュを指定します(`latest` は受け付けません。前の版に戻せなくなるため)。

`deploy.sh` は次を順に行い、最後に `https://demo.freie.jp/api/health` が答えるのを確かめます。

1. イメージを取ってくる
2. MySQL と Mailpit を起動する
3. マイグレーションを流す
4. ほかをすべて起動する

Caddy は最初の起動で Let's Encrypt の証明書を取ります。DNS が反映されていないと取れません。

確かめる:

- スマホのブラウザで `https://demo.freie.jp` を開き、「デモとしてログイン」ができる
- お知らせを送り、「送信されたメール」に届く
- `curl -I http://demo.freie.jp` が `308` で https に移る
- `docker compose -f compose.prod.yaml ps` で、すべて `running`(api は `healthy`)

## 7. 続けて設定する

- 毎日のバックアップ:[backup.md](backup.md)
- 監視とアラート:[monitoring.md](monitoring.md)
