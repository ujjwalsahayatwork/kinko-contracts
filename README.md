# Pancake launchpad contracts

This repository contains the smart contracts for the launchpad enviroment of Pancake to create ILOs. Truffle is used as the development framework.

## Contract overview

The main contracts are:

- [LaunchpadFactory](contracts/LaunchpadFactory.sol): Registers generated launchpads and generators allowed to create new launchpads
- [LaunchpadGenerator](contracts/LaunchpadGenerator.sol): Is used to create new launchpads
- [LaunchpadSettings](contracts/LaunchpadSettings.sol): Contains general settings about the launchpads fees, limitations and fee receiving addresses
- [Launchpad](contracts/Launchpad.sol): The main file of this repository. Represents the ILO and holds logic for getting sale tokens (launched tokens) for a base token (BNB or stable coins).
- [LaunchpadLockForwarder](contracts/LaunchpadLockForwarder.sol): Creates a new Pancakeswap pair after the ILO was successful and the launchpad ended. The minted LP tokens are forwarded to the PancakeLocker contract
- [PancakeLocker](contracts/PancakeLocker.sol): Locks created LP tokens for a given amount of time after the launchpad has ended successfully.

There are also a couple of utility contracts for testing purposes, which should not be part of any audit:

- [PancakeFactory](contracts/test/PancakeFactory.sol): Pre-deployed Pancakeswap factory
- [WETH9](contracts/test/WETH9.sol): Pre-deployed WBNB contract

All contracts build heavily on top of industry-standard OpenZeppelin contracts.

## Mainnet deployment

The contract of this repository are deployed on the BSC mainnet with the following addresses:

- PancakeLocker: [0x36366391c211F67cbbF13C179e1140734B463539](https://bscscan.com/address/0x36366391c211F67cbbF13C179e1140734B463539)
- LaunchpadFactory: [0x3a8C10C0b88f266E63EE3392A0404233aB177ad5](https://bscscan.com/address/0x3a8C10C0b88f266E63EE3392A0404233aB177ad5)
- LaunchpadLockForwarder: [0x12607c89Fa81Dc02d33077f7D6C79D64FDc93E4d](https://bscscan.com/address/0x12607c89Fa81Dc02d33077f7D6C79D64FDc93E4d)
- LaunchpadSettings: [0xAD3144d903e932C49c7617100D334E0a3674cBf1](https://bscscan.com/address/0xAD3144d903e932C49c7617100D334E0a3674cBf1)
- LaunchPadGenerator: [0xe71e583b5f5D0977C6c133Bab7E93B5e949e44C2](https://bscscan.com/address/0xe71e583b5f5D0977C6c133Bab7E93B5e949e44C2)

## Testnet deployment

The contract of this repository are deployed on the BSC testnet with the following addresses:

- PancakeFactory: [0xB7926C0430Afb07AA7DEfDE6DA862aE0Bde767bc](https://testnet.bscscan.com/address/0xB7926C0430Afb07AA7DEfDE6DA862aE0Bde767bc)
- WBNB: [0xae13d989dac2f0debff460ac112a837c89baa7cd](https://testnet.bscscan.com/address/0xae13d989dac2f0debff460ac112a837c89baa7cd)
- PancakeLocker: [0x3a8652a56918E50A7A6B784b81704f0f401fD195](https://testnet.bscscan.com/address/0x3a8652a56918E50A7A6B784b81704f0f401fD195)
- LaunchpadFactory: [0x36366391c211F67cbbF13C179e1140734B463539](https://testnet.bscscan.com/address/0x36366391c211F67cbbF13C179e1140734B463539)
- LaunchpadLockForwarder: [0x3a8C10C0b88f266E63EE3392A0404233aB177ad5](https://testnet.bscscan.com/address/0x3a8C10C0b88f266E63EE3392A0404233aB177ad5)
- LaunchpadSettings: [0x12607c89Fa81Dc02d33077f7D6C79D64FDc93E4d](https://testnet.bscscan.com/address/0x12607c89Fa81Dc02d33077f7D6C79D64FDc93E4d)
- LaunchPadGenerator: [0xAD3144d903e932C49c7617100D334E0a3674cBf1](https://testnet.bscscan.com/address/0xAD3144d903e932C49c7617100D334E0a3674cBf1)

## Building

```
yarn

yarn compile
# or npx waffle
# or npx truffle compile
```

## Running unit tests

```
yarn test
# or npx mocha
```

## Deployment

Truffle migrations are used for deployments:

```
npx truffle migrate --network NETWORK
```

Where network is the selected network specified in truffle config file.

## Verify contracts

Truffle verify plugin is used for contract code verification:

```
npx truffle run verify PancakeLocker LaunchpadFactory LaunchpadLockForwarder LaunchpadSettings LaunchpadGenerator --network NETWORK
```

Where network is the selected network specified in truffle config file.
