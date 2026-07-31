#!/bin/bash
for id in 1010 111 1111 1212 222 333 444 555 666 777 888 999; do
  echo -n "$id: "
  curl -sk -X POST https://haoyu-wang141.top:8082/api/rooms/join \
    -H 'Content-Type: application/json' \
    -d "{\"roomId\":\"311683\",\"userInfo\":{\"openId\":\"$id\",\"nickName\":\"$id\"},\"seatNumber\":0}" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('message','FAIL') if d.get('success') else d.get('message','FAIL'))" 2>/dev/null
done
