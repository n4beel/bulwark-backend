import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import { PublicKey, Connection, Keypair } from '@solana/web3.js';
import {
    awaitComputationFinalization,
    getCompDefAccOffset,
    getArciumAccountBaseSeed,
    getArciumProgAddress,
    RescueCipher,
    deserializeLE,
    getMXEPublicKey,
    getMXEAccAddress,
    getMempoolAccAddress,
    getComputationAccAddress,
    getExecutingPoolAccAddress,
    getCompDefAccAddress,
    getClusterAccAddress,
    buildFinalizeCompDefTx,
    x25519,
} from '@arcium-hq/client';
import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Program ID from deployment
const PROGRAM_ID = '25kmZvexST8MZ1pbUbHECzapos78v2SMmySnxsSYr3vE';
const CLUSTER_OFFSET = 1078779259; // Devnet cluster offset

// IDL type definition (simplified - you may need to copy the full IDL)
interface BulwarkStorage {
    address: string;
    instructions: any[];
}

export interface AuditStorageData {
    auditEffort: {
        timeRange: {
            minimumDays: number;
            maximumDays: number;
        };
        resourceRange: {
            minimumCount: number;
            maximumCount: number;
        };
        totalCost: number;
    };
    hotspots: {
        totalCount: number;
        highRiskCount: number;
        mediumRiskCount: number;
    };
    commitHash: string; // Hex-encoded 64-character string
}

export interface StorageResult {
    success: boolean;
    id?: number;
    message: string;
}

@Injectable()
export class ArciumStorageService implements OnModuleInit {
    private readonly logger = new Logger(ArciumStorageService.name);
    private program: Program<anchor.Idl> | null = null;
    private originalIdl: anchor.Idl | null = null; // Store original IDL for manual encoding
    private provider: anchor.AnchorProvider | null = null;
    private owner: Keypair | null = null;
    private mxePublicKey: Uint8Array | null = null;
    private connection: Connection | null = null;
    private isEnabled: boolean = false;

