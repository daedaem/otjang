# 어울 운영 묶음 — 집 PC에서 시작해 클라우드로 옮기기

어울 서버를 Docker로 띄우는 운영 묶음입니다. 지금은 집 PC에서 Cloudflare Tunnel로 공개하고, 나중에 클라우드 VM으로 옮길 때도 **같은 파일을 그대로** 씁니다.

```
휴대폰 ──https──▶ Cloudflare ◀──(PC가 먼저 연결, 공유기 포트 열지 않음)── tunnel ─▶ eoul ─▶ SQLite (Docker 볼륨)
                                                                                        │
                                                                    backup(Litestream) ─┴─▶ 백업 폴더 또는 S3 호환 저장소
```

| 컨테이너 | 하는 일 |
|---|---|
| `eoul` | 앱과 API를 보내는 어울 서버. 데이터는 Docker 볼륨 `eoul-data`의 `eoul.db` 하나 |
| `tunnel` | Cloudflare Tunnel(cloudflared). 집 공유기 포트를 열지 않고 https 주소를 붙임 |
| `backup` | Litestream. 데이터베이스 변경분을 몇 초 안에 백업 위치로 복제 |
| `backup-dir` | 시작할 때 한 번 백업 폴더 권한을 맞추고 끝남 |

## 먼저 혼자 써 보기 (도메인·Docker 없이)

저장소를 받은 폴더에서 명령 한 줄로 서버를 켜고 휴대폰용 https 주소까지 만듭니다. 필요한 Node.js와 cloudflared가 없으면 설치할지 물어봅니다.

| PC | 명령 |
|---|---|
| macOS·Linux | `bash deploy/try-local.sh` |
| Windows | `powershell -ExecutionPolicy Bypass -File deploy\try-local.ps1` |

- 화면에 나온 `https://…trycloudflare.com` 주소를 휴대폰에서 열고, 함께 나온 초대 코드로 가입합니다.
- 이 PC에서만 보려면 끝에 `--local`(Windows는 `-Local`)을 붙입니다. 사진이 PC 밖으로 나가지 않습니다.
- 시험 데이터는 `server/data-try/`에 따로 저장되고 저장소에 올라가지 않습니다. 끝내려면 Ctrl+C.
- 휴대폰 주소는 Cloudflare 임시 터널이라 켤 때마다 바뀌고, 주소를 아는 사람은 열 수 있습니다. 시험이 끝나면 꺼 주세요.
- 이 PC에서 Claude 데스크톱 앱(또는 `claude remote-control`)을 켜고 "deploy/try-local로 어울 켜 줘"라고 하면, 설치와 실행을 Claude가 대신 진행합니다.

## 준비물과 비용

| 준비물 | 비용 | 메모 |
|---|---|---|
| Docker Desktop (Windows·macOS) 또는 Docker Engine (Linux) | 0원 | Docker Desktop은 직원 250명 미만이고 연매출 1천만 달러 미만인 사업자는 무료로 알고 있어요(**확인 필요**, Docker 구독 약관) |
| Cloudflare 계정(무료 플랜)과 Tunnel | 0원 | |
| 도메인(예: `eoul.kr`) | 연 몇만 원 수준(**확인 필요**, 등록 업체·도메인마다 다름) | Cloudflare에 네임서버를 연결해야 이름 있는 터널을 쓸 수 있어요 |
| 백업용 두 번째 디스크(권장) | 이미 있으면 0원 | 같은 디스크에 백업하면 디스크 고장에 못 버팁니다 |

이 저장소에 비밀 값은 없습니다. 터널 토큰, 메일 비밀번호, 초대 코드는 모두 `deploy/.env`에만 적고, `.env`는 `.gitignore`에 들어 있어 저장소에 올라가지 않습니다.

## 1. Cloudflare에서 터널 만들기 (한 번)

Cloudflare 화면의 메뉴 이름은 자주 바뀝니다. 아래는 2026-10-15 기준 이름이며, 다르면 "Tunnels"를 찾으세요.

