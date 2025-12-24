import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { ethers, fhevm } from "hardhat";
import type { Contract } from "ethers";

const TOKEN_DECIMALS = 6;

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
};

async function deployFixture() {
  const tokenFactory = await ethers.getContractFactory("FHEETH");
  const token = (await tokenFactory.deploy()) as Contract;

  const fundFactory = await ethers.getContractFactory("EncryptedFund");
  const fund = (await fundFactory.deploy(await token.getAddress())) as Contract;

  return { token, fund };
}

describe("EncryptedFund", function () {
  let signers: Signers;
  let token: Contract;
  let fund: Contract;

  before(async function () {
    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { deployer: ethSigners[0], alice: ethSigners[1] };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn(`This hardhat test suite cannot run on Sepolia Testnet`);
      this.skip();
    }

    ({ token, fund } = await deployFixture());
  });

  it("configures a fund with name, goal, and end time", async function () {
    const endTime = Math.floor(Date.now() / 1000) + 3600;
    const goal = ethers.parseUnits("100", TOKEN_DECIMALS);

    await fund.connect(signers.deployer).configureFund("Launch Fund", goal, endTime);

    const name = await fund.getFundName();
    const storedGoal = await fund.getFundGoal();
    const storedEnd = await fund.getFundEndTime();

    expect(name).to.eq("Launch Fund");
    expect(storedGoal).to.eq(goal);
    expect(storedEnd).to.eq(endTime);
  });

  it("records encrypted contributions and updates total", async function () {
    const endTime = Math.floor(Date.now() / 1000) + 3600;
    const goal = ethers.parseUnits("50", TOKEN_DECIMALS);

    await fund.connect(signers.deployer).configureFund("Builders", goal, endTime);

    const amount = ethers.parseUnits("10", TOKEN_DECIMALS);
    await token.mint(signers.alice.address, amount);

    const operatorUntil = Math.floor(Date.now() / 1000) + 3600;
    await token.connect(signers.alice).setOperator(await fund.getAddress(), operatorUntil);

    const encryptedInput = await fhevm
      .createEncryptedInput(await fund.getAddress(), signers.alice.address)
      .add64(amount)
      .encrypt();

    await fund.connect(signers.alice).contribute(encryptedInput.handles[0], encryptedInput.inputProof);

    const encryptedContribution = await fund.getContribution(signers.alice.address);
    const clearContribution = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedContribution,
      await fund.getAddress(),
      signers.alice,
    );

    const encryptedTotal = await fund.getTotalRaised();
    const clearTotal = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedTotal,
      await fund.getAddress(),
      signers.deployer,
    );

    expect(clearContribution).to.eq(amount);
    expect(clearTotal).to.eq(amount);
  });

  it("transfers all fETH to creator when closed", async function () {
    const endTime = Math.floor(Date.now() / 1000) + 3600;
    const goal = ethers.parseUnits("30", TOKEN_DECIMALS);

    await fund.connect(signers.deployer).configureFund("Finale", goal, endTime);

    const amount = ethers.parseUnits("12", TOKEN_DECIMALS);
    await token.mint(signers.alice.address, amount);

    const operatorUntil = Math.floor(Date.now() / 1000) + 3600;
    await token.connect(signers.alice).setOperator(await fund.getAddress(), operatorUntil);

    const encryptedInput = await fhevm
      .createEncryptedInput(await fund.getAddress(), signers.alice.address)
      .add64(amount)
      .encrypt();

    await fund.connect(signers.alice).contribute(encryptedInput.handles[0], encryptedInput.inputProof);

    await fund.connect(signers.deployer).closeFund();

    const encryptedBalance = await token.confidentialBalanceOf(signers.deployer.address);
    const clearBalance = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedBalance,
      await token.getAddress(),
      signers.deployer,
    );

    expect(clearBalance).to.eq(amount);
  });
});
