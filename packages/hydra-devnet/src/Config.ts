/**
 * Configuration for Hydra DevNet.
 *
 * Provides type definitions and sensible defaults for running a local
 * Cardano + Hydra development environment with Docker containers.
 *
 * The configuration covers:
 * - **Cardano node**: Block producer with fast slot times for local development
 * - **Hydra node**: Single-party head with WebSocket/HTTP API
 * - **Genesis**: Byron, Shelley, Alonzo, Conway genesis configs for instant hard forks
 * - **Keys**: KES, VRF, operational cert for block production
 *
 * @since 0.1.0
 * @module
 */

// ---------------------------------------------------------------------------
// Cardano Node Configuration Types
// ---------------------------------------------------------------------------

/**
 * Configuration for the Cardano node container.
 *
 * @since 0.1.0
 * @category model
 */
export interface CardanoNodeConfig {
  /** Docker image for the Cardano node */
  readonly image?: string;
  /** Host port for the Cardano node (node-to-node protocol) */
  readonly port?: number;
  /** Host port for the tx submission API */
  readonly submitPort?: number;
  /** Testnet magic number */
  readonly networkMagic?: number;
}

/**
 * Configuration for the Hydra node container.
 *
 * @since 0.1.0
 * @category model
 */
export interface HydraNodeConfig {
  /** Docker image for the Hydra node */
  readonly image?: string;
  /** Host port for the Hydra API (WebSocket + HTTP) */
  readonly apiPort?: number;
  /** Host port for Hydra peer communication */
  readonly peerPort?: number;
  /** Host port for metrics/monitoring */
  readonly monitoringPort?: number;
  /** Contestation period in seconds (default: 60) */
  readonly contestationPeriod?: number;
  /** Unique node identifier (default: "devnet-1") */
  readonly nodeId?: string;
}

/**
 * Top-level configuration for the Hydra DevNet cluster.
 * All properties are optional — sensible defaults are provided.
 *
 * @since 0.1.0
 * @category model
 */
export interface DevNetConfig {
  /** Unique name for this cluster (default: 'hydra-devnet') */
  readonly clusterName?: string;
  /** Cardano node configuration */
  readonly cardanoNode?: CardanoNodeConfig;
  /** Hydra node configuration */
  readonly hydraNode?: HydraNodeConfig;
  /** Override Shelley genesis (partial) */
  readonly shelleyGenesisOverrides?: Partial<ShelleyGenesis>;
}

/**
 * Fully resolved configuration with all defaults applied.
 *
 * @since 0.1.0
 * @category model
 */
export interface ResolvedDevNetConfig {
  readonly clusterName: string;
  readonly cardanoNode: Required<CardanoNodeConfig>;
  readonly hydraNode: Required<HydraNodeConfig>;
  readonly shelleyGenesisOverrides?: Partial<ShelleyGenesis>;
}

// ---------------------------------------------------------------------------
// Genesis Type Definitions (Cardano)
// ---------------------------------------------------------------------------

/**
 * Cardano node configuration file structure.
 * @since 0.1.0
 * @category genesis
 */
export type NodeConfig = {
  readonly Protocol: string;
  readonly ByronGenesisFile: string;
  readonly ShelleyGenesisFile: string;
  readonly AlonzoGenesisFile: string;
  readonly ConwayGenesisFile: string;
  readonly ApplicationName: string;
  readonly ApplicationVersion: number;
  readonly MaxKnownMajorProtocolVersion: number;
  readonly 'LastKnownBlockVersion-Alt': number;
  readonly 'LastKnownBlockVersion-Major': number;
  readonly 'LastKnownBlockVersion-Minor': number;
  readonly TestShelleyHardForkAtEpoch: number;
  readonly TestAllegraHardForkAtEpoch: number;
  readonly TestMaryHardForkAtEpoch: number;
  readonly TestAlonzoHardForkAtEpoch: number;
  readonly TestBabbageHardForkAtEpoch: number;
  readonly TestConwayHardForkAtEpoch: number;
  readonly RequiresNetworkMagic: string;
  readonly minSeverity: string;
  readonly defaultBackends: ReadonlyArray<string>;
  readonly defaultScribes: ReadonlyArray<ReadonlyArray<string>>;
  readonly setupBackends: ReadonlyArray<string>;
  readonly setupScribes: ReadonlyArray<{
    readonly scFormat: string;
    readonly scKind: string;
    readonly scName: string;
    readonly scRotation: null;
  }>;
  readonly TurnOnLogMetrics: boolean;
  readonly TurnOnLogging: boolean;
  readonly TracingVerbosity: string;
  readonly TraceBlockFetchClient: boolean;
  readonly TraceBlockFetchDecisions: boolean;
  readonly TraceBlockFetchProtocol: boolean;
  readonly TraceBlockFetchProtocolSerialised: boolean;
  readonly TraceBlockFetchServer: boolean;
  readonly TraceChainDb: boolean;
  readonly TraceChainSyncBlockServer: boolean;
  readonly TraceChainSyncClient: boolean;
  readonly TraceChainSyncHeaderServer: boolean;
  readonly TraceChainSyncProtocol: boolean;
  readonly TraceDNSResolver: boolean;
  readonly TraceDNSSubscription: boolean;
  readonly TraceErrorPolicy: boolean;
  readonly TraceForge: boolean;
  readonly TraceHandshake: boolean;
  readonly TraceIpSubscription: boolean;
  readonly TraceLocalChainSyncProtocol: boolean;
  readonly TraceLocalErrorPolicy: boolean;
  readonly TraceLocalHandshake: boolean;
  readonly TraceLocalTxSubmissionProtocol: boolean;
  readonly TraceLocalTxSubmissionServer: boolean;
  readonly TraceMempool: boolean;
  readonly TraceMux: boolean;
  readonly TraceOptions: Record<string, unknown>;
  readonly TraceTxInbound: boolean;
  readonly TraceTxOutbound: boolean;
  readonly TraceTxSubmissionProtocol: boolean;
  readonly hasEKG: number;
  readonly hasPrometheus: ReadonlyArray<string | number>;
  readonly options: {
    readonly mapBackends: Record<string, ReadonlyArray<string>>;
    readonly mapSubtrace: Record<string, { readonly subtrace: string }>;
  };
  readonly ExperimentalHardForksEnabled: boolean;
  readonly ExperimentalProtocolsEnabled: boolean;
};

