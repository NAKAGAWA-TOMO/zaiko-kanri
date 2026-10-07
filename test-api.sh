#!/usr/bin/env bash
# curl による API テスト。 使い方: node server.js を起動した状態で  bash test-api.sh
# BASE_URL=http://localhost:3000 bash test-api.sh
BASE="${BASE_URL:-http://localhost:3000}/api/products"
pass=0; fail=0

# check <説明> <期待ステータス> <curl引数...>
check() {
  local desc="$1" expect="$2"; shift 2
  local out status body
  out=$(curl -s -w $'\n%{http_code}' "$@")
  status="${out##*$'\n'}"; body="${out%$'\n'*}"
  if [ "$status" = "$expect" ]; then
    pass=$((pass+1)); echo "PASS [$status] $desc"
  else
    fail=$((fail+1)); echo "FAIL [$status != $expect] $desc"
  fi
  echo "     $body"
  LAST_BODY="$body"
}
J='Content-Type: application/json'

echo "== 一覧 =="
check "GET 一覧" 200 "$BASE"

echo "== 追加 =="
check "POST 追加 (正常)" 201 -X POST -H "$J" -d '{"name":"テスト商品","quantity":5}' "$BASE"
ID=$(echo "$LAST_BODY" | sed -E 's/.*"id":([0-9]+).*/\1/')
check "POST 数量マイナス → 400" 400 -X POST -H "$J" -d '{"name":"x","quantity":-1}' "$BASE"
check "POST 商品名なし → 400"   400 -X POST -H "$J" -d '{"quantity":1}' "$BASE"
check "POST 数量が小数 → 400"   400 -X POST -H "$J" -d '{"name":"x","quantity":1.5}' "$BASE"
check "POST 数量が文字列 → 400" 400 -X POST -H "$J" -d '{"name":"x","quantity":"3"}' "$BASE"
check "POST 不正JSON → 400"     400 -X POST -H "$J" -d '{bad' "$BASE"

echo "== 数量変更 =="
check "PUT 数量変更 (正常)"        200 -X PUT -H "$J" -d '{"quantity":20}' "$BASE/$ID/quantity"
check "PUT 0 は許可"               200 -X PUT -H "$J" -d '{"quantity":0}' "$BASE/$ID/quantity"
check "PUT マイナス → 400"         400 -X PUT -H "$J" -d '{"quantity":-5}' "$BASE/$ID/quantity"
check "PUT 数量なし → 400"         400 -X PUT -H "$J" -d '{}' "$BASE/$ID/quantity"
check "PUT 存在しないID → 404"     404 -X PUT -H "$J" -d '{"quantity":1}' "$BASE/99999/quantity"

echo "== 削除 =="
check "DELETE 削除 (正常)"         204 -X DELETE "$BASE/$ID"
check "DELETE 再削除 → 404"        404 -X DELETE "$BASE/$ID"

echo
echo "結果: PASS=$pass FAIL=$fail"
[ "$fail" -eq 0 ]
