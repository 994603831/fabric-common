#!/usr/bin/env bash
set -e
CURRENT=$(
	cd $(dirname ${BASH_SOURCE})
	pwd
)

fcn=$1

this_uname=$(uname)
bashProfile="$HOME/.bashrc"
remain_params=""
for ((i = 2; i <= ${#}; i++)); do
	j=${!i}
	remain_params="$remain_params $j"
done

function golangRemove() {
	local goVersion=${1:-go1.9.2}
	local purge=$2
	if ! go version; then
		echo go not found, skip remove
		return
	fi
	if ! go version | grep $goVersion; then
		echo current go version=$(go version), not $goVersion, skip remove
		return
	fi
	GOROOT=$(go env GOROOT)
	GOPATH=$(go env GOPATH)
	echo remove golang $goVersion at $GOROOT

	sudo sed -i "\|${GOROOT}|d" $bashProfile
	sudo sed -i "\|${GOPATH}|d" $bashProfile
	if [ -n "$purge" ]; then
		echo ...and PURGE, GOPATH:$GOPATH is nuke!!!
		sudo rm -rf $GOPATH
	else
		echo "legacy files exists in GOPATH : $GOPATH"
	fi
	sudo rm -rf $GOROOT
	source $bashProfile

}
function golang1_9() {
	local goVersion=go1.9.2

	if go version; then
		echo "current go version " $(go version) " exist, skip install"
		return
	fi
	echo install golang $goVersion

	goTar=$goVersion.linux-amd64.tar.gz
	wget https://redirector.gvt1.com/edgedl/go/${goTar}
	sudo tar -C /usr/local -xzf ${goTar}
	rm -f ${goTar}

	# write GOROOT to $PATH
	if ! grep "/usr/local/go/bin" $bashProfile; then
		echo "...To set GOROOT"
		sudo sed -i "1 i\export PATH=\$PATH:/usr/local/go/bin" $bashProfile
	else
		echo "GOROOT found in $bashProfile"
	fi

	export PATH=$PATH:/usr/local/go/bin # ephermeral
	# write $GOPATH/bin to $PATH
	GOPATH=$(go env GOPATH)
	if ! grep "$GOPATH/bin" $bashProfile; then
		echo "...To set GOPATH/bin"
		sudo sed -i "1 i\export PATH=\$PATH:$GOPATH/bin" $bashProfile
	else
		echo "GOPATH/bin found in $bashProfile"
	fi
	echo "path (effective in new shell) $PATH"
}

function install_libtool() {
	if [ "${this_uname}" == "Darwin" ]; then
		brew install libtool
	else
		sudo apt-get install -y libtool
	fi

}

function gitSync() {
	git pull
	git submodule update --init --recursive
}

if [ -n "$fcn" ]; then
	$fcn $remain_params
else
	$CURRENT/docker/install.sh
	$CURRENT/docker/nodejs/install.sh
	cd $CURRENT/nodejs
	npm install
	cd -
	cd $CURRENT/docker/nodejs
	npm install
	cd -
fi