    constructor(private configService: ConfigService) {
        try {
            // Initialize Solana connection
            const rpcUrl =
                this.configService.get<string>('SOLANA_RPC_URL') ||
                'https://api.devnet.solana.com';
            this.connection = new Connection(rpcUrl, 'confirmed');

            // Load owner keypair from environment
            const privateKeyPath =
                this.configService.get<string>('SOLANA_KEYPAIR_PATH') ||
                `${os.homedir()}/.config/solana/id.json`;

            try {
                const keypairData = fs.readFileSync(privateKeyPath);
                this.owner = Keypair.fromSecretKey(
                    new Uint8Array(JSON.parse(keypairData.toString())),
                );
            } catch (error) {
                // Try reading from SOLANA_PRIVATE_KEY env var as JSON array
                const privateKeyEnv = this.configService.get<string>('SOLANA_PRIVATE_KEY');
                if (privateKeyEnv) {
                    try {
                        const keyArray = JSON.parse(privateKeyEnv);
                        this.owner = Keypair.fromSecretKey(new Uint8Array(keyArray));
                    } catch (parseError) {
                        this.logger.warn(
                            'Failed to parse SOLANA_PRIVATE_KEY. Arcium Storage Service will be disabled.',
                        );
                        this.logger.warn(
                            'To enable Arcium Storage, provide either SOLANA_KEYPAIR_PATH or SOLANA_PRIVATE_KEY as JSON array.',
                        );
                        return; // Service disabled, but don't crash
                    }
                } else {
                    this.logger.warn(
                        'No Solana keypair found. Arcium Storage Service will be disabled.',
                    );
                    this.logger.warn(
                        'To enable Arcium Storage, set SOLANA_KEYPAIR_PATH or SOLANA_PRIVATE_KEY.',
                    );
                    return; // Service disabled, but don't crash
                }
            }

            // Initialize Anchor provider
            if (!this.owner) {
                return; // Should not happen, but safety check
            }

            const wallet = new anchor.Wallet(this.owner);
            this.provider = new anchor.AnchorProvider(
                this.connection,
                wallet,
                {
                    commitment: 'confirmed',
                },
            );

            // Load IDL - try multiple possible paths
            const possiblePaths = [
                this.configService.get<string>('ARCIUM_IDL_PATH'), // Custom path from env
                path.resolve(process.cwd(), 'idl.json'), // IDL in server root (from Solscan)
                path.resolve(process.cwd(), '../../bulwark_storage/target/idl/bulwark_storage.json'), // Relative from server dir
                path.resolve(process.cwd(), '../bulwark_storage/target/idl/bulwark_storage.json'), // Alternative relative
                '/home/n4beel/Desktop/Projects/MySecurity/bulwark_storage/target/idl/bulwark_storage.json', // Absolute fallback
            ].filter(Boolean) as string[];

            let idl: anchor.Idl | null = null;
            let idlPath: string | null = null;
            let lastError: Error | null = null;

            for (const tryPath of possiblePaths) {
                try {
                    const idlContent = fs.readFileSync(tryPath, 'utf-8');
                    idl = JSON.parse(idlContent) as anchor.Idl;

                    // Anchor requires accounts to have type definitions with size information
                    // Since we only use instruction methods and don't fetch accounts,
                    // we can safely remove accounts to avoid AccountClient initialization errors
                    if (idl.accounts && Array.isArray(idl.accounts)) {
                        // Remove accounts entirely - Anchor will try to build AccountClient for each account
                        // and will fail if they don't have proper type definitions with size
                        idl.accounts = [];
                    }

                    // Ensure types array is preserved (needed for argument encoding)
                    if (!idl.types || !Array.isArray(idl.types)) {
                        throw new Error('IDL missing types array');
                    }

                    // Ensure IDL has all required fields for Anchor
                    if (!idl.instructions || !Array.isArray(idl.instructions)) {
                        throw new Error('IDL missing instructions array');
                    }

                    idlPath = tryPath;
                    this.logger.log(`IDL loaded successfully from ${idlPath}`);
                    this.logger.debug(`IDL has ${idl.instructions?.length || 0} instructions`);
                    break;
                } catch (error) {
                    lastError = error as Error;
                    continue;
                }
            }

            if (!idlPath || !idl) {
                this.logger.warn(
                    `Could not load IDL from any of the attempted paths: ${possiblePaths.join(', ')}`,
                );
                if (lastError) {
                    this.logger.warn(`Last error: ${lastError.message}`);
                }
                this.logger.warn(
                    'Falling back to minimal IDL structure. Program methods will not be available.',
                );
                // Fallback: create a minimal IDL structure
                idl = {
                    version: '0.1.0',
                    name: 'bulwark_storage',
                    address: PROGRAM_ID,
                    metadata: {
                        name: 'bulwark_storage',
                        version: '0.1.0',
                        spec: '0.1.0',
                    },
                    instructions: [],
                    accounts: [],
                    types: [],
                    events: [],
                    errors: [],
                } as anchor.Idl;
            }

            // Initialize program
            const programId = new PublicKey(PROGRAM_ID);

            // Use IDL as-is without modification - Anchor-generated IDL should work directly
            if (!idl) {
                this.logger.warn('IDL not loaded. Arcium Storage Service will be disabled.');
                return;
            }

            this.logger.debug(`Initializing Program with IDL: ${(idl as any).name}, instructions: ${idl.instructions?.length || 0}`);
            this.logger.debug(`IDL address: ${(idl as any).address}`);

            // @ts-ignore - Program constructor accepts (idl, programId, provider)
            this.program = new Program(idl, programId, this.provider) as Program<anchor.Idl>;

            // Store original IDL for manual instruction encoding
            this.originalIdl = idl;

            // Mark service as enabled if we got this far
            this.isEnabled = true;
            this.logger.log(`Arcium Storage Service initialized with program ID: ${PROGRAM_ID}`);
        } catch (error: any) {
            this.logger.warn(
                `Failed to initialize Arcium Storage Service: ${error.message}. Service will be disabled.`,
            );
            this.logger.warn(
                'To enable Arcium Storage, ensure SOLANA_KEYPAIR_PATH or SOLANA_PRIVATE_KEY is configured.',
            );
            // Service disabled, but don't crash - server can still start
        }
    }

