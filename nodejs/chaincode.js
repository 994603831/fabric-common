const logger = require('./logger').new('chaincode');
const logUtil = require('./logger');
const Query = require('./query');
const Channel = require('fabric-client/lib/Channel');
const Orderer = require('fabric-client/lib/Orderer');
const ChannelUtil = require('./channel');
const {txEvent} = require('./eventHub');

exports.nextVersion = (chaincodeVersion) => {
	const version = parseInt(chaincodeVersion.substr(1));
	return `v${version + 1}`;
};
exports.newerVersion = (versionN, versionO) => {
	const versionNumN = parseInt(versionN.substr(1));
	const versionNumO = parseInt(versionO.substr(1));
	return versionNumN > versionNumO;
};
exports.reducer = ({txEventResponses, proposalResponses}) => ({
	txs: txEventResponses.map(entry => entry.tx),
	responses: proposalResponses.map((entry) => entry.response.payload.toString())
});


exports.chaincodeProposalAdapter = (actionString, validator, verbose, log) => {
	const _validator = validator ? validator : ({response}) => {
		return {isValid: response && response.status === 200, isSwallowed: false};
	};
	const stringify = (proposalResponse, verbose) => {
		const copy = Object.assign({}, proposalResponse);
		const {response} = copy;
		if (!response) return copy;
		const {payload: r_payload} = response;
		const {endorsement} = copy;
		if (endorsement) {
			copy.endorsement = Object.assign({}, proposalResponse.endorsement);
			copy.endorsement.endorser = copy.endorsement.endorser.toString();
		}
		if (verbose) copy.response.payload = r_payload.toString();
		if (!verbose) delete copy.payload;
		return copy;
	};
	return ([responses, proposal]) => {

		let errCounter = 0; // NOTE logic: reject only when all bad
		let swallowCounter = 0;

		for (const i in responses) {
			const proposalResponse = responses[i];
			const {isValid, isSwallowed} = _validator(proposalResponse);

			if (isValid) {
				if (log) logger.info(`${actionString} is good for [${i}]`, stringify(proposalResponse, verbose));
				if (isSwallowed) {
					swallowCounter++;
				}
			} else {
				logger.error(`${actionString} is bad for [${i}]`, stringify(proposalResponse, verbose));
				errCounter++;
			}
		}

		return {
			errCounter,
			swallowCounter,
			nextRequest: {
				proposalResponses: responses, proposal,
			},
		};

	};
};


exports.nameMatcher = (chaincodeName, toThrow) => {
	const namePattern = /^[A-Za-z0-9_-]+$/;
	const result = chaincodeName.match(namePattern);
	if (!result && toThrow) {
		throw Error(`invalid chaincode name:${chaincodeName}; should match regx: ${namePattern}`);
	}
	return result;
};
exports.versionMatcher = (ccVersionName, toThrow) => {
	const namePattern = /^[A-Za-z0-9_.-]+$/;
	const result = ccVersionName.match(namePattern);
	if (!result && toThrow) {
		throw Error(`invalid chaincode version:${ccVersionName}; should match regx: ${namePattern}`);
	}
	return result;
};
/**
 * install chaincode does not require channel existence
 * set golang path is required when chaincodeType is 'golang'
 * @param {Peer[]} peers
 * @param {string} chaincodeId allowedCharsChaincodeName = "[A-Za-z0-9_-]+"
 * @param chaincodePath
 * @param {string} chaincodeVersion allowedCharsVersion  = "[A-Za-z0-9_.-]+"
 * @param {string} chaincodeType Optional. Type of chaincode. One of 'golang', 'car', 'node' or 'java'.
 * @param {Client} client
 * @returns {Promise<*>}
 */
exports.install = async (peers, {chaincodeId, chaincodePath, chaincodeVersion, chaincodeType = 'golang',}, client) => {
	const logger = logUtil.new('install-chaincode');
	logger.debug({peers_length: peers.length, chaincodeId, chaincodePath, chaincodeVersion});

	exports.nameMatcher(chaincodeId, true);
	exports.versionMatcher(chaincodeVersion, true);
	const request = {
		targets: peers,
		chaincodePath,
		chaincodeId,
		chaincodeVersion,
		chaincodeType
	};

	const [responses, proposal] = await client.installChaincode(request);
	const ccHandler = exports.chaincodeProposalAdapter('install', (proposalResponse) => {
		const {response} = proposalResponse;
		if (response && response.status === 200) return {
			isValid: true,
			isSwallowed: false
		};
		if (proposalResponse instanceof Error && proposalResponse.toString().includes('exists')) {
			logger.warn('swallow when exsitence');
			return {isValid: true, isSwallowed: true};
		}
		return {isValid: false, isSwallowed: false};
	});
	const result = ccHandler([responses, proposal]);
	const {errCounter, nextRequest: {proposalResponses}} = result;
	if (errCounter > 0) {
		throw Error(JSON.stringify(proposalResponses));
	} else {
		return result;
	}
};

