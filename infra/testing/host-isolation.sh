#!/bin/sh
# Block NEW testing-container connections to the host itself. Internal Docker
# networks already block routed egress, but still permit the bridge gateway.
set -eu
subnet=172.30.244.0/24
rule_comment=icao-testing-host-isolation
case "${1:-ensure}" in
  ensure)
    if ! iptables -w -C INPUT -s "$subnet" -m conntrack --ctstate NEW -m comment --comment "$rule_comment" -j REJECT 2>/dev/null; then
      iptables -w -I INPUT 1 -s "$subnet" -m conntrack --ctstate NEW -m comment --comment "$rule_comment" -j REJECT
    fi
    ;;
  remove)
    if iptables -w -C INPUT -s "$subnet" -m conntrack --ctstate NEW -m comment --comment "$rule_comment" -j REJECT 2>/dev/null; then
      iptables -w -D INPUT -s "$subnet" -m conntrack --ctstate NEW -m comment --comment "$rule_comment" -j REJECT
    fi
    ;;
  *) exit 2 ;;
esac
