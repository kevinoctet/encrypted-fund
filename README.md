# Encrypted Fund

Encrypted Fund is a privacy-preserving fundraising dapp built on Zama FHEVM. It lets a creator configure a fundraiser
and accept encrypted fETH contributions so individual amounts stay private while the total is computed on-chain.

## Goals and Scope
- Private contribution amounts with transparent lifecycle and access control.
- Simple, single-campaign contract per deployment.
- Testnet-first experience using a confidential ERC7984 token.

## Problems This Solves
- Public blockchains expose contribution sizes and enable unwanted profiling.
- Off-chain tracking of contributions is error-prone and easy to manipulate.
- Donors may be pressured by public contribution history.
- Standard crowdfunding contracts cannot compute totals without revealing amounts.

## How It Works
1. The creator deploys `EncryptedFund` with the `FHEETH` token address.
2. The creator configures name, goal, and end time exactly once.
3. Contributors submit encrypted amounts via `confidentialTransferFrom`.
4. The contract updates encrypted per-user totals and the encrypted aggregate.
5. The creator can close at any time and withdraw the encrypted total.

## Advantages
- Privacy by default: all amounts are encrypted `euint64`.
- Verifiable totals: aggregation happens on-chain without decryption.
- Minimal metadata leakage: only addresses and timestamps are public.
- Standards-based: ERC7984 confidential token interface.
- No off-chain database or trusted server.

## Smart Contracts

### EncryptedFund
- `configureFund(name, goal, endTime)`: one-time configuration by the creator.
- `contribute(encryptedAmount, inputProof)`: encrypted contribution using ERC7984.
- `closeFund()`: creator-only close and withdrawal.
- Read-only getters: `getFundName`, `getFundGoal`, `getFundEndTime`, `getTotalRaised`, `getContribution`, `isActive`.
- State flags: `isConfigured`, `isClosed`.

### FHEETH
- Confidential ERC7984 token used for testnet/demo flows.
- `mint(to, amount)` is unrestricted and intended for testnet use only.

### Privacy and Access Control
- `FHE.allow` gives the contributor access to their own encrypted total.
- `FHE.allow` gives the creator access to the total raised.
- `getContribution` and `getTotalRaised` return encrypted values and require FHE-aware tooling to decode.

### Known Limitations
- The goal is informational only; it does not cap contributions.
- The creator can close before the end time.
- No refund path exists once funds are contributed.
- One fundraiser per deployment (no factory yet).

## Frontend
- Located in `app/` and built with React + Vite.
- Read calls use `viem`; write calls use `ethers`.
- Wallet connections use RainbowKit + wagmi.
- Contract addresses and ABIs are generated into `app/src/config/contracts.ts` during Sepolia deployment.
- No frontend environment variables and no local storage usage.
- Not intended for localhost networks; use Sepolia with the generated config.

## Tech Stack
- Solidity 0.8.x, Hardhat, hardhat-deploy
- Zama FHEVM (`@fhevm/solidity`)
- OpenZeppelin confidential contracts (ERC7984)
- React, Vite, viem, ethers, RainbowKit, wagmi

## Project Structure
```
app/            Frontend (React + Vite)
contracts/      Solidity contracts
deploy/         Deployment scripts
tasks/          Hardhat tasks
test/           Hardhat tests
```

## Development

### Prerequisites
- Node.js 20+
- npm 7+

### Install Dependencies
```bash
npm install
```

### Compile and Test Contracts
```bash
npm run compile
npm run test
```

### Local Contract Development (optional)
```bash
npm run chain
npm run deploy:localhost
```

## Deployment to Sepolia
1. Create a `.env` file with:
   - `PRIVATE_KEY` (deploy key)
   - `INFURA_API_KEY` (RPC access)
   - `ETHERSCAN_API_KEY` (optional, for verification)
2. Run tests and any required tasks before deployment.
3. Deploy:
   ```bash
   npm run deploy:sepolia
   ```
4. The deploy script writes `app/src/config/contracts.ts` with Sepolia addresses and ABIs from
   `deployments/sepolia`.

## Frontend Usage
```bash
cd app
npm install
npm run dev
```

## Testing Notes
- Contract tests live in `test/`.
- Sepolia tests can be run with:
  ```bash
  npm run test:sepolia
  ```

## Future Roadmap
- Enforce fundraising goal caps and automatic closure rules.
- Optional refund and grace-period mechanics.
- Multi-campaign factory contract and improved lifecycle events.
- Privacy-preserving analytics and contributor dashboards.
- More robust relayer UX and error handling.
- Security review and formal verification of core logic.

## License
BSD-3-Clause-Clear
