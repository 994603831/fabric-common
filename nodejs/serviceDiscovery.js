const FabricUtils = require('fabric-client/lib/utils');
const Logger = require('./logger');
const logger = Logger.new('service discovery', true);
/**
 * @typedef {Object} PeerQueryResponse
 * @property {Object} peers_by_org
 * @property {Object} pretty
 */

/**
 *
 * @param client
 * @param peer
 * @returns {Promise<PeerQueryResponse>}
 */
exports.globalPeers = async (client, peer) => {
	const discoveries = await client.queryPeers({target: peer, useAdmin: false});
	const {peers_by_org} = discoveries;
	const result = {};
	for (const org in peers_by_org) {
		const {peers} = peers_by_org[org];
		result[org] = {
			peers: peers.map(p => p.endpoint)
		};
	}
	discoveries.pretty = result;
	return discoveries;
};

/**
 * TODO: inspect the result structure, check the differnce from this._discovery_results
 * Return the discovery results.
 * Discovery results are only available if this channel has been initialized.
 * If the results are too old, they will be refreshed
 * @param {Channel} channel
 * @param {DiscoveryChaincodeInterest[]} endorsement_hints - Indicate to discovery
 *        how to calculate the endorsement plans.
 * @returns {Promise<DiscoveryResults>}
 */
exports.getDiscoveryResults = async (channel, endorsement_hints) => {
	return await channel.getDiscoveryResults(endorsement_hints);
};


/**
 * only work as helper to recover channel object, refer to {@link discover}
 *
 * FIXME: sdk doc WARNING
 * In the case when multiple orderers within single host, meanwhile asLocalhost is true, the orderer names will overlap
 *  (all using localhost:7050). It leads to only one orderer is found in channel.getOrderers after channel.initialize
 * @param channel
 * @param peer
 * @param {boolean} asLocalhost   FIXME:ugly undefined checking in fabric-sdk-node
 * @param TLS
 * @returns {Promise<*|void>}
 */
exports.initialize = async (channel, peer, {asLocalhost, TLS} = {}) => {
	FabricUtils.setConfigSetting('discovery-protocol', TLS ? 'grpcs' : 'grpc');
	return await channel.initialize({target: peer, discover: true, asLocalhost});
};

/**
 * @param {string} chaincodeId
 * @param {Object} collectionsConfig
 * @returns {Client.DiscoveryChaincodeCall}
 * @constructor
 */
exports.discoveryChaincodeCallBuilder = ({chaincodeId, collectionsConfig}) => {
	return {
		name: chaincodeId,
		collection_names: collectionsConfig ? Object.keys(collectionsConfig) : undefined
	};
};


/**
 *
 * @param channel
 * @param peer
 * @param {Client.DiscoveryChaincodeCall[]} chaincodes
 * @param {boolean} local
 * @returns {Promise<*>}
 */
exports.discover = async (channel, peer, {chaincodes, local}) => {
	const request = {
		target: peer,
		useAdmin: true,
		config: true,
		interests: [{chaincodes}],
		local
	};


	return channel._discover(request);
};
exports.discoverPretty = (result) => {
	const {orderers, peers_by_org, endorsement_plans} = result;
	const prettier = Object.assign({}, result);
	for (const [ordererMSPID, value] of Object.entries(orderers)) {
		logger.debug(value.endpoints);
		prettier.orderers[ordererMSPID] = value.endpoints;
	}
	for (const [peerMSPID, value] of Object.entries(peers_by_org)) {
		prettier.peers_by_org[peerMSPID] = value.peers;
	}
	prettier.endorsement_plans = {};
	for (const {chaincode, groups} of endorsement_plans) {
		prettier.endorsement_plans[chaincode] = {};
		for (const [groupID, group] of Object.entries(groups)) {
			prettier.endorsement_plans[chaincode][groupID] = group.peers;
		}
	}

	return prettier;
};