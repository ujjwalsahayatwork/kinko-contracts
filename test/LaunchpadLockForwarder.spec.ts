import chai, { expect } from "chai";
import { Contract, Signer, constants } from "ethers";
import {
  solidity,
  createFixtureLoader,
  deployContract,
  MockProvider,
} from "ethereum-waffle";
import { generalFixture } from "./shared/fixtures";
import { gasLimit } from "./shared/utils";

import BurnToken from "../build/ERC20Burn.json";

chai.use(solidity);

describe("LockForwarder", () => {
  let pancakeFactory: Contract;
  let pancakeLocker: Contract;
  let launchpadFactory: Contract;
  let lockForwarder: Contract;
  let wbnb: Contract;
  let saleToken: Contract;
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

    pancakeFactory = fixture.pancakeFactory;
    pancakeLocker = fixture.pancakeLocker;
    launchpadFactory = fixture.launchpadFactory;
    lockForwarder = fixture.launchpadLockForwarder;
    wbnb = fixture.wbnb;
    wallet = fixture.wallet;
    otherWallet = fixture.otherWallet;

    saleToken = await deployContract(wallet, BurnToken, [18]);
  });

  it("should initilize variables", async () => {
    const walletAddress = await wallet.getAddress();
    expect(await lockForwarder.LAUNCHPAD_FACTORY()).to.be.equal(
      launchpadFactory.address
    );
    expect(await lockForwarder.KINKO_LOCKER()).to.be.equal(
      pancakeLocker.address
    );
    expect(await lockForwarder.KINKO_FACTORY()).to.be.equal(
      pancakeFactory.address
    );
  });

  describe("should ckeck for initilized pair", async () => {
    it("pancake pair does not exists", async () => {
      const pancakePair = await pancakeFactory.getPair(
        saleToken.address,
        wbnb.address
      );
      const pairInitilized = await lockForwarder.pancakeswapPairIsInitialised(
        saleToken.address,
        wbnb.address
      );
      expect(pancakePair).to.be.equal(constants.AddressZero);
      expect(pairInitilized).to.be.false;
    });

    it("pancake pair has no liquidity", async () => {
      // create pancake pair
      await pancakeFactory.createPair(saleToken.address, wbnb.address);
      const pancakePair = await pancakeFactory.getPair(
        saleToken.address,
        wbnb.address
      );

      const pairInitilized = await lockForwarder.pancakeswapPairIsInitialised(
        saleToken.address,
        wbnb.address
      );
      expect(pancakePair).to.be.not.equal(constants.AddressZero);
      expect(await saleToken.balanceOf(pancakePair)).to.be.equal(0);
      expect(pairInitilized).to.be.false;
    });

    it("pancake pair is initilized", async () => {
      // create pancake pair and send liquidity
      await pancakeFactory.createPair(saleToken.address, wbnb.address);
      const pancakePair = await pancakeFactory.getPair(
        saleToken.address,
        wbnb.address
      );
      await saleToken.transfer(pancakePair, 10000);

      const pairInitilized = await lockForwarder.pancakeswapPairIsInitialised(
        saleToken.address,
        wbnb.address
      );
      expect(pancakePair).to.be.not.equal(constants.AddressZero);
      expect(await saleToken.balanceOf(pancakePair)).to.be.equal(10000);
      expect(pairInitilized).to.be.true;
    });
  });

  it("Should create new pair on locking liquidity", async () => {
    // register launchpad - use wallet as launchpad
    const walletAddress = await wallet.getAddress();
    await launchpadFactory.adminAllowLaunchpadGenerator(walletAddress, true);
    await launchpadFactory.registerLaunchpad(walletAddress, gasLimit);

    // check for pair address before
    let pancakePair = await pancakeFactory.getPair(
      saleToken.address,
      wbnb.address
    );
    expect(pancakePair).to.be.equal(constants.AddressZero);

    // define locking amounts
    const saleAmount = 100000;
    const baseAmount = 10000;

    // approve locker with base and sale token
    await wbnb.deposit({ value: baseAmount });
    await wbnb.approve(lockForwarder.address, baseAmount);
    await saleToken.approve(lockForwarder.address, saleAmount);

    // lock liquidity
    await lockForwarder.lockLiquidity(
      wbnb.address, // base tokens
      saleToken.address, // sale token
      baseAmount,
      saleAmount,
      9999999, // unlock date
      walletAddress, // withdrawer
      gasLimit
    );

    // check for pair address after
    pancakePair = await pancakeFactory.getPair(saleToken.address, wbnb.address);
    expect(pancakePair).to.be.not.equal(constants.AddressZero);

    // check LP supply
    const lp = new Contract(
      pancakePair,
      JSON.stringify(BurnToken.abi),
      provider
    ).connect(wallet);
    expect(await lp.totalSupply()).to.be.equal(31622);

    // check locker balance after fees
    expect(await lp.balanceOf(lockForwarder.address)).to.be.equal(0);
    expect(await lp.balanceOf(pancakeLocker.address)).to.be.equal(30316);
  });

  it("Should use existing pair on locking liquidity", async () => {
    // register launchpad - use wallet as launchpad
    const walletAddress = await wallet.getAddress();
    await launchpadFactory.adminAllowLaunchpadGenerator(walletAddress, true);
    await launchpadFactory.registerLaunchpad(walletAddress, gasLimit);

    // create new pancake pair
    await pancakeFactory.createPair(saleToken.address, wbnb.address);
    const pancakePair = await pancakeFactory.getPair(
      saleToken.address,
      wbnb.address
    );
    expect(pancakePair).to.be.not.equal(constants.AddressZero);

    // check LP supply
    const lp = new Contract(
      pancakePair,
      JSON.stringify(BurnToken.abi),
      provider
    ).connect(wallet);
    expect(await lp.totalSupply()).to.be.equal(0);

    // define locking amounts
    const saleAmount = 100000;
    const baseAmount = 10000;

    // approve locker with base and sale token
    await wbnb.deposit({ value: baseAmount });
    await wbnb.approve(lockForwarder.address, baseAmount);
    await saleToken.approve(lockForwarder.address, saleAmount);

    // lock liquidity
    await lockForwarder.lockLiquidity(
      wbnb.address, // base tokens
      saleToken.address, // sale token
      baseAmount,
      saleAmount,
      9999999, // unlock date
      walletAddress, // withdrawer
      gasLimit
    );

    // check LP supply after locking
    expect(await lp.totalSupply()).to.be.equal(31622);

    // check locker balance after fees
    expect(await lp.balanceOf(lockForwarder.address)).to.be.equal(0);
    expect(await lp.balanceOf(pancakeLocker.address)).to.be.equal(30316);
  });

  it("Should fail locking with insufficient tokens", async () => {
    // register launchpad - use wallet as launchpad
    const walletAddress = await wallet.getAddress();
    await launchpadFactory.adminAllowLaunchpadGenerator(walletAddress, true);
    await launchpadFactory.registerLaunchpad(walletAddress, gasLimit);

    // define locking amounts
    const saleAmount = 100000;
    const baseAmount = 10000;

    // approve locker with base and sale token
    await wbnb.deposit({ value: baseAmount - 1 });
    await wbnb.approve(lockForwarder.address, baseAmount);
    await saleToken.approve(lockForwarder.address, saleAmount);

    // lock liquidity
    await expect(
      lockForwarder.lockLiquidity(
        wbnb.address, // base tokens
        saleToken.address, // sale token
        baseAmount,
        saleAmount,
        9999999, // unlock date
        walletAddress, // withdrawer
        gasLimit
      )
    ).to.be.revertedWith("TransferHelper: TRANSFER_FROM_FAILED");
  });

  it("Should fail locking if launchpad is not registered", async () => {
    // define locking amounts
    const saleAmount = 100000;
    const baseAmount = 10000;

    // approve locker with base and sale token
    await wbnb.deposit({ value: baseAmount });
    await wbnb.approve(lockForwarder.address, baseAmount);
    await saleToken.approve(lockForwarder.address, saleAmount);

    // lock liquidity
    await expect(
      lockForwarder.lockLiquidity(
        wbnb.address, // base tokens
        saleToken.address, // sale token
        baseAmount,
        saleAmount,
        9999999, // unlock date
        saleToken.address, // withdrawer
        gasLimit
      )
    ).to.be.revertedWith("LAUNCHPAD NOT REGISTERED");
  });
});