/**
 * Byron genesis configuration structure.
 * @since 0.1.0
 * @category genesis
 */
export type ByronGenesis = {
  readonly protocolConsts: {
    readonly k: number;
    readonly protocolMagic: number;
  };
  readonly startTime: number;
  readonly blockVersionData: {
    readonly scriptVersion: number;
    readonly slotDuration: string;
    readonly maxBlockSize: string;
    readonly maxHeaderSize: string;
    readonly maxTxSize: string;
    readonly maxProposalSize: string;
    readonly mpcThd: string;
    readonly heavyDelThd: string;
    readonly updateVoteThd: string;
    readonly updateProposalThd: string;
    readonly updateImplicit: string;
    readonly softforkRule: {
      readonly initThd: string;
      readonly minThd: string;
      readonly thdDecrement: string;
    };
    readonly txFeePolicy: {
      readonly summand: string;
      readonly multiplier: string;
    };
    readonly unlockStakeEpoch: string;
  };
  readonly bootStakeholders: Record<string, number>;
  readonly heavyDelegation: Record<string, unknown>;
  readonly nonAvvmBalances: Record<string, unknown>;
  readonly avvmDistr: Record<string, unknown>;
};

/**
 * Shelley genesis configuration structure.
 * @since 0.1.0
 * @category genesis
 */
export type ShelleyGenesis = {
  readonly epochLength: number;
  readonly activeSlotsCoeff: number;
  readonly slotLength: number;
  readonly securityParam: number;
  readonly genDelegs: Record<string, unknown>;
  readonly initialFunds: Record<string, number>;
  readonly maxKESEvolutions: number;
  readonly maxLovelaceSupply: number;
  readonly networkId: string;
  readonly networkMagic: number;
  readonly protocolParams: {
    readonly a0: number;
    readonly decentralisationParam: number;
    readonly eMax: number;
    readonly extraEntropy: { readonly tag: string };
    readonly keyDeposit: number;
    readonly maxBlockBodySize: number;
    readonly maxBlockHeaderSize: number;
    readonly maxTxSize: number;
    readonly minFeeA: number;
    readonly minFeeB: number;
    readonly minPoolCost: number;
    readonly minUTxOValue: number;
    readonly nOpt: number;
    readonly poolDeposit: number;
    readonly protocolVersion: {
      readonly major: number;
      readonly minor: number;
    };
    readonly rho: number;
    readonly tau: number;
  };
  readonly slotsPerKESPeriod: number;
  readonly staking: {
    readonly pools: Record<
      string,
      {
        readonly cost: number;
        readonly margin: number;
        readonly metadata: null;
        readonly owners: ReadonlyArray<unknown>;
        readonly pledge: number;
        readonly publicKey: string;
        readonly relays: ReadonlyArray<unknown>;
        readonly rewardAccount: {
          readonly credential: { readonly 'key hash': string };
          readonly network: string;
        };
        readonly vrf: string;
      }
    >;
    readonly stake: Record<string, string>;
  };
  readonly systemStart: string;
  readonly updateQuorum: number;
};

/**
 * Alonzo genesis configuration structure.
 * @since 0.1.0
 * @category genesis
 */
