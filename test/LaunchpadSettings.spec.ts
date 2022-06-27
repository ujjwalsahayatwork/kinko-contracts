import chai, { expect } from "chai";
import { BigNumber, Contract, Signer, constants } from "ethers";
import {
  solidity,
  createFixtureLoader,
  MockProvider,
  deployContract,
} from "ethereum-waffle";
import { generalFixture } from "./shared/fixtures";
import { expandTo18Decimals, gasLimit } from "./shared/utils";

import BurnToken from "../build/contracts/ERC20Burn.json";

chai.use(solidity);

describe("Settings", () => {
  let launchpadSettings: Contract;
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

    launchpadSettings = fixture.launchpadSettings;
    wallet = fixture.wallet;
    otherWallet = fixture.otherWallet;
  });

  it("should initilize variables on creation", async () => {
    const walletAddress = await wallet.getAddress();

    expect(await launchpadSettings.owner()).to.be.equal(walletAddress);
    expect(await launchpadSettings.allowedReferrersLength()).to.be.equal(0);
    expect(await launchpadSettings.earlyAccessTokensLength()).to.be.equal(0);
    expect(await launchpadSettings.getTokenFee()).to.be.equal(15);
    expect(await launchpadSettings.getReferralFee()).to.be.equal(100);
    expect(await launchpadSettings.getRound1Length()).to.be.equal(7200);
    expect(await launchpadSettings.getMaxLaunchpadLength()).to.be.equal(
      1209600
    );
    expect(await launchpadSettings.getGlmrCreationFee()).to.be.equal(
      expandTo18Decimals(1).div(BigNumber.from(2))
    );
    expect(await launchpadSettings.getBaseFeeReceiver()).to.be.equal(
      walletAddress
    );
    expect(await launchpadSettings.getSaleFeeReceiver()).to.be.equal(
      walletAddress
    );
  });

  describe("should set variables by owner", async () => {
    it("should edit allowed referrers", async () => {
      const referrersBefore = await launchpadSettings.allowedReferrersLength();

      // add referrer
      const newReferrer = await otherWallet.getAddress();
      await launchpadSettings.editAllowedReferrers(newReferrer, true);
      expect(await launchpadSettings.allowedReferrersLength()).to.be.equal(
        referrersBefore.add(constants.One)
      );
      expect(await launchpadSettings.getReferrerAtIndex(0)).to.be.equal(
        newReferrer
      );

      // remove referrer
      await launchpadSettings.editAllowedReferrers(newReferrer, false);
      expect(await launchpadSettings.allowedReferrersLength()).to.be.equal(
        referrersBefore
      );
    });

    it("should edit early access tokens", async () => {
      const tokensBefore = await launchpadSettings.earlyAccessTokensLength();

      // add early access token
      const accessToken = await deployContract(wallet, BurnToken, [18]);
      await launchpadSettings.editEarlyAccessTokens(
        accessToken.address,
        1000,
        true
      );
      expect(await launchpadSettings.earlyAccessTokensLength()).to.be.equal(
        tokensBefore.add(constants.One)
      );
      const earlyAccess = await launchpadSettings.getEarlyAccessTokenAtIndex(0);
      expect(earlyAccess[0]).to.be.equal(accessToken.address);
      expect(earlyAccess[1]).to.be.equal(1000);

      // remove early access token
      await launchpadSettings.editEarlyAccessTokens(
        accessToken.address,
        1000,
        false
      );
      expect(await launchpadSettings.allowedReferrersLength()).to.be.equal(
        tokensBefore
      );
    });

    it("should set fee receiver addresses", async () => {
      const newReceiver = await otherWallet.getAddress();
      await launchpadSettings.setFeeAddresses(newReceiver, newReceiver);
      expect(await launchpadSettings.getBaseFeeReceiver()).to.be.equal(
        newReceiver
      );
      expect(await launchpadSettings.getSaleFeeReceiver()).to.be.equal(
        newReceiver
      );
    });

    it("should set fees", async () => {
      await launchpadSettings.setFees(20, 100, 500);
      expect(await launchpadSettings.getTokenFee()).to.be.equal(20);
      expect(await launchpadSettings.getReferralFee()).to.be.equal(500);
      expect(await launchpadSettings.getGlmrCreationFee()).to.be.equal(100);
    });

    it("should set max launchpad and round 1 length", async () => {
      await launchpadSettings.setMaxLaunchpadLength(100);
      expect(await launchpadSettings.getMaxLaunchpadLength()).to.be.equal(100);

      await launchpadSettings.setRound1Length(10);
      expect(await launchpadSettings.getRound1Length()).to.be.equal(10);
    });
  });
  describe("should revert setting variables by non-owner", async () => {
    it("should revert editing allowed referrers", async () => {
      const referrersBefore = await launchpadSettings.allowedReferrersLength();

      // add referrer
      const newReferrer = await otherWallet.getAddress();
      await expect(
        launchpadSettings
          .connect(otherWallet)
          .editAllowedReferrers(newReferrer, true)
      ).to.be.revertedWith("Ownable: caller is not the owner");

      // remove referrer
      await expect(
        launchpadSettings
          .connect(otherWallet)
          .editAllowedReferrers(newReferrer, false)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("should revert editing early access tokens", async () => {
      // add early access token
      const accessToken = await deployContract(wallet, BurnToken, [18]);
      await expect(
        launchpadSettings
          .connect(otherWallet)
          .editEarlyAccessTokens(accessToken.address, 1000, true)
      ).to.be.revertedWith("Ownable: caller is not the owner");

      // remove early access token
      await expect(
        launchpadSettings
          .connect(otherWallet)
          .editEarlyAccessTokens(accessToken.address, 1000, false)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("should revert setting fee receiver addresses", async () => {
      const newReceiver = await otherWallet.getAddress();
      await expect(
        launchpadSettings
          .connect(otherWallet)
          .setFeeAddresses(newReceiver, newReceiver)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("should revert setting fees", async () => {
      await expect(
        launchpadSettings.connect(otherWallet).setFees(20, 100, 500)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("should revert setting max launchpad and round 1 length", async () => {
      await expect(
        launchpadSettings.connect(otherWallet).setMaxLaunchpadLength(100)
      ).to.be.revertedWith("Ownable: caller is not the owner");

      await expect(
        launchpadSettings.connect(otherWallet).setRound1Length(10)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });
});
