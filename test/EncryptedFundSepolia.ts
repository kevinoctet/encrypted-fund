import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, deployments, fhevm } from "hardhat";

const TOKEN_DECIMALS = 6n;

type Signers = {
  owner: HardhatEthersSigner;
};

describe("EncryptedFundSepolia", function () {
  let signers: Signers;

  before(async function () {
    if (fhevm.isMock) {
      console.warn(`This hardhat test suite can only run on Sepolia Testnet`);
      this.skip();
    }

    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { owner: ethSigners[0] };
  });

  it("reads deployed fund details", async function () {
    const fund = await deployments.get("EncryptedFund");
    const fundContract = await ethers.getContractAt("EncryptedFund", fund.address);

    const configured = await fundContract.isConfigured();
    if (!configured) {
      console.warn(\"EncryptedFund is not configured on Sepolia; run task:fund-configure first.\");
      this.skip();
    }

    const name = await fundContract.getFundName();
    const goal = await fundContract.getFundGoal();
    const endTime = await fundContract.getFundEndTime();
    const closed = await fundContract.isClosed();

    console.log(`Fund name: ${name}`);
    console.log(`Fund goal: ${ethers.formatUnits(goal, Number(TOKEN_DECIMALS))}`);
    console.log(`Fund end: ${new Date(Number(endTime) * 1000).toISOString()}`);
    console.log(`Fund closed: ${closed}`);
  });
});