    async onModuleInit() {
        if (!this.isEnabled) {
            this.logger.debug('Arcium Storage Service is disabled, skipping MXE public key fetch');
            return;
        }

        // Fetch MXE public key on initialization
        try {
            await this.fetchMXEPublicKey();
            this.logger.log('MXE public key fetched successfully');
        } catch (error: any) {
            this.logger.warn(
                `Failed to fetch MXE public key on init: ${error.message}. Will retry on first use.`,
            );
        }
    }

    /**
     * Fetch MXE public key with retry logic
     */
    private async fetchMXEPublicKey(maxRetries: number = 5): Promise<void> {
        if (!this.isEnabled || !this.program || !this.provider) {
            throw new Error('Arcium Storage Service is not enabled');
        }

        const programId = this.program.programId;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const mxePublicKey = await getMXEPublicKey(this.provider, programId);
                if (mxePublicKey) {
                    this.mxePublicKey = mxePublicKey;
                    return;
                }
            } catch (error) {
                this.logger.debug(
                    `Attempt ${attempt}/${maxRetries} failed to fetch MXE public key: ${error.message}`,
                );
            }

            if (attempt < maxRetries) {
                await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
            }
        }

        throw new Error(
            `Failed to fetch MXE public key after ${maxRetries} attempts`,
        );
    }

    /**
     * Ensure MXE public key is available
     */
    private async ensureMXEPublicKey(): Promise<void> {
        if (!this.isEnabled) {
            throw new Error('Arcium Storage Service is not enabled');
        }

        if (!this.mxePublicKey) {
            await this.fetchMXEPublicKey();
        }
    }

    /**
     * Check if computation definition account exists, and initialize it if needed
     */
    private async ensureCompDefAccount(): Promise<void> {
        if (!this.isEnabled || !this.program || !this.provider) {
            throw new Error('Arcium Storage Service is not enabled');
        }

        const offset = getCompDefAccOffset('store_audit_results');
        const compDefAccount = getCompDefAccAddress(
            this.program.programId,
            Buffer.from(offset).readUInt32LE(),
        );

        // Check if account exists
        const accountInfo = await this.provider.connection.getAccountInfo(compDefAccount);

        if (!accountInfo) {
            this.logger.log('Computation definition account does not exist, initializing...');
            await this.initCompDefAccount();
        } else {
            this.logger.debug('Computation definition account already exists');
        }
    }

    /**
     * Initialize the computation definition account
     */
    private async initCompDefAccount(): Promise<void> {
        if (!this.isEnabled || !this.program || !this.provider || !this.owner) {
            throw new Error('Arcium Storage Service is not enabled');
        }

        try {
            const baseSeedCompDefAcc = getArciumAccountBaseSeed('ComputationDefinitionAccount');
            const offset = getCompDefAccOffset('store_audit_results');

            const compDefPDA = PublicKey.findProgramAddressSync(
                [baseSeedCompDefAcc, this.program.programId.toBuffer(), offset],
                getArciumProgAddress(),
            )[0];

            this.logger.log(`Initializing computation definition account: ${compDefPDA.toString()}`);

            const initSig = await (this.program.methods as any)
                .initAuditStorageCompDefs()
                .accounts({
                    compDefAccount: compDefPDA,
                    payer: this.owner.publicKey,
                    mxeAccount: getMXEAccAddress(this.program.programId),
                })
                .signers([this.owner])
                .rpc({
                    commitment: 'confirmed',
                });

            this.logger.log(`Computation definition initialized: ${initSig}`);

            // Finalize the computation definition (required for Arcium)
            // This tells Arcium to use the circuit from the build directory
            try {
                const finalizeTx = await buildFinalizeCompDefTx(
                    this.provider,
                    Buffer.from(offset).readUInt32LE(),
                    this.program.programId,
                );

                const latestBlockhash = await this.provider.connection.getLatestBlockhash();
                finalizeTx.recentBlockhash = latestBlockhash.blockhash;
                finalizeTx.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;
                finalizeTx.sign(this.owner);

                const finalizeSig = await this.provider.sendAndConfirm(finalizeTx);
                this.logger.log(`Computation definition finalized: ${finalizeSig}`);
            } catch (finalizeError: any) {
                this.logger.warn(`Failed to finalize computation definition (may already be finalized): ${finalizeError.message}`);
                // Continue anyway - it might already be finalized
            }
        } catch (error: any) {
            this.logger.error(`Failed to initialize computation definition: ${error.message}`);
            throw error;
        }
    }

    /**
     * Encrypt data using x25519 and RescueCipher
     */
    private encryptData(data: bigint[]): {
        ciphertext: bigint[];
        publicKey: Uint8Array;
        nonce: Uint8Array;
    } {
        if (!this.isEnabled) {
            throw new Error('Arcium Storage Service is not enabled');
        }

        if (!this.mxePublicKey) {
            throw new Error('MXE public key not available');
        }

        const privateKey = x25519.utils.randomSecretKey();
        const publicKey = x25519.getPublicKey(privateKey);
        const sharedSecret = x25519.getSharedSecret(privateKey, this.mxePublicKey);
        const cipher = new RescueCipher(sharedSecret);

        const nonce = randomBytes(16);
        const ciphertextResult = cipher.encrypt(data, nonce);
        // cipher.encrypt returns [bigint[], bigint[]] - we need the first element
        // The result is an array where each element is a bigint representing encrypted data
        const ciphertext: bigint[] = (ciphertextResult[0] as unknown) as bigint[];

        return {
            ciphertext,
            publicKey,
            nonce,
        };
    }

    /**
     * Convert audit storage data to encrypted format for Arcium
     */
    private serializeAuditData(data: AuditStorageData): bigint[] {
        // Convert commit hash from hex string to bytes
        const commitHashBytes = Buffer.from(data.commitHash, 'hex');
        if (commitHashBytes.length !== 32) {
            throw new Error('Commit hash must be 32 bytes (64 hex characters)');
        }

        // Serialize the data structure
        // Format: [commit_hash (32 bytes), min_days (4 bytes), max_days (4 bytes), min_resources (4 bytes), max_resources (4 bytes), total_cost (8 bytes), total_hotspots (4 bytes), high_risk (4 bytes), medium_risk (4 bytes)]
        const result: bigint[] = [];

        // Commit hash (32 bytes)
        for (let i = 0; i < 32; i++) {
            result.push(BigInt(commitHashBytes[i]));
        }

        // Time range (2 u32 values = 8 bytes)
        result.push(BigInt(data.auditEffort.timeRange.minimumDays));
        result.push(BigInt(data.auditEffort.timeRange.maximumDays));

        // Resource range (2 u32 values = 8 bytes)
        result.push(BigInt(data.auditEffort.resourceRange.minimumCount));
        result.push(BigInt(data.auditEffort.resourceRange.maximumCount));

        // Total cost (u64 = 8 bytes)
        result.push(BigInt(data.auditEffort.totalCost));

        // Hotspots (3 u32 values = 12 bytes)
        result.push(BigInt(data.hotspots.totalCount));
        result.push(BigInt(data.hotspots.highRiskCount));
        result.push(BigInt(data.hotspots.mediumRiskCount));

        return result;
    }

    /**
     * Store audit analysis results to Arcium
     */
    async storeAuditResults(
        data: AuditStorageData,
    ): Promise<StorageResult> {
        if (!this.isEnabled) {
            this.logger.warn('Arcium Storage Service is disabled. Cannot store audit results.');
            return {
                success: false,
                message: 'Arcium Storage Service is not configured. Please set SOLANA_KEYPAIR_PATH or SOLANA_PRIVATE_KEY.',
            };
        }

        if (!this.program || !this.provider || !this.owner) {
            this.logger.warn('Arcium Storage Service is not properly initialized.');
            return {
                success: false,
                message: 'Arcium Storage Service is not properly initialized.',
            };
        }

        try {
            await this.ensureMXEPublicKey();
            await this.ensureCompDefAccount(); // Ensure computation definition is initialized

            // Serialize and encrypt the data
            const serializedData = this.serializeAuditData(data);
            const { ciphertext, publicKey, nonce } = this.encryptData(serializedData);

            // Generate computation offset
            const computationOffset = new anchor.BN(randomBytes(8), 'hex');

            // Get account addresses
            const computationAccount = getComputationAccAddress(
                this.program.programId,
                computationOffset,
            );
            const mxeAccount = getMXEAccAddress(this.program.programId);
            const mempoolAccount = getMempoolAccAddress(this.program.programId);
            const executingPool = getExecutingPoolAccAddress(this.program.programId);
            const compDefAccount = getCompDefAccAddress(
                this.program.programId,
                Buffer.from(getCompDefAccOffset('store_audit_results')).readUInt32LE(),
            );

            this.logger.log(
                `Storing audit results for commit ${data.commitHash}...`,
            );
            this.logger.debug(`Ciphertext length: ${ciphertext.length}, PublicKey length: ${publicKey.length}, Nonce length: ${nonce.length}`);

            // Convert ciphertext from bigint[] to number[] (u8 array)
            // The IDL expects exactly 32 bytes (array: ["u8", 32])
            // cipher.encrypt returns [bigint[], bigint[]], so we use ciphertext[0] which is already extracted
            // According to test file, we should use Array.from() directly
            // Convert each bigint to a u8 (0-255) value
            const ciphertextU8: number[] = Array.from(ciphertext).map((x) => {
                const num = Number(x.toString());
                return num & 0xFF; // Use bitwise AND to ensure 0-255
            });

            // Ensure exactly 32 bytes
            if (ciphertextU8.length !== 32) {
                if (ciphertextU8.length < 32) {
                    // Pad with zeros
                    ciphertextU8.push(...Array(32 - ciphertextU8.length).fill(0));
                } else {
                    // Truncate
                    ciphertextU8.splice(32);
                }
            }

            // Convert publicKey to number array
            const pubKeyArray: number[] = Array.from(publicKey);

            // Ensure publicKey is exactly 32 bytes
            if (pubKeyArray.length !== 32) {
                throw new Error(`Public key must be exactly 32 bytes, got ${pubKeyArray.length}`);
            }

            // Convert nonce to BN for u128
            const nonceBN = new anchor.BN(deserializeLE(nonce).toString());

            this.logger.debug(`Calling storeAuditResults with: computationOffset=${computationOffset.toString()}, ciphertextU8.length=${ciphertextU8.length}, pubKey.length=${pubKeyArray.length}, nonceBN=${nonceBN.toString()}`);
            this.logger.debug(`CiphertextU8 sample: [${ciphertextU8.slice(0, 5).join(', ')}...]`);

            // Use Anchor's methods directly with accountsPartial, matching Arcium examples pattern
            // Get cluster account using the cluster offset
            const clusterAccount = getClusterAccAddress(CLUSTER_OFFSET);

            const queueSig = await (this.program.methods as any)
                .storeAuditResults(
                    computationOffset,
                    Array.from(ciphertextU8),
                    Array.from(pubKeyArray),
                    nonceBN,
                )
                .accountsPartial({
                    payer: this.owner.publicKey,
                    computationAccount: computationAccount,
                    clusterAccount: clusterAccount,
                    mxeAccount: mxeAccount,
                    mempoolAccount: mempoolAccount,
                    executingPool: executingPool,
                    compDefAccount: compDefAccount,
                })
                .signers([this.owner])
                .rpc({ skipPreflight: true, commitment: 'confirmed' });

            this.logger.log(`Computation queued with signature: ${queueSig}`);

            // Wait for computation finalization
            const finalizeSig = await awaitComputationFinalization(
                this.provider,
                computationOffset,
                this.program.programId,
                'confirmed',
            );

            this.logger.log(`Computation finalized with signature: ${finalizeSig}`);

            return {
                success: true,
                message: `Successfully stored audit results for commit ${data.commitHash}`,
            };
        } catch (error) {
            this.logger.error(`Failed to store audit results: ${error.message}`, error.stack);
            return {
                success: false,
                message: `Failed to store audit results: ${error.message}`,
            };
        }
    }

    /**
     * Retrieve audit results by commit hash
     */
    async retrieveByCommit(commitHash: string): Promise<AuditStorageData | null> {
        if (!this.isEnabled) {
            this.logger.warn('Arcium Storage Service is disabled. Cannot retrieve audit results.');
            return null;
        }

        if (!this.program || !this.provider) {
            this.logger.warn('Arcium Storage Service is not properly initialized.');
            return null;
        }

        try {
            await this.ensureMXEPublicKey();

            // Convert commit hash to bytes
            const commitHashBytes = Buffer.from(commitHash, 'hex');
            if (commitHashBytes.length !== 32) {
                throw new Error('Commit hash must be 32 bytes (64 hex characters)');
            }

            // Generate encryption keys
            if (!this.mxePublicKey) {
                throw new Error('MXE public key not available');
            }

            const privateKey = x25519.utils.randomSecretKey();
            const publicKey = x25519.getPublicKey(privateKey);
            const sharedSecret = x25519.getSharedSecret(privateKey, this.mxePublicKey);
            const cipher = new RescueCipher(sharedSecret);
            const nonce = randomBytes(16);
            const commitHashPlaintext = Array.from(commitHashBytes).map((x) => BigInt(x));
            const ciphertextResult = cipher.encrypt(commitHashPlaintext, nonce);
            const ciphertext: bigint[] = (ciphertextResult[0] as unknown) as bigint[];

            // Generate computation offset
            const computationOffset = new anchor.BN(randomBytes(8), 'hex');

            // Get cluster account address
            const clusterAccount = getClusterAccAddress(CLUSTER_OFFSET);

            // Get account addresses
            const computationAccount = getComputationAccAddress(
                this.program.programId,
                computationOffset,
            );
            const mxeAccount = getMXEAccAddress(this.program.programId);
            const mempoolAccount = getMempoolAccAddress(this.program.programId);
            const executingPool = getExecutingPoolAccAddress(this.program.programId);
            const compDefAccount = getCompDefAccAddress(
                this.program.programId,
                Buffer.from(getCompDefAccOffset('retrieve_by_commit')).readUInt32LE(),
            );

            this.logger.log(`Retrieving audit results for commit ${commitHash}...`);

            // Queue the computation
            const queueSig = await this.program.methods
                .retrieveByCommit(
                    computationOffset,
                    Array.from(commitHashBytes),
                    Array.from(publicKey),
                    new anchor.BN(deserializeLE(nonce).toString()),
                )
                .accountsPartial({
                    computationAccount,
                    clusterAccount,
                    mxeAccount,
                    mempoolAccount,
                    executingPool,
                    compDefAccount,
                })
                .rpc({ skipPreflight: true, commitment: 'confirmed' });

            this.logger.log(`Computation queued with signature: ${queueSig}`);

            // Wait for computation finalization
            const finalizeSig = await awaitComputationFinalization(
                this.provider,
                computationOffset,
                this.program.programId,
                'confirmed',
            );

            this.logger.log(`Computation finalized with signature: ${finalizeSig}`);

            // Note: In a real implementation, you would need to parse the event data
            // For now, we'll return null as the actual retrieval logic needs to be implemented
            // based on the event structure emitted by the program
            return null;
        } catch (error) {
            this.logger.error(`Failed to retrieve audit results: ${error.message}`, error.stack);
            return null;
        }
    }

    /**
     * Encrypt report (alias for storeAuditResults for backward compatibility)
     */
    async encryptReport(data: AuditStorageData): Promise<StorageResult> {
        return this.storeAuditResults(data);
    }
}