1. 도메인을 Cloudflare에 추가하고, 도메인 등록 업체에서 네임서버를 Cloudflare가 알려 준 값으로 바꿉니다.
2. Cloudflare 대시보드 → **Zero Trust** → **Networks** → **Tunnels** → **Create a tunnel** → **Cloudflared**를 고르고 이름을 `eoul`로 정합니다.
3. 설치 안내 화면에 나오는 명령(`... --token eyJ...`)에서 `eyJ`로 시작하는 긴 문자열만 복사합니다. 이것이 **터널 토큰**입니다. 비밀번호처럼 다루세요.
4. **Public hostname**을 추가합니다.
   - Subdomain: `app` (원하는 이름), Domain: 내 도메인
   - Service: Type `HTTP`, URL `eoul:8787`
   - `eoul`은 이 compose 안의 서버 이름이라 그대로 적습니다. `localhost`가 아닙니다.

## 2. 설정 파일 채우기

```bash
cd deploy
cp .env.example .env      # Windows PowerShell: Copy-Item .env.example .env
```

`.env`에서 꼭 채울 것:

| 이름 | 예 | 뜻 |
|---|---|---|
| `TUNNEL_TOKEN` | `eyJ...` | 1단계에서 복사한 토큰 |
| `EOUL_PUBLIC_URL` | `https://app.eoul.kr` | 사용자가 여는 주소. 메일 링크가 이 주소로 열려요 |
| `EOUL_INVITE_CODE` | 아무 문구 | 시험 기간에는 이 코드를 아는 사람만 가입해요 |
| `EOUL_BACKUP_DIR` | `D:/eoul-backups` | 백업 폴더. 가능하면 다른 디스크 |

메일, 회원 코디, 가격 출처 같은 나머지 값은 `.env.example`의 설명과 [서버 안내](../server/README.md)를 따르세요.

## 3. 켜기

```bash
cd deploy
docker compose up -d --build
docker compose ps          # eoul이 "healthy", tunnel과 backup이 "Up"이면 정상
```

