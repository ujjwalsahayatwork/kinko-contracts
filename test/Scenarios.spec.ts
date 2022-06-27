import chai, { expect } from "chai";
import { BigNumber, Contract, Signer } from "ethers";
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

describe("Scenarios", () => {
  let generator: Contract;
  let launchpadFactory: Contract;
  let launchpadSettings: Contract;
  let wbnb: Contract;
  let saleToken: Contract;
  let pancakeFactory: Contract;
  let otherWallet: Signer;
  let buyerWallet: Signer;
  let secondBuyerWallet: Signer;
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

  const depositAmount = async (
    launchpad: Contract,
    wallet: Signer,
    amount: BigNumber,
    tokenAmount: number,
    hardcap: number
  ) => {
    const buyer = await wallet.getAddress();
    const depositAmount = amount;
    await launchpad.connect(wallet).userDeposit(depositAmount,[], {
      ...gasLimit,
      value: depositAmount,
    });

    const tokenPrice = expandTo18Decimals(hardcap)
      .mul(BigNumber.from(10).pow(18))
      .div(expandTo18Decimals(tokenAmount));
    const buyerInfo = await launchpad.buyers(buyer);
    expect(buyerInfo.baseDeposited).to.be.equal(depositAmount);
    expect(buyerInfo.tokensOwed).to.be.equal(
      depositAmount.mul(BigNumber.from(10).pow(18)).div(tokenPrice)
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
    pancakeFactory = fixture.pancakeFactory;
    wbnb = fixture.wbnb;
    otherWallet = fixture.otherWallet;
    buyerWallet = fixture.buyerWallet;
    secondBuyerWallet = fixture.secondBuyerWallet;

    // deploy sale token contract
    saleToken = await deployContract(otherWallet, BurnToken, [18]);
  });

  //[tokenAmount, hardcap, softcap, liquidityRate, listingRate]
  const testCases = [
    [10000, 10, 6, 500, 25],
    [2000, 2, 1, 250, 0],
    [5000, 4, 2, 250, 30],
  ];

  describe("One user buys all hardcap == maxSpend", () => {
    testCases.forEach((testCase, i) => {
      it(`One user all: ${i}`, async () => {
        const [tokenAmount, hardcap, softcap, liquidityRate, listingRate] =
          testCase;

        // get fee receiver balances before launchpad finished
        const saleFeeReceiver = await launchpadSettings.getSaleFeeReceiver();
        const baseFeeReceiver = await launchpadSettings.getBaseFeeReceiver();
        const saleBalanceBefore = await saleToken.balanceOf(saleFeeReceiver);
        const baseBalanceBefore = await provider.getBalance(baseFeeReceiver);

        // deposit max user amount
        const buyer = await buyerWallet.getAddress();
        const launchpad = await createNewLaunchpad(
          wbnb,
          tokenAmount,
          hardcap,
          softcap,
          hardcap,
          liquidityRate,
          listingRate
        );

        await depositAmount(
          launchpad,
          buyerWallet,
          expandTo18Decimals(hardcap),
          tokenAmount,
          hardcap
        );

        // launchpad should be finished - hardcap met
        const status = await launchpad.getLaunchpadStatus();
        expect(status).to.be.equal(2);

        // lock liquidity in pool
        const addLiquidity = await launchpad.addLiquidity();

        const newStatus = await launchpad.launchpadStatus();
        expect(newStatus.lpGenerationComplete).to.be.true;

        // calculate expected liquidity amounts
        const tokenFee = await launchpadSettings.getTokenFee();
        const liquidityAmounts = await calcLiquidityAmounts(
          expandTo18Decimals(hardcap),
          expandTo18Decimals(tokenAmount),
          liquidityRate,
          listingRate,
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

        // calculate fees on launchpad
        const saleBalanceAfter = await saleToken.balanceOf(saleFeeReceiver);
        const baseBalanceAfter = await provider.getBalance(baseFeeReceiver);
        const creationFee = await launchpadSettings.getGlmrCreationFee();
        const saleFeeAmount = expandTo18Decimals(tokenAmount)
          .mul(tokenFee)
          .div(1000);
        const baseFeeAmount = expandTo18Decimals(hardcap)
          .mul(tokenFee)
          .div(1000)
          .add(creationFee);

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

        // withdraw bought sale tokens to user
        await launchpad.connect(buyerWallet).userWithdrawTokens();
        expect(await saleToken.balanceOf(launchpad.address)).to.be.equal(0);
        expect(await saleToken.balanceOf(buyer)).to.be.equal(
          expandTo18Decimals(tokenAmount)
        );
      });
    });
  });

  describe("Two users buying half of hardcap each", () => {
    testCases.forEach((testCase, i) => {
      it(`Two users reach hardcap ${i}`, async () => {
        const [tokenAmount, hardcap, softcap, liquidityRate, listingRate] =
          testCase;

        // get fee receiver balances before launchpad finished
        const saleFeeReceiver = await launchpadSettings.getSaleFeeReceiver();
        const baseFeeReceiver = await launchpadSettings.getBaseFeeReceiver();
        const saleBalanceBefore = await saleToken.balanceOf(saleFeeReceiver);
        const baseBalanceBefore = await provider.getBalance(baseFeeReceiver);

        // deposit max user amount
        const buyer = await buyerWallet.getAddress();
        const launchpad = await createNewLaunchpad(
          wbnb,
          tokenAmount,
          hardcap,
          softcap,
          hardcap,
          liquidityRate,
          listingRate
        );

        await depositAmount(
          launchpad,
          buyerWallet,
          expandTo18Decimals(hardcap / 2),
          tokenAmount,
          hardcap
        );

        await depositAmount(
          launchpad,
          secondBuyerWallet,
          expandTo18Decimals(hardcap / 2),
          tokenAmount,
          hardcap
        );

        // launchpad should be finished - hardcap met
        const status = await launchpad.getLaunchpadStatus();
        expect(status).to.be.equal(2);

        // lock liquidity in pool
        const addLiquidity = await launchpad.addLiquidity();

        const newStatus = await launchpad.launchpadStatus();
        expect(newStatus.lpGenerationComplete).to.be.true;

        // calculate expected liquidity amounts
        const tokenFee = await launchpadSettings.getTokenFee();
        const liquidityAmounts = await calcLiquidityAmounts(
          expandTo18Decimals(hardcap),
          expandTo18Decimals(tokenAmount),
          liquidityRate,
          listingRate,
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

        // calculate fees on launchpad
        const saleBalanceAfter = await saleToken.balanceOf(saleFeeReceiver);
        const baseBalanceAfter = await provider.getBalance(baseFeeReceiver);
        const creationFee = await launchpadSettings.getGlmrCreationFee();
        const saleFeeAmount = expandTo18Decimals(tokenAmount)
          .mul(tokenFee)
          .div(1000);
        const baseFeeAmount = expandTo18Decimals(hardcap)
          .mul(tokenFee)
          .div(1000)
          .add(creationFee);

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

        // withdraw bought sale tokens to user
        await launchpad.connect(buyerWallet).userWithdrawTokens();
        await launchpad.connect(secondBuyerWallet).userWithdrawTokens();
        expect(await saleToken.balanceOf(launchpad.address)).to.be.equal(0);
        expect(await saleToken.balanceOf(buyer)).to.be.equal(
          expandTo18Decimals(tokenAmount / 2)
        );
        expect(
          await saleToken.balanceOf(await secondBuyerWallet.getAddress())
        ).to.be.equal(expandTo18Decimals(tokenAmount / 2));
      });
    });
  });

  describe("One user buys tokens for softcap", () => {
    testCases.forEach((testCase, i) => {
      it(`One user softcap ${i}`, async () => {
        const [tokenAmount, hardcap, softcap, liquidityRate, listingRate] =
          testCase;

        // get fee receiver balances before launchpad finished
        const saleFeeReceiver = await launchpadSettings.getSaleFeeReceiver();
        const baseFeeReceiver = await launchpadSettings.getBaseFeeReceiver();
        const saleBalanceBefore = await saleToken.balanceOf(saleFeeReceiver);
        const baseBalanceBefore = await provider.getBalance(baseFeeReceiver);

        // deposit max user amount
        const buyer = await buyerWallet.getAddress();
        const launchpad = await createNewLaunchpad(
          wbnb,
          tokenAmount,
          hardcap,
          softcap,
          hardcap,
          liquidityRate,
          listingRate
        );

        await depositAmount(
          launchpad,
          buyerWallet,
          expandTo18Decimals(softcap),
          tokenAmount,
          hardcap
        );

        // launchpad should not be finished
        const status = await launchpad.getLaunchpadStatus();
        expect(status).to.be.equal(1);

        await timeTravel(provider, 8000);

        // lock liquidity in pool
        const addLiquidity = await launchpad.addLiquidity();

        const newStatus = await launchpad.launchpadStatus();
        expect(newStatus.lpGenerationComplete).to.be.true;

        // calculate expected liquidity amounts
        const tokenFee = await launchpadSettings.getTokenFee();
        const boughtTokens = expandTo18Decimals(softcap)
          .mul(
            expandTo18Decimals(tokenAmount)
              .mul(BigNumber.from(10).pow(18))
              .div(expandTo18Decimals(hardcap))
          )
          .div(BigNumber.from(10).pow(18));

        const liquidityAmounts = await calcLiquidityAmounts(
          expandTo18Decimals(softcap),
          boughtTokens,
          liquidityRate,
          listingRate,
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

        // calculate fees on launchpad
        const saleBalanceAfter = await saleToken.balanceOf(saleFeeReceiver);
        const baseBalanceAfter = await provider.getBalance(baseFeeReceiver);
        const creationFee = await launchpadSettings.getGlmrCreationFee();
        const saleFeeAmount = boughtTokens.mul(tokenFee).div(1000);
        const baseFeeAmount = expandTo18Decimals(softcap)
          .mul(tokenFee)
          .div(1000)
          .add(creationFee);

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

        // withdraw bought sale tokens to user
        await launchpad.connect(buyerWallet).userWithdrawTokens();
        expect(await saleToken.balanceOf(launchpad.address)).to.be.equal(0);
        expect(await saleToken.balanceOf(buyer)).to.be.equal(boughtTokens);
      });
    });
  });

  describe("Multiple users buying tokens for softcap", () => {
    testCases.forEach((testCase, i) => {
      it(`Multiple users softcap ${i}`, async () => {
        const [tokenAmount, hardcap, softcap, liquidityRate, listingRate] =
          testCase;
        const userWallets = provider.getWallets(); // 10 wallets
        // 10 amounts
        const depositAmounts = [
          expandTo18Decimals(1).div(10),
          expandTo18Decimals(softcap),
          expandTo18Decimals(1).div(100),
          expandTo18Decimals(1).div(1000),
          expandTo18Decimals(1).div(5),
          expandTo18Decimals(1).div(20),
          expandTo18Decimals(1).div(2000),
          expandTo18Decimals(1).div(6),
          expandTo18Decimals(1).div(110),
          expandTo18Decimals(1).div(222),
        ];
        let totalAmount = BigNumber.from(0);

        // get fee receiver balances before launchpad finished
        const saleFeeReceiver = await launchpadSettings.getSaleFeeReceiver();
        const baseFeeReceiver = await launchpadSettings.getBaseFeeReceiver();
        const saleBalanceBefore = await saleToken.balanceOf(saleFeeReceiver);
        const baseBalanceBefore = await provider.getBalance(baseFeeReceiver);

        // create launchpad
        const launchpad = await createNewLaunchpad(
          wbnb,
          tokenAmount,
          hardcap,
          softcap,
          hardcap,
          liquidityRate,
          listingRate
        );
        const totalBalance = await saleToken.balanceOf(launchpad.address);

        // deposit with all 9 users
        for (let j = 1; j < userWallets.length; j++) {
          totalAmount = totalAmount.add(depositAmounts[j]);
          await depositAmount(
            launchpad,
            userWallets[j],
            depositAmounts[j],
            tokenAmount,
            hardcap
          );
        }

        // launchpad should not be finished
        const status = await launchpad.getLaunchpadStatus();
        expect(status).to.be.equal(1);

        await timeTravel(provider, 8000);

        // lock liquidity in pool
        const addLiquidity = await launchpad.addLiquidity();

        const newStatus = await launchpad.launchpadStatus();
        expect(newStatus.lpGenerationComplete).to.be.true;

        // calculate expected liquidity amounts
        const tokenFee = await launchpadSettings.getTokenFee();
        const boughtTokens = totalAmount
          .mul(
            expandTo18Decimals(tokenAmount)
              .mul(BigNumber.from(10).pow(18))
              .div(expandTo18Decimals(hardcap))
          )
          .div(BigNumber.from(10).pow(18));

        const liquidityAmounts = await calcLiquidityAmounts(
          totalAmount,
          boughtTokens,
          liquidityRate,
          listingRate,
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

        // calculate fees on launchpad
        const saleBalanceAfter = await saleToken.balanceOf(saleFeeReceiver);
        const baseBalanceAfter = await provider.getBalance(baseFeeReceiver);
        const creationFee = await launchpadSettings.getGlmrCreationFee();
        const saleFeeAmount = boughtTokens.mul(tokenFee).div(1000);
        const baseFeeAmount = totalAmount
          .mul(tokenFee)
          .div(1000)
          .add(creationFee);

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

        const tokenPrice = expandTo18Decimals(tokenAmount)
          .mul(BigNumber.from(10).pow(18))
          .div(expandTo18Decimals(hardcap));

        // withdraw with all 9 users
        for (let j = 1; j < userWallets.length; j++) {
          const buyer = await userWallets[j].getAddress();
          const balanceBefore = await saleToken.balanceOf(buyer);
          await launchpad.connect(userWallets[j]).userWithdrawTokens();

          expect(await saleToken.balanceOf(buyer)).to.be.equal(
            balanceBefore.add(
              depositAmounts[j].mul(tokenPrice).div(BigNumber.from(10).pow(18))
            )
          );
        }

        // check for correct burned amount
        const burnAmount = totalBalance
          .sub(liquidityAmounts.saleAmount)
          .sub(saleFeeAmount)
          .sub(totalAmount.mul(tokenPrice).div(BigNumber.from(10).pow(18)));

        expect(await saleToken.balanceOf(burnAddress)).to.be.equal(burnAmount);
        expect(await saleToken.balanceOf(launchpad.address)).to.be.equal(0);
      });
    });
  });
});
