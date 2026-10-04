#!/usr/bin/env bash
# Live smoke test against a deployed suite. Requires DEPLOYER_PRIVATE_KEY in env (never printed).
# Usage: scripts/smoke-testnet.sh [deployments/<chainId>.json] [rpc]
set -euo pipefail
set +x
DEP=${1:-contracts/deployments/46630.json}
RPC=${2:-https://rpc.testnet.chain.robinhood.com}
j() { node -e "console.log(require('./$DEP')['$1'])"; }
TOKEN=$(j token); FAUCET=$(j faucet); TREAS=$(j treasury); TERR=$(j territory); MKT=$(j marketplace); OPS=$(j ops)
PK="$DEPLOYER_PRIVATE_KEY"; ME=$(cast wallet address --private-key "$PK")
send() { local key=$1; shift; cast send --rpc-url "$RPC" --private-key "$key" "$@" --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);console.log("   tx",r.transactionHash,"status",parseInt(r.status),"gas",parseInt(r.gasUsed))})'; }
call() { cast call --rpc-url "$RPC" "$@"; }
e() { cast from-wei "$(echo "$1" | awk '{print $1}')"; }

echo "== reads"
echo " name/symbol: $(call $TOKEN 'name()(string)') / $(call $TOKEN 'symbol()(string)')"
echo " totalSupply: $(e "$(call $TOKEN 'totalSupply()(uint256)')")"
echo " marketplace feeBps: $(call $MKT 'feeBps()(uint16)')"

BODY=5; PLOT_A=12; PLOT_B=13
ID_A=$((BODY*1000000+PLOT_A)); ID_B=$((BODY*1000000+PLOT_B))
# ONLY_BUY=1 resumes at the buy step (seller steps already done)
if [ -z "${ONLY_BUY:-}" ]; then
echo "== faucet claim (deployer)"
send "$PK" $FAUCET 'claim()'
echo " deployer PWSI: $(e "$(call $TOKEN 'balanceOf(address)(uint256)' $ME)")"

echo "== claim Jupiter plots $PLOT_A, $PLOT_B"
PA=$(call $TERR 'priceOf(uint256,uint256)(uint256)' $BODY $PLOT_A | awk '{print $1}')
PB=$(call $TERR 'priceOf(uint256,uint256)(uint256)' $BODY $PLOT_B | awk '{print $1}')
echo " prices: $(cast from-wei $PA) + $(cast from-wei $PB) PWSI"
send "$PK" $TOKEN 'approve(address,uint256)' $TERR $(node -e "console.log((BigInt('$PA')+BigInt('$PB')).toString())")
send "$PK" $TERR 'claim(uint256,uint256)' $BODY $PLOT_A
send "$PK" $TERR 'claim(uint256,uint256)' $BODY $PLOT_B
echo " ownerOf($ID_A): $(call $TERR 'ownerOf(uint256)(address)' $ID_A)"

echo "== upgrade $ID_B + recon mission on Mars (sinks, 100% burned)"
send "$PK" $TOKEN 'approve(address,uint256)' $OPS 75000000000000000000
send "$PK" $OPS 'upgrade(uint256)' $ID_B
send "$PK" $OPS 'launchMission(uint256,uint8)' 4 0

echo "== list $ID_A for 100 PWSI"
send "$PK" $TERR 'approve(address,uint256)' $MKT $ID_A
send "$PK" $MKT 'list(uint256,uint256)' $ID_A 100000000000000000000

fi
echo "== buy from a fresh throwaway buyer"
BUYER_PK=$(cast wallet new --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);const d=Array.isArray(r)?r:(Array.isArray(r.data)?r.data:[r.data]);console.log(d[0].private_key)})')
BUYER=$(cast wallet address --private-key "$BUYER_PK")
echo " buyer: $BUYER"
send "$PK" $BUYER --value 0.0003ether
send "$BUYER_PK" $FAUCET 'claim()'
send "$BUYER_PK" $TOKEN 'approve(address,uint256)' $MKT 100000000000000000000
send "$BUYER_PK" $MKT 'buy(uint256,uint256)' $ID_A 100000000000000000000
echo " ownerOf($ID_A): $(call $TERR 'ownerOf(uint256)(address)' $ID_A)"
# return leftover gas ETH to the deployer
LEFT=$(cast balance --rpc-url "$RPC" $BUYER); GP=$(cast gas-price --rpc-url "$RPC")
RET=$(node -e "const v=BigInt('$LEFT')-BigInt('$GP')*3n*200000n; console.log(v>0n?v.toString():'0')")
[ "$RET" != "0" ] && send "$BUYER_PK" $ME --value $RET --gas-limit 200000 || echo " (refund skipped)"
unset BUYER_PK

echo "== totals"
echo " token.totalBurned: $(e "$(call $TOKEN 'totalBurned()(uint256)')")"
echo " token.totalSupply: $(e "$(call $TOKEN 'totalSupply()(uint256)')")"
echo " treasury.totalFeesBurned: $(e "$(call $TREAS 'totalFeesBurned()(uint256)')")"
echo " treasury PWSI balance: $(e "$(call $TOKEN 'balanceOf(address)(uint256)' $TREAS)")"
echo " ops.totalSinkBurned: $(e "$(call $OPS 'totalSinkBurned()(uint256)')")"
echo " market totalVolume/tradeCount: $(e "$(call $MKT 'totalVolume()(uint256)')") / $(call $MKT 'tradeCount()(uint256)')"
echo " deployer ETH: $(cast balance --ether --rpc-url "$RPC" $ME)"
