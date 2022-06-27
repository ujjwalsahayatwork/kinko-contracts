const BN = require("bn.js");
const fs = require("fs");

const PancakeLocker = artifacts.require("PancakeLocker");
const PancakeFactory = artifacts.require("PancakeFactory");
const LaunchpadSettings = artifacts.require("LaunchpadSettings");
const LaunchpadFactory = artifacts.require("LaunchpadFactory");
const LaunchpadLockForwarder = artifacts.require("LaunchpadLockForwarder");
const LaunchpadGenerator = artifacts.require("LaunchpadGenerator");
const WBNB = artifacts.require("WBNB");

module.exports = async function (deployer, network, accounts) {
  let pancakeFactoryAddress;
  let wbnbAddress;
  if (network === "testnet") {
    // use existing pancake contract
    pancakeFactoryAddress = "0x6725F303b657a9451d8BA641348b6761A6CC7a17";
    wbnbAddress = "0xae13d989dac2f0debff460ac112a837c89baa7cd";
  } else if(network === "bsc"){
    pancakeFactoryAddress = "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73";
    wbnbAddress = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
  }else if(network === "moonbase"){
    pancakeFactoryAddress = "0xF6899c78240F9055F6a896D63Df4dBfbbAa4eace";
    wbnbAddress = "0xA5fd1F6e7980Fd5cA9d062a762030D449990BBBf";
  }else if(network === "moonbeam"){
    pancakeFactoryAddress = "0x7c7EaEa389d958BB37a3fd08706Ca884D53Dc1F3";
    wbnbAddress = "0xAcc15dC74880C9944775448304B263D191c6077F";
  }
  else {
    // deploy pancake factory
    await deployer.deploy(PancakeFactory, accounts[0]);
    const pancakeFactory = await PancakeFactory.deployed();
    pancakeFactoryAddress = pancakeFactory.address;

    // deploy wbnb
    await deployer.deploy(WBNB);
    const wbnb = await WBNB.deployed();
    wbnbAddress = wbnb.address;
  }

  // deploy pancake liquidity locker
  await deployer.deploy(PancakeLocker, pancakeFactoryAddress);
  const pancakeLocker = await PancakeLocker.deployed();

  // deploy launchpad factory
  await deployer.deploy(LaunchpadFactory);
  const launchpadFactory = await LaunchpadFactory.deployed();

  // deploy launchpad lock forwarder
  await deployer.deploy(
    LaunchpadLockForwarder,
    launchpadFactory.address,
    pancakeFactoryAddress,
    pancakeLocker.address
  );
  const launchpadLockForwarder = await LaunchpadLockForwarder.deployed();

  // deploy launchpad settings
  await deployer.deploy(LaunchpadSettings);
  const launchpadSettings = await LaunchpadSettings.deployed();

  // deploy launchpad generator
  await deployer.deploy(
    LaunchpadGenerator,
    launchpadFactory.address,
    launchpadSettings.address,
    wbnbAddress,
    launchpadLockForwarder.address,
    accounts[0]
  );
  const launchpadGenerator = await LaunchpadGenerator.deployed();

  // add generator to factory
  await launchpadFactory.adminAllowLaunchpadGenerator(
    launchpadGenerator.address,
    true
  );

  // whitelist launchpadLockForwarder in PancakeLocker
  await pancakeLocker.whitelistFeeAccount(launchpadLockForwarder.address, true);

  const addresses = {
    deployer: accounts[0],
    pancakeFactory: pancakeFactoryAddress,
    pancakeLocker: pancakeLocker.address,
    wbnb: wbnbAddress,
    launchpadFactory: launchpadFactory.address,
    launchpadLockForwarder: launchpadLockForwarder.address,
    launchpadSettings: launchpadSettings.address,
    launchpadGenerator: launchpadGenerator.address,
  };
  const json = JSON.stringify(addresses, null, 4);
  fs.writeFileSync("deployment.json", json);
};
