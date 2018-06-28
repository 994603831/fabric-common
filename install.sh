#!/usr/bin/env bash
set -e
CURRENT=$(cd $(dirname ${BASH_SOURCE}); pwd)

fcn=$1

this_uname=$(uname)
systemProfile="/etc/profile"
remain_params=""
for ((i = 2; i <= ${#}; i++)); do
	j=${!i}
	remain_params="$remain_params $j"
done

function golang() {
	goVersion=go1.9.2
	if [ "$1" == "remove" ]; then
		sudo sed -i '/\/usr\/local\/go\/bin/d' $systemProfile
		sudo rm -rf /usr/local/go
		return
	fi

	goTar=$goVersion.linux-amd64.tar.gz
	# write path to 'go' command
	if ! grep "/usr/local/go/bin" $systemProfile; then
		echo "export PATH=\$PATH:/usr/local/go/bin" | sudo tee -a $systemProfile
		export PATH=$PATH:/usr/local/go/bin
	fi

	if ! go version | grep $goVersion; then
		if go version; then
			echo ... to overwrite exiting golang at GOROOT: $(go env GOROOT)
			sudo rm -rf $(go env GOROOT)
		fi
		wget https://redirector.gvt1.com/edgedl/go/${goTar}
		sudo tar -C /usr/local -xzf ${goTar}
		rm -f ${goTar}
	fi

	# write path to $GOPATH/bin
	GOPATH=$(go env GOPATH)
	if ! grep "$GOPATH/bin" $systemProfile; then
		echo "export PATH=\$PATH:$GOPATH/bin" | sudo tee -a $systemProfile
		export PATH=$PATH:$GOPATH/bin
	fi

}
function golangLatest() {
	if [ "$1" == "remove" ]; then
		sudo apt-get -y remove golang-go
		sudo add-apt-repository --remove -y ppa:longsleep/golang-backports
	else
		sudo add-apt-repository -y ppa:longsleep/golang-backports
		sudo apt-get update
		sudo apt-get -y install golang-go
	fi
}
function install_libtool() {
	if [ "${this_uname}" == "Darwin" ]; then
        brew install libtool
    else
        sudo apt-get install libtool
    fi

}

function golang_dep() {
	curl https://raw.githubusercontent.com/golang/dep/master/install.sh | sh
	dep version
}

if [ -n "$fcn" ]; then
	$fcn $remain_params
else
	if [ "${this_uname}" == "Darwin" ]; then
        :
    else
        sudo apt-get install -y linux-image-extra-$(uname -r) linux-image-extra-virtual
        sudo apt-get install -y apt-transport-https ca-certificates curl software-properties-common
    fi

	$CURRENT/docker/install.sh
	$CURRENT/docker/nodejs/install.sh
	cd $CURRENT/nodejs
	npm install
	npm install grpc@1.10.1 # FIXME hot fix for 1.1
	cd -
	cd $CURRENT/docker/nodejs
	npm install
	cd -
fi