- 이 PC에서 확인: 브라우저로 `http://localhost:8787`
- 휴대폰에서 확인: `EOUL_PUBLIC_URL` 주소
- 로그 보기: `docker compose logs -f eoul` (글 내용·이메일은 로그에 남기지 않습니다)
- 파일럿 지표: `docker compose exec eoul node server/cli.mjs metrics --exclude 내이메일@example.com` (합계만, [서버 안내](../server/README.md#파일럿-지표))

터널 없이 이 PC에서만 시험하려면 `docker compose up -d --build eoul backup`처럼 서버와 백업만 켭니다.

## 약관과 처리방침 확정하기

서버는 `https://내주소/privacy`와 `https://내주소/terms`를 누구나 열 수 있는 페이지로 보여 줍니다. 앱의 가입 화면과 "내 설정 → 약관과 운영자"가 이 페이지로 이어집니다. 앱 스토어에 낼 때도 이 주소를 씁니다.

1. `.env`의 운영자 정보(`EOUL_OPERATOR_*`, `EOUL_BUSINESS_NUMBER`, `EOUL_POLICY_DATE`)를 채웁니다. 페이지의 같은 칸에 자동으로 들어갑니다.
2. 저장소의 초안을 복사해 내 판으로 고칩니다.
   ```bash
   mkdir -p deploy/policy
   cp server/policy-templates/privacy.md server/policy-templates/terms.md deploy/policy/
   ```
3. 노란 칸(`[[채울 칸: …]]`)을 모두 채우고, 내 서비스에 맞지 않는 줄은 고치거나 지웁니다. **전문가 검토를 받은 뒤 확정하세요.**
4. `docker compose up -d`로 다시 켭니다. 노란 칸이 하나도 남지 않으면 "초안" 표시가 사라집니다.

- `deploy/policy/`는 `.gitignore`에 들어 있어 저장소에 올라가지 않습니다.
- 저장소의 초안이 바뀌어도 내 판은 그대로입니다. 바뀐 점은 직접 옮기세요.

## 4. 집 PC로 운영할 때 꼭 챙길 것

집 PC 운영의 가장 큰 약점은 **PC가 꺼지거나 잠들면 서비스도 멈춘다**는 점입니다. 사용자가 늘기 전까지는 아래로 버티고, 늘면 6단계대로 클라우드로 옮기세요.

- **절전 끄기**: Windows 설정 → 전원 → "절전 모드로 전환" 안 함.
- **Docker 자동 시작**: Docker Desktop 설정 → General → "Start Docker Desktop when you sign in" 켜기. 컨테이너는 `restart: unless-stopped`라 Docker가 켜지면 같이 켜집니다.
- **재부팅 뒤 로그인**: Docker Desktop은 Windows에 로그인해야 시작됩니다. 업데이트로 재부팅된 뒤 로그인하지 않으면 서비스가 멈춰 있습니다(**실제 PC에서 확인 필요**). Windows 업데이트 "사용 시간"을 설정해 새벽 재부팅을 피하세요.
- **멈춰도 사용자 기록은 잃지 않습니다**: 앱은 기기에 먼저 저장하고, 서버가 돌아오면 그때 올립니다.
- **백업 디스크 암호화**: 백업에는 계정 이메일, 비밀번호 해시, 옷장 사진이 들어 있습니다. BitLocker 같은 디스크 암호화를 켜 두세요.

## 5. 업데이트

```bash
git pull
cd deploy
docker compose up -d --build
```

- 앱과 서버는 한 이미지로 함께 업데이트됩니다. 둘의 버전이 어긋나지 않습니다.
- 데이터는 볼륨에 있어 이미지를 다시 만들어도 그대로입니다.
- 이미지 버전(Node, cloudflared, Litestream)은 `Dockerfile`과 `docker-compose.yml`에 고정해 두었습니다. 올릴 때는 버전을 직접 바꾸고 아래 복구 훈련을 한 번 해 보세요.

## 6. 백업과 복구

### 자동으로 되는 것

- `backup` 컨테이너가 데이터베이스의 변경분을 1초마다 `EOUL_BACKUP_DIR`에 복제합니다.
- 하루에 한 번 전체 사본을 만들고, **7일 전 시점까지** 되돌릴 수 있습니다(`litestream.yml`의 `retention`).
- 탈퇴한 회원의 자료도 백업에는 최대 7일 남습니다. [처리방침 초안](../docs/privacy-policy-draft-20261015.md)의 백업 보관 기간과 맞춰 적으세요.

### 집 밖 백업 (권장, 클라우드로 옮긴 뒤에는 필수)

집에 불이 나거나 도난당하면 같은 집의 두 번째 디스크도 함께 잃습니다. S3 호환 저장소로 복제하려면:

1. 운영자 본인만 쓰는 **비공개 버킷**을 만듭니다(예: Cloudflare R2, Backblaze B2).
2. 그 버킷에만 쓸 수 있는 접근 키를 만듭니다.
3. `.env`에서 `EOUL_BACKUP_CONFIG=litestream-s3.yml`로 바꾸고 `EOUL_S3_*`를 채운 뒤 `docker compose up -d`.

- 무료 한도(저장 용량, 쓰기 요청 수)는 업체마다 다르고 자주 바뀝니다(**확인 필요**). 요청 수를 아끼려고 S3 복제는 10초마다 보냅니다.
- 이 백업은 Litestream이 따로 암호화하지 않습니다. 저장소 쪽 암호화와 접근 키 관리에 기댑니다.

### 손으로 사본 만들기

```bash
docker compose exec eoul node server/cli.mjs backup /data/manual.db
docker compose cp eoul:/data/manual.db ./manual-2026-10-15.db
docker compose exec eoul rm /data/manual.db
```

### 복구 (디스크를 잃었을 때)

```bash
cd deploy
docker compose down
docker volume rm eoul_eoul-data                 # 망가진 데이터가 남아 있을 때만
docker compose up --no-start eoul               # 빈 데이터 볼륨을 올바른 권한으로 만듦
docker compose run --rm --no-deps backup restore -config /etc/litestream.yml /data/eoul.db
docker compose up -d
```

- 특정 시각으로 되돌리려면 `restore` 뒤에 `-timestamp 2026-10-15T09:00:00Z`를 붙입니다.
- 복구하면 서버가 그 시점으로 돌아갑니다. 그 뒤에 바뀐 기기에서는 앱이 "어느 옷장을 쓸까요?"라고 묻습니다.
- **한 달에 한 번 복구 훈련을 권합니다.** 백업은 복구해 보기 전까지 믿을 수 없습니다.

## 7. 클라우드로 옮기기

터널은 "서버가 Cloudflare에 먼저 연결하는" 방식이라, **같은 토큰으로 VM에서 켜면 주소(DNS)를 바꾸지 않고 그대로 옮겨집니다.** VM에도 들어오는 포트를 열 필요가 없습니다.

1. **VM 준비**: Ubuntu 같은 Linux VM에 Docker Engine과 Compose 플러그인을 설치합니다. 메모리 1GB 이상을 권합니다(로그인 한 번에 비밀번호 해시가 약 128MB를 씁니다).
2. **코드와 설정 옮기기**: VM에서 `git clone`하고, 집 PC의 `deploy/.env`를 안전한 방법(예: `scp`)으로 복사합니다. 메신저·메일로 보내지 마세요.
3. **집 PC 끄기**: 방문자를 막고 마지막 변경분까지 백업합니다.
   ```bash
   docker compose stop tunnel eoul    # 방문자 차단, 쓰기 멈춤
   # backup 로그에 새 오류가 없는지 확인하고 10초쯤 기다린 뒤
   docker compose down
   ```
4. **데이터 옮기기**: 집 PC의 백업 폴더(`EOUL_BACKUP_DIR`)를 통째로 VM의 `deploy/backups`로 복사합니다. S3 백업을 쓰고 있었다면 복사할 필요가 없습니다.
5. **VM에서 복구하고 켜기**: 6단계 "복구"의 `up --no-start`부터 마지막 줄까지 그대로 실행합니다.
6. **확인**: 휴대폰에서 같은 주소로 로그인되고 옷장 사진이 보이면 끝입니다. VM에서는 백업을 S3 호환 저장소(VM과 다른 업체·지역)로 바꾸세요.

> **두 곳을 동시에 켜지 마세요.** 같은 토큰으로 집 PC와 VM이 모두 켜져 있으면 Cloudflare가 방문자를 둘로 나눠 보내고, 데이터베이스가 둘로 갈라집니다. 옮기는 동안 집 PC는 `docker compose down` 상태여야 합니다.

## 문제 해결

| 증상 | 원인과 해결 |
|---|---|
| `tunnel`이 계속 다시 시작하고 로그에 `requires the ID or name of the tunnel` | `.env`의 `TUNNEL_TOKEN`이 비어 있어요. 1단계의 토큰을 넣고 `docker compose up -d` |
| 휴대폰에서 502·연결 오류 | Cloudflare의 Public hostname URL이 `eoul:8787`인지, `docker compose ps`에서 `eoul`이 healthy인지 확인 |
| `backup` 로그에 `permission denied` | 백업 폴더 권한 문제예요. `docker compose up -d`를 다시 하면 `backup-dir`가 권한을 맞춰요. 계속되면 폴더를 지우고 다시 만드세요 |
| 로그인 시도가 모두 "시도가 너무 많아요" | 서버가 방문자 주소 대신 터널 주소로 세고 있어요. `.env`의 `EOUL_TUNNEL_ADDRESS`를 바꿨다면 `EOUL_EDGE_SUBNET` 안의 주소인지, `EOUL_EDGE_AUTO_RANGE` 밖인지 확인 |
| `Pool overlaps with other one on this address space` | 내부 네트워크 주소가 다른 네트워크와 겹쳐요. `.env`의 `EOUL_EDGE_*`와 `EOUL_TUNNEL_ADDRESS`를 함께 바꾸세요(예: `172.30.88.0/24`, `172.30.88.128/25`, `172.30.88.10`) |
| 포트 8787이 이미 쓰이는 중 | `.env`의 `EOUL_LOCAL_PORT`를 다른 번호로 |

## 설계 메모

- **데이터는 Docker 볼륨에**: Windows·macOS 폴더를 직접 연결하면 SQLite의 WAL 잠금이 믿을 만하지 않습니다. 그래서 데이터베이스는 Docker가 관리하는 볼륨에 두고, 사람이 꺼내 보는 백업만 폴더에 둡니다.
- **방문자 주소는 터널 컨테이너에게서만 믿음**: 서버는 시도 횟수 제한을 방문자 주소로 셉니다. Cloudflare가 붙이는 `CF-Connecting-IP`는 고정 주소(`EOUL_TUNNEL_ADDRESS`)의 터널 컨테이너가 보낸 요청에서만 믿고, 같은 네트워크의 다른 컨테이너나 `localhost:8787`로 들어온 요청에서는 무시합니다.
- **이 PC에서만 열리는 포트**: `localhost:8787`은 `127.0.0.1`에만 열려 같은 공유기의 다른 기기에서도 들어올 수 없습니다.
- **서버 배경 지우기(선택)**: `.env`에서 `EOUL_WITH_PHOTO_MASK=true`로 바꾸고 `docker compose up -d --build` 한 뒤 `docker compose exec eoul node server/cli.mjs fetch-model`로 모델을 받습니다. 모델은 `eoul-models` 볼륨에 남습니다.
- 검증 기록: [운영 묶음 검증](../docs/deploy-kit-20261015.md)
