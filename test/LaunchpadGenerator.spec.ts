import chai, { expect } from "chai";
import { BigNumber, Contract, Signer, utils, constants } from "ethers";
import {
  solidity,
  createFixtureLoader,
  deployContract,
  MockProvider,
} from "ethereum-waffle";
import { generalFixture } from "./shared/fixtures";
import { defaultParams, gasLimit } from "./shared/utils";

import BurnToken from "../build/ERC20Burn.json";
import Launchpad from "../build/Launchpad.json";

chai.use(solidity);

describe("Generator", () => {
  let generator: Contract;
  let launchpadFactory: Contract;
  let launchpadLockForwarder: Contract;
  let launchpadSettings: Contract;
  let wbnb: Contract;
  let wallet: Signer;
  let otherWallet: Signer;
  let provider: MockProvider;

  beforeEach(async function () {
    // create fixtures
    provider = new MockProvider({
      ganacheOptions: gasLimit,
    });
    const loadFixture = createFixtureLoader(provider.getWallets(), provider);
    const fixture = await loadFixture(generalFixture);

    generator = fixture.launchpadGenerator;
    launchpadFactory = fixture.launchpadFactory;
    launchpadLockForwarder = fixture.launchpadLockForwarder;
    launchpadSettings = fixture.launchpadSettings;
    wbnb = fixture.wbnb;
    wallet = fixture.wallet;
    otherWallet = fixture.otherWallet;
  });

  it("should initilize variables on creation", async () => {
    const walletAddress = await wallet.getAddress();
    // check addresses
    expect(await generator.LAUNCHPAD_FACTORY()).to.be.equal(
      launchpadFactory.address
    );
    expect(await generator.LAUNCHPAD_LOCK_FORWARDER()).to.be.equal(
      launchpadLockForwarder.address
    );
    expect(await generator.WBNB()).to.be.equal(wbnb.address);
    expect(await generator.LAUNCHPAD_SETTINGS()).to.be.equal(
      launchpadSettings.address
    );
    expect(await generator.KINKO_DEV()).to.be.equal(walletAddress);
  });

  it("should create new launchpad", async () => {
    const owner = await wallet.getAddress();
    const saleToken = await deployContract(wallet, BurnToken, [18]);

    // approve generator with sale token amount
    const saleTokenAmount = await generator.calculateAmountRequired(
      defaultParams.amount,
      defaultParams.listing,
      defaultParams.liquidity
    );
    await saleToken.approve(generator.address, saleTokenAmount);

    // get expected launchpad address
    const expectedAddress = utils.getContractAddress({
      from: generator.address,
      nonce: BigNumber.from(1),
    });

    //create launchpad
    const launchpadParams = [];
    for (const [key, value] of Object.entries(defaultParams)) {
      launchpadParams.push(value);
    }
    const creationFee = await launchpadSettings.getGlmrCreationFee();
    const launchpadCreation = await generator.createLaunchpad(
      owner, // launchpad owner
      saleToken.address, // sale token
      wbnb.address, // base token
      constants.AddressZero, // referral
      launchpadParams,
      { ...gasLimit, value: creationFee }
    );

    expect(launchpadCreation)
      .to.emit(launchpadFactory, "launchpadRegistered")
      .withArgs(expectedAddress);
    expect(launchpadCreation)
      .to.emit(saleToken, "Transfer")
      .withArgs(owner, expectedAddress, saleTokenAmount);

    expect(await launchpadFactory.launchpadAtIndex(0)).to.be.equal(
      expectedAddress
    );
    expect(await launchpadFactory.launchpadsLength()).to.be.equal(1);

    // check if launchpad has been initilized correctly
    const launchpad = new Contract(
      expectedAddress,
      JSON.stringify(Launchpad.abi),
      provider
    ).connect(wallet);
    expect(await launchpad.LAUNCHPAD_GENERATOR()).to.be.equal(
      generator.address
    );
    expect(await launchpad.WBNB()).to.be.equal(wbnb.address);
    expect(await launchpad.launchpadSettings()).to.be.equal(
      launchpadSettings.address
    );
    expect(await launchpad.launchpadLockForwarder()).to.be.equal(
      launchpadLockForwarder.address
    );
    expect(await launchpad.getLaunchpadStatus()).to.be.equal(1);
    expect(await launchpad.getWhitelistedUsersLength()).to.be.equal(0);
  });

  describe("should fail creating new launchpad", async () => {
    let owner: string;
    let saleToken: Contract;
    let creationFee: number;
    beforeEach(async function () {
      owner = await wallet.getAddress();
      saleToken = await deployContract(wallet, BurnToken, [18]);
      creationFee = await launchpadSettings.getGlmrCreationFee();
    });

    let launchpadParams = [
      200000, // amount
      20, // hardcap
      15, // softcap
      500, // liquidity percent
      20, // listing rate
      20, // max spend per buyer
      1000000, // lock period
      10, // start time
      20, // end time
    ];
    it("should fail without approving sale token", async () => {
      // approve generator with sale token amount
      await expect(
        generator.createLaunchpad(
          owner, // launchpad owner
          saleToken.address, // sale token
          wbnb.address, // base token
          constants.AddressZero, // referral
          launchpadParams,
          { ...gasLimit, value: creationFee }
        )
      ).to.be.revertedWith("TransferHelper: TRANSFER_FROM_FAILED");
    });

    it("should fail with isufficient creation fee", async () => {
      // fail creation with insufficient value as creation fee
      await expect(
        generator.createLaunchpad(
          owner, // launchpad owner
          saleToken.address, // sale token
          wbnb.address, // base token
          constants.AddressZero, // referral
          launchpadParams,
          { ...gasLimit }
        )
      ).to.be.revertedWith("FEE NOT MET");
    });

    it("should fail with invalid referral", async () => {
      // approve generator with sale token amount
      await saleToken.approve(generator.address, constants.MaxUint256);
      // fail creation with invalid referral
      await expect(
        generator.createLaunchpad(
          owner, // launchpad owner
          saleToken.address, // sale token
          wbnb.address, // base token
          owner, // referral
          launchpadParams,
          { ...gasLimit, value: creationFee }
        )
      ).to.be.revertedWith("INVALID REFERRAL");
    });

    it("should fail with insufficient amount", async () => {
      // approve generator with sale token amount
      await saleToken.approve(generator.address, constants.MaxUint256);
      // fail creation with insufficient amount
      launchpadParams[0] = 1000;
      await expect(
        generator.createLaunchpad(
          owner, // launchpad owner
          saleToken.address, // sale token
          wbnb.address, // base token
          constants.AddressZero, // referral
          launchpadParams,
          { ...gasLimit, value: creationFee }
        )
      ).to.be.revertedWith("MIN DIVIS");
    });

    it("should fail with invalid time period", async () => {
      // approve generator with sale token amount
      await saleToken.approve(generator.address, constants.MaxUint256);
      // fail creation with invalid time period
      launchpadParams[0] = 20000;
      launchpadParams[7] = 1;
      launchpadParams[8] = 9999999999999;
      await expect(
        generator.createLaunchpad(
          owner, // launchpad owner
          saleToken.address, // sale token
          wbnb.address, // base token
          constants.AddressZero, // referral
          launchpadParams,
          { ...gasLimit, value: creationFee }
        )
      ).to.be.revertedWith("INVALID TIME PERIOD");
    });

    it("should fail with invalid hardcap", async () => {
      // approve generator with sale token amount
      await saleToken.approve(generator.address, constants.MaxUint256);
      // fail creation with invalid token price and hardcap
      launchpadParams[3] = 200;
      launchpadParams[7] = 1;
      launchpadParams[8] = 10;
      await expect(
        generator.createLaunchpad(
          owner, // launchpad owner
          saleToken.address, // sale token
          wbnb.address, // base token
          constants.AddressZero, // referral
          launchpadParams,
          { ...gasLimit, value: creationFee }
        )
      ).to.be.revertedWith("INVALID LIQUIDITY");
    });
  });
});
