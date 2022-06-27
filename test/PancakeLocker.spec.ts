import chai, { expect } from "chai";
import { Contract, Signer, constants } from "ethers";
import {
  solidity,
  createFixtureLoader,
  deployContract,
  MockProvider,
} from "ethereum-waffle";
import { generalFixture } from "./shared/fixtures";
import { expandTo18Decimals, gasLimit } from "./shared/utils";

import BurnToken from "../build/contracts/ERC20Burn.json";
import PancakePair from "../build/contracts/PancakePair.json";

chai.use(solidity);

describe("PancakeLocker", () => {
  let pancakeLocker: Contract;
  let pancakeFactory: Contract;
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

    pancakeLocker = fixture.pancakeLocker;
    pancakeFactory = fixture.pancakeFactory;
    wbnb = fixture.wbnb;
    wallet = fixture.wallet;
    otherWallet = fixture.otherWallet;
  });

  describe("Variables", () => {
    it("should initilize variables on creation", async () => {
      const walletAddress = await wallet.getAddress();
      // check addresses
      expect(await pancakeLocker.devaddr()).to.be.equal(walletAddress);
      expect(await pancakeLocker.migrator()).to.be.equal(constants.AddressZero);
      expect(await pancakeLocker.KINKO_FACTORY()).to.be.equal(
        pancakeFactory.address
      );

      // check fees
      const gFees = await pancakeLocker.fees();
      expect(gFees.referralPercent).to.be.equal(250);
      expect(gFees.bnbFee).to.be.equal(expandTo18Decimals(1));
      expect(gFees.secondaryTokenFee).to.be.eq(expandTo18Decimals(100));
      expect(gFees.secondaryTokenDiscount).to.be.equal(200);
      expect(gFees.liquidityFee).to.be.equal(10);
      expect(gFees.referralHold).to.be.eq(expandTo18Decimals(10));
      expect(gFees.referralDiscount).to.be.equal(100);

      expect(await pancakeLocker.getNumLockedTokens()).to.be.equal(
        constants.Zero
      );
      expect(
        await pancakeLocker.getUserNumLockedTokens(walletAddress)
      ).to.be.equal(constants.Zero);
      expect(await pancakeLocker.getUserWhitelistStatus(walletAddress)).to.be
        .false;
      expect(await pancakeLocker.getWhitelistedUsersLength()).to.be.equal(
        constants.One
      );
    });

    describe("should set variables by owner", async () => {
      let testAddress = "0x0000000000000000000000000000000000000001";

      it("should set fees", async () => {
        const referralPercent = 5;
        const referralDiscount = 6;
        const bnbFee = expandTo18Decimals(7);
        const secondaryTokenFee = 3;
        const secondaryTokenDiscount = 99;
        const liquidityFee = 187;

        await pancakeLocker.setFees(
          referralPercent,
          referralDiscount,
          bnbFee,
          secondaryTokenFee,
          secondaryTokenDiscount,
          liquidityFee
        );

        const gFees = await pancakeLocker.fees();
        expect(gFees.referralPercent).to.be.equal(5);
        expect(gFees.bnbFee).to.be.equal(expandTo18Decimals(7));
        expect(gFees.secondaryTokenFee).to.be.eq(3);
        expect(gFees.secondaryTokenDiscount).to.be.equal(99);
        expect(gFees.liquidityFee).to.be.equal(187);
        expect(gFees.referralHold).to.be.eq(expandTo18Decimals(10));
        expect(gFees.referralDiscount).to.be.equal(6);
      });

      it("should set migrator", async () => {
        await pancakeLocker.setMigrator(testAddress);
        expect(await pancakeLocker.migrator()).to.be.equal(testAddress);
      });

      it("should set token", async () => {
        await pancakeLocker.setReferralTokenAndHold(testAddress, 999);
        await pancakeLocker.setSecondaryFeeToken(testAddress);

        const fees = await pancakeLocker.fees();
        expect(fees.referralToken).to.be.equal(testAddress);
        expect(fees.referralHold).to.be.equal(999);
        expect(fees.secondaryFeeToken).to.be.equal(testAddress);
      });

      it("should set dev address", async () => {
        await pancakeLocker.setDev(testAddress);
        expect(await pancakeLocker.devaddr()).to.be.equal(testAddress);
      });

      it("should edit whitelist", async () => {
        const listLengthBefore =
          await pancakeLocker.getWhitelistedUsersLength();

        // add to whitelist
        await pancakeLocker.whitelistFeeAccount(testAddress, true);
        const listLengthAfterAdd =
          await pancakeLocker.getWhitelistedUsersLength();

        // check if added successfully
        expect(listLengthAfterAdd).to.be.equal(
          listLengthBefore.add(constants.One)
        );
        expect(
          await pancakeLocker.getWhitelistedUserAtIndex(listLengthBefore)
        ).to.be.equal(testAddress);
        expect(await pancakeLocker.getUserWhitelistStatus(testAddress)).to.be
          .true;

        // remove from whitelist
        await pancakeLocker.whitelistFeeAccount(testAddress, false);
        const listLengthAfterRemove =
          await pancakeLocker.getWhitelistedUsersLength();

        // check if removed successfully
        expect(listLengthAfterRemove).to.be.equal(listLengthBefore);
        expect(await pancakeLocker.getUserWhitelistStatus(testAddress)).to.be
          .false;
      });
    });

    describe("should revert setting variables by non-owner", async () => {
      let testAddress = "0x0000000000000000000000000000000000000001";

      it("should revert setting fees", async () => {
        const referralPercent = 5;
        const referralDiscount = 6;
        const bnbFee = expandTo18Decimals(7);
        const secondaryTokenFee = 3;
        const secondaryTokenDiscount = 99;
        const liquidityFee = 187;

        await expect(
          pancakeLocker
            .connect(otherWallet)
            .setFees(
              referralPercent,
              referralDiscount,
              bnbFee,
              secondaryTokenFee,
              secondaryTokenDiscount,
              liquidityFee
            )
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("should revert setting migrator", async () => {
        await expect(
          pancakeLocker.connect(otherWallet).setMigrator(testAddress)
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("should revert setting token", async () => {
        await expect(
          pancakeLocker
            .connect(otherWallet)
            .setReferralTokenAndHold(testAddress, 999)
        ).to.be.revertedWith("Ownable: caller is not the owner");

        await expect(
          pancakeLocker.connect(otherWallet).setSecondaryFeeToken(testAddress)
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("should revert setting dev address", async () => {
        await expect(
          pancakeLocker.connect(otherWallet).setDev(testAddress)
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("should revert editting whitelist", async () => {
        // add to whitelist
        await expect(
          pancakeLocker
            .connect(otherWallet)
            .whitelistFeeAccount(testAddress, true)
        ).to.be.revertedWith("Ownable: caller is not the owner");
        // remove from whitelist
        await expect(
          pancakeLocker
            .connect(otherWallet)
            .whitelistFeeAccount(testAddress, false)
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });
    });

    describe("lock lp token", async () => {
      let walletAddress: string;

      // helper function to create a pancake pair with liquidity
      const createPancakePair = async (
        baseAmount: number,
        saleAmount: number
      ): Promise<Contract> => {
        await pancakeFactory.createPair(saleToken.address, wbnb.address);
        await wbnb.deposit({ value: baseAmount });
        const pairAddress = await pancakeFactory.getPair(
          saleToken.address,
          wbnb.address
        );

        // send liquidity amounts to pair
        await wbnb.transfer(pairAddress, baseAmount);
        await saleToken.transfer(pairAddress, saleAmount);

        // create pair contract instance
        const lp = new Contract(
          pairAddress,
          JSON.stringify(PancakePair.abi),
          provider
        ).connect(wallet);

        // mint lp token
        await lp.mint(walletAddress);
        return lp;
      };

      beforeEach(async () => {
        saleToken = await deployContract(wallet, BurnToken, [18]);
        walletAddress = await wallet.getAddress();
      });

      it("should revert with non lp token", async () => {
        await expect(
          pancakeLocker.lockLPToken(
            saleToken.address, // token address
            2000, // amount
            10000, // unlock date
            constants.AddressZero, // referral
            true, // fee in bnb
            walletAddress // withdrawer
          )
        ).to.be.reverted;
      });

      it("should revert with invalid timestamp", async () => {
        await expect(
          pancakeLocker.lockLPToken(
            saleToken.address, // token address
            2000, // amount
            10000000001, // unlock date
            constants.AddressZero, // referral
            true, // fee in bnb
            walletAddress // withdrawer
          )
        ).to.be.revertedWith("TIMESTAMP INVALID");
      });

      it("should revert with invalid amount", async () => {
        await expect(
          pancakeLocker.lockLPToken(
            saleToken.address, // token address
            0, // amount
            1000, // unlock date
            constants.AddressZero, // referral
            true, // fee in bnb
            walletAddress // withdrawer
          )
        ).to.be.revertedWith("INSUFFICIENT");
      });

      it("should lock with whitelisted user", async () => {
        // whitelist caller
        await pancakeLocker.whitelistFeeAccount(walletAddress, true);

        // create pancake pair
        const pair = await createPancakePair(10000, 1000);

        // approve lock with lp token amount
        const lockAmount = 1000;
        await pair.approve(pancakeLocker.address, constants.MaxUint256);

        // check event on function call
        await expect(
          pancakeLocker.lockLPToken(
            pair.address, // lp token
            lockAmount,
            1000000, // unlock date
            constants.AddressZero, // referral
            false, // fee in bnb
            walletAddress, // withdrawer
            gasLimit
          )
        ).to.emit(pancakeLocker, "onDeposit");
      });
    });
  });
});