export type AlonzoGenesis = {
  readonly lovelacePerUTxOWord: number;
  readonly executionPrices: {
    readonly prSteps: { readonly numerator: number; readonly denominator: number };
    readonly prMem: { readonly numerator: number; readonly denominator: number };
  };
  readonly maxTxExUnits: {
    readonly exUnitsMem: number;
    readonly exUnitsSteps: number;
  };
  readonly maxBlockExUnits: {
    readonly exUnitsMem: number;
    readonly exUnitsSteps: number;
  };
  readonly maxValueSize: number;
  readonly collateralPercentage: number;
  readonly maxCollateralInputs: number;
  readonly costModels: {
    readonly PlutusV1: ReadonlyArray<number>;
    readonly PlutusV2: ReadonlyArray<number>;
  };
};

/**
 * Conway genesis configuration structure.
 * @since 0.1.0
 * @category genesis
 */
export type ConwayGenesis = {
  readonly poolVotingThresholds: {
    readonly committeeNormal: number;
    readonly committeeNoConfidence: number;
    readonly hardForkInitiation: number;
    readonly motionNoConfidence: number;
    readonly ppSecurityGroup: number;
  };
  readonly dRepVotingThresholds: {
    readonly motionNoConfidence: number;
    readonly committeeNormal: number;
    readonly committeeNoConfidence: number;
    readonly updateToConstitution: number;
    readonly hardForkInitiation: number;
    readonly ppNetworkGroup: number;
    readonly ppEconomicGroup: number;
    readonly ppTechnicalGroup: number;
    readonly ppGovGroup: number;
    readonly treasuryWithdrawal: number;
  };
  readonly committeeMinSize: number;
  readonly committeeMaxTermLength: number;
  readonly govActionLifetime: number;
  readonly govActionDeposit: number;
  readonly dRepDeposit: number;
  readonly dRepActivity: number;
  readonly minFeeRefScriptCostPerByte: number;
  readonly plutusV3CostModel: ReadonlyArray<number>;
  readonly constitution: {
    readonly anchor: { readonly url: string; readonly dataHash: string };
  };
  readonly committee: {
    readonly members: Record<string, unknown>;
    readonly threshold: number;
  };
};

/**
 * Cardano key in JSON envelope format.
 * @since 0.1.0
 * @category genesis
 */
export type CardanoKey = {
  readonly type: string;
  readonly description: string;
  readonly cborHex: string;
};

// ---------------------------------------------------------------------------
// Default Container Images
// ---------------------------------------------------------------------------

/**
 * Default Cardano node Docker image.
 * @since 0.1.0
 * @category constants
 */
export const DEFAULT_CARDANO_NODE_IMAGE =
  'ghcr.io/intersectmbo/cardano-node:10.5.3' as const;

/**
 * Default Hydra node Docker image.
 * @since 0.1.0
 * @category constants
 */
export const DEFAULT_HYDRA_NODE_IMAGE =
  'ghcr.io/cardano-scaling/hydra-node:1.2.0' as const;

// ---------------------------------------------------------------------------
// Default Container Configuration
// ---------------------------------------------------------------------------

/**
 * Default Cardano node container configuration.
 * @since 0.1.0
 * @category constants
 */
export const DEFAULT_CARDANO_NODE_CONFIG: Required<CardanoNodeConfig> = {
  image: DEFAULT_CARDANO_NODE_IMAGE,
  port: 3001,
  submitPort: 8090,
  networkMagic: 42,
} as const;

/**
 * Default Hydra node container configuration.
 * @since 0.1.0
 * @category constants
 */
export const DEFAULT_HYDRA_NODE_CONFIG: Required<HydraNodeConfig> = {
  image: DEFAULT_HYDRA_NODE_IMAGE,
  apiPort: 4001,
  peerPort: 5001,
  monitoringPort: 6001,
  contestationPeriod: 60,
  nodeId: 'devnet-1',
} as const;

/**
 * Default cluster configuration.
 * @since 0.1.0
 * @category constants
 */
export const DEFAULT_DEVNET_CONFIG: ResolvedDevNetConfig = {
  clusterName: 'hydra-devnet',
  cardanoNode: DEFAULT_CARDANO_NODE_CONFIG,
  hydraNode: DEFAULT_HYDRA_NODE_CONFIG,
} as const;

// ---------------------------------------------------------------------------
// Default Cardano Node Configuration (JSON config file)
// ---------------------------------------------------------------------------

/**
 * Default Cardano node JSON configuration.
 * Configured for instant hard forks to Conway era with fast slot times.
 *
 * @since 0.1.0
 * @category constants
 */
