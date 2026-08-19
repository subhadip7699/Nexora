# Midnight

Zero-knowledge credential access gateway for the Midnight Network.

Midnight lets an operator deploy a Compact contract to Preprod, enroll credential hashes, and let members prove access without revealing the underlying credential. The active contract circuits are:

- `add_valid_credential(credential_hash)`
- `verify_access()`

The credential secret stays in the browser. The public ledger stores the administrator key, the credential Merkle tree, and spent nullifiers for one-time proof protection.

## Architecture

- Frontend: Next.js App Router in `app/`
- Wallets: Midnight DApp Connector API, with Lace and 1AM-compatible injected wallet discovery
- Contract: Compact source in `contracts/src/midnight.compact`
- Generated artifacts: `contracts/src/managed/`
- Browser proof assets: `app/public/contract/Midnight/`
- Network: Midnight Preprod

## Preprod Configuration

Copy `.env.example` to `.env.local` and fill in the deployed contract address only after a real deployment succeeds.

```env
NEXT_PUBLIC_MIDNIGHT_NETWORK=preprod
NEXT_PUBLIC_MIDNIGHT_INDEXER_HTTP_URL=https://indexer.preprod.midnight.network/api/v4/graphql
NEXT_PUBLIC_MIDNIGHT_INDEXER_WS_URL=wss://indexer.preprod.midnight.network/api/v4/graphql/ws
NEXT_PUBLIC_MIDNIGHT_NODE_URL=https://rpc.preprod.midnight.network
NEXT_PUBLIC_MIDNIGHT_PROOF_SERVER_URL=http://localhost:6300
NEXT_PUBLIC_MIDNIGHT_CONTRACT_ADDRESS=
```

Do not commit wallet seeds, mnemonics, private keys, or local `.env*` files.

## Local Proof Server

Preprod proof generation expects a local proof server at:

```txt
http://localhost:6300
```

Verify it before deploying:

```powershell
Test-NetConnection -ComputerName localhost -Port 6300
```

## Development

Install dependencies:

```powershell
npm.cmd install
```

Compile the Compact contract and sync browser artifacts:

```powershell
npm.cmd run compile --workspace=contracts
```

On Windows, the compile script uses WSL and the `compact` CLI. If WSL is unavailable, compile is blocked until WSL and the Midnight Compact toolchain are installed.

Run the app:

```powershell
npm.cmd run dev
```

Open `http://localhost:3000`.

## Verification Commands

```powershell
npm.cmd run test
npm.cmd run lint
npm.cmd run typecheck --workspace=app
npm.cmd run build
```

## Deployment Flow

1. Start the local proof server.
2. Connect a funded Midnight Preprod wallet.
3. Open `/admin`.
4. Deploy the contract.
5. Wait for indexer confirmation.
6. Store the returned address in `NEXT_PUBLIC_MIDNIGHT_CONTRACT_ADDRESS`.
7. Enroll credential hashes from the same administrator wallet.
8. Use `/vault` to generate and submit `verify_access` proofs.

Never fabricate a contract address. Only use the address returned by the real deployment flow and confirmed through the Preprod indexer.
