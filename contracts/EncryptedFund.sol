// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";

contract EncryptedFund is ZamaEthereumConfig {
    address public immutable creator;
    IERC7984 public immutable token;

    string private _fundName;
    uint256 private _fundGoal;
    uint64 private _fundEndTime;
    bool public isConfigured;
    bool public isClosed;

    euint64 private _totalRaised;
    mapping(address => euint64) private _contributions;

    event FundConfigured(string name, uint256 goal, uint64 endTime);
    event ContributionReceived(address indexed contributor, euint64 amount);
    event FundClosed(address indexed creator, euint64 totalRaised);

    error FundAlreadyConfigured();
    error FundNotConfigured();
    error FundClosedAlready();
    error FundEnded();
    error InvalidFundConfig();
    error NotCreator();

    constructor(address tokenAddress) {
        creator = msg.sender;
        token = IERC7984(tokenAddress);
    }

    function configureFund(string calldata name, uint256 goal, uint64 endTime) external {
        if (msg.sender != creator) {
            revert NotCreator();
        }
        if (isConfigured) {
            revert FundAlreadyConfigured();
        }
        if (bytes(name).length == 0 || goal == 0 || endTime <= block.timestamp) {
            revert InvalidFundConfig();
        }

        _fundName = name;
        _fundGoal = goal;
        _fundEndTime = endTime;
        isConfigured = true;

        emit FundConfigured(name, goal, endTime);
    }

    function contribute(externalEuint64 encryptedAmount, bytes calldata inputProof) external {
        if (!isConfigured) {
            revert FundNotConfigured();
        }
        if (isClosed) {
            revert FundClosedAlready();
        }
        if (block.timestamp >= _fundEndTime) {
            revert FundEnded();
        }

        euint64 transferred = token.confidentialTransferFrom(msg.sender, address(this), encryptedAmount, inputProof);

        euint64 updatedContribution = FHE.add(_contributions[msg.sender], transferred);
        _contributions[msg.sender] = updatedContribution;

        euint64 updatedTotal = FHE.add(_totalRaised, transferred);
        _totalRaised = updatedTotal;

        FHE.allowThis(updatedContribution);
        FHE.allow(updatedContribution, msg.sender);

        FHE.allowThis(updatedTotal);
        FHE.allow(updatedTotal, creator);

        emit ContributionReceived(msg.sender, transferred);
    }

    function closeFund() external {
        if (msg.sender != creator) {
            revert NotCreator();
        }
        if (!isConfigured) {
            revert FundNotConfigured();
        }
        if (isClosed) {
            revert FundClosedAlready();
        }

        isClosed = true;

        euint64 total = _totalRaised;
        FHE.allowThis(total);
        FHE.allow(total, creator);
        token.confidentialTransfer(creator, total);

        emit FundClosed(creator, total);
    }

    function getFundName() external view returns (string memory) {
        return _fundName;
    }

    function getFundGoal() external view returns (uint256) {
        return _fundGoal;
    }

    function getFundEndTime() external view returns (uint64) {
        return _fundEndTime;
    }

    function getTotalRaised() external view returns (euint64) {
        return _totalRaised;
    }

    function getContribution(address contributor) external view returns (euint64) {
        return _contributions[contributor];
    }

    function isActive() external view returns (bool) {
        return isConfigured && !isClosed && block.timestamp < _fundEndTime;
    }
}