exports.updateInstall = async (peer, {chaincodeId, chaincodePath}, client) => {
	const {chaincodes} = await Query.chaincodes.installed(peer, client);
	const foundChaincodes = chaincodes.filter((element) => element.name === chaincodeId);
	let chaincodeVersion = 'v0';
	if (foundChaincodes.length === 0) {
		logger.warn(`No chaincode found with name ${chaincodeId}, to use version ${chaincodeVersion}, `, {chaincodePath});
	} else {
		let latestChaincode = foundChaincodes[0];
		let latestVersion = latestChaincode.version;
		for (const chaincode of foundChaincodes) {
			const {version} = chaincode;
			if (exports.newerVersion(version, latestVersion)) {
				latestVersion = version;
				latestChaincode = chaincode;
			}
		}
		chaincodePath = latestChaincode.path;
		chaincodeVersion = exports.nextVersion(latestVersion);
	}

	// [ { name: 'adminChaincode',
	// 	version: 'v0',
	// 	path: 'github.com/admin',
	// 	input: '',
	// 	escc: '',
	// 	vscc: '' } ]

	return exports.install([peer], {chaincodeId, chaincodePath, chaincodeVersion}, client);

};

/**
 *
 * @param {string} command 'deploy' or 'upgrade'
 * @param channel
 * @param {Peer[]} peers default: all peers in channel
 * @param {EventHub[]} eventHubs
 * @param chaincodeId
 * @param chaincodeVersion
 * @param {string[]} args
 * @param {string} fcn default: 'init'
 * @param endorsementPolicy
 * @param collectionConfig
 * @param {string} chaincodeType Type of chaincode. One of 'golang', 'car', 'java' or 'node'.
 * @param eventWaitTime default: 30000
 * @param proposalTimeOut
 * @returns {Promise<any[]>}
 */
exports.instantiateOrUpgrade = async (
	command, channel, peers, eventHubs,
	{chaincodeId, chaincodeVersion, args, fcn, endorsementPolicy, collectionConfig, chaincodeType},
	eventWaitTime, proposalTimeOut
) => {
	if (command !== 'deploy' && command !== 'upgrade') {
		throw Error(`invalid command: ${command}`);
	}
	const logger = logUtil.new(`${command}-chaincode`);
	const client = channel._clientContext;
	if (!eventWaitTime) eventWaitTime = 30000;
	logger.debug({channelName: channel.getName(), chaincodeId, chaincodeVersion, args});

	exports.versionMatcher(chaincodeVersion, true);

	const txId = client.newTransactionID();

	const request = {
		chaincodeId,
		chaincodeVersion,
		args,
		fcn,
		txId,
		targets: peers,// optional: if not set, targets will be channel.getPeers
		'endorsement-policy': endorsementPolicy,
		'collections-config': collectionConfig,
		chaincodeType,
	};
	const existSymptom = '(status: 500, message: chaincode exists';


	const [responses, proposal] = await channel._sendChaincodeProposal(request, command, proposalTimeOut);

	logger.info('got proposalReponse: ', responses.length);
	const ccHandler = exports.chaincodeProposalAdapter(command, proposalResponse => {
		const {response} = proposalResponse;
		if (response && response.status === 200) return {isValid: true, isSwallowed: false};
		if (proposalResponse instanceof Error && proposalResponse.toString().includes(existSymptom)) {
			logger.warn('swallow when existence');
			return {isValid: true, isSwallowed: true};
		}
		return {isValid: false, isSwallowed: false};
	});
	const {errCounter, swallowCounter, nextRequest} = ccHandler([responses, proposal]);
	const {proposalResponses} = nextRequest;
	if (errCounter > 0) {
		throw {proposalResponses};
	}
	if (swallowCounter === proposalResponses.length) {
		return {proposalResponses};
	}

	const promises = [];
	for (const eventHub of eventHubs) {
		promises.push(txTimerPromise(eventHub, {txId}, eventWaitTime));
	}

	const response = await channel.sendTransaction(nextRequest);
	logger.info('channel.sendTransaction', response);
	return Promise.all(promises);
	//	NOTE result parser is not required here, because the payload in proposalresponse is in form of garbled characters.
};
exports.upgradeToCurrent = async (channel, richPeer, {chaincodeId, args, fcn}) => {
	const client = channel._clientContext;
	const {chaincodes} = await Query.chaincodes.installed(richPeer, client);
	const foundChaincode = chaincodes.find((element) => element.name === chaincodeId);
	if (!foundChaincode) {
		throw `No chaincode found with name ${chaincodeId}`;
	}
	const {version} = foundChaincode;

	// [ { name: 'adminChaincode',
	// 	version: 'v0',
	// 	path: 'github.com/admin',
	// 	input: '',
	// 	escc: '',
	// 	vscc: '' } ]

	const chaincodeVersion = exports.nextVersion(version);
	return exports.upgrade(channel, [richPeer], {chaincodeId, args, chaincodeVersion, fcn}, client);
};


