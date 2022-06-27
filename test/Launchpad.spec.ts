import chai, { expect } from "chai";

import { BigNumber, Contract, Signer, constants } from "ethers";
import {
  solidity,
  createFixtureLoader,
  MockProvider,
  deployContract,
} from "ethereum-waffle";
import { generalFixture } from "./shared/fixtures";
import {
  burnAddress,
  calcLiquidityAmounts,
  createLaunchpad,
  defaultParams,
  expandTo18Decimals,
  gasLimit,
  now,
  timeTravel,
} from "./shared/utils";

import BurnToken from "../build/contracts/ERC20Burn.json";

chai.use(solidity);

describe("Launchpad", () => {
  let generator: Contract;
  let launchpadFactory: Contract;
  let launchpadSettings: Contract;
  let lockForwarder: Contract;
  let wbnb: Contract;
  let saleToken: Contract;
  let pancakeFactory: Contract;
  let wallet: Signer;
  let otherWallet: Signer;
  let buyerWallet: Signer;
  let secondBuyerWallet: Signer;
  let refferWallet: Signer;
  let provider: MockProvider;

  const createNewLaunchpad = async (
    baseToken: Contract,
    amount?: number,
    hardcap?: number,
    softcap?: number,
    maxSpend?: number,
    liquidityPercent?: number,
    listingRate?: number,
    startTime?: number,
    endTime?: number,
    lockPeriod?: number
  ): Promise<Contract> => {
    return await createLaunchpad(
      otherWallet,
      generator,
      saleToken,
      baseToken,
      launchpadFactory,
      launchpadSettings,
      provider,
      amount,
      hardcap,
      softcap,
      maxSpend,
      liquidityPercent,
      listingRate,
      startTime,
      endTime,
      lockPeriod
    );
  };

  beforeEach(async function () {
    // create fixtures
    provider = new MockProvider({
      ganacheOptions: gasLimit,
    });
    const loadFixture = createFixtureLoader(provider.getWallets(), provider);
    const fixture = await loadFixture(generalFixture);

    generator = fixture.launchpadGenerator;
    launchpadFactory = fixture.launchpadFactory;
    launchpadSettings = fixture.launchpadSettings;
    lockForwarder = fixture.launchpadLockForwarder;
    pancakeFactory = fixture.pancakeFactory;
    wbnb = fixture.wbnb;
    wallet = fixture.wallet;
    otherWallet = fixture.otherWallet;
    buyerWallet = fixture.buyerWallet;
    secondBuyerWallet = fixture.secondBuyerWallet;

    // deploy sale token contract
    saleToken = await deployContract(otherWallet, BurnToken, [18]);
  });

  it("should initilize correctly", async () => {
    const launchpad = await createNewLaunchpad(wbnb);
    const walletAddress = await otherWallet.getAddress();
    // check relatet addresses
    expect(await launchpad.launchpadLockForwarder()).to.be.equal(
      lockForwarder.address
    );
    expect(await launchpad.launchpadSettings()).to.be.equal(
      launchpadSettings.address
    );
    expect(await launchpad.WBNB()).to.be.equal(wbnb.address);
    expect(await launchpad.LAUNCHPAD_GENERATOR()).to.be.equal(
      generator.address
    );

    // check initial infos
    const info = await launchpad.launchpadInfo();
    expect(info.launchpadOwner).to.be.equal(walletAddress);
    expect(info.sToken).to.be.equal(saleToken.address);
    expect(info.bToken).to.be.equal(wbnb.address);
    expect(info.amount).to.be.equal(defaultParams.amount);
    expect(info.tokenPrice).to.be.equal(
      defaultParams.hardcap
        .mul(BigNumber.from(10).pow(18))
        .div(defaultParams.amount)
    );
    expect(info.maxSpendPerBuyer).to.be.equal(defaultParams.maxSpend);
    expect(info.softCap).to.be.equal(defaultParams.softcap);
    expect(info.hardcap).to.be.equal(defaultParams.hardcap);
    expect(info.liquidityPercentage).to.be.equal(defaultParams.liquidity);
    expect(info.listingRate).to.be.equal(defaultParams.listing);
    expect(info.lockPeriod).to.be.equal(defaultParams.lockPeriod);
    expect(info.startTime).to.be.equal(defaultParams.startTime);
    expect(info.endTime).to.be.equal(defaultParams.endTime);
    expect(info.isBNB).to.be.true;

    // check initial status
    const status = await launchpad.launchpadStatus();
    expect(status.forceFailed).to.be.false;
    expect(status.lpGenerationComplete).to.be.false;
    expect(status.whitelistOnly).to.be.false;
    expect(status.totalBaseCollected).to.be.equal(0);
    expect(status.totalBaseWithdrawn).to.be.equal(0);
    expect(status.totalTokensSold).to.be.equal(0);
    expect(status.totalTokensWithdrawn).to.be.equal(0);
    expect(status.numBuyers).to.be.equal(0);
    expect(status.round1Length).to.be.equal(
      await launchpadSettings.getRound1Length()
    );
  });

  it("should fail user deposit before start", async () => {
    // set startTime to future
    const launchpad = await createNewLaunchpad(
      wbnb,
      10,
      2,
      1,
      1,
      500,
      5,
      now + 1000,
      now + 7000
    );
    const amount = expandTo18Decimals(1);
    await expect(
      launchpad.userDeposit(amount, [],{
        ...gasLimit,
        value: amount,
      })
    ).to.be.revertedWith("NOT ACTIVE");
  });

  it("should fail user deposit after end", async () => {
    // set startTime to future
    const launchpad = await createNewLaunchpad(
      wbnb,
      10,
      2,
      1,
      1,
      500,
      5,
      now - 7000,
      now - 1000
    );
    const amount = expandTo18Decimals(1);
    await expect(
      launchpad.userDeposit(amount,[], {
        ...gasLimit,
        value: amount,
      })
    ).to.be.revertedWith("NOT ACTIVE");
  });

  it("should deposit", async () => {
    const buyer = await otherWallet.getAddress();
    const launchpad = await createNewLaunchpad(wbnb);
    const depositAmount = expandTo18Decimals(5);
    await launchpad.userDeposit(depositAmount,[], {
      ...gasLimit,
      value: depositAmount,
    });
    const buyerInfo = await launchpad.buyers(buyer);
    expect(buyerInfo.baseDeposited).to.be.equal(depositAmount);
    expect(buyerInfo.tokensOwed).to.be.equal(
      depositAmount
        .mul(
          defaultParams.amount
            .mul(BigNumber.from(10).pow(18))
            .div(defaultParams.hardcap)
        )
        .div(BigNumber.from(10).pow(18))
    );
  });

  it("should fail user deposit more than max spend", async () => {
    const maxSpend = 5;
    const launchpad = await createNewLaunchpad(
      wbnb,
      undefined,
      undefined,
      undefined,
      maxSpend
    );
    const amount = expandTo18Decimals(maxSpend);
    await launchpad.userDeposit(amount,[], {
      ...gasLimit,
      value: amount,
    });

    const additionalAmount = expandTo18Decimals(1);
    await expect(
      launchpad.userDeposit(additionalAmount,[], {
        ...gasLimit,
        value: additionalAmount,
      })
    ).to.be.revertedWith("ZERO TOKENS");
  });

  it("should be able to giver rewards additionalAmount",async () => {
    
  });

  it("should revert user deposit if hardcap is met", async () => {
    const launchpad = await createNewLaunchpad(wbnb);
    const amount = defaultParams.maxSpend;
    await launchpad.userDeposit(amount,[] ,{
      ...gasLimit,
      value: amount,
    });

    // launchpad should be finished - hardcap met
    const status = await launchpad.getLaunchpadStatus();
    expect(status).to.be.equal(2);

    const additionalAmount = expandTo18Decimals(1);
    await expect(
      launchpad.userDeposit(additionalAmount, [],{
        ...gasLimit,
        value: additionalAmount,
      })
    ).to.be.revertedWith("NOT ACTIVE");
  });

  it("should fail sale token withdraw before end", async () => {
    const launchpad = await createNewLaunchpad(wbnb);
    const amount = expandTo18Decimals(1);
    await launchpad.userDeposit(amount,[], {
      ...gasLimit,
      value: amount,
    });
    await expect(launchpad.userWithdrawTokens()).to.be.revertedWith(
      "AWAITING LP GENERATION"
    );
  });

  it("should fail base token withdraw before fail", async () => {
    const launchpad = await createNewLaunchpad(wbnb);
    const amount = expandTo18Decimals(1);
    await launchpad.userDeposit(amount,[], {
      ...gasLimit,
      value: amount,
    });
    await expect(launchpad.userWithdrawBaseTokens()).to.be.revertedWith(
      "NOT FAILED"
    );
  });

  it("should deposit with rewards", async () => {
    const buyer = await otherWallet.getAddress();
    const reffer = await otherWallet.getAddress();

    const launchpad = await createNewLaunchpad(wbnb);
    const depositAmount = expandTo18Decimals(5);
    await launchpad.userDeposit(depositAmount,[reffer,], {
      ...gasLimit,
      value: depositAmount,
    });
    const buyerInfo = await launchpad.buyers(buyer);
    const refferInfo = await launchpad.rewardTokens(reffer);

    const tokensOwed = await launchpad.buyers(buyer)
      
    const reward = tokensOwed[1].mul(BigNumber.from(100)).div(BigNumber.from(10000));


    expect(buyerInfo.baseDeposited).to.be.equal(depositAmount);

    expect(refferInfo).to.be.equal(reward);
 
    expect(buyerInfo.tokensOwed).to.be.equal(
      depositAmount
        .mul(
          defaultParams.amount
            .mul(BigNumber.from(10).pow(18))
            .div(defaultParams.hardcap)
        )
        .div(BigNumber.from(10).pow(18))
    );
  });



  describe("Launchpad failed", () => {
    it("should fail if softcap is not met on end", async () => {
      const launchpad = await createNewLaunchpad(wbnb);
      const amount = expandTo18Decimals(1).div(10);
      await launchpad.userDeposit(amount,[], {
        ...gasLimit,
        value: amount,
      });
      await timeTravel(provider, 8000);

      const status = await launchpad.getLaunchpadStatus();
      expect(status).to.be.equal(3);

      const lpStatus = await launchpad.launchpadStatus();
      expect(lpStatus.lpGenerationComplete).to.be.false;

      await expect(launchpad.addLiquidity()).to.be.revertedWith("NOT SUCCESS");
    });

    it("should fail if admin calls forceFailByPancake", async () => {
      const launchpad = await createNewLaunchpad(wbnb);
      const amount = expandTo18Decimals(1).div(10);
      await launchpad.userDeposit(amount,[], {
        ...gasLimit,
        value: amount,
      });
      await launchpad.connect(wallet).forceFailByPancake();

      const status = await launchpad.getLaunchpadStatus();
      expect(status).to.be.equal(3);

      const lpStatus = await launchpad.launchpadStatus();
      expect(lpStatus.lpGenerationComplete).to.be.false;

      await expect(launchpad.addLiquidity()).to.be.revertedWith("NOT SUCCESS");
    });

    it("should withdraw sale tokens on fail", async () => {
      const owner = await otherWallet.getAddress();
      const balanceBefore = await saleToken.balanceOf(owner);

      // create launchpad
      const launchpad = await createNewLaunchpad(wbnb);
      const amount = expandTo18Decimals(1).div(10);
      await launchpad.userDeposit(amount,[], {
        ...gasLimit,
        value: amount,
      });

      // abort launchpad
      await launchpad.connect(wallet).forceFailByPancake();
      const status = await launchpad.getLaunchpadStatus();
      expect(status).to.be.equal(3);
      const lpStatus = await launchpad.launchpadStatus();
      expect(lpStatus.lpGenerationComplete).to.be.false;

      // get back sale token
      await launchpad.ownerWithdrawTokens();
      expect(await saleToken.balanceOf(owner)).to.be.equal(balanceBefore);
    });

    it("should withdraw base token funds", async () => {
      // deploy base token
      const buyer = await buyerWallet.getAddress();
      const baseToken = await deployContract(buyerWallet, BurnToken, [18]);
      const balanceBefore = await baseToken.balanceOf(buyer);

      //create launchpad and deposit
      const launchpad = await createNewLaunchpad(baseToken);
      const amount = expandTo18Decimals(1).div(10);
      await baseToken.connect(buyerWallet).approve(launchpad.address, amount);
      await launchpad.connect(buyerWallet).userDeposit(amount,[], {
        ...gasLimit,
      });
      expect(await baseToken.balanceOf(buyer)).to.be.equal(
        balanceBefore.sub(amount)
      );

      // let launchpad fail - softcap not reached
      await timeTravel(provider, 8000);
      const status = await launchpad.getLaunchpadStatus();
      expect(status).to.be.equal(3);
      const lpStatus = await launchpad.launchpadStatus();
      expect(lpStatus.lpGenerationComplete).to.be.false;

      // check if user gets tokens back
      await launchpad.connect(buyerWallet).userWithdrawBaseTokens();
      expect(await baseToken.balanceOf(buyer)).to.be.equal(balanceBefore);
    });

    it("should withdraw base token funds two users", async () => {
      // deploy base token
      const buyer = await buyerWallet.getAddress();
      const secondBuyer = await secondBuyerWallet.getAddress();
      const baseToken = await deployContract(buyerWallet, BurnToken, [18]);
      const balanceBefore = await baseToken.balanceOf(buyer);

      //create launchpad and deposit
      const launchpad = await createNewLaunchpad(baseToken);
      const amount = expandTo18Decimals(1).div(10);
      await baseToken.transfer(secondBuyer, amount);
      await baseToken.connect(buyerWallet).approve(launchpad.address, amount);
      await baseToken
        .connect(secondBuyerWallet)
        .approve(launchpad.address, amount);
      await launchpad.connect(buyerWallet).userDeposit(amount,[], {
        ...gasLimit,
      });
      await launchpad.connect(secondBuyerWallet).userDeposit(amount,[], {
        ...gasLimit,
      });
      expect(await baseToken.balanceOf(buyer)).to.be.equal(
        balanceBefore.sub(amount.mul(2))
      );
      expect(await baseToken.balanceOf(secondBuyer)).to.be.equal(0);

      // let launchpad fail - softcap not reached
      await timeTravel(provider, 8000);
      const status = await launchpad.getLaunchpadStatus();
      expect(status).to.be.equal(3);
      const lpStatus = await launchpad.launchpadStatus();
      expect(lpStatus.lpGenerationComplete).to.be.false;

      // check if users get tokens back
      await launchpad.connect(buyerWallet).userWithdrawBaseTokens();
      await launchpad.connect(secondBuyerWallet).userWithdrawBaseTokens();
      expect(await baseToken.balanceOf(buyer)).to.be.equal(
        balanceBefore.sub(amount)
      );
      expect(await baseToken.balanceOf(secondBuyer)).to.be.equal(amount);
    });
  });

  describe("Hardcap reached", () => {
    it("should finish launchpad", async () => {
      const launchpad = await createNewLaunchpad(wbnb);
      const amount = defaultParams.maxSpend;
      await launchpad.userDeposit(amount,[], {
        ...gasLimit,
        value: amount,
      });

      // launchpad should be finished - hardcap met
      const status = await launchpad.getLaunchpadStatus();
      expect(status).to.be.equal(2);

      await launchpad.addLiquidity();

      const newStatus = await launchpad.launchpadStatus();
      expect(newStatus.lpGenerationComplete).to.be.true;
    });

    it("should initilize pool with correct amounts", async () => {
      const initialSupply = 10000;
      const launchpad = await createNewLaunchpad(
        wbnb,
        initialSupply,
        10,
        5,
        10,
        500,
        10
      );
      const balance = await saleToken.balanceOf(launchpad.address);

      // deposit hardcap amount - buy all tokens
      const amount = defaultParams.maxSpend;
      await launchpad.connect(buyerWallet).userDeposit(amount,[], {
        ...gasLimit,
        value: amount,
      });

      // finish launchpad by adding liquidity to the pool
      const addLiquidity = await launchpad.addLiquidity({ ...gasLimit });
      const status = await launchpad.launchpadStatus();
      expect(status.lpGenerationComplete).to.be.true;

      // calculate expected liquidity amounts
      const tokenFee = await launchpadSettings.getTokenFee();
      const liquidityAmounts = await calcLiquidityAmounts(
        amount,
        expandTo18Decimals(initialSupply),
        500,
        10,
        tokenFee
      );

      // check if expected sale token liquidity is sent to the pool
      const pair = await pancakeFactory.getPair(
        wbnb.address,
        saleToken.address
      );
      expect(addLiquidity)
        .to.emit(saleToken, "Transfer")
        .withArgs(launchpad.address, pair, liquidityAmounts.saleAmount);
      expect(await saleToken.balanceOf(pair)).to.be.equal(
        liquidityAmounts.saleAmount
      );

      // check if expected base liquidity is sent to the pool
      expect(addLiquidity)
        .to.emit(wbnb, "Transfer")
        .withArgs(launchpad.address, pair, liquidityAmounts.baseAmount);
      expect(await wbnb.balanceOf(pair)).to.be.equal(
        liquidityAmounts.baseAmount
      );
      expect(await saleToken.balanceOf(burnAddress)).to.be.equal(0);
    });

    it("should send correct amount of fees to receiver", async () => {
      // get fee receiver balances before launchpad finished
      const saleFeeReceiver = await launchpadSettings.getSaleFeeReceiver();
      const baseFeeReceiver = await launchpadSettings.getBaseFeeReceiver();
      const saleBalanceBefore = await saleToken.balanceOf(saleFeeReceiver);
      const baseBalanceBefore = await provider.getBalance(baseFeeReceiver);

      const initialSupply = 10000;
      const launchpad = await createNewLaunchpad(wbnb);

      // deposit hardcap amount - buy all tokens
      const amount = defaultParams.maxSpend;
      await launchpad.connect(buyerWallet).userDeposit(amount,[], {
        ...gasLimit,
        value: amount,
      });

      // finish launchpad by adding liquidity to the pool
      const addLiquidity = await launchpad.addLiquidity({ ...gasLimit });

      // calculate fees on launchpad
      const saleBalanceAfter = await saleToken.balanceOf(saleFeeReceiver);
      const baseBalanceAfter = await provider.getBalance(baseFeeReceiver);
      const creationFee = await launchpadSettings.getGlmrCreationFee();
      const tokenFee = await launchpadSettings.getTokenFee();
      const saleFeeAmount = expandTo18Decimals(initialSupply)
        .mul(tokenFee)
        .div(1000);
      const baseFeeAmount = amount.mul(tokenFee).div(1000).add(creationFee);

      // check if fee amount is sent to fee receiver
      expect(addLiquidity)
        .to.emit(saleToken, "Transfer")
        .withArgs(launchpad.address, saleFeeReceiver, saleFeeAmount);
      expect(saleBalanceAfter).to.be.equal(
        saleBalanceBefore.add(saleFeeAmount)
      );
      expect(baseBalanceAfter).to.be.equal(
        baseBalanceBefore.add(baseFeeAmount)
      );
    });

    it("should withdraw correct amount of funds", async () => {
      const buyer = await buyerWallet.getAddress();
      const initialSupply = 10000;
      const launchpad = await createNewLaunchpad(wbnb, initialSupply);

      // deposit hardcap amount - buy all tokens
      const amount = defaultParams.maxSpend;
      await launchpad.connect(buyerWallet).userDeposit(amount,[], {
        ...gasLimit,
        value: amount,
      });

      // finish launchpad by adding liquidity to the pool
      await launchpad.addLiquidity({ ...gasLimit });

      // withdraw bought sale tokens to user
      await launchpad.connect(buyerWallet).userWithdrawTokens();
      expect(await saleToken.balanceOf(launchpad.address)).to.be.equal(0);
      expect(await saleToken.balanceOf(burnAddress)).to.be.equal(0);
      expect(await saleToken.balanceOf(buyer)).to.be.equal(
        expandTo18Decimals(initialSupply)
      );
    });
  });

  describe("Softcap reached", () => {
    it("should finish launchpad", async () => {
      const launchpad = await createNewLaunchpad(wbnb);
      const amount = defaultParams.softcap;
      await launchpad.userDeposit(amount,[], {
        ...gasLimit,
        value: amount,
      });

      // launchpad should not be finished
      const status = await launchpad.getLaunchpadStatus();
      expect(status).to.be.equal(1);

      await timeTravel(provider, 8000);

      await launchpad.addLiquidity();

      // launchpad should not be finished
      const status2 = await launchpad.getLaunchpadStatus();
      expect(status2).to.be.equal(2);

      const newStatus = await launchpad.launchpadStatus();
      expect(newStatus.lpGenerationComplete).to.be.true;
    });

    it("should initilize pool with correct amounts on softcap", async () => {
      const initialSupply = 10000;
      const launchpad = await createNewLaunchpad(wbnb, initialSupply);

      // deposit hardcap amount - buy all tokens
      const amount = defaultParams.softcap;
      await launchpad.connect(buyerWallet).userDeposit(amount,[], {
        ...gasLimit,
        value: amount,
      });

      await timeTravel(provider, 8000);

      // finish launchpad by adding liquidity to the pool
      const addLiquidity = await launchpad.addLiquidity({ ...gasLimit });
      const status = await launchpad.launchpadStatus();
      expect(status.lpGenerationComplete).to.be.true;

      // calculate expected liquidity amounts
      const tokenFee = await launchpadSettings.getTokenFee();
      const liquidityAmounts = await calcLiquidityAmounts(
        expandTo18Decimals(5),
        expandTo18Decimals(initialSupply / 2),
        500,
        25,
        tokenFee
      );

      // check if expected sale token liquidity is sent to the pool
      const pair = await pancakeFactory.getPair(
        wbnb.address,
        saleToken.address
      );
      expect(addLiquidity)
        .to.emit(saleToken, "Transfer")
        .withArgs(launchpad.address, pair, liquidityAmounts.saleAmount);
      expect(await saleToken.balanceOf(pair)).to.be.equal(
        liquidityAmounts.saleAmount
      );

      // check if expected base liquidity is sent to the pool
      expect(addLiquidity)
        .to.emit(wbnb, "Transfer")
        .withArgs(launchpad.address, pair, liquidityAmounts.baseAmount);
      expect(await wbnb.balanceOf(pair)).to.be.equal(
        liquidityAmounts.baseAmount
      );
    });

    it("should send correct amount of fees to receiver", async () => {
      // get fee receiver balances before launchpad finished
      const saleFeeReceiver = await launchpadSettings.getSaleFeeReceiver();
      const baseFeeReceiver = await launchpadSettings.getBaseFeeReceiver();
      const saleBalanceBefore = await saleToken.balanceOf(saleFeeReceiver);
      const baseBalanceBefore = await provider.getBalance(baseFeeReceiver);

      const initialSupply = 10000;
      const launchpad = await createNewLaunchpad(wbnb);

      // deposit hardcap amount - buy all tokens
      const amount = defaultParams.softcap;
      await launchpad.connect(buyerWallet).userDeposit(amount,[], {
        ...gasLimit,
        value: amount,
      });

      await timeTravel(provider, 8000);

      // finish launchpad by adding liquidity to the pool
      const addLiquidity = await launchpad.addLiquidity({ ...gasLimit });

      // calculate fees on launchpad
      const saleBalanceAfter = await saleToken.balanceOf(saleFeeReceiver);
      const baseBalanceAfter = await provider.getBalance(baseFeeReceiver);
      const creationFee = await launchpadSettings.getGlmrCreationFee();
      const tokenFee = await launchpadSettings.getTokenFee();
      const saleFeeAmount = expandTo18Decimals(initialSupply / 2)
        .mul(tokenFee)
        .div(1000);
      const baseFeeAmount = amount.mul(tokenFee).div(1000).add(creationFee);

      // check if fee amount is sent to fee receiver
      expect(addLiquidity)
        .to.emit(saleToken, "Transfer")
        .withArgs(launchpad.address, saleFeeReceiver, saleFeeAmount);
      expect(saleBalanceAfter).to.be.equal(
        saleBalanceBefore.add(saleFeeAmount)
      );
      expect(baseBalanceAfter).to.be.equal(
        baseBalanceBefore.add(baseFeeAmount)
      );
    });

    it("should burn left sale tokens", async () => {
      const initialSupply = 10000;
      const launchpad = await createNewLaunchpad(wbnb, initialSupply);
      const balance = await saleToken.balanceOf(launchpad.address);

      // deposit hardcap amount - buy all tokens
      const amount = defaultParams.softcap;
      await launchpad.connect(buyerWallet).userDeposit(amount,[], {
        ...gasLimit,
        value: amount,
      });

      await timeTravel(provider, 8000);

      // finish launchpad by adding liquidity to the pool
      await launchpad.addLiquidity({ ...gasLimit });

      // calculate expected liquidity amounts
      const tokenFee = await launchpadSettings.getTokenFee();
      const liquidityAmounts = await calcLiquidityAmounts(
        defaultParams.softcap,
        expandTo18Decimals(initialSupply / 2),
        500,
        25,
        tokenFee
      );

      const saleFeeAmount = expandTo18Decimals(initialSupply / 2)
        .mul(tokenFee)
        .div(1000);

      const burnAmount = balance
        .sub(liquidityAmounts.saleAmount)
        .sub(saleFeeAmount)
        .sub(expandTo18Decimals(initialSupply / 2));

      expect(await saleToken.balanceOf(burnAddress)).to.be.equal(burnAmount);
    });

    it("should withdraw correct amount of funds", async () => {
      const buyer = await buyerWallet.getAddress();
      const initialSupply = 10000;
      const launchpad = await createNewLaunchpad(wbnb, initialSupply);

      // deposit hardcap amount - buy all tokens
      const amount = defaultParams.softcap;
      await launchpad.connect(buyerWallet).userDeposit(amount,[], {
        ...gasLimit,
        value: amount,
      });

      await timeTravel(provider, 8000);
      // finish launchpad by adding liquidity to the pool
      await launchpad.addLiquidity({ ...gasLimit });

      // withdraw bought sale tokens to user
      await launchpad.connect(buyerWallet).userWithdrawTokens();
      expect(await saleToken.balanceOf(launchpad.address)).to.be.equal(0);
      expect(await saleToken.balanceOf(buyer)).to.be.equal(
        expandTo18Decimals(initialSupply / 2)
      );
    });
  });
});