export const DEFAULT_NODE_JSON_CONFIG: NodeConfig = {
  Protocol: 'Cardano',
  ByronGenesisFile: 'genesis-byron.json',
  ShelleyGenesisFile: 'genesis-shelley.json',
  AlonzoGenesisFile: 'genesis-alonzo.json',
  ConwayGenesisFile: 'genesis-conway.json',
  ApplicationName: 'cardano-sl',
  ApplicationVersion: 1,
  MaxKnownMajorProtocolVersion: 2,
  'LastKnownBlockVersion-Alt': 0,
  'LastKnownBlockVersion-Major': 6,
  'LastKnownBlockVersion-Minor': 0,
  TestShelleyHardForkAtEpoch: 0,
  TestAllegraHardForkAtEpoch: 0,
  TestMaryHardForkAtEpoch: 0,
  TestAlonzoHardForkAtEpoch: 0,
  TestBabbageHardForkAtEpoch: 0,
  TestConwayHardForkAtEpoch: 0,
  RequiresNetworkMagic: 'RequiresNoMagic',
  minSeverity: 'Info',
  defaultBackends: ['KatipBK'],
  defaultScribes: [['StdoutSK', 'stdout']],
  setupBackends: ['KatipBK'],
  setupScribes: [
    {
      scFormat: 'ScJson',
      scKind: 'StdoutSK',
      scName: 'stdout',
      scRotation: null,
    },
  ],
  TurnOnLogMetrics: true,
  TurnOnLogging: true,
  TracingVerbosity: 'NormalVerbosity',
  TraceBlockFetchClient: false,
  TraceBlockFetchDecisions: false,
  TraceBlockFetchProtocol: false,
  TraceBlockFetchProtocolSerialised: false,
  TraceBlockFetchServer: false,
  TraceChainDb: true,
  TraceChainSyncBlockServer: false,
  TraceChainSyncClient: false,
  TraceChainSyncHeaderServer: false,
  TraceChainSyncProtocol: false,
  TraceDNSResolver: false,
  TraceDNSSubscription: false,
  TraceErrorPolicy: false,
  TraceForge: true,
  TraceHandshake: false,
  TraceIpSubscription: false,
  TraceLocalChainSyncProtocol: true,
  TraceLocalErrorPolicy: false,
  TraceLocalHandshake: false,
  TraceLocalTxSubmissionProtocol: true,
  TraceLocalTxSubmissionServer: true,
  TraceMempool: true,
  TraceMux: false,
  TraceOptions: {},
  TraceTxInbound: false,
  TraceTxOutbound: false,
  TraceTxSubmissionProtocol: false,
  hasEKG: 12788,
  hasPrometheus: ['0.0.0.0', 12798],
  options: {
    mapBackends: {
      'cardano.node.metrics': ['EKGViewBK'],
      'cardano.node.resources': ['EKGViewBK'],
    },
    mapSubtrace: {
      'cardano.node.metrics': { subtrace: 'Neutral' },
    },
  },
  ExperimentalHardForksEnabled: true,
  ExperimentalProtocolsEnabled: true,
} as const;

// ---------------------------------------------------------------------------
// Default Genesis Configurations
// ---------------------------------------------------------------------------

/**
 * Default Byron genesis configuration.
 *
 * @since 0.1.0
 * @category constants
 */
export const DEFAULT_BYRON_GENESIS: ByronGenesis = {
  protocolConsts: {
    k: 2160,
    protocolMagic: 42,
  },
  startTime: Math.floor(Date.now() / 1000),
  blockVersionData: {
    scriptVersion: 0,
    slotDuration: '250',
    maxBlockSize: '2000000',
    maxHeaderSize: '2000000',
    maxTxSize: '4096',
    maxProposalSize: '700',
    mpcThd: '20000000000000',
    heavyDelThd: '300000000000',
    updateVoteThd: '1000000000000',
    updateProposalThd: '100000000000000',
    updateImplicit: '10000',
    softforkRule: {
      initThd: '900000000000000',
      minThd: '600000000000000',
      thdDecrement: '50000000000000',
    },
    txFeePolicy: {
      summand: '155381000000000',
      multiplier: '43000000000',
    },
    unlockStakeEpoch: '18446744073709551615',
  },
  bootStakeholders: {
    '7a4519c93d7be4577dd85bd524c644e6b809e44eae0457b43128c1c7': 1,
  },
  heavyDelegation: {},
  nonAvvmBalances: {},
  avvmDistr: {},
};

/**
 * Default Shelley genesis configuration.
 * The `initialFunds` will be populated dynamically with a generated payment address.
 *
 * @since 0.1.0
 * @category constants
 */
