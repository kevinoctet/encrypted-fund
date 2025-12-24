import { useMemo, useState } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { Contract, ethers } from 'ethers';
import { FUND_ABI, FUND_ADDRESS, FETH_ABI, FETH_ADDRESS, TOKEN_DECIMALS } from '../config/contracts';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { useZamaInstance } from '../hooks/useZamaInstance';
import { Header } from './Header';
import '../styles/FundApp.css';

const DURATION_DAYS = '7';

export function FundApp() {
  const { address } = useAccount();
  const signerPromise = useEthersSigner();
  const { instance, isLoading: zamaLoading, error: zamaError } = useZamaInstance();

  const [configName, setConfigName] = useState('');
  const [configGoal, setConfigGoal] = useState('');
  const [configEndTime, setConfigEndTime] = useState('');
  const [isConfiguring, setIsConfiguring] = useState(false);

  const [contributionAmount, setContributionAmount] = useState('');
  const [isContributing, setIsContributing] = useState(false);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [isMinting, setIsMinting] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const [decryptedTotal, setDecryptedTotal] = useState<string | null>(null);
  const [decryptedContribution, setDecryptedContribution] = useState<string | null>(null);
  const [decryptedBalance, setDecryptedBalance] = useState<string | null>(null);
  const [decryptingTarget, setDecryptingTarget] = useState<'total' | 'contribution' | 'balance' | null>(null);

  const { data: creator } = useReadContract({
    address: FUND_ADDRESS,
    abi: FUND_ABI,
    functionName: 'creator',
  });

  const { data: fundName } = useReadContract({
    address: FUND_ADDRESS,
    abi: FUND_ABI,
    functionName: 'getFundName',
  });

  const { data: fundGoal } = useReadContract({
    address: FUND_ADDRESS,
    abi: FUND_ABI,
    functionName: 'getFundGoal',
  });

  const { data: fundEndTime } = useReadContract({
    address: FUND_ADDRESS,
    abi: FUND_ABI,
    functionName: 'getFundEndTime',
  });

  const { data: isConfigured } = useReadContract({
    address: FUND_ADDRESS,
    abi: FUND_ABI,
    functionName: 'isConfigured',
  });

  const { data: isClosed } = useReadContract({
    address: FUND_ADDRESS,
    abi: FUND_ABI,
    functionName: 'isClosed',
  });

  const { data: isActive } = useReadContract({
    address: FUND_ADDRESS,
    abi: FUND_ABI,
    functionName: 'isActive',
  });

  const { data: totalRaised } = useReadContract({
    address: FUND_ADDRESS,
    abi: FUND_ABI,
    functionName: 'getTotalRaised',
  });

  const { data: contribution } = useReadContract({
    address: FUND_ADDRESS,
    abi: FUND_ABI,
    functionName: 'getContribution',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
    },
  });

  const { data: balanceHandle } = useReadContract({
    address: FETH_ADDRESS,
    abi: FETH_ABI,
    functionName: 'confidentialBalanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
    },
  });

  const { data: isOperator } = useReadContract({
    address: FETH_ADDRESS,
    abi: FETH_ABI,
    functionName: 'isOperator',
    args: address ? [address, FUND_ADDRESS] : undefined,
    query: {
      enabled: !!address,
    },
  });

  const isCreator = useMemo(() => {
    if (!address || !creator) {
      return false;
    }
    return address.toLowerCase() === (creator as string).toLowerCase();
  }, [address, creator]);

  const formattedGoal = fundGoal ? ethers.formatUnits(fundGoal as bigint, TOKEN_DECIMALS) : '--';
  const formattedEndTime = fundEndTime
    ? new Date(Number(fundEndTime) * 1000).toLocaleString()
    : '--';

  const statusLabel = !isConfigured
    ? 'Not configured'
    : isClosed
    ? 'Closed'
    : isActive
    ? 'Live'
    : 'Ended';

  const formatEncrypted = (value?: string) => {
    if (!value || value === ethers.ZeroHash) {
      return '—';
    }
    return `${value.slice(0, 10)}...${value.slice(-8)}`;
  };

  const requestUserDecrypt = async (handle: string, contractAddress: string) => {
    if (!instance || !address || !signerPromise) {
      throw new Error('Missing signer or relayer instance');
    }

    const keypair = instance.generateKeypair();
    const contractAddresses = [contractAddress];
    const startTimeStamp = Math.floor(Date.now() / 1000).toString();

    const eip712 = instance.createEIP712(
      keypair.publicKey,
      contractAddresses,
      startTimeStamp,
      DURATION_DAYS,
    );

    const resolvedSigner = await signerPromise;
    if (!resolvedSigner) {
      throw new Error('Signer unavailable');
    }

    const signature = await resolvedSigner.signTypedData(
      eip712.domain,
      {
        UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification,
      },
      eip712.message,
    );

    const result = await instance.userDecrypt(
      [{ handle, contractAddress }],
      keypair.privateKey,
      keypair.publicKey,
      signature.replace('0x', ''),
      contractAddresses,
      address,
      startTimeStamp,
      DURATION_DAYS,
    );

    return result[handle] as string | undefined;
  };

  const decryptHandle = async (
    target: 'total' | 'contribution' | 'balance',
    handle: string | undefined,
    contractAddress: string,
  ) => {
    if (!handle || handle === ethers.ZeroHash) {
      return;
    }

    setDecryptingTarget(target);
    try {
      const clearValue = await requestUserDecrypt(handle, contractAddress);
      if (!clearValue) {
        return;
      }

      const formatted = ethers.formatUnits(BigInt(clearValue), TOKEN_DECIMALS);

      if (target === 'total') {
        setDecryptedTotal(formatted);
      }
      if (target === 'contribution') {
        setDecryptedContribution(formatted);
      }
      if (target === 'balance') {
        setDecryptedBalance(formatted);
      }
    } catch (error) {
      console.error('Decryption failed:', error);
      alert('Failed to decrypt data. Ensure you have access to this ciphertext.');
    } finally {
      setDecryptingTarget(null);
    }
  };

  const handleConfigure = async () => {
    if (!configName || !configGoal || !configEndTime) {
      alert('Please fill in all configuration fields.');
      return;
    }
    if (!signerPromise) {
      alert('Connect a wallet first.');
      return;
    }

    const endTimestamp = Math.floor(new Date(configEndTime).getTime() / 1000);
    if (!Number.isFinite(endTimestamp) || endTimestamp <= 0) {
      alert('Invalid end time.');
      return;
    }

    setIsConfiguring(true);
    try {
      const signer = await signerPromise;
      if (!signer) {
        throw new Error('Signer unavailable');
      }

      const contract = new Contract(FUND_ADDRESS, FUND_ABI, signer);
      const goalUnits = ethers.parseUnits(configGoal, TOKEN_DECIMALS);

      const tx = await contract.configureFund(configName, goalUnits, endTimestamp);
      await tx.wait();

      setConfigName('');
      setConfigGoal('');
      setConfigEndTime('');
    } catch (error) {
      console.error('Configure fund failed:', error);
      alert('Failed to configure the fund.');
    } finally {
      setIsConfiguring(false);
    }
  };

  const handleAuthorize = async () => {
    if (!signerPromise) {
      alert('Connect a wallet first.');
      return;
    }

    setIsAuthorizing(true);
    try {
      const signer = await signerPromise;
      if (!signer) {
        throw new Error('Signer unavailable');
      }

      const tokenContract = new Contract(FETH_ADDRESS, FETH_ABI, signer);
      const until = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;

      const tx = await tokenContract.setOperator(FUND_ADDRESS, until);
      await tx.wait();
    } catch (error) {
      console.error('Operator authorization failed:', error);
      alert('Failed to authorize the fund contract.');
    } finally {
      setIsAuthorizing(false);
    }
  };

  const handleMint = async () => {
    if (!signerPromise) {
      alert('Connect a wallet first.');
      return;
    }
    if (!address) {
      alert('Connect a wallet first.');
      return;
    }
    if (!contributionAmount) {
      alert('Enter an amount to mint.');
      return;
    }

    setIsMinting(true);
    try {
      const signer = await signerPromise;
      if (!signer) {
        throw new Error('Signer unavailable');
      }

      const tokenContract = new Contract(FETH_ADDRESS, FETH_ABI, signer);
      const amountUnits = ethers.parseUnits(contributionAmount, TOKEN_DECIMALS);

      const tx = await tokenContract.mint(address, amountUnits);
      await tx.wait();
    } catch (error) {
      console.error('Mint failed:', error);
      alert('Failed to mint fETH.');
    } finally {
      setIsMinting(false);
    }
  };

  const handleContribute = async () => {
    if (!instance || !address || !signerPromise) {
      alert('Connect your wallet and wait for the relayer to initialize.');
      return;
    }
    if (!contributionAmount) {
      alert('Enter a contribution amount.');
      return;
    }
    if (!isOperator) {
      alert('Enable the fund contract as operator before contributing.');
      return;
    }

    setIsContributing(true);
    try {
      const amountUnits = ethers.parseUnits(contributionAmount, TOKEN_DECIMALS);

      const input = instance.createEncryptedInput(FUND_ADDRESS, address);
      input.add64(amountUnits);
      const encryptedInput = await input.encrypt();

      const signer = await signerPromise;
      if (!signer) {
        throw new Error('Signer unavailable');
      }

      const contract = new Contract(FUND_ADDRESS, FUND_ABI, signer);
      const tx = await contract.contribute(encryptedInput.handles[0], encryptedInput.inputProof);
      await tx.wait();

      setContributionAmount('');
    } catch (error) {
      console.error('Contribution failed:', error);
      alert('Contribution failed. Ensure you authorized the fund and have balance.');
    } finally {
      setIsContributing(false);
    }
  };

  const handleClose = async () => {
    if (!signerPromise) {
      alert('Connect a wallet first.');
      return;
    }

    setIsClosing(true);
    try {
      const signer = await signerPromise;
      if (!signer) {
        throw new Error('Signer unavailable');
      }

      const contract = new Contract(FUND_ADDRESS, FUND_ABI, signer);
      const tx = await contract.closeFund();
      await tx.wait();
    } catch (error) {
      console.error('Close fund failed:', error);
      alert('Failed to close the fund.');
    } finally {
      setIsClosing(false);
    }
  };

  return (
    <div className="fund-page">
      <Header />
      <main className="fund-content">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">Confidential Fundraising</p>
            <h2>Build in public. Fund in private.</h2>
            <p className="lead">
              Contributors send encrypted fETH, while the total is computed on-chain with Zama FHE.
              The fund owner can close anytime and withdraw the full confidential balance.
            </p>
          </div>
          <div className="hero-card">
            <div className="hero-card-row">
              <span>Status</span>
              <strong>{statusLabel}</strong>
            </div>
            <div className="hero-card-row">
              <span>Fund Name</span>
              <strong>{fundName ? fundName.toString() : '—'}</strong>
            </div>
            <div className="hero-card-row">
              <span>Goal</span>
              <strong>{formattedGoal} fETH</strong>
            </div>
            <div className="hero-card-row">
              <span>End Time</span>
              <strong>{formattedEndTime}</strong>
            </div>
            <div className="hero-card-row">
              <span>Owner</span>
              <strong>{creator ? `${(creator as string).slice(0, 6)}...${(creator as string).slice(-4)}` : '—'}</strong>
            </div>
          </div>
        </section>

        <section className="grid">
          <article className="panel">
            <h3>Fund configuration</h3>
            <p className="muted">Only the creator can set the name, goal, and end time. This can be done once.</p>
            {isCreator ? (
              <div className="form">
                <label>
                  Fund name
                  <input
                    type="text"
                    value={configName}
                    onChange={(event) => setConfigName(event.target.value)}
                    placeholder="Encrypted Fund Alpha"
                    disabled={!!isConfigured || isConfiguring}
                  />
                </label>
                <label>
                  Goal (fETH)
                  <input
                    type="number"
                    min="0"
                    step="0.000001"
                    value={configGoal}
                    onChange={(event) => setConfigGoal(event.target.value)}
                    placeholder="125"
                    disabled={!!isConfigured || isConfiguring}
                  />
                </label>
                <label>
                  End time
                  <input
                    type="datetime-local"
                    value={configEndTime}
                    onChange={(event) => setConfigEndTime(event.target.value)}
                    disabled={!!isConfigured || isConfiguring}
                  />
                </label>
                <button
                  className="primary"
                  onClick={handleConfigure}
                  disabled={!isCreator || !!isConfigured || isConfiguring}
                >
                  {isConfiguring ? 'Configuring...' : 'Configure fund'}
                </button>
              </div>
            ) : (
              <div className="notice">
                Connect the creator wallet to configure the fund.
              </div>
            )}
          </article>

          <article className="panel">
            <h3>Contribution desk</h3>
            <p className="muted">Enable the fund as an operator, mint test fETH, then contribute with encrypted inputs.</p>
            <div className="stack">
              <div className="stack-row">
                <div>
                  <p className="label">Operator status</p>
                  <p className="value">{isOperator ? 'Enabled' : 'Not enabled'}</p>
                </div>
                <button
                  className="secondary"
                  onClick={handleAuthorize}
                  disabled={!address || isAuthorizing}
                >
                  {isAuthorizing ? 'Authorizing...' : 'Enable fund as operator'}
                </button>
              </div>
              <div className="stack-row">
                <div>
                  <p className="label">Mint fETH</p>
                  <p className="value">Testnet only. Mint to your connected wallet.</p>
                </div>
                <button
                  className="secondary"
                  onClick={handleMint}
                  disabled={!address || isMinting || !contributionAmount}
                >
                  {isMinting ? 'Minting...' : 'Mint fETH'}
                </button>
              </div>
              <label>
                Contribution amount (fETH)
                <input
                  type="number"
                  min="0"
                  step="0.000001"
                  value={contributionAmount}
                  onChange={(event) => setContributionAmount(event.target.value)}
                  placeholder="3.5"
                />
              </label>
              <button
                className="primary"
                onClick={handleContribute}
                disabled={!address || !isConfigured || !!isClosed || isContributing}
              >
                {isContributing ? 'Submitting...' : 'Contribute encrypted fETH'}
              </button>
              {zamaLoading && <p className="notice">Preparing encryption service...</p>}
              {zamaError && <p className="notice">Relayer error: {zamaError}</p>}
            </div>
          </article>

          <article className="panel">
            <h3>Your encrypted position</h3>
            <div className="stack">
              <div className="stack-row">
                <div>
                  <p className="label">Wallet balance handle</p>
                  <p className="value">{formatEncrypted(balanceHandle as string | undefined)}</p>
                </div>
                <button
                  className="ghost"
                  onClick={() => decryptHandle('balance', balanceHandle as string | undefined, FETH_ADDRESS)}
                  disabled={!balanceHandle || decryptingTarget === 'balance'}
                >
                  {decryptingTarget === 'balance' ? 'Decrypting...' : 'Decrypt'}
                </button>
              </div>
              <div className="stack-row">
                <div>
                  <p className="label">Decrypted wallet balance</p>
                  <p className="value">{decryptedBalance ? `${decryptedBalance} fETH` : '—'}</p>
                </div>
              </div>
              <div className="stack-row">
                <div>
                  <p className="label">Your contribution handle</p>
                  <p className="value">{formatEncrypted(contribution as string | undefined)}</p>
                </div>
                <button
                  className="ghost"
                  onClick={() => decryptHandle('contribution', contribution as string | undefined, FUND_ADDRESS)}
                  disabled={!contribution || decryptingTarget === 'contribution'}
                >
                  {decryptingTarget === 'contribution' ? 'Decrypting...' : 'Decrypt'}
                </button>
              </div>
              <div className="stack-row">
                <div>
                  <p className="label">Decrypted contribution</p>
                  <p className="value">{decryptedContribution ? `${decryptedContribution} fETH` : '—'}</p>
                </div>
              </div>
              <div className="stack-row">
                <div>
                  <p className="label">Total raised handle</p>
                  <p className="value">{formatEncrypted(totalRaised as string | undefined)}</p>
                </div>
                <button
                  className="ghost"
                  onClick={() => decryptHandle('total', totalRaised as string | undefined, FUND_ADDRESS)}
                  disabled={!totalRaised || decryptingTarget === 'total'}
                >
                  {decryptingTarget === 'total' ? 'Decrypting...' : 'Decrypt'}
                </button>
              </div>
              <div className="stack-row">
                <div>
                  <p className="label">Decrypted total (creator access)</p>
                  <p className="value">{decryptedTotal ? `${decryptedTotal} fETH` : '—'}</p>
                </div>
              </div>
            </div>
          </article>

          <article className="panel">
            <h3>Owner actions</h3>
            <p className="muted">Closing the fund transfers the full encrypted balance to the creator wallet.</p>
            <button
              className="danger"
              onClick={handleClose}
              disabled={!isCreator || !!isClosed || !isConfigured || isClosing}
            >
              {isClosing ? 'Closing...' : 'Close fund and withdraw'}
            </button>
            {!isCreator && <p className="notice">Connect the creator wallet to close the fund.</p>}
          </article>
        </section>
      </main>
    </div>
  );
}