const txTimerPromise = (eventHub, {txId}, eventWaitTime) => {
	const validator = ({tx, code}) => {
		logger.debug('newTxEvent', {tx, code});
		return {valid: code === 'VALID', interrupt: true};
	};
	return new Promise((resolve, reject) => {
		const onSuccess = ({tx, code, interrupt}) => {
			clearTimeout(timerID);
			resolve({tx, code});
		};
		const onErr = (err) => {
			clearTimeout(timerID);
			reject(err);
		};
		const transactionID = txEvent(eventHub, {txId}, validator, onSuccess, onErr);
		const timerID = setTimeout(() => {
			eventHub.unregisterTxEvent(transactionID);
			eventHub.disconnect();
			reject({err: 'txTimeout'});
		}, eventWaitTime);
	});
};

/**
 * NOTE Invoke action cannot be performed on peer without chaincode installed
 * Error: cannot retrieve package for chaincode adminChaincode/v0,
 *        error open /var/hyperledger/production/chaincodes/adminChaincode.v0: no such file or directory
 * @param channel
 * @param peers
 * @param eventHubs
 * @param chaincodeId
 * @param {string} fcn
 * @param {string[]} args
 * @param {Orderer} orderer target orderer, default to pick one in channel
 * @param {Number} eventWaitTime optional, default to use 30000 ms
 * @return {Promise.<TResult>}
 */
exports.invoke = async (channel, peers, eventHubs, {chaincodeId, fcn, args}, orderer, eventWaitTime) => {
	logger.debug('invoke', {channelName: channel.getName(), peersSize: peers.length, chaincodeId, fcn, args});
	if (!eventWaitTime) eventWaitTime = 30000;
	const client = channel._clientContext;

	const nextRequest = await exports.invokeProposal(client, peers, channel.getName(), {chaincodeId, fcn, args});
	const {txId, proposalResponses} = nextRequest;
	const promises = [];

	for (const eventHub of eventHubs) {
		promises.push(txTimerPromise(eventHub, {txId}, eventWaitTime));
	}

	await exports.invokeCommit(client, nextRequest, orderer);

	const txEventResponses = await Promise.all(promises);
	return {txEventResponses, proposalResponses};
};
exports.invokeProposal = async (client, targets, channelId, {chaincodeId, fcn, args}, proposalTimeout) => {

	const txId = client.newTransactionID();
	const request = {
		chaincodeId,
		fcn,
		args,
		txId,
		targets
	};

	const [responses, proposal] = await Channel.sendTransactionProposal(request, channelId, client, proposalTimeout);
	const ccHandler = exports.chaincodeProposalAdapter('invoke');
	const {nextRequest, errCounter} = ccHandler([responses, proposal]);
	const {proposalResponses} = nextRequest;

	if (errCounter > 0) {
		throw {proposalResponses};
	}
	nextRequest.txId = txId;
	return nextRequest;
};
exports.invokeCommit = async (client, {proposalResponses, proposal}, orderer) => {
	if (!(orderer instanceof Orderer)) {
		throw Error(`orderer should be instance of Orderer, but got ${typeof orderer}`);
	}
	const nextRequest = {proposalResponses, proposal, orderer};
	const dummyChannel = ChannelUtil.newDummy(client);
	return dummyChannel.sendTransaction(nextRequest);
};

exports.query = async (channel, peers, {chaincodeId, fcn, args}) => {
	const logger = logUtil.new('query');
	logger.debug({channelName: channel.getName(), peersSize: peers.length, chaincodeId, fcn, args});
	const client = channel._clientContext;
	const txId = client.newTransactionID();

	const request = {
		chaincodeId,
		fcn,
		args,
		txId,
		targets: peers //optional: use channel.getPeers() as default
	};
	const results = await channel.queryByChaincode(request);
	return results.map(e => e.toString());
};