export const DEFAULT_SHELLEY_GENESIS: ShelleyGenesis = {
  epochLength: 5,
  activeSlotsCoeff: 1.0,
  slotLength: 0.1,
  securityParam: 2160,
  genDelegs: {},
  initialFunds: {},
  maxKESEvolutions: 60,
  maxLovelaceSupply: 2000000000000,
  networkId: 'Testnet',
  networkMagic: 42,
  protocolParams: {
    a0: 0.0,
    decentralisationParam: 0,
    eMax: 18,
    extraEntropy: { tag: 'NeutralNonce' },
    keyDeposit: 0,
    maxBlockBodySize: 65536,
    maxBlockHeaderSize: 1100,
    maxTxSize: 16384,
    minFeeA: 44,
    minFeeB: 155381,
    minPoolCost: 0,
    minUTxOValue: 0,
    nOpt: 100,
    poolDeposit: 0,
    protocolVersion: { major: 9, minor: 0 },
    rho: 0.1,
    tau: 0.1,
  },
  slotsPerKESPeriod: 129600,
  staking: {
    pools: {
      '8a219b698d3b6e034391ae84cee62f1d76b6fbc45ddfe4e31e0d4b60': {
        cost: 0,
        margin: 0.0,
        metadata: null,
        owners: [],
        pledge: 0,
        publicKey:
          '8a219b698d3b6e034391ae84cee62f1d76b6fbc45ddfe4e31e0d4b60',
        relays: [],
        rewardAccount: {
          credential: {
            'key hash':
              'b6ffb20cf821f9286802235841d4348a2c2bafd4f73092b7de6655ea',
          },
          network: 'Testnet',
        },
        vrf: 'fec17ed60cbf2ec5be3f061fb4de0b6ef1f20947cfbfce5fb2783d12f3f69ff5',
      },
    },
    stake: {
      '074a515f7f32bf31a4f41c7417a8136e8152bfb42f06d71b389a6896':
        '8a219b698d3b6e034391ae84cee62f1d76b6fbc45ddfe4e31e0d4b60',
    },
  },
  systemStart: new Date().toISOString(),
  updateQuorum: 2,
};

/**
 * Default Alonzo genesis configuration.
 * Contains Plutus cost models and execution parameters.
 *
 * @since 0.1.0
 * @category constants
 */
export const DEFAULT_ALONZO_GENESIS: AlonzoGenesis = {
  lovelacePerUTxOWord: 34482,
  executionPrices: {
    prSteps: { numerator: 721, denominator: 10000000 },
    prMem: { numerator: 577, denominator: 10000 },
  },
  maxTxExUnits: { exUnitsMem: 10000000, exUnitsSteps: 10000000000 },
  maxBlockExUnits: { exUnitsMem: 50000000, exUnitsSteps: 40000000000 },
  maxValueSize: 5000,
  collateralPercentage: 150,
  maxCollateralInputs: 3,
  costModels: {
    PlutusV1: [
      100788, 420, 1, 1, 1000, 173, 0, 1, 1000, 59957, 4, 1, 11183, 32,
      201305, 8356, 4, 16000, 100, 16000, 100, 16000, 100, 16000, 100, 16000,
      100, 16000, 100, 100, 100, 16000, 100, 94375, 32, 132994, 32, 61462, 4,
      72010, 178, 0, 1, 22151, 32, 91189, 769, 4, 2, 85848, 228465, 122, 0, 1,
      1, 1000, 42921, 4, 2, 24548, 29498, 38, 1, 898148, 27279, 1, 51775, 558,
      1, 39184, 1000, 60594, 1, 141895, 32, 83150, 32, 15299, 32, 76049, 1,
      13169, 4, 22100, 10, 28999, 74, 1, 28999, 74, 1, 43285, 552, 1, 44749,
      541, 1, 33852, 32, 68246, 32, 72362, 32, 7243, 32, 7391, 32, 11546, 32,
      85848, 228465, 122, 0, 1, 1, 90434, 519, 0, 1, 74433, 32, 85848, 228465,
      122, 0, 1, 1, 85848, 228465, 122, 0, 1, 1, 270652, 22588, 4, 1457325,
      64566, 4, 20467, 1, 4, 0, 141992, 32, 100788, 420, 1, 1, 81663, 32,
      59498, 32, 20142, 32, 24588, 32, 20744, 32, 25933, 32, 24623, 32,
      53384111, 14333, 10,
    ],
    PlutusV2: [
      100788, 420, 1, 1, 1000, 173, 0, 1, 1000, 59957, 4, 1, 11183, 32,
      201305, 8356, 4, 16000, 100, 16000, 100, 16000, 100, 16000, 100, 16000,
      100, 16000, 100, 100, 100, 16000, 100, 94375, 32, 132994, 32, 61462, 4,
      72010, 178, 0, 1, 22151, 32, 91189, 769, 4, 2, 85848, 228465, 122, 0, 1,
      1, 1000, 42921, 4, 2, 24548, 29498, 38, 1, 898148, 27279, 1, 51775, 558,
      1, 39184, 1000, 60594, 1, 141895, 32, 83150, 32, 15299, 32, 76049, 1,
      13169, 4, 22100, 10, 28999, 74, 1, 28999, 74, 1, 43285, 552, 1, 44749,
      541, 1, 33852, 32, 68246, 32, 72362, 32, 7243, 32, 7391, 32, 11546, 32,
      85848, 228465, 122, 0, 1, 1, 90434, 519, 0, 1, 74433, 32, 85848, 228465,
      122, 0, 1, 1, 85848, 228465, 122, 0, 1, 1, 955506, 213312, 0, 2, 270652,
      22588, 4, 1457325, 64566, 4, 20467, 1, 4, 0, 141992, 32, 100788, 420, 1,
      1, 81663, 32, 59498, 32, 20142, 32, 24588, 32, 20744, 32, 25933, 32,
      24623, 32, 43053543, 10, 53384111, 14333, 10, 43574283, 26308, 10,
    ],
  },
};

