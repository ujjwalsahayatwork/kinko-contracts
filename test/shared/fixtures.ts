import { Contract, Signer } from "ethers";
import { deployContract } from "ethereum-waffle";

import PancakeLocker from "../../build/PancakeLocker.json";
import PancakeFactory from "../../build/PancakeFactory.json";

import LaunchpadSettings from "../../build/LaunchpadSettings.json";
import LaunchpadFactory from "../../build/LaunchpadFactory.json";
import LaunchpadLockForwarder from "../../build/LaunchpadLockForwarder.json";
import LaunchpadGenerator from "../../build/LaunchpadGenerator.json";
import WBNB from "../../build/WBNB.json";

interface Fixture {
  pancakeFactory: Contract;
  pancakeLocker: Contract;
  wbnb: Contract;
  launchpadFactory: Contract;
  launchpadLockForwarder: Contract;
  launchpadSettings: Contract;
  launchpadGenerator: Contract;
  wallet: Signer;
  otherWallet: Signer;
  buyerWallet: Signer;
  secondBuyerWallet: Signer;
}

export async function generalFixture(wallets: Signer[]): Promise<Fixture> {
  const [wallet, otherWallet, buyerWallet, secondBuyerWallet] = wallets;
  const deployerAddress = await wallet.getAddress();

  // deploy pancake locker contract with dependend pancake factory
  const pancakeFactory = await deployContract(wallet, PancakeFactory, [
    deployerAddress,
  ]);

  const pancakeLocker = await deployContract(wallet, PancakeLocker, [
    pancakeFactory.address,
  ]);

  //deploy launchpad generator with dependencies
  const devAddress = deployerAddress;
  const wbnb = await deployContract(wallet, WBNB, []);
  const launchpadFactory = await deployContract(wallet, LaunchpadFactory, []);
  const launchpadLockForwarder = await deployContract(
    wallet,
    LaunchpadLockForwarder,
    [launchpadFactory.address, pancakeFactory.address, pancakeLocker.address]
  );
  const launchpadSettings = await deployContract(wallet, LaunchpadSettings, []);
  const launchpadGenerator = await deployContract(wallet, LaunchpadGenerator, [
    launchpadFactory.address,
    launchpadSettings.address,
    wbnb.address,
    launchpadLockForwarder.address,
    devAddress,
  ]);

  // add generator to factory
  await launchpadFactory.adminAllowLaunchpadGenerator(
    launchpadGenerator.address,
    true
  );

  // whitelist launchpadLockForwarder in PancakeLocker
  await pancakeLocker.whitelistFeeAccount(launchpadLockForwarder.address, true);

  return {
    pancakeFactory,
    pancakeLocker,
    wbnb,
    launchpadFactory,
    launchpadLockForwarder,
    launchpadSettings,
    launchpadGenerator,
    wallet,
    otherWallet,
    buyerWallet,
    secondBuyerWallet,
  };
}
