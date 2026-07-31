#!/bin/bash
echo "=== CurrentRoom ==="
curl -sk https://haoyu-wang141.top:8082/api/players/wx_test_001/currentRoom
echo ""

echo "=== Create Room ==="
curl -sk -X POST https://haoyu-wang141.top:8082/api/rooms/create -H 'Content-Type: application/json' -d '{"hostOpenId":"wx_test_001","hostNickName":"test","roomConfig":{"roles":{"good":["merlin","percival","loyal","loyal"],"evil":["morgana","assassin"]},"rules":{"evilKnowsEachOther":true,"lancelotsKnowEachOther":true,"lancelotSwapRound":2,"ladyOfTheLake":false,"ladyOfTheLakeRound":2,"maxFailedNominations":3,"oberonMustFailMission":false,"redLancelotMustFailMission":false,"voteVisibility":"public","missionFailDetail":"count"},"limits":{},"meta":{},"merlinVision":{}}}' | python3 -c "import sys,json; d=json.load(sys.stdin); print('success:', d.get('success'), 'roomId:', d.get('roomId','?'), 'players:', len(d.get('room',{}).get('players',[])))"
echo ""

echo "=== CurrentRoom after create ==="
curl -sk https://haoyu-wang141.top:8082/api/players/wx_test_001/currentRoom
echo ""

echo "=== DONE ==="