/**
 * Default Conway genesis configuration.
 * Contains governance parameters and Plutus V3 cost models.
 *
 * @since 0.1.0
 * @category constants
 */
export const DEFAULT_CONWAY_GENESIS: ConwayGenesis = {
  poolVotingThresholds: {
    committeeNormal: 0.6,
    committeeNoConfidence: 0.51,
    hardForkInitiation: 0.51,
    motionNoConfidence: 0.6,
    ppSecurityGroup: 0.6,
  },
  dRepVotingThresholds: {
    motionNoConfidence: 0.67,
    committeeNormal: 0.67,
    committeeNoConfidence: 0.6,
    updateToConstitution: 0.75,
    hardForkInitiation: 0.6,
    ppNetworkGroup: 0.67,
    ppEconomicGroup: 0.67,
    ppTechnicalGroup: 0.67,
    ppGovGroup: 0.75,
    treasuryWithdrawal: 0.67,
  },
  committeeMinSize: 0,
  committeeMaxTermLength: 73,
  govActionLifetime: 8,
  govActionDeposit: 50000000000,
  dRepDeposit: 500000000,
  dRepActivity: 20,
  minFeeRefScriptCostPerByte: 15,
  plutusV3CostModel: [
    100788, 420, 1, 1, 1000, 173, 0, 1, 1000, 59957, 4, 1, 11183, 32, 201305,
    8356, 4, 16000, 100, 16000, 100, 16000, 100, 16000, 100, 16000, 100, 16000,
    100, 100, 100, 16000, 100, 94375, 32, 132994, 32, 61462, 4, 72010, 178, 0,
    1, 22151, 32, 91189, 769, 4, 2, 85848, 123203, 7305, -900, 1716, 549, 57,
    85848, 0, 1, 1, 1000, 42921, 4, 2, 24548, 29498, 38, 1, 898148, 27279, 1,
    51775, 558, 1, 39184, 1000, 60594, 1, 141895, 32, 83150, 32, 15299, 32,
    76049, 1, 13169, 4, 22100, 10, 28999, 74, 1, 28999, 74, 1, 43285, 552, 1,
    44749, 541, 1, 33852, 32, 68246, 32, 72362, 32, 7243, 32, 7391, 32, 11546,
    32, 85848, 123203, 7305, -900, 1716, 549, 57, 85848, 0, 1, 90434, 519, 0,
    1, 74433, 32, 85848, 123203, 7305, -900, 1716, 549, 57, 85848, 0, 1, 1,
    85848, 123203, 7305, -900, 1716, 549, 57, 85848, 0, 1, 955506, 213312, 0,
    2, 270652, 22588, 4, 1457325, 64566, 4, 20467, 1, 4, 0, 141992, 32, 100788,
    420, 1, 1, 81663, 32, 59498, 32, 20142, 32, 24588, 32, 20744, 32, 25933,
    32, 24623, 32, 43053543, 10, 53384111, 14333, 10, 43574283, 26308, 10,
    16000, 100, 16000, 100, 962335, 18, 2780678, 6, 442008, 1, 52538055, 3756,
    18, 267929, 18, 76433006, 8868, 18, 52948122, 18, 1995836, 36, 3227919, 12,
    901022, 1, 166917843, 4307, 36, 284546, 36, 158221314, 26549, 36, 74698472,
    36, 333849714, 1, 254006273, 72, 2174038, 72, 2261318, 64571, 4, 207616,
    8310, 4, 1293828, 28716, 63, 0, 1, 1006041, 43623, 251, 0, 1,
  ],
  constitution: {
    anchor: {
      url: '',
      dataHash:
        '0000000000000000000000000000000000000000000000000000000000000000',
    },
  },
  committee: {
    members: {},
    threshold: 0.66,
  },
};

// ---------------------------------------------------------------------------
// Default Cryptographic Keys (for block production)
// ---------------------------------------------------------------------------

/**
 * Default KES signing key for the devnet block producer.
 * DO NOT use in production — test-only.
 *
 * @since 0.1.0
 * @category constants
 */
