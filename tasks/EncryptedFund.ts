import { FhevmType } from "@fhevm/hardhat-plugin";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

const TOKEN_DECIMALS = 6;

/**
 * Examples:
 *   - npx hardhat --network localhost task:fund-addresses
 *   - npx hardhat --network sepolia task:fund-addresses
 */
task("task:fund-addresses", "Prints the EncryptedFund and FHEETH addresses").setAction(
  async function (_taskArguments: TaskArguments, hre) {
    const { deployments } = hre;

    const fund = await deployments.get("EncryptedFund");
    const token = await deployments.get("FHEETH");

    console.log("EncryptedFund address is " + fund.address);
    console.log("FHEETH address is " + token.address);
  },
);

/**
 * Example:
 *   - npx hardhat --network sepolia task:fund-configure --name "Demo Fund" --goal 150 --end 1735689600
 */
task("task:fund-configure", "Configures the fund details")
  .addParam("name", "Fundraising name")
  .addParam("goal", "Fundraising goal in fETH")
  .addParam("end", "Fundraising end time (unix timestamp)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;

    const fund = await deployments.get("EncryptedFund");
    const fundContract = await ethers.getContractAt("EncryptedFund", fund.address);

    const goalUnits = ethers.parseUnits(taskArguments.goal, TOKEN_DECIMALS);
    const endTime = Number(taskArguments.end);

    const tx = await fundContract.configureFund(taskArguments.name, goalUnits, endTime);
    console.log(`Wait for tx:${tx.hash}...`);

    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);
  });

/**
 * Example:
 *   - npx hardhat --network sepolia task:fund-authorize
 */
task("task:fund-authorize", "Authorizes EncryptedFund as fETH operator")
  .addOptionalParam("until", "Unix timestamp for operator expiry")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;

    const fund = await deployments.get("EncryptedFund");
    const token = await deployments.get("FHEETH");

    const tokenContract = await ethers.getContractAt("FHEETH", token.address);

    const now = Math.floor(Date.now() / 1000);
    const until = taskArguments.until ? Number(taskArguments.until) : now + 60 * 60 * 24 * 30;

    const tx = await tokenContract.setOperator(fund.address, until);
    console.log(`Wait for tx:${tx.hash}...`);

    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);
  });

/**
 * Example:
 *   - npx hardhat --network localhost task:fund-mint --amount 25
 */
task("task:fund-mint", "Mints fETH to an address")
  .addParam("amount", "Amount in fETH")
  .addOptionalParam("to", "Recipient address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;

    const token = await deployments.get("FHEETH");
    const tokenContract = await ethers.getContractAt("FHEETH", token.address);

    const signers = await ethers.getSigners();
    const recipient = taskArguments.to ?? signers[0].address;

    const amountUnits = ethers.parseUnits(taskArguments.amount, TOKEN_DECIMALS);

    const tx = await tokenContract.mint(recipient, amountUnits);
    console.log(`Wait for tx:${tx.hash}...`);

    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);
  });

/**
 * Example:
 *   - npx hardhat --network sepolia task:fund-contribute --amount 10
 */
task("task:fund-contribute", "Contribute encrypted fETH to the fund")
  .addParam("amount", "Amount in fETH")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const fund = await deployments.get("EncryptedFund");
    const fundContract = await ethers.getContractAt("EncryptedFund", fund.address);

    const signers = await ethers.getSigners();
    const contributor = signers[0];

    const amountUnits = ethers.parseUnits(taskArguments.amount, TOKEN_DECIMALS);

    const encryptedInput = await fhevm
      .createEncryptedInput(fund.address, contributor.address)
      .add64(amountUnits)
      .encrypt();

    const tx = await fundContract.contribute(encryptedInput.handles[0], encryptedInput.inputProof);
    console.log(`Wait for tx:${tx.hash}...`);

    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);
  });

/**
 * Example:
 *   - npx hardhat --network sepolia task:fund-decrypt-total
 */
task("task:fund-decrypt-total", "Decrypt the total raised amount")
  .setAction(async function (_taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const fund = await deployments.get("EncryptedFund");
    const fundContract = await ethers.getContractAt("EncryptedFund", fund.address);

    const signers = await ethers.getSigners();

    const encryptedTotal = await fundContract.getTotalRaised();
    if (encryptedTotal === ethers.ZeroHash) {
      console.log("Total raised is 0");
      return;
    }

    const clearTotal = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedTotal,
      fund.address,
      signers[0],
    );

    console.log(`Encrypted total: ${encryptedTotal}`);
    console.log(`Clear total    : ${clearTotal}`);
  });

/**
 * Example:
 *   - npx hardhat --network sepolia task:fund-decrypt-contribution --user 0x...
 */
task("task:fund-decrypt-contribution", "Decrypt a contributor's amount")
  .addOptionalParam("user", "Contributor address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const fund = await deployments.get("EncryptedFund");
    const fundContract = await ethers.getContractAt("EncryptedFund", fund.address);

    const signers = await ethers.getSigners();
    const contributor = taskArguments.user ?? signers[0].address;

    const encryptedContribution = await fundContract.getContribution(contributor);
    if (encryptedContribution === ethers.ZeroHash) {
      console.log("Contribution is 0");
      return;
    }

    const clearContribution = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedContribution,
      fund.address,
      signers[0],
    );

    console.log(`Encrypted contribution: ${encryptedContribution}`);
    console.log(`Clear contribution    : ${clearContribution}`);
  });

/**
 * Example:
 *   - npx hardhat --network sepolia task:fund-close
 */
task("task:fund-close", "Closes the fund and transfers all fETH to the creator")
  .setAction(async function (_taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;

    const fund = await deployments.get("EncryptedFund");
    const fundContract = await ethers.getContractAt("EncryptedFund", fund.address);

    const tx = await fundContract.closeFund();
    console.log(`Wait for tx:${tx.hash}...`);

    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);
  });
