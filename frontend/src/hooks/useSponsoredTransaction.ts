import { useCallback, useState } from 'react'
import { useCurrentAccount, useSignTransaction, useSuiClient } from '@mysten/dapp-kit'
import { SuiClient, getFullnodeUrl, type SuiObjectRef } from '@mysten/sui/client'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { Transaction } from '@mysten/sui/transactions'
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography'
import { fromBase64 } from '@mysten/sui/utils'

// Sponsor wallet configuration
// Address: 0x438b067c7ad8673897d826d5800621aeba1d9016f5c0db4d0f97550bfd9059da
const SPONSOR_PRIVATE_KEY = 'suiprivkey1qzkejytknake27tl58q5ymnvdz63e6zq8cp69x0a3ng89rsvdamuz9kwvqn'

// Create the sponsor keypair from the private key
function getSponsorKeypair(): Ed25519Keypair {
  const { secretKey } = decodeSuiPrivateKey(SPONSOR_PRIVATE_KEY)
  return Ed25519Keypair.fromSecretKey(secretKey)
}

// Create a standalone SUI client for sponsor operations
const sponsorClient = new SuiClient({ url: getFullnodeUrl('testnet') })

// Get sponsor address
export function getSponsorAddress(): string {
  const keypair = getSponsorKeypair()
  return keypair.getPublicKey().toSuiAddress()
}

// Get gas payment from sponsor wallet
async function getSponsorGasPayment(): Promise<SuiObjectRef[]> {
  const sponsorKeypair = getSponsorKeypair()
  const sponsorAddress = sponsorKeypair.getPublicKey().toSuiAddress()

  const coins = await sponsorClient.getCoins({ owner: sponsorAddress, limit: 1 })
  
  if (coins.data.length === 0) {
    throw new Error('Sponsor wallet has no gas coins. Please fund the sponsor wallet.')
  }

  return coins.data.map((coin) => ({
    objectId: coin.coinObjectId,
    version: coin.version,
    digest: coin.digest,
  }))
}

export interface SponsoredTransactionResult {
  digest: string
  effects?: unknown
  events?: unknown
  objectChanges?: unknown
}

export interface UseSponsoredTransactionReturn {
  /**
   * Execute a sponsored transaction. The sponsor pays for gas.
   * User wallet popup will appear for signature (required for user-owned objects).
   */
  mutate: (
    input: { transaction: Transaction },
    callbacks?: {
      onSuccess?: (result: SponsoredTransactionResult) => void | Promise<void>
      onError?: (error: Error) => void
    }
  ) => void
  
  /**
   * Async version of mutate
   */
  mutateAsync: (input: { transaction: Transaction }) => Promise<SponsoredTransactionResult>
  
  /**
   * Whether a transaction is currently pending
   */
  isPending: boolean
  
  /**
   * The error from the last transaction, if any
   */
  error: Error | null
}

/**
 * Custom hook for sponsored transactions.
 * The sponsor wallet pays for gas fees, but user still signs for authentication.
 * 
 * This provides a similar API to useSignAndExecuteTransaction but with gas sponsorship.
 */
export function useSponsoredTransaction(): UseSponsoredTransactionReturn {
  const account = useCurrentAccount()
  const suiClient = useSuiClient()
  const { mutateAsync: signTransaction } = useSignTransaction()
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const mutateAsync = useCallback(async (
    input: { transaction: Transaction }
  ): Promise<SponsoredTransactionResult> => {
    if (!account?.address) {
      throw new Error('Wallet not connected')
    }

    setIsPending(true)
    setError(null)

    try {
      const sponsorKeypair = getSponsorKeypair()
      const sponsorAddress = sponsorKeypair.getPublicKey().toSuiAddress()

      // Get gas payment from sponsor
      const gasPayment = await getSponsorGasPayment()

      // Configure the transaction
      const tx = input.transaction
      tx.setSender(account.address)
      tx.setGasOwner(sponsorAddress)
      tx.setGasPayment(gasPayment)

      // User signs the transaction (this triggers wallet popup)
      const userSigned = await signTransaction({ transaction: tx })

      // Sponsor signs the same transaction bytes
      const sponsorSigned = await sponsorKeypair.signTransaction(
        fromBase64(userSigned.bytes)
      )

      // Execute with both signatures
      const result = await suiClient.executeTransactionBlock({
        transactionBlock: userSigned.bytes,
        signature: [userSigned.signature, sponsorSigned.signature],
        options: {
          showEffects: true,
          showEvents: true,
          showObjectChanges: true,
        },
      })

      setIsPending(false)
      return result
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      setError(error)
      setIsPending(false)
      throw error
    }
  }, [account?.address, signTransaction, suiClient])

  const mutate = useCallback((
    input: { transaction: Transaction },
    callbacks?: {
      onSuccess?: (result: SponsoredTransactionResult) => void | Promise<void>
      onError?: (error: Error) => void
    }
  ) => {
    mutateAsync(input)
      .then(result => {
        callbacks?.onSuccess?.(result)
      })
      .catch(err => {
        const error = err instanceof Error ? err : new Error(String(err))
        callbacks?.onError?.(error)
      })
  }, [mutateAsync])

  return {
    mutate,
    mutateAsync,
    isPending,
    error,
  }
}

/**
 * Execute a fully sponsored transaction where sponsor is both sender AND payer.
 * This is for operations that don't require user authentication.
 * NO WALLET POPUP - completely seamless.
 * 
 * Note: Only works for transactions that don't require user-owned object access.
 */
export async function executeFullySponsoredTransaction(
  tx: Transaction
): Promise<SponsoredTransactionResult> {
  const sponsorKeypair = getSponsorKeypair()
  const sponsorAddress = sponsorKeypair.getPublicKey().toSuiAddress()

  // Get gas payment
  const gasPayment = await getSponsorGasPayment()

  // Configure transaction - sponsor is both sender and gas owner
  tx.setSender(sponsorAddress)
  tx.setGasOwner(sponsorAddress)
  tx.setGasPayment(gasPayment)

  // Build and sign
  const builtTx = await tx.build({ client: sponsorClient })
  const signedTx = await sponsorKeypair.signTransaction(builtTx)

  // Execute
  const result = await sponsorClient.executeTransactionBlock({
    transactionBlock: signedTx.bytes,
    signature: signedTx.signature,
    options: {
      showEffects: true,
      showEvents: true,
      showObjectChanges: true,
    },
  })

  return result
}

/**
 * Mint SEED tokens to a user's wallet without requiring user signature.
 * The sponsor executes this transaction, and seeds go directly to the recipient.
 * 
 * This is completely seamless - no wallet popup!
 * 
 * @param recipientAddress - The user's wallet address to receive seeds
 * @param amount - Amount of seeds to mint (with decimals, e.g., 1000 * 10^9)
 * @param packageId - The contract package ID
 * @param seedAdminCapId - The SeedAdminCap object ID
 */
export async function mintSeedsToUser(
  recipientAddress: string,
  amount: bigint,
  packageId: string,
  seedAdminCapId: string
): Promise<SponsoredTransactionResult> {
  const tx = new Transaction()
  
  tx.moveCall({
    target: `${packageId}::seed::mint_seeds`,
    arguments: [
      tx.object(seedAdminCapId),
      tx.pure.u64(amount),
      tx.pure.address(recipientAddress),
    ],
  })

  return executeFullySponsoredTransaction(tx)
}

// Export the sponsor client for direct use
export { sponsorClient }
