/*
	{
	    identities: [
	      { role: { name: "member", mspId: "org1" }},
	      { role: { name: "member", mspId: "org2" }}
	    ],
	    policy: {
	      "1-of": [{ "signed-by": 0 }, { "signed-by": 1 }]
	    }
	  }
*/

/*
{
	identities: [
	  { role: { name: "member", mspId: "peerOrg1" }},
	  { role: { name: "member", mspId: "peerOrg2" }},
	  { role: { name: "admin", mspId: "ordererOrg" }}
	],
	policy: {
	  "2-of": [
		{ "signed-by": 2},
		{ "1-of": [{ "signed-by": 0 }, { "signed-by": 1 }]}
	  ]
	}
  }
*/

exports.Policy = require('fabric-client/lib/Policy');

exports.simplePolicyBuilder = (identities, n) => {
	return {
		identities,
		policy: {
			[`${n}-of`]: identities.map((e, i) => ({'signed-by': i}))
		}
	};
};
/**
 * only `OR` is allowed in collection policy, see in https://hyperledger-fabric.readthedocs.io/en/release-1.2/private-data-arch.html
 *  ----
 *  policy: Defines the organization peers allowed to persist the collection data expressed using the Signature policy syntax,
 *      with each member being included in an OR signature policy list.
 *  ----
 */
exports.collectionPolicyBuilder = (identities) => {
	return {
		identities,
		policy: {
			['1-of']: identities.map((e, i) => ({'signed-by': i}))
		}
	};
};

const MSPRoleType = ['member', 'admin', 'client', 'peer'];

exports.RoleIdentity = (mspId, typeIndex) => ({
	[exports.Policy.IDENTITY_TYPE.Role]: {name: MSPRoleType[typeIndex], mspId}
});

