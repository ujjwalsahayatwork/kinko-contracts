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
  energyFiFactory: Contract;
  energyFiLocker: Contract;
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

  // deploy energyFi locker contract with dependend energyFi factory
  const energyFiFactory = await deployContract(wallet, PancakeFactory, [
    deployerAddress,
  ]);

  const energyFiLocker = await deployContract(wallet, PancakeLocker, [
    energyFiFactory.address,
  ]);

  //deploy launchpad generator with dependencies
  const devAddress = deployerAddress;
  const wbnb = await deployContract(wallet, WBNB, []);
  const launchpadFactory = await deployContract(wallet, LaunchpadFactory, []);
  const launchpadLockForwarder = await deployContract(
    wallet,
    LaunchpadLockForwarder,
    [launchpadFactory.address, energyFiFactory.address, energyFiLocker.address]
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
  await energyFiLocker.whitelistFeeAccount(launchpadLockForwarder.address, true);

  return {
    energyFiFactory,
    energyFiLocker,
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
