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
  calcLiquidityAmounts,
  defaultParams,
  expandToDecimals,
  gasLimit,
  now,
  timeTravel,
} from "./shared/utils";

import Launchpad from "../build/contracts/Launchpad.json";
import BurnToken from "../build/contracts/ERC20Burn.json";

chai.use(solidity);

describe("Launchpad Decimals", () => {
  let generator: Contract;
  let launchpadFactory: Contract;
  let launchpadSettings: Contract;
  let pancakeFactory: Contract;
  let otherWallet: Signer;
  let buyerWallet: Signer;
  let provider: MockProvider;

  const createNewLaunchpad = async (
    baseToken: Contract,
    saleToken: Contract,
    amount: number,
    hardcap: number,
    softcap: number,
    maxSpend: number,
    liquidityPercent: number,
    listingRate: number
  ): Promise<Contract> => {
    const saleTokenDecimals = await saleToken.decimals();
    const baseTokenDecimals = await baseToken.decimals();

    // set desired params
    const params = {
      amount: expandToDecimals(amount, saleTokenDecimals),
      hardcap: expandToDecimals(hardcap, baseTokenDecimals),
      softcap: expandToDecimals(softcap, baseTokenDecimals),
      liquidity: BigNumber.from(liquidityPercent),
      listing: BigNumber.from(listingRate),
      maxSpend: expandToDecimals(maxSpend, baseTokenDecimals),
      lockPeriod: defaultParams.lockPeriod,
      startTime: defaultParams.startTime,
      endTime: defaultParams.endTime,
    };

    // approve generator with sale token amount
    const saleTokenAmount = await generator.calculateAmountRequired(
      params.amount,
      params.listing,
      params.liquidity
    );

    await saleToken
      .connect(otherWallet)
      .approve(generator.address, saleTokenAmount);

    // format params for launchpad creation
    const launchpadParams = [];
    for (const [key, value] of Object.entries(params)) {
      launchpadParams.push(value);
    }

    //create launchpad
    const owner = await otherWallet.getAddress();
    const creationFee = await launchpadSettings.getGlmrCreationFee();
    await generator.connect(otherWallet).createLaunchpad(
      owner, // launchpad owner
      saleToken.address, // sale token
      baseToken.address, // base token
      constants.AddressZero, // referral
      launchpadParams,
      { ...gasLimit, value: creationFee }
    );

    // get contract instance of created launchpad
    const launchPadAddress = await launchpadFactory.launchpadAtIndex(0);
    return new Contract(
      launchPadAddress,
      JSON.stringify(Launchpad.abi),
      provider
    ).connect(otherWallet);
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
    otherWallet = fixture.otherWallet;
    buyerWallet = fixture.buyerWallet;
  });

  //[saleTokenDecimals, baseTokenDecimals, tokenAmount, hardcap, softcap, liquidityRate, listingRate, maxSpend]
  const testCases = [
    [1, 18, 10000, 10, 6, 500, 25, 10],
    [7, 18, 2000, 80, 4, 1000, 30, 80],
    [4, 18, 10000, 10, 2, 1000, 0, 10],
    [9, 18, 1000000000000, 10, 5, 1000, 30, 10],
    [9, 11, 10000, 10, 2, 1000, 0, 10],
    [9, 8, 2000, 2, 1, 250, 0, 2],
    [18, 6, 5000, 4, 2, 250, 30, 4],
    [6, 6, 10, 80, 30, 300, 30, 80],
  ];

  testCases.forEach((testCase, i) => {
    const [
      saleDecimals,
      baseDecimals,
      amount,
      hardcap,
      softcap,
      liquidityRate,
      listingRate,
      maxSpend,
    ] = testCase;
    describe(`SaleToken ${saleDecimals} decimals, BaseToken ${baseDecimals} decimals`, () => {
      let saleToken: Contract;
      let baseToken: Contract;
      let launchpad: Contract;

      beforeEach(async function () {
        // deploy sale token contract
        saleToken = await deployContract(otherWallet, BurnToken, [
          saleDecimals,
        ]);
        baseToken = await deployContract(buyerWallet, BurnToken, [
          baseDecimals,
        ]);
        launchpad = await createNewLaunchpad(
          baseToken,
          saleToken,
          amount,
          hardcap,
          softcap,
          maxSpend,
          liquidityRate,
          listingRate
        );
      });
      it("should calculate price correctly", async () => {
        const te = expandToDecimals(amount, saleDecimals)
          .mul(BigNumber.from(10).pow(18))
          .div(hardcap);

        // check initial infos
        const info = await launchpad.launchpadInfo();
        expect(info.sToken).to.be.equal(saleToken.address);
        expect(info.bToken).to.be.equal(baseToken.address);
        expect(info.amount).to.be.equal(expandToDecimals(amount, saleDecimals));
        expect(info.tokenPrice).to.be.equal(
          expandToDecimals(hardcap, baseDecimals)
            .mul(BigNumber.from(10).pow(18))
            .div(expandToDecimals(amount, saleDecimals))
        );
        expect(info.maxSpendPerBuyer).to.be.equal(
          expandToDecimals(maxSpend, baseDecimals)
        );
        expect(info.softCap).to.be.equal(
          expandToDecimals(softcap, baseDecimals)
        );
        expect(info.hardcap).to.be.equal(
          expandToDecimals(hardcap, baseDecimals)
        );
        expect(info.liquidityPercentage).to.be.equal(liquidityRate);
        expect(info.listingRate).to.be.equal(listingRate);
        expect(info.lockPeriod).to.be.equal(defaultParams.lockPeriod);
        expect(info.startTime).to.be.equal(defaultParams.startTime);
        expect(info.endTime).to.be.equal(defaultParams.endTime);
        expect(info.isBNB).to.be.false;
      });

      it("should deposit", async () => {
        const buyer = await buyerWallet.getAddress();
        const depositAmount = expandToDecimals(softcap, baseDecimals);

        await baseToken
          .connect(buyerWallet)
          .approve(launchpad.address, depositAmount);
        await launchpad.connect(buyerWallet).userDeposit(depositAmount, [],{
          ...gasLimit,
        });
        const buyerInfo = await launchpad.buyers(buyer);
        expect(buyerInfo.baseDeposited).to.be.equal(depositAmount);
        expect(buyerInfo.tokensOwed).to.be.equal(
          depositAmount
            .mul(
              expandToDecimals(amount, saleDecimals)
                .mul(BigNumber.from(10).pow(18))
                .div(expandToDecimals(hardcap, baseDecimals))
            )
            .div(BigNumber.from(10).pow(18))
        );
        expect(await baseToken.balanceOf(launchpad.address)).to.be.equal(
          depositAmount
        );
      });

      it("should initilize pool with correct amounts", async () => {
        // deposit hardcap amount - buy all tokens
        const depositAmount = expandToDecimals(hardcap, baseDecimals);
        await baseToken
          .connect(buyerWallet)
          .approve(launchpad.address, depositAmount);
        await launchpad.connect(buyerWallet).userDeposit(depositAmount,[], {
          ...gasLimit,
        });

        await timeTravel(provider, 8000);

        // finish launchpad by adding liquidity to the pool
        const addLiquidity = await launchpad.addLiquidity({ ...gasLimit });
        const status = await launchpad.launchpadStatus();
        expect(status.lpGenerationComplete).to.be.true;

        // calculate expected liquidity amounts
        const tokenFee = await launchpadSettings.getTokenFee();
        const liquidityAmounts = await calcLiquidityAmounts(
          depositAmount,
          expandToDecimals(amount, saleDecimals),
          liquidityRate,
          listingRate,
          tokenFee
        );

        // check if expected sale token liquidity is sent to the pool
        const pair = await pancakeFactory.getPair(
          baseToken.address,
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
          .to.emit(baseToken, "Transfer")
          .withArgs(launchpad.address, pair, liquidityAmounts.baseAmount);
        expect(await baseToken.balanceOf(pair)).to.be.equal(
          liquidityAmounts.baseAmount
        );
      });

      it("should send correct amount of fees to receiver", async () => {
        // get fee receiver balances before launchpad finished
        const saleFeeReceiver = await launchpadSettings.getSaleFeeReceiver();
        const baseFeeReceiver = await launchpadSettings.getBaseFeeReceiver();
        const saleBalanceBefore = await saleToken.balanceOf(saleFeeReceiver);
        const baseBalanceBefore = await baseToken.balanceOf(baseFeeReceiver);

        // deposit hardcap amount - buy all tokens
        const depositAmount = expandToDecimals(softcap, baseDecimals);
        await baseToken
          .connect(buyerWallet)
          .approve(launchpad.address, depositAmount);
        await launchpad.connect(buyerWallet).userDeposit(depositAmount, [],{
          ...gasLimit,
        });

        await timeTravel(provider, 8000);

        // finish launchpad by adding liquidity to the pool
        const addLiquidity = await launchpad.addLiquidity({ ...gasLimit });

        // calculate fees on launchpad
        const saleBalanceAfter = await saleToken.balanceOf(saleFeeReceiver);
        const baseBalanceAfter = await baseToken.balanceOf(baseFeeReceiver);
        const tokenFee = await launchpadSettings.getTokenFee();
        const saleFeeAmount = depositAmount
          .mul(
            expandToDecimals(amount, saleDecimals)
              .mul(BigNumber.from(10).pow(18))
              .div(expandToDecimals(hardcap, baseDecimals))
          )
          .div(BigNumber.from(10).pow(18))
          .mul(tokenFee)
          .div(1000);
        const baseFeeAmount = depositAmount.mul(tokenFee).div(1000);

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

        // deposit hardcap amount - buy all tokens
        const depositAmount = expandToDecimals(hardcap, baseDecimals);
        await baseToken
          .connect(buyerWallet)
          .approve(launchpad.address, depositAmount);
        await launchpad.connect(buyerWallet).userDeposit(depositAmount, [],{
          ...gasLimit,
        });

        await timeTravel(provider, 8000);
        // finish launchpad by adding liquidity to the pool
        await launchpad.addLiquidity({ ...gasLimit });

        // withdraw bought sale tokens to user
        await launchpad.connect(buyerWallet).userWithdrawTokens();
        expect(await saleToken.balanceOf(launchpad.address)).to.be.equal(0);
        expect(await saleToken.balanceOf(buyer)).to.be.equal(
          expandToDecimals(amount, saleDecimals)
        );
      });
    });
  });
});
