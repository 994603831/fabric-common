#!/usr/bin/env bash
CURRENT="$(dirname $(readlink -f ${BASH_SOURCE}))"
CONFIG_OUTPUT=$CURRENT/crypto-config
CONFIG_INPUT=$CURRENT/cryptogen.yaml

BIN_PATH="$CURRENT/../../bin"


function clearOutput() {
    echo "clear CONFIG_OUTPUT $CONFIG_OUTPUT"
	rm -rf $CONFIG_OUTPUT
}
remain_params=""
for (( i = 1; i <= $#; i ++ )); do
    j=${!i}
    remain_params="$remain_params $j"
done


while getopts "ci:o:" shortname $remain_params; do
    case $shortname in
        c)
            clearOutput
        ;;
        i)
            echo "set cryptogen.yaml --config $OPTARG"
            CONFIG_INPUT="$OPTARG"
        ;;
        o)
            echo "set crypto-config/ folder --output $OPTARG"
            CONFIG_OUTPUT="$OPTARG"
        ;;
        ?) #当有不认识的选项的时候arg为?
            echo "unknown argument"
            exit 1
        ;;
    esac
done


# gen
cd $BIN_PATH

./cryptogen generate --config="$CONFIG_INPUT" --output="$CONFIG_OUTPUT"

cd -