export const DEFAULT_KES_KEY: CardanoKey = {
  type: 'KesSigningKey_ed25519_kes_2^6',
  description: 'KES Signing Key',
  cborHex:
    '590260a199f16b11da6c7f5c1e0f1eb0b9bbe278d3d8f35bfd50d0951c2ff94d0344cd57df5f64c9bac1dd60b4482f9c636168f40737d526625a2ec82f22ec0c72de0013f86ef743a7bba0286db6ddf3d85bf8e49ddbf14d9d3b7ee22f4857c77b740948f84f2e72f6bcf91f405e34ea50a2c53fa4876b43cfce2bcfe87c06a903de8bb33d968ca7930b67d0c23f5cb2d74e422d773ba80e388de384691000d6ba8a9b4dc7d3187f76048fbef9a52b72d80d835bb76eced7c0e0cdc5b58869b73c095dffa01db4ff51765afcead565395a5ed1cf74e5f2134d61076fece21aacd080bbbfaab94125401d7bbc74eafc7e7e3a2235f59dc03d6e332e53d558493a1e22213b92c77b1328ff1b83855da704fc366bf4415490602481d1939136eeaf252c65184912a779d9d94a90e32b72c1877ef60b6d79e707ce5a762acb4bed46436efe4fe62aae50b39068cc508a09427c92791cbcbea44318529cc68d297ca24e1b73b2394c385ec63fcd85ed56eec3de48860a1ec950aad4f91cbf741dbd7bf1d3c278875bd20e31ff5372339f6aa5280ad9b8bf3514889ac44600fe57ca0b535d6dc6b0b981e079595aad186ee0be9b07e837391ab165e4ca406601c876a86e246a3f53311e21199cccc0b080f28d18f4dc6987731e10e4ade00df7c6921c5ef3022b6f49a29ba307a2c8f4bd2ba42fcfa0aad68a2f0ad31fff69a99d3471f9036d3f5817a3edfeff7fc3c14e1151d767aaa043481cfd1a6ee55e8e5d7853ecdaf9da2bb36c716beae8d706bc648a790d4697e1d044a11a49f305ab8bc64a094bd81bda7395fe6f77dd5557c39919dd9bb9cf22a87fe47408ae3ec2247007d015a5',
};

/**
 * Default operational certificate for the devnet block producer.
 * DO NOT use in production — test-only.
 *
 * @since 0.1.0
 * @category constants
 */
export const DEFAULT_OPCERT: CardanoKey = {
  type: 'NodeOperationalCertificate',
  description: '',
  cborHex:
    '828458204cd49bb05e9885142fe7af1481107995298771fd1a24e72b506a4d600ee2b3120000584089fc9e9f551b2ea873bf31643659d049152d5c8e8de86be4056370bccc5fa62dd12e3f152f1664e614763e46eaa7a17ed366b5cef19958773d1ab96941442e0b58205a3d778e76741a009e29d23093cfe046131808d34d7c864967b515e98dfc3583',
};

/**
 * Default VRF signing key for the devnet block producer.
 * DO NOT use in production — test-only.
 *
 * @since 0.1.0
 * @category constants
 */
export const DEFAULT_VRF_SKEY: CardanoKey = {
  type: 'VrfSigningKey_PraosVRF',
  description: 'VRF Signing Key',
  cborHex:
    '5840899795b70e9f34b737159fe21a6170568d6031e187f0cc84555c712b7c29b45cb882007593ef70f86e5c0948561a3b8e8851529a4f98975f2b24e768dda38ce2',
};

// ---------------------------------------------------------------------------
// Default Byron Delegation Credentials (pre-generated, test-only)
// ---------------------------------------------------------------------------

/**
 * Byron delegation certificate linking the genesis issuer key to the delegate key.
 * Required by cardano-node for block production through instant hard-fork chain.
 * DO NOT use in production — test-only.
 *
 * @since 0.1.0
 * @category constants
 */
export const DEFAULT_BYRON_DELEGATION_CERT = {
  omega: 0,
  issuerPk:
    'NclXQiNNEpaaLdSxP3VFeOPIfSuFqBcNtmv8/7fftBKtgW1Aig7UqHJ/czsywkWFFVmBYPRnGjXspUl3wEMvuQ==',
  delegatePk:
    '24ejRK+kCDs1g4f3PcodFEUFVgNFWtfmuoEtVQf8/Ii2j2ruXHebJmZZPrwtAdbJYwDiSEvsHr95+BAF1ifGsA==',
  cert: '498c72e35ef30cd4657b48bfcc0a84a555a67981e3b6104a0d1708ab84510367d81e1ba3f47619565b1ee1098e31dcb8eb648d8030e061b568de113fdf3d6a09',
} as const;

/**
 * Byron delegate signing key (binary CBOR, base64-encoded).
 * Matched pair with the delegation certificate above.
 * DO NOT use in production — test-only.
 *
 * @since 0.1.0
 * @category constants
 */
export const DEFAULT_BYRON_DELEGATE_KEY_BASE64 =
  'WIBIEAVE04iVnDoP4MfUG2WL0U5Ez9vCjpBCis6OwrFxVeJt/oNoafFh8xBqFTIppaG0Jm2XlHK4ofM/KzLVqYLM24ejRK+kCDs1g4f3PcodFEUFVgNFWtfmuoEtVQf8/Ii2j2ruXHebJmZZPrwtAdbJYwDiSEvsHr95+BAF1ifGsA==' as const;

// ---------------------------------------------------------------------------
// Default Payment Keys (pre-generated, test-only)
// ---------------------------------------------------------------------------

/**
 * Default Cardano payment signing key for the devnet.
 * Pre-generated using `cardano-cli latest address key-gen`.
 * DO NOT use in production — test-only.
 *
 * @since 0.1.0
 * @category constants
 */
