#!/usr/bin/env bash
set -e
CURRENT=$(cd $(dirname ${BASH_SOURCE}) && pwd)

fcn=$1

bashProfile="$HOME/.bashrc"
remain_params=""
for ((i = 2; i <= ${#}; i++)); do
	j=${!i}
	remain_params="$remain_params $j"
done

function golangRemove() {
	local goVersion=$1 # go1.9.2
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

	export PATH=$PATH:/usr/local/go/bin # ephemeral
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

function golang1_7() {
	local goVersion=go1.7.6
	if go version; then
		echo "current go version " $(go version) " exist, skip install"
		return
	fi
	local GOPATH=$HOME/go

	echo install golang $goVersion

	# write GOROOT to $PATH
	if ! grep "/usr/local/go/bin" $bashProfile; then
		echo "...To set GOROOT"
		sudo sed -i "1 i\export PATH=\$PATH:/usr/local/go/bin" $bashProfile
	else
		echo "GOROOT found in $bashProfile"
	fi

	goTar=$goVersion.linux-amd64.tar.gz
	wget https://redirector.gvt1.com/edgedl/go/${goTar}
	sudo tar -C /usr/local -xzf ${goTar}
	rm -f ${goTar}

	# write GOPATH
	if ! grep "$GOPATH" $bashProfile; then
		echo "...To set GOPATH"
		echo "export GOPATH=${GOPATH}" | sudo tee -a $bashProfile
	fi
	# write $GOPATH/bin to $PATH
	if ! grep "$GOPATH/bin" $bashProfile; then
		echo "...To set GOPATH/bin"
		sudo sed -i "1 i\export PATH=\$PATH:$GOPATH/bin" $bashProfile
	else
		echo "GOPATH/bin found in $bashProfile"
	fi
}
function golang1_10() {
	if [ "$1" == "remove" ]; then
		if [ $(uname) == "Darwin" ]; then
			brew uninstall go || true
			return
		fi
		sudo apt-get -y remove golang-go
		sudo add-apt-repository --remove -y ppa:longsleep/golang-backports
	else
		if [ $(uname) == "Darwin" ]; then
			brew install go || true
			return
		fi
		sudo add-apt-repository -y ppa:longsleep/golang-backports
		sudo apt-get update
		sudo apt-get -y install golang-go
		GOPATH=$(go env GOPATH)
		if ! grep "$GOPATH/bin" $bashProfile; then
			echo "...To set GOPATH/bin and GOBIN"
			sudo sed -i "1 i\export PATH=\$PATH:$GOPATH/bin" $bashProfile
			sudo sed -i "1 i\export GOBIN=$GOPATH/bin" $bashProfile
		else
			echo "GOPATH/bin found in $bashProfile"
		fi
	fi
}
function install_libtool() {
	if [ $(uname) == "Darwin" ]; then
		brew install libtool
		return
	fi
	sudo apt-get install -y libtool
}

function golang_dep() {
	echo "install dep..."
	if [ $(uname) == "Darwin" ]; then
		brew install dep
		return
	fi
	if [ -z "$GOBIN" ]; then
		if [ -z "$GOPATH" ]; then
			echo install dep failed: GOPATH not found
			exit 1
		fi
		export GOBIN=$GOPATH/bin/
	fi
	mkdir -p $GOBIN
	curl https://raw.githubusercontent.com/golang/dep/master/install.sh | sh
	if echo $PATH | grep "$GOBIN" >/dev/null; then
		export PATH=$PATH:$GOBIN # ephemeral
	fi
	dep version
}
function gitSync() {
	git pull
	git submodule update --init --recursive
}

if [ -n "$fcn" ]; then
	$fcn $remain_params
else
	# install home brew
	if [ $(uname) == "Darwin" ]; then
		# TODO use brew version??
		if ! brew >/dev/null; then
			/usr/bin/ruby -e "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install)"
		fi
	fi

	$CURRENT/docker/install.sh
	$CURRENT/docker/nodejs/install.sh
	$CURRENT/docker/nodejs/install.sh packageLock false
	cd $CURRENT/nodejs
	npm install
	cd -
	cd $CURRENT/docker/nodejs
	npm install
	cd -
fi
