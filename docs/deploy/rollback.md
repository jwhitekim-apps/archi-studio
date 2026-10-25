# 새 앱 배포 되돌리기

운영 호스트의 archi-studio 저장소 폴더에서 실행한다. 이미지 태그는 `.env`의 `IMAGE_TAG`(비우면 `latest`)가 정한다.

## 0. 배포 전에 지금 이미지를 보관한다

```sh
docker tag archi-studio:latest archi-studio:prev
```

## 1. 이전 태그 이미지로 되돌린다

```sh
IMAGE_TAG=prev docker compose up -d --no-build
docker compose ps
curl -s -w ' %{http_code}\n' http://127.0.0.1:${PORT:-8000}/api/health   # 200 {"status":"ok"}
```

## 2. 그래도 안 되면 새 컨테이너를 멈춘다

```sh
docker compose stop
```

## 3. 구 서비스(벨루, 폴리오)를 되살린다

각 구 서비스 저장소 폴더에서 실행한다. `stop`으로 멈췄을 뿐 지우지 않았으므로 `start`로 돌아온다.

```sh
docker compose start
docker compose ps
```

## 로컬 리허설 기록

- 2026-10-25: `archi-studio:latest`를 `prev`로 태그한 뒤 `IMAGE_TAG=prev docker compose up -d --no-build`로 바꿨다. 컨테이너 이미지가 `archi-studio:prev`로 바뀌었고 `/api/health`가 200 `{"status":"ok"}`였다.
