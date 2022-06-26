import chai, { expect } from "chai";
import { Contract, Signer, constants } from "ethers";
import { solidity, createFixtureLoader, MockProvider } from "ethereum-waffle";
import { generalFixture } from "./shared/fixtures";
import { gasLimit } from "./shared/utils";

chai.use(solidity);

describe("Factory", () => {
  let generator: Contract;
  let launchpadFactory: Contract;
  let wallet: Signer;
  let otherWallet: Signer;
  let provider: MockProvider;
  let testAddress: string;

  beforeEach(async function () {
    // create fixtures
    provider = new MockProvider({
      ganacheOptions: gasLimit,
    });
    const loadFixture = createFixtureLoader(provider.getWallets(), provider);
    const fixture = await loadFixture(generalFixture);

    generator = fixture.launchpadGenerator;
    launchpadFactory = fixture.launchpadFactory;
    wallet = fixture.wallet;
    otherWallet = fixture.otherWallet;
    testAddress = await otherWallet.getAddress();
  });

  it("should initilize correctly", async () => {
    const walletAddress = await wallet.getAddress();

    expect(await launchpadFactory.owner()).to.be.equal(walletAddress);
    expect(await launchpadFactory.launchpadsLength()).to.be.equal(0);
    // generator added in fixture
    expect(await launchpadFactory.launchpadGeneratorsLength()).to.be.equal(1);
    expect(await launchpadFactory.launchpadGeneratorAtIndex(0)).to.be.equal(
      generator.address
    );
  });

  it("should add launchpad generator", async () => {
    const lengthBefore = await launchpadFactory.launchpadGeneratorsLength();
    await launchpadFactory.adminAllowLaunchpadGenerator(testAddress, true);

    const lengthAfter = await launchpadFactory.launchpadGeneratorsLength();
    expect(lengthAfter).to.be.equal(lengthBefore.add(constants.One));
    expect(
      await launchpadFactory.launchpadGeneratorAtIndex(lengthBefore)
    ).to.be.equal(testAddress);
  });

  it("should remove launchpad generator", async () => {
    const lengthBefore = await launchpadFactory.launchpadGeneratorsLength();
    await launchpadFactory.adminAllowLaunchpadGenerator(
      generator.address,
      false
    );

    const lengthAfter = await launchpadFactory.launchpadGeneratorsLength();
    expect(lengthAfter).to.be.equal(lengthBefore.sub(constants.One));
  });

  it("should revert editing launchpad generator", async () => {
    // adding zero address
    await expect(
      launchpadFactory.adminAllowLaunchpadGenerator(constants.AddressZero, true)
    ).to.be.revertedWith("ZERO ADDRESS");

    // add launchpad
    await expect(
      launchpadFactory
        .connect(otherWallet)
        .adminAllowLaunchpadGenerator(testAddress, true)
    ).to.be.revertedWith("Ownable: caller is not the owner");

    //remove launchpad
    await expect(
      launchpadFactory
        .connect(otherWallet)
        .adminAllowLaunchpadGenerator(generator.address, false)
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });

  it("should register launchpad", async () => {
    // add wallet as generator
    const owner = await wallet.getAddress();
    await launchpadFactory.adminAllowLaunchpadGenerator(owner, true);

    // register launchpad
    const registration = await launchpadFactory
      .connect(wallet)
      .registerLaunchpad(testAddress);
    expect(registration)
      .to.emit(launchpadFactory, "launchpadRegistered")
      .withArgs(testAddress);

    expect(await launchpadFactory.launchpadAtIndex(0)).to.be.equal(testAddress);
    expect(await launchpadFactory.launchpadsLength()).to.be.equal(1);
  });

  it("should revert registering launchpad", async () => {
    await expect(
      launchpadFactory.registerLaunchpad(testAddress)
    ).to.be.revertedWith("FORBIDDEN");
  });
});