export const DEFAULT_PAYMENT_SKEY: CardanoKey = {
  type: 'PaymentSigningKeyShelley_ed25519',
  description: 'Payment Signing Key',
  cborHex:
    '5820357afa630999fddc45c61b39de6cfb6477874f398d43427e8fda8ce29aef3f01',
};

/**
 * Default Cardano payment verification key for the devnet.
 * Pre-generated using `cardano-cli latest address key-gen`.
 * DO NOT use in production — test-only.
 *
 * @since 0.1.0
 * @category constants
 */
export const DEFAULT_PAYMENT_VKEY: CardanoKey = {
  type: 'PaymentVerificationKeyShelley_ed25519',
  description: 'Payment Verification Key',
  cborHex:
    '582015477d62d55fd21e4fbae9aaa1bace69075c2dec346ef62ca9b717a46fad46fa',
};

/**
 * 28-byte blake2b-224 hash of the default payment verification key.
 *
 * @since 0.1.0
 * @category constants
 */
export const DEFAULT_PAYMENT_KEY_HASH =
  '616e6a8e36fb2cc4560a11ccd9bd3e70d20db58fc8d22d2560574087' as const;

/**
 * Enterprise testnet address derived from the default payment key.
 * Format: `0x60` (enterprise testnet prefix) + key_hash.
 *
 * @since 0.1.0
 * @category constants
 */
export const DEFAULT_PAYMENT_ADDRESS_HEX =
  '60616e6a8e36fb2cc4560a11ccd9bd3e70d20db58fc8d22d2560574087' as const;

// ---------------------------------------------------------------------------
// Default Hydra Keys (pre-generated, test-only)
// ---------------------------------------------------------------------------

/**
 * Hydra key JSON envelope type.
 * @since 0.1.0
 * @category genesis
 */
export type HydraKey = {
  readonly type: string;
  readonly description: string;
  readonly cborHex: string;
};

/**
 * Default Hydra signing key for the devnet.
 * Pre-generated using `hydra-node gen-hydra-key`.
 * DO NOT use in production — test-only.
 *
 * @since 0.1.0
 * @category constants
 */
export const DEFAULT_HYDRA_SK: HydraKey = {
  type: 'HydraSigningKey_ed25519',
  description: '',
  cborHex:
    '5820956aa2b35a8a83a4aae551d8b8ec03dc0f049313ad3e78c414563b330e0e4295',
};

/**
 * Default Hydra verification key for the devnet.
 * Pre-generated using `hydra-node gen-hydra-key`.
 * DO NOT use in production — test-only.
 *
 * @since 0.1.0
 * @category constants
 */
export const DEFAULT_HYDRA_VK: HydraKey = {
  type: 'HydraVerificationKey_ed25519',
  description: '',
  cborHex:
    '58209314edba432861d5fa4204b3800cc4b8603f6b3f258c9fce8482b72e91889ee2',
};

// ---------------------------------------------------------------------------
// Initial Fund Amount
// ---------------------------------------------------------------------------

/**
 * Default initial fund amount per wallet in lovelace (900 billion = 900,000 ADA).
 *
 * @since 0.1.0
 * @category constants
 */
export const DEFAULT_INITIAL_FUNDS_LOVELACE = 900_000_000_000 as const;

// ---------------------------------------------------------------------------
// Utility Functions
// ---------------------------------------------------------------------------

/**
 * Build a Shelley genesis config with a funded payment address.
 *
 * @param addressHex - Hex-encoded enterprise address (e.g. "60" + key_hash)
 * @param lovelace - Amount to fund in lovelace
 * @param overrides - Optional Shelley genesis overrides
 * @returns Complete Shelley genesis configuration
 *
 * @since 0.1.0
 * @category utilities
 */
export function buildShelleyGenesis(
  addressHex: string,
  lovelace: number = DEFAULT_INITIAL_FUNDS_LOVELACE,
  overrides: Partial<ShelleyGenesis> = {},
  nowSeconds?: number,
): ShelleyGenesis {
  // Use provided timestamp or compute one, truncated to whole seconds.
  // Format matches `date -u +%FT%TZ` used by the official hydra demo.
  const epochSec = nowSeconds ?? Math.floor(Date.now() / 1000);
  return {
    ...DEFAULT_SHELLEY_GENESIS,
    ...overrides,
    initialFunds: {
      [addressHex]: lovelace,
    },
    systemStart: new Date(epochSec * 1000)
      .toISOString()
      .replace(/\.\d{3}Z$/, 'Z'),
  };
}

/**
 * Build a Byron genesis config with current timestamp.
 *
 * @since 0.1.0
 * @category utilities
 */
export function buildByronGenesis(nowSeconds?: number): ByronGenesis {
  return {
    ...DEFAULT_BYRON_GENESIS,
    startTime: nowSeconds ?? Math.floor(Date.now() / 1000),
  };
}
