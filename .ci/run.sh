#!/usr/bin/env bash

set -e

# move to Kibana root
cd "$(dirname "$0")/.."

case "$KBN_CI_JOB" in
"intake")
  ./test/scripts/jenkins_unit.sh
  ;;
ciGroup*)
  export CI_GROUP="${KBN_CI_JOB##ciGroup}"
  ./test/scripts/jenkins_ci_group.sh
  ;;
x-pack)
  ./test/scripts/jenkins_xpack.sh
  ;;
x-pack-ciGroup*)
  export CI_GROUP="${KBN_CI_JOB##x-pack-ciGroup}"
  ./test/scripts/jenkins_xpack_ci_group.sh
  ;;
*)
  echo "CI_JOB '$KBN_CI_JOB' is not implemented."
  exit 1
  ;;
esac
