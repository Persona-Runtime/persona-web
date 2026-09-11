#!/usr/bin/env bash
set -uo pipefail

# 운영 이미지의 파일 목록에 빌드 입력이나 머신별 설정이 남아 있는지 검사한다.
# `docker export | tar -tf`가 만든 listing을 입력으로 받는다. tar는 디렉터리를 `/`로 끝내고
# 경로 앞에 `/`를 붙이지 않으므로 `app/src/`, `app/src/main.py` 같은 형태로 들어온다.
#
# 사용법:
#   check-image-listing.sh <listing-file>   listing 검사
#   check-image-listing.sh --self-test      검사 규칙의 회귀 테스트
#
# 종료 코드:
#   0  금지 경로를 찾음 → 호출자는 검증 실패로 처리한다
#   1  깨끗함
#   2  검사 자체가 실패 (입력 없음, grep 오류 등)
#
# grep의 1(매치 없음)과 2 이상(검사 오류)을 구분하는 것이 이 스크립트의 핵심이다.
# 둘을 뭉뚱그리면 검사가 깨진 상태가 "깨끗함"으로 통과한다.

# node_modules와 src는 **경로 성분**으로 금지한다. 경로 끝만 보면 `app/src/main.py`처럼
# 하위 파일까지 딸려 들어온 경우를 놓친다.
FORBIDDEN_DIR_COMPONENT='(^|/)(node_modules|src)(/|$)'

# 아래는 파일 이름으로 금지한다. 빌드 입력과 로컬 설정이 런타임 이미지에 남으면 안 된다.
FORBIDDEN_FILE_NAME='(^|/)(\.env[^/]*|package\.json|package-lock\.json)$'

# 검사에 쓰는 도구가 없으면 조용히 통과하지 않고 멈춘다.
for tool in grep mktemp; do
  if ! command -v "$tool" > /dev/null 2>&1; then
    echo "필요한 도구가 없습니다: ${tool}" >&2
    exit 2
  fi
done

# listing 한 건을 검사한다. 일치한 줄은 호출자가 볼 수 있게 그대로 출력한다.
scan_listing() {
  local listing="$1"

  if [[ ! -r "$listing" ]]; then
    echo "listing 파일을 읽을 수 없습니다: ${listing}" >&2
    return 2
  fi

  local found=1
  local pattern rc
  for pattern in "$FORBIDDEN_DIR_COMPONENT" "$FORBIDDEN_FILE_NAME"; do
    grep -nE "$pattern" "$listing"
    rc=$?
    case "$rc" in
      0) found=0 ;;
      1) ;;
      *)
        echo "금지 경로 검사가 실패했습니다 (grep exit ${rc}): ${listing}" >&2
        return 2
        ;;
    esac
  done
  return "$found"
}

self_test() {
  local workdir
  workdir="$(mktemp -d)" || return 2
  trap 'rm -rf "$workdir"' RETURN

  # 반드시 잡아야 하는 경로. 앞 네 건은 리뷰에서 "검사를 통과해 버린다"고 지적받은 사례다.
  local -a must_catch=(
    'app/src/'
    'app/src/main.py'
    'app/node_modules/'
    'app/node_modules/example/index.js'
    'app/.env'
    'app/.env.local'
    'app/package.json'
    'app/package-lock.json'
    'src'
    'node_modules'
    'src/'
    'usr/src/app/package.json'
  )

  # 정상 런타임 이미지에 있어야 하는 경로. 하나라도 잡히면 오탐이다.
  local -a must_pass=(
    'usr/share/nginx/html/index.html'
    'usr/share/nginx/html/assets/index-TcN3sgL5.css'
    'usr/share/nginx/html/assets/index-DsM9aIPU.js'
    'etc/nginx/conf.d/default.conf'
    'etc/nginx/nginx.conf'
    'docker-entrypoint.d/20-envsubst-on-templates.sh'
    'usr/lib/nginx/modules/'
    'var/cache/nginx/'
    'etc/ssl/private/'
    'usr/share/nginx/html/assets/sources.js'
    'usr/share/nginx/html/srcset-demo.html'
  )

  local failures=0 path rc

  for path in "${must_catch[@]}"; do
    printf '%s\n' "$path" > "$workdir/one.txt"
    scan_listing "$workdir/one.txt" > /dev/null 2>&1
    rc=$?
    if [[ "$rc" -eq 0 ]]; then
      printf '  ok    잡음: %s\n' "$path"
    else
      printf '  FAIL  놓침(rc=%s): %s\n' "$rc" "$path" >&2
      failures=$((failures + 1))
    fi
  done

  for path in "${must_pass[@]}"; do
    printf '%s\n' "$path" > "$workdir/one.txt"
    scan_listing "$workdir/one.txt" > /dev/null 2>&1
    rc=$?
    if [[ "$rc" -eq 1 ]]; then
      printf '  ok    통과: %s\n' "$path"
    else
      printf '  FAIL  오탐(rc=%s): %s\n' "$rc" "$path" >&2
      failures=$((failures + 1))
    fi
  done

  # 읽을 수 없는 입력은 "깨끗함"이 아니라 검사 오류여야 한다. fail-open 회귀 방지.
  scan_listing "$workdir/없는-파일.txt" > /dev/null 2>&1
  rc=$?
  if [[ "$rc" -eq 2 ]]; then
    printf '  ok    읽을 수 없는 listing을 검사 오류로 처리\n'
  else
    printf '  FAIL  읽을 수 없는 listing이 rc=%s로 끝남\n' "$rc" >&2
    failures=$((failures + 1))
  fi

  # 여러 줄이 섞인 실제 형태에서도 금지 경로 하나를 찾아내는지 본다.
  printf '%s\n' "${must_pass[@]}" > "$workdir/mixed.txt"
  printf 'app/node_modules/example/index.js\n' >> "$workdir/mixed.txt"
  scan_listing "$workdir/mixed.txt" > /dev/null 2>&1
  rc=$?
  if [[ "$rc" -eq 0 ]]; then
    printf '  ok    정상 경로에 섞인 금지 경로 1건 탐지\n'
  else
    printf '  FAIL  섞인 목록에서 금지 경로를 놓침(rc=%s)\n' "$rc" >&2
    failures=$((failures + 1))
  fi

  if [[ "$failures" -eq 0 ]]; then
    echo "금지 경로 검사 회귀 테스트 통과"
    return 0
  fi
  echo "금지 경로 검사 회귀 테스트 실패 ${failures}건" >&2
  return 1
}

if [[ "$#" -ne 1 ]]; then
  echo "사용법: $(basename "$0") <listing-file> | --self-test" >&2
  exit 2
fi

if [[ "$1" == "--self-test" ]]; then
  self_test
  exit $?
fi

scan_listing "$1"
exit $?
