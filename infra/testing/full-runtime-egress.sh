#!/bin/sh
# Only testing API/Auth can use public HTTP(S), including signed Apple OCSP responses. Keep host and private networks blocked.
set -eu
subnet=172.30.245.0/24
chain=ICAO-TEST-EGRESS
iptables -w -N "$chain" 2>/dev/null || true
# New isolated chain; never flush shared Docker or production firewall chains.
iptables -w -F "$chain"
iptables -w -A "$chain" -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
for destination in 0.0.0.0/8 10.0.0.0/8 100.64.0.0/10 127.0.0.0/8 169.254.0.0/16 172.16.0.0/12 192.168.0.0/16 224.0.0.0/4 240.0.0.0/4 47.108.90.19/32; do
  iptables -w -A "$chain" -d "$destination" -j REJECT
done
iptables -w -A "$chain" -p tcp -m multiport --dports 80,443 -j ACCEPT
iptables -w -A "$chain" -j REJECT
iptables -w -C DOCKER-USER -s "$subnet" -j "$chain" 2>/dev/null || iptables -w -I DOCKER-USER 1 -s "$subnet" -j "$chain"
iptables -w -C INPUT -s "$subnet" -m conntrack --ctstate NEW -j REJECT 2>/dev/null || iptables -w -I INPUT 1 -s "$subnet" -m conntrack --ctstate NEW -j REJECT
