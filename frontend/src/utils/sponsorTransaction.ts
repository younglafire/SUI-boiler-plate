import { SuiClient, getFullnodeUrl, type SuiObjectRef } from '@mysten/sui/client'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { Transaction } from '@mysten/sui/transactions'
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography'

// Sponsor wallet configuration
// Address: 0x438b067c7ad8673897d826d5800621aeba1d9016f5c0db4d0f97550bfd9059da
const SPONSOR_PRIVATE_KEY = 'suiprivkey1qzkejytknake27tl58q5ymnvdz63e6zq8cp69x0a3ng89rsvdamuz9kwvqn'

// Create the sponsor keypair from the private key
function getSponsorKeypair(): Ed25519Keypair {
  const { secretKey } = decodeSuiPrivateKey(SPONSOR_PRIVATE_KEY)
  return Ed25519Keypair.fromSecretKey(secretKey)
}

// Create a SUI client for testnet
const suiClient = new SuiClient({ url: getFullnodeUrl('testnet') })

// Get sponsor address
export function getSponsorAddress(): string {
  const keypair = getSponsorKeypair()
  return keypair.getPublicKey().toSuiAddress()
}

/**
 * Sponsor a transaction for seamless UX (no wallet popup)
 * The sponsor pays for gas, and the user doesn't need to confirm anything.
 * 
 * @param sender - The user's address (transaction sender)
 * @param transactionKindBytes - The transaction bytes built with onlyTransactionKind: true
 * @returns The signed transaction bytes and sponsor signature
 */
export async function sponsorTransaction(
  sender: string,
  transactionKindBytes: Uint8Array
): Promise<{ bytes: string; signature: string }> {
  const sponsorKeypair = getSponsorKeypair()
  const sponsorAddress = sponsorKeypair.getPublicKey().toSuiAddress()

  // Get gas coins from sponsor wallet
  const coins = await suiClient.getCoins({ owner: sponsorAddress, limit: 1 })
  
  if (coins.data.length === 0) {
    throw new Error('Sponsor wallet has no gas coins. Please fund the sponsor wallet.')
  }

  const payment: SuiObjectRef[] = coins.data.map((coin) => ({
    objectId: coin.coinObjectId,
    version: coin.version,
    digest: coin.digest,
  }))

  // Reconstruct the transaction from the kind bytes
  const tx = Transaction.fromKind(transactionKindBytes)
  tx.setSender(sender)
  tx.setGasOwner(sponsorAddress)
  tx.setGasPayment(payment)

  // Build and sign the transaction with sponsor's keypair
  const builtTx = await tx.build({ client: suiClient })
  const signedTx = await sponsorKeypair.signTransaction(builtTx)

  return signedTx
}

/**
 * Execute a fully sponsored transaction.
 * This is used when the sponsor also acts as the sender (full sponsorship).
 * 
 * @param tx - The Transaction object to execute
 * @returns The transaction result
 */
export async function executeSponsoredTransaction(
  tx: Transaction
): Promise<{
  digest: string
  effects?: unknown
  events?: unknown
  objectChanges?: unknown
}> {
  const sponsorKeypair = getSponsorKeypair()
  const sponsorAddress = sponsorKeypair.getPublicKey().toSuiAddress()

  // Get gas coins from sponsor wallet
  const coins = await suiClient.getCoins({ owner: sponsorAddress, limit: 1 })
  
  if (coins.data.length === 0) {
    throw new Error('Sponsor wallet has no gas coins. Please fund the sponsor wallet.')
  }

  const payment: SuiObjectRef[] = coins.data.map((coin) => ({
    objectId: coin.coinObjectId,
    version: coin.version,
    digest: coin.digest,
  }))

  // Set gas payment
  tx.setGasOwner(sponsorAddress)
  tx.setGasPayment(payment)

  // Build the transaction
  const builtTx = await tx.build({ client: suiClient })
  
  // Sign with sponsor
  const signedTx = await sponsorKeypair.signTransaction(builtTx)

  // Execute the transaction
  const result = await suiClient.executeTransactionBlock({
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
 * Sponsor and execute a transaction where the user is the sender but sponsor pays gas.
 * User needs to sign, but we handle everything else.
 * 
 * For fully seamless UX (no signing at all), the sponsor must be the sender.
 * This function is for cases where user authentication is needed via signature.
 * 
 * @param sender - User's address
 * @param tx - The Transaction object
 * @param userSignTransaction - Function to get user's signature
 * @returns The transaction result
 */
export async function sponsorAndExecuteTransaction(
  sender: string,
  tx: Transaction,
  userSignTransaction: (tx: { transaction: Transaction }) => Promise<{ bytes: string; signature: string }>
): Promise<{
  digest: string
  effects?: unknown
  events?: unknown
  objectChanges?: unknown
}> {
  const sponsorKeypair = getSponsorKeypair()
  const sponsorAddress = sponsorKeypair.getPublicKey().toSuiAddress()

  // Get gas coins from sponsor wallet
  const coins = await suiClient.getCoins({ owner: sponsorAddress, limit: 1 })
  
  if (coins.data.length === 0) {
    throw new Error('Sponsor wallet has no gas coins. Please fund the sponsor wallet.')
  }

  const payment: SuiObjectRef[] = coins.data.map((coin) => ({
    objectId: coin.coinObjectId,
    version: coin.version,
    digest: coin.digest,
  }))

  // Configure the transaction
  tx.setSender(sender)
  tx.setGasOwner(sponsorAddress)
  tx.setGasPayment(payment)

  // Get user signature first (this triggers wallet popup)
  const userSigned = await userSignTransaction({ transaction: tx })

  // Now sponsor signs the same transaction
  const builtTx = await tx.build({ client: suiClient })
  const sponsorSigned = await sponsorKeypair.signTransaction(builtTx)

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

  return result
}

// Export the client for use in components
export { suiClient as sponsorSuiClient }
